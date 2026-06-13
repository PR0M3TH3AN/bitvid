// Shared factory for a persisted "decrypted plaintext" cache keyed by event id.
//
// Several nostr surfaces (watch-history chunks, direct messages) decrypt many
// immutable events, each of which is a serialized round-trip to the nip-07
// extension (the private key lives in the extension and cannot be cached
// locally). Caching the decrypted plaintext by event id means reloads decrypt
// only events we haven't seen before, skipping the extension for the rest —
// across sessions.
//
// The cached plaintext is no more sensitive than the data each surface already
// persists (watch-history items; DM previews). Callers must clear the cache on
// logout so a decrypted secret never outlives its session.
//
// @param {string} storageKey  localStorage key for this cache.
// @param {number} [maxEntries] cap on retained entries (most-recent kept).

export function createPersistedPlaintextCache(storageKey, maxEntries = 400) {
  /** @type {Map<string, string> | null} */
  let cache = null;
  let dirty = false;

  function ensure() {
    if (cache) {
      return cache;
    }
    cache = new Map();
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            cache = new Map(parsed);
          }
        }
      }
    } catch (_) {
      cache = new Map();
    }
    return cache;
  }

  function get(eventId) {
    if (!eventId) {
      return null;
    }
    const c = ensure();
    return c.has(eventId) ? c.get(eventId) : null;
  }

  function set(eventId, plaintext) {
    if (!eventId || typeof plaintext !== "string" || !plaintext) {
      return;
    }
    const c = ensure();
    if (c.get(eventId) === plaintext) {
      return;
    }
    c.set(eventId, plaintext);
    dirty = true;
  }

  // Persist pending writes once (call after a batch of decrypts). Bounds size.
  function flush() {
    if (!dirty) {
      return;
    }
    dirty = false;
    try {
      if (typeof localStorage === "undefined") {
        return;
      }
      let entries = Array.from(cache.entries());
      if (entries.length > maxEntries) {
        entries = entries.slice(entries.length - maxEntries);
        cache = new Map(entries);
      }
      localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch (_) {
      // ignore persistence failures (quota/availability)
    }
  }

  function clear() {
    cache = new Map();
    dirty = false;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(storageKey);
      }
    } catch (_) {
      // ignore
    }
  }

  return { get, set, flush, clear };
}
