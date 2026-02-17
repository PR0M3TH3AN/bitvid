import WebSocket from 'ws';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { startRelay } from './simple-relay.mjs';
import { NostrClient } from '../../js/nostr/client.js';
import { buildVideoPostEvent, buildViewEvent } from '../../js/nostrEventSchemas.js';
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
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node' };
}
if (typeof globalThis.document === 'undefined') {
  // Minimal document mock for some utility checks
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
    out: `artifacts/interop-${new Date().toISOString().split('T')[0]}.json`,
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
    console.dir(data, { depth: null, colors: true });
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
    config: { ...config, relays: config.relays }, // include actual used relays
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

// --- Main Test Logic ---
async function runTests() {
  const config = parseArgs();
  const results = {
    videoPost: { status: 'pending' },
    viewEvent: { status: 'pending' },
    dm: { status: 'pending' }
  };

  let relayServer = null;

  try {
    // 1. Setup Relays
    if (config.relays.length === 0) {
      log('info', 'No relays specified. Starting local test relay...');
      const port = 8899;
      relayServer = startRelay(port);
      config.relays = [`ws://localhost:${port}`];
      log('info', `Local relay started at ws://localhost:${port}`);
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

      await client.ensurePool();
      await client.connectToRelays();
      await client.registerPrivateKeySigner({ privateKey: skHex, pubkey: pk });

      log('info', `${name} initialized`, { pubkey: pk, npub });
      return { client, sk, skHex, pk, npub };
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
        results.viewEvent.publishedId = signedEvent.id;
        results.viewEvent.status = 'pass';
        log('info', 'View Event verified successfully (publish only)');
      } catch (e) {
        log('error', 'View Event test failed', e);
        results.viewEvent.status = 'fail';
        results.viewEvent.error = e.message;
      }
    } else {
      log('warn', 'Skipping View Event test due to Video Post failure');
      results.viewEvent.status = 'skipped';
    }

    // --- Test 3: DM Roundtrip (NIP-04) ---
    log('info', '--- Test 3: DM Roundtrip (NIP-04) ---');
    try {
      const message = `Secret message ${Date.now()}`;

      // Sending
      const sendResult = await alice.client.sendDirectMessage(bob.npub, message, null, { useNip17: false });
      if (!sendResult.ok) {
        throw new Error(`Send failed: ${sendResult.error}`);
      }
      log('info', 'DM sent', { message });

      // Wait for propagation
      await new Promise(r => setTimeout(r, 1000));

      // Receiving
      // We need to fetch messages for Bob.
      // NostrClient.listDirectMessages usually assumes the active user is the one fetching.
      // We can use bob.client.listDirectMessages() since bob.client has Bob's signer active.
      // Note: listDirectMessages filters by 'authors' or 'p' tags relative to 'actorPubkey'.

      // Force Bob's client to see Bob as the actor
      const dms = await bob.client.listDirectMessages(bob.pk, { limit: 10 });
      const received = dms.find(m => m.plaintext === message);

      if (!received) {
        log('debug', 'Received DMs', dms.map(m => m.plaintext));
        throw new Error('Bob did not receive/decrypt the DM');
      }

      log('info', 'DM received and decrypted', { plaintext: received.plaintext });
      results.dm.status = 'pass';
    } catch (e) {
      log('error', 'DM test failed', e);
      results.dm.status = 'fail';
      results.dm.error = e.message;
    }

  } catch (error) {
    log('error', 'Fatal error in test runner', error);
  } finally {
    if (relayServer) {
      log('info', 'Closing local relay...');
      relayServer.close();
    }

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
