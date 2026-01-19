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
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${TIMESTAMP}.log`);
const REPORT_FILE = path.join(ARTIFACTS_DIR, `smoke-report-${TIMESTAMP}.json`);
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

async function runSmokeTest() {
    let relayProc, serverProc, browser;

    try {
        log('Starting smoke test...');

        // 1. Start Relay
        log('Starting local relay...');
        relayProc = await startProcess(
            'node',
            ['scripts/agent/simple-relay.mjs'],
            REPO_ROOT,
            (output) => output.includes(`running on ws://localhost:${RELAY_PORT}`) || output.includes(`running on port ${RELAY_PORT}`)
        );
        // Relay script in repo uses hardcoded port 8008 or env var PORT.
        // I need to check if simple-relay.mjs respects PORT env var.
        // Checking existing simple-relay.mjs content... it uses const PORT = 8008;
        // Wait, I saw "const PORT = 8008;" in the file content.
        // I should probably edit simple-relay.mjs to accept PORT env or just use 8008.
        // Let's assume 8008 for now if I can't change it easily, but wait, I can pass it via env?
        // The script I read: "const PORT = 8008;" -> It does NOT use process.env.PORT.
        // So I must use 8008.
        // Let's restart relayProc with correct expectation if needed, or just modify the script temporarily?
        // Ah, the user prompt said "Start a local relay instance".
        // I'll stick to 8008.

    } catch (e) {
        log('Failed to start relay: ' + e.message, 'FATAL');
        // We can try to proceed if relay is already running?
        // But let's fix the port logic.
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
        browser = await chromium.launch({ headless: true }); // headless: true for CI
        const context = await browser.newContext();
        const page = await context.newPage();

        // 4. Navigate to app
        log(`Navigating to http://localhost:${HTTP_PORT}...`);
        await page.goto(`http://localhost:${HTTP_PORT}`, { waitUntil: 'networkidle' });

        // 5. Inject Test Logic
        // We will do everything inside page.evaluate to access the window context and modules
        log('Executing test logic in browser...');

        const testResult = await page.evaluate(async ({ relayUrl }) => {
            const logs = [];
            const steps = [];

            function log(msg) { console.log(msg); logs.push(msg); }

            try {
                // Dynamic import of the client
                // Note: The path must be relative to the URL being served
                const { nostrClient } = await import('./js/nostr/defaultClient.js');

                // Wait for NostrTools
                if (!window.NostrTools) {
                    await new Promise(r => setTimeout(r, 1000));
                    if (!window.NostrTools) throw new Error("NostrTools not available on window");
                }
                const NostrTools = window.NostrTools;

                // --- Step 1: Init ---
                // Reset relays to our local relay only
                nostrClient.relays = [relayUrl];
                nostrClient.readRelays = [relayUrl];
                nostrClient.writeRelays = [relayUrl];

                // Re-init or connect
                await nostrClient.init();
                // Force connection again just in case init was already called by the app with defaults
                await nostrClient.connectToRelays();

                steps.push({ name: 'Init & Connect', success: true });

                // --- Step 2: Login (Alice) ---
                const sk1 = NostrTools.generateSecretKey();
                const pk1 = NostrTools.getPublicKey(sk1);
                const hexSk1 = NostrTools.utils.bytesToHex(sk1);

                await nostrClient.registerPrivateKeySigner({ privateKey: hexSk1, pubkey: pk1 });
                if (nostrClient.sessionActor?.pubkey !== pk1) throw new Error(`Login failed: sessionActor.pubkey (${nostrClient.sessionActor?.pubkey}) !== ${pk1}`);

                steps.push({ name: 'Login (Alice)', success: true });

                // --- Step 3: Publish Video ---
                const videoPayload = {
                    title: 'Smoke Test Video ' + Date.now(),
                    description: 'Test Description',
                    url: 'https://example.com/video.mp4',
                    thumbnail: 'https://example.com/thumb.jpg',
                    mode: 'live'
                };

                const event = await nostrClient.publishVideo(videoPayload, pk1);
                if (!event || !event.id) throw new Error("Publish failed");

                steps.push({ name: 'Publish Video', success: true });

                // --- Step 4: Verify Video ---
                // Wait a bit
                await new Promise(r => setTimeout(r, 1500));

                // Fetch directly
                const fetched = await nostrClient.getEventById(event.id);
                if (!fetched) {
                    // Try debugging
                    const raw = await nostrClient.fetchRawEventById(event.id);
                    throw new Error(`Could not fetch published video ${event.id}. Raw result: ${raw ? 'found' : 'null'}`);
                }
                if (fetched.title !== videoPayload.title) throw new Error("Video content mismatch");

                steps.push({ name: 'Verify Video', success: true });

                // --- Step 5: DM (Alice -> Bob) ---
                const sk2 = NostrTools.generateSecretKey();
                const pk2 = NostrTools.getPublicKey(sk2);
                const hexSk2 = NostrTools.utils.bytesToHex(sk2);
                const npub2 = NostrTools.nip19.npubEncode(pk2);

                const msg = "Secret Message " + Date.now();
                const dmResult = await nostrClient.sendDirectMessage(npub2, msg);
                if (!dmResult.ok) throw new Error("DM send failed: " + dmResult.error);

                steps.push({ name: 'Send DM', success: true });

                // --- Step 6: Decrypt DM (Bob) ---
                // Switch to Bob
                nostrClient.logout();
                await nostrClient.registerPrivateKeySigner({ privateKey: hexSk2, pubkey: pk2 });

                await new Promise(r => setTimeout(r, 500));

                const dms = await nostrClient.listDirectMessages(pk2);
                const found = dms.find(m => m.plaintext === msg);

                if (!found) {
                     // Log details
                     return {
                         success: false,
                         steps,
                         logs,
                         error: "DM not found. Found: " + dms.map(d => d.plaintext).join(', ')
                     };
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
        recordStep('Smoke Test Suite', false, err);
        // Take screenshot if browser is active
        if (browser) {
            try {
                const page = browser.contexts()[0].pages()[0];
                if (page) {
                    await page.screenshot({ path: path.join(ARTIFACTS_DIR, `failure-${TIMESTAMP}.png`) });
                    log(`Screenshot saved to failure-${TIMESTAMP}.png`);
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

runSmokeTest();
