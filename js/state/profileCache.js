import { CACHE_POLICIES, STORAGE_TIERS } from "../nostr/cachePolicies.js";
import { userLogger } from "../utils/logger.js";

const PROFILE_CACHE_VERSION = 1;
const STORAGE_KEY_PREFIX = "bitvid:profile:";

class ProfileCache {
  constructor() {
    this.activePubkey = null;
    this.memoryCache = new Map(); // For runtime decrypted data: pubkey:section -> data
    this.listeners = new Set();
  }

  normalizeHexPubkey(pubkey) {
    if (typeof pubkey !== "string") {
      return null;
    }
    const trimmed = pubkey.trim();
    if (!trimmed) {
      return null;
    }
    // Simple hex check, relying on callers to provide valid hex mostly,
    // but robust enough to handle basic whitespace.
    // For full validation we'd need nostr-tools or similar regex.
    // Assuming standard 64-char hex for now.
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return null;
  }

  getStorageKey(pubkey, section) {
    return `${STORAGE_KEY_PREFIX}${pubkey}:${section}:v${PROFILE_CACHE_VERSION}`;
  }

  getStorageTier(section) {
    // We assume section maps to a NOTE_TYPE or we map it manually.
    // For now, let's map known sections to cache policies.
    // If unknown, default to LOCAL_STORAGE for safety or MEMORY if ephemeral.

    // Mapping section names used in services to CACHE_POLICIES keys
    // subscriptions -> NOTE_TYPES.SUBSCRIPTION_LIST (30000)
    // blocks -> NOTE_TYPES.USER_BLOCK_LIST (30002/10000)
    // interests -> NOTE_TYPES.HASHTAG_PREFERENCES (30015/30005)
    // watchHistory -> NOTE_TYPES.WATCH_HISTORY (30078)
    // relays -> NOTE_TYPES.RELAY_LIST (10002)

    // We'll rely on the caller passing the correct section key that matches CACHE_POLICIES logic
    // OR we define a map here.

    // Let's use simple string keys for sections and map them here.
    const policyMap = {
      "subscriptions": "subscription_list", // maps to NOTE_TYPES.SUBSCRIPTION_LIST
      "blocks": "user_block_list",
      "interests": "hashtag_preferences",
      "watchHistory": "watch_history",
      "relays": "relay_list",
      // Add others as needed
    };

    // Note: CACHE_POLICIES keys are the note types (strings or numbers).
    // In `js/nostr/cachePolicies.js`:
    // [NOTE_TYPES.SUBSCRIPTION_LIST]: ...
    // We need to know what NOTE_TYPES.SUBSCRIPTION_LIST evaluates to.
    // However, we can just look up by the policy object directly if we import NOTE_TYPES.
    // But to avoid circular deps or heavy imports, we can just check the storage tier directly if provided via config
    // or assume LOCAL_STORAGE for these user lists as per requirements.

    // For now, hardcode LOCAL_STORAGE for the known persistent types, as per the plan's context.
    return STORAGE_TIERS.LOCAL_STORAGE;
  }

  setActiveProfile(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (this.activePubkey === normalized) {
      return;
    }

    // Clear memory cache for the old profile to remove sensitive decrypted data
    if (this.activePubkey) {
      this.clearMemoryCache(this.activePubkey);
    }

    this.activePubkey = normalized;

    // Emit change event
    this.emit("profileChanged", { pubkey: this.activePubkey });
  }

  getActiveProfile() {
    return this.activePubkey;
  }

  get(section) {
    if (!this.activePubkey) {
      return null;
    }
    return this.getProfileData(this.activePubkey, section);
  }

  set(section, data) {
    if (!this.activePubkey) {
      return;
    }
    this.setProfileData(this.activePubkey, section, data);
  }

  getProfileData(pubkey, section) {
    // 1. Check memory cache (runtime data)
    const memKey = `${pubkey}:${section}`;
    if (this.memoryCache.has(memKey)) {
      return this.memoryCache.get(memKey);
    }

    // 2. Load from persistence (canonical/encrypted data)
    // Note: 'get' is often used for the *decrypted* runtime state in services.
    // But services need to load the *persisted* data to decrypt it.
    // The separation of concerns:
    // - profileCache stores the *persisted* blob (encrypted or raw).
    // - Services decrypt it and store the *result* back in profileCache's memory tier?
    // OR services keep their own runtime state?
    // The plan says: "Keep decrypted/plaintext and signer-dependent runtime caches **in memory**"
    // "Services remain logic + event emitters that read/write through the partition".

    // So:
    // `profileCache.get(section)` should probably return the *persisted* data.
    // Services maintain their own runtime state derived from it, OR we allow storing runtime state in `profileCache` too?
    // If `profileCache` is just a storage wrapper, `get` returns what's in localStorage.

    // Let's implement `load` from storage.
    const storageKey = this.getStorageKey(pubkey, section);
    const tier = this.getStorageTier(section);

    if (tier === STORAGE_TIERS.LOCAL_STORAGE && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          return JSON.parse(raw);
        }
      } catch (error) {
        userLogger.warn(`[ProfileCache] Failed to load ${section} for ${pubkey}`, error);
      }
    }

    return null;
  }

  setProfileData(pubkey, section, data) {
    const storageKey = this.getStorageKey(pubkey, section);
    const tier = this.getStorageTier(section);

    // Save to storage
    if (tier === STORAGE_TIERS.LOCAL_STORAGE && typeof localStorage !== "undefined") {
      try {
        if (data === null || data === undefined) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify(data));
        }
      } catch (error) {
        userLogger.warn(`[ProfileCache] Failed to save ${section} for ${pubkey}`, error);
      }
    }

    // Update memory cache?
    // If `get` reads from storage, `set` writes to storage.
    // We can also cache in memory to avoid parsing JSON every time if we want.
    // But if services manage runtime state, `profileCache` acts as the persistence layer.

    this.emit("update", { pubkey, section, data });
    this.emit("partition-updated", { pubkey, key: section });
  }

  // Runtime memory cache methods (for decrypted data, if services want to use it)
  // Or maybe services just use `get` and `set` for persistence?
  // The plan says: "Keep decrypted/plaintext... in memory keyed by pubkey... and clear them on signer change."
  // This implies `profileCache` SHOULD manage the memory cache too.

  setMemoryData(section, data) {
    if (!this.activePubkey) return;
    const key = `${this.activePubkey}:${section}`;
    this.memoryCache.set(key, data);
  }

  getMemoryData(section) {
    if (!this.activePubkey) return null;
    const key = `${this.activePubkey}:${section}`;
    return this.memoryCache.get(key);
  }

  clearMemoryCache(pubkey) {
    // Clear all entries starting with pubkey:
    const prefix = `${pubkey}:`;
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }

  clearSignerRuntime(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return;
    }
    this.clearMemoryCache(normalized);
    this.emit("runtimeCleared", { pubkey: normalized });
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event, detail) {
    for (const listener of this.listeners) {
      try {
        listener(event, detail);
      } catch (error) {
        console.error("[ProfileCache] Listener error", error);
      }
    }
  }
}

export const profileCache = new ProfileCache();
