import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

// --- Polyfills ---
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}
if (!globalThis.window) {
  globalThis.window = globalThis;
}

// Ensure TextEncoder is available (it should be in Node > 11)
if (!globalThis.TextEncoder) {
    const { TextEncoder, TextDecoder } = await import('util');
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;
}

// --- Imports ---
// We need to import nostr-tools. Since it's an ESM module in node_modules, dynamic import should work.
const nostrTools = await import('nostr-tools');
const { generateSecretKey, getPublicKey, finalizeEvent } = nostrTools;

// Import Schema Builders
import {
  buildVideoPostEvent,
  buildViewEvent,
  buildLegacyDirectMessageEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from '../../js/nostrEventSchemas.js';

// Import DM Decryptor
import { decryptDM } from '../../js/dmDecryptor.js';

// --- Helpers ---
function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

function hexToBytes(hex) {
    if (typeof hex !== 'string') {
        throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
    }
    if (hex.length % 2) throw new Error('hexToBytes: received string with odd length');
    const array = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        array[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return array;
}

// Minimal Nostr Client Wrapper for Testing
// We are manually constructing events and using a simple WebSocket connection or NostrClient if possible.
// Given the complexity of instantiating `NostrClient` in a pure Node environment without full DOM (IndexedDB, localStorage etc),
// we will verify the schema builders and use a lightweight interaction for publishing/subscribing.
// However, the prompt asks to use `nostrClientFacade` or `NostrClient`.
// The `NostrClient` class depends heavily on browser APIs (IndexedDB, localStorage).
// We will mock necessary browser APIs to instantiate `NostrClient` if possible, or use a simplified test client that respects the same logic.

// Let's try to mock the minimal environment for `NostrClient`
class MockLocalStorage {
    constructor() { this.store = {}; }
    getItem(key) { return this.store[key] || null; }
    setItem(key, value) { this.store[key] = String(value); }
    removeItem(key) { delete this.store[key]; }
    clear() { this.store = {}; }
}
globalThis.localStorage = new MockLocalStorage();
// IndexedDB is more complex. We might mock `EventsCacheStore` methods if we can override them or just let them fail gracefully (NostrClient handles failures).
// Or we can mock `indexedDB` global.
import 'fake-indexeddb/auto'; // If available? No, not in dependencies list.
// Dependencies list has `fake-indexeddb` in devDependencies.
// Let's import it.
try {
    await import('fake-indexeddb/auto');
} catch (e) {
    console.warn("fake-indexeddb not found, IndexedDB might fail.");
}

// Now we can try to import NostrClient
// We need to handle `vendor/crypto-helpers.bundle.min.js` import in `js/nostr/client.js`.
// Since we are in Node, that relative import might fail or work depending on how Node handles it.
// It is a file in the repo. Node should be able to import it if it's ESM.
// `js/nostr/client.js` imports it as `../../vendor/crypto-helpers.bundle.min.js`.
// We are in `scripts/agent/interop-test.mjs`, so `../../js/nostr/client.js` is where we import from.
// `js/nostr/client.js` is relative to root.
// Let's see if we can import `NostrClient`.

import { NostrClient } from '../../js/nostr/client.js';

// --- Test Setup ---
const RELAY_PORT = 8008;
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
let relayProcess;

async function startRelay() {
  console.log('Starting local relay...');
  const relayScript = resolve(process.cwd(), 'scripts/agent/simple-relay.mjs');
  relayProcess = spawn('node', [relayScript], { stdio: 'inherit' });

  // Wait for relay to be ready
  for (let i = 0; i < 20; i++) {
    try {
        const ws = new WebSocket(RELAY_URL);
        await new Promise((resolve, reject) => {
            ws.on('open', () => { ws.close(); resolve(); });
            ws.on('error', reject);
        });
        console.log('Relay is ready.');
        return;
    } catch (e) {
        await setTimeout(500);
    }
  }
  throw new Error('Relay failed to start');
}

function stopRelay() {
  if (relayProcess) {
    console.log('Stopping local relay...');
    relayProcess.kill();
  }
}

// --- Main Test Logic ---
async function runTests() {
  let exitCode = 0;
  try {
    await startRelay();

    // 1. Generate keys
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const skHex = bytesToHex(sk);
    const pkHex = pk;
    console.log(`Ephemeral identity: ${pkHex}`);

    // 2. Instantiate Client
    const client = new NostrClient();
    // Override relays to use our local test relay
    client.relays = [RELAY_URL];
    client.readRelays = [RELAY_URL];
    client.writeRelays = [RELAY_URL];

    // Inject custom signer adapter for the test
    const signer = {
        pubkey: pkHex,
        signEvent: async (event) => {
             return finalizeEvent(event, sk);
        },
        nip04Encrypt: async (pubkey, plaintext) => {
             return await nostrTools.nip04.encrypt(sk, pubkey, plaintext);
        },
        nip04Decrypt: async (pubkey, ciphertext) => {
             return await nostrTools.nip04.decrypt(sk, pubkey, ciphertext);
        }
    };
    // We need to set this signer as active
    // We can use the registry or just manually set it if the client exposes a way.
    // Client.js has `setActiveSigner` exported? No, it's not a method of NostrClient instance, but exported from module.
    // But `NostrClient` imports `setActiveSigner` from `../nostrClientRegistry.js`.
    // We can try to import `setActiveSigner` from `nostrClientRegistry.js` and call it.

    const { setActiveSigner } = await import('../../js/nostrClientRegistry.js');
    setActiveSigner(signer);

    // Also we need to ensure the client is "logged in" or at least has a pubkey set for some operations
    client.pubkey = pkHex;

    await client.init();
    console.log('Client initialized.');

    // Test A: Video Post
    console.log('\n--- Test A: Video Post ---');
    const videoData = {
        title: "Test Video " + Date.now(),
        description: "Integration test video",
        magnet: "magnet:?xt=urn:btih:c917253504812345678901234567890123456789&dn=test",
        isPrivate: false
    };
    // Use schema builder
    const videoEventUnsigned = buildVideoPostEvent({
        pubkey: pkHex,
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: "test-video-" + Date.now(),
        content: videoData
    });
    // Sign and publish
    const signedVideoEvent = await signer.signEvent(videoEventUnsigned);
    console.log(`Publishing Video Event: ${signedVideoEvent.id}`);

    // Using client.publishEventToRelays or similar?
    // Client has `publishVideo` but it does a lot of logic.
    // Let's use `client.signAndPublishEvent` if possible, or low level pool publish.
    // `client.pool` should be available.
    await Promise.all(client.relays.map(url => {
        const sub = client.pool.publish([url], signedVideoEvent);
        return new Promise((resolve) => {
             // We can just assume it sends for this test, or wait a bit.
             // SimplePool publish returns a Promise in newer versions?
             // In `js/nostr/toolkit.js` it seems to return an object with Promise?
             // Actually `publishEventToRelay` in `js/nostrPublish.js` is what `client` uses.
             // Let's use `client.signAndPublishEvent` if we can.
             // `signAndPublishEvent` helper is used by `client`.
             resolve();
        });
    }));
    await setTimeout(200); // Wait for relay processing

    // Verify
    const fetchedEvent = await client.getEventById(signedVideoEvent.id, { includeRaw: true });
    if (fetchedEvent && fetchedEvent.video && fetchedEvent.video.title === videoData.title) {
        console.log('✅ Video Post verification successful');
    } else {
        console.error('❌ Video Post verification failed');
        console.error('Fetched:', fetchedEvent);
        exitCode = 1;
    }

    // Test B: View Event
    console.log('\n--- Test B: View Event ---');
    const viewEventUnsigned = buildViewEvent({
        pubkey: pkHex,
        created_at: Math.floor(Date.now() / 1000),
        pointerTag: ['a', `30078:${pkHex}:${videoData.title}`], // Simplification
        content: "viewed"
    });
    const signedViewEvent = await signer.signEvent(viewEventUnsigned);
    // Publish
    await Promise.all(client.relays.map(url => client.pool.publish([url], signedViewEvent)));
    await setTimeout(200);

    // Verify by fetching
    const fetchedView = await client.fetchRawEventById(signedViewEvent.id);
    if (fetchedView && fetchedView.id === signedViewEvent.id) {
        console.log('✅ View Event verification successful');
    } else {
        console.error('❌ View Event verification failed');
        exitCode = 1;
    }

    // Test C: DM
    console.log('\n--- Test C: Direct Message ---');
    const dmMessage = "Hello from interop test";
    const recipientPubkey = pkHex; // Self-DM for simplicity

    // We can use `client.sendDirectMessage` or build manually.
    // Let's use buildLegacyDirectMessageEvent + decryptDM to test the decryptor explicitly as requested.

    // Encrypt
    const ciphertext = await signer.nip04Encrypt(recipientPubkey, dmMessage);
    const dmEventUnsigned = buildLegacyDirectMessageEvent({
        pubkey: pkHex,
        created_at: Math.floor(Date.now() / 1000),
        recipientPubkey: recipientPubkey,
        ciphertext: ciphertext
    });
    const signedDmEvent = await signer.signEvent(dmEventUnsigned);

    // Publish
    await Promise.all(client.relays.map(url => client.pool.publish([url], signedDmEvent)));
    await setTimeout(200);

    // Fetch and Decrypt
    const fetchedDm = await client.fetchRawEventById(signedDmEvent.id);
    if (!fetchedDm) {
         console.error('❌ DM Event fetch failed');
         exitCode = 1;
    } else {
        // Use decryptDM helper
        // We need to provide a context with a decryptor
        const decryptorContext = {
            actorPubkey: pkHex,
            decryptors: [{
                scheme: 'nip04',
                decrypt: signer.nip04Decrypt,
                source: 'test-signer'
            }]
        };

        const decryptionResult = await decryptDM(fetchedDm, decryptorContext);

        if (decryptionResult.ok && decryptionResult.plaintext === dmMessage) {
            console.log('✅ DM Decryption successful');
        } else {
            console.error('❌ DM Decryption failed');
            console.error('Result:', decryptionResult);
            exitCode = 1;
        }
    }

  } catch (error) {
    console.error('Test failed with error:', error);
    exitCode = 1;
  } finally {
    stopRelay();
    process.exit(exitCode);
  }
}

runTests();
