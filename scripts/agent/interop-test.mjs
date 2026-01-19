import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../');

const ARTIFACTS_DIR = path.join(REPO_ROOT, 'artifacts');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const LOG_FILE = path.join(ARTIFACTS_DIR, `interop-${TIMESTAMP}.log`);
const REPORT_FILE = path.join(ARTIFACTS_DIR, `interop-report-${TIMESTAMP}.json`);
const RELAY_PORT = 8008;
const HTTP_PORT = 8001;

// Ensure artifacts dir exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

function log(message, type = 'INFO') {
    const msg = `[${new Date().toISOString()}] [${type}] ${message}`;
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

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

async function startProcess(command, args, cwd, readyCheck) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { cwd, stdio: 'pipe' });
        let started = false;
        const label = args.some(a => a.includes('relay')) ? 'RELAY' : command;

        const checkData = (data) => {
            const output = data.toString();
            if (started) {
                 if (label === 'RELAY') log(`[RELAY] ${output.trim()}`, 'DEBUG');
                 return;
            }
            if (readyCheck(output)) {
                started = true;
                resolve(proc);
            }
        };

        proc.stdout.on('data', (data) => {
            checkData(data);
        });
        proc.stderr.on('data', (data) => {
             checkData(data);
        });

        proc.on('error', (err) => reject(err));
        proc.on('exit', (code) => {
            if (!started) reject(new Error(`${command} exited early with code ${code}`));
        });

        // Timeout fallback
        setTimeout(() => {
            if (!started) {
                // For http server, sometimes it doesn't output much
                if (command.includes('python') || command.includes('http.server')) {
                    started = true;
                    resolve(proc);
                } else {
                    reject(new Error(`${command} timed out waiting for ready signal`));
                }
            }
        }, 3000);
    });
}

async function runInteropTest() {
    let relayProc, serverProc, browser;

    try {
        log('Starting interop test...');

        // 1. Start Relay
        log('Starting local relay...');
        relayProc = await startProcess(
            'node',
            ['scripts/agent/simple-relay.mjs'],
            REPO_ROOT,
            (output) => output.includes(`running on ws://localhost:${RELAY_PORT}`) || output.includes(`running on port ${RELAY_PORT}`)
        );

    } catch (e) {
        log('Failed to start relay: ' + e.message, 'FATAL');
    }

    try {
        // 2. Start HTTP Server
        log('Starting HTTP server...');
        serverProc = await startProcess(
            'python3',
            ['-m', 'http.server', String(HTTP_PORT)],
            REPO_ROOT,
            (output) => output.includes(`Serving HTTP on 0.0.0.0 port ${HTTP_PORT}`)
        );

        // 3. Launch Browser
        log('Launching browser...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        // 4. Navigate to app
        log(`Navigating to http://localhost:${HTTP_PORT}...`);
        await page.goto(`http://localhost:${HTTP_PORT}`, { waitUntil: 'networkidle' });

        // 5. Inject Test Logic
        log('Executing test logic in browser...');

        const testResult = await page.evaluate(async ({ relayUrl }) => {
            const logs = [];
            const steps = [];

            function log(msg) { console.log(msg); logs.push(msg); }

            try {
                // Import dependencies
                const { nostrClient } = await import('./js/nostr/defaultClient.js');
                const schemas = await import('./js/nostrEventSchemas.js');

                // Wait for NostrTools
                if (!window.NostrTools) {
                    await new Promise(r => setTimeout(r, 1000));
                    if (!window.NostrTools) throw new Error("NostrTools not available on window");
                }
                const NostrTools = window.NostrTools;

                // --- Step 1: Init ---
                nostrClient.relays = [relayUrl];
                nostrClient.readRelays = [relayUrl];
                nostrClient.writeRelays = [relayUrl];
                await nostrClient.init();
                await nostrClient.connectToRelays();

                steps.push({ name: 'Init & Connect', success: true });

                // --- Step 2: Setup Alice (Video Publisher) ---
                const skAlice = NostrTools.generateSecretKey();
                const pkAlice = NostrTools.getPublicKey(skAlice);
                const hexSkAlice = NostrTools.utils.bytesToHex(skAlice);

                await nostrClient.registerPrivateKeySigner({ privateKey: hexSkAlice, pubkey: pkAlice });

                steps.push({ name: 'Setup Alice', success: true });

                // --- Test A: Publish VIDEO_POST ---
                const dTagValue = `test-video-${Date.now()}`;
                const videoContent = {
                    version: 3,
                    title: 'Interop Test Video',
                    description: 'Testing event schemas',
                    videoRootId: `root-${dTagValue}`,
                    mode: 'dev',
                    url: 'https://example.com/video.mp4',
                    magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=video.mp4'
                };

                const videoEventSkeleton = schemas.buildVideoPostEvent({
                    pubkey: pkAlice,
                    created_at: Math.floor(Date.now() / 1000),
                    dTagValue: dTagValue,
                    content: videoContent
                });

                // Use signAndPublishEvent to sign and publish
                const { signedEvent: publishedVideo } = await nostrClient.signAndPublishEvent(videoEventSkeleton);

                if (!publishedVideo || !publishedVideo.id || !publishedVideo.sig) {
                    throw new Error("Video publish returned incomplete event");
                }

                steps.push({ name: 'Publish VIDEO_POST', success: true });

                // --- Test B: Fetch and Validate Video ---
                await new Promise(r => setTimeout(r, 500)); // wait for relay
                const fetchedVideo = await nostrClient.getEventById(publishedVideo.id, { includeRaw: true });

                if (!fetchedVideo) throw new Error("Failed to fetch video event back");

                // Validate shape
                const fetchedRaw = fetchedVideo.rawEvent || fetchedVideo; // handle wrapper
                if (fetchedRaw.id !== publishedVideo.id) throw new Error("ID mismatch");
                if (fetchedRaw.pubkey !== pkAlice) throw new Error("Pubkey mismatch");

                // Parse content
                const fetchedContent = typeof fetchedRaw.content === 'string' ? JSON.parse(fetchedRaw.content) : fetchedRaw.content;
                if (fetchedContent.title !== videoContent.title) throw new Error("Content title mismatch");
                if (fetchedContent.videoRootId !== videoContent.videoRootId) throw new Error("Content rootId mismatch");

                steps.push({ name: 'Verify VIDEO_POST Roundtrip', success: true });

                // --- Test C: Publish VIEW_EVENT ---
                const viewEventSkeleton = schemas.buildViewEvent({
                    pubkey: pkAlice,
                    created_at: Math.floor(Date.now() / 1000),
                    pointerTag: ['e', publishedVideo.id], // pointing to the video
                    content: 'test view'
                });

                const { signedEvent: publishedView } = await nostrClient.signAndPublishEvent(viewEventSkeleton);

                await new Promise(r => setTimeout(r, 500));
                const fetchedView = await nostrClient.fetchRawEventById(publishedView.id);
                if (!fetchedView) throw new Error("Failed to fetch view event back");

                steps.push({ name: 'Publish & Verify VIEW_EVENT', success: true });

                // --- Test D: Encrypted DM (Alice -> Bob) ---
                const skBob = NostrTools.generateSecretKey();
                const pkBob = NostrTools.getPublicKey(skBob);
                const hexSkBob = NostrTools.utils.bytesToHex(skBob);
                const npubBob = NostrTools.nip19.npubEncode(pkBob);

                // Alice is currently logged in
                const dmMessage = `Hello Bob ${Date.now()}`;
                const dmResult = await nostrClient.sendDirectMessage(npubBob, dmMessage);
                if (!dmResult.ok) throw new Error("Failed to send DM: " + dmResult.error);

                steps.push({ name: 'Send Encrypted DM', success: true });

                // Switch to Bob to decrypt
                nostrClient.logout();
                await nostrClient.registerPrivateKeySigner({ privateKey: hexSkBob, pubkey: pkBob });

                await new Promise(r => setTimeout(r, 500));

                const dms = await nostrClient.listDirectMessages(pkBob);
                const receivedDm = dms.find(m => m.plaintext === dmMessage);

                if (!receivedDm) {
                    throw new Error(`Bob could not find/decrypt the DM. Found: ${dms.length} messages.`);
                }

                if (receivedDm.sender.pubkey !== pkAlice) {
                    throw new Error("DM sender mismatch");
                }

                steps.push({ name: 'Decrypt DM', success: true });

                return { success: true, steps, logs };

            } catch (e) {
                return { success: false, steps, logs, error: e.message, stack: e.stack };
            }
        }, { relayUrl: `ws://localhost:${RELAY_PORT}` });

        // Process results
        if (testResult.logs) {
            testResult.logs.forEach(l => log(`[Browser] ${l}`));
        }

        if (testResult.steps) {
            testResult.steps.forEach(s => recordStep(s.name, s.success));
        }

        if (!testResult.success) {
            throw new Error(testResult.error || "Unknown browser test failure");
        }

    } catch (err) {
        log(`Test failed: ${err.message}`, 'FATAL');
        recordStep('Interop Test Suite', false, err);
        // Take screenshot if browser is active
        if (browser) {
            try {
                const page = browser.contexts()[0].pages()[0];
                if (page) {
                    await page.screenshot({ path: path.join(ARTIFACTS_DIR, `interop-failure-${TIMESTAMP}.png`) });
                    log(`Screenshot saved to interop-failure-${TIMESTAMP}.png`);
                }
            } catch (e) {
                log('Failed to capture screenshot: ' + e.message);
            }
        }
    } finally {
        // Cleanup
        if (browser) await browser.close();
        if (serverProc) {
            try { process.kill(serverProc.pid); } catch (e) { /* ignore */ }
        }
        if (relayProc) {
            try { process.kill(relayProc.pid); } catch (e) { /* ignore */ }
        }

        // Report
        fs.writeFileSync(REPORT_FILE, JSON.stringify({
            timestamp: new Date().toISOString(),
            stats,
            logFile: LOG_FILE
        }, null, 2));

        console.log(`Report saved to ${REPORT_FILE}`);
        if (stats.failures > 0) process.exit(1);
    }
}

runInteropTest();
