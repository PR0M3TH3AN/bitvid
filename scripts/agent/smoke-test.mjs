import './setup-test-env.js';
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { WebSocket } from 'ws';
import * as NostrTools from 'nostr-tools';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';

// --- Polyfills ---
if (!global.indexedDB) {
  global.indexedDB = indexedDB;
}
if (!global.IDBKeyRange) {
  global.IDBKeyRange = IDBKeyRange;
}
if (!global.NostrTools) {
  global.NostrTools = NostrTools;
}
// setup-test-env.js handles WebSocket, crypto, localStorage, window, self, navigator

// --- Imports from Codebase ---
// Note: We need to use relative paths from scripts/agent/
import { NostrClient } from '../../js/nostr/client.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import { startRelay } from './load-test-relay.mjs';

// --- Configuration ---
const ARTIFACTS_DIR = 'artifacts';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const RELAY_PORT = 8890;
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
const HTTP_PORT = 8000;
const HTTP_URL = `http://localhost:${HTTP_PORT}`;

// --- Logging ---
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
const logFile = path.join(ARTIFACTS_DIR, `smoke-${dateStr}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function log(msg, ...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${msg} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  console.log(message);
  logStream.write(message + '\n');
}

function error(msg, ...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [ERROR] ${msg} ${args.map(a => (a instanceof Error ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : a))).join(' ')}`;
  console.error(message);
  logStream.write(message + '\n');
}

// --- Helpers ---
async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// --- Main Test Flow ---
async function run() {
  let relayServer = null;
  let httpServer = null;
  let client = null;
  let success = true;

  try {
    log('--- Starting Smoke Test ---');

    // 1. Start Relay
    log(`Starting local relay on port ${RELAY_PORT}...`);
    relayServer = startRelay(RELAY_PORT);
    // Wait a bit for relay to be ready (startRelay is synchronous in setup but async in effect?)
    // It uses WebSocketServer which starts immediately.
    await new Promise(r => setTimeout(r, 500));
    log('Relay started.');

    // 2. Start HTTP Server
    log(`Starting HTTP server (npx serve) on port ${HTTP_PORT}...`);
    httpServer = spawn('npx', ['serve', '-p', String(HTTP_PORT)], {
      stdio: 'ignore', // or 'inherit' to see output
      detached: false
    });

    const serverReady = await waitForServer(HTTP_URL);
    if (!serverReady) {
      throw new Error(`HTTP server did not start on ${HTTP_URL} within timeout.`);
    }
    log('HTTP server is ready.');

    // 3. Init NostrClient
    log('Initializing NostrClient...');
    client = new NostrClient();
    client.relays = [RELAY_URL];
    client.readRelays = [RELAY_URL];
    client.writeRelays = [RELAY_URL];

    // Override dev logger to avoid pollution if needed, or let it log
    // We can rely on standard logging.

    await client.init();
    log(`NostrClient initialized and connected to ${RELAY_URL}`);

    // 4. Login (Ephemeral)
    log('Generating ephemeral keys for Sender...');
    const senderSk = NostrTools.generateSecretKey();
    const senderSkHex = Buffer.from(senderSk).toString('hex');
    const senderPk = NostrTools.getPublicKey(senderSk);

    log(`Sender Pubkey: ${senderPk}`);

    await client.registerPrivateKeySigner({ privateKey: senderSkHex, persist: false });
    client.pubkey = senderPk; // Manually set logged-in user

    if (client.pubkey !== senderPk) {
        throw new Error(`Client pubkey mismatch. Expected ${senderPk}, got ${client.pubkey}`);
    }
    log('Sender logged in.');

    // 5. Publish Video
    log('Publishing test video...');
    const videoPayload = {
        title: `Smoke Test Video ${Date.now()}`,
        description: 'Smoke test description',
        magnet: `magnet:?xt=urn:btih:${Math.random().toString(16).slice(2)}`,
        url: `${HTTP_URL}/test.mp4`, // Fake URL
        thumbnail: `${HTTP_URL}/thumb.jpg`,
        mode: 'live',
        videoRootId: `smoke-${Date.now()}`,
        isNsfw: false,
        isForKids: true
    };

    const publishedEvent = await client.publishVideo(videoPayload, senderPk);
    if (!publishedEvent || !publishedEvent.id) {
        throw new Error('Failed to publish video event.');
    }
    log(`Video published. Event ID: ${publishedEvent.id}`);

    // Verify Read Back
    log('Verifying video can be fetched...');
    // We use subscribeVideos for main feed, or getEventById.
    // Let's use getEventById for direct verification.
    const fetched = await client.getEventById(publishedEvent.id);
    if (!fetched) {
        throw new Error('Failed to fetch published video.');
    }
    if (fetched.title !== videoPayload.title) {
        throw new Error(`Fetched video title mismatch. Expected "${videoPayload.title}", got "${fetched.title}"`);
    }
    log('Video fetched successfully.');

    // 6. DM Flow
    log('Testing DM Flow...');
    const recipientSk = NostrTools.generateSecretKey();
    const recipientSkHex = Buffer.from(recipientSk).toString('hex');
    const recipientPk = NostrTools.getPublicKey(recipientSk);
    const recipientNpub = NostrTools.nip19.npubEncode(recipientPk);

    log(`Recipient Pubkey: ${recipientPk}`);

    const dmMessage = `Smoke Test Message ${Date.now()}`;

    // Send DM
    const sendResult = await client.sendDirectMessage(recipientNpub, dmMessage);
    if (!sendResult.ok) {
        throw new Error(`Failed to send DM: ${sendResult.error}`);
    }
    log('DM sent successfully.');

    // Verify Decryption (Simulate Recipient)
    log('Verifying DM decryption (Recipient view)...');

    // We need to find the DM event.
    // Since we don't have a second client syncing, we can manually query the pool/relay.
    const filter = {
        kinds: [4, 1059], // 4 for legacy, 1059 for NIP-17
        '#p': [recipientPk],
        limit: 1
    };

    // wait a moment for propagation
    await new Promise(r => setTimeout(r, 200));

    const events = await client.pool.list([RELAY_URL], [filter]);
    if (events.length === 0) {
        throw new Error('Recipient could not find DM event on relay.');
    }

    const dmEvent = events[0];
    log(`Found DM event kind ${dmEvent.kind} id ${dmEvent.id}`);

    // Construct decryption context for decryptDM
    // We need a decryptor for the recipient.
    // Since we have the recipient's private key, we can use NostrTools.nip04 or nip44.

    const decryptors = [];

    // NIP-04 Decryptor
    decryptors.push({
        scheme: 'nip04',
        decrypt: async (remotePubkey, ciphertext) => {
            return await NostrTools.nip04.decrypt(recipientSkHex, remotePubkey, ciphertext);
        }
    });

    // NIP-44 Decryptor
    decryptors.push({
        scheme: 'nip44',
        supportsGiftWrap: true,
        decrypt: (remotePubkey, ciphertext) => {
             const conversationKey = NostrTools.nip44.v2.utils.getConversationKey(recipientSk, remotePubkey);
             return NostrTools.nip44.v2.decrypt(ciphertext, conversationKey);
        }
    });

    const context = {
        actorPubkey: recipientPk,
        decryptors
    };

    const decryptResult = await decryptDM(dmEvent, context);

    if (!decryptResult.ok) {
        throw new Error(`DM decryption failed: ${JSON.stringify(decryptResult.errors)}`);
    }

    if (decryptResult.plaintext !== dmMessage) {
        throw new Error(`DM plaintext mismatch. Expected "${dmMessage}", got "${decryptResult.plaintext}"`);
    }

    log('DM verified successfully.');

  } catch (err) {
    success = false;
    error('Smoke Test Failed!', err);
  } finally {
    // Report
    const summary = {
        timestamp: new Date().toISOString(),
        success,
        logFile
    };
    const summaryFile = path.join(ARTIFACTS_DIR, `smoke-summary-${dateStr}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    log(`Summary saved to ${summaryFile}`);

    // Teardown
    log('Teardown...');
    if (client) {
        // client.logout(); // Cleans up
        // Close pool connections?
        // client.pool.close(client.relays); // SimplePool doesn't have explicit close usually?
        // NostrTools SimplePool usually manages connections.
        // We can just rely on process exit.
    }

    if (relayServer) {
        relayServer.close();
        log('Relay stopped.');
    }

    if (httpServer) {
        httpServer.kill();
        log('HTTP server stopped.');
    }

    log('Done.');
    process.exit(success ? 0 : 1);
  }
}

run();
