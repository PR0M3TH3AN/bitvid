/**
 * Agent Smoke Test
 * Verified flows: Login, Publish (Video), DM Decrypt (NIP-04/44)
 */
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

async function startProcess(command, args, name) {
  log(`Starting ${name}...`);
  const proc = spawn(command, args, {
    cwd: ROOT_DIR,
    stdio: 'pipe', // Capture output
    env: process.env
  });

  proc.stdout.on('data', (data) => {
    log(`[${name}] ${data.toString().trim()}`);
  });

  proc.stderr.on('data', (data) => {
     log(`[${name} ERR] ${data.toString().trim()}`);
  });

  proc.on('error', (err) => {
    log(`[${name}] Failed to start: ${err.message}`);
  });

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  return proc;
}

async function run() {
  let serverProcess;
  let relayProcess;
  let browser;
  let exitCode = 0;

  try {
    // 1. Start Relay
    relayProcess = await startProcess('node', ['scripts/agent/simple-relay.mjs'], 'LocalRelay');

    // 2. Start Web Server
    serverProcess = await startProcess('python3', ['-m', 'http.server', '8000'], 'WebServer');

    log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (text.startsWith('[SmokeTest]')) {
          log(text);
      } else if (type === 'error') {
          log(`BROWSER ERROR: ${text}`);
      }
    });

    page.on('pageerror', err => {
      log(`PAGE ERROR: ${err.message}`);
    });

    log('Navigating to http://127.0.0.1:8000 ...');
    await page.goto('http://127.0.0.1:8000');

    // Wait for App and NostrTools
    log('Waiting for app and NostrTools...');
    await page.waitForFunction(() => window.NostrTools && document.querySelector('#app'), { timeout: 15000 });
    log('App loaded and NostrTools available.');

    // Inject test logic
    log('Running in-page smoke test logic...');

    const result = await page.evaluate(async () => {
      const logs = [];
      function pageLog(m) {
          const msg = `[SmokeTest] ${m}`;
          console.log(msg);
          logs.push(msg);
      }

      try {
        const RELAY_URL = 'ws://localhost:8008';
        pageLog(`Test Relay: ${RELAY_URL}`);

        // 1. Import Modules
        const { nostrClient } = await import('./js/nostrClientFacade.js');
        const { decryptDM } = await import('./js/dmDecryptor.js');
        const NostrTools = window.NostrTools;

        if (!nostrClient) throw new Error('nostrClient import failed');
        if (!decryptDM) throw new Error('decryptDM import failed');

        // 2. Configure Client
        pageLog('Configuring nostrClient...');
        nostrClient.relays = [RELAY_URL];
        nostrClient.writeRelays = [RELAY_URL];
        nostrClient.readRelays = [RELAY_URL];

        // Force connection logic if needed, but adding to relays list usually triggers connection attempt in client
        // Check pool if available
        if (nostrClient.pool) {
            await nostrClient.pool.ensureRelay(RELAY_URL);
        }

        // Wait for connection
        pageLog('Waiting for relay connection...');
        await new Promise(r => setTimeout(r, 1000));

        // 3. Generate Identity & Login
        pageLog('Generating ephemeral keys...');

        // Helper since NostrTools.bytesToHex might be missing depending on version/bundle
        function toHex(bytes) {
            return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        const skBytes = NostrTools.generateSecretKey();
        const sk = toHex(skBytes);
        const pk = NostrTools.getPublicKey(skBytes);
        pageLog(`Generated Pubkey: ${pk}`);

        await nostrClient.registerPrivateKeySigner({ privateKey: sk, pubkey: pk });
        pageLog('Logged in.');

        // 4. Publish Video
        pageLog('Publishing VIDEO_POST...');
        const videoRootId = `smoke-${Date.now()}`;
        const videoPayload = {
            legacyFormData: {
                title: `Smoke Test Video ${Date.now()}`,
                description: 'Smoke test artifact',
                url: 'https://example.com/smoke.mp4',
                magnet: 'magnet:?xt=urn:btih:c9e15763f722f23e98ce29a8c0c4000000000000&dn=smoke',
                mimeType: 'video/mp4',
                isForKids: false,
                isNsfw: false,
                isPrivate: true
            },
            fileSha256: '0000000000000000000000000000000000000000000000000000000000000000'
        };

        const pubEvent = await nostrClient.publishVideo(videoPayload, pk);
        if (!pubEvent || !pubEvent.id) throw new Error('Publish failed, no event returned');
        pageLog(`Video published: ${pubEvent.id}`);

        // 5. Verify Video Readback
        pageLog('Verifying video readback...');
        await new Promise(r => setTimeout(r, 500)); // Propagate
        const fetched = await nostrClient.getEventById(pubEvent.id);
        if (!fetched || fetched.id !== pubEvent.id) throw new Error('Failed to fetch video event');
        pageLog('Video verified.');

        // 6. DM Flow (Self-DM)
        pageLog('Testing DM flow (Self-Send)...');
        const message = `Smoke DM ${Date.now()}`;
        const npub = NostrTools.nip19.npubEncode(pk);

        const dmRes = await nostrClient.sendDirectMessage(npub, message);
        if (!dmRes.ok) throw new Error(`DM Send failed: ${dmRes.error}`);
        pageLog('DM sent.');

        // 7. Fetch & Decrypt
        pageLog('Fetching DM...');
        await new Promise(r => setTimeout(r, 500));

        // We use listDirectMessages which handles fetching and decrypting usually,
        // BUT the prompt asks to "verify decryption via js/dmDecryptor.js".
        // `nostrClient.listDirectMessages` might use `dmDecryptor` internally or have its own logic.
        // Let's manually fetch the raw event and decrypt it to be sure we are testing `dmDecryptor.js`.

        const filter = {
            kinds: [4, 1059],
            '#p': [pk],
            limit: 10
        };
        const events = await nostrClient.pool.list([RELAY_URL], [filter]);
        const targetEvent = events.find(e => e.pubkey === pk); // Sent by self

        if (!targetEvent) throw new Error('DM event not found on relay');
        pageLog(`Found DM event kind ${targetEvent.kind}`);

        // Setup Decrypt Context
        const decryptors = [];

        // NIP-44
        if (NostrTools.nip44) {
             decryptors.push({
                 scheme: 'nip44',
                 decrypt: (pk, ct) => NostrTools.nip44.decrypt(sk, pk, ct),
                 priority: 1,
                 supportsGiftWrap: true
             });
        }
        // NIP-04
        if (NostrTools.nip04) {
             decryptors.push({
                 scheme: 'nip04',
                 decrypt: async (pk, ct) => NostrTools.nip04.decrypt(sk, pk, ct),
                 priority: 0
             });
        }

        const context = {
            actorPubkey: pk,
            decryptors
        };

        pageLog('Decrypting...');
        const decrypted = await decryptDM(targetEvent, context);

        if (!decrypted.ok) {
            console.error('Decryption errors:', decrypted.errors);
            throw new Error('Decryption failed');
        }

        if (decrypted.plaintext !== message) {
             throw new Error(`Message mismatch: Got "${decrypted.plaintext}", expected "${message}"`);
        }

        pageLog('Decryption verified!');

        return { success: true, logs };

      } catch (e) {
        pageLog(`FATAL: ${e.message}`);
        return { success: false, error: e.message, stack: e.stack, logs };
      }
    });

    if (result.success) {
      log('SMOKE TEST PASSED');
      const summary = {
        timestamp: new Date().toISOString(),
        status: 'success',
        logs: result.logs
      };
      fs.writeFileSync(path.join(ARTIFACTS_DIR, `smoke-summary-${DATE_STR}.json`), JSON.stringify(summary, null, 2));
    } else {
      log('SMOKE TEST FAILED');
      log(`Error: ${result.error}`);

      const screenshotPath = path.join(ARTIFACTS_DIR, `smoke-fail-${DATE_STR}.png`);
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved: ${screenshotPath}`);

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
    log(`SCRIPT ERROR: ${err.message}`);
    console.error(err);
    exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
    if (relayProcess) relayProcess.kill();
  }

  process.exit(exitCode);
}

run();
