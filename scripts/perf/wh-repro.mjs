// Focused watch-history decrypt reproduction with FRESH contexts per session
// (so the persisted decrypt cache doesn't warm between cold/warm runs), and
// page-side capture of where window.nostr.nip44.decrypt is actually called from.
//
// Usage: node scripts/perf/wh-repro.mjs   (env: WH_ITEMS=200)

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

const APP = process.env.APP || "http://localhost:3000";
const WH_ITEMS = Number(process.env.WH_ITEMS ?? 200);
const WS_PORT = 8963;
const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);

let calls = 0;
const cts = new Map(); // ciphertext -> count
const convKey = (pk) => nip44.v2.utils.getConversationKey(USER_SK, pk);

async function setupContext(browser, relayUrl) {
  const context = await browser.newContext();
  await context.exposeBinding("__gpk", () => USER_PK);
  await context.exposeBinding("__sign", (_s, e) => finalizeEvent({ ...e, pubkey: USER_PK }, USER_SK));
  await context.exposeBinding("__n44e", (_s, pk, t) => nip44.v2.encrypt(t, convKey(pk)));
  await context.exposeBinding("__n44d", (_s, pk, ct) => {
    calls += 1;
    cts.set(ct, (cts.get(ct) || 0) + 1);
    return nip44.v2.decrypt(ct, convKey(pk));
  });
  await context.exposeBinding("__stack", (_s, s) => {
    // log only the first few distinct stacks
    if (setupContext._stacks === undefined) setupContext._stacks = new Set();
    if (setupContext._stacks.size < 4) {
      setupContext._stacks.add(s);
      console.log("STACK>", s);
    }
  });
  await context.addInitScript((url) => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
    localStorage.setItem("__bitvidTestRelays__", JSON.stringify([url]));
    localStorage.setItem("bitvid_admin_whitelist_mode", "false");
    const w = (n) => (...a) => window[n](...a);
    const n44d = (p, c) => {
      try { window.__stack((new Error().stack || "").split("\n").slice(1, 5).join(" <- ")); } catch (_) {}
      return w("__n44d")(p, c);
    };
    window.nostr = {
      getPublicKey: () => w("__gpk")(),
      signEvent: (e) => w("__sign")(e),
      getRelays: async () => ({}),
      nip04: { encrypt: async () => "", decrypt: async () => "" },
      nip44: { encrypt: (p, t) => w("__n44e")(p, t), decrypt: n44d, v2: { encrypt: (p, t) => w("__n44e")(p, t), decrypt: n44d } },
    };
  }, relayUrl);
  return context;
}

async function login(context, relayUrl) {
  const page = await context.newPage();
  await page.goto(`${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page.evaluate((u) => window.__bitvidTest__?.setTestRelays?.([u], { persist: false }), relayUrl).catch(() => {});
  try {
    await page.click('[data-testid="login-button"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
    const b = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
    if (await b.count()) await b.click({ timeout: 5000 });
    else await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
  } catch (_) {}
  await page.waitForFunction(async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true, { timeout: 15000 }).catch(() => {});
  return page;
}

async function main() {
  const relay = startRelay(WS_PORT, { httpPort: false });
  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;
  const now = Math.floor(Date.now() / 1000);
  relay.seedEvent(finalizeEvent({ kind: 10002, created_at: now, tags: [["r", relayUrl]], content: "" }, USER_SK));

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });

  // Context A: publish a watch history of WH_ITEMS pointers.
  const ctxA = await setupContext(browser, relayUrl);
  const pA = await login(ctxA, relayUrl);
  const hex = (i) => (i.toString(16).padStart(8, "0") + "a".repeat(56)).slice(0, 64);
  const MONTHS = Number(process.env.MONTHS ?? 1);
  // Spread items across MONTHS distinct months to exercise the monthly bucketing.
  const items = Array.from({ length: WH_ITEMS }, (_, i) => ({
    type: "e",
    value: hex(i + 1),
    watchedAt: now - (i % MONTHS) * 31 * 86400 - i * 30,
  }));
  const pub = await pA.evaluate(async (its) => {
    const c = window.__bitvidTest__?.nostrClient;
    try { return { ok: true, r: await c.publishWatchHistorySnapshot(its, {}) }; } catch (e) { return { ok: false, e: String(e).split("\n")[0] }; }
  }, items);
  await pA.waitForTimeout(1500);
  const byKind = {};
  for (const e of relay.getEvents().values()) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  await ctxA.close();

  // Context B (FRESH = truly cold): resolve watch history, count decrypts.
  calls = 0; cts.clear();
  const ctxB = await setupContext(browser, relayUrl);
  const pB = await login(ctxB, relayUrl);
  const cold = await pB.evaluate(async (pk) => {
    const c = window.__bitvidTest__?.nostrClient;
    try { const it = await c.resolveWatchHistory(pk, { forceRefresh: true }); return { ok: true, items: it?.length || 0 }; } catch (e) { return { ok: false, e: String(e).split("\n")[0] }; }
  }, USER_PK);
  await pB.waitForTimeout(1500);
  const coldCalls = calls, coldUnique = cts.size, coldMax = Math.max(0, ...[...cts.values()]);
  await ctxB.close();

  console.log("\n================ WH REPRO ================");
  console.log(`publish: ${JSON.stringify(pub)} (${WH_ITEMS} items)`);
  console.log(`relay events by kind: ${JSON.stringify(byKind)}`);
  console.log(`COLD resolve: ${JSON.stringify(cold)}`);
  console.log(`COLD nip44.decrypt calls=${coldCalls} uniqueCiphertexts=${coldUnique} maxRepeat=${coldMax}`);
  console.log("=========================================\n");

  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  process.exit(0);
}

main().catch((e) => { console.error("wh-repro failed:", e); process.exit(1); });
