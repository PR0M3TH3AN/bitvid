import { chromium } from "playwright";
import { randomBytes } from "node:crypto";

const seconds = Number(process.argv[2] || 10);
const url = "http://localhost:3000/?__test__=1";
const hexKey = randomBytes(32).toString("hex");

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
try {
  await page.waitForFunction(() => !!window.__bitvidTest__?.loginWithNsec, { timeout: 15000 });
  await page.evaluate((k) => window.__bitvidTest__.loginWithNsec(k), hexKey);
} catch (e) { console.log("login error:", e.message); }

await page.evaluate(() => { globalThis.__loopc = {}; });
await page.waitForTimeout(seconds * 1000);
const c = await page.evaluate(() => globalThis.__loopc || {});
await browser.close();

console.log(`\n=== Instrumented call counts (${seconds}s) ===`);
for (const [k, n] of Object.entries(c).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  (${(n / seconds).toFixed(1)}/s)  ${k}`);
}
console.log("");
