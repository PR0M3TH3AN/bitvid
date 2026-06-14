// Capture outgoing relay REQ frames while logged in, to identify which
// subscription is storming. Groups REQs by their filter signature.
//
// Usage: node scripts/perf/req-capture.mjs [seconds]

import { chromium } from "playwright";
import { randomBytes } from "node:crypto";

const seconds = Number(process.argv[2] || 12);
const url = "http://localhost:3000/?__test__=1";
const hexKey = randomBytes(32).toString("hex");

const reqBySig = new Map();
const sampleBySig = new Map();
let totalReq = 0;
let closeFrames = 0;

function filterSig(filters) {
  try {
    return filters
      .map((f) => {
        const kinds = f.kinds ? `kinds=${f.kinds.join(",")}` : "";
        const keys = Object.keys(f)
          .filter((k) => k !== "kinds")
          .map((k) => (Array.isArray(f[k]) ? `${k}[${f[k].length}]` : k))
          .join(",");
        return `${kinds} ${keys}`.trim();
      })
      .join(" | ");
  } catch {
    return "??";
  }
}

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

page.on("websocket", (ws) => {
  ws.on("framesent", (data) => {
    const payload = typeof data.payload === "string" ? data.payload : "";
    if (!payload.startsWith("[")) return;
    try {
      const msg = JSON.parse(payload);
      if (msg[0] === "REQ") {
        totalReq += 1;
        const sig = filterSig(msg.slice(2));
        reqBySig.set(sig, (reqBySig.get(sig) || 0) + 1);
        if (!sampleBySig.has(sig)) sampleBySig.set(sig, JSON.stringify(msg.slice(2)).slice(0, 160));
      } else if (msg[0] === "CLOSE") {
        closeFrames += 1;
      }
    } catch {}
  });
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
try {
  await page.waitForFunction(() => !!window.__bitvidTest__?.loginWithNsec, { timeout: 15000 });
  await page.evaluate((k) => window.__bitvidTest__.loginWithNsec(k), hexKey);
} catch (e) {
  console.log("login error:", e.message);
}

// Let the initial feed load + per-video enrichment settle, then measure the
// true steady state (so a one-time load burst isn't mistaken for a loop).
await page.waitForTimeout(8000);
reqBySig.clear();
sampleBySig.clear();
totalReq = 0;
closeFrames = 0;
const start = Date.now();
await page.waitForTimeout(seconds * 1000);
const elapsed = (Date.now() - start) / 1000;
await browser.close();

const sorted = [...reqBySig.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n=== Outgoing REQ capture (${elapsed.toFixed(1)}s) ===`);
console.log(`Total REQ frames: ${totalReq}  (${(totalReq / elapsed).toFixed(1)}/s)`);
console.log(`Total CLOSE frames: ${closeFrames}  (${(closeFrames / elapsed).toFixed(1)}/s)\n`);
console.log("REQ by filter signature (count → rate → sample):");
for (const [sig, n] of sorted.slice(0, 15)) {
  console.log(`  ${String(n).padStart(6)}  (${(n / elapsed).toFixed(1)}/s)  ${sig}`);
  console.log(`           e.g. ${sampleBySig.get(sig)}`);
}
console.log("");
