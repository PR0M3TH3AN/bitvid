import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Configuration
const CONFIG = {
  relayUrl: 'ws://localhost:8008',
  numClients: 1000,
  durationSeconds: 60,
  eventsPerSecond: 100,
  mix: {
    viewEvent: 0.8,
    videoPost: 0.2
  },
  unsafe: false
};

// Parse args
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--clients') CONFIG.numClients = parseInt(args[++i], 10);
  else if (arg === '--duration') CONFIG.durationSeconds = parseInt(args[++i], 10);
  else if (arg === '--rate') CONFIG.eventsPerSecond = parseInt(args[++i], 10);
  else if (arg === '--relay') CONFIG.relayUrl = args[++i];
  else if (arg === '--unsafe') CONFIG.unsafe = true;
}

console.log('Load Test Configuration:', CONFIG);

// Guardrail
function isSafeRelay(url) {
    if (CONFIG.unsafe) return true;
    try {
        const u = new URL(url);
        return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    } catch {
        return false;
    }
}

if (!isSafeRelay(CONFIG.relayUrl)) {
    console.error('ERROR: Guardrail active. Cannot run against public relays without --unsafe flag.');
    process.exit(1);
}

// Artifacts setup
const ARTIFACTS_DIR = path.join(PROJECT_ROOT, 'artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Helpers
function buildViewEvent(pubkey) {
  return {
    kind: 30079,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', 'watch-history'],
      ['t', 'view'],
      ['session', 'true']
    ],
    content: JSON.stringify({ timestamp: Date.now(), random: Math.random() }),
    pubkey
  };
}

function buildVideoPostEvent(pubkey) {
  return {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', Math.random().toString(36).substring(7)],
      ['t', 'video']
    ],
    content: JSON.stringify({
      version: 1,
      title: `Load Test Video ${Math.random().toString(36)}`,
      videoRootId: Math.random().toString(36),
      mode: 's',
      duration: 120
    }),
    pubkey
  };
}

// State
const metrics = {
  sent: 0,
  ok: 0,
  failed: 0,
  latencies: [],
  signingTimes: [],
  startTime: Date.now(),
  startCpu: process.cpuUsage(),
  errors: []
};

// Main execution
async function main() {
  let relayProcess = null;
  const isLocalRelay = CONFIG.relayUrl.includes('localhost') || CONFIG.relayUrl.includes('127.0.0.1');

  if (isLocalRelay) {
    try {
      await checkRelay(CONFIG.relayUrl);
      console.log('Relay is already running.');
    } catch (e) {
      console.log('Relay not running, spawning simple-relay.mjs...');
      const relayScript = path.join(PROJECT_ROOT, 'scripts/agent/simple-relay.mjs');
      if (!fs.existsSync(relayScript)) {
          console.error(`Simple relay script not found at ${relayScript}`);
          process.exit(1);
      }
      relayProcess = spawn('node', [relayScript], {
        stdio: 'inherit',
        detached: false
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`Simulating ${CONFIG.numClients} clients...`);

  const MAX_CONNS = Math.min(CONFIG.numClients, 100);
  const connections = [];

  for (let i = 0; i < MAX_CONNS; i++) {
    const ws = new WebSocket(CONFIG.relayUrl);
    ws.on('error', (err) => {
        metrics.errors.push(err.message);
    });
    connections.push(ws);
  }

  await Promise.all(connections.map(ws => new Promise(resolve => {
      if (ws.readyState === WebSocket.OPEN) resolve();
      else ws.on('open', resolve);
      setTimeout(resolve, 1000);
  })));

  console.log(`${connections.length} connections established.`);

  const keypairs = [];
  for (let i = 0; i < CONFIG.numClients; i++) {
    const sk = generateSecretKey();
    keypairs.push({
        sk,
        pk: getPublicKey(sk)
    });
  }

  console.log('Starting load generation...');
  const intervalMs = 1000 / CONFIG.eventsPerSecond;
  const endAt = Date.now() + (CONFIG.durationSeconds * 1000);

  const pendingLatencies = new Map();

  connections.forEach(ws => {
      ws.removeAllListeners('message');
      ws.on('message', (data) => {
          try {
              const msg = JSON.parse(data);
              if (msg[0] === 'OK') {
                  const eventId = msg[1];
                  if (pendingLatencies.has(eventId)) {
                      const start = pendingLatencies.get(eventId);
                      const latency = Date.now() - start;
                      metrics.latencies.push(latency);
                      pendingLatencies.delete(eventId);
                  }
                  metrics.ok++;
              } else if (msg[0] === 'NOTICE') {
                  metrics.errors.push(msg[1]);
              }
          } catch (e) {}
      });
  });

  const loop = async () => {
    while (Date.now() < endAt) {
       const loopStart = Date.now();

       const client = keypairs[Math.floor(Math.random() * keypairs.length)];
       const ws = connections[Math.floor(Math.random() * connections.length)];

       if (ws.readyState === WebSocket.OPEN) {
           let eventTemplate;
           if (Math.random() < CONFIG.mix.viewEvent) {
               eventTemplate = buildViewEvent(client.pk);
           } else {
               eventTemplate = buildVideoPostEvent(client.pk);
           }

           try {
               const signStart = process.hrtime();
               const event = finalizeEvent(eventTemplate, client.sk);
               const signEnd = process.hrtime(signStart);
               const signMs = (signEnd[0] * 1000) + (signEnd[1] / 1e6);
               metrics.signingTimes.push(signMs);

               const msg = JSON.stringify(['EVENT', event]);

               if (Math.random() < 0.05) {
                   pendingLatencies.set(event.id, Date.now());
               }

               ws.send(msg);
               metrics.sent++;
           } catch (err) {
               metrics.failed++;
               metrics.errors.push(err.message);
           }
       }

       const elapsed = Date.now() - loopStart;
       const targetDelay = 1000 / CONFIG.eventsPerSecond;
       if (elapsed < targetDelay) {
           await new Promise(r => setTimeout(r, targetDelay - elapsed));
       }
    }
    finish(relayProcess);
  };

  loop();
}

function checkRelay(url) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.on('open', () => {
            ws.close();
            resolve();
        });
        ws.on('error', (err) => {
            reject(err);
        });
    });
}

function finish(relayProcess) {
    console.log('Test finished. Generating report...');

    const cpuUsage = process.cpuUsage(metrics.startCpu);
    const memUsage = process.memoryUsage();

    const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / (metrics.latencies.length || 1);
    const sortedLatencies = metrics.latencies.sort((a, b) => a - b);
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    const maxLatency = sortedLatencies[sortedLatencies.length - 1] || 0;

    const avgSignTime = metrics.signingTimes.reduce((a, b) => a + b, 0) / (metrics.signingTimes.length || 1);
    const sortedSignTimes = metrics.signingTimes.sort((a, b) => a - b);
    const p95SignTime = sortedSignTimes[Math.floor(sortedSignTimes.length * 0.95)] || 0;

    const durationSec = (Date.now() - metrics.startTime) / 1000;
    const throughput = metrics.ok / durationSec;

    const report = {
        timestamp: new Date().toISOString(),
        config: CONFIG,
        metrics: {
            durationSeconds: durationSec,
            totalSent: metrics.sent,
            totalOk: metrics.ok,
            totalFailed: metrics.failed,
            throughputEventsPerSec: throughput,
            latencyMs: {
                avg: avgLatency,
                p95: p95,
                max: maxLatency
            },
            crypto: {
                avgSigningTimeMs: avgSignTime,
                p95SigningTimeMs: p95SignTime
            },
            resources: {
                cpuUser: cpuUsage.user,
                cpuSystem: cpuUsage.system,
                memoryRss: memUsage.rss,
                memoryHeapTotal: memUsage.heapTotal,
                memoryHeapUsed: memUsage.heapUsed
            },
            errorSample: metrics.errors.slice(0, 10)
        },
        bottlenecks: [
            avgLatency > 1000 ? "High Average Latency (>1s)" : null,
            avgSignTime > 10 ? "Cryptographic Bottleneck (Signing > 10ms)" : null,
            metrics.failed > 0 ? "Failed Events Detected" : null
        ].filter(Boolean),
        remediation: "If latency is high, consider scaling the relay. If signing is slow, review crypto library or CPU resources."
    };

    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const reportPath = path.join(ARTIFACTS_DIR, `load-report-${dateStr}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`Report saved to ${reportPath}`);
    console.log(JSON.stringify(report.metrics, null, 2));

    if (relayProcess) {
        console.log('Stopping local relay...');
        relayProcess.kill();
    }
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
