import { CACHE_POLICIES, STORAGE_TIERS } from "../nostr/cachePolicies.js";
import { NOTE_TYPES } from "../nostrEventSchemas.js";
import { userLogger } from "../utils/logger.js";
import { sanitizeProfileMediaUrl } from "../utils/profileMedia.js";

const PROFILE_CACHE_VERSION = 1;
const STORAGE_KEY_PREFIX = "bitvid:profile:";

// Maps legacy/service section names to NOTE_TYPES for policy lookup
const SECTION_TO_NOTE_TYPE = {
  "watchHistory": NOTE_TYPES.WATCH_HISTORY,
  "subscriptions": NOTE_TYPES.SUBSCRIPTION_LIST,
  "blocks": NOTE_TYPES.USER_BLOCK_LIST,
  "interests": NOTE_TYPES.HASHTAG_PREFERENCES,
  "relays": NOTE_TYPES.RELAY_LIST,
  "profile": NOTE_TYPES.PROFILE_METADATA,
};

function sanitizeProfileString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

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

  /**
   * Resolves the cache policy for a given section/noteType.
   * @param {string} section - The section identifier or noteType.
   * @returns {object|null} The policy object or null.
   */
  getPolicy(section) {
    if (!section) return null;
    // Check if section is a known alias
    const noteType = SECTION_TO_NOTE_TYPE[section] || section;
    return CACHE_POLICIES[noteType] || null;
  }

  /**
   * Resolves the canonical storage key for a section based on policy addressing.
   * @param {string} section - The section identifier or noteType.
   * @param {object} params - Parameters for key resolution { pubkey, dTag, kind }.
   * @returns {string} The canonical storage key.
   */
  resolveAddressKey(section, { pubkey, dTag } = {}) {
    const policy = this.getPolicy(section);
    const resolvedPubkey = this.normalizeHexPubkey(pubkey || this.activePubkey);

    if (!resolvedPubkey) {
      // Fallback or error? For now, we return a key with "unknown" or empty if no pubkey available
      // but typically we should have one.
      return "";
    }

    if (policy && policy.addressing === "kind:pubkey:d") {
      const resolvedDTag = dTag || policy.defaultDTag;
      const noteType = SECTION_TO_NOTE_TYPE[section] || section;

      // We can use the noteType string as part of the key if we don't have the numeric kind easily accessible
      // or we can hardcode the mapping if we really want kind numbers.
      // However, the policy key in CACHE_POLICIES is the note type string (e.g. "watchHistory").
      // To satisfy "kind:pubkey:d", we should ideally use the kind number.
      // But `CACHE_POLICIES` is keyed by string type.
      // Let's use the noteType string in the key to be unique and consistent with CACHE_POLICIES keys.
      // Format: bitvid:profile:{pubkey}:{noteType}:{dTag}:v{VERSION}

      // If dTag is missing for a replaceable list, it's an issue, but we'll use "default" or empty.
      const dSegment = resolvedDTag || "default";

      // Note: We use the noteType string (e.g. "watchHistory") instead of numeric kind
      // because we don't import the numeric mappings here directly beyond what's in schemas,
      // and noteType is unique enough.
      return `${STORAGE_KEY_PREFIX}${resolvedPubkey}:${noteType}:${dSegment}:v${PROFILE_CACHE_VERSION}`;
    } else if (policy && policy.addressing === "kind:pubkey") {
       const noteType = SECTION_TO_NOTE_TYPE[section] || section;
       return `${STORAGE_KEY_PREFIX}${resolvedPubkey}:${noteType}:v${PROFILE_CACHE_VERSION}`;
    }

    // Fallback legacy key format
    return `${STORAGE_KEY_PREFIX}${resolvedPubkey}:${section}:v${PROFILE_CACHE_VERSION}`;
  }

  getStorageKey(pubkey, section) {
    // Forward to resolveAddressKey which handles the logic,
    // but getStorageKey signature is (pubkey, section).
    // We assume default dTag if applicable.
    return this.resolveAddressKey(section, { pubkey });
  }

  getStorageTier(section) {
    const policy = this.getPolicy(section);
    if (policy) {
        return policy.storage;
    }
    // Default to LOCAL_STORAGE for unknown sections to match legacy behavior
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

  getProfile(pubkey) {
    const data = this.getProfileData(pubkey, "profile");
    return data && data.profile ? data.profile : null;
  }

  setProfile(pubkey, profile, { persist = true } = {}) {
    const normalizedPubkey = this.normalizeHexPubkey(pubkey);
    if (!normalizedPubkey || !profile) {
      return null;
    }

    const normalized = {
      name:
        sanitizeProfileString(profile.name || profile.display_name) ||
        "Unknown",
      picture:
        sanitizeProfileMediaUrl(profile.picture || profile.image) ||
        "assets/svg/default-profile.svg",
    };

    const about = sanitizeProfileString(profile.about || profile.aboutMe);
    if (about) {
      normalized.about = about;
    }

    const website = sanitizeProfileString(profile.website || profile.url);
    if (website) {
      normalized.website = website;
    }

    const banner = sanitizeProfileMediaUrl(
      profile.banner ||
        profile.header ||
        profile.background ||
        profile.cover ||
        profile.cover_image ||
        profile.coverImage
    );
    if (banner) {
      normalized.banner = banner;
    }

    const lud16 = sanitizeProfileString(profile.lud16);
    if (lud16) {
      normalized.lud16 = lud16;
    }

    const lud06 = sanitizeProfileString(profile.lud06);
    if (lud06) {
      normalized.lud06 = lud06;
    }

    const lightningCandidates = [
      sanitizeProfileString(profile.lightningAddress),
      lud16,
      lud06,
    ].filter(Boolean);
    if (lightningCandidates.length) {
      normalized.lightningAddress = lightningCandidates[0];
    }

    const entry = {
      profile: normalized,
      timestamp: Date.now(),
    };

    // We can update memory directly if it's the active pubkey or we track everyone?
    // ProfileCache logic for setProfileData updates memory cache if using setMemoryData,
    // but typically getProfileData checks persistence if memory is empty.
    // However, for profiles, we probably want persistence.
    // The instructions say: "normalizes, stores, sets timestamp and persists".

    // If persist is false, we might only update memory.
    if (persist) {
      this.setProfileData(normalizedPubkey, "profile", entry);
    } else {
      // Just memory
      this.setMemoryDataForPubkey(normalizedPubkey, "profile", entry);
    }

    return entry;
  }

  getProfileData(pubkey, section) {
    // 1. Check memory cache (runtime data)
    const memKey = `${pubkey}:${section}`;
    if (this.memoryCache.has(memKey)) {
      return this.memoryCache.get(memKey);
    }

    // 2. Load from persistence
    const storageKey = this.getStorageKey(pubkey, section);
    const tier = this.getStorageTier(section);

    if (tier === STORAGE_TIERS.LOCAL_STORAGE && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);

          // TTL Check
          const policy = this.getPolicy(section);
          if (policy && Number.isFinite(policy.ttl) && policy.ttl > 0) {
             // We check if data has savedAt or similar timestamp.
             // If parsed is an object and has savedAt
             const savedAt = parsed?.savedAt || parsed?.timestamp;
             if (Number.isFinite(savedAt)) {
                 const now = Date.now();
                 // Check if savedAt is seconds or ms. Usually ms in JS, but watchHistory might use one or other.
                 // In watchHistory.js: savedAt = Date.now(). So it's ms.
                 if (now - savedAt > policy.ttl) {
                     userLogger.info(`[ProfileCache] Expired ${section} for ${pubkey}`);
                     return null;
                 }
             }
          }

          // Populate memory cache to avoid repeat parsing
          this.memoryCache.set(memKey, parsed);
          return parsed;
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

    // Update memory cache
    const memKey = `${pubkey}:${section}`;
    this.memoryCache.set(memKey, data);

    this.emit("update", { pubkey, section, data });
    this.emit("partition-updated", { pubkey, key: section });
  }

  setMemoryDataForPubkey(pubkey, section, data) {
    const memKey = `${pubkey}:${section}`;
    this.memoryCache.set(memKey, data);
    this.emit("update", { pubkey, section, data });
  }

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
