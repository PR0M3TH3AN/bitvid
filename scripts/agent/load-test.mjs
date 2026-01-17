import { WebSocket } from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

globalThis.WebSocket = WebSocket;

const CONFIG = {
  relayUrl: process.env.RELAY_URL || 'ws://127.0.0.1:3333',
  numClients: parseInt(process.env.NUM_CLIENTS || '1000', 10),
  durationSec: parseInt(process.env.DURATION_SEC || '60', 10),
  eventsPerSec: parseInt(process.env.RATE || '20', 10),
  reportFile: process.env.REPORT_FILE || `artifacts/load-report-${new Date().toISOString().split('T')[0]}.json`,
  useInternalRelay: !process.env.RELAY_URL
};

function isLocalRelay(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    if (host.startsWith('192.168.') || host.startsWith('10.') || host.match(/^172\.(1[6-9]|2\d|3[0-1])\./)) return true;
    return false;
  } catch { return false; }
}

// Metrics
const stats = {
  startTime: Date.now(),
  sent: 0,
  received: 0,
  errors: 0,
  latencies: [], // Roundtrip (ms)
  pubAckLatencies: [], // Publish -> OK (ms)
  bytesSent: 0,
  bytesReceived: 0,
  msgTypeCounts: {}
};

// Clients
const clients = [];
let relayProcess = null;

async function startRelay() {
  if (!CONFIG.useInternalRelay) return;

  console.log('Starting internal relay...');
  const relayScript = resolve('scripts/agent/simple-relay.mjs');

  relayProcess = spawn('node', [relayScript], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '3333' }
  });

  // Wait for it to be ready (dumb wait)
  await new Promise(r => setTimeout(r, 2000));
}

function createClient(index) {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  return new Promise((resolve, reject) => {
    // Add timeout
    const timeout = setTimeout(() => {
        reject(new Error(`Client ${index} connection timeout`));
        try { ws.close(); } catch {}
    }, 5000);

    const ws = new WebSocket(CONFIG.relayUrl);

    const client = {
      id: index,
      ws,
      sk,
      pk,
      subs: new Map(),
      pendingPublishes: new Map() // eventId -> startTime
    };

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(client);
    });

    ws.on('error', (err) => {
      // console.error(`Client ${index} error:`, err.message);
      stats.errors++;
      if (ws.readyState === WebSocket.CONNECTING) reject(err);
    });

    ws.on('message', (data) => {
      const size = data.length;
      stats.bytesReceived += size;

      try {
        const msg = JSON.parse(data.toString());
        const type = msg[0];

        stats.msgTypeCounts[type] = (stats.msgTypeCounts[type] || 0) + 1;

        if (type === 'OK') {
          const [_, eventId, success, info] = msg;
          if (client.pendingPublishes.has(eventId)) {
            const start = client.pendingPublishes.get(eventId);
            const latency = Date.now() - start;
            stats.pubAckLatencies.push(latency);
            client.pendingPublishes.delete(eventId);
          }
          if (!success) {
            stats.errors++;
            // console.warn(`Publish failed for ${eventId}: ${info}`);
          }
        } else if (type === 'EVENT') {
          const [_, subId, event] = msg;
          // Calculate roundtrip if we tracked this event
          // We can attach a 'created_at' but that's in seconds.
          // We'll rely on a local map of sent events if we want precise RT,
          // or we can embed a high-res timestamp in the content if we want.
          // Let's use a global map for roundtrip tracking since any client might receive it.

          if (pendingRoundtrips.has(event.id)) {
            const start = pendingRoundtrips.get(event.id);
            const latency = Date.now() - start;
            stats.latencies.push(latency);
            stats.received++;
            pendingRoundtrips.delete(event.id); // Only count first receipt? Or Average?
            // To avoid memory leak, we delete. For load test, first receipt is good enough proxy for propagation.
          }
        }
      } catch (e) {
        stats.errors++;
      }
    });
  });
}

const pendingRoundtrips = new Map(); // eventId -> startTime

async function runTest() {
  if (!CONFIG.useInternalRelay && !isLocalRelay(CONFIG.relayUrl) && !process.env.FORCE_PUBLIC) {
    console.error("Error: Configured relay appears to be public. Use FORCE_PUBLIC=1 to override.");
    process.exit(1);
  }

  await startRelay();

  console.log(`Connecting ${CONFIG.numClients} clients to ${CONFIG.relayUrl}...`);

  // Batch connections to avoid connection storm
  const BATCH_SIZE = 50;
  for (let i = 0; i < CONFIG.numClients; i += BATCH_SIZE) {
    const batchPromises = [];
    for (let j = 0; j < BATCH_SIZE && i + j < CONFIG.numClients; j++) {
      batchPromises.push(createClient(i + j));
    }
    try {
      const batch = await Promise.all(batchPromises);
      clients.push(...batch);
      if ((i + BATCH_SIZE) % 500 === 0) console.log(`Connected ${clients.length}/${CONFIG.numClients}`);
    } catch (e) {
      console.error('Failed to connect clients:', e);
      process.exit(1);
    }
  }

  console.log('Clients connected. Subscribing...');

  // Subscribe all clients to everything (or a subset to avoid explosion)
  // If 1000 clients subscribe to everything, 1 publish = 1000 receives.
  // 10 events/sec = 10,000 messages/sec. That's a lot.
  // Let's have clients subscribe to a global filter but maybe we only have a subset of *listening* clients?
  // Or simpler: Each client subscribes to itself, and we publish to random clients.
  // But prompt says "simulate N clients ... connecting to the relay".
  // And "Publish ... mixture ...".
  // To measure roundtrip, someone needs to receive.
  // Let's have 10% of clients be "listeners" that subscribe to a wildcard (or specific kinds).

  const listenerCount = Math.max(1, Math.floor(CONFIG.numClients * 0.1));
  console.log(`Setting up ${listenerCount} listeners...`);

  for (let i = 0; i < listenerCount; i++) {
    const client = clients[i];
    const subId = 'sub1';
    // Subscribe to the kinds we publish
    const req = ['REQ', subId, { kinds: [30078, 30079] }];
    client.ws.send(JSON.stringify(req));
  }

  console.log(`Starting load generation for ${CONFIG.durationSec} seconds...`);

  // Cleanup stale roundtrips
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, start] of pendingRoundtrips) {
      if (now - start > 10000) pendingRoundtrips.delete(id);
    }
  }, 5000);
  cleanupInterval.unref();

  // Better loop
  let running = true;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const runLoop = async () => {
    while (running) {
      const startTick = Date.now();

      // How many to send this tick (simulating 100ms ticks)
      const batchSize = Math.ceil(CONFIG.eventsPerSec / 10);

      for (let k = 0; k < batchSize; k++) {
        const client = clients[Math.floor(Math.random() * clients.length)];
        const isLarge = Math.random() > 0.5;

        const kind = isLarge ? 30078 : 30079;
        const content = isLarge
            ? JSON.stringify({ version: 3, title: "Load Test Video", description: "x".repeat(2000) })
            : "view";

        const event = {
          kind,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['t', isLarge ? 'video' : 'view']],
          content,
          pubkey: client.pk,
        };

        try {
            const signedEvent = finalizeEvent(event, client.sk);

            client.pendingPublishes.set(signedEvent.id, Date.now());
            pendingRoundtrips.set(signedEvent.id, Date.now());

            const msg = JSON.stringify(['EVENT', signedEvent]);
            client.ws.send(msg);
            stats.sent++;
            stats.bytesSent += msg.length;
        } catch(e) {
            stats.errors++;
        }
      }

      const elapsed = Date.now() - startTick;
      const wait = Math.max(0, 100 - elapsed);
      await sleep(wait);
    }
  };

  const loopPromise = runLoop();

  // Wait for duration
  await new Promise(r => setTimeout(r, CONFIG.durationSec * 1000));
  running = false;
  await loopPromise;

  console.log('Test finished. Disconnecting...');

  // Cleanup
  clients.forEach(c => c.ws.close());
  if (relayProcess) {
    relayProcess.kill();
  }

  // Report
  await generateReport();
}

async function generateReport() {
  const duration = (Date.now() - stats.startTime) / 1000;

  // Stats
  const avgLatency = stats.latencies.reduce((a, b) => a + b, 0) / (stats.latencies.length || 1);
  const avgPubAck = stats.pubAckLatencies.reduce((a, b) => a + b, 0) / (stats.pubAckLatencies.length || 1);

  const report = {
    config: CONFIG,
    metrics: {
      durationActual: duration,
      totalSent: stats.sent,
      totalReceived: stats.received,
      errors: stats.errors,
      throughput: {
        sentPerSec: stats.sent / duration,
        receivedPerSec: stats.received / duration,
        bytesSentPerSec: stats.bytesSent / duration,
        bytesReceivedPerSec: stats.bytesReceived / duration
      },
      latency: {
        avgRoundtripMs: avgLatency,
        avgPubAckMs: avgPubAck,
        p95RoundtripMs: percentile(stats.latencies, 95),
        p99RoundtripMs: percentile(stats.latencies, 99)
      },
      messageTypes: stats.msgTypeCounts,
      resourceUsage: process.cpuUsage()
    },
    bottlenecks: [], // Placeholder
    remediation: [] // Placeholder
  };

  // Basic analysis
  if (avgLatency > 1000) {
    report.bottlenecks.push("High average latency (>1s)");
    report.remediation.push("Check relay CPU or network bandwidth");
  }
  if (stats.errors > 0) {
    report.bottlenecks.push(`Observed ${stats.errors} errors`);
  }

  // Ensure artifacts dir exists (created in previous step, but safe to check)
  const reportPath = resolve(CONFIG.reportFile);
  await mkdir(dirname(reportPath), { recursive: true });

  writeFile(reportPath, JSON.stringify(report, null, 2))
    .then(() => console.log(`Report written to ${reportPath}`))
    .catch(e => console.error('Failed to write report:', e));
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const index = Math.floor((p / 100) * arr.length);
  return arr[index];
}

runTest().catch(console.error);
