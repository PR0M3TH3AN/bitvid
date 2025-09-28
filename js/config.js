// js/config.js

export const isDevMode = true; // Set to false for production

// -----------------------------------------------------------------------------
// Admin governance (v1 local mode)
// -----------------------------------------------------------------------------

export const ADMIN_LIST_MODE = "local"; // Future: "nostr"
export const ADMIN_SUPER_NPUB =
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx";
export const ADMIN_EDITORS_NPUBS = []; // Default moderators (optional)
export const ADMIN_LIST_NAMESPACE = "bitvid:admin"; // Reserved for Nostr lists

const WHITELIST_MODE_KEY = "bitvid_admin_whitelist_mode";
const DEFAULT_WHITELIST_ENABLED = false;

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

export const ADMIN_WHITELIST_MODE_STORAGE_KEY = WHITELIST_MODE_KEY;
