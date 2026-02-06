import WebSocket, { WebSocketServer } from 'ws';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';

// Polyfills for Node.js environment
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Configuration
const ARGS = process.argv.slice(2);
const getConfig = (key, defaultVal) => {
  const envKey = key.toUpperCase().replace(/-/g, '_');
  if (process.env[envKey]) return process.env[envKey];
  const flagIndex = ARGS.indexOf(`--${key}`);
  if (flagIndex !== -1 && ARGS[flagIndex + 1]) return ARGS[flagIndex + 1];
  return defaultVal;
};

const RELAY_URL = getConfig('relay-url', 'ws://localhost:8080');
const CLIENT_COUNT = parseInt(getConfig('clients', '1000'), 10);
const DURATION_SEC = parseInt(getConfig('duration', '600'), 10);
const EVENT_RATE = parseFloat(getConfig('rate', '1.0')); // events per second per client
const MODE = getConfig('mode', 'mixed'); // 'view', 'video', 'mixed'
const MOCK_MODE = ARGS.includes('--mock');

// Constants
const KIND_VIDEO_POST = 30078;
const KIND_WATCH_HISTORY = 30079;
const START_TIME = Date.now();

// Guardrails
const isPublicRelay = (url) => {
  if (MOCK_MODE) return false;
  const u = new URL(url);
  const host = u.hostname;
  return !(
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.endsWith('.local')
  );
};

if (isPublicRelay(RELAY_URL)) {
  console.error(`ERROR: RELAY_URL '${RELAY_URL}' appears to be a public relay.`);
  console.error('       Load tests must be run against local or dedicated test relays.');
  process.exit(1);
}

// Metrics
const metrics = {
  eventsSent: 0,
  eventsAcked: 0,
  eventsFailed: 0,
  signingTimes: [],
  latencies: [],
  errors: {},
};

// Mock Relay Server
let mockServer;
if (MOCK_MODE) {
  console.log('Starting internal mock relay on port 8080...');
  mockServer = new WebSocketServer({ port: 8080 });
  mockServer.on('connection', (ws) => {
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (Array.isArray(data) && data[0] === 'EVENT') {
          const eventId = data[1].id;
          ws.send(JSON.stringify(['OK', eventId, true, '']));
        }
      } catch (e) {
        // ignore malformed
      }
    });
  });
}

// Helpers
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createClients = (n) => {
  const clients = [];
  for (let i = 0; i < n; i++) {
    const sk = generateSecretKey();
    clients.push({
      sk,
      pk: getPublicKey(sk),
      ws: null,
      connected: false,
    });
  }
  return clients;
};

const connectClient = (client) => {
  return new Promise((resolve) => {
    client.ws = new WebSocket(RELAY_URL);
    client.ws.on('open', () => {
      client.connected = true;
      resolve(true);
    });
    client.ws.on('error', (err) => {
      metrics.errors[err.message] = (metrics.errors[err.message] || 0) + 1;
      resolve(false);
    });
    client.ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            if (msg[0] === 'OK') {
                const eventId = msg[1];
                const accepted = msg[2];
                const info = client.pendingEvents?.get(eventId);
                if (info) {
                    const latency = Date.now() - info.sentAt;
                    metrics.latencies.push(latency);
                    metrics.eventsAcked++;
                    client.pendingEvents.delete(eventId);
                }
            }
        } catch (e) {}
    });
    client.pendingEvents = new Map();
  });
};

const generateEvent = (client) => {
  const type = MODE === 'mixed' ? (Math.random() > 0.5 ? 'view' : 'video') : MODE;

  const created_at = Math.floor(Date.now() / 1000);

  if (type === 'view') {
    return {
      kind: KIND_WATCH_HISTORY,
      created_at,
      tags: [
        ['t', 'view'],
        ['d', Math.random().toString(36).substring(7)],
      ],
      content: 'Load test view event',
    };
  } else {
    // Video post with multipart simulation (large tags)
    const tags = [
      ['d', Math.random().toString(36).substring(7)],
      ['t', 'video'],
      ['s', `magnet:?xt=urn:btih:${Math.random().toString(16).substring(2)}`],
    ];
    // Add dummy imeta tags to simulate load
    for (let i = 0; i < 20; i++) {
      tags.push(['imeta', `url https://example.com/segment_${i}.mp4`, `dim 1920x1080`, `mime video/mp4`]);
    }

    return {
      kind: KIND_VIDEO_POST,
      created_at,
      tags,
      content: JSON.stringify({
        version: 3,
        title: `Load Test Video ${Math.random()}`,
        videoRootId: `root-${Math.random()}`,
        description: 'Simulated multipart video event for load testing.',
      }),
    };
  }
};

const runClientLoop = async (client) => {
  const interval = 1000 / EVENT_RATE;

  while (Date.now() - START_TIME < DURATION_SEC * 1000) {
    if (!client.connected) {
      await sleep(1000);
      continue;
    }

    try {
      const eventTemplate = generateEvent(client);

      const signStart = process.hrtime();
      const event = finalizeEvent(eventTemplate, client.sk);
      const signEnd = process.hrtime(signStart);
      const signTimeMs = (signEnd[0] * 1000) + (signEnd[1] / 1e6);
      metrics.signingTimes.push(signTimeMs);

      client.pendingEvents.set(event.id, { sentAt: Date.now() });
      client.ws.send(JSON.stringify(['EVENT', event]));
      metrics.eventsSent++;

    } catch (e) {
      metrics.eventsFailed++;
      metrics.errors[e.message] = (metrics.errors[e.message] || 0) + 1;
    }

    // jitter
    const delay = interval + (Math.random() * interval * 0.1);
    await sleep(delay);
  }
};

// Main execution
(async () => {
  console.log(`Starting Load Test`);
  console.log(`  Relay: ${RELAY_URL}`);
  console.log(`  Clients: ${CLIENT_COUNT}`);
  console.log(`  Duration: ${DURATION_SEC}s`);
  console.log(`  Rate: ${EVENT_RATE} events/s/client`);
  console.log(`  Mode: ${MODE}`);
  if (MOCK_MODE) console.log('  (Mock Mode Enabled)');

  const clients = createClients(CLIENT_COUNT);
  console.log(`Generated ${clients.length} client identities.`);

  console.log('Connecting clients...');
  const connections = await Promise.all(clients.map(connectClient));
  const connectedCount = connections.filter(Boolean).length;
  console.log(`Connected ${connectedCount}/${CLIENT_COUNT} clients.`);

  if (connectedCount === 0) {
    console.error('Failed to connect any clients. Aborting.');
    process.exit(1);
  }

  console.log('Starting load generation...');
  const loops = clients.map(client => runClientLoop(client));

  await Promise.all(loops);

  console.log('Test finished. Disconnecting...');
  clients.forEach(c => c.ws?.close());
  if (mockServer) mockServer.close();

  // Reporting
  const avgLatency = metrics.latencies.reduce((a, b) => a + b, 0) / metrics.latencies.length || 0;
  const sortedLatencies = metrics.latencies.sort((a, b) => a - b);
  const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const avgSigningTime = metrics.signingTimes.reduce((a, b) => a + b, 0) / metrics.signingTimes.length || 0;

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      relayUrl: RELAY_URL,
      clientCount: CLIENT_COUNT,
      duration: DURATION_SEC,
      rate: EVENT_RATE,
      mode: MODE,
    },
    metrics: {
      totalSent: metrics.eventsSent,
      totalAcked: metrics.eventsAcked,
      totalFailed: metrics.eventsFailed,
      successRate: (metrics.eventsAcked / metrics.eventsSent) * 100 || 0,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      avgSigningTimeMs: avgSigningTime,
      throughput: metrics.eventsAcked / DURATION_SEC,
    },
    errors: metrics.errors,
    hotFunctions: [
      { name: 'Event Signing', avgTimeMs: avgSigningTime, note: 'Client-side CPU bottleneck' },
      { name: 'Network Roundtrip', avgTimeMs: avgLatency, note: 'Network/Relay latency' }
    ],
    remediation: [
      'If signing time is high, consider parallelizing clients or using more powerful client machines.',
      'If latency is high, check relay resource usage (CPU, RAM, Disk I/O) or network bandwidth.',
      'If failure rate is high, check relay error logs for rate limiting or rejection reasons.'
    ]
  };

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const reportDir = path.join(process.cwd(), 'artifacts');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);
  const reportPath = path.join(reportDir, `load-report-${dateStr}.json`);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved to ${reportPath}`);

  process.exit(0);
})();
