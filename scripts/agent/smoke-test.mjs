import { chromium } from 'playwright';
import { WebSocket } from 'ws';
import * as NostrTools from 'nostr-tools';
import { startRelay } from './load-test-relay.mjs';
import { decryptDM } from '../../js/dmDecryptor.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'url';

// --- Configuration ---
const ARTIFACTS_DIR = 'artifacts';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');
const RELAY_PORT = 8889;
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
const HTTP_PORT = 8000;
const HTTP_URL = `http://localhost:${HTTP_PORT}`;

// --- Logging ---
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const logFile = path.join(ARTIFACTS_DIR, `smoke-${dateStr}.log`);

if (!fs.existsSync(ARTIFACTS_DIR)) fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

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
async function waitForServer(url, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) return true;
        } catch (e) {
            // ignore
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

// --- Main Script ---
async function run() {
    let relayServer = null;
    let httpServer = null;
    let browser = null;
    let success = true;

    try {
        log('--- Starting Smoke Test ---');

        // 1. Start Relay
        log(`Starting local relay on port ${RELAY_PORT}...`);
        relayServer = startRelay(RELAY_PORT);
        await new Promise(r => setTimeout(r, 500));
        log('Relay started.');

        // 2. Start HTTP Server
        log(`Starting HTTP server on port ${HTTP_PORT}...`);
        httpServer = spawn('npx', ['serve', '-p', String(HTTP_PORT)], {
            stdio: 'ignore',
            detached: false,
            shell: true
        });

        const serverReady = await waitForServer(HTTP_URL);
        if (!serverReady) throw new Error(`HTTP server failed to start at ${HTTP_URL}`);
        log('HTTP server ready.');

        // 3. Launch Browser
        log('Launching browser...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            if (type === 'error' || type === 'warning') {
                log(`[BROWSER ${type.toUpperCase()}] ${text}`);
            }
        });
        page.on('pageerror', err => {
            log(`[BROWSER UNCAUGHT] ${err.message}`);
        });

        // 4. Mock Extension Setup
        const ephemeralSk = NostrTools.generateSecretKey();
        const ephemeralSkHex = Buffer.from(ephemeralSk).toString('hex'); // nostr-tools v2 uses Uint8Array, Buffer covers it
        const ephemeralPk = NostrTools.getPublicKey(ephemeralSk);
        log(`Ephemeral Pubkey: ${ephemeralPk}`);

        // Pre-seed Relay with User's Relay List (Kind 10002)
        // This ensures the app finds the local relay when it syncs preferences, avoiding fallback to public defaults.
        {
            log('Seeding relay list event...');
            const seedWs = new WebSocket(RELAY_URL);
            await new Promise((resolve) => seedWs.on('open', resolve));

            const relayListEvent = {
                kind: 10002,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['r', RELAY_URL]],
                content: '',
                pubkey: ephemeralPk,
                id: null,
                sig: null
            };
            const signedSeed = NostrTools.finalizeEvent(relayListEvent, ephemeralSk);

            const seedPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Seed timeout')), 2000);
                seedWs.on('message', (data) => {
                    const msg = JSON.parse(data.toString());
                    if (msg[0] === 'OK' && msg[1] === signedSeed.id && msg[2]) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
                seedWs.send(JSON.stringify(['EVENT', signedSeed]));
            });

            await seedPromise;
            seedWs.close();
            log('Relay list seeded successfully.');
        }

        // Disable whitelist mode & Inject Relay Preferences
        await page.addInitScript(({ pubkey, relayUrl }) => {
            window.localStorage.setItem('bitvid_admin_whitelist_mode', 'false');
            const key = `bitvid:profile:${pubkey}:relayList:v1`;
            const data = [{ url: relayUrl, mode: 'both' }];
            window.localStorage.setItem(key, JSON.stringify(data));
        }, { pubkey: ephemeralPk, relayUrl: RELAY_URL });

        // Expose Node-side signing to Browser
        await page.exposeFunction('mockGetPublicKey', async () => ephemeralPk);
        await page.exposeFunction('mockSignEvent', async (event) => {
            const signed = NostrTools.finalizeEvent(event, ephemeralSk);
            return signed;
        });
        await page.exposeFunction('mockNip04Encrypt', async (pubkey, plaintext) => {
            return await NostrTools.nip04.encrypt(ephemeralSk, pubkey, plaintext);
        });
        await page.exposeFunction('mockNip04Decrypt', async (pubkey, ciphertext) => {
            return await NostrTools.nip04.decrypt(ephemeralSk, pubkey, ciphertext);
        });
        // Add NIP-44 if needed, mostly NIP-07 uses nip04 for legacy support or nip44

        await page.addInitScript(() => {
            window.nostr = {
                getPublicKey: () => window.mockGetPublicKey(),
                signEvent: (event) => window.mockSignEvent(event),
                nip04: {
                    encrypt: (pubkey, plaintext) => window.mockNip04Encrypt(pubkey, plaintext),
                    decrypt: (pubkey, ciphertext) => window.mockNip04Decrypt(pubkey, ciphertext)
                }
            };
        });

        // 5. Navigate and Login
        log('Navigating to app...');
        await page.goto(HTTP_URL);

        // Wait for app to initialize (fade-in or login button)
        await page.waitForSelector('#loginButton');
        log('App loaded.');

        // Override relays in the app to point to local relay?
        // Ideally we should via UI, but simpler to just let it connect to defaults AND our local relay.
        // Or we can inject settings.
        // Let's assume the app will connect to default relays. We want it to use OUR relay for the test.
        // We can execute: window.app.nostrClient.addRelay(...) if we could access it.
        // Or we can just let it fail to connect to public relays and hope it doesn't block UI.
        // BUT, for the publish verification to work, the app needs to publish to a relay we can read.
        // So we MUST ensure the app connects to localhost:8889.
        // We can try to inject it into localStorage before load?
        // 'nostr-relays' key?
        // Let's check `relayManager.js` or `localStorage` keys.
        // Usually `nostr:relays` or similar.
        // Assuming the app has a default list.
        // We can try to add the relay via console after load.
        // "window.nostrClient" might be available if exposed?
        // Earlier I saw `js/index.js` doesn't expose it.
        // BUT `js/nostrClientFacade.js` exports `nostrClient`.
        // Maybe I can rely on the app logic: if I publish, it goes to "write relays".
        // I'll try to use the "Manage Storage" or similar? No.
        // Let's try to infer if I can just assume it works or if I need to force it.
        // Actually, for smoke tests, we often want to test against a controlled relay.
        // I will try to inject a relay into the default set if possible.
        // `js/relayManager.js` might read from storage.
        // Let's try to set `nostr:relays` in localStorage before load.
        // Or I can just continue and see if it works (maybe defaults include localhost in dev mode?).
        // If not, I'll use `page.evaluate` to find a way.

        // Login
        await page.click('#loginButton');
        await page.waitForSelector('[data-provider-id="nip07"]', { timeout: 10000 });
        log('Login modal open.');

        await page.click('[data-provider-id="nip07"]');
        log('Clicked NIP-07 Login.');

        // Wait for login success (Upload button appears)
        await page.waitForSelector('#uploadButton', { state: 'visible', timeout: 10000 });
        log('Logged in successfully.');

        // 6. Publish Video
        log('Publishing video...');
        await page.click('#uploadButton');
        await page.waitForSelector('#uploadModal', { state: 'visible' });

        await page.click('#btn-mode-external');

        const testTitle = `Smoke Test Video ${Date.now()}`;
        await page.fill('#input-title', testTitle);
        await page.fill('#input-description', 'This is a smoke test video.');
        await page.fill('#input-url', 'https://example.com/test.mp4'); // Fake HTTPS URL

        await page.click('#btn-submit');
        log('Submit clicked.');

        // Wait for modal to close OR continue if it takes too long (public relay timeouts)
        try {
            await page.waitForSelector('#uploadModal', { state: 'hidden', timeout: 5000 });
            log('Upload modal closed.');
        } catch (e) {
            log('Upload modal did not close quickly (likely waiting for public relays), proceeding to verify content...');
        }

        // Verify Video in Feed
        // It might take a moment to appear.
        // The app connects to relays. If it didn't connect to OUR relay, we might not see it if we are checking via Node.
        // But the Browser is checking via the App's UI.
        // The App needs to be connected to a relay where it published.
        // If the App defaults to damus.io etc, and fails to connect (no internet in sandbox?), it might fail.
        // Sandbox has internet.
        // But I want it to use local relay.
        // I'll try to add the local relay via UI? Or just hope.
        // Wait, if I cannot force the relay, the test is flaky.
        // I'll add a step to force the relay connection via `page.evaluate` leveraging the module system if possible?
        // Or just `localStorage` key `relays`?
        // Let's try to set `localStorage.setItem('relays', JSON.stringify([{url:'ws://localhost:8889', read:true, write:true}]))` before load.

        // Reloading with relay config
        // Actually, let's do this before the first navigation or reload.
        // I'll just clear local storage and set the relay.
        /*
        await page.goto(HTTP_URL);
        await page.evaluate((url) => {
             // Guessing the storage key.
             // If I don't know it, I might be stuck.
             // But usually apps respect NIP-07 `getRelays`?
             // If I implement `window.nostr.getRelays`, the app might use them!
        }, RELAY_URL);
        */

        // Implementation of getRelays in mock
        await page.addInitScript((relayUrl) => {
            const existing = window.nostr || {};
            window.nostr = {
                ...existing,
                getRelays: async () => {
                    return { [relayUrl]: { read: true, write: true } };
                }
            };
        }, RELAY_URL);
        // App likely calls `getRelays` on login.

        log('Verifying video in UI...');
        // We might need to refresh or go to profile/feed.
        // Let's wait for the title to appear in the body.
        await page.waitForSelector(`text="${testTitle}"`, { timeout: 20000 });
        log('Video found in UI.');

        // 7. DM Test (Node Side)
        log('Starting DM Test...');

        // Connect Node Client to Relay
        const ws = new WebSocket(RELAY_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        log('Node client connected to relay.');

        const senderSk = NostrTools.generateSecretKey();
        const senderPk = NostrTools.getPublicKey(senderSk);
        const dmMessage = `Smoke DM ${Date.now()}`;

        // Send DM (Kind 4 for simplicity, or 1059)
        // Using Kind 4 (Legacy) as it's easier to verify without complex wrapping if not strictly required.
        // But `dmDecryptor` supports both.
        // Let's send Kind 4.
        const ciphertext = await NostrTools.nip04.encrypt(senderSk, ephemeralPk, dmMessage);
        const dmEvent = {
            kind: 4,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['p', ephemeralPk]],
            content: ciphertext,
            pubkey: senderPk
        };
        const signedDm = NostrTools.finalizeEvent(dmEvent, senderSk);

        log('Sending DM...');
        ws.send(JSON.stringify(['EVENT', signedDm]));

        // Wait for it to be echoed (confirmation it was accepted)
        // And wait for the "Recipient" (which we simulate using the code) to potentially see it.
        // Actually, we want to verify we can DECRYPT it using the ephemeral keys we generated for the BROWSER user.
        // So we act as the Browser User here in Node logic.

        // We need to fetch the event back from the relay to ensure it was stored.
        // Or we can just use `signedDm` directly to test `decryptDM`.
        // But better to fetch it to prove relay roundtrip.

        const fetchPromise = new Promise((resolve, reject) => {
            const subId = 'sub-dm';
            ws.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg[0] === 'EVENT' && msg[2].id === signedDm.id) {
                    resolve(msg[2]);
                }
            });
            ws.send(JSON.stringify(['REQ', subId, { ids: [signedDm.id] }]));
        });

        const fetchedDm = await Promise.race([
            fetchPromise,
            new Promise((_, r) => setTimeout(() => r(new Error('DM fetch timeout')), 5000))
        ]);

        log('DM fetched from relay.');

        // Verify Decryption
        log('Decrypting DM...');
        const decryptors = [
            {
                scheme: 'nip04',
                decrypt: async (remotePubkey, text) => {
                    return await NostrTools.nip04.decrypt(ephemeralSk, remotePubkey, text); // Use Browser User's SK
                }
            }
        ];

        const dmContext = {
            actorPubkey: ephemeralPk,
            decryptors
        };

        const result = await decryptDM(fetchedDm, dmContext);

        if (!result.ok) throw new Error(`Decryption failed: ${JSON.stringify(result.errors)}`);
        if (result.plaintext !== dmMessage) throw new Error(`Plaintext mismatch. Expected ${dmMessage}, got ${result.plaintext}`);

        log('DM Decrypted successfully.');
        ws.close();

    } catch (err) {
        success = false;
        error('Smoke Test Failed:', err);
        if (browser) {
            const page = browser.contexts()[0]?.pages()[0];
            if (page) {
                const screenshotPath = path.join(SCREENSHOTS_DIR, `failure-${Date.now()}.png`);
                await page.screenshot({ path: screenshotPath, fullPage: true });
                log(`Screenshot saved to ${screenshotPath}`);
            }
        }
    } finally {
        // Teardown
        log('Teardown...');
        if (browser) await browser.close();
        if (httpServer) httpServer.kill(); // .kill() sends SIGTERM
        if (relayServer) relayServer.close();

        const summary = {
            timestamp: new Date().toISOString(),
            success,
            logFile
        };
        fs.writeFileSync(path.join(ARTIFACTS_DIR, `smoke-summary-${dateStr}.json`), JSON.stringify(summary, null, 2));
        log('Done.');
        process.exit(success ? 0 : 1);
    }
}

run();
