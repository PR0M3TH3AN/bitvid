// Automated UX/perf harness with a FAKE nip-07 extension.
//
// Runs the real bitvid app in headless Chromium against an in-process mock relay,
// injecting a fake `window.nostr` extension backed by Node-side nostr-tools
// crypto (via context binding). Each extension call is serialized through a queue
// with simulated latency to model a real browser extension, so load times and the
// decrypt-cache win are realistic and measurable.
//
// Drives the real nip-07 login flow; isolates to the mock relay via a seeded
// NIP-65 list. Captures per-method extension call counts, feed-render timing, and
// screenshots. Can publish a watch history via the app and then reload to measure
// the decrypt-cache effect (cold vs warm extension call counts).
//
// Usage: node scripts/perf/ux-harness.mjs
//   env: APP=http://localhost:3000 LATENCY_MS=100 VIDEOS=40 WH_ITEMS=120 HEADLESS=1

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";
import { mkdir } from "node:fs/promises";

const APP = process.env.APP || "http://localhost:3000";
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 100);
const VIDEOS = Number(process.env.VIDEOS ?? 40);
const WH_ITEMS = Number(process.env.WH_ITEMS ?? 120);
const WS_PORT = 8961;
const SHOT_DIR = "artifacts/ux-harness";

const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);

// --- Extension call accounting + serialized latency queue ---
let extCalls = {};
let queue = Promise.resolve();
function resetExtCalls() {
  extCalls = {};
}
function viaExtension(method, fn) {
  extCalls[method] = (extCalls[method] || 0) + 1;
  const run = async () => {
    if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
    return fn();
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
const convKey = (peerPk) => nip44.v2.utils.getConversationKey(USER_SK, peerPk);

async function main() {
  await mkdir(SHOT_DIR, { recursive: true });
  const relay = startRelay(WS_PORT, { httpPort: false });
  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;

  // Seed NIP-65 relay list (isolation) + videos. Capture video ids for WH pointers.
  relay.seedEvent(
    finalizeEvent(
      { kind: 10002, created_at: Math.floor(Date.now() / 1000), tags: [["r", relayUrl]], content: "" },
      USER_SK,
    ),
  );
  const now = Math.floor(Date.now() / 1000);
  const videoIds = [];
  for (let i = 0; i < VIDEOS; i++) {
    const dTag = `seed-${i}`;
    const ev = finalizeEvent(
      {
        kind: 30078,
        created_at: now - i * 60,
        tags: [["d", dTag], ["t", "video"], ["title", `Harness Video ${i}`], ["url", `https://example.com/v${i}.mp4`]],
        content: JSON.stringify({ version: 3, title: `Harness Video ${i}`, videoRootId: dTag, mode: "live", isPrivate: false, deleted: false, url: `https://example.com/v${i}.mp4` }),
      },
      USER_SK,
    );
    relay.seedEvent(ev);
    videoIds.push(ev.id);
  }
  console.log(`Seeded ${VIDEOS} videos. User=${USER_PK.slice(0, 12)}…`);

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  // Context-level fake extension (survives reloads/new pages in this context).
  await context.exposeBinding("__extGetPublicKey", () => viaExtension("getPublicKey", () => USER_PK));
  await context.exposeBinding("__extSignEvent", (_s, event) => viaExtension("signEvent", () => finalizeEvent({ ...event, pubkey: USER_PK }, USER_SK)));
  await context.exposeBinding("__extNip04Encrypt", (_s, pk, t) => viaExtension("nip04.encrypt", () => nip04.encrypt(USER_SK, pk, t)));
  await context.exposeBinding("__extNip04Decrypt", (_s, pk, ct) => viaExtension("nip04.decrypt", () => nip04.decrypt(USER_SK, pk, ct)));
  await context.exposeBinding("__extNip44Encrypt", (_s, pk, t) => viaExtension("nip44.encrypt", () => nip44.v2.encrypt(t, convKey(pk))));
  await context.exposeBinding("__extNip44Decrypt", (_s, pk, ct) => viaExtension("nip44.decrypt", () => nip44.v2.decrypt(ct, convKey(pk))));

  await context.addInitScript((url) => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
    localStorage.setItem("__bitvidTestRelays__", JSON.stringify([url]));
    localStorage.setItem("bitvid_admin_whitelist_mode", "false");
    window.__bitvidTestRelays__ = [url];
    const w = (n) => (...a) => window[n](...a);
    window.nostr = {
      getPublicKey: () => w("__extGetPublicKey")(),
      signEvent: (e) => w("__extSignEvent")(e),
      getRelays: async () => ({}),
      nip04: { encrypt: (p, t) => w("__extNip04Encrypt")(p, t), decrypt: (p, c) => w("__extNip04Decrypt")(p, c) },
      nip44: {
        encrypt: (p, t) => w("__extNip44Encrypt")(p, t),
        decrypt: (p, c) => w("__extNip44Decrypt")(p, c),
        v2: { encrypt: (p, t) => w("__extNip44Encrypt")(p, t), decrypt: (p, c) => w("__extNip44Decrypt")(p, c) },
      },
    };
  }, relayUrl);

  const testUrl = `${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`;

  // A single session: open page, log in via the fake extension, bypass feed
  // verification (seeded data), wait for the feed. Returns timing + the page.
  async function session(label) {
    const page = await context.newPage();
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 240)));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).split("\n")[0]}`));
    const t0 = Date.now();
    await page.goto(testUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
    await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
    await page.evaluate(() => {
      const c = window.__bitvidTest__?.nostrClient;
      if (c) c.videoEventVerifier = async (events) => new Set((events || []).map((e) => e && e.id).filter(Boolean));
    }).catch(() => {});
    // Drive nip-07 login UI.
    try {
      await page.click('[data-testid="login-button"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
      const extBtn = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
      if (await extBtn.count()) await extBtn.click({ timeout: 5000 });
      else await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
    } catch (_) {}
    await page.waitForFunction(async () => {
      const s = await window.__bitvidTest__?.getAppState?.();
      return s?.isLoggedIn === true;
    }, { timeout: 15000 }).catch(() => {});
    return { page, t0, logs };
  }

  // --- Session 1: log in, publish a watch history, screenshot. ---
  const s1 = await session("seed");
  let firstCardMs = null;
  try {
    await s1.page.waitForSelector("[data-video-id]", { timeout: 15000 });
    firstCardMs = Date.now() - s1.t0;
  } catch (_) {}
  await s1.page.screenshot({ path: `${SHOT_DIR}/03-after-login.png` });

  let published = null;
  if (WH_ITEMS > 0) {
    // Watch-history pointers are just references; generate distinct valid 64-hex
    // ids so the snapshot chunks into ~WH_ITEMS/10 encrypted events.
    const hex = (i) => (i.toString(16).padStart(8, "0") + "a".repeat(56)).slice(0, 64);
    const items = Array.from({ length: WH_ITEMS }, (_, i) => ({
      type: "e",
      value: hex(i + 1),
      watchedAt: now - i * 30,
    }));
    published = await s1.page.evaluate(async (its) => {
      const c = window.__bitvidTest__?.nostrClient;
      if (!c || typeof c.publishWatchHistorySnapshot !== "function") return { ok: false, reason: "no-method" };
      try {
        const r = await c.publishWatchHistorySnapshot(its, {});
        return { ok: true, result: r ? (r.ok ?? true) : true };
      } catch (e) {
        return { ok: false, reason: String(e).split("\n")[0] };
      }
    }, items).catch((e) => ({ ok: false, reason: String(e) }));
    await s1.page.waitForTimeout(1500); // let publishes flush to the relay
  }
  const seedCalls = { ...extCalls };
  await s1.page.close();

  // --- Session 2: cold reload — measures watch-history decrypt via the extension. ---
  resetExtCalls();
  const s2 = await session("cold");
  await s2.page.waitForTimeout(6000); // let watch history load/decrypt in the background
  const coldCalls = { ...extCalls };
  await s2.page.close();

  // --- Session 3: warm reload — decrypt cache should skip the extension. ---
  resetExtCalls();
  const s3 = await session("warm");
  await s3.page.waitForTimeout(6000);
  const warmCalls = { ...extCalls };
  await s3.page.close();

  console.log("\n================ UX HARNESS ================");
  console.log(`Time-to-first-video-card: ${firstCardMs === null ? "NEVER" : firstCardMs + "ms"}`);
  console.log(`Watch history published: ${JSON.stringify(published)} (${WH_ITEMS} items)`);
  console.log(`\nExtension calls (latency=${LATENCY_MS}ms each, serialized):`);
  console.log(`  seed session: ${JSON.stringify(seedCalls)}`);
  console.log(`  COLD reload : ${JSON.stringify(coldCalls)}   <- watch-history decrypts via extension`);
  console.log(`  WARM reload : ${JSON.stringify(warmCalls)}   <- should be ~0 nip44.decrypt (cache hit)`);
  const dCold = coldCalls["nip44.decrypt"] || 0;
  const dWarm = warmCalls["nip44.decrypt"] || 0;
  console.log(`\nnip44.decrypt: cold=${dCold} warm=${dWarm} -> cache ${dWarm < dCold ? "WORKS ✓" : "no effect"} (saved ${dCold - dWarm} extension calls, ~${((dCold - dWarm) * LATENCY_MS) / 1000}s at ${LATENCY_MS}ms each)`);
  console.log("===========================================\n");

  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("ux-harness failed:", e);
  process.exit(1);
});
