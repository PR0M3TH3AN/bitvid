import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR);
}

const DATE_STR = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${DATE_STR}.log`);

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function startServer() {
  log('Starting local server (python3)...');
  const serverProcess = spawn('python3', ['-m', 'http.server', '8000'], {
    cwd: ROOT_DIR,
    stdio: 'ignore'
  });

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  return serverProcess;
}

async function run() {
  let serverProcess;
  let browser;
  let exitCode = 0;

  try {
    serverProcess = await startServer();

    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
      const text = msg.text();
      // Filter out some noise if needed, but keeping it is safer for debugging
      if (msg.type() === 'error') {
        log(`BROWSER ERROR: ${text}`);
      } else {
        // log(`BROWSER: ${text}`); // Optional verbose logging
      }
    });

    page.on('pageerror', err => {
      log(`PAGE ERROR: ${err.message}`);
    });

    log('Navigating to app...');
    await page.goto('http://localhost:8000');

    // Wait for app to load (checking for #app or similar)
    await page.waitForSelector('#app', { timeout: 10000 });
    log('App loaded.');

    // Inject test logic
    log('Running in-page smoke test...');
    const result = await page.evaluate(async () => {
      const logs = [];
      function pageLog(m) { logs.push(m); console.log('[SmokeTest] ' + m); }

      try {
        // 1. Import Client
        pageLog('Importing nostrClient...');
        const { nostrClient } = await import('./js/nostrClientFacade.js');
        const { NostrTools } = window; // Assumed to be loaded via script tag in index.html

        if (!nostrClient) throw new Error('nostrClient not found');
        if (!NostrTools) throw new Error('NostrTools not found on window');

        // Override relays to a specific subset to avoid spamming all defaults if local relay is not available
        // Ideally this would be a local relay, but we use a public one for the smoke test as fallback.
        const TEST_RELAY = 'wss://relay.damus.io';
        pageLog(`Configuring nostrClient to use ${TEST_RELAY}...`);

        // If nostrClient is already initialized, we might need to reconnect or just update properties
        nostrClient.relays = [TEST_RELAY];
        nostrClient.writeRelays = [TEST_RELAY];
        nostrClient.readRelays = [TEST_RELAY];

        if (nostrClient.pool) {
             // Ensure connection to our test relay
             await nostrClient.pool.ensureRelay(TEST_RELAY);
        }

        // Wait a bit for connection
        pageLog('Waiting for relay connection...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 2. Generate Identity
        pageLog('Generating ephemeral identity...');

        const bytesToHex = (bytes) => {
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        let privateKey;
        if (NostrTools.generateSecretKey) {
            const secret = NostrTools.generateSecretKey();
            if (secret instanceof Uint8Array) {
                privateKey = bytesToHex(secret);
            } else {
                privateKey = secret;
            }
        } else {
            privateKey = NostrTools.generatePrivateKey();
        }

        const pubkey = NostrTools.getPublicKey(privateKey);
        pageLog(`Generated pubkey: ${pubkey}`);

        // 3. Login
        pageLog('Logging in...');
        await nostrClient.registerPrivateKeySigner({ privateKey, pubkey });

        // 4. Publish Video
        pageLog('Publishing video...');
        const videoPayload = {
            legacyFormData: { // extractVideoPublishPayload expects this structure or direct fields
                title: `Smoke Test Video ${Date.now()}`,
                description: 'Automated smoke test artifact',
                url: 'https://example.com/video.mp4',
                magnet: 'magnet:?xt=urn:btih:c9e15763f722f23e98ce29a8c0c4000000000000&dn=test', // Valid-ish magnet
                mimeType: 'video/mp4',
                isForKids: false,
                isNsfw: false,
                isPrivate: true,
            },
            fileSha256: '0000000000000000000000000000000000000000000000000000000000000000'
        };

        // Note: publishVideo takes (videoPayload, pubkey)
        const event = await nostrClient.publishVideo(videoPayload, pubkey);
        pageLog(`Video published! ID: ${event.id}`);

        // 5. Verify Read Back
        pageLog('Verifying read back...');
        // We can use getEventById
        const fetched = await nostrClient.getEventById(event.id);
        if (!fetched) throw new Error('Failed to fetch published video');
        if (fetched.id !== event.id) throw new Error('Fetched ID mismatch');
        pageLog('Read back successful.');

        // 6. DM Flow
        pageLog('Testing DM flow (Self-DM)...');
        // We'll send a DM to ourselves
        const npub = NostrTools.nip19.npubEncode(pubkey);
        const message = `Smoke Test DM ${Date.now()}`;

        const dmResult = await nostrClient.sendDirectMessage(npub, message);
        if (!dmResult.ok) throw new Error(`DM Send failed: ${dmResult.error}`);
        pageLog('DM Sent.');

        // Decrypt
        // We need to fetch it. listDirectMessages
        pageLog('Fetching and decrypting DMs...');
        // Allow some time for propagation to relay and back
        await new Promise(resolve => setTimeout(resolve, 2000));

        const dms = await nostrClient.listDirectMessages(pubkey, { limit: 10 });

        const match = dms.find(r => r.content === message || r.plaintext === message);

        if (!match) {
            pageLog('DM not found in list. Fetched count: ' + dms.length);
            console.log('DMs:', JSON.stringify(dms));
            throw new Error('DM verification failed');
        }

        pageLog('DM Verified.');

        return { success: true, logs };

      } catch (e) {
        pageLog(`ERROR: ${e.message}`);
        return { success: false, error: e.message, stack: e.stack, logs };
      }
    });

    if (result.success) {
      log('Smoke Test Passed!');
      result.logs.forEach(l => log(`[PAGE] ${l}`));

      const summary = {
        timestamp: new Date().toISOString(),
        status: 'success',
        steps: ['login', 'publish', 'dm_send', 'dm_decrypt'],
        logs: result.logs
      };
      fs.writeFileSync(path.join(ARTIFACTS_DIR, `smoke-summary-${DATE_STR}.json`), JSON.stringify(summary, null, 2));

    } else {
      log('Smoke Test Failed!');
      result.logs.forEach(l => log(`[PAGE] ${l}`));
      log(`Error: ${result.error}`);
      log(`Stack: ${result.stack}`);

      const screenshotPath = path.join(ARTIFACTS_DIR, `failure-${DATE_STR}.png`);
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved to ${screenshotPath}`);

      const summary = {
        timestamp: new Date().toISOString(),
        status: 'failure',
        error: result.error,
        logs: result.logs
      };
      fs.writeFileSync(path.join(ARTIFACTS_DIR, `smoke-summary-${DATE_STR}.json`), JSON.stringify(summary, null, 2));

      exitCode = 1;
    }

  } catch (err) {
    log(`CRITICAL ERROR: ${err.message}`);
    log(err.stack);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (serverProcess) {
      serverProcess.kill();
      log('Server stopped.');
    }
  }

  process.exit(exitCode);
}

run();
