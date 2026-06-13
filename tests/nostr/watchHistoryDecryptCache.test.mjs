// Verifies the decrypted watch-history chunk cache: plaintext is reused by
// event id (so reloads skip the nip-07 extension for unchanged chunks),
// persists across "sessions", is bounded, and clears on logout.

import test from "node:test";
import assert from "node:assert/strict";
import "../test-helpers/setup-localstorage.mjs";

const STORAGE_KEY = "bitvid:whDecryptedChunks:v1";

async function freshModule() {
  // Re-import to reset module-level cache (simulates a page reload that
  // re-hydrates from localStorage).
  return import(`../../js/nostr/watchHistoryDecryptCache.js?bust=${Math.random()}`);
}

test("get/set round-trips plaintext by event id", async () => {
  const m = await freshModule();
  assert.equal(m.getCachedChunkPlaintext("evt-a"), null);
  m.setCachedChunkPlaintext("evt-a", '{"items":[1]}');
  assert.equal(m.getCachedChunkPlaintext("evt-a"), '{"items":[1]}');
});

test("flush persists and a fresh module re-hydrates from localStorage", async () => {
  localStorage.removeItem(STORAGE_KEY);
  const m1 = await freshModule();
  m1.setCachedChunkPlaintext("evt-persist", "PLAINTEXT");
  m1.flushDecryptedChunkCache();
  assert.ok(localStorage.getItem(STORAGE_KEY), "should write to localStorage");

  // New module instance (simulated reload) reads the persisted plaintext —
  // meaning no extension decrypt would be needed for this chunk.
  const m2 = await freshModule();
  assert.equal(m2.getCachedChunkPlaintext("evt-persist"), "PLAINTEXT");
});

test("ignores empty/invalid input", async () => {
  const m = await freshModule();
  m.setCachedChunkPlaintext("", "x");
  m.setCachedChunkPlaintext("evt", "");
  m.setCachedChunkPlaintext("evt", null);
  assert.equal(m.getCachedChunkPlaintext("evt"), null);
});

test("clear empties the cache and localStorage", async () => {
  const m = await freshModule();
  m.setCachedChunkPlaintext("evt-x", "data");
  m.flushDecryptedChunkCache();
  m.clearWatchHistoryDecryptedChunkCache();
  assert.equal(m.getCachedChunkPlaintext("evt-x"), null);
  assert.equal(localStorage.getItem(STORAGE_KEY), null);
});

test("bounds the cache to a maximum number of entries", async () => {
  localStorage.removeItem(STORAGE_KEY);
  const m = await freshModule();
  for (let i = 0; i < 500; i++) {
    m.setCachedChunkPlaintext(`evt-${i}`, `p${i}`);
  }
  m.flushDecryptedChunkCache();
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert.ok(stored.length <= 400, `expected <=400 entries, got ${stored.length}`);
  // Most recent entries are retained.
  const m2 = await freshModule();
  assert.equal(m2.getCachedChunkPlaintext("evt-499"), "p499");
});
