// Persisted cache of decrypted watch-history chunk plaintext, keyed by the
// immutable chunk event id. Backed by the shared persisted-plaintext-cache
// factory (see persistedPlaintextCache.js). An unchanged chunk keeps its event
// id, so reloads decrypt only the chunk(s) that actually changed and skip the
// nip-07 extension for the rest. Cleared on logout.

import { createPersistedPlaintextCache } from "./persistedPlaintextCache.js";

const cache = createPersistedPlaintextCache("bitvid:whDecryptedChunks:v1", 400);

export const getCachedChunkPlaintext = cache.get;
export const setCachedChunkPlaintext = cache.set;
export const flushDecryptedChunkCache = cache.flush;
export const clearWatchHistoryDecryptedChunkCache = cache.clear;
