import './setup-test-env.js';
import { WebSocket } from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { buildVideoPostEvent, buildViewEvent } from '../../js/nostrEventSchemas.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

// --- Configuration ---
const RELAY_PORT = 8890;
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
const ARTIFACTS_DIR = 'artifacts';
const REPORT_FILE = path.join(ARTIFACTS_DIR, `load-report-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`);

// Guardrail: Ensure local relay
if (!RELAY_URL.includes('localhost') && !RELAY_URL.includes('127.0.0.1')) {
    console.error(`[Guardrail] Aborting: Public relay detected: ${RELAY_URL}`);
    process.exit(1);
}

// --- Helpers ---
const bytesToHex = (bytes) => Buffer.from(bytes).toString('hex');

// --- Load Bot ---
class LoadBot {
    constructor(id, relayUrl, rate = 1) {
        this.id = id;
        this.relayUrl = relayUrl;
        this.rate = rate; // events per second
        this.ws = null;
        this.sk = generateSecretKey();
        this.pk = getPublicKey(this.sk);
        this.intervalId = null;
        this.connected = false;
        this.errors = 0;
        this.sentCount = 0;
        this.signTimes = [];
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.relayUrl);

            this.ws.on('open', () => {
                this.connected = true;
                resolve();
            });

            this.ws.on('error', (err) => {
                this.errors++;
                // console.error(`Bot ${this.id} error:`, err.message);
                if (!this.connected) reject(err);
            });

            this.ws.on('close', () => {
                this.connected = false;
            });
        });
    }

    start() {
        if (!this.connected) return;
        const intervalMs = 1000 / this.rate;
        this.intervalId = setInterval(() => this.publish(), intervalMs);
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.ws) this.ws.terminate();
    }

    publish() {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) return;

        // Mix: 80% View Events (Small), 20% Video Post (Large)
        const isLarge = Math.random() < 0.2;
        let eventTemplate;

        if (isLarge) {
            eventTemplate = buildVideoPostEvent({
                pubkey: this.pk,
                created_at: Math.floor(Date.now() / 1000),
                dTagValue: `load-${this.id}-${Date.now()}`,
                content: {
                    version: 3,
                    title: `Load Test Video ${Date.now()}`,
                    description: 'A' .repeat(500), // Filler content
                    videoRootId: `root-${this.id}-${Date.now()}`,
                    magnet: `magnet:?xt=urn:btih:${'a'.repeat(40)}&dn=test`
                }
            });
        } else {
            eventTemplate = buildViewEvent({
                pubkey: this.pk,
                created_at: Math.floor(Date.now() / 1000),
                content: 'view-ping',
                dedupeTag: `view-${this.id}-${Date.now()}`
            });
        }

        try {
            const t0 = performance.now();
            const signedEvent = finalizeEvent(eventTemplate, this.sk);
            const t1 = performance.now();
            this.signTimes.push(t1 - t0);

            const msg = JSON.stringify(['EVENT', signedEvent]);
            this.ws.send(msg);
            this.sentCount++;
        } catch (e) {
            this.errors++;
        }
    }
}

// --- Observer ---
class Observer {
    constructor(relayUrl) {
        this.relayUrl = relayUrl;
        this.ws = null;
        this.receivedCount = 0;
        this.latencies = [];
        this.connected = false;
        this.subId = 'observer-sub';
        this.probeMap = new Map(); // id -> timestamp
    }

    connect() {
        return new Promise((resolve) => {
            this.ws = new WebSocket(this.relayUrl);
            this.ws.on('open', () => {
                this.connected = true;
                // Subscribe to all events
                const msg = JSON.stringify(['REQ', this.subId, { limit: 0 }]); // Streaming only
                this.ws.send(msg);
                resolve();
            });
            this.ws.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg[0] === 'EVENT') {
                    const event = msg[2];
                    this.receivedCount++;
                }
            });
        });
    }

    async measureLatency(probeBot) {
        if (!this.connected) return;

        const now = Date.now();
        const probeId = `probe-${now}`;

        // Create a distinct probe event
        const eventTemplate = {
            kind: 1,
            created_at: Math.floor(now / 1000),
            tags: [['t', 'probe']],
            content: probeId,
            pubkey: probeBot.pk
        };
        const signedEvent = finalizeEvent(eventTemplate, probeBot.sk);

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 5000);

            const listener = (data) => {
                const msg = JSON.parse(data);
                if (msg[0] === 'EVENT' && msg[2].id === signedEvent.id) {
                    const rtt = Date.now() - now;
                    clearTimeout(timeout);
                    this.ws.off('message', listener);
                    this.latencies.push(rtt);
                    resolve(rtt);
                }
            };

            this.ws.on('message', listener);

            // Send
            const msg = JSON.stringify(['EVENT', signedEvent]);
            probeBot.ws.send(msg);
        });
    }

    stop() {
        if(this.ws) this.ws.terminate();
    }
}

// --- Main ---
async function runLoadTest() {
    // Parse args
    const args = process.argv.slice(2);
    const clientsArg = args.find(a => a.startsWith('--clients='));
    const durationArg = args.find(a => a.startsWith('--duration='));

    const NUM_CLIENTS = clientsArg ? parseInt(clientsArg.split('=')[1]) : 1000;
    const DURATION_SEC = durationArg ? parseInt(durationArg.split('=')[1]) : 60; // Default 1 min
    const TARGET_RATE = 0.5; // Events per second per bot (0.5 * 1000 = 500 events/sec total)

    console.log(`[Load Test] Starting with ${NUM_CLIENTS} clients for ${DURATION_SEC}s...`);

    // Ensure artifacts dir
    if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR);

    // 1. Start Relay (Separate Process)
    console.log('[Load Test] Spawning relay process...');
    const relayProcess = spawn('node', ['scripts/agent/load-test-relay.mjs'], {
        env: { ...process.env, PORT: String(RELAY_PORT) },
        stdio: 'inherit' // Pipe output to see relay logs
    });

    await new Promise(r => setTimeout(r, 2000)); // Warmup

    // 2. Start Observer
    const observer = new Observer(RELAY_URL);
    await observer.connect();

    // 3. Start Clients
    const bots = [];
    console.log('[Load Test] Spawning bots...');
    for (let i = 0; i < NUM_CLIENTS; i++) {
        const bot = new LoadBot(i, RELAY_URL, TARGET_RATE);
        bots.push(bot);
    }

    // Connect in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < bots.length; i += BATCH_SIZE) {
        await Promise.all(bots.slice(i, i + BATCH_SIZE).map(b => b.connect()));
        process.stdout.write(`\r[Load Test] Connected ${Math.min(i + BATCH_SIZE, bots.length)}/${NUM_CLIENTS}`);
    }
    console.log('\n[Load Test] All bots connected.');

    // Start Load
    bots.forEach(b => b.start());

    // 4. Monitoring Loop
    const startTs = Date.now();
    const endTs = startTs + (DURATION_SEC * 1000);
    const metrics = {
        timestamps: [],
        cpu: [],
        memory: [],
        latency: [],
        throughput: [],
        avgSignTime: []
    };

    let prevRx = 0;

    const monitorInterval = setInterval(async () => {
        const now = Date.now();
        if (now >= endTs) {
            clearInterval(monitorInterval);
            return;
        }

        // Latency Probe (use Bot 0)
        const latency = await observer.measureLatency(bots[0]);

        // Throughput
        const rxDelta = observer.receivedCount - prevRx;
        prevRx = observer.receivedCount;

        // Resources
        const mem = process.memoryUsage().heapUsed / 1024 / 1024; // MB

        // Crypto Stats
        const signTimes = bots.flatMap(b => b.signTimes);
        // Clear sign times to avoid memory leak and get instantaneous avg
        bots.forEach(b => b.signTimes = []);
        const avgSign = signTimes.length ? signTimes.reduce((a, b) => a + b, 0) / signTimes.length : 0;

        // Log
        console.log(`[Monitor] Latency: ${latency ?? 'timeout'}ms | RX: ${rxDelta}/s | Mem: ${mem.toFixed(1)}MB | Sign: ${avgSign.toFixed(2)}ms`);

        metrics.timestamps.push(new Date().toISOString());
        metrics.latency.push(latency);
        metrics.throughput.push(rxDelta);
        metrics.memory.push(mem);
        metrics.avgSignTime.push(avgSign);

    }, 1000);

    // Wait for duration
    await new Promise(r => setTimeout(r, DURATION_SEC * 1000));

    // 5. Teardown
    console.log('[Load Test] Stopping bots...');
    bots.forEach(b => b.stop());
    observer.stop();
    relayProcess.kill();

    // 6. Report
    const totalSent = bots.reduce((acc, b) => acc + b.sentCount, 0);
    const totalErrors = bots.reduce((acc, b) => acc + b.errors, 0);
    const validLatencies = metrics.latency.filter(l => l !== null);
    const avgLatency = validLatencies.length ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length : 0;

    // Global sign stats
    const avgGlobalSignTime = metrics.avgSignTime.length ? metrics.avgSignTime.reduce((a,b)=>a+b, 0) / metrics.avgSignTime.length : 0;

    const report = {
        meta: {
            clients: NUM_CLIENTS,
            duration: DURATION_SEC,
            targetRatePerClient: TARGET_RATE
        },
        results: {
            totalSent,
            totalReceivedByObserver: observer.receivedCount,
            totalErrors,
            errorRate: totalSent ? (totalErrors / totalSent) : 0,
            avgLatencyMs: avgLatency || 0,
            maxLatencyMs: Math.max(...validLatencies, 0),
            avgSignTimeMs: avgGlobalSignTime
        },
        bottlenecks: [], // To be filled by analysis
        metrics // Raw timeseries
    };

    // Analysis
    if (report.results.errorRate > 0.05) report.bottlenecks.push("High Error Rate (>5%)");
    if (report.results.avgLatencyMs > 500) report.bottlenecks.push("High Average Latency (>500ms)");
    if (report.results.totalReceivedByObserver < (totalSent * 0.9)) report.bottlenecks.push("Possible Message Loss (Observer RX < 90% TX)");

    // Crypto Bottleneck Check
    if (avgGlobalSignTime > 5) {
        report.bottlenecks.push(`Cryptographic Bottleneck (Avg Sign Time ${avgGlobalSignTime.toFixed(2)}ms > 5ms)`);
        report.requiresSecurityReview = true;
    }

    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`[Load Test] Report saved to ${REPORT_FILE}`);

    if (report.bottlenecks.length > 0) {
        console.warn('[Load Test] Bottlenecks identified:', report.bottlenecks);
    } else {
        console.log('[Load Test] No major bottlenecks detected.');
    }
}

runLoadTest().catch(console.error);
