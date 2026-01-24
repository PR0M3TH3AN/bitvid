import './setup-test-env.js';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';
import NodeWebSocket from 'ws';
import * as NostrTools from 'nostr-tools';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// Polyfill global NostrTools for app modules
global.NostrTools = NostrTools;

// Import Schema Builders
import { buildVideoPostEvent, buildViewEvent } from '../../js/nostrEventSchemas.js';

// --- Configuration ---
const ARTIFACTS_DIR = 'artifacts';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Default Config
const DEFAULT_CONFIG = {
  duration: 600, // seconds
  clients: 1000,
  rate: 0.1, // events per second per client? No, that would be 100 events/sec.
            // Let's interpret 'rate' as TOTAL events per second to target,
            // OR rate per client.
            // If I have 1000 clients and rate 0.1, that's 100 events/sec. That's reasonable.
  relay: 'ws://localhost:8889',
};

// Parse Args
const { values: args } = parseArgs({
  options: {
    duration: { type: 'string', short: 'd' },
    clients: { type: 'string', short: 'c' },
    rate: { type: 'string', short: 'r' },
    relay: { type: 'string', short: 'u' }, // u for url
  },
});

const config = {
  duration: args.duration ? parseInt(args.duration) : DEFAULT_CONFIG.duration,
  clients: args.clients ? parseInt(args.clients) : DEFAULT_CONFIG.clients,
  rate: args.rate ? parseFloat(args.rate) : DEFAULT_CONFIG.rate,
  relay: args.relay || DEFAULT_CONFIG.relay,
};

console.log('--- Load Test Configuration ---');
console.log(JSON.stringify(config, null, 2));

// --- State ---
const activeClients = []; // { ws, sk, pk, pendingEvents: Map<id, startTime> }
let relayProcess = null;
const metrics = {
  latencies: [],
  errors: 0,
  sent: 0,
  received: 0,
  errorCounts: {},
  operationTimes: {
    build: [],
    sign: [],
  },
  resourceUsage: [],
};

// --- Helpers ---

async function startRelay() {
  console.log('[Setup] Starting local relay...');
  const relayLog = fs.openSync(path.join(ARTIFACTS_DIR, 'load-relay.log'), 'w');

  // Assuming the relay script is in the same directory
  const relayScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'load-test-relay.mjs');

  const port = new URL(config.relay).port || '8889';

  relayProcess = spawn('node', [relayScript], {
    stdio: ['ignore', relayLog, relayLog],
    env: { ...process.env, PORT: port }
  });

  // Wait for port
  await waitForPort(parseInt(port));
  console.log('[Setup] Relay started.');
}

async function waitForPort(port) {
  const retryInterval = 200;
  const maxRetries = 50; // 10 seconds
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      await fetch(`http://127.0.0.1:${port}`, { signal: controller.signal }).catch(() => {});

      await new Promise((resolve, reject) => {
        const ws = new NodeWebSocket(`ws://127.0.0.1:${port}`);
        ws.on('open', () => { ws.close(); resolve(); });
        ws.on('error', reject);
      });
      return;
    } catch (e) {
      // console.log('Retrying connection...', e.message);
      await new Promise(r => setTimeout(r, retryInterval));
    }
  }
  throw new Error(`Relay did not start on port ${port}`);
}

function createClient() {
  const sk = NostrTools.generateSecretKey();
  const pk = NostrTools.getPublicKey(sk);
  const client = {
    sk,
    pk,
    ws: new NodeWebSocket(config.relay),
    pendingEvents: new Map(),
  };

  return new Promise((resolve) => {
    client.ws.on('open', () => {
      resolve(client);
    });
    client.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg[0] === 'OK') {
          const eventId = msg[1];
          const accepted = msg[2];
          const reason = msg[3];

          if (client.pendingEvents.has(eventId)) {
            const startTime = client.pendingEvents.get(eventId);
            const duration = performance.now() - startTime;
            metrics.latencies.push(duration);
            metrics.received++;
            client.pendingEvents.delete(eventId);

            if (!accepted) {
              metrics.errors++;
              metrics.errorCounts[reason] = (metrics.errorCounts[reason] || 0) + 1;
            }
          }
        }
      } catch (e) {
        // ignore malformed
      }
    });
    client.ws.on('error', (err) => {
      metrics.errors++;
      const msg = err.message || 'connection_error';
      metrics.errorCounts[msg] = (metrics.errorCounts[msg] || 0) + 1;
    });
  });
}

// --- Main ---

async function run() {
  try {
    // 1. Start Relay
    await startRelay();

    // 2. Init Clients
    console.log(`[Setup] Connecting ${config.clients} clients...`);
    const connections = [];
    for (let i = 0; i < config.clients; i++) {
      connections.push(createClient());
      if (i % 100 === 0 && i > 0) process.stdout.write('.');
    }
    const results = await Promise.all(connections);
    activeClients.push(...results);
    console.log('\n[Setup] Clients connected.');

    // 3. Load Loop
    console.log('[Load] Starting load generation...');
    const startTime = performance.now();
    const endTime = startTime + (config.duration * 1000);

    // Total expected events per second
    const totalRate = config.clients * config.rate;
    const intervalMs = 1000 / totalRate;

    console.log(`[Load] Target rate: ${totalRate.toFixed(2)} events/sec`);

    let running = true;

    // Monitoring Loop
    const monitorInterval = setInterval(() => {
      const cpu = process.cpuUsage();
      const mem = process.memoryUsage();
      metrics.resourceUsage.push({
        timestamp: Date.now(),
        cpuUser: cpu.user,
        cpuSystem: cpu.system,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
      });
      console.log(`[Monitor] Sent: ${metrics.sent}, Recv: ${metrics.received}, Errors: ${metrics.errors}, Latency p50: ${calculatePercentile(metrics.latencies, 50).toFixed(2)}ms`);
    }, 5000);

    // Event Loop
    const loadLoop = async () => {
      while (performance.now() < endTime && running) {
        const iterationStart = performance.now();

        // Pick random client
        const clientIndex = Math.floor(Math.random() * activeClients.length);
        const client = activeClients[clientIndex];

        // Pick event type (10% heavy, 90% light)
        const isHeavy = Math.random() < 0.1;

        try {
          let event;
          const buildStart = performance.now();
          const now = Math.floor(Date.now() / 1000);
          const hexPk = client.pk; // getPublicKey returns hex in v2

          if (isHeavy) {
            // Video Post
            const content = {
              version: 3,
              title: `Load Test Video ${Date.now()}`,
              description: 'A description for load testing purposes. '.repeat(50), // make it larger
              magnet: `magnet:?xt=urn:btih:${Math.random().toString(16).slice(2).repeat(10)}`,
              mode: 'live',
              videoRootId: `load-${Date.now()}-${Math.random()}`,
              isNsfw: false,
              isForKids: false,
            };
            event = buildVideoPostEvent({
              pubkey: hexPk,
              created_at: now,
              content,
              dTagValue: content.videoRootId
            });
          } else {
            // View Event
            event = buildViewEvent({
              pubkey: hexPk,
              created_at: now,
              pointerValue: `load-video-${Math.random()}`,
              pointerTag: ['d', `load-video-${Math.random()}`]
            });
          }
          metrics.operationTimes.build.push(performance.now() - buildStart);

          // Sign
          const signStart = performance.now();
          // We need to pass event to finalizeEvent.
          // Note: build*Event returns a plain object.
          // nostr-tools v2 finalizeEvent takes (t, secretKey)
          const signedEvent = NostrTools.finalizeEvent(event, client.sk);
          metrics.operationTimes.sign.push(performance.now() - signStart);

          // Publish
          client.pendingEvents.set(signedEvent.id, performance.now());
          client.ws.send(JSON.stringify(['EVENT', signedEvent]));
          metrics.sent++;

        } catch (e) {
          console.error('Error generating/sending event:', e);
          metrics.errors++;
        }

        // Throttle
        const elapsed = performance.now() - iterationStart;
        const delay = Math.max(0, intervalMs - elapsed);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        else {
             // Yield to event loop if we are falling behind
             await new Promise(r => setImmediate(r));
        }
      }
      running = false;
    };

    await loadLoop();

    clearInterval(monitorInterval);
    console.log('[Load] Test finished.');

    // 4. Report
    generateReport();

  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    // Teardown
    console.log('[Teardown] Closing clients...');
    for (const c of activeClients) {
      c.ws.terminate();
    }
    if (relayProcess) {
      console.log('[Teardown] Killing relay...');
      relayProcess.kill();
    }
  }
}

function calculatePercentile(data, percentile) {
  if (data.length === 0) return 0;
  data.sort((a, b) => a - b);
  const index = Math.floor(data.length * (percentile / 100));
  return data[index];
}

function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    config,
    metrics: {
      total_sent: metrics.sent,
      total_received: metrics.received,
      errors: metrics.errors,
      throughput_sent: metrics.sent / config.duration,
      throughput_recv: metrics.received / config.duration,
      latency_ms: {
        p50: calculatePercentile(metrics.latencies, 50),
        p95: calculatePercentile(metrics.latencies, 95),
        p99: calculatePercentile(metrics.latencies, 99),
        max: calculatePercentile(metrics.latencies, 100),
      },
      operation_times_ms: {
        build_avg: metrics.operationTimes.build.reduce((a, b) => a + b, 0) / metrics.operationTimes.build.length || 0,
        sign_avg: metrics.operationTimes.sign.reduce((a, b) => a + b, 0) / metrics.operationTimes.sign.length || 0,
      },
      resource_usage: metrics.resourceUsage,
      error_breakdown: metrics.errorCounts,
    },
    bottlenecks: [],
    remediation: []
  };

  // Simple heuristics for bottlenecks
  if (report.metrics.latency_ms.p99 > 1000) {
    report.bottlenecks.push('High P99 Latency (>1s)');
    report.remediation.push('Relay might be overloaded or network saturated. Investigate relay event loop lag.');
  }
  if (report.metrics.errors > 0) {
    report.bottlenecks.push('Errors detected');
    report.remediation.push('Check error breakdown.');
  }

  // Hot functions proxy
  if (report.metrics.operation_times_ms.sign_avg > 10) {
     report.bottlenecks.push('Signing is slow');
     report.remediation.push('Optimize signing or offload to worker.');
  }

  const filename = `load-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const reportPath = path.join(ARTIFACTS_DIR, filename);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[Report] Saved to ${reportPath}`);
}

run();
