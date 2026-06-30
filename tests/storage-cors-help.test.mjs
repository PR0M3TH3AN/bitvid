// Storage CORS setup helper (B2 / S3-compatible): the rules + command bitvid shows a
// user so in-browser uploads work. The crucial property: the rules include the UPLOAD
// operations (s3_put / s3_post) that B2's web-console "share" presets omit — that gap
// is exactly why uploads CORS-fail until these custom rules are applied.

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  buildBucketCorsRules,
  buildB2CorsCommand,
  StorageCorsHelp,
} from "../js/ui/profileModal/storageCorsHelp.js";

test("CORS rules include the upload operations the B2 presets omit", () => {
  const [rule] = buildBucketCorsRules(["https://bitvid.network"]);
  for (const op of ["s3_put", "s3_post"]) {
    assert.ok(
      rule.allowedOperations.includes(op),
      `rule must allow ${op} (browser upload) — the whole point of this helper`,
    );
  }
  // ...and still allow ranged playback reads.
  assert.ok(rule.allowedOperations.includes("s3_get"));
  assert.ok(rule.allowedOperations.includes("s3_head"));
  assert.deepEqual(rule.exposeHeaders, [
    "ETag",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
  ]);
});

test("CORS rules use the given origins, and fall back to every-origin when none", () => {
  assert.deepEqual(
    buildBucketCorsRules(["https://a.example", "https://b.example"])[0]
      .allowedOrigins,
    ["https://a.example", "https://b.example"],
  );
  assert.deepEqual(buildBucketCorsRules([])[0].allowedOrigins, ["*"]);
  assert.deepEqual(buildBucketCorsRules(undefined)[0].allowedOrigins, ["*"]);
});

test("the B2 CLI command targets the bucket as allPublic with compact one-line JSON", () => {
  const rules = buildBucketCorsRules(["https://bitvid.network"]);
  const cmd = buildB2CorsCommand("bitvid", rules);
  assert.match(cmd, /^b2 update-bucket --corsRules '.*' bitvid allPublic$/);
  assert.ok(!cmd.includes("\n"), "command must be a single pasteable line");
  // The embedded JSON is valid and carries the upload op.
  const json = cmd.slice(cmd.indexOf("'") + 1, cmd.lastIndexOf("'"));
  assert.ok(JSON.parse(json)[0].allowedOperations.includes("s3_put"));
});

test("a missing bucket name degrades to an obvious placeholder (not an empty arg)", () => {
  assert.match(buildB2CorsCommand("", buildBucketCorsRules([])), /YOUR_BUCKET allPublic$/);
});

// --- DOM behavior ---
let dom;
beforeEach(() => {
  dom = new JSDOM(
    `<!doctype html><html><body>
      <button id="storageCorsHelpBtn" class="hidden"></button>
      <div id="storageCorsModal" class="hidden">
        <div class="modal-sheet" tabindex="-1"></div>
        <button data-storage-cors-dismiss id="x"></button>
        <code id="storageCorsJson"></code>
        <code id="storageCorsCli"></code>
        <button id="storageCorsCopyJsonBtn"></button>
        <button id="storageCorsCopyCmdBtn"></button>
      </div>
    </body></html>`,
    { url: "https://unstable.bitvid.network/" },
  );
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.window = dom.window;
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.HTMLElement;
  delete globalThis.window;
});

test("open() fills the JSON + command from the current origin and reveals the modal", () => {
  const help = new StorageCorsHelp({ getBucket: () => "bitvid" });
  help.cacheDom(dom.window.document);
  help.registerEventListeners();

  help.open();

  const modal = dom.window.document.getElementById("storageCorsModal");
  assert.ok(!modal.classList.contains("hidden"), "modal is shown");

  const json = dom.window.document.getElementById("storageCorsJson").textContent;
  const rule = JSON.parse(json)[0];
  assert.deepEqual(
    rule.allowedOrigins,
    ["https://unstable.bitvid.network"],
    "origins pre-filled from getCorsOrigins()",
  );

  const cli = dom.window.document.getElementById("storageCorsCli").textContent;
  assert.match(cli, /bitvid allPublic$/);
});

test("dismiss controls hide the modal again", () => {
  const help = new StorageCorsHelp({ getBucket: () => "bitvid" });
  help.cacheDom(dom.window.document);
  help.registerEventListeners();
  help.open();
  dom.window.document.getElementById("x").click();
  assert.ok(
    dom.window.document.getElementById("storageCorsModal").classList.contains("hidden"),
  );
});

test("setVisible toggles the help button for S3-compatible vs R2", () => {
  const help = new StorageCorsHelp({ getBucket: () => "" });
  help.cacheDom(dom.window.document);
  const btn = dom.window.document.getElementById("storageCorsHelpBtn");
  help.setVisible(true);
  assert.ok(!btn.classList.contains("hidden"));
  help.setVisible(false);
  assert.ok(btn.classList.contains("hidden"));
});
