import './setup-test-env.js';
import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { spawn, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVideoPostEvent, buildViewEvent } from '../../js/nostrEventSchemas.js';
import { buildNip71VideoEvent } from '../../js/nostr/nip71.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts');

// Ensure artifacts dir exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Configuration defaults
const CONFIG = {
  clients: 100, // Default N
  duration: 60, // Seconds
  rate: 5, // Events per second per client (approx)
  relayUrl: 'ws://localhost:8008',
  relayScript: 'scripts/agent/simple-relay.mjs',
  force: false
};

// Parse args
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--clients')) {
    if (arg.includes('=')) CONFIG.clients = parseInt(arg.split('=')[1]);
    else if (args[i+1]) CONFIG.clients = parseInt(args[++i]);
  }
  else if (arg.startsWith('--duration')) {
    if (arg.includes('=')) CONFIG.duration = parseInt(arg.split('=')[1]);
    else if (args[i+1]) CONFIG.duration = parseInt(args[++i]);
  }
  else if (arg.startsWith('--rate')) {
    if (arg.includes('=')) CONFIG.rate = parseFloat(arg.split('=')[1]);
    else if (args[i+1]) CONFIG.rate = parseFloat(args[++i]);
  }
  else if (arg.startsWith('--relay')) {
    if (arg.includes('=')) CONFIG.relayUrl = arg.split('=')[1];
    else if (args[i+1]) CONFIG.relayUrl = args[++i];
  }
  else if (arg === '--force') {
    CONFIG.force = true;
  }
}

console.log('Load Test Configuration:', CONFIG);

// Helper: Is IP Private?
function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false; // Basic check, ipv4 only
  // 10.0.0.0 - 10.255.255.255
  if (parts[0] === 10) return true;
  // 172.16.0.0 - 172.31.255.255
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0 - 192.168.255.255
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0 - 127.255.255.255
  if (parts[0] === 127) return true;
  return false;
}

// Guardrail: Public Relays
function isSafeRelay(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname;

    // Localhost whitelist
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;

    // Private IP whitelist
    if (isPrivateIP(hostname)) return true;

    return false;
  } catch (e) {
    return false;
  }
}

if (!isSafeRelay(CONFIG.relayUrl) && !CONFIG.force) {
  console.error(`FATAL: Relay "${CONFIG.relayUrl}" is not on the whitelist (localhost or private IP).`);
  console.error('Use --force to override this safety check ONLY if you are testing against a dedicated private relay.');
  process.exit(1);
}

// Client Class
class LoadClient {
  constructor(id, relayUrl) {
    this.id = id;
    this.relayUrl = relayUrl;
    this.sk = generateSecretKey();
    this.pk = getPublicKey(this.sk);
    this.ws = null;
    this.connected = false;
    this.queue = [];
    this.pending = new Map(); // id -> { start, resolve, reject }
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.relayUrl);
      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });
      this.ws.on('error', (err) => {
        if (!this.connected) reject(err);
        else console.error(`Client ${this.id} error:`, err.message);
      });
      this.ws.on('close', () => {
        this.connected = false;
      });
      this.ws.on('message', (data) => this.handleMessage(data));
    });
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data);
      if (msg[0] === 'OK') {
        const [, eventId, success, message] = msg;
        const pending = this.pending.get(eventId);
        if (pending) {
          if (success) pending.resolve(performance.now() - pending.start);
          else pending.reject(new Error(message));
          this.pending.delete(eventId);
        }
      }
    } catch (e) {
      console.error(`Client ${this.id} parse error:`, e);
    }
  }

  async publish(eventTemplate) {
    if (!this.connected) throw new Error('Not connected');

    const event = finalizeEvent(eventTemplate, this.sk);

    return new Promise((resolve, reject) => {
      this.pending.set(event.id, {
        start: performance.now(),
        resolve,
        reject
      });

      try {
          this.ws.send(JSON.stringify(['EVENT', event]));
      } catch(e) {
          this.pending.delete(event.id);
          reject(e);
      }
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

// Stats
const stats = {
  totalSent: 0,
  totalReceived: 0,
  errors: 0,
  latencies: [],
  relayMetrics: [] // { timestamp, cpu, memory }
};

async function getRelayMetrics(pid) {
  if (!pid) return null;
  return new Promise(resolve => {
    exec(`ps -p ${pid} -o %cpu,%mem`, (err, stdout) => {
      if (err) return resolve(null);
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return resolve(null);
      const [cpu, mem] = lines[1].trim().split(/\s+/);
      resolve({ cpu: parseFloat(cpu), mem: parseFloat(mem) });
    });
  });
}

async function run() {
  // Start Relay
  let relayProc;
  let relayPid;

  if (CONFIG.relayUrl.includes('localhost') || CONFIG.relayUrl.includes('127.0.0.1')) {
    console.log('Starting local relay...');
    relayProc = spawn('node', [CONFIG.relayScript], { cwd: REPO_ROOT, stdio: 'inherit' });
    relayPid = relayProc.pid;
    // Wait for relay
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('Using external relay. Cannot monitor CPU/Mem directly.');
  }

  // Create Clients
  console.log(`Creating ${CONFIG.clients} clients...`);
  const clients = [];
  for (let i = 0; i < CONFIG.clients; i++) {
    clients.push(new LoadClient(i, CONFIG.relayUrl));
  }

  // Connect Clients
  console.log('Connecting clients...');
  const connectStart = performance.now();
  await Promise.all(clients.map(c => c.connect().catch(e => {
    console.error(`Client ${c.id} failed to connect:`, e.message);
    stats.errors++;
  })));
  console.log(`Connected in ${(performance.now() - connectStart).toFixed(2)}ms`);

  // Load Loop
  console.log('Starting load generation...');
  const endTime = Date.now() + CONFIG.duration * 1000;
  const runningClients = clients.filter(c => c.connected);

  // Monitor Loop
  const monitorInterval = setInterval(async () => {
    if (relayPid) {
      const metrics = await getRelayMetrics(relayPid);
      if (metrics) {
        stats.relayMetrics.push({ timestamp: Date.now(), ...metrics });
      }
    }
  }, 1000);

  // Traffic Loop
  const trafficPromises = runningClients.map(async (client) => {
    while (Date.now() < endTime) {
      const type = Math.random() > 0.8 ? 'VIDEO' : 'VIEW'; // 20% video, 80% view
      let template;

      try {
        if (type === 'VIDEO') {
          // Simulate multi-part (Video + NIP-71)
          // For load test, we just publish the main video event.
          // Properly linking NIP-71 requires more state, but we can publish Kind 30078.
           const videoRootId = `load-${client.id}-${Date.now()}`;
           template = buildVideoPostEvent({
              pubkey: client.pk,
              created_at: Math.floor(Date.now() / 1000),
              dTagValue: videoRootId,
              content: {
                title: `Load Test Video ${Date.now()}`,
                videoRootId: videoRootId,
                version: 3
              }
           });
        } else {
          // View Event
          template = buildViewEvent({
            pubkey: client.pk,
            created_at: Math.floor(Date.now() / 1000),
            pointerValue: `30078:${client.pk}:test`,
            pointerTag: ['a', `30078:${client.pk}:test`]
          });
        }

        stats.totalSent++;
        const latency = await client.publish(template);
        stats.totalReceived++;
        stats.latencies.push(latency);

      } catch (e) {
        stats.errors++;
        // Backoff slightly on error
        await new Promise(r => setTimeout(r, 100));
      }

      // Rate limiting
      const delay = 1000 / CONFIG.rate + (Math.random() * 20 - 10);
      await new Promise(r => setTimeout(r, Math.max(10, delay)));
    }
  });

  await Promise.all(trafficPromises);

  clearInterval(monitorInterval);
  clients.forEach(c => c.close());
  if (relayProc) relayProc.kill();

  // Report
  console.log('Load test completed. Generating report...');

  stats.latencies.sort((a, b) => a - b);
  const p50 = stats.latencies[Math.floor(stats.latencies.length * 0.5)] || 0;
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)] || 0;
  const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)] || 0;
  const avg = stats.latencies.reduce((a, b) => a + b, 0) / (stats.latencies.length || 1);

  const report = {
    config: CONFIG,
    timestamp: new Date().toISOString(),
    metrics: {
      totalRequests: stats.totalSent,
      successfulRequests: stats.totalReceived,
      errors: stats.errors,
      throughput: stats.totalReceived / CONFIG.duration,
      latency: {
        avg,
        p50,
        p95,
        p99,
        min: stats.latencies[0] || 0,
        max: stats.latencies[stats.latencies.length - 1] || 0
      },
      relayResources: stats.relayMetrics
    },
    bottlenecks: [],
    remediation: []
  };

  // Simple analysis
  if (p99 > 200) {
    report.bottlenecks.push('High P99 Latency (>200ms)');
    report.remediation.push('Investigate relay event processing loop or event size overhead.');
  }
  if (stats.errors > 0) {
    report.bottlenecks.push(`Error rate ${(stats.errors/stats.totalSent*100).toFixed(2)}%`);
    report.remediation.push('Check relay logs for validation errors or connection limits.');
  }

  const reportPath = path.join(ARTIFACTS_DIR, `load-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved to ${reportPath}`);
}

run().catch(console.error);
