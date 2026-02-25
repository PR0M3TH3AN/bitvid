import { Relay, useWebSocketImplementation } from 'nostr-tools/relay';
import { generateSecretKey, finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getArg = (key) => {
  const idx = ARGS.findIndex(a => a.startsWith(`--${key}=`));
  if (idx !== -1) return ARGS[idx].split('=')[1];
  const flagIdx = ARGS.indexOf(`--${key}`);
  if (flagIdx !== -1 && ARGS[flagIdx + 1] && !ARGS[flagIdx + 1].startsWith('--')) return ARGS[flagIdx + 1];
  return null;
};
const RELAYS = (getArg('relays') || process.env.RELAY_URLS || '').split(',').filter(Boolean);
const SERVE_CMD = getArg('serve') || 'npx';
const OUT_DIR = getArg('out') || 'artifacts';

// --- Logging ---
const LOG_FILE = path.join(OUT_DIR, `smoke-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const JSON_FILE = path.join(OUT_DIR, `smoke-${new Date().toISOString().split('T')[0]}.json`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// --- Helpers ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_e) {
      // ignore
    }
    await sleep(500);
  }
  return false;
}

// --- Main ---
async function main() {
  log('Starting Smoke Test Agent...');
  log(`Config: RELAYS=${RELAYS.join(',')}, SERVE=${SERVE_CMD}, OUT=${OUT_DIR}`);

  if (RELAYS.length === 0) {
    log('ERROR: No relays specified. Use --relays or RELAY_URLS.');
    process.exit(1);
  }

  const results = {
    timestamp: new Date().toISOString(),
    steps: [],
    success: false
  };

  let serverProcess = null;

  try {
    // 1. Start Server
    if (SERVE_CMD !== 'none') {
      log('Step 1: Starting local server...');
      const port = 8000;
      if (SERVE_CMD === 'npx') {
        serverProcess = spawn('npx', ['serve', 'dist', '-p', String(port)], { stdio: 'ignore', shell: true });
      } else if (SERVE_CMD === 'python') {
        serverProcess = spawn('python3', ['-m', 'http.server', String(port), '-d', 'dist'], { stdio: 'ignore', shell: true });
      }

      const serverUrl = `http://localhost:${port}`;
      log(`Waiting for server at ${serverUrl}...`);
      const ready = await waitForServer(serverUrl);
      if (!ready) {
        throw new Error('Server failed to start within timeout');
      }
      log('Server is ready.');
      results.steps.push({ name: 'start-server', status: 'ok', details: `Started ${SERVE_CMD} on port ${port}` });
    } else {
      log('Step 1: Skipping server start (none selected).');
      results.steps.push({ name: 'start-server', status: 'skipped' });
    }

    // 2. Connect to Relay
    log(`Step 2: Connecting to relay ${RELAYS[0]}...`);
    const relay = await Relay.connect(RELAYS[0]);
    log(`Connected to ${RELAYS[0]}`);
    results.steps.push({ name: 'connect-relay', status: 'ok', details: RELAYS[0] });

    // 3. Generate Identity
    log('Step 3: Generating ephemeral identity...');
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    log(`Pubkey: ${pk}`);
    results.steps.push({ name: 'generate-identity', status: 'ok', details: pk });

    // 4. Publish Event
    log('Step 4: Publishing smoke test event...');
    const eventTemplate = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', 'smoke-test']],
      content: `Smoke test run at ${new Date().toISOString()}`,
    };
    const event = finalizeEvent(eventTemplate, sk);
    await relay.publish(event);
    log(`Published event: ${event.id}`);
    results.steps.push({ name: 'publish-event', status: 'ok', details: event.id });

    // 5. Verify Event
    log('Step 5: Verifying event read-back...');
    const sub = relay.subscribe([
      { ids: [event.id] },
    ], {
      onevent(evt) {
        log(`Received event: ${evt.id}`);
        if (evt.id === event.id) {
          log('Verification SUCCESS: Event ID matches.');
          results.steps.push({ name: 'verify-event', status: 'ok', details: 'Event retrieved and matched' });
          sub.close();
        }
      },
      oneose() {
        sub.close();
      }
    });

    // Wait for event
    let attempts = 0;
    let verified = false;
    while (attempts < 10) {
      await sleep(1000);
      const found = results.steps.find(s => s.name === 'verify-event');
      if (found) {
        verified = true;
        break;
      }
      attempts++;
    }

    if (!verified) {
      throw new Error('Verification failed: Event not received within timeout.');
    }

    results.success = true;
    relay.close();

  } catch (err) {
    log(`ERROR: ${err.message}`);
    results.error = err.message;
    results.success = false;
    process.exitCode = 1;
  } finally {
    if (serverProcess) {
      log('Stopping server...');
      serverProcess.kill();
    }
    fs.writeFileSync(JSON_FILE, JSON.stringify(results, null, 2));
    log(`Artifacts written to ${OUT_DIR}`);
  }
}

main();
