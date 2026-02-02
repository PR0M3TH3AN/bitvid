import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LRUCache } from "../../js/utils/lruCache.js";

describe("LRUCache", () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache({ maxSize: 3 });
  });

  it("should initialize with default options", () => {
    const defaultCache = new LRUCache();
    assert.equal(defaultCache.maxSize, 100);
    assert.equal(defaultCache.size(), 0);
  });

  it("should store and retrieve values", () => {
    cache.set("a", 1);
    assert.equal(cache.get("a"), 1);
    assert.equal(cache.has("a"), true);
    assert.equal(cache.size(), 1);
  });

  it("should evict oldest item when limit is reached", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.equal(cache.size(), 3);

    cache.set("d", 4); // Should evict 'a'
    assert.equal(cache.size(), 3);
    assert.equal(cache.has("a"), false);
    assert.equal(cache.get("b"), 2);
    assert.equal(cache.get("d"), 4);
  });

  it("should refresh recency on access", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Access 'a', making it newest
    cache.get("a");

    cache.set("d", 4); // Should evict 'b' (oldest is now 'b')

    assert.equal(cache.has("b"), false);
    assert.equal(cache.has("a"), true);
    assert.equal(cache.has("c"), true);
    assert.equal(cache.has("d"), true);
  });

  it("should update value and refresh recency on set", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Update 'a'
    cache.set("a", 10);

    cache.set("d", 4); // Should evict 'b'

    assert.equal(cache.get("a"), 10);
    assert.equal(cache.has("b"), false);
  });

  it("should track stats", () => {
    cache.set("a", 1);
    cache.get("a"); // Hit
    cache.get("b"); // Miss

    const stats = cache.getStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.size, 1);
    assert.equal(stats.maxSize, 3);
  });

  it("should clear cache", () => {
    cache.set("a", 1);
    cache.clear();
    assert.equal(cache.size(), 0);
    assert.equal(cache.getStats().hits, 0);
  });
});
