// Focused reproduction of DM history, using the fake nip-07 extension.
//
// Seeds legacy (kind 4 / NIP-04) DMs between the user and a peer on a mock relay,
// logs in via the fake extension, then calls nostrClient.listDirectMessages and
// reports what comes back (decrypted messages, errors, extension call counts) —
// so we can see whether DM history is broken vs slow, and why.
//
// Usage: node scripts/perf/dm-repro.mjs   (env: DM_MSGS=20 LATENCY_MS=0)

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, generateSecretKey, nip04 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

const APP = process.env.APP || "http://localhost:3000";
const LATENCY_MS = Number(process.env.LATENCY_MS ?? 0);
const DM_MSGS = Number(process.env.DM_MSGS ?? 20);
const WS_PORT = 8962;

const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);
const PEER_SK = generateSecretKey();
const PEER_PK = getPublicKey(PEER_SK);

let extCalls = {};
function resetExtCalls() {
  extCalls = {};
}
let queue = Promise.resolve();
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
  const relay = startRelay(WS_PORT, { httpPort: false });
  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;
  const now = Math.floor(Date.now() / 1000);

  relay.seedEvent(finalizeEvent({ kind: 10002, created_at: now, tags: [["r", relayUrl]], content: "" }, USER_SK));

  // Seed kind-4 DMs: peer -> user (received) and user -> peer (sent).
  for (let i = 0; i < DM_MSGS; i++) {
    const fromPeer = i % 2 === 0;
    const sk = fromPeer ? PEER_SK : USER_SK;
    const authorPk = fromPeer ? PEER_PK : USER_PK;
    const otherPk = fromPeer ? USER_PK : PEER_PK;
    const text = `DM message ${i} (${fromPeer ? "from peer" : "to peer"})`;
    const content = nip04.encrypt(sk, otherPk, text);
    relay.seedEvent(
      finalizeEvent(
        { kind: 4, created_at: now - i * 60, tags: [["p", otherPk]], content },
        sk,
      ),
    );
  }
  console.log(`Seeded ${DM_MSGS} kind-4 DMs. user=${USER_PK.slice(0, 10)} peer=${PEER_PK.slice(0, 10)}`);

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
    localStorage.setItem("bitvid_admin_whitelist_mode", "false");
    const w = (n) => (...a) => window[n](...a);
    window.nostr = {
      getPublicKey: () => w("__extGetPublicKey")(),
      signEvent: (e) => w("__extSignEvent")(e),
      getRelays: async () => ({}),
      nip04: { encrypt: (p, t) => w("__extNip04Encrypt")(p, t), decrypt: (p, c) => w("__extNip04Decrypt")(p, c) },
      nip44: { encrypt: (p, t) => w("__extNip44Encrypt")(p, t), decrypt: (p, c) => w("__extNip44Decrypt")(p, c), v2: { encrypt: (p, t) => w("__extNip44Encrypt")(p, t), decrypt: (p, c) => w("__extNip44Decrypt")(p, c) } },
    };
  }, relayUrl);

  async function session(label) {
    const page = await context.newPage();
    await page.goto(`${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
    await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
    try {
      await page.click('[data-testid="login-button"]', { timeout: 8000 });
      await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
      const extBtn = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
      if (await extBtn.count()) await extBtn.click({ timeout: 5000 });
      else await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
    } catch (_) {}
    await page.waitForFunction(async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true, { timeout: 15000 }).catch(() => {});
    const result = await page.evaluate(async (userPk) => {
      const c = window.__bitvidTest__?.nostrClient;
      if (!c || typeof c.listDirectMessages !== "function") return { ok: false, reason: "no-listDirectMessages" };
      try {
        const msgs = await c.listDirectMessages(userPk, { timeoutMs: 8000 });
        return { ok: true, count: Array.isArray(msgs) ? msgs.length : 0 };
      } catch (e) {
        return { ok: false, reason: String(e).split("\n")[0] };
      }
    }, USER_PK);
    await page.waitForTimeout(1000);
    await page.close();
    return result;
  }

  resetExtCalls();
  const cold = await session("cold");
  const coldCalls = { ...extCalls };
  resetExtCalls();
  const warm = await session("warm");
  const warmCalls = { ...extCalls };

  const dCold = coldCalls["nip04.decrypt"] || 0;
  const dWarm = warmCalls["nip04.decrypt"] || 0;
  console.log("\n================ DM REPRO ================");
  console.log(`COLD: ${JSON.stringify(cold)} | extension calls: ${JSON.stringify(coldCalls)}`);
  console.log(`WARM: ${JSON.stringify(warm)} | extension calls: ${JSON.stringify(warmCalls)}`);
  console.log(`nip04.decrypt: cold=${dCold} warm=${dWarm} -> persist cache ${dWarm < dCold ? "WORKS ✓" : "no effect"} (saved ${dCold - dWarm} extension calls)`);
  console.log("=========================================\n");

  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  process.exit(0);
}

main().catch((e) => { console.error("dm-repro failed:", e); process.exit(1); });
