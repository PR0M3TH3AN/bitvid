// js/nostr/syncMetadataStore.js

import { userLogger } from "../utils/logger.js";

const SYNC_METADATA_STORAGE_KEY = "bitvid:nostrSyncMetadata:v1";

/**
 * SyncMetadataStore
 *
 * Persists last-seen timestamps for incremental list fetching.
 * Key format: `${kind}:${pubkey}:${dTag}:${relayUrl}`
 *
 * Note: dTag can be empty string for non-parameterized replaceable events.
 */
export class SyncMetadataStore {
  constructor() {
    this.metadata = new Map();
    this.load();
  }

  computeKey(kind, pubkey, dTag, relayUrl) {
    const k = kind || 0;
    const p = pubkey ? pubkey.trim().toLowerCase() : "";
    const d = dTag ? dTag.trim() : "";
    const r = relayUrl ? relayUrl.trim() : "";
    return `${k}:${p}:${d}:${r}`;
  }

  load() {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      const raw = localStorage.getItem(SYNC_METADATA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.metadata = new Map(parsed);
        } else if (typeof parsed === "object") {
          this.metadata = new Map(Object.entries(parsed));
        }
      }
    } catch (error) {
      userLogger.warn("[SyncMetadataStore] Failed to load metadata:", error);
    }
  }

  save() {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      // Serialize Map to array of entries for JSON
      const entries = Array.from(this.metadata.entries());
      localStorage.setItem(SYNC_METADATA_STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      userLogger.warn("[SyncMetadataStore] Failed to save metadata:", error);
    }
  }

  getLastSeen(kind, pubkey, dTag, relayUrl) {
    const key = this.computeKey(kind, pubkey, dTag, relayUrl);
    const val = this.metadata.get(key);
    return Number.isFinite(val) ? val : 0;
  }

  updateLastSeen(kind, pubkey, dTag, relayUrl, createdAt) {
    const timestamp = Number(createdAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return;
    }

    const key = this.computeKey(kind, pubkey, dTag, relayUrl);
    const current = this.metadata.get(key);

    // Only update if newer
    if (!Number.isFinite(current) || timestamp > current) {
      this.metadata.set(key, timestamp);
      this.save();
    }
  }

  getPerRelayLastSeen(kind, pubkey, dTag) {
    const prefix = `${kind}:${pubkey ? pubkey.trim().toLowerCase() : ""}:${dTag ? dTag.trim() : ""}:`;
    const result = {};
    for (const [key, val] of this.metadata.entries()) {
      if (key.startsWith(prefix)) {
        const relayUrl = key.slice(prefix.length);
        if (relayUrl) {
          result[relayUrl] = val;
        }
      }
    }
    return result;
  }
}

export const __testExports = {
    SYNC_METADATA_STORAGE_KEY
};
