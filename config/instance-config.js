// config/instance-config.js
// -----------------------------------------------------------------------------
// BitVid instance configuration
// -----------------------------------------------------------------------------
//
// This file consolidates the values that operators usually customize when they
// deploy their own BitVid instance. Update the exports below to match your
// environment, commit the changes, and redeploy. Leaving this file in the repo
// (instead of hidden in environment variables) makes it easy for future
// maintainers to understand how your instance is configured.
//
// Each setting includes guidance about how BitVid uses the value and what
// adjustments are safe. When in doubt, mirror the structure shown here so other
// contributors can follow along.

/**
 * The primary administrator for this BitVid instance.
 *
 * BitVid treats this Nostr public key (npub) as the "Super Admin". This user
 * cannot be removed from moderator lists, and only they can promote new
 * moderators or toggle whitelist-only mode. Replace the string below with the
 * npub of the account you want to act as the ultimate authority for your
 * deployment.
 */
export const ADMIN_SUPER_NPUB =
  "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx";

/**
 * Storage key used to persist whitelist-only mode in the browser.
 *
 * You usually do not need to change this, but the export lives here so that all
 * whitelist-related knobs are grouped together. If you do change the key, make
 * sure to migrate any previously stored values in localStorage.
 */
export const ADMIN_WHITELIST_MODE_STORAGE_KEY = "bitvid_admin_whitelist_mode";

/**
 * Whether whitelist-only mode should be enabled the first time an operator
 * loads the admin dashboard.
 *
 * Set this to `true` if you want BitVid to start with whitelist-only access and
 * require an explicit opt-out. Set to `false` to allow all creators by default.
 * Operators can still toggle the mode at runtime; this value only controls the
 * default state when no preference has been stored in localStorage yet.
 */
export const DEFAULT_WHITELIST_MODE_ENABLED = false;
