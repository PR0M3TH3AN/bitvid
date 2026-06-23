// Watch-history month bucketing: legacy/migrated items with no watch time
// (watchedAt 0) used to silo into a literal "1970-01" month that self-perpetuated
// (read back as 0 -> re-bucketed to 1970-01 -> re-published with 0). bitvid
// pointers embed the video's creation time in their d-tag; derive a stable
// fallback from it so those items land in a real month and the value is backfilled.
import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeWatchHistoryItems } from "../js/nostr/watchHistory.js";
import { deriveWatchedAtFromPointer } from "../js/nostr/watchHistoryBucketing.js";

const PK = "a".repeat(64);

test("deriveWatchedAtFromPointer: extracts the ms timestamp from a timestamp-first d-tag", () => {
  // 1761508697162 ms = 2025-10-26 ~ in seconds 1761508697
  const seconds = deriveWatchedAtFromPointer({
    value: `30078:${PK}:1761508697162-z7ax37o3nqm`,
  });
  assert.equal(seconds, 1761508697);
});

test("deriveWatchedAtFromPointer: extracts the ms timestamp from a timestamp-last d-tag", () => {
  const seconds = deriveWatchedAtFromPointer({
    value: `30078:${PK}:goblinbox-1782226234472`,
  });
  assert.equal(seconds, 1782226234);
});

test("deriveWatchedAtFromPointer: returns 0 for a hash-only d-tag (no plausible timestamp)", () => {
  const seconds = deriveWatchedAtFromPointer({
    value: `30078:${PK}:fd11d796f68d6cb02ae46bcdf0a1ee2f032dea747652d3e96fd13338c845a9d5`,
  });
  assert.equal(seconds, 0);
});

test("canonicalize: a watchedAt:0 item buckets into a REAL month (not 1970-01) and backfills", () => {
  const item = {
    type: "a",
    value: `30078:${PK}:1761508697162-z7ax37o3nqm`,
    watchedAt: 0,
  };
  const buckets = canonicalizeWatchHistoryItems([item]);
  const months = Object.keys(buckets);
  assert.ok(!months.includes("1970-01"), "must not silo a decodable item into 1970-01");
  assert.deepEqual(months, ["2025-10"], "item buckets by its derived creation month");
  // Backfilled so the published watchedAt map carries a real value (stops the loop).
  assert.equal(buckets["2025-10"][0].watchedAt, 1761508697);
});

test("canonicalize: a real watchedAt is unaffected", () => {
  const item = {
    type: "a",
    value: `30078:${PK}:goblinbox-1782226234472`,
    watchedAt: 1782237450, // a genuine, later watch time
  };
  const buckets = canonicalizeWatchHistoryItems([item]);
  // 1782237450 s = 2026-06; uses the real watch time, not the derived creation time.
  assert.deepEqual(Object.keys(buckets), ["2026-06"]);
  assert.equal(buckets["2026-06"][0].watchedAt, 1782237450);
});

test("canonicalize: a truly undecodable timestamp-less item still buckets stably (1970-01)", () => {
  const item = {
    type: "a",
    value: `30078:${PK}:fd11d796f68d6cb02ae46bcdf0a1ee2f032dea747652d3e96fd13338c845a9d5`,
    watchedAt: 0,
  };
  const buckets = canonicalizeWatchHistoryItems([item]);
  assert.deepEqual(Object.keys(buckets), ["1970-01"]);
});
