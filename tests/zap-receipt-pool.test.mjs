// Regression: after a successful zap, receipt validation failed with "Unable to
// initialize a relay pool for receipt validation." nostr-tools 2.x SimplePool no
// longer has .list(), and the validator constructed a fresh raw pool and required
// pool.list. resolveReceiptListPool must apply the app's legacy .list shim so a
// 2.x pool can query — and honor a listEvents override without needing .list.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { resolveReceiptListPool } from "../js/payments/zapReceiptValidator.js";

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
