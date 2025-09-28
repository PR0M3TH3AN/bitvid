// js/accessControl.js

import { isDevMode, isWhitelistEnabled } from "./config.js";
import { initialWhitelist, initialBlacklist } from "./lists.js";

class AccessControl {
  constructor() {
    // Debug logging for initialization
    console.log("DEBUG: AccessControl constructor called");

    const { data: storedWhitelist, status: whitelistStatus } = this.loadWhitelist();
    const { data: storedBlacklist, status: blacklistStatus } = this.loadBlacklist();

    if (storedWhitelist !== null) {
      this.whitelist = new Set(storedWhitelist);
    } else {
      this.whitelist = new Set(initialWhitelist);
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
      this.blacklist = new Set(initialBlacklist.filter((x) => x)); // Filter out empty strings
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
      const stored = localStorage.getItem("bitvid_whitelist");
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
      const stored = localStorage.getItem("bitvid_blacklist");
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
      localStorage.setItem(
        "bitvid_whitelist",
        JSON.stringify([...this.whitelist])
      );
    } catch (error) {
      console.error("Error saving whitelist:", error);
    }
  }

  saveBlacklist() {
    try {
      localStorage.setItem(
        "bitvid_blacklist",
        JSON.stringify([...this.blacklist])
      );
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

  setBlacklist(entries, { persist = true } = {}) {
    if (!Array.isArray(entries)) {
      return;
    }

    const normalized = [];
    for (const value of entries) {
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed && this.isValidNpub(trimmed)) {
        normalized.push(trimmed);
      }
    }

    this.blacklist = new Set(normalized);
    if (persist) {
      this.saveBlacklist();
    }

    if (isDevMode) {
      console.log("[AccessControl] Blacklist replaced:", [...this.blacklist]);
    }
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
      if (!video || typeof video !== "object") {
        return false;
      }

      try {
        const encodeNpub = window.NostrTools?.nip19?.npubEncode;
        if (typeof encodeNpub !== "function" || typeof video.pubkey !== "string") {
          if (isDevMode) {
            console.warn(
              "[AccessControl] Unable to encode npub for video during filtering; allowing through.",
              video
            );
          }
          return true;
        }

        const npub = encodeNpub(video.pubkey);
        if (this.isBlacklisted(npub)) {
          return false;
        }
        return true;
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
}

export const accessControl = new AccessControl();
