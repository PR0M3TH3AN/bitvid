// Standalone live profiler for the running bitvid dev server.
// Drives the real app in Chromium, captures a CPU profile (CDP Profiler) and a
// long-task report during cold load + interaction, then prints the hottest
// functions by self-time and the worst long tasks.
//
// Usage: node scripts/perf/profile-live.mjs [url]
//   default url: http://localhost:3000/

import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3000/";
const SETTLE_MS = Number(process.env.SETTLE_MS || 18000);

function fmt(ms) {
  return `${ms.toFixed(0)}ms`;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Long-task observer installed before any app code runs.
  await page.addInitScript(() => {
    window.__longtasks__ = [];
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__longtasks__.push({
            start: entry.startTime,
            duration: entry.duration,
            name: entry.name,
            attribution: (entry.attribution || []).map((a) => ({
              name: a.name,
              containerType: a.containerType,
              containerName: a.containerName,
              containerSrc: a.containerSrc,
            })),
          });
        }
      });
      obs.observe({ entryTypes: ["longtask"] });
    } catch (e) {
      // longtask not supported
    }
    window.__marks__ = {};
    window.__t0__ = performance.now();
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 }); // 100us
  await cdp.send("Profiler.start");

  const navStart = Date.now();
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Time-to-first-video-card.
  let firstCardMs = null;
  try {
    await page.waitForSelector('[data-testid="video-list"] a, [data-testid="video-list"] [data-video-id], [data-testid="video-list"] article', { timeout: SETTLE_MS });
    firstCardMs = Date.now() - navStart;
  } catch (e) {
    firstCardMs = null;
  }

  // Let the feed settle / stream in.
  await page.waitForTimeout(SETTLE_MS);

  // Interaction: scroll the feed, then try a tab/nav switch to surface jank.
  await page.evaluate(async () => {
    window.__marks__.scrollStart = performance.now();
    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, 800);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.__marks__.scrollEnd = performance.now();
  });

  // Try clicking nav links (subscriptions / explore / home) to switch views.
  const navClicks = [];
  for (const sel of ["#subscriptionsLink", 'a[href="#view=explore"]', 'a[href="#view=subscriptions"]', 'a[href="#view=home"]']) {
    const el = await page.$(sel);
    if (el) {
      const t = Date.now();
      try {
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(1500);
        navClicks.push({ sel, ms: Date.now() - t });
      } catch (e) {
        navClicks.push({ sel, error: String(e).split("\n")[0] });
      }
    }
  }

  const { profile } = await cdp.send("Profiler.stop");

  // Aggregate self-time by function (node hitCount * sampling interval).
  const intervalMs = 0.1; // 100us
  const byFn = new Map();
  const nodeById = new Map();
  for (const node of profile.nodes) nodeById.set(node.id, node);
  for (const node of profile.nodes) {
    const cf = node.callFrame;
    const key = `${cf.functionName || "(anonymous)"} @ ${(cf.url || "").split("/").slice(-1)[0]}:${cf.lineNumber + 1}`;
    const self = (node.hitCount || 0) * intervalMs;
    byFn.set(key, (byFn.get(key) || 0) + self);
  }
  const topFns = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);

  const longtasks = await page.evaluate(() => window.__longtasks__ || []);
  const totalLongtaskMs = longtasks.reduce((s, t) => s + t.duration, 0);
  const worst = [...longtasks].sort((a, b) => b.duration - a.duration).slice(0, 15);

  console.log("\n================ LIVE PROFILE ================");
  console.log(`URL: ${URL}`);
  console.log(`Time-to-first-video-card: ${firstCardMs === null ? "NEVER (timed out)" : fmt(firstCardMs)}`);
  console.log(`Nav switch timings: ${JSON.stringify(navClicks)}`);
  console.log(`\nLong tasks: count=${longtasks.length}, total=${fmt(totalLongtaskMs)}`);
  console.log("Worst long tasks (duration | attribution):");
  for (const t of worst) {
    const attr = (t.attribution[0] && (t.attribution[0].containerName || t.attribution[0].name)) || t.name;
    console.log(`  ${fmt(t.duration).padStart(7)}  @ ${fmt(t.start)}  ${attr}`);
  }

  console.log(`\nTop functions by self-time (CPU profile):`);
  for (const [fn, ms] of topFns) {
    console.log(`  ${fmt(ms).padStart(8)}  ${fn}`);
  }
  console.log("=============================================\n");

  await browser.close();
}

main().catch((e) => {
  console.error("profiler failed:", e);
  process.exit(1);
});
