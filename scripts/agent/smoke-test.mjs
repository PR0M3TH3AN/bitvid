import './setup-test-env.js';
import "fake-indexeddb/auto";
import { startRelay } from './simple-relay.mjs';
import { NostrClient } from '../../js/nostr/client.js';
import { buildVideoPostEvent } from '../../js/nostrEventSchemas.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import * as NostrTools from 'nostr-tools';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';

const ARTIFACTS_DIR = 'artifacts';
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.log`);
const REPORT_FILE = path.join(ARTIFACTS_DIR, `smoke-summary-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const UI_SCREENSHOT = path.join(ARTIFACTS_DIR, 'smoke-ui.png');

if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR);
}

// Logging helper
function log(msg, type = 'INFO') {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${type}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function bytesToHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}

// Helper to wait for server
function waitForServer(url, timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            const req = http.get(url, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    retry();
                }
            });
            req.on('error', retry);
            req.end();
        };

        const retry = () => {
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Server at ${url} did not respond within ${timeoutMs}ms`));
            } else {
                setTimeout(check, 500);
            }
        };

        check();
    });
}

async function runSmokeTest() {
    log("Starting Smoke Test...");
    let relay;
    let serverProcess;
    let exitCode = 0;
    const summary = {
        timestamp: new Date().toISOString(),
        steps: {}
    };

    try {
        // --- Step 1: Start Infrastructure ---
        log("Step 1: Starting Infrastructure");

        // Start Relay
        const RELAY_PORT = 8899;
        relay = startRelay(RELAY_PORT);
        const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
        log(`Relay started at ${RELAY_URL}`);
        summary.steps.relay = "SUCCESS";

        // Start Web Server
        log("Starting web server (npx serve)...");
        serverProcess = spawn('npx', ['serve', '-p', '3000'], {
            stdio: 'ignore', // Suppress serve output to avoid clutter, or pipe to log if needed
            shell: true,
            detached: false // Ensure we can kill it
        });

        await waitForServer('http://localhost:3000');
        log("Web server is up at http://localhost:3000");
        summary.steps.server = "SUCCESS";

        // --- Step 2: Protocol Smoke Test (Headless Client) ---
        log("Step 2: Protocol Smoke Test");

        const client = new NostrClient();
        client.relays = [RELAY_URL];
        client.readRelays = [RELAY_URL];
        client.writeRelays = [RELAY_URL];

        log("Initializing NostrClient...");
        await client.init();
        log("NostrClient initialized and connected.");

        // Generate Identity
        const secretKey = NostrTools.generateSecretKey();
        const privateKey = bytesToHex(secretKey);
        const pubkey = NostrTools.getPublicKey(secretKey);
        log(`Generated Identity: ${pubkey}`);

        await client.registerPrivateKeySigner({
            privateKey: privateKey,
            pubkey: pubkey,
            persist: false
        });
        log("Identity registered.");

        // A. Video Flow
        log("--- Subtest: Video Flow ---");
        const videoEvent = buildVideoPostEvent({
            pubkey: pubkey,
            created_at: Math.floor(Date.now() / 1000),
            dTagValue: `smoke-${Date.now()}`,
            content: {
                version: 3,
                title: "Smoke Test Video",
                description: "Smoke testing video publish",
                url: "https://example.com/smoke.mp4",
                magnet: "magnet:?xt=urn:btih:1234567890abcdef&dn=smoke",
                isForKids: false,
                isNsfw: false,
                enableComments: true,
                videoRootId: `root-${Date.now()}`,
                mode: "live"
            }
        });

        const { signedEvent: publishedVideo } = await client.signAndPublishEvent(videoEvent);
        log(`Video Published: ${publishedVideo.id}`);

        await new Promise(r => setTimeout(r, 100)); // Allow propagation
        const fetchedVideo = await client.getEventById(publishedVideo.id);
        if (!fetchedVideo) throw new Error("Failed to fetch published video");
        if (fetchedVideo.title !== "Smoke Test Video") throw new Error("Fetched video title mismatch");
        log("Video verified.");
        summary.steps.video_flow = "SUCCESS";

        // B. View Flow
        log("--- Subtest: View Flow ---");
        const videoPointer = {
            type: 'e',
            value: publishedVideo.id,
            relay: RELAY_URL
        };
        const viewResult = await client.publishViewEvent(videoPointer);
        log(`View Event Published: ${viewResult.event ? viewResult.event.id : 'undefined'}`);
        summary.steps.view_flow = "SUCCESS";

        // C. DM Flow
        log("--- Subtest: DM Flow ---");
        const dmMessage = "Smoke Test DM Payload";
        const dmResult = await client.sendDirectMessage(NostrTools.nip19.npubEncode(pubkey), dmMessage);
        if (!dmResult.ok) throw new Error(`DM Send Failed: ${dmResult.error}`);
        log("DM Sent.");

        await new Promise(r => setTimeout(r, 500));

        // C1. Verify via listDirectMessages (High level)
        const dms = await client.listDirectMessages(pubkey);
        const foundDm = dms.find(dm => dm.plaintext === dmMessage);
        if (!foundDm) {
             // Debug info
             log(`DMs found: ${dms.length}`);
             if (dms.length) log(`First DM plaintext: ${dms[0].plaintext}`);
             throw new Error("DM not found via listDirectMessages");
        }
        log("DM verified via listDirectMessages.");

        // C2. Verify via raw event + decryptDM (Low level)
        // We find the event ID from the high level list or list pool directly.
        // Let's use the ID from the found message.
        const dmEventId = foundDm.event.id;
        const rawDmEvent = await client.fetchRawEventById(dmEventId);
        if (!rawDmEvent) throw new Error("Failed to fetch raw DM event");

        log("Decrypting raw DM event manually...");
        const decryptContext = {
            actorPubkey: pubkey,
            decryptors: [
                {
                    scheme: 'nip04',
                    decrypt: async (targetPubkey, ciphertext) => {
                         // NIP-04: decrypt(privKey, pubKey, ciphertext)
                         // Here, since we are receiver, we use our privKey.
                         // The targetPubkey passed by decryptDM for legacy DMs (kind 4) is the sender's pubkey.
                         return await NostrTools.nip04.decrypt(privateKey, targetPubkey, ciphertext);
                    },
                    priority: 1
                }
            ]
        };

        const manualDecryptResult = await decryptDM(rawDmEvent, decryptContext);
        if (!manualDecryptResult.ok) {
            log(`Manual decryption failed: ${JSON.stringify(manualDecryptResult.errors)}`, 'ERROR');
            throw new Error("Manual decryption failed");
        }
        if (manualDecryptResult.plaintext !== dmMessage) {
             throw new Error(`Manual decryption mismatch. Got: ${manualDecryptResult.plaintext}`);
        }
        log("DM verified via manual decryptDM.");
        summary.steps.dm_flow = "SUCCESS";

        // --- Step 3: UI Smoke Test (Headless Browser) ---
        log("Step 3: UI Smoke Test");
        log("Launching browser...");
        const browser = await chromium.launch();
        const page = await browser.newPage();

        try {
            await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
            const title = await page.title();
            log(`Page Title: ${title}`);

            // Take screenshot
            await page.screenshot({ path: UI_SCREENSHOT });
            log(`Screenshot saved to ${UI_SCREENSHOT}`);

            summary.steps.ui_test = "SUCCESS";
        } catch (e) {
            log(`UI Test Failed: ${e.message}`, 'ERROR');
            summary.steps.ui_test = "FAILED";
            throw e;
        } finally {
            await browser.close();
        }

        summary.status = "PASS";
        log("Smoke Test Completed Successfully.");

    } catch (error) {
        log(`Smoke Test Failed: ${error.stack}`, 'ERROR');
        summary.status = "failure";
        summary.error = error.message;
        exitCode = 1;
    } finally {
        // --- Write Report ---
        try {
            if (fs.existsSync(LOG_FILE)) {
                const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
                summary.logs = logs;
            }
            fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2));
            log(`Summary written to ${REPORT_FILE}`);
        } catch (e) {
            log(`Failed to write report: ${e.message}`, 'ERROR');
        }

        // --- Cleanup ---
        log("Cleaning up...");

        try {
            if (relay && relay.close) {
                // Don't await indefinitely
                await Promise.race([
                    relay.close(),
                    new Promise(r => setTimeout(r, 2000))
                ]);
            }
        } catch (e) {
            log(`Relay close error: ${e.message}`, 'WARN');
        }

        if (serverProcess) {
            serverProcess.kill();
        }

        process.exit(exitCode);
    }
}

runSmokeTest();
