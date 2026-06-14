// Headless console capture to find a CPU loop in the running dev build.
// Loads localhost:3000, records all console messages for a window, then
// reports the most-repeated messages (the loop) and any page errors.
//
// Usage: node scripts/perf/loop-capture.mjs [url] [seconds]

import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:3000";
const seconds = Number(process.argv[3] || 10);

const counts = new Map();
const firstSeen = new Map();
const pageErrors = [];

function normalize(text) {
  // Collapse hashes / ids / timestamps so repeats of the "same" line group.
  return text
    .replace(/[0-9a-f]{16,}/gi, "<hex>")
    .replace(/\b\d{10,}\b/g, "<ts>")
    .replace(/\b\d+(\.\d+)?ms\b/g, "<ms>")
    .slice(0, 200);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on("console", (msg) => {
  const text = `${msg.type().toUpperCase()} ${msg.text()}`;
  const key = normalize(text);
  counts.set(key, (counts.get(key) || 0) + 1);
  if (!firstSeen.has(key)) firstSeen.set(key, text);
});
page.on("pageerror", (err) => {
  pageErrors.push(err.message);
});

const start = Date.now();
try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
} catch (e) {
  console.log("goto error:", e.message);
}

await page.waitForTimeout(seconds * 1000);
const elapsed = (Date.now() - start) / 1000;

await browser.close();

const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n=== Console capture (${elapsed.toFixed(1)}s @ ${url}) ===`);
console.log(`Total distinct lines: ${sorted.length}\n`);
console.log("TOP REPEATED LINES (count → sample):");
for (const [key, n] of sorted.slice(0, 15)) {
  const rate = (n / elapsed).toFixed(1);
  console.log(`  ${String(n).padStart(5)}  (${rate}/s)  ${firstSeen.get(key)}`);
}
if (pageErrors.length) {
  console.log(`\nPAGE ERRORS (${pageErrors.length}):`);
  for (const e of pageErrors.slice(0, 10)) console.log("  ✗ " + e);
}
console.log("");
