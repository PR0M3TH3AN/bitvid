import { WebSocket } from 'ws';
import { finalizeEvent as pureFinalize, generateSecretKey, getPublicKey as pureGetPublicKey } from 'nostr-tools';
import { finalizeEvent as wasmFinalize, getPublicKey as wasmGetPublicKey, setNostrWasm } from 'nostr-tools/wasm';
import { initNostrWasm } from 'nostr-wasm';
import { startRelay } from './load-test-relay.mjs';
import { buildViewEvent, buildVideoPostEvent } from '../../js/nostrEventSchemas.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let finalizeEvent = pureFinalize;
let getPublicKey = pureGetPublicKey;

// --- Polyfills and Environment Setup ---
if (typeof global.window === 'undefined') {
  global.window = {};
}
// Ensure TextEncoder is available (should be in Node 18+)
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder } = await import('util');
  global.TextEncoder = TextEncoder;
}

// Ensure crypto is available for nostr-tools
if (typeof crypto === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  global.crypto = webcrypto;
}

// --- Configuration ---
const args = process.argv.slice(2);
const getConfig = (key, defaultVal) => {
  const index = args.indexOf(key);
  return index !== -1 ? args[index + 1] : defaultVal;
};

const config = {
  clients: parseInt(getConfig('--clients', '1000'), 10),
  duration: parseInt(getConfig('--duration', '600'), 10), // seconds
  rate: parseFloat(getConfig('--rate', '0.1')), // events per second per client
  relay: getConfig('--relay', null),
  outputDir: 'artifacts',
};

// --- Safety Guardrails ---
function isSafeRelay(url) {
  try {
    const u = new URL(url);
    const host = u.hostname;

    // Allow local
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
      return true;
    }

    // Allow private IP ranges (IPv4)
    // 10.0.0.0 - 10.255.255.255
    if (host.startsWith('10.')) {
      return true;
    }
    // 192.168.0.0 - 192.168.255.255
    if (host.startsWith('192.168.')) {
      return true;
    }
    // 172.16.0.0 - 172.31.255.255
    if (host.startsWith('172.')) {
      const parts = host.split('.');
      if (parts.length === 4) {
        const second = parseInt(parts[1], 10);
        if (second >= 16 && second <= 31) {
          return true;
        }
      }
    }

    return false;
  } catch (e) {
    return false;
  }
}

// --- Statistics ---
const stats = {
  sent: 0,
  accepted: 0,
  rejected: 0,
  errors: 0,
  latencies: [], // Array of ms
  signingTimes: [], // Array of ms
  startTime: Date.now(),
  resourceUsage: [],
};

// --- Load Client Class ---
class LoadClient {
  constructor(relayUrl, index) {
    this.relayUrl = relayUrl;
    this.index = index;
    this.sk = generateSecretKey();
    this.pk = getPublicKey(this.sk);
    this.ws = null;
    this.connected = false;
    this.msgQueue = new Map(); // id -> {resolve, reject, start}
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl);

      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (Array.isArray(msg) && msg[0] === 'OK') {
            const [_, eventId, success, message] = msg;
            if (this.msgQueue.has(eventId)) {
              const { resolve, reject, start } = this.msgQueue.get(eventId);
              const latency = Date.now() - start;
              this.msgQueue.delete(eventId);
              if (success) {
                stats.accepted++;
                stats.latencies.push(latency);
                resolve({ success, message, latency });
              } else {
                stats.rejected++;
                reject(new Error(message));
              }
            }
          }
        } catch (err) {
          // ignore parsing errors
        }
      });

      this.ws.on('error', (err) => {
        stats.errors++;
        if (!this.connected) reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        // reject all pending
        for (const [id, { reject }] of this.msgQueue.entries()) {
          reject(new Error('Connection closed'));
        }
        this.msgQueue.clear();
      });
    });
  }

  async publish() {
    if (!this.connected) return;

    try {
      // 80% View, 20% Video
      const isView = Math.random() < 0.8;
      let event;

      if (isView) {
        event = buildViewEvent({
          pubkey: this.pk,
          created_at: Math.floor(Date.now() / 1000),
          content: "Load test view event",
          pointerTags: [['a', `30078:${this.pk}:test-video`]]
        });
      } else {
        event = buildVideoPostEvent({
          pubkey: this.pk,
          created_at: Math.floor(Date.now() / 1000),
          content: {
            title: "Load Test Video",
            description: "A multipart video metadata event for load testing.",
            videoRootId: "test-root-" + Math.random(),
            mode: "native",
            duration: 120,
            mime: "video/mp4"
          }
        });
      }

      const signStart = performance.now();
      const signedEvent = finalizeEvent(event, this.sk);
      const signEnd = performance.now();
      stats.signingTimes.push(signEnd - signStart);

      const promise = new Promise((resolve, reject) => {
        // Timeout for OK
        const timeout = setTimeout(() => {
          if (this.msgQueue.has(signedEvent.id)) {
            this.msgQueue.delete(signedEvent.id);
            stats.errors++; // Count timeout as error
            reject(new Error('Timeout waiting for OK'));
          }
        }, 10000);

        this.msgQueue.set(signedEvent.id, {
          resolve: (res) => { clearTimeout(timeout); resolve(res); },
          reject: (err) => { clearTimeout(timeout); reject(err); },
          start: Date.now()
        });
      });

      this.ws.send(JSON.stringify(["EVENT", signedEvent]));
      stats.sent++;

      await promise;
    } catch (err) {
      // console.error(`Client ${this.index} error:`, err.message);
      // Already counted in stats if it was a reject from queue
      if (!err.message.includes('Timeout') && !err.message.includes('Connection closed')) {
         // other errors
      }
    }
  }

  close() {
    if (this.ws) {
      this.ws.terminate();
    }
  }
}

// --- Main Execution ---
async function main() {
  console.log(`Starting load test with config:`, config);

  try {
      console.log('Initializing WASM crypto...');
      const wasm = await initNostrWasm();
      setNostrWasm(wasm);
      finalizeEvent = wasmFinalize;
      getPublicKey = wasmGetPublicKey;
      console.log('WASM crypto initialized successfully.');
  } catch (error) {
      console.warn('Failed to initialize WASM crypto, falling back to pure JS:', error);
  }

  let relayServer;
  let relayUrl = config.relay;

  if (relayUrl) {
    if (!isSafeRelay(relayUrl)) {
      console.error(`\n[FATAL] Guardrail violation: Load tests against public relays are prohibited.\nTarget URL: ${relayUrl}\nAllowed targets: localhost, private IP ranges.\n`);
      process.exit(1);
    }
    console.log(`Using provided relay: ${relayUrl}`);
  } else {
    const port = 8899;
    relayServer = startRelay(port);
    relayUrl = `ws://localhost:${port}`;
    console.log(`Started local relay at ${relayUrl}`);
  }

  const clients = [];
  console.log(`Initializing ${config.clients} clients...`);

  // Create clients
  for (let i = 0; i < config.clients; i++) {
    clients.push(new LoadClient(relayUrl, i));
  }

  // Connect clients (staggered slightly to avoid connection storm issues in node)
  const chunkSize = 50;
  for (let i = 0; i < clients.length; i += chunkSize) {
    await Promise.all(clients.slice(i, i + chunkSize).map(c => c.connect()));
    if (i + chunkSize < clients.length) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`All clients connected.`);

  // Scheduler
  // Total events per second target = clients * rate
  // We can use a central scheduler to pick a random client and ask it to publish.
  // This is more efficient than N intervals.

  const eventsPerSecond = config.clients * config.rate;
  const intervalMs = 1000 / eventsPerSecond;

  console.log(`Targeting ${eventsPerSecond.toFixed(2)} events/sec (interval: ${intervalMs.toFixed(2)}ms)`);

  let active = true;
  let timer;

  const scheduleNext = () => {
    if (!active) return;
    const client = clients[Math.floor(Math.random() * clients.length)];
    client.publish().catch(() => {}); // fire and forget-ish, errors tracked in client

    // Adjust for drift? Simple setTimeout for now.
    // For high rates, setTimeout might be too slow/imprecise.
    // But for 1000 * 0.1 = 100Hz, it's 10ms, which is fine.
    timer = setTimeout(scheduleNext, intervalMs);
  };

  scheduleNext();

  // Resource monitoring
  const resourceInterval = setInterval(() => {
    const cpu = process.cpuUsage();
    const mem = process.memoryUsage();
    stats.resourceUsage.push({
      time: Date.now() - stats.startTime,
      cpuUser: cpu.user,
      cpuSystem: cpu.system,
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed
    });
  }, 5000);

  // Duration
  await new Promise(resolve => setTimeout(resolve, config.duration * 1000));

  active = false;
  clearTimeout(timer);
  clearInterval(resourceInterval);

  console.log('Stopping test...');
  clients.forEach(c => c.close());
  if (relayServer) {
    await relayServer.close();
  }

  // --- Report Generation ---
  generateReport();
}

function generateReport() {
  const durationSec = (Date.now() - stats.startTime) / 1000;
  const throughput = stats.accepted / durationSec;

  stats.latencies.sort((a, b) => a - b);
  const p50 = stats.latencies[Math.floor(stats.latencies.length * 0.5)] || 0;
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)] || 0;
  const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)] || 0;

  const avgSignTime = stats.signingTimes.reduce((a, b) => a + b, 0) / (stats.signingTimes.length || 1);

  const report = {
    config,
    timestamp: new Date().toISOString(),
    durationSec,
    throughput,
    totalSent: stats.sent,
    totalAccepted: stats.accepted,
    totalRejected: stats.rejected,
    totalErrors: stats.errors,
    latency: {
      p50,
      p95,
      p99,
      min: stats.latencies[0] || 0,
      max: stats.latencies[stats.latencies.length - 1] || 0,
      avg: stats.latencies.reduce((a, b) => a + b, 0) / (stats.latencies.length || 1)
    },
    signingTime: {
        avg: avgSignTime,
        max: Math.max(...stats.signingTimes, 0)
    },
    resources: stats.resourceUsage,
    topHotFunctions: [],
    errors: stats.errors,
    proposedRemediation: []
  };

  // Analysis & Heuristics for "Hot Functions"
  // Since we don't have a sampling profiler attached, we infer hotspots from timing data.

  // Always report signing time as it's the primary CPU consumer
  report.topHotFunctions.push({
      function: "finalizeEvent (client signing)",
      avgTime: `${avgSignTime.toFixed(2)}ms`,
      impact: avgSignTime > 10 ? "High CPU usage" : "Low/Moderate CPU usage"
  });

  if (avgSignTime > 10) {
      report.proposedRemediation.push("Use optimized crypto library (e.g. secp256k1-wasm) or offload signing to a worker/signer.");
  } else {
      report.proposedRemediation.push("Signing speed is good (<10ms). Focus on network I/O.");
  }

  if (p99 > 1000) {
    report.topHotFunctions.push({
        function: "Relay Processing / Network RTT",
        avgTime: `${p99}ms (p99)`,
        impact: "High latency for end users"
    });
    report.proposedRemediation.push("Investigate relay event processing loop or network bandwidth.");
  }

  if (stats.errors > 0) {
     report.proposedRemediation.push("Investigate error logs for connection drops or timeouts.");
  }

  // Output
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = path.join(config.outputDir, `load-report-${dateStr}.json`);

  fs.writeFileSync(filename, JSON.stringify(report, null, 2));
  console.log(`Report written to ${filename}`);
  console.log(`Summary:`);
  console.log(`  Throughput: ${throughput.toFixed(2)} events/sec`);
  console.log(`  Latency p50: ${p50}ms`);
  console.log(`  Latency p95: ${p95}ms`);
  console.log(`  Errors: ${stats.errors}`);
  console.log(`  Avg Signing Time: ${avgSignTime.toFixed(2)}ms`);
}

main().catch(console.error);
