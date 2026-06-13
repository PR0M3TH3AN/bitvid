// Seeded live profiler: drives the dist build at localhost:3000 in test mode
// against an in-process mock relay seeded with a heavy video feed, then captures
// a CPU profile + long-task report across: cold feed render, tab switches, and
// profile-modal open. Reproduces CPU/DOM render jank without real-relay latency.
//
// Prereq: dev server running at http://localhost:3000 (npm start).
// Usage: node scripts/perf/profile-seeded.mjs [videoCount]

import { chromium } from "playwright";
import { startRelay } from "../agent/simple-relay.mjs";
import { finalizeEvent, getPublicKey, generateSecretKey } from "nostr-tools";

const VIDEO_COUNT = Number(process.argv[2] || 400);
const APP = "http://localhost:3000";
const WS_PORT = 8951;
const TEST_SK_HEX = "7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b";
const TEST_SK = Uint8Array.from(Buffer.from(TEST_SK_HEX, "hex"));

function makeVideoEvent(i, sk, pk, createdAt) {
  const dTag = `seed-${i}-${Math.random().toString(36).slice(2, 8)}`;
  const content = {
    version: 3,
    title: `Seeded Video ${i}`,
    videoRootId: dTag,
    mode: "dev",
    isPrivate: false,
    deleted: false,
    url: `https://example.com/v${i}.mp4`,
    description: `Perf seed video number ${i}`,
  };
  return finalizeEvent(
    {
      kind: 30078,
      created_at: createdAt,
      tags: [
        ["d", dTag],
        ["t", "video"],
        ["title", `Seeded Video ${i}`],
        ["url", `https://example.com/v${i}.mp4`],
      ],
      content: JSON.stringify(content),
      pubkey: pk,
    },
    sk,
  );
}

const fmt = (ms) => `${ms.toFixed(0)}ms`;

async function main() {
  // 1. Mock relay (in-process; seed directly).
  const relay = startRelay(WS_PORT, { httpPort: false });

  // A few distinct authors so the feed looks realistic.
  const authors = [];
  for (let a = 0; a < 6; a++) {
    const sk = a === 0 ? TEST_SK : generateSecretKey();
    authors.push({ sk, pk: getPublicKey(sk) });
  }
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < VIDEO_COUNT; i++) {
    const author = authors[i % authors.length];
    relay.seedEvent(makeVideoEvent(i, author.sk, author.pk, now - i * 60));
  }
  console.log(`Seeded ${VIDEO_COUNT} videos on ws://127.0.0.1:${WS_PORT}`);

  // 2. Browser + test mode.
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const relayUrl = `ws://127.0.0.1:${WS_PORT}`;
  await page.addInitScript((url) => {
    localStorage.setItem("hasSeenDisclaimer", "true");
    localStorage.setItem("__bitvidTestMode__", "1");
    localStorage.setItem("__bitvidTestRelays__", JSON.stringify([url]));
    window.__bitvidTestRelays__ = [url];
    localStorage.setItem("bitvid_admin_whitelist_mode", "false");
    // long-task observer
    window.__lt__ = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lt__.push({ s: e.startTime, d: e.duration });
      }).observe({ entryTypes: ["longtask"] });
    } catch (e) {}
    window.__mark = (name) => { (window.__marks ||= {})[name] = performance.now(); };
  }, relayUrl);

  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 240)));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).split("\n")[0]}`));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });

  const testUrl = `${APP}/?__test__=1&__testRelays__=${encodeURIComponent(relayUrl)}`;
  await page.goto(testUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  // Replicate the e2e fixture: explicitly activate the test relay, then reload so
  // the app boots its feed subscription against the mock relay (not real relays).
  await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});
  await page.goto(testUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.__bitvidTest__ === "object", { timeout: 20000 }).catch(() => {});
  await page.evaluate((url) => window.__bitvidTest__?.setTestRelays?.([url], { persist: false }), relayUrl).catch(() => {});

  await cdp.send("Profiler.start");
  const tNav = Date.now();

  // 3. Time-to-first-card + rendered count.
  let firstCardMs = null;
  try {
    await page.waitForSelector("[data-video-id]", { timeout: 25000 });
    firstCardMs = Date.now() - tNav;
  } catch (e) {}
  await page.waitForTimeout(4000);
  const cardCount = await page.evaluate(() => document.querySelectorAll("[data-video-id]").length);

  // 4. Scroll jank.
  await page.evaluate(async () => {
    window.__mark("scrollStart");
    for (let i = 0; i < 12; i++) { window.scrollBy(0, 900); await new Promise(r => setTimeout(r, 100)); }
    window.__mark("scrollEnd");
  });

  // 5. Tab switches (by visible text).
  const tabTimings = {};
  for (const label of ["Recently Added", "Explore", "For You"]) {
    const t = Date.now();
    try {
      await page.getByText(label, { exact: true }).first().click({ timeout: 3000 });
      await page.waitForTimeout(1800);
      tabTimings[label] = Date.now() - t;
    } catch (e) {
      tabTimings[label] = `ERR ${String(e).split("\n")[0].slice(0, 60)}`;
    }
  }

  // 6. Login + open profile modal (the reported hitch).
  let loginOk = false;
  try {
    loginOk = await page.evaluate(async (sk) => {
      if (window.__bitvidTest__?.loginWithNsec) {
        await window.__bitvidTest__.loginWithNsec(sk);
        return true;
      }
      return false;
    }, TEST_SK_HEX);
  } catch (e) {}
  await page.waitForTimeout(2500);

  let profileModalMs = null;
  try {
    const t = Date.now();
    await page.click('[data-testid="profile-button"]', { timeout: 3000 });
    await page.waitForTimeout(2500);
    profileModalMs = Date.now() - t;
  } catch (e) {}

  const { profile } = await cdp.send("Profiler.stop");

  // Aggregate CPU self-time by function.
  const byFn = new Map();
  for (const node of profile.nodes) {
    const cf = node.callFrame;
    const file = (cf.url || "").split("/").slice(-1)[0];
    const key = `${cf.functionName || "(anonymous)"} @ ${file}:${cf.lineNumber + 1}`;
    byFn.set(key, (byFn.get(key) || 0) + (node.hitCount || 0) * 0.1);
  }
  const topFns = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);

  // Caller attribution: for crypto/vendor leaf frames, attribute self-time to the
  // nearest ANCESTOR that lives in app /js/ code, so we learn WHO drives the cost.
  const parentOf = new Map();
  const nodeById2 = new Map();
  for (const node of profile.nodes) {
    nodeById2.set(node.id, node);
    for (const c of node.children || []) parentOf.set(c, node.id);
  }
  const isVendor = (url) => !url || /node_modules|modular\.mjs|weierstrass\.mjs|nostr-tools|nostr\.bundle|base\.mjs|sha256|webtorrent|\.bundle\.min/.test(url);
  const isAppJs = (url) => /\/js\//.test(url) && !isVendor(url);
  const cryptoByCaller = new Map();
  for (const node of profile.nodes) {
    const cf = node.callFrame;
    if (!/modular\.mjs|weierstrass\.mjs/.test(cf.url || "")) continue;
    const self = (node.hitCount || 0) * 0.1;
    if (self <= 0) continue;
    // walk up to nearest app frame
    let cur = node.id, hops = 0, appKey = "(no app ancestor)";
    while (cur !== undefined && hops < 60) {
      const n = nodeById2.get(cur);
      const u = n?.callFrame?.url || "";
      if (isAppJs(u)) { appKey = `${n.callFrame.functionName || "(anon)"} @ ${u.split("/").slice(-1)[0]}:${n.callFrame.lineNumber + 1}`; break; }
      cur = parentOf.get(cur); hops++;
    }
    cryptoByCaller.set(appKey, (cryptoByCaller.get(appKey) || 0) + self);
  }
  const topCryptoCallers = [...cryptoByCaller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  const lt = await page.evaluate(() => window.__lt__ || []);
  const ltTotal = lt.reduce((s, t) => s + t.d, 0);
  const worst = [...lt].sort((a, b) => b.d - a.d).slice(0, 12);

  console.log("\n================ SEEDED PROFILE ================");
  console.log(`Seeded videos: ${VIDEO_COUNT} | harness login: ${loginOk}`);
  console.log(`Time-to-first-card: ${firstCardMs === null ? "NEVER" : fmt(firstCardMs)} | cards rendered: ${cardCount}`);
  console.log(`Tab switch timings: ${JSON.stringify(tabTimings)}`);
  console.log(`Profile-modal open: ${profileModalMs === null ? "FAILED" : fmt(profileModalMs)}`);
  console.log(`\nLong tasks: count=${lt.length} total=${fmt(ltTotal)}; worst: ${worst.map(t => fmt(t.d)).join(", ")}`);
  console.log(`\nTop functions by self-time:`);
  for (const [fn, ms] of topFns) console.log(`  ${fmt(ms).padStart(8)}  ${fn}`);
  console.log(`\nsecp256k1 crypto attributed to nearest APP caller:`);
  for (const [fn, ms] of topCryptoCallers) console.log(`  ${fmt(ms).padStart(8)}  ${fn}`);
  const errs = logs.filter((l) => /error|warn|fail|reject/i.test(l)).slice(0, 12);
  if (errs.length) { console.log(`\nConsole (errors/warnings):`); errs.forEach((l) => console.log("  " + l)); }
  console.log("===============================================\n");

  await browser.close();
  if (typeof relay.close === "function") await relay.close();
  process.exit(0);
}

main().catch((e) => { console.error("seeded profiler failed:", e); process.exit(1); });
