
/**
 * A generic Least Recently Used (LRU) cache implementation.
 * It supports a maximum size limit. When the limit is reached,
 * the least recently accessed item is evicted.
 *
 * Note: This cache does not automatically evict items based on TTL.
 * It is up to the consumer to check timestamps if expiration is needed.
 */
export class LRUCache {
  /**
   * @param {object} options
   * @param {number} [options.maxSize=100] - Maximum number of entries.
   */
  constructor({ maxSize = 100 } = {}) {
    this.maxSize = maxSize > 0 ? maxSize : 100;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Retrieves an item from the cache.
   * If found, the item is marked as most recently used and hit count increments.
   * If not found, miss count increments.
   *
   * @param {string} key
   * @returns {*} The cached value, or undefined if not found.
   */
  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Refresh recency: delete and re-set
      this.cache.delete(key);
      this.cache.set(key, value);
      this.hits++;
    } else {
      this.misses++;
    }
    return value;
  }

  /**
   * Adds or updates an item in the cache.
   * The item is marked as most recently used.
   * If the cache exceeds maxSize, the least recently used item is evicted.
   *
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // The first key in a Map is the oldest (insertion order)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  /**
   * Checks if a key exists in the cache without updating its recency or metrics.
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Returns the number of items in the cache.
   *
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * Clears all items from the cache and resets counters.
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Returns current statistics for the cache.
   * @returns {{ hits: number, misses: number, size: number, maxSize: number }}
   */
  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Returns an iterator of [key, value] pairs, from oldest to newest.
   */
  entries() {
    return this.cache.entries();
  }
}
