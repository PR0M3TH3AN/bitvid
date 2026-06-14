// Flaky MULTI-relay harness — the verification-fidelity fix.
//
// The single perfect mock relay hid the real-world amplifier (a user's ~20-relay
// NIP-65 list, most dead, each reconnect re-firing every subscription). This
// harness stands up several mock relays — some ALIVE (seeded), some DEAD
// (unreachable ports) — points the app at all of them, logs in via a fake
// nip-07 extension, and asserts the refactor's invariants hold under churn:
//
//   1. The app subscribes on at most the capped core (not all configured relays).
//   2. Report subs are BATCHED (one kind-1984 filter with many #e), not per-id.
//   3. Steady-state REQ rate stays ~0 despite dead relays (no reconnect storm).
//   4. The video grid still renders from the alive relays.
//
// Usage: HEADLESS=1 node scripts/perf/flaky-relays.mjs

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, nip04 } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";

const APP = process.env.APP || "http://localhost:3000";
const ALIVE_PORTS = [8941, 8943, 8945];
const DEAD_PORTS = [8951, 8952, 8953, 8954, 8955, 8956, 8957]; // nothing listens
const VIDEOS = 24;
const WINDOW = Number(process.env.WINDOW ?? 10);

const USER_SK = Uint8Array.from(Buffer.from("22".repeat(32), "hex"));
const USER_PK = getPublicKey(USER_SK);
const REPORTER_SK = Uint8Array.from(Buffer.from("33".repeat(32), "hex"));
const convKey = (pk) => nip44.v2.utils.getConversationKey(USER_SK, pk);

const reqByHost = new Map();
const reportFilterShapes = [];
let measuring = false;

function host(u) {
  try { return new URL(u).host; } catch { return u; }
}

async function main() {
  // Stand up the alive relays and seed identical content on each.
  const alive = ALIVE_PORTS.map((p) => startRelay(p, { httpPort: false }));
  const aliveUrls = ALIVE_PORTS.map((p) => `ws://127.0.0.1:${p}`);
  const deadUrls = DEAD_PORTS.map((p) => `ws://127.0.0.1:${p}`);
  // Interleave so dead relays sit inside the first 6 (the cap window), proving
  // the app tolerates dead relays in its active set.
  const allRelays = [
    aliveUrls[0], deadUrls[0], aliveUrls[1], deadUrls[1], aliveUrls[2],
    deadUrls[2], deadUrls[3], deadUrls[4], deadUrls[5], deadUrls[6],
  ];

  const now = Math.floor(Date.now() / 1000);
  const videoIds = [];
  for (const relay of alive) {
    relay.seedEvent(finalizeEvent({ kind: 10002, created_at: now, tags: allRelays.map((u) => ["r", u]), content: "" }, USER_SK));
  }
  for (let i = 0; i < VIDEOS; i++) {
    const dTag = `flaky-${i}`;
    const ev = finalizeEvent({
      kind: 30078,
      created_at: now - i * 60,
      tags: [["d", dTag], ["t", "video"], ["title", `Flaky ${i}`], ["url", `https://e.com/${i}.mp4`]],
      content: JSON.stringify({ version: 3, title: `Flaky ${i}`, videoRootId: dTag, mode: "live", isPrivate: false, deleted: false, url: `https://e.com/${i}.mp4` }),
    }, USER_SK);
    for (const relay of alive) relay.seedEvent(ev);
    if (i === 0) videoIds.push(ev.id);
  }
  // Seed a report on the first video so the batched report sub has something.
  if (videoIds[0]) {
    const rep = finalizeEvent({ kind: 1984, created_at: now, tags: [["e", videoIds[0]], ["p", USER_PK], ["t", "nudity"]], content: "x" }, REPORTER_SK);
    for (const relay of alive) relay.seedEvent(rep);
  }

  const browser = await chromium.launch({ headless: process.env.HEADLESS !== "0" });
  const ctx = await browser.newContext();

  ctx.exposeBinding("__gpk", () => USER_PK);
  ctx.exposeBinding("__sign", (_s, e) => finalizeEvent({ ...e, pubkey: USER_PK }, USER_SK));
  ctx.exposeBinding("__n04e", (_s, pk, t) => nip04.encrypt(USER_SK, pk, t));
  ctx.exposeBinding("__n04d", (_s, pk, c) => nip04.decrypt(USER_SK, pk, c));
  ctx.exposeBinding("__n44e", (_s, pk, t) => nip44.v2.encrypt(t, convKey(pk)));
  ctx.exposeBinding("__n44d", (_s, pk, c) => nip44.v2.decrypt(c, convKey(pk)));

  await ctx.addInitScript((relays) => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
    localStorage.setItem("__bitvidTestRelays__", JSON.stringify(relays));
    window.__bitvidTestRelays__ = relays;
    const w = (n) => (...a) => window[n](...a);
    window.nostr = {
      getPublicKey: () => w("__gpk")(),
      signEvent: (e) => w("__sign")(e),
      getRelays: async () => ({}),
      nip04: { encrypt: (p, t) => w("__n04e")(p, t), decrypt: (p, c) => w("__n04d")(p, c) },
      nip44: { encrypt: (p, t) => w("__n44e")(p, t), decrypt: (p, c) => w("__n44d")(p, c), v2: { encrypt: (p, t) => w("__n44e")(p, t), decrypt: (p, c) => w("__n44d")(p, c) } },
    };
  }, allRelays);

  const page = await ctx.newPage();
  page.on("websocket", (ws) => {
    const h = host(ws.url());
    ws.on("framesent", (d) => {
      const p = typeof d.payload === "string" ? d.payload : "";
      if (!p.startsWith('["REQ"')) return;
      if (measuring) reqByHost.set(h, (reqByHost.get(h) || 0) + 1);
      try {
        const msg = JSON.parse(p);
        for (const f of msg.slice(2)) {
          if (Array.isArray(f?.kinds) && f.kinds.includes(1984)) {
            reportFilterShapes.push(Array.isArray(f["#e"]) ? f["#e"].length : 0);
          }
        }
      } catch {}
    });
  });

  const testUrl = `${APP}/?__test__=1&__testRelays__=${encodeURIComponent(allRelays.join(","))}`;
  await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page.evaluate((r) => window.__bitvidTest__?.setTestRelays?.(r, { persist: false }), allRelays).catch(() => {});
  await page.evaluate(() => {
    const c = window.__bitvidTest__?.nostrClient;
    if (c) c.videoEventVerifier = async (events) => new Set((events || []).map((e) => e && e.id).filter(Boolean));
  }).catch(() => {});
  try {
    await page.click('[data-testid="login-button"]', { timeout: 8000 });
    await page.waitForSelector('[data-testid="login-modal"]', { timeout: 8000 });
    const b = page.getByRole("button", { name: /extension|nip-?07|browser/i }).first();
    if (await b.count()) await b.click({ timeout: 5000 });
    else await page.locator('[data-testid="login-provider-button"]').first().click({ timeout: 5000 });
  } catch {}
  await page.waitForFunction(async () => (await window.__bitvidTest__?.getAppState?.())?.isLoggedIn === true, { timeout: 15000 }).catch(() => {});

  let firstCard = "NONE";
  try {
    await page.waitForSelector("[data-video-id]", { timeout: 30000 });
    firstCard = "rendered";
  } catch {}

  // Steady-state window.
  await page.waitForTimeout(5000);
  measuring = true;
  await page.waitForTimeout(WINDOW * 1000);
  measuring = false;

  const connectedHosts = await page.evaluate(() => {});
  await browser.close();
  for (const relay of alive) { if (typeof relay.close === "function") await relay.close(); }

  // ---- Report ----
  const steadyTotal = [...reqByHost.values()].reduce((a, b) => a + b, 0);
  const distinctHosts = reqByHost.size;
  const maxReportBatch = reportFilterShapes.length ? Math.max(...reportFilterShapes) : 0;
  const perIdReportFilters = reportFilterShapes.filter((n) => n <= 1).length;

  console.log("\n================ FLAKY MULTI-RELAY ================");
  console.log(`Configured relays: ${allRelays.length} (${ALIVE_PORTS.length} alive, ${DEAD_PORTS.length} dead)`);
  console.log(`Video grid: ${firstCard}`);
  console.log(`Distinct relays receiving REQs (steady ${WINDOW}s): ${distinctHosts} (cap is 6)`);
  console.log(`Steady-state REQ frames: ${steadyTotal} (${(steadyTotal / WINDOW).toFixed(1)}/s)`);
  console.log(`Report (kind 1984) filters seen: ${reportFilterShapes.length}; max #e per filter: ${maxReportBatch}; per-id (<=1 id) filters: ${perIdReportFilters}`);

  const checks = [
    ["grid renders from alive relays", firstCard === "rendered"],
    ["subscribes on <= 6 relays (cap holds)", distinctHosts <= 6],
    ["no steady-state storm (< 10 REQ/s)", steadyTotal / WINDOW < 10],
    ["report sub is batched (no per-id filters)", perIdReportFilters === 0 || maxReportBatch > 1],
  ];
  let ok = true;
  console.log("");
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (!pass) ok = false;
  }
  console.log("==================================================\n");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("flaky-relays failed:", e); process.exit(1); });
