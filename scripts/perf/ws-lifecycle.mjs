// Watch websocket connection lifecycle while logged in: are sockets flapping
// (reconnect storm) or staying open (app-level re-subscription)?
//
// Usage: node scripts/perf/ws-lifecycle.mjs [seconds]

import { chromium } from "playwright";
import { randomBytes } from "node:crypto";

const seconds = Number(process.argv[2] || 12);
const url = "http://localhost:3000/?__test__=1";
const hexKey = randomBytes(32).toString("hex");

const opensByHost = new Map();
const closesByHost = new Map();
let measuring = false;

const host = (u) => {
  try { return new URL(u).host; } catch { return u; }
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

page.on("websocket", (ws) => {
  const h = host(ws.url());
  if (measuring) opensByHost.set(h, (opensByHost.get(h) || 0) + 1);
  ws.on("close", () => {
    if (measuring) closesByHost.set(h, (closesByHost.get(h) || 0) + 1);
  });
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
try {
  await page.waitForFunction(() => !!window.__bitvidTest__?.loginWithNsec, { timeout: 15000 });
  await page.evaluate((k) => window.__bitvidTest__.loginWithNsec(k), hexKey);
} catch (e) {
  console.log("login error:", e.message);
}

measuring = true;
const start = Date.now();
await page.waitForTimeout(seconds * 1000);
const elapsed = (Date.now() - start) / 1000;
await browser.close();

console.log(`\n=== WebSocket lifecycle (${elapsed.toFixed(1)}s, post-login) ===`);
const hosts = new Set([...opensByHost.keys(), ...closesByHost.keys()]);
for (const h of hosts) {
  const o = opensByHost.get(h) || 0;
  const c = closesByHost.get(h) || 0;
  console.log(`  ${h.padEnd(28)} opens=${String(o).padStart(4)} (${(o / elapsed).toFixed(1)}/s)  closes=${String(c).padStart(4)} (${(c / elapsed).toFixed(1)}/s)`);
}
console.log("");
