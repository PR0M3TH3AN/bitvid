// Regression: after a successful zap, receipt validation failed with "Unable to
// initialize a relay pool for receipt validation." nostr-tools 2.x SimplePool no
// longer has .list(), and the validator constructed a fresh raw pool and required
// pool.list. resolveReceiptListPool must apply the app's legacy .list shim so a
// 2.x pool can query — and honor a listEvents override without needing .list.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveReceiptListPool,
  buildReceiptFilters,
} from "../js/payments/zapReceiptValidator.js";

// Mimics a nostr-tools 2.x SimplePool: instances have subscribeMany/close but NO
// .list() (the method was removed in 2.x).
function makeV2Tools() {
  function SimplePool() {
    this.subscribeMany = () => ({ close() {} });
    this.querySync = async () => [];
    this.close = () => {};
  }
  return { SimplePool };
}

test("a freshly constructed 2.x pool (no .list) gets the legacy .list shim", () => {
  const tools = makeV2Tools();
  const bare = new tools.SimplePool();
  assert.equal(typeof bare.list, "undefined", "2.x pool starts without .list");

  const pool = resolveReceiptListPool(tools, {});
  assert.ok(pool, "a pool must be returned");
  assert.equal(
    typeof pool.list,
    "function",
    "the shim must add .list so receipt validation can query relays",
  );
});

test("createPool override is respected and shimmed when it lacks .list", () => {
  const created = { subscribeMany: () => ({ close() {} }), close: () => {} };
  const pool = resolveReceiptListPool({}, { createPool: () => created });
  assert.equal(pool, created, "must use the override-created pool");
  assert.equal(typeof pool.list, "function", "and shim it with .list");
});

test("a listEvents override means the pool is left as-is (no shim required)", () => {
  const created = { close: () => {} }; // no list, no subscribeMany
  const pool = resolveReceiptListPool(
    {},
    { createPool: () => created, listEvents: async () => [] },
  );
  assert.equal(pool, created);
  assert.equal(
    typeof pool.list,
    "undefined",
    "with a listEvents override the validator uses it, so .list isn't forced",
  );
});

test("returns null when there is no SimplePool and no override", () => {
  const pool = resolveReceiptListPool({}, {});
  assert.equal(pool, null);
});

// Receipt discovery: a previous filter queried ONLY by "#bolt11", which most
// relays don't index, so the receipt was never found and a successful zap looked
// unconfirmed. buildReceiptFilters must query by the reliably-indexed #e/#a/#p.
test("buildReceiptFilters: prefers #e (event) + #p (recipient), not #bolt11", () => {
  const zapRequest = {
    tags: [
      ["p", "a".repeat(64)],
      ["e", "c".repeat(64)],
      ["amount", "900000"],
      ["relays", "wss://relay.example"],
    ],
  };
  const [filter] = buildReceiptFilters(zapRequest, "lnbc-invoice");
  assert.deepEqual(filter.kinds, [9735]);
  assert.deepEqual(filter["#e"], ["c".repeat(64)]);
  assert.deepEqual(filter["#p"], ["a".repeat(64)]);
  assert.ok(!filter["#bolt11"], "must not depend on the unindexed #bolt11 tag");
});

test("buildReceiptFilters: uses #a (coordinate) when there is no #e", () => {
  const zapRequest = {
    tags: [
      ["p", "a".repeat(64)],
      ["a", "30078:" + "a".repeat(64) + ":video-d-tag"],
    ],
  };
  const [filter] = buildReceiptFilters(zapRequest, "lnbc-invoice");
  assert.deepEqual(filter["#a"], ["30078:" + "a".repeat(64) + ":video-d-tag"]);
  assert.ok(!filter["#e"]);
  assert.deepEqual(filter["#p"], ["a".repeat(64)]);
});

test("buildReceiptFilters: falls back to #bolt11 only with no e/a/p anchor", () => {
  const zapRequest = { tags: [["amount", "1000"]] };
  const [filter] = buildReceiptFilters(zapRequest, "LNBC-Invoice");
  assert.deepEqual(filter["#bolt11"], ["lnbc-invoice"]);
  assert.deepEqual(filter.kinds, [9735]);
});
