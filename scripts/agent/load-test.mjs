// scripts/agent/load-test.mjs
import './setup-test-env.js';
import { WebSocket } from 'ws';
import * as NostrTools from 'nostr-tools';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildVideoPostEvent,
  buildViewEvent
} from '../../js/nostrEventSchemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR);
}

// --- Configuration ---
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const CLIENT_COUNT = parseInt(getArg('-n', '1000'), 10);
const DURATION_SEC = parseInt(getArg('-d', '600'), 10);
const RELAY_PORT = parseInt(process.env.PORT || '8009', 10); // Default to 8009 for load test
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;

// --- Metrics ---
const metrics = {
  startTime: Date.now(),
  clientsConnected: 0,
  eventsPublished: 0,
  eventsConfirmed: 0,
  eventsFailed: 0,
  latencies: {
    build: [],
    sign: [],
    rtt: []
  },
  resources: {
    cpu: [],
    memory: []
  },
  errors: []
};

// --- Helpers ---
function now() { return Date.now(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// --- Relay Process ---
let relayProcess;
async function startRelay() {
  console.log(`[LoadTest] Starting relay on port ${RELAY_PORT}...`);
  relayProcess = spawn('node', ['scripts/agent/simple-relay.mjs'], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: RELAY_PORT.toString() },
    stdio: 'ignore' // We don't want relay logs spamming output
  });

  // Give it time to start
  await sleep(2000);
  console.log(`[LoadTest] Relay started.`);
}

// --- Client Simulation ---
class LoadClient {
  constructor(id) {
    this.id = id;
    this.sk = NostrTools.generateSecretKey();
    this.pk = NostrTools.getPublicKey(this.sk);
    this.ws = null;
    this.connected = false;
    this.pending = new Map(); // id -> startTime
  }

  connect() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(RELAY_URL);
      this.ws.on('open', () => {
        this.connected = true;
        metrics.clientsConnected++;
        resolve();
      });
      this.ws.on('message', (data) => this.handleMessage(data));
      this.ws.on('error', (err) => {
        // metrics.errors.push(`Client ${this.id} error: ${err.message}`);
      });
      this.ws.on('close', () => {
        if (this.connected) metrics.clientsConnected--;
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
        const reason = msg[3];

        if (this.pending.has(eventId)) {
          const start = this.pending.get(eventId);
          const rtt = now() - start;
          metrics.latencies.rtt.push(rtt);
          this.pending.delete(eventId);

          if (success) {
            metrics.eventsConfirmed++;
          } else {
            metrics.eventsFailed++;
            metrics.errors.push(`OK false: ${reason}`);
          }
        }
      }
    } catch (e) {
      // ignore malformed
    }
  }

  async publishAction() {
    if (!this.connected) return;

    try {
      const isVideo = Math.random() < 0.1; // 10% Video Post

      // 1. Build
      const t0 = now();
      let eventTemplate;
      if (isVideo) {
        eventTemplate = buildVideoPostEvent({
            pubkey: this.pk,
            created_at: Math.floor(now() / 1000),
            dTagValue: `load-${this.id}-${now()}`,
            content: {
                version: 3,
                title: `Load Test Video ${this.id}`,
                videoRootId: `root-${this.id}-${now()}`
            }
        });
      } else {
         eventTemplate = buildViewEvent({
             pubkey: this.pk,
             created_at: Math.floor(now() / 1000),
             pointerValue: `video-ref-${randomInt(1, 1000)}`,
             pointerTag: ['e', 'hex-id'],
             dedupeTag: `view:${this.id}:${now()}`
         });
      }
      const t1 = now();
      metrics.latencies.build.push(t1 - t0);

      // 2. Sign
      // Manually sign to measure time
      const t2 = now();
      if (NostrTools.finalizeEvent) {
          const signed = NostrTools.finalizeEvent(eventTemplate, this.sk);
          eventTemplate.id = signed.id;
          eventTemplate.sig = signed.sig;
      } else {
          // Fallback for older nostr-tools or different bundle structure
          eventTemplate.id = NostrTools.getEventHash(eventTemplate);
          eventTemplate.sig = NostrTools.getSignature(eventTemplate, this.sk);
      }
      const t3 = now();
      metrics.latencies.sign.push(t3 - t2);

      // 3. Publish
      const t4 = now();
      this.pending.set(eventTemplate.id, t4);
      this.ws.send(JSON.stringify(['EVENT', eventTemplate]));
      metrics.eventsPublished++;

    } catch (e) {
      metrics.errors.push(`Client ${this.id} action failed: ${e.message}`);
    }
  }

  close() {
      if (this.ws) this.ws.close();
  }
}

// --- Main Loop ---
async function run() {
  console.log(`[LoadTest] Clients: ${CLIENT_COUNT}, Duration: ${DURATION_SEC}s`);

  await startRelay();

  // Create Clients
  const clients = [];
  console.log(`[LoadTest] Connecting ${CLIENT_COUNT} clients...`);
  // Batch connect to avoid overwhelming
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const client = new LoadClient(i);
    clients.push(client);
    client.connect(); // don't await individually to speed up, but maybe batch await
    if (i % 50 === 0) await sleep(100);
  }

  // Wait for all to settle
  await sleep(2000);
  console.log(`[LoadTest] Connected: ${metrics.clientsConnected}`);

  // Loop
  const endTime = now() + (DURATION_SEC * 1000);
  const monitorInterval = setInterval(() => {
    const elapsed = (now() - metrics.startTime) / 1000;
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();

    // Store metrics (CPU is since start, so we might want diff, but raw is fine for trend)
    // Actually cpuUsage returns {user, system} in microseconds.
    // memoryUsage returns {rss, heapTotal, heapUsed, external}.
    metrics.resources.cpu.push({ timestamp: elapsed, ...cpuUsage });
    metrics.resources.memory.push({ timestamp: elapsed, rss: memUsage.rss, heapUsed: memUsage.heapUsed });

    const memMB = (memUsage.rss / 1024 / 1024).toFixed(1);
    console.log(`[Stats] T+${elapsed.toFixed(0)}s | Pub: ${metrics.eventsPublished} | Conf: ${metrics.eventsConfirmed} | Fail: ${metrics.eventsFailed} | RTT avg: ${avg(metrics.latencies.rtt).toFixed(1)}ms | Sign avg: ${avg(metrics.latencies.sign).toFixed(2)}ms | Mem: ${memMB}MB`);
  }, 5000);

  while (now() < endTime) {
    // Pick random clients to act
    const batchSize = Math.max(1, Math.floor(CLIENT_COUNT / 10)); // 10% of clients act per tick
    for (let k = 0; k < batchSize; k++) {
        const client = clients[randomInt(0, clients.length - 1)];
        client.publishAction();
    }
    // Throttle loop
    await sleep(100);
  }

  clearInterval(monitorInterval);

  // Cleanup
  console.log('[LoadTest] Stopping...');
  clients.forEach(c => c.close());
  if (relayProcess) relayProcess.kill();

  // Report
  const reportPath = path.join(ARTIFACTS_DIR, `load-report-${new Date().toISOString().slice(0,10).replace(/-/g,'')}.json`);
  const report = generateReport();
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[LoadTest] Report written to ${reportPath}`);
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function p95(arr) {
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  return arr[Math.floor(arr.length * 0.95)];
}

function generateReport() {
  const duration = (now() - metrics.startTime) / 1000;
  return {
    summary: {
      date: new Date().toISOString(),
      duration_sec: duration,
      clients: CLIENT_COUNT,
      events_published: metrics.eventsPublished,
      events_confirmed: metrics.eventsConfirmed,
      events_failed: metrics.eventsFailed
    },
    metrics: {
      throughput: {
        avg_events_per_sec: metrics.eventsPublished / duration
      },
      latency_ms: {
        build: {
          avg: avg(metrics.latencies.build),
          p95: p95(metrics.latencies.build)
        },
        sign: {
          avg: avg(metrics.latencies.sign),
          p95: p95(metrics.latencies.sign)
        },
        rtt: {
            avg: avg(metrics.latencies.rtt),
            p95: p95(metrics.latencies.rtt)
        }
      },
      resources: {
          cpu_samples: metrics.resources.cpu,
          memory_samples: metrics.resources.memory
      },
      errors: metrics.errors.slice(0, 100) // Top 100
    },
    hot_functions: [
      { name: "buildEvent", avg_ms: avg(metrics.latencies.build) },
      { name: "signEvent", avg_ms: avg(metrics.latencies.sign) }
    ],
    recommendations: [
       "If signEvent latency > 5ms, consider offloading signing to Web Workers or using Wasm optimization.",
       "If RTT is high but build/sign is low, network or relay processing is the bottleneck."
    ]
  };
}

run().catch(console.error);
