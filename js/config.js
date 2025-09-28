// js/config.js

export const isDevMode = true; // Set to false for production
export const isWhitelistEnabled = true; // Set to false to allow all non-blacklisted users

// ----- Admin Moderation Config (platform-level) -----

// Where admin lists live today vs. after migration
export const ADMIN_LIST_MODE = "local"; // "local" | "nostr"

// Super Admin (full control)
export const ADMIN_SUPER_NPUB =
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx";

// Optional additional admins (can edit admin lists as well)
export const ADMIN_EDITORS_NPUBS = [
  // "npub1....", // add additional moderators here
];

// Namespace used for NIP-51 parameterized lists (future)
export const ADMIN_LIST_NAMESPACE = "bitvid:admin";

// Optional: one org/admin "authority" key for NIP-26 delegation mode
export const ADMIN_ORG_NPUB = ""; // leave empty for union-of-admins mode
