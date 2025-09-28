// js/accessControl.js

/**
 * AdminAccessControl (PLATFORM-LEVEL) — NOT user-level blocking.
 * - Governs creator access to publish/visibility in the official client.
 * - Persists to localStorage today, migratable to Nostr later.
 * - Keys: 'bitvid_admin_whitelist' / 'bitvid_admin_blacklist'
 *   (Reads legacy 'bitvid_whitelist' / 'bitvid_blacklist' for back-compat.)
 */

import {
  isDevMode,
  isWhitelistEnabled,
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

class AdminAccessControl {
  constructor() {
    // Debug logging for initialization
    console.log("DEBUG: AccessControl constructor called");

    const { data: storedWhitelist, status: whitelistStatus } = this.loadWhitelist();
    const { data: storedBlacklist, status: blacklistStatus } = this.loadBlacklist();

    if (storedWhitelist !== null) {
      this.whitelist = new Set(storedWhitelist);
    } else {
      this.whitelist = new Set(ADMIN_SEED_ALLOW);
      this.saveWhitelist();
      if (whitelistStatus && whitelistStatus !== "missing") {
        console.warn(
          `Whitelist storage ${whitelistStatus}. Falling back to initial whitelist.`
        );
      }
    }

    if (storedBlacklist !== null) {
      this.blacklist = new Set(storedBlacklist);
    } else {
      this.blacklist = new Set(ADMIN_SEED_DENY.filter((x) => x)); // Filter out empty strings
      this.saveBlacklist();
      if (blacklistStatus && blacklistStatus !== "missing") {
        console.warn(
          `Blacklist storage ${blacklistStatus}. Falling back to initial blacklist.`
        );
      }
    }

    // Debug the sets
    console.log("DEBUG: Whitelist after initialization:", [...this.whitelist]);
    console.log("DEBUG: Blacklist after initialization:", [...this.blacklist]);
  }

  // Rest of the class remains the same...
  loadWhitelist() {
    try {
      const stored =
        localStorage.getItem(K_ADMIN_WL) ?? localStorage.getItem(LEGACY_WL_KEY);
      if (!stored) {
        if (isDevMode) console.log("No stored whitelist found in localStorage.");
        return { data: null, status: "missing" };
      }

      const parsed = JSON.parse(stored);
      const sanitized = this.sanitizeList(parsed, "whitelist");
      return {
        data: sanitized,
        status: sanitized === null ? "invalid" : "ok",
      };
    } catch (error) {
      console.error("Error loading whitelist, using defaults:", error);
      return { data: null, status: "error" };
    }
  }

  loadBlacklist() {
    try {
      const stored =
        localStorage.getItem(K_ADMIN_BL) ?? localStorage.getItem(LEGACY_BL_KEY);
      if (!stored) {
        if (isDevMode) console.log("No stored blacklist found in localStorage.");
        return { data: null, status: "missing" };
      }

      const parsed = JSON.parse(stored);
      const sanitized = this.sanitizeList(parsed, "blacklist");
      return {
        data: sanitized,
        status: sanitized === null ? "invalid" : "ok",
      };
    } catch (error) {
      console.error("Error loading blacklist, using defaults:", error);
      return { data: null, status: "error" };
    }
  }

  sanitizeList(list, listName) {
    if (!Array.isArray(list)) {
      console.warn(
        `Stored ${listName} is not an array. Received:`,
        list
      );
      return null;
    }

    const sanitized = [];
    let invalidEntries = 0;

    list.forEach((value) => {
      if (typeof value !== "string") {
        invalidEntries += 1;
        return;
      }

      const trimmed = value.trim();
      if (trimmed) {
        sanitized.push(trimmed);
      } else {
        invalidEntries += 1;
      }
    });

    if (invalidEntries > 0) {
      console.warn(
        `Stored ${listName} contained ${invalidEntries} invalid entr${
          invalidEntries === 1 ? "y" : "ies"
        }. Sanitized list:`,
        sanitized
      );
    }

    return sanitized;
  }

  saveWhitelist() {
    try {
      localStorage.setItem(K_ADMIN_WL, JSON.stringify([...this.whitelist]));
    } catch (error) {
      console.error("Error saving whitelist:", error);
    }
  }

  saveBlacklist() {
    try {
      localStorage.setItem(K_ADMIN_BL, JSON.stringify([...this.blacklist]));
    } catch (error) {
      console.error("Error saving blacklist:", error);
    }
  }

  addToWhitelist(npub) {
    if (!this.isValidNpub(npub)) {
      throw new Error("Invalid npub format");
    }
    this.whitelist.add(npub);
    this.saveWhitelist();
    if (isDevMode) console.log(`Added ${npub} to whitelist`);
  }

  removeFromWhitelist(npub) {
    this.whitelist.delete(npub);
    this.saveWhitelist();
    if (isDevMode) console.log(`Removed ${npub} from whitelist`);
  }

  addToBlacklist(npub) {
    if (!this.isValidNpub(npub)) {
      throw new Error("Invalid npub format");
    }
    this.blacklist.add(npub);
    this.saveBlacklist();
    if (isDevMode) console.log(`Added ${npub} to blacklist`);
  }

  removeFromBlacklist(npub) {
    this.blacklist.delete(npub);
    this.saveBlacklist();
    if (isDevMode) console.log(`Removed ${npub} from blacklist`);
  }

  isWhitelisted(npub) {
    const result = this.whitelist.has(npub);
    if (isDevMode)
      console.log(
        `Checking if ${npub} is whitelisted:`,
        result,
        "Current whitelist:",
        [...this.whitelist]
      );
    return result;
  }

  isBlacklisted(npub) {
    return this.blacklist.has(npub);
  }

  canAccess(npub) {
    if (this.isBlacklisted(npub)) {
      return false;
    }
    const canAccess = !isWhitelistEnabled || this.isWhitelisted(npub);
    if (isDevMode) console.log(`Checking access for ${npub}:`, canAccess);
    return canAccess;
  }

  filterVideos(videos) {
    return videos.filter((video) => {
      try {
        const npub = window.NostrTools.nip19.npubEncode(video.pubkey);
        return !this.isBlacklisted(npub);
      } catch (error) {
        console.error("Error filtering video:", error);
        return false;
      }
    });
  }

  isValidNpub(npub) {
    try {
      return npub.startsWith("npub1") && npub.length === 63;
    } catch (error) {
      return false;
    }
  }

  getWhitelist() {
    return [...this.whitelist];
  }

  getBlacklist() {
    return [...this.blacklist];
  }

  isAdminEditor(npub) {
    return (
      Array.isArray(ADMIN_EDITORS_NPUBS) &&
      ADMIN_EDITORS_NPUBS.includes(npub)
    );
  }
}

export const adminAccessControl = new AdminAccessControl();
export { adminAccessControl as accessControl };
