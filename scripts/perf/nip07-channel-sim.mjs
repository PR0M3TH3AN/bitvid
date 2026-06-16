// Deterministic NIP-07 CHANNEL simulation harness (multi-list).
//
// Reproduces the real-env cold-login failure (KNOWN_BUGS #0) WITHOUT a real
// browser extension, so fixes can be validated locally instead of round-tripping
// through a user's wallet. A fake window.nostr (backed by real nostr-tools
// crypto) models a configurable message-channel:
//
//   MODE=healthy   fast, never drops (baseline — every list should decrypt)
//   MODE=slow      every call delayed (overwhelmed but alive)
//   MODE=overload  drops the channel under concurrent load ("message channel
//                  closed"), recovers after a cooldown — the real failure
//   MODE=dead      drops on first overload and (mostly) never recovers
//
// Session 1 runs on a HEALTHY channel and publishes the user's encrypted lists
// (block list + subscription list + hashtag interests) via the real services.
// Session 2 runs under MODE and reports, for EACH list, whether it decrypted —
// plus time-to-signer-ready, the login REQ burst (per kind), decrypt timeouts,
// and breaker activity.
//
// Usage:
//   MODE=overload node scripts/perf/nip07-channel-sim.mjs
//   for m in healthy slow overload; do MODE=$m node scripts/perf/nip07-channel-sim.mjs; done

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

// Verdict is mirrored to this file (in addition to stdout) so results survive
// stdout buffering / early exit when piped or backgrounded.
const REPORT_PATH = process.env.REPORT || "./nip07-sim-report.txt";
const report = (text) => {
  console.log(text);
  try {
    writeFileSync(REPORT_PATH, text + "\n", { flag: "a" });
  } catch (_) {}
};
try {
  writeFileSync(REPORT_PATH, "");
} catch (_) {}

const APP = process.env.APP || "http://localhost:3000";
const MODE = (process.env.MODE || "overload").toLowerCase();
const WS_PORT = Number(process.env.WS_PORT ?? 8974);
const VIDEOS = Number(process.env.VIDEOS ?? 12);
const OBSERVE_MS = Number(process.env.OBSERVE_MS ?? 45000);
const DEBUG = process.env.DEBUG === "1";

const MODES = {
  healthy: { latency: 80, maxInflight: 99, dropCooldown: 0 },
  slow: { latency: 2500, maxInflight: 99, dropCooldown: 0 },
  overload: { latency: 400, maxInflight: 1, dropCooldown: 4000 },
  dead: { latency: 400, maxInflight: 1, dropCooldown: 10 ** 9 },
};
const HEALTHY = MODES.healthy;
const TARGET = { ...(MODES[MODE] || MODES.overload) };
// Allow overriding the per-call latency to model a genuinely slow extension
// (the real-env case: signer present but every decrypt sits in the nip-07
// queue long enough to blow the 15s service timeout).
if (Number.isFinite(Number(process.env.LATENCY_MS))) {
  TARGET.latency = Number(process.env.LATENCY_MS);
}

const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);
const SUBSCRIBED_PK = "c".repeat(64);
const BLOCKED_PK = "b".repeat(64);
const HASHTAG = "bitcoin";
const CHANNEL_CLOSED_MESSAGE =
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";

// --- channel model (Node side); `channel` is swapped between sessions ---
let channel = HEALTHY;
let pending = 0;
let droppedUntil = 0;
let extCalls = {};
let drops = 0;

function viaChannel(method, fn) {
  extCalls[method] = (extCalls[method] || 0) + 1;
  const now = Date.now();
  if (now < droppedUntil) {
    drops += 1;
    return Promise.reject(new Error(CHANNEL_CLOSED_MESSAGE));
  }
  if (pending >= channel.maxInflight && channel.dropCooldown > 0) {
    droppedUntil = now + channel.dropCooldown;
    drops += 1;
    return Promise.reject(new Error(CHANNEL_CLOSED_MESSAGE));
  }
  pending += 1;
  return (async () => {
    try {
      if (channel.latency > 0) await new Promise((r) => setTimeout(r, channel.latency));
      return await fn();
    } finally {
      pending -= 1;
    }
  })();
}

const convKey = (peerPk) => nip44.v2.utils.getConversationKey(USER_SK, peerPk);

async function makeContext(browser, relayUrl) {
  const context = await browser.newContext();
  await context.exposeBinding("__extGetPublicKey", () => viaChannel("getPublicKey", () => USER_PK));
  await context.exposeBinding("__extSignEvent", (_s, e) => viaChannel("signEvent", () => finalizeEvent({ ...e, pubkey: USER_PK }, USER_SK)));
  await context.exposeBinding("__extNip04Encrypt", (_s, pk, t) => viaChannel("nip04.encrypt", () => nip04.encrypt(USER_SK, pk, t)));
  await context.exposeBinding("__extNip04Decrypt", (_s, pk, ct) => viaChannel("nip04.decrypt", () => nip04.decrypt(USER_SK, pk, ct)));
  await context.exposeBinding("__extNip44Encrypt", (_s, pk, t) => viaChannel("nip44.encrypt", () => nip44.v2.encrypt(t, convKey(pk))));
  await context.exposeBinding("__extNip44Decrypt", (_s, pk, ct) => viaChannel("nip44.decrypt", () => nip44.v2.decrypt(ct, convKey(pk))));
  await context.exposeBinding("__extEnable", () => viaChannel("enable", () => true));
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
      enable: () => w("__extEnable")(),
      nip04: { encrypt: (p, t) => w("__extNip04Encrypt")(p, t), decrypt: (p, c) => w("__extNip04Decrypt")(p, c) },
      nip44: {
        encrypt: (p, t) => w("__extNip44Encrypt")(p, t),
        decrypt: (p, c) => w("__extNip44Decrypt")(p, c),
        v2: { encrypt: (p, t) => w("__extNip44Encrypt")(p, t), decrypt: (p, c) => w("__extNip44Decrypt")(p, c) },
      },
    };
  }, relayUrl);
  return context;
}

async function login(context, relayUrl, { onConsole } = {}) {
  const page = await context.newPage();
  if (onConsole) page.on("console", (m) => { try { onConsole(m.text(), page); } catch (_) {} });
  await page.goto(`${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`, { waitUntil: "domcontentloaded" });
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
  await page.waitForFunction(
    async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true,
    { timeout: 20000 },
  ).catch(() => {});
  return page;
}

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
      tags: [["d", dTag], ["t", "video"], ["title", `Sim Video ${i}`], ["url", `https://example.com/v${i}.mp4`]],
      content: JSON.stringify({ version: 3, title: `Sim Video ${i}`, videoRootId: dTag, mode: "live", isPrivate: false, deleted: false, url: `https://example.com/v${i}.mp4` }),
    }, USER_SK));
  }

  const browser = await chromium.launch({ headless: process.env.HEALTHLESS !== "0" && process.env.HEADLESS !== "0" });

  // ---- Session 1: healthy channel, publish the user's encrypted lists ----
  channel = HEALTHY;
  const ctx1 = await makeContext(browser, relayUrl);
  const page1 = await ctx1.newPage();
  await page1.goto(`${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`, { waitUntil: "domcontentloaded" });
  await page1.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page1.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
  // Programmatic login with the SAME key the fake extension uses, so session 2
  // (NIP-07) reads back the very lists session 1 publishes. Far more reliable
  // than driving the login modal for the seed phase.
  const USER_SK_HEX = Buffer.from(USER_SK).toString("hex");
  await page1.evaluate(async (sk) => window.__bitvidTest__?.loginWithNsec?.(sk), USER_SK_HEX).catch((e) => report(`session1 login error: ${e.message}`));
  await page1.waitForFunction(
    async () => {
      const st = await window.__bitvidTest__?.getAppState?.();
      return Boolean(st?.isLoggedIn && st?.activePubkey);
    },
    { timeout: 15000 },
  ).catch(() => {});
  const seedResult = await page1.evaluate(
    async (args) => window.__bitvidTest__?.seedTestLists?.(args),
    { blockedPubkey: BLOCKED_PK, subscribedPubkey: SUBSCRIBED_PK, hashtag: HASHTAG },
  ).catch((e) => ({ ok: false, reason: e.message }));
  await page1.waitForTimeout(2500); // let publishes settle on the relay
  await ctx1.close();

  if (!seedResult?.ok) {
    console.warn("⚠ seedTestLists did not fully succeed:", JSON.stringify(seedResult));
  }

  // ---- Session 2: target channel, observe cold-login decrypt ----
  channel = TARGET;
  pending = 0; droppedUntil = 0; extCalls = {}; drops = 0;

  const signals = {
    signerReadyAt: null, listsSyncCompleteAt: null,
    decryptTimeouts: 0, breakerOpened: 0, breakerRecovered: 0, channelUnresponsive: 0,
    dmHelpersUnavailable: 0,
  };
  const reqBurst = {}; // kind -> count, captured during the login window
  const reqSig = {}; // filter signature -> count, to surface redundant queries
  const subsReqTimes = []; // ms-since-login of each kind-30000 REQ (redundancy timing)
  let loginAt = Date.now();
  let measuringReq = true;

  const ctx2 = await makeContext(browser, relayUrl);
  // Capture outgoing REQ frames per kind during the login burst window.
  ctx2.on("page", () => {});
  const onConsole = (text) => {
    if (text.includes("[signer-ready]") && signals.signerReadyAt === null) signals.signerReadyAt = Date.now() - loginAt;
    if (text.includes("[lists-sync-complete]") && signals.listsSyncCompleteAt === null) signals.listsSyncCompleteAt = Date.now() - loginAt;
    if (text.includes("Decryption timed out") || text.includes("keeping stale list") || text.includes("channel unavailable")) signals.decryptTimeouts += 1;
    if (text.includes("signer channel unresponsive")) signals.breakerOpened += 1;
    if (text.includes("signer channel recovered")) signals.breakerRecovered += 1;
    if (text.includes("nip07-channel-unresponsive")) signals.channelUnresponsive += 1;
    if (text.includes("DM decryption helpers are unavailable")) signals.dmHelpersUnavailable += 1;
    if (DEBUG && /UserBlockList|Hashtag|Subscriptions|Decryption|signer|channel|direct message/i.test(text)) {
      console.log("PAGE>", text.slice(0, 500));
    }
  };

  const page = await ctx2.newPage();
  page.on("console", (m) => { try { onConsole(m.text()); } catch (_) {} });
  page.on("websocket", (ws) => {
    ws.on("framesent", (d) => {
      const p = typeof d.payload === "string" ? d.payload : "";
      if (!measuringReq || !p.startsWith('["REQ"')) return;
      try {
        const msg = JSON.parse(p);
        for (const f of msg.slice(2)) {
          for (const k of f.kinds || ["?"]) reqBurst[k] = (reqBurst[k] || 0) + 1;
          const otherKeys = Object.keys(f).filter((x) => x !== "kinds" && x !== "authors").sort().join(",");
          const sig = `kinds=${(f.kinds || []).join("|")}${otherKeys ? " " + otherKeys : ""}${f.authors ? " authors=" + f.authors.length : ""}`;
          reqSig[sig] = (reqSig[sig] || 0) + 1;
          if ((f.kinds || []).includes(30000)) subsReqTimes.push(Date.now() - loginAt);
        }
      } catch (_) {}
    });
  });

  await page.goto(`${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
  await page.evaluate(() => {
    const c = window.__bitvidTest__?.nostrClient;
    if (c) c.videoEventVerifier = async (events) => new Set((events || []).map((e) => e && e.id).filter(Boolean));
  }).catch(() => {});
  loginAt = Date.now();
  try {
    await page.click('[data-testid="login-button"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
    const extBtn = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
    if (await extBtn.count()) await extBtn.click({ timeout: 5000 });
    else await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
  } catch (e) {
    console.warn("login click failed:", e.message);
  }
  await page.waitForFunction(async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true, { timeout: 20000 }).catch(() => {});

  // Stop counting REQ burst after the first ~10s (login settle window).
  setTimeout(() => { measuringReq = false; }, 10000);

  // Probe DMs the way the Messages tab does (lazy load).
  await page.waitForTimeout(Math.min(OBSERVE_MS, 12000));
  const dmProbe = await page.evaluate(async () => {
    const c = window.__bitvidTest__?.nostrClient;
    if (!c || typeof c.listDirectMessages !== "function") return { ok: false, reason: "no-listDirectMessages" };
    try {
      const msgs = await c.listDirectMessages();
      return { ok: true, count: Array.isArray(msgs) ? msgs.length : 0 };
    } catch (e) {
      return { ok: false, reason: e?.message || String(e) };
    }
  }).catch((e) => ({ ok: false, reason: e.message }));

  // Wait out the rest of the observation window for retries to land.
  await page.waitForTimeout(Math.max(0, OBSERVE_MS - 12000));

  const finalLists = await page.evaluate(async () => (await window.__bitvidTest__.getAppState()).lists).catch(() => ({}));
  const decrypted = {
    blocks: Array.isArray(finalLists.blockedPubkeys) && finalLists.blockedPubkeys.includes("b".repeat(64)),
    subscriptions: Array.isArray(finalLists.subscribedPubkeys) && finalLists.subscribedPubkeys.includes("c".repeat(64)),
    hashtags: Array.isArray(finalLists.hashtagInterests) && finalLists.hashtagInterests.includes(HASHTAG),
  };

  const reqTotal = Object.values(reqBurst).reduce((s, n) => s + n, 0);
  const reqTop = Object.entries(reqBurst).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([k, n]) => `kind ${k}=${n}`).join(", ");

  report("\n================ NIP-07 CHANNEL SIM (multi-list) ================");
  report(`MODE=${MODE}  latency=${channel.latency}ms maxInflight=${channel.maxInflight} dropCooldown=${channel.dropCooldown}ms`);
  report(`seed(session1)         : ${JSON.stringify(seedResult)}`);
  report(`time -> signer-ready   : ${signals.signerReadyAt ?? "NEVER"} ms`);
  report(`time -> lists-sync done: ${signals.listsSyncCompleteAt ?? "NEVER"} ms`);
  report(`login REQ burst (~10s) : ${reqTotal} frames  [${reqTop}]`);
  const sigTop = Object.entries(reqSig).sort((a, b) => b[1] - a[1]).slice(0, 12);
  report("top REQ filters (count → filter):");
  for (const [sig, n] of sigTop) report(`    ${String(n).padStart(4)}  ${sig}`);
  report(`kind-30000 REQ times(ms): [${subsReqTimes.join(", ")}]`);
  report(`decrypt timeouts logged: ${signals.decryptTimeouts}`);
  report(`channel drops injected : ${drops}`);
  report(`breaker opened / recov : ${signals.breakerOpened} / ${signals.breakerRecovered}`);
  report(`---- LISTS DECRYPTED ----`);
  report(`  blocks               : ${decrypted.blocks ? "YES" : "NO"}`);
  report(`  subscriptions        : ${decrypted.subscriptions ? "YES" : "NO"}`);
  report(`  hashtags             : ${decrypted.hashtags ? "YES" : "NO"}`);
  report(`  DMs (probe)          : ${dmProbe.ok ? `OK (${dmProbe.count})` : `FAIL - ${dmProbe.reason}`}`);
  report("ext calls: " + JSON.stringify(extCalls));
  report("=================================================================\n");

  await ctx2.close();
  await browser.close();
  if (typeof relay.close === "function") await relay.close();

  // Gate: on healthy/overload every list SHOULD decrypt. Use process.exitCode
  // (not process.exit) so buffered stdout fully flushes when piped/redirected.
  const expectAll = MODE === "healthy" || MODE === "overload";
  const allLists = decrypted.blocks && decrypted.subscriptions && decrypted.hashtags;
  process.exitCode = expectAll && !allLists ? 1 : 0;
}

main().catch((e) => {
  report(`nip07-channel-sim FAILED: ${e?.stack || e?.message || e}`);
  process.exitCode = 1;
});
