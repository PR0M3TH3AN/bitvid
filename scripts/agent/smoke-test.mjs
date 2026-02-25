/**
 * Smoke Test Script (Agent)
 * Verifies key flows: login, relay connect, video post, DM decrypt.
 */

import './setup-test-env.js';
import { startRelay } from './load-test-relay.mjs';
import { NostrClient } from '../../js/nostr/client.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import {
    buildVideoPostEvent,
    buildLegacyDirectMessageEvent
} from '../../js/nostrEventSchemas.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'node:util';

// Parse Arguments
const { values } = parseArgs({
    options: {
        relays: { type: 'string' },
        serve: { type: 'string', default: 'npx' },
        'dry-run': { type: 'boolean' },
        timeout: { type: 'string', default: '30' },
        burst: { type: 'string', default: '1' },
        out: { type: 'string', default: 'artifacts' },
        'confirm-public': { type: 'boolean' },
    },
    allowPositionals: true,
});

const RELAY_PORT = 8899;
const DEFAULT_RELAY_URL = `ws://localhost:${RELAY_PORT}`;
const HTTP_PORT = 8000;
const HTTP_URL = `http://localhost:${HTTP_PORT}`;

// Configuration from Args
const ARTIFACTS_DIR = values.out;
const SERVE_MODE = values.serve;
const TIMEOUT_MS = parseInt(values.timeout, 10) * 1000;
const RELAY_URLS = values.relays ? values.relays.split(',').map(r => r.trim()) : [DEFAULT_RELAY_URL];
const IS_DRY_RUN = values['dry-run'];
const CONFIRM_PUBLIC = values['confirm-public'];

// Safety Check for Public Relays
const hasPublicRelay = RELAY_URLS.some(url => !url.includes('localhost') && !url.includes('127.0.0.1'));
if (hasPublicRelay && !CONFIRM_PUBLIC) {
    console.error('ERROR: Public relays detected without --confirm-public. Aborting.');
    process.exit(1);
}

// Artifacts Setup
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.log`);
const SCREENSHOT_FILE = path.join(ARTIFACTS_DIR, 'smoke-test-ui.png');

// Logger
function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    if (fs.existsSync(ARTIFACTS_DIR)) {
        fs.appendFileSync(LOG_FILE, line + '\n');
    }
}

// Generate Keys
const bytesToHex = (bytes) => Buffer.from(bytes).toString('hex');
const EPHEMERAL_SK_BYTES = generateSecretKey();
const EPHEMERAL_SK = bytesToHex(EPHEMERAL_SK_BYTES);
const EPHEMERAL_PK = getPublicKey(EPHEMERAL_SK_BYTES);

async function startHttpServer() {
    if (SERVE_MODE === 'none') {
        log('Skipping HTTP Server start (--serve=none). Assuming app is running.');
        return null;
    }

    log(`Starting HTTP Server (${SERVE_MODE})...`);
    let serve;

    if (SERVE_MODE === 'npx') {
        serve = spawn('npx', ['serve', '.', '-p', String(HTTP_PORT)], {
            stdio: 'ignore',
            shell: true
        });
    } else if (SERVE_MODE === 'python') {
        serve = spawn('python3', ['-m', 'http.server', String(HTTP_PORT)], {
            stdio: 'ignore',
            shell: true
        });
    } else {
        throw new Error(`Unknown serve mode: ${SERVE_MODE}`);
    }

    const maxRetries = 20;
    for (let i = 0; i < maxRetries; i++) {
        try {
            await fetch(HTTP_URL);
            log('HTTP Server is ready.');
            return serve;
        } catch (e) {
            await new Promise(r => setTimeout(r, 250));
        }
    }
    if (serve) serve.kill();
    throw new Error('HTTP Server failed to start within timeout.');
}

async function runSmokeTest() {
    // Ensure artifacts dir
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    fs.writeFileSync(LOG_FILE, ''); // Clear log

    let relayServer;
    let httpServer;
    let browser;
    let nodeClient;
    let exitCode = 0;

    try {
        log('--- Smoke Test Started ---');
        log(`Ephemeral Pubkey: ${EPHEMERAL_PK}`);
        log(`Relays: ${RELAY_URLS.join(', ')}`);

        // 1. Start Infrastructure
        // Only start local relay if we are using the default local URL and it wasn't overridden
        if (RELAY_URLS.length === 1 && RELAY_URLS[0] === DEFAULT_RELAY_URL) {
            relayServer = startRelay(RELAY_PORT);
        } else {
            log('Using external/provided relays, skipping local relay start.');
        }

        httpServer = await startHttpServer();

        // 2. Initialize Node Client
        log('Initializing Node Client...');
        nodeClient = new NostrClient();
        nodeClient.relays = [...RELAY_URLS];
        nodeClient.writeRelays = [...RELAY_URLS];
        nodeClient.readRelays = [...RELAY_URLS];

        await nodeClient.registerPrivateKeySigner({ privateKey: EPHEMERAL_SK });
        await nodeClient.init(); // Wait for connection
        log('Node Client connected.');

        if (IS_DRY_RUN) {
            log('Dry run enabled. Skipping publish and browser steps.');
            return;
        }

        // 3. Publish Video Event (Node)
        log('Node: Publishing Video Post...');
        const videoEventTemplate = buildVideoPostEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            dTagValue: `smoke-test-${Date.now()}`,
            content: {
                version: 3,
                title: 'Smoke Test Video',
                url: 'https://example.com/video.mp4',
                description: 'A video to verify feed rendering.',
                mode: 'live',
                videoRootId: `smoke-root-${Date.now()}`
            }
        });

        const { signedEvent: publishedVideo } = await nodeClient.signAndPublishEvent(videoEventTemplate, {
            context: 'smoke-video'
        });
        log(`Node: Published Video ID: ${publishedVideo.id}`);

        // 4. Publish DM (Node -> Self)
        log('Node: Publishing Encrypted DM...');
        const dmMessage = "Smoke Test Secret Message";
        const signer = await nodeClient.ensureActiveSignerForPubkey(EPHEMERAL_PK);
        const ciphertext = await signer.nip04Encrypt(EPHEMERAL_PK, dmMessage);

        const dmTemplate = buildLegacyDirectMessageEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            recipientPubkey: EPHEMERAL_PK,
            ciphertext: ciphertext
        });

        const { signedEvent: publishedDM } = await nodeClient.signAndPublishEvent(dmTemplate, {
            context: 'smoke-dm'
        });
        log(`Node: Published DM ID: ${publishedDM.id}`);

        // 5. Browser Test (Playwright)
        log('Browser: Launching...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();

        // Inject LocalStorage for Auto-Login and Relay Config
        const savedProfiles = {
            entries: [{ pubkey: EPHEMERAL_PK, authType: "nip07" }],
            activePubkey: EPHEMERAL_PK,
            version: 1
        };
        // Transform RELAY_URLS into object format expected by app
        const relayList = RELAY_URLS.map(url => ({ url, mode: "both" }));

        // Note: Key format derived from investigation: bitvid:profile:<pubkey>:relayList:v1
        const relayStorageKey = `bitvid:profile:${EPHEMERAL_PK}:relayList:v1`;

        await context.addInitScript(({ profiles, relays, relayKey }) => {
            // Disable Whitelist Mode to allow fresh pubkey login
            window.localStorage.setItem('bitvid_admin_whitelist_mode', 'false');

            window.localStorage.setItem('bitvid:savedProfiles:v1', JSON.stringify(profiles));
            window.localStorage.setItem(relayKey, JSON.stringify(relays));

            // Inject test relays for isolation
            window.__bitvidTestRelays__ = relays.map(r => r.url);

            // Mock NIP-07 to avoid errors if app tries to use it (though we won't sign in browser)
            window.nostr = {
                getPublicKey: async () => profiles.activePubkey,
                signEvent: async () => { throw new Error("Mock NIP-07 cannot sign"); }
            };
        }, { profiles: savedProfiles, relays: relayList, relayKey: relayStorageKey });

        const page = await context.newPage();

        log(`Browser: Navigating to ${HTTP_URL}...`);

        // Capture Console
        page.on('console', msg => log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
        page.on('pageerror', err => log(`[Browser Error] ${err.message}`));

        await page.goto(HTTP_URL);

        // Verify Login (Profile Button presence)
        log('Browser: Verifying Login...');
        // #profileButton might be hidden initially, wait for it
        try {
            await page.waitForSelector('#profileButton', { state: 'visible', timeout: TIMEOUT_MS });
            log('Browser: Login verified (Profile button visible).');
        } catch (e) {
            log('Browser: Login verification failed (Profile button not found). Dumping localStorage...');
            const storage = await page.evaluate(() => JSON.stringify(localStorage));
            log(`[Browser Storage] ${storage}`);
            await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'smoke-fail-login.png') });
            throw e;
        }

        // Verify Feed (Video Card presence)
        log('Browser: Verifying Video in Feed...');
        // Look for the video title
        try {
            // Wait longer for feed to load (relays might be slow)
            // Use 2x timeout for network/relay operations
            await page.waitForSelector(`text=Smoke Test Video`, { timeout: TIMEOUT_MS * 2 });
            log('Browser: Video found in feed!');
        } catch (e) {
            log('Browser: Video NOT found in feed. Taking screenshot...');
            await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'smoke-fail-feed.png') });

            // Debug: Check relays
            const relayState = await page.evaluate(() => {
                return {
                    localStorage: JSON.stringify(localStorage),
                };
            });
            log(`[Browser Debug] Storage: ${relayState.localStorage}`);

            throw new Error('Browser: Video NOT found in feed.');
        }

        // Screenshot
        await page.screenshot({ path: SCREENSHOT_FILE });
        log(`Browser: Screenshot saved to ${SCREENSHOT_FILE}`);

        // 6. Node Verification (DM Decrypt)
        log('Node: Verifying DM Decryption...');
        // Fetch back
        await new Promise(r => setTimeout(r, 500));
        const fetchedDM = await nodeClient.fetchRawEventById(publishedDM.id);
        if (!fetchedDM) {
            throw new Error('Node: Failed to fetch DM back.');
        }

        const decryptContext = await nodeClient.buildDmDecryptContext(EPHEMERAL_PK);
        const decryptionResult = await decryptDM(fetchedDM, decryptContext);

        if (!decryptionResult.ok) {
            log(`Node: Decryption failed: ${JSON.stringify(decryptionResult.errors)}`);
            throw new Error('Node: Decryption failed.');
        }

        if (decryptionResult.plaintext !== dmMessage) {
            throw new Error(`Node: Decryption mismatch. Got "${decryptionResult.plaintext}"`);
        }
        log(`Node: DM Decrypted successfully: "${decryptionResult.plaintext}"`);

        log('--- Smoke Test PASSED ---');

        // Generate JSON Summary
        const summary = {
            timestamp: new Date().toISOString(),
            status: "success",
            details: {
                videoEventId: publishedVideo.id,
                dmEventId: publishedDM.id,
                ephemeralPubkey: EPHEMERAL_PK,
                relays: RELAY_URLS
            }
        };
        const summaryFile = path.join(ARTIFACTS_DIR, `smoke-summary-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`);
        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
        log(`Summary saved to ${summaryFile}`);

    } catch (err) {
        log(`--- Smoke Test FAILED: ${err.message} ---`);
        if (err.stack) log(err.stack);
        exitCode = 1;
    } finally {
        // Cleanup
        log('Cleaning up...');
        if (nodeClient && nodeClient.pool) {
             // Close pool connections
             if (typeof nodeClient.pool.close === 'function') {
                 nodeClient.pool.close(nodeClient.relays);
             }
        }
        if (browser) await browser.close();
        if (httpServer) httpServer.kill();
        if (relayServer) await relayServer.close();

        process.exit(exitCode);
    }
}

runSmokeTest();
