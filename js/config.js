// js/config.js

import { userLogger } from "./utils/logger.js";
import {
  IS_DEV_MODE,
  IS_VERBOSE_DEV_MODE,
  IS_LOCKDOWN_MODE,
  ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL,
  BLOG_URL,
  COMMUNITY_URL,
  NOSTR_URL,
  GITHUB_URL,
  BETA_URL,
  DNS_URL,
  TIP_JAR_URL,
  MAX_WALLET_DEFAULT_ZAP,
  PLATFORM_FEE_PERCENT,
  PLATFORM_LUD16_OVERRIDE,
  DEFAULT_RELAY_URLS_OVERRIDE,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
  DEFAULT_WHITELIST_MODE_ENABLED,
  ALLOW_NSFW_CONTENT,
  DEFAULT_TRUST_SEED_NPUBS,
  DEFAULT_BLUR_THRESHOLD,
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LEGACY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE,
  WATCH_HISTORY_PAYLOAD_MAX_BYTES,
  WATCH_HISTORY_FETCH_EVENT_LIMIT,
  WATCH_HISTORY_CACHE_TTL_MS,
  VIEW_COUNT_DEDUPE_WINDOW_SECONDS,
  VIEW_COUNT_BACKFILL_MAX_DAYS,
  VIEW_COUNT_CACHE_TTL_MS,
  ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS,
} from "../config/instance-config.js";

export const isDevMode = Boolean(IS_DEV_MODE);
export { IS_DEV_MODE };

export const isVerboseDevMode = Boolean(IS_VERBOSE_DEV_MODE);
export { IS_VERBOSE_DEV_MODE };

export const isLockdownMode = Boolean(IS_LOCKDOWN_MODE);
export { IS_LOCKDOWN_MODE };

if (typeof window !== "undefined") {
  window.__BITVID_DEV_MODE__ = isDevMode;
  window.__BITVID_VERBOSE_DEV_MODE__ = isVerboseDevMode;
  window.__BITVID_LOCKDOWN_MODE__ = isLockdownMode;
}

// -----------------------------------------------------------------------------
// Admin governance — production defaults rely on remote Nostr lists
// -----------------------------------------------------------------------------

export const ADMIN_LIST_MODE = "nostr";
export { ADMIN_SUPER_NPUB };
export { ADMIN_DM_IMAGE_URL };
export { BITVID_WEBSITE_URL };
export { BLOG_URL };
export { COMMUNITY_URL };
export { NOSTR_URL };
export { GITHUB_URL };
export { BETA_URL };
export { DNS_URL };
export { TIP_JAR_URL };
export { MAX_WALLET_DEFAULT_ZAP };
export { PLATFORM_FEE_PERCENT };
export { PLATFORM_LUD16_OVERRIDE };
export { DEFAULT_RELAY_URLS_OVERRIDE };
export const ADMIN_EDITORS_NPUBS = []; // Default moderators (optional)
export const ADMIN_LIST_NAMESPACE = "bitvid:admin"; // Reserved for Nostr lists
export const ADMIN_COMMUNITY_BLACKLIST_SOURCES = "community:blacklist:sources";
export const ADMIN_COMMUNITY_BLACKLIST_PREFIX = "community:blacklist";
export { ALLOW_NSFW_CONTENT };
export { DEFAULT_TRUST_SEED_NPUBS };
export { DEFAULT_BLUR_THRESHOLD };
export { DEFAULT_AUTOPLAY_BLOCK_THRESHOLD };
export { DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD };
export { DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD };

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
    userLogger.warn("Failed to read whitelist mode from storage:", error);
    return DEFAULT_WHITELIST_ENABLED;
  }
}

export function setWhitelistMode(enabled) {
  try {
    localStorage.setItem(WHITELIST_MODE_KEY, enabled ? "true" : "false");
  } catch (error) {
    userLogger.warn("Failed to persist whitelist mode to storage:", error);
  }
}

export { ADMIN_WHITELIST_MODE_STORAGE_KEY };

// -----------------------------------------------------------------------------
// Watch history — roadmap defaults balance retention with relay load
// -----------------------------------------------------------------------------

export { WATCH_HISTORY_KIND };
export { WATCH_HISTORY_LEGACY_KIND };
export { WATCH_HISTORY_LIST_IDENTIFIER };
export { WATCH_HISTORY_LEGACY_LIST_IDENTIFIERS };
export { WATCH_HISTORY_MAX_ITEMS };
export { WATCH_HISTORY_BATCH_RESOLVE };
export { WATCH_HISTORY_BATCH_PAGE_SIZE };
export { WATCH_HISTORY_PAYLOAD_MAX_BYTES };
export { WATCH_HISTORY_FETCH_EVENT_LIMIT };
export { WATCH_HISTORY_CACHE_TTL_MS };
export { VIEW_COUNT_DEDUPE_WINDOW_SECONDS };
export { VIEW_COUNT_BACKFILL_MAX_DAYS };
export { VIEW_COUNT_CACHE_TTL_MS };
export { ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS };
