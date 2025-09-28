// js/accessControl.js

/**
 * AdminAccessControl (PLATFORM-LEVEL) — NOT user-level blocking.
 * - Governs creator access to publish/visibility in the official client.
 * - Persists to localStorage today, migratable to Nostr later.
 * - Keys: 'bitvid_admin_whitelist' / 'bitvid_admin_blacklist'
 *   (Reads legacy 'bitvid_whitelist' / 'bitvid_blacklist' for back-compat.)
 */

import {
  isWhitelistEnabled,
  ADMIN_SUPER_NPUB,
  ADMIN_EDITORS_NPUBS,
} from "./config.js";
import {
  ADMIN_INITIAL_WHITELIST as ADMIN_SEED_ALLOW,
  ADMIN_INITIAL_BLACKLIST as ADMIN_SEED_DENY,
} from "./lists.js";

const K_ADMIN_WL = "bitvid_admin_whitelist";
const K_ADMIN_BL = "bitvid_admin_blacklist";
const LEGACY_WL_KEY = "bitvid_whitelist";
const LEGACY_BL_KEY = "bitvid_blacklist";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

class AdminAccessControl {
  constructor() {
    const whitelistSeed = this._loadList(
      K_ADMIN_WL,
      LEGACY_WL_KEY,
      toArray(ADMIN_SEED_ALLOW)
    );
    const blacklistSeed = this._loadList(
      K_ADMIN_BL,
      LEGACY_BL_KEY,
      toArray(ADMIN_SEED_DENY)
    );

    this.whitelist = new Set(whitelistSeed);
    this.blacklist = new Set(blacklistSeed);
  }

  _loadList(primaryKey, legacyKey, fallbackArray) {
    const fallback = this._sanitizeList(fallbackArray) ?? [];

    try {
      const stored =
        window.localStorage?.getItem(primaryKey) ??
        window.localStorage?.getItem(legacyKey);
      if (!stored) {
        return fallback;
      }

      const parsed = JSON.parse(stored);
      const sanitized = this._sanitizeList(parsed);
      return sanitized ?? fallback;
    } catch (error) {
      console.warn(
        `Failed to load admin list for ${primaryKey}, using fallback.`,
        error
      );
      return fallback;
    }
  }

  _saveList(primaryKey, set) {
    try {
      window.localStorage?.setItem(
        primaryKey,
        JSON.stringify(Array.from(set))
      );
    } catch (error) {
      console.error(`Failed to persist admin list ${primaryKey}:`, error);
    }
  }

  _sanitizeList(list) {
    if (!Array.isArray(list)) {
      return null;
    }

    const seen = new Set();
    list.forEach((candidate) => {
      const normalized = this._normalizeNpub(candidate);
      if (normalized) {
        seen.add(normalized);
      }
    });

    return Array.from(seen);
  }

  _normalizeNpub(npub) {
    if (typeof npub !== "string") {
      return "";
    }
    return npub.trim();
  }

  _matchesNpub(a, b) {
    const normalizedA = this._normalizeNpub(a);
    const normalizedB = this._normalizeNpub(b);
    return !!normalizedA && normalizedA === normalizedB;
  }

  // ----- Role helpers -----

  isSuperAdmin(npub) {
    return this._matchesNpub(npub, ADMIN_SUPER_NPUB);
  }

  isAdminEditor(npub) {
    const normalized = this._normalizeNpub(npub);
    if (!normalized) return false;

    return toArray(ADMIN_EDITORS_NPUBS).some((candidate) =>
      this._matchesNpub(candidate, normalized)
    );
  }

  canEditAdminLists(npub) {
    return this.isSuperAdmin(npub) || this.isAdminEditor(npub);
  }

  // ----- Persistence helpers -----

  saveWhitelist() {
    this._saveList(K_ADMIN_WL, this.whitelist);
  }

  saveBlacklist() {
    this._saveList(K_ADMIN_BL, this.blacklist);
  }

  // ----- Mutations -----

  addToWhitelist(npub) {
    const normalized = this._normalizeNpub(npub);
    if (!this.isValidNpub(normalized)) {
      throw new Error("Invalid npub format");
    }
    this.whitelist.add(normalized);
    this.saveWhitelist();
  }

  removeFromWhitelist(npub) {
    const normalized = this._normalizeNpub(npub);
    this.whitelist.delete(normalized);
    this.saveWhitelist();
  }

  addToBlacklist(npub) {
    const normalized = this._normalizeNpub(npub);
    if (!this.isValidNpub(normalized)) {
      throw new Error("Invalid npub format");
    }
    this.blacklist.add(normalized);
    this.saveBlacklist();
  }

  removeFromBlacklist(npub) {
    const normalized = this._normalizeNpub(npub);
    this.blacklist.delete(normalized);
    this.saveBlacklist();
  }

  // ----- Queries -----

  isWhitelisted(npub) {
    const normalized = this._normalizeNpub(npub);
    return !!normalized && this.whitelist.has(normalized);
  }

  isBlacklisted(npub) {
    const normalized = this._normalizeNpub(npub);
    return !!normalized && this.blacklist.has(normalized);
  }

  canAccess(npub) {
    if (this.isBlacklisted(npub)) {
      return false;
    }
    if (!isWhitelistEnabled) {
      return true;
    }
    return this.isWhitelisted(npub);
  }

  getWhitelist() {
    return Array.from(this.whitelist);
  }

  getBlacklist() {
    return Array.from(this.blacklist);
  }

  filterVideos(videos) {
    return videos.filter((video) => {
      try {
        const encoded = window?.NostrTools?.nip19?.npubEncode?.(video.pubkey);
        const authorNpub = encoded || video.pubkey;
        return !this.isBlacklisted(authorNpub);
      } catch (error) {
        console.error("Error filtering video:", error);
        return false;
      }
    });
  }

  isValidNpub(npub) {
    const normalized = this._normalizeNpub(npub);
    if (!normalized) return false;

    const nip19 = window?.NostrTools?.nip19;
    if (nip19 && typeof nip19.decode === "function") {
      try {
        const decoded = nip19.decode(normalized);
        return decoded?.type === "npub";
      } catch (error) {
        return false;
      }
    }

    return normalized.startsWith("npub1") && normalized.length >= 63;
  }
}

export const adminAccessControl = new AdminAccessControl();
export { adminAccessControl as accessControl };
