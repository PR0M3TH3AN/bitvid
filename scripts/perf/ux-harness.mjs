// Automated UX/perf harness with a FAKE nip-07 extension.
//
// Runs the real bitvid app in headless Chromium against an in-process mock relay,
// injecting a fake `window.nostr` extension backed by Node-side nostr-tools
// crypto (via page.exposeFunction). Each extension call is serialized through a
// queue with simulated latency to model a real browser extension, so load times
// and the decrypt-cache win are realistic and measurable.
//
// Captures: console logs, per-method extension call counts, timing milestones,
// and screenshots. Phase 1 verifies the fake extension + nip-07 login + render.
//
// Usage: node scripts/perf/ux-harness.mjs
//   env: APP=http://localhost:3000  LATENCY_MS=100  VIDEOS=40  HEADLESS=1

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import {
  finalizeEvent,
  getPublicKey,
  generateSecretKey,
  nip04,
} from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";
import { mkdir } from "node:fs/promises";

const APP = process.env.APP || "http://localhost:3000";
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 100);
const VIDEOS = Number(process.env.VIDEOS ?? 40);
const WS_PORT = 8961;
const SHOT_DIR = "artifacts/ux-harness";

const toHex = (u8) => Buffer.from(u8).toString("hex");

// --- Fake user identity (deterministic) ---
const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);

// --- Extension call accounting + serialized latency queue ---
const extCalls = {};
let queue = Promise.resolve();
function viaExtension(method, fn) {
  extCalls[method] = (extCalls[method] || 0) + 1;
  const run = async () => {
    if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
    return fn();
  };
  // Serialize like a real single-threaded extension.
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

function nip44ConvKey(peerPk) {
  return nip44.v2.utils.getConversationKey(USER_SK, peerPk);
}

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });
  const relay = startRelay(WS_PORT, { httpPort: false });
  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;

  // Seed the user's NIP-65 relay list so the app talks ONLY to the mock relay
  // (not real relays) after login — keeps the harness isolated and deterministic.
  relay.seedEvent(
    finalizeEvent(
      { kind: 10002, created_at: Math.floor(Date.now() / 1000), tags: [["r", relayUrl]], content: "" },
      USER_SK,
    ),
  );

  // Seed a few videos so the feed has content (heavy/encrypted data comes in phase 2).
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < VIDEOS; i++) {
    const dTag = `seed-${i}`;
    const content = JSON.stringify({
      version: 3,
      title: `Harness Video ${i}`,
      videoRootId: dTag,
      mode: "dev",
      isPrivate: false,
      deleted: false,
      url: `https://example.com/v${i}.mp4`,
    });
    relay.seedEvent(
      finalizeEvent(
        {
          kind: 30078,
          created_at: now - i * 60,
          tags: [["d", dTag], ["t", "video"], ["title", `Harness Video ${i}`], ["url", `https://example.com/v${i}.mp4`]],
          content,
        },
        USER_SK,
      ),
    );
  }
  console.log(`Seeded ${VIDEOS} videos. User pk=${USER_PK.slice(0, 12)}…`);

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // --- Expose Node-side crypto as the fake extension's backend ---
  await page.exposeFunction("__extGetPublicKey", () => viaExtension("getPublicKey", () => USER_PK));
  await page.exposeFunction("__extSignEvent", (event) =>
    viaExtension("signEvent", () => finalizeEvent({ ...event, pubkey: USER_PK }, USER_SK)),
  );
  await page.exposeFunction("__extNip04Encrypt", (pk, text) =>
    viaExtension("nip04.encrypt", () => nip04.encrypt(USER_SK, pk, text)),
  );
  await page.exposeFunction("__extNip04Decrypt", (pk, ct) =>
    viaExtension("nip04.decrypt", () => nip04.decrypt(USER_SK, pk, ct)),
  );
  await page.exposeFunction("__extNip44Encrypt", (pk, text) =>
    viaExtension("nip44.encrypt", () => nip44.v2.encrypt(text, nip44ConvKey(pk))),
  );
  await page.exposeFunction("__extNip44Decrypt", (pk, ct) =>
    viaExtension("nip44.decrypt", () => nip44.v2.decrypt(ct, nip44ConvKey(pk))),
  );

  // --- Inject window.nostr (the fake extension) before app code runs ---
  await page.addInitScript((url) => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
    localStorage.setItem("__bitvidTestRelays__", JSON.stringify([url]));
    localStorage.setItem("bitvid_admin_whitelist_mode", "false");
    window.__bitvidTestRelays__ = [url];
    window.nostr = {
      getPublicKey: () => window.__extGetPublicKey(),
      signEvent: (event) => window.__extSignEvent(event),
      getRelays: async () => ({}),
      nip04: {
        encrypt: (pk, text) => window.__extNip04Encrypt(pk, text),
        decrypt: (pk, ct) => window.__extNip04Decrypt(pk, ct),
      },
      nip44: {
        encrypt: (pk, text) => window.__extNip44Encrypt(pk, text),
        decrypt: (pk, ct) => window.__extNip44Decrypt(pk, ct),
        v2: {
          encrypt: (pk, text) => window.__extNip44Encrypt(pk, text),
          decrypt: (pk, ct) => window.__extNip44Decrypt(pk, ct),
        },
      },
    };
  }, relayUrl);

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).split("\n")[0]}`));

  const t0 = Date.now();
  const testUrl = `${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`;
  await page.goto(testUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});

  // Verify the app sees our fake extension.
  const sawExtension = await page.evaluate(() => typeof window.nostr?.getPublicKey === "function");
  await page.screenshot({ path: `${SHOT_DIR}/01-loaded.png` });

  // Drive the real nip-07 login UI.
  let loginErr = null;
  try {
    await page.click('[data-testid="login-button"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
    await page.screenshot({ path: `${SHOT_DIR}/02-login-modal.png` });
    // Pick the extension provider button (first provider, or by text).
    const extBtn = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
    if (await extBtn.count()) {
      await extBtn.click({ timeout: 5000 });
    } else {
      await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
    }
  } catch (e) {
    loginErr = String(e).split("\n")[0];
  }
  await page.waitForTimeout(3000);

  const state = await page.evaluate(async () => {
    try {
      const s = await window.__bitvidTest__?.getAppState?.();
      return s || null;
    } catch (_) {
      return null;
    }
  });

  // Feed render timing + count.
  let firstCardMs = null;
  try {
    await page.waitForSelector("[data-video-id]", { timeout: 15000 });
    firstCardMs = Date.now() - t0;
  } catch (_) {}
  const cardCount = await page.evaluate(() => document.querySelectorAll("[data-video-id]").length);
  await page.screenshot({ path: `${SHOT_DIR}/03-after-login.png` });

  console.log("\n================ UX HARNESS (phase 1) ================");
  console.log(`App saw fake window.nostr: ${sawExtension}`);
  console.log(`Login UI error: ${loginErr || "none"}`);
  console.log(`Logged in: ${state?.isLoggedIn} as ${state?.activePubkey?.slice(0, 12)}…`);
  console.log(`Relays: ${JSON.stringify(state?.relays?.all)}`);
  console.log(`Time-to-first-video-card: ${firstCardMs === null ? "NEVER" : firstCardMs + "ms"} (${cardCount} cards)`);
  console.log(`Extension calls (latency=${LATENCY_MS}ms each): ${JSON.stringify(extCalls)}`);
  console.log(`Elapsed: ${Date.now() - t0}ms`);
  const interesting = logs.filter((l) => /error|warn|fail|login|nip07|extension|reject/i.test(l)).slice(0, 25);
  console.log(`\nConsole (filtered):`);
  interesting.forEach((l) => console.log("  " + l));
  console.log(`\nScreenshots in ${SHOT_DIR}/`);
  console.log("=====================================================\n");

  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("ux-harness failed:", e);
  process.exit(1);
});
