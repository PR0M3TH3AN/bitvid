// Provider-aware storage CORS setup helper. The helper must give the RIGHT rules +
// apply-command for each provider: B2-native rules + the b2 CLI for Backblaze B2, and
// standard S3 CORS + AWS CLI / dashboard guidance for Custom S3 and Cloudflare R2.
// The invariant across all of them: the rules allow browser uploads (PUT/POST), which
// is what makes uploads stop CORS-failing.

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  buildBucketCorsRules,
  buildS3CorsConfig,
  buildB2CorsCommand,
  buildAwsCorsCommand,
  buildCorsHelpContent,
  StorageCorsHelp,
} from "../js/ui/profileModal/storageCorsHelp.js";

test("B2-native rules include the upload operations the B2 presets omit", () => {
  const [rule] = buildBucketCorsRules(["https://bitvid.network"]);
  assert.ok(rule.allowedOperations.includes("s3_put"));
  assert.ok(rule.allowedOperations.includes("s3_post"));
  assert.ok(rule.allowedOperations.includes("s3_get"));
});

test("standard S3 CORS config allows upload + ranged playback methods", () => {
  const cfg = buildS3CorsConfig(["https://bitvid.network"]);
  const rule = cfg.CORSRules[0];
  assert.deepEqual(rule.AllowedMethods, ["GET", "HEAD", "PUT", "POST", "DELETE"]);
  // OPTIONS is not a valid S3 AllowedMethod and must not be present.
  assert.ok(!rule.AllowedMethods.includes("OPTIONS"));
  assert.deepEqual(rule.ExposeHeaders, [
    "ETag",
    "Content-Length",
    "Content-Range",
    "Accept-Ranges",
  ]);
});

test("origins fall back to every-origin when none are provided", () => {
  assert.deepEqual(buildBucketCorsRules([])[0].allowedOrigins, ["*"]);
  assert.deepEqual(buildS3CorsConfig(undefined).CORSRules[0].AllowedOrigins, ["*"]);
});

test("B2 command targets the bucket allPublic with compact one-line JSON", () => {
  const cmd = buildB2CorsCommand("bitvid", buildBucketCorsRules(["https://x"]));
  assert.match(cmd, /^b2 update-bucket --corsRules '.*' bitvid allPublic$/);
  assert.ok(!cmd.includes("\n"));
});

test("AWS command includes the endpoint + bucket, one line", () => {
  const cmd = buildAwsCorsCommand(
    "vids",
    "https://s3.example.com",
    buildS3CorsConfig(["https://x"]),
  );
  assert.match(
    cmd,
    /^aws s3api put-bucket-cors --bucket vids --endpoint-url https:\/\/s3\.example\.com --cors-configuration '.*'$/,
  );
});

test("content for Backblaze B2 uses B2-native rules + the b2 CLI", () => {
  const c = buildCorsHelpContent({
    provider: "backblaze_b2",
    origins: ["https://bitvid.network"],
    bucket: "bitvid",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
  });
  assert.match(c.cmd, /^b2 update-bucket /);
  assert.match(c.cmdLabel, /B2 command-line/i);
  assert.ok(JSON.parse(c.json)[0].allowedOperations.includes("s3_put"));
  assert.match(c.notes, /b2 CLI|pip install b2/i);
});

test("content for Custom S3 uses standard S3 CORS + the AWS CLI", () => {
  const c = buildCorsHelpContent({
    provider: "generic_s3",
    origins: ["https://bitvid.network"],
    bucket: "vids",
    endpoint: "https://s3.example.com",
  });
  assert.match(c.cmd, /^aws s3api put-bucket-cors /);
  assert.match(c.cmd, /--endpoint-url https:\/\/s3\.example\.com/);
  assert.ok(JSON.parse(c.json).CORSRules[0].AllowedMethods.includes("PUT"));
  assert.doesNotMatch(c.cmd, /backblaze|b2 update-bucket/i);
});

test("content for Cloudflare R2 uses S3 CORS and points at the R2 dashboard", () => {
  const c = buildCorsHelpContent({
    provider: "cloudflare_r2",
    origins: ["https://bitvid.network"],
    bucket: "vids",
    endpoint: "https://acct.r2.cloudflarestorage.com",
  });
  assert.match(c.cmd, /^aws s3api put-bucket-cors /);
  assert.match(c.notes, /Cloudflare dashboard/i);
  assert.match(c.cmdLabel, /Cloudflare/i);
  assert.ok(JSON.parse(c.json).CORSRules);
});

// --- DOM behavior (provider switch reflected in the modal) ---
let dom;
beforeEach(() => {
  dom = new JSDOM(
    `<!doctype html><html><body>
      <select id="prov"><option value="cloudflare_r2">r2</option></select>
      <button id="storageCorsHelpBtn"></button>
      <div id="storageCorsModal" class="hidden">
        <div class="modal-sheet" tabindex="-1"></div>
        <button data-storage-cors-dismiss id="x"></button>
        <p id="storageCorsModalIntro"></p>
        <code id="storageCorsJson"></code>
        <span id="storageCorsCmdLabel"></span>
        <code id="storageCorsCli"></code>
        <p id="storageCorsNotes"></p>
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

test("open() renders provider-specific content and pre-fills the current origin", () => {
  let provider = "backblaze_b2";
  const help = new StorageCorsHelp({
    getProvider: () => provider,
    getBucket: () => "bitvid",
    getRegion: () => "us-west-004",
    getEndpoint: () => "",
  });
  help.cacheDom(dom.window.document);
  help.registerEventListeners();

  help.open();
  const doc = dom.window.document;
  assert.ok(!doc.getElementById("storageCorsModal").classList.contains("hidden"));
  assert.match(doc.getElementById("storageCorsCli").textContent, /^b2 update-bucket /);
  const b2Rule = JSON.parse(doc.getElementById("storageCorsJson").textContent)[0];
  assert.deepEqual(b2Rule.allowedOrigins, ["https://unstable.bitvid.network"]);

  // Switch provider → reopening yields the AWS-CLI form.
  provider = "generic_s3";
  help.open();
  assert.match(doc.getElementById("storageCorsCli").textContent, /^aws s3api put-bucket-cors /);
  assert.ok(JSON.parse(doc.getElementById("storageCorsJson").textContent).CORSRules);
});

test("dismiss controls hide the modal again", () => {
  const help = new StorageCorsHelp({ getProvider: () => "generic_s3" });
  help.cacheDom(dom.window.document);
  help.registerEventListeners();
  help.open();
  dom.window.document.getElementById("x").click();
  assert.ok(
    dom.window.document.getElementById("storageCorsModal").classList.contains("hidden"),
  );
});
