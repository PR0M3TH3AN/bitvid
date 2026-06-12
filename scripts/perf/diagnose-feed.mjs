import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3000/";
const WAIT_MS = Number(process.env.WAIT_MS || 20000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).split("\n")[0]}`));

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(WAIT_MS);

const state = await page.evaluate(async () => {
  const out = {};
  try {
    const t = window.__bitvidTest__;
    out.harness = !!t;
    if (t && typeof t.getAppState === "function") {
      out.appState = await t.getAppState();
    }
  } catch (e) {
    out.harnessError = String(e).split("\n")[0];
  }
  const list = document.querySelector('[data-testid="video-list"]');
  out.videoListFound = !!list;
  out.videoListChildCount = list ? list.children.length : null;
  out.videoListText = list ? (list.textContent || "").trim().slice(0, 200) : null;
  out.cardsByDataVideoId = document.querySelectorAll("[data-video-id]").length;
  // any visible error/lockdown banners
  out.bodyTextSample = (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 400);
  return out;
});

console.log("\n===== FEED DIAGNOSIS =====");
console.log(JSON.stringify(state, null, 2));
console.log("\n===== CONSOLE (errors/warnings first 40) =====");
for (const l of logs.filter((l) => /error|warn|fail|lockdown|relay|reject/i.test(l)).slice(0, 40)) {
  console.log(l);
}
console.log(`\n(total console lines: ${logs.length})`);
await browser.close();
