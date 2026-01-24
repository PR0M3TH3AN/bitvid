import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { startRelay } from './simple-relay.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

const TIMESTAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const LOG_FILE = path.join(ARTIFACTS_DIR, `smoke-${TIMESTAMP}.log`);
const SUMMARY_FILE = path.join(ARTIFACTS_DIR, `smoke-summary.json`);

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function runSmokeTest() {
  const startTime = new Date().toISOString();
  log('Starting smoke test...');

  // 1. Start Relay
  log('Starting local relay on port 8888...');
  const relay = startRelay(8888);

  // 2. Start Web Server
  log('Starting web server on port 8000...');
  const serverProcess = spawn('npx', ['serve', '-p', '8000'], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    shell: true
  });

  // Give server time to boot
  await new Promise(resolve => setTimeout(resolve, 2000));

  let browser;
  let testResult = { success: false, error: null };

  try {
    // 3. Launch Playwright
    log('Launching headless browser...');
    browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => log(`[BROWSER ERROR] ${err.message}`));

    log('Navigating to http://localhost:8000...');
    await page.goto('http://localhost:8000');

    log('Waiting for NostrTools...');
    await page.waitForFunction(() => window.NostrTools);

    // 4. Inject Test Script
    log('Injecting test script...');
    testResult = await page.evaluate(async () => {
      try {
        console.log('Test script started inside browser.');

        const { nostrClient } = await import('./js/nostrClientFacade.js');
        const { decryptDM } = await import('./js/dmDecryptor.js');
        const { bytesToHex } = window.NostrTools.utils || window.NostrTools; // Handle v2 or fallback
        const { generateSecretKey, getPublicKey } = window.NostrTools;

        // --- Setup ---
        console.log('Generating keys...');
        const sk = generateSecretKey();
        const pk = getPublicKey(sk);
        const privateKey = typeof sk === 'string' ? sk : bytesToHex(sk); // Handle if generateSecretKey returns hex (older versions)
        const pubkey = pk;

        console.log(`Test User Pubkey: ${pubkey}`);

        // Configure Client
        console.log('Configuring NostrClient...');
        nostrClient.relays = ['ws://localhost:8888'];
        nostrClient.readRelays = ['ws://localhost:8888'];
        nostrClient.writeRelays = ['ws://localhost:8888'];

        await nostrClient.init();

        // Login
        console.log('Logging in with private key...');
        await nostrClient.registerPrivateKeySigner({ privateKey, pubkey });

        // --- Video Flow ---
        console.log('Starting Video Flow...');
        const videoTitle = `Smoke Test Video ${Date.now()}`;
        const videoPayload = {
            legacyFormData: {
                title: videoTitle,
                description: 'Smoke test description',
                url: 'https://example.com/video.mp4',
                magnet: 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678&dn=video.mp4',
                mimeType: 'video/mp4',
                isForKids: false,
                isNsfw: false
            }
        };

        console.log('Publishing video...');
        const publishedEvent = await nostrClient.publishVideo(videoPayload, pubkey);
        console.log(`Published Video Event ID: ${publishedEvent.id}`);

        // Verify fetch
        console.log('Fetching videos to verify...');
        await new Promise(r => setTimeout(r, 1000));

        const videos = await nostrClient.fetchVideos({ limit: 10 });
        const found = videos.find(v => v.id === publishedEvent.id);

        if (!found) {
            throw new Error('Published video not found in fetch results.');
        }
        console.log('Video Flow Success: Video found.');

        // --- DM Flow ---
        console.log('Starting DM Flow (Self-DM)...');
        const dmMessage = `Smoke Test DM ${Date.now()}`;

        console.log('Sending DM...');
        const sendResult = await nostrClient.sendDirectMessage(window.NostrTools.nip19.npubEncode(pubkey), dmMessage);

        if (!sendResult.ok) {
            throw new Error(`DM Send failed: ${sendResult.error}`);
        }
        console.log('DM Sent.');

        // Verify Decryption explicitly using decryptDM
        console.log('Fetching raw DM event to verify decryption...');
        await new Promise(r => setTimeout(r, 1000));

        // We need to fetch the raw event. nostrClient.pool.list
        const events = await nostrClient.pool.list(['ws://localhost:8888'], [
            { kinds: [4, 1059], authors: [pubkey], limit: 10 } // Simplified filter for self-DM
        ]);

        // Find the event that corresponds to our message (we can't check content yet, so we try decrypting candidates)
        let foundAndDecrypted = false;
        const decryptContext = await nostrClient.buildDmDecryptContext(pubkey);

        for (const event of events) {
            try {
                const result = await decryptDM(event, decryptContext);
                if (result.ok && result.plaintext === dmMessage) {
                    foundAndDecrypted = true;
                    break;
                }
            } catch (e) {
                // Ignore decrypt errors for other events
            }
        }

        if (!foundAndDecrypted) {
             throw new Error('DM verification failed: Could not find or decrypt the sent message using decryptDM.');
        }

        console.log('DM Flow Success: Message decrypted and verified via decryptDM.');

        return { success: true };

      } catch (err) {
        console.error('In-browser test error:', err);
        return { success: false, error: err.toString(), stack: err.stack };
      }
    });

    if (testResult.success) {
      log('Test execution passed successfully.');
    } else {
      log(`Test execution failed: ${testResult.error}`);
      if (testResult.stack) log(testResult.stack);

      const screenshotPath = path.join(ARTIFACTS_DIR, 'smoke-failure.png');
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved to ${screenshotPath}`);
      process.exitCode = 1;
    }

  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
    testResult.error = err.message;
    process.exitCode = 1;
  } finally {
    log('Cleaning up...');
    if (browser) await browser.close();
    serverProcess.kill();
    relay.close();

    // Write JSON summary
    const summary = {
        timestamp: new Date().toISOString(),
        success: testResult.success === true,
        error: testResult.error || null,
        startTime,
        endTime: new Date().toISOString()
    };
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
    log(`Summary written to ${SUMMARY_FILE}`);

    log('Done.');
  }
}

runSmokeTest();
