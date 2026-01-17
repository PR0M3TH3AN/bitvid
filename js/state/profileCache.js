import { CACHE_POLICIES, STORAGE_TIERS } from "../nostr/cachePolicies.js";
import { NOTE_TYPES } from "../nostrEventSchemas.js";
import { devLogger, userLogger } from "../utils/logger.js";

const DEFAULT_PARTITION_KEY = "public";

class TinyEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return () => {};
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        userLogger.warn(
          `[ProfileCache] listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

class ProfilePartition {
  constructor(pubkey) {
    this.pubkey = pubkey || DEFAULT_PARTITION_KEY;
    this.state = {
      subscriptions: new Set(),
      userBlocks: new Set(),
      hashtagPreferences: {
        interests: new Set(),
        disinterests: new Set(),
        eventId: null,
        eventCreatedAt: null,
        version: 1,
        loaded: false,
      },
      watchHistory: {
        actors: {}
      }
    };
    this.signerRuntime = new Map(); // For decrypted caches, keyed by signerType
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
  }

  getSignerRuntime(signerType) {
    const key = signerType || "default";
    if (!this.signerRuntime.has(key)) {
      this.signerRuntime.set(key, {});
    }
    return this.signerRuntime.get(key);
  }

  clearSignerRuntime(signerType) {
    if (signerType) {
      this.signerRuntime.delete(signerType);
    } else {
      this.signerRuntime.clear();
    }
  }

  // Storage keys helpers
  getStorageKey(type) {
    if (this.pubkey === DEFAULT_PARTITION_KEY) return null;

    switch (type) {
      case "subscriptions":
        return `bitvid:subscriptions:v1:${this.pubkey}`;
      case "userBlocks":
        // userBlocks has multiple keys: local, seeded, removals.
        // This is the "local" persist key for blocks created on this device.
        return `bitvid:user-blocks:local:v1:${this.pubkey}`;
      case "watchHistory":
        // Watch history is monolithic in localStorage currently, handled by manager but we map it here
        // Actually watch history storage key is currently global `bitvid:watch-history:v5` and contains all actors.
        // We will need to adapt this. Ideally we persist per-profile or keep the monolithic structure but manage it here.
        // The existing watchHistory implementation loads a big blob with `actors` map.
        // To preserve backward compatibility, we might need to continue reading/writing the monolithic blob
        // but expose only the relevant actor's data in memory.
        return "bitvid:watch-history:v5";
      default:
        return null;
    }
  }

  persist(type) {
    if (this.pubkey === DEFAULT_PARTITION_KEY) return;
    if (typeof localStorage === "undefined") return;

    // Check policies
    let noteType;
    switch(type) {
      case "subscriptions": noteType = NOTE_TYPES.SUBSCRIPTION_LIST; break;
      case "userBlocks": noteType = NOTE_TYPES.USER_BLOCK_LIST; break;
      case "watchHistory": noteType = NOTE_TYPES.WATCH_HISTORY; break;
      case "hashtagPreferences": noteType = NOTE_TYPES.HASHTAG_PREFERENCES; break;
    }

    const policy = CACHE_POLICIES[noteType];
    if (policy?.storage !== STORAGE_TIERS.LOCAL_STORAGE) return;

    try {
      if (type === "subscriptions") {
        const key = this.getStorageKey("subscriptions");
        if (key) {
          const list = Array.from(this.state.subscriptions);
          localStorage.setItem(key, JSON.stringify(list));
        }
      } else if (type === "userBlocks") {
        const key = this.getStorageKey("userBlocks");
        if (key) {
          const list = Array.from(this.state.userBlocks);
          // Persist as JSON array
          localStorage.setItem(key, JSON.stringify(list));
        }
      } else if (type === "watchHistory") {
        // Watch history is special: it's a monolithic object on disk.
        // We need to read it, update OUR actor entry, and write it back.
        const key = this.getStorageKey("watchHistory");
        if (key) {
          let storage = { version: 5, actors: {} };
          try {
            const raw = localStorage.getItem(key);
            if (raw) storage = JSON.parse(raw);
          } catch (e) {
            // ignore
          }

          if (!storage.actors) storage.actors = {};

          // Update current actor
          const currentActorData = this.state.watchHistory.actors?.[this.pubkey];
          if (currentActorData) {
            storage.actors[this.pubkey] = currentActorData;
          } else {
            // If explicit null/undefined, maybe remove?
            // Usually we just overwrite.
          }

          localStorage.setItem(key, JSON.stringify(storage));
        }
      }
      // Hashtag preferences currently do not persist to localStorage in the original service,
      // they only load from relays or memory. If they did, we would handle it here.
    } catch (e) {
      devLogger.warn(`[ProfilePartition] Failed to persist ${type}:`, e);
    }
  }

  load(type) {
    if (this.pubkey === DEFAULT_PARTITION_KEY) return;
    if (typeof localStorage === "undefined") return;

    // Check policies
    let noteType;
    switch(type) {
      case "subscriptions": noteType = NOTE_TYPES.SUBSCRIPTION_LIST; break;
      case "userBlocks": noteType = NOTE_TYPES.USER_BLOCK_LIST; break;
      case "watchHistory": noteType = NOTE_TYPES.WATCH_HISTORY; break;
    }

    const policy = CACHE_POLICIES[noteType];
    if (policy?.storage !== STORAGE_TIERS.LOCAL_STORAGE) return;

    try {
      if (type === "subscriptions") {
        const key = this.getStorageKey("subscriptions");
        if (key) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              this.state.subscriptions = new Set(parsed);
            }
          }
        }
      } else if (type === "userBlocks") {
        const key = this.getStorageKey("userBlocks");
        if (key) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              this.state.userBlocks = new Set(parsed);
            }
          }
        }
      } else if (type === "watchHistory") {
        const key = this.getStorageKey("watchHistory");
        if (key) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            // We only care about our actor
            if (parsed && parsed.actors && parsed.actors[this.pubkey]) {
              if (!this.state.watchHistory.actors) this.state.watchHistory.actors = {};
              this.state.watchHistory.actors[this.pubkey] = parsed.actors[this.pubkey];
            }
          }
        }
      }
    } catch (e) {
      devLogger.warn(`[ProfilePartition] Failed to load ${type}:`, e);
    }
  }
}

class ProfileCache extends TinyEventEmitter {
  constructor() {
    super();
    this.partitions = new Map();
    this.activePubkey = DEFAULT_PARTITION_KEY;
    this.ensurePartition(DEFAULT_PARTITION_KEY);
  }

  ensurePartition(pubkey) {
    if (!pubkey) return this.partitions.get(DEFAULT_PARTITION_KEY);
    if (!this.partitions.has(pubkey)) {
      const partition = new ProfilePartition(pubkey);
      // Hydrate from storage on creation
      partition.load("subscriptions");
      partition.load("userBlocks");
      partition.load("watchHistory");
      this.partitions.set(pubkey, partition);
    }
    return this.partitions.get(pubkey);
  }

  activatePartition(pubkey) {
    const nextKey = pubkey || DEFAULT_PARTITION_KEY;
    if (this.activePubkey === nextKey) return;

    this.activePubkey = nextKey;
    this.ensurePartition(nextKey);
    this.emit("active-partition-changed", nextKey);
  }

  active() {
    return this.ensurePartition(this.activePubkey);
  }

  get(type) {
    return this.active().get(type);
  }

  set(type, value, { persist = true } = {}) {
    const partition = this.active();
    partition.set(type, value);
    if (persist) {
      partition.persist(type);
    }
    this.emit("partition-updated", { pubkey: partition.pubkey, key: type, value });
  }

  // Runtime / Signer cache access
  getSignerRuntime(signerType) {
    return this.active().getSignerRuntime(signerType);
  }

  clearSignerRuntime(pubkey, signerType) {
    const targetKey = pubkey || this.activePubkey;
    const partition = this.partitions.get(targetKey);
    if (partition) {
      partition.clearSignerRuntime(signerType);
    }
  }
}

const profileCache = new ProfileCache();
export { profileCache, ProfileCache };
