// js/config.js

export const isDevMode = true; // Set to false for production
export const isWhitelistEnabled = true; // Set to false to allow all non-blacklisted users

// ----- Admin Moderation Config (platform-level) -----

// Where admin lists live today vs. after migration
export const ADMIN_LIST_MODE = "local"; // "local" | "nostr"

// Who can edit the admin lists (npub strings)
export const ADMIN_EDITORS_NPUBS = [
  // "npub1....", // add yours here
];

// Optional: one org/admin "authority" key for NIP-26 delegation mode
export const ADMIN_ORG_NPUB = ""; // leave empty for union-of-admins mode

// Namespace used for NIP-51 parameterized lists (future)
export const ADMIN_LIST_NAMESPACE = "bitvid:admin";
