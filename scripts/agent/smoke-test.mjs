#!/usr/bin/env node

/**
 * bitvid smoke test harness
 *
 * Runs a minimal end-to-end smoke test verifying:
 * 1. App startup
 * 2. Relay connection
 * 3. Ephemeral login
 * 4. Video publishing (via UI)
 * 5. DM encryption/decryption (via client/decryptor)
 *
 * Usage:
 *   node scripts/agent/smoke-test.mjs [--serve=npx|python|none] [--relays=ws://...] [--out=artifacts/]
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateSecretKey, getPublicKey, finalizeEvent, nip04, nip19 } from "nostr-tools";
import { startRelay } from "./simple-relay.mjs";
import http from "node:http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration & Defaults ---

// --- Helpers (Hoisted) ---

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parseArgs() {
  const args = {
    serve: "npx", // npx, python, none
    relays: null,
    out: "artifacts",
    timeout: 30,
  };

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith("--serve=")) args.serve = arg.split("=")[1];
    if (arg.startsWith("--relays=")) args.relays = arg.split("=")[1];
    if (arg.startsWith("--out=")) args.out = arg.split("=")[1];
    if (arg.startsWith("--timeout=")) args.timeout = parseInt(arg.split("=")[1]);
  });

  return args;
}

const ARGS = parseArgs();
const OUT_DIR = ARGS.out || "artifacts";
const SCREENSHOT_DIR = path.join(OUT_DIR, `smoke-${getTimestamp()}-screenshots`);
const LOG_FILE = path.join(OUT_DIR, `smoke-${getTimestamp()}.log`);
const SUMMARY_FILE = path.join(OUT_DIR, `smoke-${getTimestamp()}.json`);
const RELAY_PORT = 8877;
const HTTP_PORT = 8000;
const TIMEOUT_MS = (ARGS.timeout || 30) * 1000;

// --- State ---

let browser;
let context;
let page;
let serverProcess;
let relayServer;
const artifacts = {
  steps: [],
  duration: 0,
  result: "pending",
  errors: [],
};
const startTime = Date.now();

// --- Main ---

function setupArtifacts() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
}

async function main() {
  try {
    setupArtifacts();
    log("Starting smoke test...");

    // 1. Start Relay
    await step("Start Relay", async () => {
      if (ARGS.relays) {
        log(`Using external relays: ${ARGS.relays}`);
      } else {
        log(`Starting local relay on port ${RELAY_PORT}...`);
        relayServer = startRelay(RELAY_PORT, { httpPort: RELAY_PORT + 1 });
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Give it a moment
      }
    });

    // 2. Start Server
    await step("Start App Server", async () => {
      if (ARGS.serve === "none") {
        log("Skipping server start (assuming external server running).");
      } else {
        const cmd = ARGS.serve === "python" ? "python3" : "npx";
        const args = ARGS.serve === "python"
          ? ["-m", "http.server", String(HTTP_PORT)]
          : ["serve", ".", "-l", String(HTTP_PORT)];

        log(`Starting server: ${cmd} ${args.join(" ")}`);
        serverProcess = spawn(cmd, args, { stdio: "pipe", shell: true });

        serverProcess.stdout.on("data", (data) => {
          // fs.appendFileSync(LOG_FILE, `[server] ${data}`);
        });
        serverProcess.stderr.on("data", (data) => {
          fs.appendFileSync(LOG_FILE, `[server-err] ${data}`);
        });

        // Wait for port to be open
        await waitForPort(HTTP_PORT);
      }
    });

    // 3. Launch Browser
    await step("Launch Browser", async () => {
      browser = await chromium.launch({ headless: true });
      context = await browser.newContext();
      page = await context.newPage();

      // Console logging
      page.on("console", (msg) => {
        const text = msg.text();
        // fs.appendFileSync(LOG_FILE, `[browser] ${text}\n`);
        if (msg.type() === "error") {
            log(`[browser-error] ${text}`);
        }
      });

      page.on("pageerror", (err) => {
        log(`[page-error] ${err.message}`);
        artifacts.errors.push(err.message);
      });
    });

    // 4. Navigate & Setup
    await step("Navigate to App", async () => {
      const relayUrl = ARGS.relays || `ws://localhost:${RELAY_PORT}`;
      const url = `http://localhost:${HTTP_PORT}/?__test__=1`;

      log(`Navigating to ${url}...`);

      // Inject relay override via localStorage before navigation to ensure clean state
      await page.addInitScript((rUrl) => {
        localStorage.setItem("__bitvidTestRelays__", JSON.stringify([rUrl]));
        localStorage.setItem("__bitvidTestMode__", "1");
        // Disable whitelist mode for tests
        localStorage.setItem("bitvid_admin_whitelist_mode", "false");
        // Bypass disclaimer
        localStorage.setItem("hasSeenDisclaimer", "true");
      }, relayUrl);

      await page.goto(url);
      await page.waitForLoadState("networkidle");

      // Verify harness
      const harnessAvailable = await page.evaluate(() => typeof window.__bitvidTest__ !== "undefined");
      if (!harnessAvailable) {
        throw new Error("Test harness (window.__bitvidTest__) not found!");
      }
    });

    // 5. Login
    let userPubkey;
    await step("Login", async () => {
      const sk = generateSecretKey();
      const skHex = Buffer.from(sk).toString("hex");
      userPubkey = await page.evaluate(async (key) => {
        return window.__bitvidTest__.loginWithNsec(key);
      }, skHex);

      if (!userPubkey) throw new Error("Login failed to return pubkey");
      log(`Logged in as ${userPubkey}`);

      // Wait for UI to reflect login (upload button visible)
      await page.waitForSelector('[data-testid="upload-button"]', { timeout: 5000 });
    });

    // 6. Publish Video (UI)
    await step("Publish Video", async () => {
      const title = `Smoke Test Video ${Date.now()}`;
      // Use a valid magnet link for testing
      const magnet = "magnet:?xt=urn:btih:08ada5a716bf9f5f3fb7dd3dec6cc79060df93d9&dn=test_video.mp4&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com";

      // Handle confirm dialog for magnet-only upload
      page.once('dialog', async dialog => {
        log(`Dialog appeared: ${dialog.message()}`);
        await dialog.accept();
      });

      log("Opening upload modal...");
      await page.click('[data-testid="upload-button"]');
      await page.waitForSelector('[data-testid="upload-modal"]', { state: "visible" });

      log("Switching to External Source mode...");
      await page.click('#btn-mode-external');

      log("Filling upload form...");
      await page.fill('[data-testid="upload-title"]', title);
      await page.waitForSelector('[data-testid="upload-magnet"]', { state: "visible" });
      await page.fill('[data-testid="upload-magnet"]', magnet);

      log("Submitting...");
      await page.click('[data-testid="upload-submit"]');

      log("Waiting for publish confirmation...");
      // Wait for modal to close or success message
      // Note: The UI might show a toast or close the modal.
      // We check if the video appears in the feed.
      // Wait for modal to disappear
      await page.waitForSelector('[data-testid="upload-modal"]', { state: "hidden", timeout: 15000 });

      log("Verifying video in feed...");
      // Reload feed or wait for it to appear
      // Bitvid usually refreshes the feed after upload.
      // We look for the title in the feed.
      await page.waitForFunction((t) => {
        const titles = Array.from(document.querySelectorAll('[data-video-title]')).map(el => el.getAttribute('data-video-title'));
        return titles.includes(t);
      }, title, { timeout: 15000 });

      log("Video found in feed!");
    });

    // 7. DM Roundtrip (Client + Decryptor)
    await step("DM Roundtrip", async () => {
      // 1. Generate Recipient (User B)
      const skB = generateSecretKey();
      const pkB = getPublicKey(skB);
      const pkBHex = pkB; // nostr-tools returns hex string for getPublicKey

      const message = `Smoke Test DM ${Date.now()}`;

      log(`Sending DM to ${pkBHex}...`);

      // 2. User A sends DM to User B using client in browser
      const eventId = await page.evaluate(async ({ recipient, text }) => {
        const client = window.__bitvidTest__.nostrClient;
        if (!client) throw new Error("nostrClient not available");

        // Encrypt content (NIP-04)
        // We need an active signer. Login should have set one.
        const signer = client.signerManager.getActiveSigner();
        if (!signer) throw new Error("No active signer");

        // We use client.publishEvent or build it manually?
        // Let's use nip04 encrypt if available on signer
        let ciphertext;
        if (signer.nip04Encrypt) {
          ciphertext = await signer.nip04Encrypt(recipient, text);
        } else {
             // If signer doesn't support it directly (e.g. standard NIP-07 might, but our test harness uses privateKeySigner which usually does)
             // Check if window.NostrTools is available for fallback
             throw new Error("Signer does not support nip04Encrypt");
        }

        const event = {
          kind: 4,
          created_at: Math.floor(Date.now() / 1000),
          tags: [['p', recipient]],
          content: ciphertext,
          pubkey: signer.pubkey,
        };

        const { signedEvent } = await client.signAndPublishEvent(event);
        return signedEvent.id;
      }, { recipient: pkBHex, text: message });

      log(`DM Sent. Event ID: ${eventId}`);

      // 3. Verify Receipt & Decryption
      // We inject a script to verify decryption using the recipient's key.
      // We need to import decryptDM from js/dmDecryptor.js.
      // Since we are in the browser context (served by npx serve), we can dynamic import.

      log("Verifying decryption...");

      // Pass the private key of User B to the browser to decrypt
      // Note: we can't pass Uint8Array easily, so pass hex.
      const skBHex = Buffer.from(skB).toString("hex");

      const decrypted = await page.evaluate(async ({ eventId, skHex, senderPubkey }) => {
        // Wait for event to be available in pool/cache or fetch it
        const client = window.__bitvidTest__.nostrClient;
        const event = await client.fetchRawEventById(eventId);
        if (!event) throw new Error("DM event not found on relay");

        // Dynamic import decryptDM
        const { decryptDM } = await import("/js/dmDecryptor.js");

        // Mock the context for decryptDM
        // We need a decryptor capable of decrypting for User B.
        // We can use window.NostrTools.nip04.decrypt if available, or just implement it.

        // Minimal NIP-04 decrypt implementation if tools aren't global
        // But bitvid usually loads NostrTools globally or via module.
        // Let's rely on client.tools or window.NostrTools if available.

        const tools = window.NostrTools || (client.tools);
        if (!tools || !tools.nip04) throw new Error("NostrTools.nip04 not available for verification");

        const decryptor = {
            scheme: "nip04",
            decrypt: async (pubkey, ciphertext) => {
                return tools.nip04.decrypt(skHex, pubkey, ciphertext);
            }
        };

        const context = {
            actorPubkey: window.NostrTools.getPublicKey(skHex), // User B's pubkey
            decryptors: [decryptor]
        };

        const result = await decryptDM(event, context);

        if (!result.ok) {
            throw new Error(`Decryption failed: ${JSON.stringify(result.errors)}`);
        }

        return result.plaintext;
      }, { eventId, skHex: skBHex, senderPubkey: userPubkey });

      if (decrypted !== message) {
        throw new Error(`Decryption mismatch! Expected: "${message}", Got: "${decrypted}"`);
      }

      log(`Decryption verified: "${decrypted}"`);
    });

    artifacts.result = "pass";
    log("Smoke test PASSED!");

  } catch (err) {
    log(`FATAL ERROR: ${err.message}`);
    console.error(err);
    artifacts.result = "fail";
    artifacts.errors.push(err.message);

    // Capture screenshot on failure
    if (page) {
      try {
        const screenshotPath = path.join(SCREENSHOT_DIR, "failure.png");
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        log(`Screenshot saved to ${screenshotPath}`);
      } catch (e) {
        log(`Failed to save screenshot: ${e.message}`);
      }
    }

    process.exitCode = 1;
  } finally {
    // Teardown
    log("Cleaning up...");
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
    if (relayServer) await relayServer.close();

    artifacts.duration = (Date.now() - startTime) / 1000;
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(artifacts, null, 2));
    log(`Artifacts written to ${OUT_DIR}`);
  }
}

// --- Helpers ---

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + "\n");
}

async function step(name, fn) {
  log(`STEP: ${name}`);
  const start = Date.now();
  try {
    // Race with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Step "${name}" timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
    );

    await Promise.race([fn(), timeoutPromise]);

    artifacts.steps.push({ name, duration: (Date.now() - start) / 1000, status: "pass" });
    log(`  -> Passed (${((Date.now() - start) / 1000).toFixed(2)}s)`);
  } catch (err) {
    artifacts.steps.push({ name, duration: (Date.now() - start) / 1000, status: "fail", error: err.message });
    log(`  -> FAILED: ${err.message}`);
    throw err;
  }
}

function waitForPort(port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.request({ port, method: 'HEAD', timeout: 500 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timed out waiting for port ${port}`));
        } else {
          setTimeout(check, 500);
        }
      });
      req.end();
    };
    check();
  });
}

main();
