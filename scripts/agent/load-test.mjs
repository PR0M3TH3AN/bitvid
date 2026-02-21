import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { buildVideoPostEvent, buildViewEvent, NOTE_TYPES } from '../../js/nostrEventSchemas.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const config = {
  relayUrl: process.env.RELAY_URL,
  clients: parseInt(process.env.CLIENTS || '1000', 10),
  durationSec: parseInt(process.env.DURATION_SEC || '600', 10),
  rateEps: parseFloat(process.env.RATE_EPS || '10'),
  mix: process.env.MIX || 'video:0.1,view:0.9',
  seed: process.env.SEED, // Not fully implementing deterministic seed for now, using Math.random
  dryRun: process.env.DRY_RUN === '1',
};

if (!config.relayUrl) {
  console.error('Error: RELAY_URL environment variable is required.');
  process.exit(1);
}

// Check for public relays to avoid accidents
const PUBLIC_RELAY_KEYWORDS = ['damus', 'primal', 'nostr.land', 'nos.lol'];
if (PUBLIC_RELAY_KEYWORDS.some(k => config.relayUrl.includes(k)) && !process.env.FORCE_PUBLIC) {
  console.error('Error: RELAY_URL appears to be a public relay. Aborting for safety.');
  console.error('Set FORCE_PUBLIC=1 if you really mean to do this (not recommended).');
  process.exit(1);
}

// Parse Mix
const mix = {};
config.mix.split(',').forEach(part => {
  const [type, ratio] = part.split(':');
  mix[type] = parseFloat(ratio);
});

// Normalize mix
const totalRatio = Object.values(mix).reduce((a, b) => a + b, 0);
for (const key in mix) {
  mix[key] /= totalRatio;
}

console.log('Load Test Configuration:', JSON.stringify(config, null, 2));
console.log('Event Mix:', mix);

// Metrics
const metrics = {
  startTime: Date.now(),
  sent: 0,
  success: 0,
  failed: 0,
  latencies: [], // in ms
  errors: {},
};

function recordError(code) {
  metrics.errors[code] = (metrics.errors[code] || 0) + 1;
}

// Client Class
class LoadClient {
  constructor(id, relayUrl) {
    this.id = id;
    this.relayUrl = relayUrl;
    this.ws = null;
    this.connected = false;
    this.sk = generateSecretKey();
    this.pk = getPublicKey(this.sk);
    this.pending = new Map(); // eventId -> startTime
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (config.dryRun) {
        this.connected = true;
        resolve();
        return;
      }

      this.ws = new WebSocket(this.relayUrl);

      this.ws.on('open', () => {
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          // ["OK", eventId, true, "saved"]
          if (Array.isArray(msg) && msg[0] === 'OK') {
            const eventId = msg[1];
            const accepted = msg[2];
            const reason = msg[3];

            if (this.pending.has(eventId)) {
              const start = this.pending.get(eventId);
              this.pending.delete(eventId);
              const latency = Date.now() - start;

              if (accepted) {
                metrics.success++;
                metrics.latencies.push(latency);
              } else {
                metrics.failed++;
                recordError(reason || 'rejected');
              }
            }
          }
        } catch (e) {
          recordError('json_parse_error');
        }
      });

      this.ws.on('error', (err) => {
        recordError('ws_error');
        // console.error(`Client ${this.id} error:`, err.message);
      });

      this.ws.on('close', () => {
        this.connected = false;
      });
    });
  }

  sendEvent(event) {
    if (config.dryRun) {
      metrics.success++;
      return;
    }

    if (!this.connected) return;

    // Sign event
    const signedEvent = finalizeEvent(event, this.sk);

    this.pending.set(signedEvent.id, Date.now());
    this.ws.send(JSON.stringify(['EVENT', signedEvent]));
    metrics.sent++;
  }

  close() {
    if (this.ws) {
      this.ws.terminate();
    }
  }
}

// Main Execution
async function run() {
  console.log(`Initializing ${config.clients} clients...`);
  const clients = [];

  // Create clients
  for (let i = 0; i < config.clients; i++) {
    clients.push(new LoadClient(i, config.relayUrl));
  }

  // Connect clients in batches to avoid OS limits/thundering herd
  const BATCH_SIZE = 50;
  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(c => c.connect().catch(e => recordError('connect_error'))));
    if (i % 500 === 0 && i > 0) console.log(`Connected ${i} clients...`);
  }
  console.log(`All ${config.clients} clients initialized.`);

  // Event Loop
  const intervalMs = 1000 / config.rateEps;
  const endTime = Date.now() + (config.durationSec * 1000);

  console.log(`Starting load test for ${config.durationSec} seconds at ${config.rateEps} EPS...`);

  const loop = setInterval(() => {
    if (Date.now() >= endTime) {
      clearInterval(loop);
      finish();
      return;
    }

    // Pick a random connected client
    const client = clients[Math.floor(Math.random() * clients.length)];
    if (!client || !client.connected) return;

    // Determine event type
    const rand = Math.random();
    let type = 'view';
    let cumulative = 0;
    for (const [t, r] of Object.entries(mix)) {
      cumulative += r;
      if (rand < cumulative) {
        type = t;
        break;
      }
    }

    // Build event
    let event;
    const now = Math.floor(Date.now() / 1000);

    if (type === 'video') {
      event = buildVideoPostEvent({
        pubkey: client.pk, // Will be overridden by finalizeEvent but good for builder
        created_at: now,
        dTagValue: `load-test-${client.id}-${Date.now()}`,
        content: {
          version: 3,
          title: `Load Test Video ${Date.now()}`,
          videoRootId: `load-test-${client.id}-${Date.now()}`,
          url: `https://example.com/video-${Date.now()}.mp4`,
          mode: 'dev'
        }
      });
    } else {
      // View event
      event = buildViewEvent({
        pubkey: client.pk,
        created_at: now,
        content: JSON.stringify({ eventId: 'test-event-id', duration: 10 }),
        includeSessionTag: true
      });
    }

    // Client signs and sends
    client.sendEvent(event);

  }, intervalMs);

  function finish() {
    console.log('Test finished. Closing clients...');
    clients.forEach(c => c.close());

    // Calculate stats
    const duration = (Date.now() - metrics.startTime) / 1000;
    metrics.latencies.sort((a, b) => a - b);

    const p50 = metrics.latencies[Math.floor(metrics.latencies.length * 0.5)] || 0;
    const p90 = metrics.latencies[Math.floor(metrics.latencies.length * 0.9)] || 0;
    const p95 = metrics.latencies[Math.floor(metrics.latencies.length * 0.95)] || 0;
    const p99 = metrics.latencies[Math.floor(metrics.latencies.length * 0.99)] || 0;

    const report = {
      config: { ...config, relayUrl: config.relayUrl.replace(/:\/\/[^@]+@/, '://***@') }, // Redact auth if present
      summary: {
        duration,
        totalSent: metrics.sent,
        totalSuccess: metrics.success,
        totalFailed: metrics.failed,
        throughputEps: metrics.success / duration,
        latency: { p50, p90, p95, p99 }
      },
      errors: metrics.errors
    };

    console.log('Report:', JSON.stringify(report, null, 2));

    // Save report
    const artifactsDir = join(process.cwd(), 'artifacts');
    // Ensure artifacts dir exists (mkdirSync recursive)
    mkdirSync(artifactsDir, { recursive: true });

    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `load-report-${dateStr}.json`;
    const filepath = join(artifactsDir, filename);

    writeFileSync(filepath, JSON.stringify(report, null, 2));
    console.log(`Saved report to ${filepath}`);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
