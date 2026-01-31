import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8000;
const URL = `http://localhost:${PORT}`;
const ARTIFACTS_DIR = path.resolve('artifacts');
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.log`);
const SUMMARY_FILE = path.join(ARTIFACTS_DIR, 'smoke-summary.json');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR);
}

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // Ignore log write errors
  }
}

async function main() {
  log('Starting smoke test...');
  let serverProcess;
  let browser;

  try {
    // Start Python Server
    log('Starting local server (python3 -m http.server)...');
    serverProcess = spawn('python3', ['-m', 'http.server', String(PORT)], {
      stdio: 'ignore'
    });

    // Give it time to start
    await new Promise(r => setTimeout(r, 2000));

    // Launch Browser
    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture console logs from page
    page.on('console', msg => {
        if (msg.type() === 'error') {
            log(`[BROWSER ERROR] ${msg.text()}`);
        } else {
            // log(`[BROWSER] ${msg.text()}`); // verbose
        }
    });
    page.on('pageerror', err => log(`[BROWSER EXCEPTION] ${err}`));

    log(`Navigating to ${URL}...`);
    await page.goto(URL);
    await page.waitForLoadState('networkidle');
    log('Page loaded.');

    // Inject Test Logic
    log('Running in-browser smoke test...');

    const result = await page.evaluate(async () => {
      const logs = [];
      function browserLog(msg) {
        console.log(msg);
        logs.push(msg);
      }

      try {
        browserLog('Step 1: Importing Client...');
        const { nostrClient } = await import('./js/nostrClientFacade.js');
        const { encodeHexToNpub } = await import('./js/nostr/nip46Client.js');

        if (!nostrClient) throw new Error('nostrClient not found');
        browserLog('nostrClient imported.');

        browserLog('Step 2: Generating Key & Login...');
        const randomBytes = new Uint8Array(32);
        window.crypto.getRandomValues(randomBytes);
        const privateKey = Array.from(randomBytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        const { pubkey } = await nostrClient.registerPrivateKeySigner({ privateKey, persist: false });
        nostrClient.pubkey = pubkey; // Explicitly set it on the client instance

        if (!nostrClient.pubkey) throw new Error('Login failed: pubkey is null');
        browserLog(`Logged in as: ${nostrClient.pubkey}`);

        browserLog('Step 3: Connecting to Relays...');
        const connectResults = await nostrClient.connectToRelays();
        const successful = connectResults.filter(r => r.success);
        browserLog(`Connected to ${successful.length} relays.`);

        if (successful.length === 0) {
            browserLog('Warning: Failed to connect to any relay. Tests depending on network will likely fail or use local cache.');
        }

        browserLog('Step 4: Publishing Video...');
        const seriesId = `smoke-test-${Date.now()}-${Math.floor(Math.random()*1000)}`;

        const videoPayload = {
          title: "Smoke Test Video " + Date.now(),
          description: "Automated smoke test artifact.",
          url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          videoRootId: seriesId,
          mimeType: "video/mp4"
        };

        const videoEvent = await nostrClient.publishVideo(videoPayload, nostrClient.pubkey);
        browserLog(`Video published. Event ID: ${videoEvent.id}`);

        browserLog('Step 5: Verifying Video Presence...');
        const fetched = await nostrClient.getEventById(videoEvent.id);
        if (!fetched) throw new Error('Failed to retrieve video event from client cache/network.');
        browserLog('Video event verified.');

        browserLog('Step 6: DM Flow (Send to Self)...');
        const message = "Smoke test DM " + Date.now();
        const npub = encodeHexToNpub(nostrClient.pubkey);
        browserLog(`Sending DM to self (${npub})...`);

        const dmResult = await nostrClient.sendDirectMessage(npub, message);
        if (!dmResult.ok) throw new Error(`DM send failed: ${dmResult.error} ${JSON.stringify(dmResult.details || {})}`);
        browserLog('DM sent.');

        browserLog('Step 7: Verifying DM Decryption...');
        let found = null;
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const dms = await nostrClient.listDirectMessages(nostrClient.pubkey, { limit: 10 });
            found = dms.find(dm => dm.plaintext === message);
            if (found) break;
        }

        if (!found) {
             throw new Error('DM verification failed: Message not found in decrypted list after retries.');
        }

        browserLog('DM verified and decrypted successfully.');

        return { success: true, logs };
      } catch (err) {
        browserLog(`Error: ${err.message}`);
        return { success: false, error: err.message, stack: err.stack, logs };
      }
    });

    if (result.success) {
      log('SUCCESS: All smoke tests passed.');
      fs.writeFileSync(SUMMARY_FILE, JSON.stringify({
        status: 'success',
        timestamp: new Date().toISOString(),
        logs: result.logs
      }, null, 2));
    } else {
      log('FAILURE: Smoke tests failed.');
      log(`Error: ${result.error}`);
      fs.writeFileSync(SUMMARY_FILE, JSON.stringify({
        status: 'failure',
        timestamp: new Date().toISOString(),
        error: result.error,
        stack: result.stack,
        logs: result.logs
      }, null, 2));

      const screenshotPath = path.join(ARTIFACTS_DIR, 'smoke-failure.png');
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved to ${screenshotPath}`);

      process.exitCode = 1;
    }

  } catch (error) {
    log(`CRITICAL ERROR: ${error.message}`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
        log('Stopping server...');
        serverProcess.kill();
    }
  }
}

main();
