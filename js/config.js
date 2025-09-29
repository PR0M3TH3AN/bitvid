// js/config.js

import {
  ADMIN_SUPER_NPUB,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
  DEFAULT_WHITELIST_MODE_ENABLED,
} from "../config/instance-config.js";

export const isDevMode = true; // Set to false for production

// -----------------------------------------------------------------------------
// Admin governance — production defaults rely on remote Nostr lists
// -----------------------------------------------------------------------------

export const ADMIN_LIST_MODE = "nostr";
export { ADMIN_SUPER_NPUB };
export const ADMIN_EDITORS_NPUBS = []; // Default moderators (optional)
export const ADMIN_LIST_NAMESPACE = "bitvid:admin"; // Reserved for Nostr lists

const WHITELIST_MODE_KEY = ADMIN_WHITELIST_MODE_STORAGE_KEY;
const DEFAULT_WHITELIST_ENABLED = DEFAULT_WHITELIST_MODE_ENABLED;

export function getWhitelistMode() {
  try {
    const raw = localStorage.getItem(WHITELIST_MODE_KEY);
    if (raw === null) {
      return DEFAULT_WHITELIST_ENABLED;
    }
    return raw === "true";
  } catch (error) {
    console.warn("Failed to read whitelist mode from storage:", error);
    return DEFAULT_WHITELIST_ENABLED;
  }
}

export function setWhitelistMode(enabled) {
  try {
    localStorage.setItem(WHITELIST_MODE_KEY, enabled ? "true" : "false");
  } catch (error) {
    console.warn("Failed to persist whitelist mode to storage:", error);
  }
}

export { ADMIN_WHITELIST_MODE_STORAGE_KEY };
