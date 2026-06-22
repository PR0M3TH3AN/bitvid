// The "My Videos" management tab flags maintenance issues per video so a user can
// keep a large library clean. classifyVideoHealth is the pure decision core:
// no-source -> error (red), hosted-and-unreachable -> warning, deleted -> info,
// otherwise ok. It must NOT flag external/unverifiable URLs as broken.

import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyVideoHealth,
  isUrlUnderBase,
  VIDEO_HEALTH_STATUS,
} from "../js/ui/profileModal/myVideosHealth.js";

const BASE = "https://cdn.example.com";

test("a video with neither URL nor magnet is a red no-source error", () => {
  const r = classifyVideoHealth({ url: "", magnet: "" }, { publicBaseUrl: BASE });
  assert.equal(r.status, VIDEO_HEALTH_STATUS.NO_SOURCE);
  assert.equal(r.severity, "error");
});

test("a magnet-only video is OK (no hosted URL needed)", () => {
  const r = classifyVideoHealth({ url: "", magnet: "magnet:?xt=urn:btih:abc" }, { publicBaseUrl: BASE });
  assert.equal(r.status, VIDEO_HEALTH_STATUS.OK);
  assert.equal(r.severity, "ok");
});

test("a hosted URL with no probe is OK", () => {
  const r = classifyVideoHealth({ url: `${BASE}/u/npub1/h/v.mp4` }, { publicBaseUrl: BASE });
  assert.equal(r.status, VIDEO_HEALTH_STATUS.OK);
  assert.equal(r.hosted, true);
});

test("a deleted note is classified as deleted (info), not no-source", () => {
  // Soft-delete scrubs url/magnet; deleted must win over no-source.
  const r = classifyVideoHealth({ url: "", magnet: "", deleted: true }, { publicBaseUrl: BASE });
  assert.equal(r.status, VIDEO_HEALTH_STATUS.DELETED);
  assert.equal(r.severity, "info");
});

test("a hosted URL that fails its probe is a dead-url warning", () => {
  const r = classifyVideoHealth(
    { url: `${BASE}/u/npub1/h/v.mp4` },
    { publicBaseUrl: BASE, urlProbe: { ok: false } },
  );
  assert.equal(r.status, VIDEO_HEALTH_STATUS.DEAD_URL);
  assert.equal(r.severity, "warning");
});

test("an EXTERNAL URL that fails its probe is NOT flagged (unverifiable, no false alarm)", () => {
  const r = classifyVideoHealth(
    { url: "https://third-party.example/v.mp4" },
    { publicBaseUrl: BASE, urlProbe: { ok: false } },
  );
  assert.equal(r.status, VIDEO_HEALTH_STATUS.OK);
  assert.equal(r.hosted, false);
});

test("a hosted URL whose probe succeeds is OK", () => {
  const r = classifyVideoHealth(
    { url: `${BASE}/u/npub1/h/v.mp4` },
    { publicBaseUrl: BASE, urlProbe: { ok: true } },
  );
  assert.equal(r.status, VIDEO_HEALTH_STATUS.OK);
});

test("isUrlUnderBase handles trailing slashes, external hosts, and empty input", () => {
  assert.equal(isUrlUnderBase(`${BASE}/a/b.mp4`, BASE), true);
  assert.equal(isUrlUnderBase(`${BASE}/a/b.mp4`, `${BASE}/`), true, "trailing slash on base");
  assert.equal(isUrlUnderBase("https://evil.example/a.mp4", BASE), false);
  assert.equal(isUrlUnderBase(`${BASE}-lookalike.com/a.mp4`, BASE), false, "prefix must be a path boundary");
  assert.equal(isUrlUnderBase("", BASE), false);
  assert.equal(isUrlUnderBase(`${BASE}/a.mp4`, ""), false);
});
