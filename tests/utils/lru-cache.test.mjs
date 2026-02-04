import assert from "node:assert/strict";
import test from "node:test";

import { LRUCache } from "../../js/utils/lruCache.js";

test("LRUCache: constructor sets default maxSize", () => {
  const cache = new LRUCache();
  assert.equal(cache.maxSize, 100);
  assert.equal(cache.size(), 0);
});

test("LRUCache: constructor accepts custom maxSize", () => {
  const cache = new LRUCache({ maxSize: 5 });
  assert.equal(cache.maxSize, 5);
});

test("LRUCache: constructor uses default for invalid maxSize", () => {
  const cache1 = new LRUCache({ maxSize: 0 });
  assert.equal(cache1.maxSize, 100);

  const cache2 = new LRUCache({ maxSize: -5 });
  assert.equal(cache2.maxSize, 100);
});

test("LRUCache: set and get basic functionality", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size(), 3);
});

test("LRUCache: get returns undefined for missing keys", () => {
  const cache = new LRUCache({ maxSize: 3 });
  cache.set("a", 1);

  assert.equal(cache.get("nonexistent"), undefined);
});

test("LRUCache: evicts oldest item when maxSize exceeded", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("d", 4); // Should evict "a"

  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.get("d"), 4);
  assert.equal(cache.size(), 3);
});

test("LRUCache: get refreshes recency", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  // Access "a" to make it recently used
  cache.get("a");

  // Add new item - should evict "b" (oldest) not "a"
  cache.set("d", 4);

  assert.equal(cache.get("a"), 1); // "a" should still exist
  assert.equal(cache.get("b"), undefined); // "b" should be evicted
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.get("d"), 4);
});

test("LRUCache: set updates existing key and refreshes recency", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  // Update "a" with new value
  cache.set("a", 100);

  // Add new item - should evict "b" not "a"
  cache.set("d", 4);

  assert.equal(cache.get("a"), 100);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.size(), 3);
});

test("LRUCache: has checks existence without affecting recency", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  // Check "a" existence without affecting recency
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("nonexistent"), false);

  // Stats should not change from has()
  const stats = cache.getStats();
  assert.equal(stats.hits, 0);
  assert.equal(stats.misses, 0);

  // Add new item - should evict "a" since has() didn't refresh it
  cache.set("d", 4);
  assert.equal(cache.has("a"), false);
});

test("LRUCache: tracks hits and misses", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);

  cache.get("a"); // hit
  cache.get("a"); // hit
  cache.get("b"); // hit
  cache.get("c"); // miss
  cache.get("d"); // miss

  const stats = cache.getStats();
  assert.equal(stats.hits, 3);
  assert.equal(stats.misses, 2);
  assert.equal(stats.size, 2);
  assert.equal(stats.maxSize, 3);
});

test("LRUCache: clear resets cache and stats", () => {
  const cache = new LRUCache({ maxSize: 3 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a");
  cache.get("missing");

  cache.clear();

  assert.equal(cache.size(), 0);
  assert.equal(cache.get("a"), undefined);

  const stats = cache.getStats();
  assert.equal(stats.hits, 0);
  assert.equal(stats.misses, 1); // The get("a") after clear counts as miss
  assert.equal(stats.size, 0);
});

test("LRUCache: entries returns iterator in insertion order", () => {
  const cache = new LRUCache({ maxSize: 5 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  const entries = Array.from(cache.entries());
  assert.deepEqual(entries, [
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);
});

test("LRUCache: entries reflects recency updates", () => {
  const cache = new LRUCache({ maxSize: 5 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  // Access "a" to move it to end
  cache.get("a");

  const entries = Array.from(cache.entries());
  assert.deepEqual(entries, [
    ["b", 2],
    ["c", 3],
    ["a", 1],
  ]);
});

test("LRUCache: handles null and undefined values", () => {
  const cache = new LRUCache({ maxSize: 5 }); // Enough space for all items

  cache.set("null", null);
  cache.set("undefined", undefined);
  cache.set("zero", 0);
  cache.set("empty", "");

  // null should be stored and retrieved correctly
  assert.equal(cache.get("null"), null);

  // 0 and "" are falsy but should be stored correctly
  assert.equal(cache.get("zero"), 0);
  assert.equal(cache.get("empty"), "");

  // undefined values are stored but get() returns undefined
  // (indistinguishable from missing key based on return value)
  assert.equal(cache.get("undefined"), undefined);
});

test("LRUCache: handles various key types", () => {
  const cache = new LRUCache({ maxSize: 5 });

  cache.set("string", "value1");
  cache.set("123", "value2");
  cache.set("with spaces", "value3");
  cache.set("special!@#$", "value4");

  assert.equal(cache.get("string"), "value1");
  assert.equal(cache.get("123"), "value2");
  assert.equal(cache.get("with spaces"), "value3");
  assert.equal(cache.get("special!@#$"), "value4");
});

test("LRUCache: handles object values", () => {
  const cache = new LRUCache({ maxSize: 3 });

  const obj = { foo: "bar", nested: { a: 1 } };
  cache.set("obj", obj);

  const retrieved = cache.get("obj");
  assert.equal(retrieved, obj); // Same reference
  assert.deepEqual(retrieved, { foo: "bar", nested: { a: 1 } });
});

test("LRUCache: maxSize of 1 works correctly", () => {
  const cache = new LRUCache({ maxSize: 1 });

  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);

  cache.set("b", 2);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.size(), 1);
});

test("LRUCache: stress test with many insertions", () => {
  const cache = new LRUCache({ maxSize: 100 });

  // Insert 1000 items
  for (let i = 0; i < 1000; i++) {
    cache.set(`key${i}`, i);
  }

  // Only last 100 should remain
  assert.equal(cache.size(), 100);

  // First 900 should be evicted
  for (let i = 0; i < 900; i++) {
    assert.equal(cache.has(`key${i}`), false);
  }

  // Last 100 should exist
  for (let i = 900; i < 1000; i++) {
    assert.equal(cache.has(`key${i}`), true);
    assert.equal(cache.get(`key${i}`), i);
  }
});
