import './setup-test-env.js';
import { parseArgs } from 'node:util';
import { spawn, exec } from 'node:child_process';
import { fileURLToPath } from 'url';
import NodeWebSocket from 'ws';
import * as NostrTools from 'nostr-tools';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import util from 'node:util';

const execAsync = util.promisify(exec);

// Polyfill global NostrTools for app modules
global.NostrTools = NostrTools;

// Import Schema Builders
import { buildVideoPostEvent, buildViewEvent, buildVideoMirrorEvent } from '../../js/nostrEventSchemas.js';
import { buildNip71VideoEvent } from '../../js/nostr/nip71.js';

// --- Configuration ---
const ARTIFACTS_DIR = 'artifacts';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Default Config
const DEFAULT_CONFIG = {
  duration: 600, // seconds
  clients: 1000,
  rate: 0.1, // events per second per client
  relay: 'ws://localhost:8889',
};

// Parse Args
const { values: args } = parseArgs({
  options: {
    duration: { type: 'string', short: 'd' },
    clients: { type: 'string', short: 'c' },
    rate: { type: 'string', short: 'r' },
    relay: { type: 'string', short: 'u' }, // u for url
    force: { type: 'boolean', short: 'f' },
  },
});

const config = {
  duration: args.duration ? parseInt(args.duration) : DEFAULT_CONFIG.duration,
  clients: args.clients ? parseInt(args.clients) : DEFAULT_CONFIG.clients,
  rate: args.rate ? parseFloat(args.rate) : DEFAULT_CONFIG.rate,
  relay: args.relay || DEFAULT_CONFIG.relay,
  force: args.force || false,
};

console.log('--- Load Test Configuration ---');
console.log(JSON.stringify(config, null, 2));

// Guardrail: Public Relay
if (!config.force) {
  const u = new URL(config.relay);
  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname) || u.hostname.endsWith('.local');
  if (!isLocal) {
    console.error(`[Guardrail] ERROR: Target relay ${config.relay} does not appear to be local.`);
    console.error('Use --force to override (NOT RECOMMENDED for public relays).');
    process.exit(1);
  }
}

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
  relayResourceUsage: [], // { timestamp, cpu, mem }
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
  console.log('[Setup] Relay started (PID: ' + relayProcess.pid + ').');
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
      await new Promise(r => setTimeout(r, retryInterval));
    }
  }
  throw new Error(`Relay did not start on port ${port}`);
}

async function getProcessStats(pid) {
  try {
    // Output: %CPU %MEM
    const { stdout } = await execAsync(`ps -p ${pid} -o %cpu,%mem --no-headers`);
    const [cpu, mem] = stdout.trim().split(/\s+/);
    return {
      cpu: parseFloat(cpu) || 0,
      mem: parseFloat(mem) || 0
    };
  } catch (e) {
    return null;
  }
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
    // Only start if we are targeting the default local port, assuming we manage it.
    // If user provided a custom URL, we assume they manage the relay unless it matches our default logic.
    // For simplicity, we always try to start the relay if it's on localhost and port matches default or we can detect it's not running.
    // But per instructions "Use a local relay", let's always try to start it if it's the default port, or fail if port is taken.
    await startRelay().catch(e => {
        console.log('[Setup] Could not start relay (maybe already running?):', e.message);
    });

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
    console.log('[Load] Requirements: 10% Video Post (multipart), 90% View Event');
    const startTime = performance.now();
    const endTime = startTime + (config.duration * 1000);

    // Total expected events per second
    const totalRate = config.clients * config.rate;
    const intervalMs = 1000 / totalRate;

    console.log(`[Load] Target rate: ${totalRate.toFixed(2)} events/sec`);

    let running = true;
    let lastCpu = process.cpuUsage();
    let lastTime = performance.now();

    // Monitoring Loop
    const monitorInterval = setInterval(async () => {
      const now = performance.now();
      const cpu = process.cpuUsage();
      const elapsedMs = now - lastTime;

      if (elapsedMs > 0) {
        const userDeltaUs = cpu.user - lastCpu.user;
        const systemDeltaUs = cpu.system - lastCpu.system;
        const totalDeltaUs = userDeltaUs + systemDeltaUs;
        const cpuPercent = (totalDeltaUs / (elapsedMs * 1000)) * 100; // us / (ms * 1000) = fraction

        const mem = process.memoryUsage();
        metrics.resourceUsage.push({
          timestamp: Date.now(),
          cpuPercent: parseFloat(cpuPercent.toFixed(2)),
          rss: mem.rss,
          heapUsed: mem.heapUsed,
        });

        if (relayProcess) {
            const stats = await getProcessStats(relayProcess.pid);
            if (stats) {
                metrics.relayResourceUsage.push({
                    timestamp: Date.now(),
                    cpuPercent: stats.cpu,
                    memPercent: stats.mem
                });
            }
        }

        lastCpu = cpu;
        lastTime = now;

        const p50 = calculatePercentile(metrics.latencies, 50);
        console.log(`[Monitor] Sent: ${metrics.sent}, Recv: ${metrics.received}, Errors: ${metrics.errors}, Latency p50: ${p50.toFixed(2)}ms, Runner CPU: ${cpuPercent.toFixed(1)}%`);
      }
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
          const buildStart = performance.now();
          const now = Math.floor(Date.now() / 1000);
          const hexPk = client.pk;

          const eventsToSend = [];

          if (isHeavy) {
            // Video Post
            const content = {
              version: 3,
              title: `Load Test Video ${Date.now()}`,
              description: 'A description for load testing purposes. '.repeat(50),
              magnet: `magnet:?xt=urn:btih:${Math.random().toString(16).slice(2).repeat(10)}`,
              url: `https://example.com/video-${Date.now()}.mp4`,
              thumbnail: `https://example.com/thumb-${Date.now()}.jpg`,
              mode: 'live',
              videoRootId: `load-${Date.now()}-${Math.random()}`,
              isNsfw: false,
              isForKids: false,
            };

            const rootEvent = buildVideoPostEvent({
              pubkey: hexPk,
              created_at: now,
              content,
              dTagValue: content.videoRootId
            });
            eventsToSend.push(rootEvent);

            // Mirror Event (NIP-94)
            const mirrorEvent = buildVideoMirrorEvent({
                pubkey: hexPk,
                created_at: now,
                tags: [['e', rootEvent.id], ['d', content.videoRootId]],
                content: {
                    url: content.url,
                    magnet: content.magnet,
                    thumbnail: content.thumbnail,
                    title: content.title
                }
            });
            eventsToSend.push(mirrorEvent);

            // NIP-71 Metadata
            const nip71Event = buildNip71VideoEvent({
                metadata: {
                    kind: 21,
                    title: content.title,
                    summary: content.description.slice(0, 200),
                    publishedAt: now,
                    hashtags: ['loadtest', 'stress'],
                },
                pubkey: hexPk,
                title: content.title,
                createdAt: now,
                pointerIdentifiers: {
                    videoRootId: content.videoRootId,
                    dTag: content.videoRootId,
                    eventId: rootEvent.id
                }
            });
            if (nip71Event) eventsToSend.push(nip71Event);

          } else {
            // View Event
            const event = buildViewEvent({
              pubkey: hexPk,
              created_at: now,
              pointerValue: `load-video-${Math.random()}`,
              pointerTag: ['d', `load-video-${Math.random()}`]
            });
            eventsToSend.push(event);
          }
          metrics.operationTimes.build.push(performance.now() - buildStart);

          // Sign
          const signedEvents = [];
          for (const ev of eventsToSend) {
             const t0 = performance.now();
             const signed = NostrTools.finalizeEvent(ev, client.sk);
             const t1 = performance.now();
             metrics.operationTimes.sign.push(t1 - t0);
             signedEvents.push(signed);
          }

          // Publish
          for (const signedEvent of signedEvents) {
             client.pendingEvents.set(signedEvent.id, performance.now());
             client.ws.send(JSON.stringify(['EVENT', signedEvent]));
             metrics.sent++;
          }

        } catch (e) {
          console.error('Error generating/sending event:', e);
          metrics.errors++;
        }

        // Throttle
        const elapsed = performance.now() - iterationStart;
        const delay = Math.max(0, intervalMs - elapsed);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));
        else await new Promise(r => setImmediate(r));
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
    process.exit(0);
  }
}

function calculatePercentile(data, percentile) {
  if (data.length === 0) return 0;
  data.sort((a, b) => a - b);
  const index = Math.floor(data.length * (percentile / 100));
  return data[index];
}

function generateReport() {
  const signAvg = metrics.operationTimes.sign.reduce((a, b) => a + b, 0) / metrics.operationTimes.sign.length || 0;

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
        sign_avg: signAvg,
      },
      resource_usage: metrics.resourceUsage,
      relay_resource_usage: metrics.relayResourceUsage,
      error_breakdown: metrics.errorCounts,
    },
    bottlenecks: [],
    remediation: []
  };

  // Heuristics
  if (report.metrics.latency_ms.p99 > 1000) {
    report.bottlenecks.push('High P99 Latency (>1s)');
    report.remediation.push('Relay might be overloaded or network saturated. Investigate relay event loop lag.');
  }
  if (report.metrics.errors > 0) {
    report.bottlenecks.push('Errors detected');
    report.remediation.push('Check error breakdown.');
  }

  // Hot functions proxy / Crypto bottleneck
  if (signAvg > 10) {
     report.bottlenecks.push(`Signing is slow (${signAvg.toFixed(2)}ms)`);
     report.remediation.push('Optimize signing or offload to worker.');
  }

  if (signAvg > 50) {
    report.bottlenecks.push('Cryptographic bottleneck');
    report.remediation.push('Mark as requires-security-review. Check if running in a constrained environment or if crypto implementation is suboptimal.');
  }

  if (report.bottlenecks.length === 0) {
    report.bottlenecks.push('None detected');
  }
  if (report.remediation.length === 0) {
    report.remediation.push('None required');
  }

  // Report File
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const filename = `load-report-${dateStr}.json`;
  const reportPath = path.join(ARTIFACTS_DIR, filename);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Also save as load-report.json for convenience
  const latestPath = path.join(ARTIFACTS_DIR, 'load-report.json');
  fs.copyFileSync(reportPath, latestPath);

  console.log(`[Report] Saved to ${reportPath} and ${latestPath}`);
}

run();
