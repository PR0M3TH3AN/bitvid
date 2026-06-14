// nip-07 login HEAT probe.
//
// Reproduces the *real* nip-07 login path (which loginWithNsec skips) using a
// fake window.nostr extension backed by Node-side nostr-tools crypto, then
// measures STEADY-STATE activity after login settles:
//   - extension calls/sec by method (getPublicKey/signEvent/nip04/nip44)
//   - outgoing relay REQ frames/sec
// A non-trivial steady-state rate = the login heat (a loop re-decrypting /
// re-subscribing after the feed should be idle).
//
// Usage: APP=http://localhost:3000 WINDOW=15 LATENCY_MS=0 node scripts/perf/nip07-heat.mjs

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

const APP = process.env.APP || "http://localhost:3000";
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 0);
const WINDOW = Number(process.env.WINDOW ?? 15);
const VIDEOS = Number(process.env.VIDEOS ?? 30);
const WH_ITEMS = Number(process.env.WH_ITEMS ?? 60);
const WS_PORT = 8973;

const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);

let extCalls = {};
let queue = Promise.resolve();
const reset = () => { extCalls = {}; };
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

let reqCount = 0;
let measuring = false;

async function main() {
  const relay = startRelay(WS_PORT, { httpPort: false });
  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;
  const now = Math.floor(Date.now() / 1000);

  relay.seedEvent(finalizeEvent({ kind: 10002, created_at: now, tags: [["r", relayUrl]], content: "" }, USER_SK));
  for (let i = 0; i < VIDEOS; i++) {
    const dTag = `seed-${i}`;
    relay.seedEvent(finalizeEvent({
      kind: 30078,
      created_at: now - i * 60,
      tags: [["d", dTag], ["t", "video"], ["title", `Heat Video ${i}`], ["url", `https://example.com/v${i}.mp4`]],
      content: JSON.stringify({ version: 3, title: `Heat Video ${i}`, videoRootId: dTag, mode: "live", isPrivate: false, deleted: false, url: `https://example.com/v${i}.mp4` }),
    }, USER_SK));
  }

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });
  const context = await browser.newContext();

  await context.exposeBinding("__extGetPublicKey", () => viaExtension("getPublicKey", () => USER_PK));
  await context.exposeBinding("__extSignEvent", (_s, e) => viaExtension("signEvent", () => finalizeEvent({ ...e, pubkey: USER_PK }, USER_SK)));
  await context.exposeBinding("__extNip04Encrypt", (_s, pk, t) => viaExtension("nip04.encrypt", () => nip04.encrypt(USER_SK, pk, t)));
  await context.exposeBinding("__extNip04Decrypt", (_s, pk, ct) => viaExtension("nip04.decrypt", () => nip04.decrypt(USER_SK, pk, ct)));
  await context.exposeBinding("__extNip44Encrypt", (_s, pk, t) => viaExtension("nip44.encrypt", () => nip44.v2.encrypt(t, convKey(pk))));
  await context.exposeBinding("__extNip44Decrypt", (_s, pk, ct) => viaExtension("nip44.decrypt", () => nip44.v2.decrypt(ct, convKey(pk))));

  await context.addInitScript((url) => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
    localStorage.setItem("__bitvidTestRelays__", JSON.stringify([url]));
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

  async function session() {
    const page = await context.newPage();
    page.on("websocket", (ws) => {
      ws.on("framesent", (d) => {
        const p = typeof d.payload === "string" ? d.payload : "";
        if (p.startsWith('["REQ"')) globalThis.__totalReq = (globalThis.__totalReq || 0) + 1;
        if (measuring && p.startsWith('["REQ"')) {
          reqCount += 1;
          try {
            const msg = JSON.parse(p);
            const sig = msg.slice(2).map((f) => {
              const k = f.kinds ? `kinds=${f.kinds.join(",")}` : "";
              const keys = Object.keys(f).filter((x) => x !== "kinds").join(",");
              return `${k} ${keys}`.trim();
            }).join(" | ");
            globalThis.__reqSig = globalThis.__reqSig || new Map();
            globalThis.__reqSig.set(sig, (globalThis.__reqSig.get(sig) || 0) + 1);
          } catch (_) {}
        }
      });
    });
    await page.goto(testUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
    await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
    await page.evaluate(() => {
      const c = window.__bitvidTest__?.nostrClient;
      if (c) c.videoEventVerifier = async (events) => new Set((events || []).map((e) => e && e.id).filter(Boolean));
    }).catch(() => {});
    try {
      await page.click('[data-testid="login-button"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
      const extBtn = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
      if (await extBtn.count()) await extBtn.click({ timeout: 5000 });
      else await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
    } catch (_) {}
    await page.waitForFunction(async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true, { timeout: 15000 }).catch(() => {});
    return page;
  }

  // Session 1: log in and publish a watch history (an encrypted list to decrypt).
  const s1 = await session();
  if (WH_ITEMS > 0) {
    const hex = (i) => (i.toString(16).padStart(8, "0") + "a".repeat(56)).slice(0, 64);
    const items = Array.from({ length: WH_ITEMS }, (_, i) => ({ type: "e", value: hex(i + 1), watchedAt: now - i * 30 }));
    await s1.evaluate(async (its) => {
      const c = window.__bitvidTest__?.nostrClient;
      try { await c.publishWatchHistorySnapshot(its, {}); } catch (_) {}
    }, items).catch(() => {});
    await s1.waitForTimeout(1500);
  }
  await s1.close();

  // Session 2: fresh login, let it settle, then measure STEADY-STATE activity.
  globalThis.__totalReq = 0;
  const page = await session();
  await page.waitForTimeout(6000); // settle window (initial loads/decrypts)
  const burstReq = globalThis.__totalReq || 0;
  reset();
  reqCount = 0;
  await page.evaluate(() => { globalThis.__loopc = {}; }).catch(() => {});
  measuring = true;
  const start = Date.now();
  await page.waitForTimeout(WINDOW * 1000);
  const elapsed = (Date.now() - start) / 1000;
  measuring = false;
  const steady = { ...extCalls };
  const loopc = await page.evaluate(() => globalThis.__loopc || {}).catch(() => ({}));
  await page.close();
  console.log("\nInstrumented call counts in window:");
  for (const [k, n] of Object.entries(loopc).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(26)} ${String(n).padStart(6)}  (${(n / elapsed).toFixed(1)}/s)`);

  console.log("\n================ NIP-07 LOGIN HEAT ================");
  console.log(`Initial load+settle burst: ${burstReq} REQ frames (first ~6s after login)\n`);
  console.log(`Steady-state window: ${elapsed.toFixed(1)}s (post-login-settle)\n`);
  console.log("Extension calls in window (method: count → rate):");
  const entries = Object.entries(steady).sort((a, b) => b[1] - a[1]);
  if (!entries.length) console.log("  (none — extension idle ✓)");
  for (const [m, n] of entries) console.log(`  ${m.padEnd(16)} ${String(n).padStart(5)}  (${(n / elapsed).toFixed(1)}/s)`);
  const totalExt = entries.reduce((s, [, n]) => s + n, 0);
  console.log(`\nTotal extension calls/s: ${(totalExt / elapsed).toFixed(1)}`);
  console.log(`Outgoing REQ frames/s : ${(reqCount / elapsed).toFixed(1)}`);
  const sigs = [...(globalThis.__reqSig || new Map()).entries()].sort((a, b) => b[1] - a[1]);
  console.log("\nTop REQ filters (count → rate → filter):");
  for (const [sig, n] of sigs.slice(0, 10)) console.log(`  ${String(n).padStart(5)}  (${(n / elapsed).toFixed(1)}/s)  ${sig}`);
  console.log("\nInterpretation: a healthy idle login should be ~0 ext calls/s.");
  console.log("Any steady nip04/nip44.decrypt rate = a re-decrypt loop (the heat).");
  console.log("==================================================\n");

  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  process.exit(0);
}

main().catch((e) => { console.error("nip07-heat failed:", e); process.exit(1); });
