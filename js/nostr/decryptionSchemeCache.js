// js/nostr/decryptionSchemeCache.js

/**
 * Shared decryption scheme cache across all list services (blocks,
 * subscriptions, hashtag preferences). When one service discovers the
 * correct decryption scheme for a pubkey, the others can reuse it
 * immediately instead of independently probing the NIP-07 extension.
 *
 * This eliminates redundant extension decrypt calls during the critical
 * login path where all three services decrypt simultaneously.
 */

const DECRYPTION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** @type {Map<string, { scheme: string, timestamp: number }>} */
const cache = new Map();

/**
 * Retrieve the last successfully-used decryption scheme for a pubkey.
 * Returns null if the entry is missing or expired.
 *
 * @param {string} pubkey - Hex pubkey to look up.
 * @returns {string|null} The scheme identifier (e.g. "nip44_v2") or null.
 */
export function getLastSuccessfulScheme(pubkey) {
  if (typeof pubkey !== "string" || !pubkey) {
    return null;
  }

  const entry = cache.get(pubkey);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > DECRYPTION_CACHE_TTL_MS) {
    cache.delete(pubkey);
    return null;
  }

  return entry.scheme;
}

/**
 * Record a successful decryption scheme for a pubkey so other services
 * can skip scheme discovery.
 *
 * @param {string} pubkey - Hex pubkey.
 * @param {string} scheme - The scheme that succeeded (e.g. "nip44_v2").
 */
export function setLastSuccessfulScheme(pubkey, scheme) {
  if (typeof pubkey !== "string" || !pubkey) {
    return;
  }
  if (typeof scheme !== "string" || !scheme) {
    return;
  }

  cache.set(pubkey, { scheme, timestamp: Date.now() });
}

/**
 * Clear all cached entries. Useful on logout.
 */
export function clearDecryptionSchemeCache() {
  cache.clear();
}
