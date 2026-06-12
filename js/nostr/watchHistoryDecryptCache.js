// Persisted cache of decrypted watch-history chunk plaintext, keyed by the
// immutable chunk event id.
//
// Watch history is stored as ~150 separately encrypted chunk events. Decrypting
// each one means a round-trip to the nip-07 extension (the private key lives in
// the extension and cannot be cached locally), and the extension serializes
// these — so a full re-decrypt costs many seconds on EVERY load. Chunk events
// are addressable/replaceable: an unchanged chunk keeps its event id, while a
// modified chunk republishes under a new id. Caching plaintext by event id means
// reloads decrypt only the chunk(s) that actually changed (typically one),
// skipping the extension for the rest.
//
// The decrypted plaintext is no more sensitive than the watch-history `items`
// already persisted by the manager. Cleared on logout.

const STORAGE_KEY = "bitvid:whDecryptedChunks:v1";
const MAX_ENTRIES = 400;

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
      const raw = localStorage.getItem(STORAGE_KEY);
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

export function getCachedChunkPlaintext(eventId) {
  if (!eventId) {
    return null;
  }
  const c = ensure();
  return c.has(eventId) ? c.get(eventId) : null;
}

export function setCachedChunkPlaintext(eventId, plaintext) {
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

/** Persist pending writes once (call after a batch of decrypts). Bounds size. */
export function flushDecryptedChunkCache() {
  if (!dirty) {
    return;
  }
  dirty = false;
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    let entries = Array.from(cache.entries());
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(entries.length - MAX_ENTRIES);
      cache = new Map(entries);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (_) {
    // ignore persistence failures (quota/availability)
  }
}

export function clearWatchHistoryDecryptedChunkCache() {
  cache = new Map();
  dirty = false;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (_) {
    // ignore
  }
}
