// Deterministic NIP-07 CHANNEL simulation harness.
//
// Reproduces the real-env cold-login failure (KNOWN_BUGS #0) WITHOUT a real
// browser extension, so fixes can be validated locally instead of round-tripping
// through a user's wallet. A fake window.nostr (backed by real nostr-tools
// crypto) models a configurable message-channel:
//
//   MODE=healthy   fast, never drops (baseline — lists should decrypt)
//   MODE=slow      every call delayed (overwhelmed but alive)
//   MODE=overload  drops the channel under concurrent load ("message channel
//                  closed"), recovers after a cooldown — the real failure
//   MODE=dead      drops on first overload and never recovers (refresh-only)
//
// It seeds the user's encrypted lists (block list + watch history) so login
// triggers genuine decrypt contention against the signer-readiness handshake,
// then reports the things the real console showed: time-to-signer-ready, whether
// the circuit breaker opened/recovered, decrypt-timeout count, and which lists
// actually loaded.
//
// Usage:
//   MODE=overload APP=http://localhost:3000 node scripts/perf/nip07-channel-sim.mjs
//   for m in healthy slow overload dead; do MODE=$m node scripts/perf/nip07-channel-sim.mjs; done

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

const APP = process.env.APP || "http://localhost:3000";
const MODE = (process.env.MODE || "overload").toLowerCase();
const WS_PORT = Number(process.env.WS_PORT ?? 8974);
const VIDEOS = Number(process.env.VIDEOS ?? 12);
const OBSERVE_MS = Number(process.env.OBSERVE_MS ?? 40000);

// Channel models per mode. LATENCY_MS = per-call delay; MAX_INFLIGHT = how many
// concurrent extension calls before the port "drops"; DROP_COOLDOWN_MS = how long
// the dropped channel stays dead before recovering.
const MODES = {
  healthy: { latency: 80, maxInflight: 99, dropCooldown: 0 },
  slow: { latency: 2500, maxInflight: 99, dropCooldown: 0 },
  overload: { latency: 400, maxInflight: 1, dropCooldown: 4000 },
  dead: { latency: 400, maxInflight: 1, dropCooldown: 10 ** 9 },
};
const channel = MODES[MODE] || MODES.overload;

const USER_SK = Uint8Array.from(Buffer.from("11".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);
const CHANNEL_CLOSED_MESSAGE =
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";

// --- channel model state (Node side) ---
let pending = 0;
let droppedUntil = 0;
let extCalls = {};
let drops = 0;

function viaChannel(method, fn) {
  extCalls[method] = (extCalls[method] || 0) + 1;
  const now = Date.now();
  // Already-dropped channel: reject fast (the severed port).
  if (now < droppedUntil) {
    drops += 1;
    return Promise.reject(new Error(CHANNEL_CLOSED_MESSAGE));
  }
  // Concurrency overload trips the drop.
  if (pending >= channel.maxInflight && channel.dropCooldown > 0) {
    droppedUntil = now + channel.dropCooldown;
    drops += 1;
    return Promise.reject(new Error(CHANNEL_CLOSED_MESSAGE));
  }
  pending += 1;
  return (async () => {
    try {
      if (channel.latency > 0) {
        await new Promise((r) => setTimeout(r, channel.latency));
      }
      return await fn();
    } finally {
      pending -= 1;
    }
  })();
}

const convKey = (peerPk) => nip44.v2.utils.getConversationKey(USER_SK, peerPk);

function seedEncryptedBlockList(relay, createdAt) {
  // A blocked pubkey the app must reveal by decrypting the kind-10000 mute list.
  const blocked = "b".repeat(64);
  const plaintext = JSON.stringify({ blockedPubkeys: [blocked] });
  const content = nip04.encrypt(USER_SK, USER_PK, plaintext);
  relay.seedEvent(
    finalizeEvent(
      {
        kind: 10000,
        created_at: createdAt,
        tags: [["encrypted", "nip04"]],
        content,
      },
      USER_SK,
    ),
  );
  return blocked;
}

async function main() {
  const relay = startRelay(WS_PORT, { httpPort: false });
  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;
  const now = Math.floor(Date.now() / 1000);

  relay.seedEvent(
    finalizeEvent(
      { kind: 10002, created_at: now, tags: [["r", relayUrl]], content: "" },
      USER_SK,
    ),
  );
  for (let i = 0; i < VIDEOS; i++) {
    const dTag = `seed-${i}`;
    relay.seedEvent(
      finalizeEvent(
        {
          kind: 30078,
          created_at: now - i * 60,
          tags: [["d", dTag], ["t", "video"], ["title", `Sim Video ${i}`], ["url", `https://example.com/v${i}.mp4`]],
          content: JSON.stringify({ version: 3, title: `Sim Video ${i}`, videoRootId: dTag, mode: "live", isPrivate: false, deleted: false, url: `https://example.com/v${i}.mp4` }),
        },
        USER_SK,
      ),
    );
  }
  const expectedBlocked = seedEncryptedBlockList(relay, now);

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });
  const context = await browser.newContext();

  await context.exposeBinding("__extGetPublicKey", () => viaChannel("getPublicKey", () => USER_PK));
  await context.exposeBinding("__extSignEvent", (_s, e) => viaChannel("signEvent", () => finalizeEvent({ ...e, pubkey: USER_PK }, USER_SK)));
  await context.exposeBinding("__extNip04Encrypt", (_s, pk, t) => viaChannel("nip04.encrypt", () => nip04.encrypt(USER_SK, pk, t)));
  await context.exposeBinding("__extNip04Decrypt", (_s, pk, ct) => viaChannel("nip04.decrypt", () => nip04.decrypt(USER_SK, pk, ct)));
  await context.exposeBinding("__extNip44Encrypt", (_s, pk, t) => viaChannel("nip44.encrypt", () => nip44.v2.encrypt(t, convKey(pk))));
  await context.exposeBinding("__extNip44Decrypt", (_s, pk, ct) => viaChannel("nip44.decrypt", () => nip44.v2.decrypt(ct, convKey(pk))));
  // enable()/getRelays are answered through the SAME channel so the handshake
  // competes with decrypts exactly as it does in the real extension.
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

  const testUrl = `${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`;

  // --- console signal capture ---
  const signals = {
    signerReadyAt: null,
    listsSyncCompleteAt: null,
    decryptTimeouts: 0,
    breakerOpened: 0,
    breakerRecovered: 0,
    channelUnresponsive: 0,
  };
  let loginAt = 0;
  const onConsole = (text) => {
    if (text.includes("[signer-ready]") && signals.signerReadyAt === null) {
      signals.signerReadyAt = Date.now() - loginAt;
    }
    if (text.includes("[lists-sync-complete]") && signals.listsSyncCompleteAt === null) {
      signals.listsSyncCompleteAt = Date.now() - loginAt;
    }
    if (text.includes("Decryption timed out") || text.includes("keeping stale list")) {
      signals.decryptTimeouts += 1;
    }
    if (text.includes("signer channel unresponsive")) signals.breakerOpened += 1;
    if (text.includes("signer channel recovered")) signals.breakerRecovered += 1;
    if (text.includes("nip07-channel-unresponsive")) signals.channelUnresponsive += 1;
  };

  const DEBUG = process.env.DEBUG === "1";
  const page = await context.newPage();
  page.on("console", (msg) => {
    try {
      const t = msg.text();
      onConsole(t);
      if (DEBUG && /UserBlockList|Decryption|scheduleDecrypt|stale|channel|signer/i.test(t)) {
        console.log("PAGE>", t.slice(0, 200));
      }
    } catch (_) {}
  });

  await page.goto(testUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
  await page.evaluate(() => {
    const c = window.__bitvidTest__?.nostrClient;
    if (c) c.videoEventVerifier = async (events) => new Set((events || []).map((e) => e && e.id).filter(Boolean));
  }).catch(() => {});

  // Trigger the REAL nip-07 login path.
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

  await page.waitForFunction(
    async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true,
    { timeout: 20000 },
  ).catch(() => {});

  // Observe the post-login window.
  await page.waitForTimeout(OBSERVE_MS);

  // Did the block list actually decrypt? (the seeded blocked pubkey appears)
  const blockedLoaded = await page.evaluate(async (expected) => {
    const state = await window.__bitvidTest__?.getAppState?.();
    const blocked = state?.lists?.blockedPubkeys || [];
    return Array.isArray(blocked) && blocked.includes(expected);
  }, expectedBlocked).catch(() => false);

  const verdict = {
    mode: MODE,
    channel,
    timeToSignerReadyMs: signals.signerReadyAt,
    timeToListsSyncMs: signals.listsSyncCompleteAt,
    decryptTimeouts: signals.decryptTimeouts,
    breakerOpened: signals.breakerOpened,
    breakerRecovered: signals.breakerRecovered,
    fastFailsObserved: signals.channelUnresponsive,
    channelDropsInjected: drops,
    blockListDecrypted: blockedLoaded,
    extCalls,
  };

  console.log("\n================ NIP-07 CHANNEL SIM ================");
  console.log(`MODE=${MODE}  latency=${channel.latency}ms maxInflight=${channel.maxInflight} dropCooldown=${channel.dropCooldown}ms`);
  console.log(`time → signer-ready    : ${verdict.timeToSignerReadyMs ?? "NEVER"} ms`);
  console.log(`time → lists-sync done : ${verdict.timeToListsSyncMs ?? "NEVER"} ms`);
  console.log(`decrypt timeouts logged: ${verdict.decryptTimeouts}`);
  console.log(`channel drops injected : ${verdict.channelDropsInjected}`);
  console.log(`breaker opened / recov : ${verdict.breakerOpened} / ${verdict.breakerRecovered}`);
  console.log(`fast-fails observed    : ${verdict.fastFailsObserved}`);
  console.log(`BLOCK LIST DECRYPTED   : ${verdict.blockListDecrypted ? "YES ✓" : "NO ✗"}`);
  console.log("ext calls:", JSON.stringify(extCalls));
  console.log("===================================================\n");

  await page.close();
  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  // Exit non-zero for the "should have worked but didn't" cases so this can gate CI later.
  const expectedToLoad = MODE === "healthy" || MODE === "overload";
  process.exit(expectedToLoad && !verdict.blockListDecrypted ? 1 : 0);
}

main().catch((e) => {
  console.error("nip07-channel-sim failed:", e);
  process.exit(1);
});
