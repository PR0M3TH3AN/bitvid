// Headless console capture WHILE LOGGED IN via the test harness (nsec).
// Reproduces a structural (data-independent) logged-in CPU loop.
//
// Usage: node scripts/perf/loop-capture-login.mjs [seconds]

import { chromium } from "playwright";
import { randomBytes } from "node:crypto";

const seconds = Number(process.argv[2] || 12);
const url = "http://localhost:3000/?__test__=1";
const hexKey = randomBytes(32).toString("hex");

const counts = new Map();
const firstSeen = new Map();
const pageErrors = [];
const normalize = (t) =>
  t
    .replace(/[0-9a-f]{16,}/gi, "<hex>")
    .replace(/\b\d{10,}\b/g, "<ts>")
    .replace(/\b\d+(\.\d+)?ms\b/g, "<ms>")
    .slice(0, 200);

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
page.on("console", (msg) => {
  const text = `${msg.type().toUpperCase()} ${msg.text()}`;
  const key = normalize(text);
  counts.set(key, (counts.get(key) || 0) + 1);
  if (!firstSeen.has(key)) firstSeen.set(key, text);
});
page.on("pageerror", (e) => pageErrors.push(e.message));

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

// Wait for the harness, then log in with a throwaway key.
let loggedIn = false;
try {
  await page.waitForFunction(() => !!window.__bitvidTest__?.loginWithNsec, {
    timeout: 15000,
  });
  const res = await page.evaluate(async (k) => {
    try {
      await window.__bitvidTest__.loginWithNsec(k);
      return window.__bitvidTest__.getAppState();
    } catch (e) {
      return { error: String(e) };
    }
  }, hexKey);
  loggedIn = !res?.error;
  console.log("login result:", JSON.stringify(res)?.slice(0, 300));
} catch (e) {
  console.log("harness/login error:", e.message);
}

// Reset counters to measure the steady post-login state.
counts.clear();
firstSeen.clear();
const start = Date.now();
await page.waitForTimeout(seconds * 1000);
const elapsed = (Date.now() - start) / 1000;
await browser.close();

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n=== Logged-in capture (${elapsed.toFixed(1)}s, loggedIn=${loggedIn}) ===`);
console.log(`Distinct lines: ${sorted.length}`);
console.log("TOP REPEATED LINES (count → rate → sample):");
for (const [key, n] of sorted.slice(0, 18)) {
  console.log(`  ${String(n).padStart(6)}  (${(n / elapsed).toFixed(1)}/s)  ${firstSeen.get(key)}`);
}
if (pageErrors.length) {
  console.log(`\nPAGE ERRORS (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 10)) console.log("  ✗ " + e);
}
console.log("");
