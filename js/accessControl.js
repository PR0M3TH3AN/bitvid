// js/accessControl.js

import { isDevMode, isWhitelistEnabled } from "./config.js";
import { initialWhitelist, initialBlacklist } from "./lists.js";

class AccessControl {
  constructor() {
    // Debug logging for initialization
    console.log("DEBUG: AccessControl constructor called");
    console.log("DEBUG: initialWhitelist from import:", initialWhitelist);
    console.log("DEBUG: typeof initialWhitelist:", typeof initialWhitelist);
    console.log("DEBUG: initialWhitelist length:", initialWhitelist.length);

    // Initialize empty sets
    this.whitelist = new Set(initialWhitelist);
    this.blacklist = new Set(initialBlacklist.filter((x) => x)); // Filter out empty strings

    // Debug the sets
    console.log("DEBUG: Whitelist after Set creation:", [...this.whitelist]);
    console.log("DEBUG: Blacklist after Set creation:", [...this.blacklist]);

    // Save to localStorage
    this.saveWhitelist();
    this.saveBlacklist();
  }

  // Rest of the class remains the same...
  loadWhitelist() {
    try {
      const stored = localStorage.getItem("bitvid_whitelist");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error loading whitelist:", error);
      return [];
    }
  }

  loadBlacklist() {
    try {
      const stored = localStorage.getItem("bitvid_blacklist");
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error loading blacklist:", error);
      return [];
    }
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
}

export const accessControl = new AccessControl();
