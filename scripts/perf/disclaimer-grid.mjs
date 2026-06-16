// Reproduces the logged-out "videos don't load until refresh after dismissing
// the disclaimer" bug. Fresh context (no hasSeenDisclaimer), real relays.
//
// Usage: APP=http://localhost:3000 node scripts/perf/disclaimer-grid.mjs

import { chromium } from "playwright";

const APP = process.env.APP || "http://localhost:3000";

const cardCount = (page) =>
  page.evaluate(() => document.querySelectorAll("[data-video-id],[data-video-card]").length);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext(); // fresh: no hasSeenDisclaimer
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 160)));
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).split("\n")[0]}`));

await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30000 });

// Wait for the disclaimer accept button to actually exist (loadDisclaimer is async).
await page.waitForSelector("#acceptDisclaimer", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
const hadDisclaimer = await page.evaluate(() => {
  const m = document.getElementById("disclaimerModal");
  if (!m) return false;
  const cs = getComputedStyle(m);
  // Detect via several common "shown" mechanisms, not just display.
  return (
    m.offsetParent !== null ||
    cs.display !== "none" ||
    m.classList.contains("is-open") ||
    m.getAttribute("aria-hidden") === "false" ||
    !m.hasAttribute("hidden")
  );
});
const beforeDismiss = await cardCount(page);

// Dismiss the disclaimer via its real accept button.
let clicked = false;
try {
  const btn = page.locator("#acceptDisclaimer").first();
  if (await btn.count()) { await btn.click({ timeout: 4000 }); clicked = true; }
} catch (_) {}

// Poll the grid for up to ~15s AFTER dismiss — captures "never renders".
const timeline = [];
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  timeline.push(await cardCount(page));
}
const afterDismiss = timeline[timeline.length - 1];
console.log("post-dismiss card timeline (1s steps):", timeline.join(","));

// Now reload and re-check (the "refresh fixes it" path).
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const afterReload = await cardCount(page);

await browser.close();

console.log("\n=== DISCLAIMER → GRID ===");
console.log(`disclaimer shown:        ${hadDisclaimer}`);
console.log(`cards before dismiss:    ${beforeDismiss}`);
console.log(`dismiss clicked:         ${clicked}`);
console.log(`cards after dismiss:     ${afterDismiss}   <- BUG if 0`);
console.log(`cards after reload:      ${afterReload}    <- if >0 here but 0 above = the reported bug`);
const interesting = logs.filter((l) => /error|fail|grid|render|feed|disclaimer/i.test(l));
if (interesting.length) {
  console.log("\nrelevant logs:");
  for (const l of interesting.slice(0, 15)) console.log("  " + l);
}
console.log("");
