import { JSDOM } from 'jsdom';
import * as crypto from 'node:crypto';
import { WebSocket } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import * as NostrTools from 'nostr-tools';
import 'fake-indexeddb/auto';

// Polyfills for Node.js environment
const dom = new JSDOM('', { url: 'http://localhost' });
global.window = dom.window;
global.document = dom.window.document;
// Node 21+ has global.navigator which is read-only
if (!global.navigator) {
    global.navigator = dom.window.navigator;
}
global.self = global.window;

// localStorage Mock
global.localStorage = {
  _data: {},
  getItem: function(k) { return this._data[k] || null; },
  setItem: function(k, v) { this._data[k] = String(v); },
  removeItem: function(k) { delete this._data[k]; },
  clear: function() { this._data = {}; }
};

// WebSocket
global.WebSocket = WebSocket;

// Crypto
// Node.js crypto matches Web Crypto API in recent versions (v19+) via globalThis.crypto
// But we explicitly set it to ensure compatibility
if (!global.crypto) {
    global.crypto = crypto.webcrypto || crypto;
}

// TextEncoder/Decoder
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// NostrTools
// The application expects NostrTools in the global scope for some operations
global.NostrTools = NostrTools;
global.window.NostrTools = NostrTools;

// Inject NostrTools into window for ensureNostrTools to find
dom.window.NostrTools = NostrTools;


// Import Application Modules
// Dynamic import to ensure globals are set before modules load
const { NostrClient } = await import('../../js/nostr/client.js');
const { decryptDM } = await import('../../js/dmDecryptor.js');

// Configuration
const RELAY_PORT = 3334; // Use a different port than default to avoid conflicts
const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`;
const ARTIFACTS_DIR = 'artifacts';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${TIMESTAMP}.log`);
const REPORT_FILE = path.join(ARTIFACTS_DIR, `smoke-report-${TIMESTAMP}.json`);

// Logger
function log(message, type = 'INFO') {
    const msg = `[${new Date().toISOString()}] [${type}] ${message}`;
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

// Ensure artifacts dir exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR);
}

// Test State
let relayProcess = null;
const stats = {
    steps: 0,
    failures: 0,
    details: []
};

function recordStep(name, success, error = null) {
    stats.steps++;
    const detail = { name, success, timestamp: new Date().toISOString() };
    if (!success) {
        stats.failures++;
        detail.error = error?.message || String(error);
        log(`Step Failed: ${name} - ${detail.error}`, 'ERROR');
        if (error?.stack) {
            log(error.stack, 'ERROR');
        }
    } else {
        log(`Step Passed: ${name}`, 'SUCCESS');
    }
    stats.details.push(detail);
}

async function startRelay() {
    log('Starting local relay...');
    const relayScript = path.resolve('scripts/agent/simple-relay.mjs');

    return new Promise((resolve, reject) => {
        relayProcess = spawn('node', [relayScript], {
            env: { ...process.env, PORT: String(RELAY_PORT) },
            stdio: 'pipe' // Capture output
        });

        relayProcess.stdout.on('data', (data) => {
            // log(`Relay: ${data.toString().trim()}`, 'DEBUG');
            if (data.toString().includes(`running on port ${RELAY_PORT}`)) {
                resolve();
            }
        });

        relayProcess.stderr.on('data', (data) => {
            log(`Relay Error: ${data.toString()}`, 'ERROR');
        });

        relayProcess.on('error', (err) => {
            reject(err);
        });

        // Timeout fallback
        setTimeout(() => {
            if (relayProcess.exitCode === null) {
                // Assume started if not exited after 2s and no output confirmed yet (fallback)
                resolve();
            } else {
                reject(new Error(`Relay process exited with code ${relayProcess.exitCode}`));
            }
        }, 3000);
    });
}

async function runTest() {
    try {
        await startRelay();
        log(`Relay started at ${RELAY_URL}`);

        // --- 1. Client Initialization & Connection ---
        log('Initializing NostrClient...');
        const client = new NostrClient();

        // Override relays
        client.relays = [RELAY_URL];
        client.readRelays = [RELAY_URL];
        client.writeRelays = [RELAY_URL];

        // Init connection
        try {
            await client.init();
            recordStep('Client Init & Relay Connection', true);
        } catch (e) {
            recordStep('Client Init & Relay Connection', false, e);
            throw e; // Critical failure
        }

        // --- 2. Identity Setup (Ephemeral) ---
        log('Generating ephemeral keys...');
        const sk1 = NostrTools.generateSecretKey();
        const pk1 = NostrTools.getPublicKey(sk1);
        const hexSk1 = NostrTools.utils.bytesToHex(sk1);

        const sk2 = NostrTools.generateSecretKey();
        const pk2 = NostrTools.getPublicKey(sk2);
        const hexSk2 = NostrTools.utils.bytesToHex(sk2);

        log(`Alice: ${pk1}`);
        log(`Bob: ${pk2}`);

        try {
            // Login as Alice
            await client.registerPrivateKeySigner({ privateKey: hexSk1, pubkey: pk1 });
            // For nsec login, client.pubkey is not set, but sessionActor is.
            if (client.sessionActor.pubkey !== pk1) throw new Error('Session actor pubkey mismatch');
            recordStep('Login (Alice)', true);
        } catch (e) {
            recordStep('Login (Alice)', false, e);
            throw e;
        }

        // --- 3. Publish Video ---
        log('Alice publishing video...');
        const videoPayload = {
            title: 'Smoke Test Video',
            description: 'This is a test video',
            url: 'https://example.com/video.mp4',
            thumbnail: 'https://example.com/thumb.jpg',
            mode: 'live'
        };

        let publishedEventId = null;
        try {
            const event = await client.publishVideo(videoPayload, pk1);
            if (!event || !event.id) throw new Error('Publish returned invalid event');
            publishedEventId = event.id;
            recordStep('Publish Video', true);
            log(`Published Video ID: ${publishedEventId}`);
        } catch (e) {
            recordStep('Publish Video', false, e);
            throw e;
        }

        // --- 4. Verify Publish (Read back) ---
        log('Verifying published video...');
        // Wait a bit for relay to index/propagate
        await new Promise(r => setTimeout(r, 500));

        try {
            // Fetch by ID
            const fetched = await client.getEventById(publishedEventId);
            if (!fetched) throw new Error('Event not found on relay');
            if (fetched.title !== videoPayload.title) throw new Error('Fetched event content mismatch');
            recordStep('Verify Video Publish', true);
        } catch (e) {
            recordStep('Verify Video Publish', false, e);
        }

        // --- 5. Send DM ---
        log('Alice sending DM to Bob...');
        const message = "Hello Bob, this is a smoke test.";
        try {
            // Bob's npub
            const bobNpub = NostrTools.nip19.npubEncode(pk2);
            const result = await client.sendDirectMessage(bobNpub, message);
            if (!result.ok) throw new Error(`DM send failed: ${result.error}`);
            recordStep('Send DM', true);
        } catch (e) {
            recordStep('Send DM', false, e);
            throw e;
        }

        // --- 6. Decrypt DM (Bob) ---
        log('Bob receiving and decrypting DM...');

        // We need to simulate Bob receiving the message.
        // We can query DMs for Bob.
        // But current client is logged in as Alice.
        // We can either logout and login as Bob, or just query DMs and manually decrypt using Bob's key.
        // Let's logout and login as Bob to verify the full flow in client.

        try {
            client.logout();
            await client.registerPrivateKeySigner({ privateKey: hexSk2, pubkey: pk2 });
            log('Logged in as Bob');

            // Wait for DM to arrive
            await new Promise(r => setTimeout(r, 500));

            // List DMs
            const messages = await client.listDirectMessages(pk2);
            // messages should be decrypted objects

            const found = messages.find(m => m.plaintext === message);

            if (found) {
                recordStep('Decrypt DM', true);
                log(`Decrypted message: ${found.plaintext}`);
            } else {
                // Debug info
                log(`Found ${messages.length} messages for Bob.`);
                messages.forEach(m => log(`Msg: ${m.plaintext}, Error: ${JSON.stringify(m.errors)}`));
                throw new Error('Target DM not found or not decrypted');
            }

        } catch (e) {
            recordStep('Decrypt DM', false, e);
        }

    } catch (err) {
        log(`Test suite failed: ${err.message}`, 'FATAL');
        if (err.stack) log(err.stack, 'FATAL');
    } finally {
        // Cleanup
        if (relayProcess) {
            log('Stopping relay...');
            relayProcess.kill();
        }

        // Report
        fs.writeFileSync(REPORT_FILE, JSON.stringify({
            timestamp: new Date().toISOString(),
            stats,
            logFile: LOG_FILE
        }, null, 2));

        console.log(`\nTest Finished.`);
        console.log(`Pass: ${stats.steps - stats.failures}/${stats.steps}`);
        console.log(`Log: ${LOG_FILE}`);
        console.log(`Report: ${REPORT_FILE}`);

        if (stats.failures > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    }
}

runTest();
