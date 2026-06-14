// Capture the JS call stack at the moment each REQ frame is sent, to pinpoint
// the exact code re-issuing subscriptions in a loop. Overrides WebSocket.send
// via an init script (runs before app code), tags each REQ with a stack, and
// aggregates by stack signature.
//
// Usage: node scripts/perf/req-stack-capture.mjs [seconds]

import { chromium } from "playwright";
import { randomBytes } from "node:crypto";

const seconds = Number(process.argv[2] || 10);
const url = "http://localhost:3000/?__test__=1";
const hexKey = randomBytes(32).toString("hex");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

await ctx.addInitScript(() => {
  const origSend = WebSocket.prototype.send;
  window.__reqStacks = window.__reqStacks || {};
  WebSocket.prototype.send = function (data) {
    try {
      if (typeof data === "string" && data.startsWith('["REQ"')) {
        const stack = new Error().stack || "";
        // Keep app frames only; drop the wrapper + node_modules noise.
        const lines = stack
          .split("\n")
          .slice(2)
          .map((l) => l.trim())
          .filter((l) => l.includes("/js/"))
          .map((l) => l.replace(/.*\/js\//, "js/").replace(/:\d+:\d+\)?$/, ""))
          .slice(0, 4);
        const sig = lines.join("  <-  ") || "(no app frames)";
        window.__reqStacks[sig] = (window.__reqStacks[sig] || 0) + 1;
      }
    } catch {}
    return origSend.apply(this, arguments);
  };
});

const page = await ctx.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
try {
  await page.waitForFunction(() => !!window.__bitvidTest__?.loginWithNsec, { timeout: 15000 });
  await page.evaluate((k) => window.__bitvidTest__.loginWithNsec(k), hexKey);
} catch (e) {
  console.log("login error:", e.message);
}

await page.evaluate(() => { window.__reqStacks = {}; });
await page.waitForTimeout(seconds * 1000);
const stacks = await page.evaluate(() => window.__reqStacks);
await browser.close();

const sorted = Object.entries(stacks).sort((a, b) => b[1] - a[1]);
console.log(`\n=== REQ call-site stacks (${seconds}s) ===\n`);
for (const [sig, n] of sorted.slice(0, 12)) {
  console.log(`${String(n).padStart(5)}  (${(n / seconds).toFixed(1)}/s)`);
  console.log(`        ${sig}\n`);
}
