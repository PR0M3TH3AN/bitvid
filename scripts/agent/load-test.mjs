import WebSocket from 'ws';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getConfig = (key, defaultVal) => {
  const idx = ARGS.indexOf(`--${key}`);
  return idx !== -1 ? ARGS[idx + 1] : defaultVal;
};

const hasFlag = (flag) => ARGS.includes(`--${flag}`);

const CONFIG = {
  clients: parseInt(getConfig('clients', '100'), 10),
  duration: parseInt(getConfig('duration', '60'), 10), // seconds
  relay: getConfig('relay', 'ws://localhost:8008'),
  rate: parseInt(getConfig('rate', '50'), 10), // target events per second (global)
  unsafe: hasFlag('unsafe'),
  outputDir: 'artifacts',
};

// --- Safety Check ---
function isSafeRelay(url) {
    if (CONFIG.unsafe) return true;
    try {
        const u = new URL(url);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]') return true;
        // Check for private IPs (10.x, 192.168.x, 172.16-31.x) could be added here,
        // but for now localhost is the strict guardrail.
        return false;
    } catch (e) {
        return false;
    }
}

if (!isSafeRelay(CONFIG.relay)) {
    console.error(`\n[FATAL] Guardrail triggered: Attempting to load test a non-local relay (${CONFIG.relay}) without --unsafe flag.`);
    console.error("Please target a local relay or use --unsafe if you are sure you own the infrastructure.\n");
    process.exit(1);
}

// --- Helpers ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const NOTE_TYPES = {
    VIDEO_POST: 30078,
    VIEW_EVENT: 30079
};

// Simplified Event Builders based on js/nostrEventSchemas.js
function buildVideoPostEvent(signer, contentData) {
    const created_at = Math.floor(Date.now() / 1000);
    const event = {
        kind: NOTE_TYPES.VIDEO_POST,
        created_at,
        tags: [
            ['t', 'video'],
            ['d', `video-${created_at}-${Math.random().toString(36).slice(2)}`]
        ],
        content: JSON.stringify(contentData),
        pubkey: getPublicKey(signer.privateKey),
    };
    return finalizeEvent(event, signer.privateKey);
}

function buildViewEvent(signer, videoId) {
    const created_at = Math.floor(Date.now() / 1000);
    const event = {
        kind: NOTE_TYPES.VIEW_EVENT,
        created_at,
        tags: [
            ['t', 'view'],
            ['e', videoId],
            ['d', `view-${created_at}-${Math.random().toString(36).slice(2)}`] // Dedupe tag
        ],
        content: '',
        pubkey: getPublicKey(signer.privateKey),
    };
    return finalizeEvent(event, signer.privateKey);
}

// --- Client Class ---
class LoadClient {
    constructor(relayUrl, id) {
        this.id = id;
        this.relayUrl = relayUrl;
        this.privateKey = generateSecretKey();
        this.pubkey = getPublicKey(this.privateKey);
        this.ws = null;
        this.connected = false;
        this.pending = new Map(); // eventId -> startTime
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.relayUrl);
            this.ws.on('open', () => {
                this.connected = true;
                resolve();
            });
            this.ws.on('error', (err) => {
                // console.error(`Client ${this.id} error:`, err.message);
                reject(err);
            });
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('close', () => {
                this.connected = false;
            });
        });
    }

    handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            if (msg[0] === 'OK') {
                const eventId = msg[1];
                const success = msg[2];
                const message = msg[3];

                if (this.pending.has(eventId)) {
                    const startTime = this.pending.get(eventId);
                    const latency = Date.now() - startTime;
                    this.pending.delete(eventId);
                    stats.recordAck(latency, success, message);
                }
            }
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    }

    publish(event) {
        if (!this.connected) return;
        this.pending.set(event.id, Date.now());
        this.ws.send(JSON.stringify(['EVENT', event]));
        stats.recordSent();
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

// --- Metrics ---
const stats = {
    startTime: Date.now(),
    sent: 0,
    acked: 0,
    failed: 0,
    latencies: [],
    signingTimes: [],
    errors: [],
    startCpu: process.cpuUsage(),

    recordSent() {
        this.sent++;
    },

    recordAck(latency, success, message) {
        if (success) {
            this.acked++;
            this.latencies.push(latency);
        } else {
            this.failed++;
            this.errors.push(message);
        }
    },

    recordSigningTime(ms) {
        this.signingTimes.push(ms);
    },

    getSummary() {
        this.latencies.sort((a, b) => a - b);
        this.signingTimes.sort((a, b) => a - b);

        const calcStats = (arr) => {
             const p50 = arr[Math.floor(arr.length * 0.5)] || 0;
             const p95 = arr[Math.floor(arr.length * 0.95)] || 0;
             const p99 = arr[Math.floor(arr.length * 0.99)] || 0;
             const avg = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
             return { avg: avg.toFixed(2), p50: p50.toFixed(2), p95: p95.toFixed(2), p99: p99.toFixed(2) };
        };

        const durationSec = (Date.now() - this.startTime) / 1000;
        const latencyStats = calcStats(this.latencies);
        const signingStats = calcStats(this.signingTimes);

        const cpuUsage = process.cpuUsage(this.startCpu);
        const memUsage = process.memoryUsage();

        return {
            config: CONFIG,
            durationSec: durationSec.toFixed(2),
            events: {
                sent: this.sent,
                acked: this.acked,
                failed: this.failed,
            },
            throughput: {
                sentPerSec: (this.sent / durationSec).toFixed(2),
                ackedPerSec: (this.acked / durationSec).toFixed(2),
            },
            latencyMs: latencyStats,
            signingTimeMs: signingStats,
            resources: {
                cpuUserSec: (cpuUsage.user / 1e6).toFixed(2),
                cpuSystemSec: (cpuUsage.system / 1e6).toFixed(2),
                memoryRssMb: (memUsage.rss / 1024 / 1024).toFixed(2),
                memoryHeapMb: (memUsage.heapUsed / 1024 / 1024).toFixed(2)
            },
            errors: this.errors.slice(0, 10), // Sample top 10
            hotFunctions: [
                { name: "finalizeEvent (signing)", avgMs: signingStats.avg }
            ],
            bottlenecks: signingStats.avg > 100 ? ["Cryptographic operations (signing)"] : []
        };
    }
};

// --- Main ---
async function run() {
    console.log(`Starting load test with ${CONFIG.clients} clients against ${CONFIG.relay}`);
    console.log(`Target rate: ${CONFIG.rate} events/sec`);
    console.log(`Duration: ${CONFIG.duration} seconds`);

    const clients = [];
    for (let i = 0; i < CONFIG.clients; i++) {
        clients.push(new LoadClient(CONFIG.relay, i));
    }

    console.log('Connecting clients...');
    await Promise.all(clients.map(c => c.connect().catch(e => null)));
    const connectedCount = clients.filter(c => c.connected).length;
    console.log(`Connected ${connectedCount}/${CONFIG.clients} clients.`);

    if (connectedCount === 0) {
        console.error("No clients connected. Aborting.");
        process.exit(1);
    }

    const endTime = Date.now() + (CONFIG.duration * 1000);
    const intervalMs = 1000 / CONFIG.rate; // Delay between events to match rate

    console.log('Starting load generation...');

    // Simple loop to maintain rate
    let running = true;
    const loop = async () => {
        while (running && Date.now() < endTime) {
            const startLoop = Date.now();

            // Pick random client
            const client = clients[Math.floor(Math.random() * clients.length)];

            // 10% Video Post, 90% View Event
            const isVideo = Math.random() < 0.1;
            let event;

            const signStart = performance.now();
            if (isVideo) {
                const content = {
                    title: `Load Test Video ${Date.now()}`,
                    description: "Load test content",
                    videoRootId: `root-${Date.now()}`,
                    version: 3
                };
                event = buildVideoPostEvent(client, content);
            } else {
                event = buildViewEvent(client, "some-video-id");
            }
            const signEnd = performance.now();
            stats.recordSigningTime(signEnd - signStart);

            client.publish(event);

            const elapsed = Date.now() - startLoop;
            const wait = Math.max(0, intervalMs - elapsed);
            await delay(wait);
        }
    };

    await loop();
    running = false;

    console.log('Load generation finished. Waiting for pending ACKs (5s)...');
    await delay(5000);

    clients.forEach(c => c.close());

    const summary = stats.getSummary();
    console.log('--- Load Test Report ---');
    console.log(JSON.stringify(summary, null, 2));

    await mkdir(CONFIG.outputDir, { recursive: true });
    // Use fixed date format YYYYMMDD for PR requirements
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = path.join(CONFIG.outputDir, `load-report-${dateStr}.json`);
    await writeFile(filename, JSON.stringify(summary, null, 2));
    console.log(`Report saved to ${filename}`);
}

run().catch(console.error);
