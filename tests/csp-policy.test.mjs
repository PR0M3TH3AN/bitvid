// Regression test for the Content-Security-Policy on the HTML entry points.
//
// SCN-csp-script-src-locks-inline-hash:
//   Given index.html / embed.html ship a CSP whose security depends on a strict
//     script-src (no 'unsafe-inline'),
//   When the inline bootstrap <script> is hashed,
//   Then that exact sha256 must be listed in script-src — otherwise the browser
//     blocks our own bootstrap (app broken) or someone added 'unsafe-inline'
//     (XSS protection silently gutted).
//
// This catches the most likely future regression: editing the inline script
// without updating the hash, or relaxing script-src to make it "work".

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function extractCsp(html) {
  // The content value itself contains single quotes ('self', 'none', hashes),
  // so capture up to the same quote char that opens the attribute.
  const meta = html.match(
    /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(["'])([\s\S]*?)\1/i,
  );
  return meta ? meta[2] : "";
}

function parseDirectives(csp) {
  const map = new Map();
  for (const part of csp.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    map.set(name.toLowerCase(), values);
  }
  return map;
}

function inlineScriptHashes(htmlRaw) {
  // Browsers ignore content inside HTML comments; strip them so prose mentioning
  // "script" in a comment is not mistaken for a real inline <script>.
  const html = htmlRaw.replace(/<!--[\s\S]*?-->/g, "");
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  const hashes = [];
  let m;
  while ((m = re.exec(html))) {
    hashes.push(
      "sha256-" + createHash("sha256").update(m[1], "utf8").digest("base64"),
    );
  }
  return hashes;
}

for (const file of ["index.html", "embed.html"]) {
  test(`${file}: CSP exists and script-src is strict`, () => {
    const html = readFileSync(path.join(ROOT, file), "utf8");
    const csp = extractCsp(html);
    assert.ok(csp, `${file} must declare a Content-Security-Policy meta`);

    const directives = parseDirectives(csp);
    const scriptSrc = directives.get("script-src");
    assert.ok(scriptSrc, "script-src must be set");

    // The whole point: script execution must NOT be wide open.
    assert.ok(
      !scriptSrc.includes("'unsafe-inline'"),
      "script-src must not allow 'unsafe-inline' (defeats XSS protection)",
    );
    assert.ok(
      !scriptSrc.includes("'unsafe-eval'"),
      "script-src must not allow 'unsafe-eval' (no bundle needs it)",
    );
    assert.ok(scriptSrc.includes("'self'"), "script-src must include 'self'");

    // object-src/base-uri are cheap, high-value XSS hardening.
    assert.deepEqual(
      directives.get("object-src"),
      ["'none'"],
      "object-src must be 'none'",
    );
    assert.deepEqual(
      directives.get("base-uri"),
      ["'self'"],
      "base-uri must be 'self'",
    );
  });

  test(`${file}: every inline <script> is hash-allowlisted in script-src`, () => {
    const html = readFileSync(path.join(ROOT, file), "utf8");
    const scriptSrc = parseDirectives(extractCsp(html)).get("script-src") || [];
    for (const hash of inlineScriptHashes(html)) {
      assert.ok(
        scriptSrc.includes(`'${hash}'`),
        `inline <script> in ${file} has hash ${hash} which is not listed in ` +
          `script-src — update the CSP meta after editing the inline script`,
      );
    }
  });
}
