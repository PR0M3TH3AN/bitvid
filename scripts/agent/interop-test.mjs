import WebSocket from 'ws';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { NostrClient } from '../../js/nostr/client.js';
import { buildVideoPostEvent, buildViewEvent } from '../../js/nostrEventSchemas.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

// --- Polyfills for Node.js environment ---
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(String(k)) || null,
    setItem: (k, v) => storage.set(String(k), String(v)),
    removeItem: (k) => storage.delete(String(k)),
    clear: () => storage.clear(),
    key: (i) => Array.from(storage.keys())[i] || null,
    get length() { return storage.size; }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
  globalThis.window.localStorage = globalThis.localStorage;
  // Mock runtime overrides for schemas
  globalThis.window.bitvidNostrEventOverrides = {};
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node' };
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({}),
    body: {},
    head: {}
  };
}

// --- CLI Argument Parsing ---
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    relays: [],
    burst: 3,
    timeout: 30, // seconds
    out: `artifacts/interop-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`,
    confirmPublic: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--relays=')) {
      config.relays = arg.split('=')[1].split(',').filter(Boolean);
    } else if (arg === '--relays' && args[i+1]) {
      config.relays = args[i+1].split(',').filter(Boolean);
      i++;
    } else if (arg.startsWith('--burst=')) {
      config.burst = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--timeout=')) {
      config.timeout = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--out=')) {
      config.out = arg.split('=')[1];
    } else if (arg === '--confirm-public') {
      config.confirmPublic = true;
    }
  }

  // Environment variable fallback
  if (config.relays.length === 0 && process.env.RELAY_URLS) {
    config.relays = process.env.RELAY_URLS.split(',').filter(Boolean);
  }

  return config;
}

// --- Logging & Artifacts ---
const logs = [];
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(entry);
  if (data) {
    // console.dir(data, { depth: null, colors: true });
  }
  logs.push({ timestamp, level, message, data });
}

function saveArtifacts(config, results) {
  const artifactDir = path.dirname(config.out);
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // Save JSON summary
  const summary = {
    timestamp: new Date().toISOString(),
    config: { ...config, relays: config.relays },
    results,
    logs
  };
  fs.writeFileSync(config.out, JSON.stringify(summary, null, 2));
  log('info', `Artifacts saved to ${config.out}`);

  // Save human-readable log
  const logPath = config.out.replace('.json', '.log');
  const logContent = logs.map(l => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}`).join('\n');
  fs.writeFileSync(logPath, logContent);
  log('info', `Log saved to ${logPath}`);
}

// --- Helper: Start Local Relay ---
async function startLocalRelay() {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const relayScript = path.resolve(scriptDir, 'simple-relay.mjs');
    const port = 8899;

    log('info', `Starting local relay on port ${port}...`);
    const relayProcess = spawn('node', [relayScript], {
        env: { ...process.env, PORT: port.toString() },
        stdio: 'ignore', // 'inherit' for debug
        detached: false
    });

    // Allow relay to boot
    await new Promise(r => setTimeout(r, 2000));
    return { process: relayProcess, url: `ws://localhost:${port}` };
}


// --- Main Test Logic ---
async function runTests() {
  const config = parseArgs();
  const results = {
    videoPost: { status: 'pending' },
    viewEvent: { status: 'pending' },
    dm: { status: 'pending' }
  };

  let relayProcess = null;

  try {
    // 1. Setup Relays
    if (config.relays.length === 0) {
      log('info', 'No relays specified. Starting local test relay...');
      const local = await startLocalRelay();
      relayProcess = local.process;
      config.relays = [local.url];
    } else {
      log('info', `Using configured relays: ${config.relays.join(', ')}`);
      // Security check for public relays
      const isPublic = config.relays.some(r => !r.includes('localhost') && !r.includes('127.0.0.1'));
      if (isPublic && !config.confirmPublic) {
        throw new Error('Public relays detected. You must use --confirm-public to run tests against public relays.');
      }
    }

    // 2. Setup Clients (Alice & Bob)
    log('info', 'Initializing clients...');

    // Helper to setup a client with ephemeral keys
    const setupClient = async (name) => {
      const client = new NostrClient();
      client.relays = [...config.relays];
      client.writeRelays = [...config.relays];
      client.readRelays = [...config.relays];

      const sk = generateSecretKey();
      const skHex = Buffer.from(sk).toString('hex');
      const pk = getPublicKey(sk);
      const npub = nip19.npubEncode(pk);

      // We manually initialize internal managers since we are in Node
      await client.ensurePool();
      await client.connectToRelays();
      const signer = await client.registerPrivateKeySigner({ privateKey: skHex, pubkey: pk });

      log('info', `${name} initialized`, { pubkey: pk, npub });
      return { client, sk, skHex, pk, npub, signer };
    };

    const alice = await setupClient('Alice');
    const bob = await setupClient('Bob');

    // --- Test 1: Video Post Roundtrip ---
    log('info', '--- Test 1: Video Post Roundtrip ---');
    try {
      const videoEvent = buildVideoPostEvent({
        pubkey: alice.pk,
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: `interop-test-${Date.now()}`,
        content: {
          version: 3,
          title: 'Interop Test Video',
          videoRootId: `root-${Date.now()}`,
          description: 'A test video for interoperability',
          url: 'https://example.com/video.mp4',
          mode: 'dev'
        }
      });

      const { signedEvent } = await alice.client.signAndPublishEvent(videoEvent);
      log('info', 'Video published', { id: signedEvent.id });
      results.videoPost.publishedId = signedEvent.id;

      // Wait for propagation
      await new Promise(r => setTimeout(r, 500));

      // Fetch back
      const fetched = await alice.client.getEventById(signedEvent.id);
      if (!fetched) {
        throw new Error('Failed to fetch published video event');
      }

      // Validation
      if (fetched.title !== 'Interop Test Video') {
        throw new Error(`Content mismatch: expected 'Interop Test Video', got '${fetched.title}'`);
      }

      results.videoPost.status = 'pass';
      log('info', 'Video Post verified successfully');
    } catch (e) {
      log('error', 'Video Post test failed', e);
      results.videoPost.status = 'fail';
      results.videoPost.error = e.message;
    }

    // --- Test 2: View Event ---
    if (results.videoPost.status === 'pass') {
      log('info', '--- Test 2: View Event ---');
      try {
        const viewEvent = buildViewEvent({
          pubkey: alice.pk,
          created_at: Math.floor(Date.now() / 1000),
          pointerValue: results.videoPost.publishedId,
          content: 'test view'
        });

        const { signedEvent } = await alice.client.signAndPublishEvent(viewEvent);
        log('info', 'View event published', { id: signedEvent.id });

        // Wait for propagation
        await new Promise(r => setTimeout(r, 500));

        // Verify reception
        // Since View Events (Kind 30078/10003?) wait, View Event is Kind 30078 with t=view?
        // Let's check schema. KIND_WATCH_HISTORY = 30078 (wait, that's video post kind usually, but schema says WATCH_HISTORY_KIND).
        // Actually viewEvent is KIND_WATCH_HISTORY (30078) with specific tags.
        // Let's check `getNostrEventSchema(NOTE_TYPES.VIEW_EVENT)`.
        // It says kind: WATCH_HISTORY_KIND (imported from config).
        // But usually view events are just data events.

        // Anyway, let's fetch it back by ID to confirm.
        const fetchedView = await alice.client.getEventById(signedEvent.id);
        if (!fetchedView) {
             throw new Error('Failed to fetch published view event');
        }

        results.viewEvent.publishedId = signedEvent.id;
        results.viewEvent.status = 'pass';
        log('info', 'View Event verified successfully');
      } catch (e) {
        log('error', 'View Event test failed', e);
        results.viewEvent.status = 'fail';
        results.viewEvent.error = e.message;
      }
    } else {
      log('warn', 'Skipping View Event test due to Video Post failure');
      results.viewEvent.status = 'skipped';
    }

    // --- Test 3: DM Roundtrip (NIP-04/17) ---
    log('info', '--- Test 3: DM Roundtrip ---');
    try {
      const message = `Secret message ${Date.now()}`;

      // Sending from Alice to Bob
      // Note: sendDirectMessage automatically chooses NIP-04 or NIP-17 based on options.
      // We will try default (NIP-04 usually, unless attachments present).
      // The prompt asks for "DM encrypt/decrypt roundtrip using js/dmDecryptor.js".

      // Explicitly pass signingAdapter to avoid global registry lookup issues in test harness
      const sendResult = await alice.client.sendDirectMessage(bob.npub, message, null, {
          useNip17: false,
          signingAdapter: alice.signer
      });

      if (!sendResult.ok) {
        throw new Error(`Send failed: ${sendResult.error}`);
      }
      log('info', 'DM sent (NIP-04)', { message });

      // Wait for propagation
      await new Promise(r => setTimeout(r, 2000));

      // Receiving
      // We fetch the DM event as Bob.
      // We need to list messages.
      // Note: listDirectMessages does a whole workflow. We want to test `decryptDM` specifically.
      // So we will manually fetch the event using pool.list and then pass it to decryptDM.

      const filters = [{
          kinds: [4], // NIP-04
          '#p': [bob.pk],
          authors: [alice.pk],
          limit: 1
      }];

      const events = await bob.client.pool.list(bob.client.readRelays, filters);
      const dmEvent = events.find(e => e.kind === 4);

      if (!dmEvent) {
          throw new Error('Bob could not find the DM event on relay');
      }

      log('info', 'DM Event fetched', { id: dmEvent.id });

      // Decrypt using js/dmDecryptor.js
      // We need a decrypt context for Bob.
      const context = await bob.client.buildDmDecryptContext(bob.pk);

      const result = await decryptDM(dmEvent, context);

      if (!result.ok) {
          throw new Error(`Decryption failed: ${result.errors?.[0]?.error?.message || 'Unknown error'}`);
      }

      if (result.plaintext !== message) {
          throw new Error(`Content mismatch. Expected '${message}', got '${result.plaintext}'`);
      }

      log('info', 'DM decrypted successfully via decryptDM', { plaintext: result.plaintext });
      results.dm.status = 'pass';
    } catch (e) {
      log('error', 'DM test failed', e);
      results.dm.status = 'fail';
      results.dm.error = e.message;
    }

  } catch (error) {
    log('error', 'Fatal error in test runner', error);
  } finally {
    if (relayProcess) {
      log('info', 'Closing local relay...');
      relayProcess.kill();
    }

    // Force close clients
    // (There isn't a clean close method exposed on NostrClient that closes the pool,
    // but we can exit process)

    saveArtifacts(config, results);

    const hasFailure = Object.values(results).some(r => r.status === 'fail');
    if (hasFailure) {
      log('error', 'Some tests failed.');
      process.exit(1);
    } else {
      log('info', 'All tests passed.');
      process.exit(0);
    }
  }
}

runTests();
