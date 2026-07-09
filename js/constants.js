import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD as CONFIG_DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD as CONFIG_DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUST_SEED_NPUBS as CONFIG_DEFAULT_TRUST_SEED_NPUBS,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD as CONFIG_DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD as CONFIG_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  DEFAULT_PLAYBACK_SOURCE,
  DEFAULT_PLAYBACK_START_TIMEOUT,
  FEATURE_NIP71_INGEST as CONFIG_FEATURE_NIP71_INGEST,
  FEATURE_AUDIO_INGEST as CONFIG_FEATURE_AUDIO_INGEST,
  CARD_LIVENESS_POLICY as CONFIG_CARD_LIVENESS_POLICY,
  LIVENESS_PROBE_PREFETCH_MARGIN as CONFIG_LIVENESS_PROBE_PREFETCH_MARGIN,
  IS_DEV_MODE,
} from "./config.js";

// Time constants in milliseconds
export const ONE_SECOND_MS = 1000;
export const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
export const FIVE_MINUTES_MS = 5 * ONE_MINUTE_MS;
export const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;
export const FORTY_FIVE_MINUTES_MS = 45 * ONE_MINUTE_MS;
export const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
export const ONE_DAY_MS = 24 * ONE_HOUR_MS;

// Specific timeouts and TTLs
export const SHORT_TIMEOUT_MS = 5000;
export const STANDARD_TIMEOUT_MS = 10000;
export const MEDIUM_TIMEOUT_MS = 30000;
export const LONG_TIMEOUT_MS = 60000;

// Limits
export const MAX_BLOCKLIST_ENTRIES = 5000;

export const UI_FEEDBACK_DELAY_MS = 2000;
export const DEBOUNCE_DELAY_MS = 2000;
export const NETWORK_RETRY_DELAY_MS = 1500;

export const DEFAULT_CACHE_TTL_MS = FIVE_MINUTES_MS;
export const PROFILE_CACHE_TTL_MS = TEN_MINUTES_MS;
export const URL_HEALTH_TTL_MS = FORTY_FIVE_MINUTES_MS;
export const URL_HEALTH_RETRY_MS = FIVE_MINUTES_MS;
// Per-source playability probe budget. Kept tight so a dead host yields a fast
// verdict (and the card hides quickly) — a slow-but-valid CDN still gets a retry
// via URL_HEALTH/RETRY paths. Lowered from 8s.
export const URL_PROBE_TIMEOUT_MS = 4 * ONE_SECOND_MS;

function coerceNonNegativeInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const sanitized = Math.max(0, Math.floor(numeric));
  if (!Number.isFinite(sanitized)) {
    return fallback;
  }

  return sanitized;
}

function coerceBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (["false", "0", "off", "no"].includes(normalized)) {
      return false;
    }
    if (["true", "1", "on", "yes"].includes(normalized)) {
      return true;
    }
  }
  if (value == null) {
    return fallback;
  }
  return Boolean(value);
}

function freezeTrackers(list) {
  return Object.freeze([...list]);
}

function sanitizeTrackerList(candidate, fallbackTrackers) {
  const fallback = Array.isArray(fallbackTrackers) ? fallbackTrackers : [];
  const input = Array.isArray(candidate) ? candidate : fallback;
  const seen = new Set();
  const sanitized = [];

  for (const tracker of input) {
    if (typeof tracker !== "string") {
      continue;
    }
    const trimmed = tracker.trim();
    if (!trimmed) {
      continue;
    }
    if (!/^wss:\/\//i.test(trimmed)) {
      continue;
    }
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    sanitized.push(trimmed);
  }

  if (!sanitized.length) {
    return [...fallback];
  }

  return sanitized;
}

function sanitizeTrustSeedList(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  const seen = new Set();
  const sanitized = [];

  for (const npub of candidate) {
    if (typeof npub !== "string") {
      continue;
    }
    const trimmed = npub.trim();
    if (!trimmed) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    sanitized.push(trimmed);
  }

  return sanitized;
}

const DEFAULT_WSS_TRACKERS = Object.freeze([
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.files.fm:7073/announce",
  "wss://tracker.novage.com.ua:443/announce",
  "wss://tracker.webtorrent.dev",
]);

const SANITIZED_DEFAULT_BLUR_THRESHOLD = coerceNonNegativeInteger(
  CONFIG_DEFAULT_BLUR_THRESHOLD,
  1,
);
const SANITIZED_DEFAULT_AUTOPLAY_BLOCK_THRESHOLD = coerceNonNegativeInteger(
  CONFIG_DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  1,
);
const SANITIZED_DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD = coerceNonNegativeInteger(
  CONFIG_DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  4,
);
const SANITIZED_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD = coerceNonNegativeInteger(
  CONFIG_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  3,
);

const SANITIZED_DEFAULT_TRUST_SEED_NPUBS = Object.freeze(
  sanitizeTrustSeedList(CONFIG_DEFAULT_TRUST_SEED_NPUBS)
);

const SANITIZED_DEFAULT_PLAYBACK_START_TIMEOUT = coerceNonNegativeInteger(
  DEFAULT_PLAYBACK_START_TIMEOUT,
  3000
);

export const DEFAULT_BLUR_THRESHOLD = SANITIZED_DEFAULT_BLUR_THRESHOLD;
export const DEFAULT_AUTOPLAY_BLOCK_THRESHOLD =
  SANITIZED_DEFAULT_AUTOPLAY_BLOCK_THRESHOLD;
export const DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD =
  SANITIZED_DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD;
export const DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD =
  SANITIZED_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD;
export const DEFAULT_TRUST_SEED_NPUBS = SANITIZED_DEFAULT_TRUST_SEED_NPUBS;
export const PLAYBACK_START_TIMEOUT = SANITIZED_DEFAULT_PLAYBACK_START_TIMEOUT;

const DEFAULT_FLAGS = Object.freeze({
  URL_FIRST_ENABLED: DEFAULT_PLAYBACK_SOURCE !== "torrent", // try URL before magnet in the player
  FEATURE_WATCH_HISTORY_V2: true,
  FEATURE_PUBLISH_NIP71: false,
  // Opt-in NIP-71 *mirror* (addressable 34235/36) managed per-video from the
  // My Videos tab. Independent of FEATURE_PUBLISH_NIP71 (legacy 21/22 auto-publish).
  FEATURE_NIP71_MIRROR: true,
  // Inbound ingest of NIP-71 videos published by other Nostr apps. Sourced from
  // the admin instance config so a deployer flips it in one place.
  FEATURE_NIP71_INGEST: CONFIG_FEATURE_NIP71_INGEST !== false,
  // Audio / Music / Podcast surfaces (docs/audio-integration-plan.md, TODO #60).
  // Default OFF ("off = no trace") — only an explicit `true` in the instance
  // config lights it up.
  FEATURE_AUDIO_INGEST: CONFIG_FEATURE_AUDIO_INGEST === true,
  FEATURE_HASHTAG_PREFERENCES: false,
  FEATURE_TRUST_SEEDS: true, // Rollback: disable to drop baseline trust seeds without code changes.
  FEATURE_TRUSTED_HIDE_CONTROLS: true,
  FEATURE_IMPROVED_COMMENT_FETCHING: true, // Default true for comment persistence fixes
  FEATURE_TRENDING_FEED: true, // "Trending" tab: recently-added ranked by view count. Disable to hide the tab.
  FEATURE_MOST_ZAPPED_FEED: true, // "Most Zapped" tab: recently-added ranked by zap total. Disable to hide the tab.
  FEATURE_ZAP_TALLY: true, // bitvid-native preimage-verified zap tally (publish + count). Rollback: set false.
  FEATURE_PLAYLISTS: true, // Creator playlists (#37): channel section + playlist view + add-to-playlist (⋯ menu). Rollback: set false to hide all playlist UI.
  FEATURE_SUBMISSIONS: true, // Structured submissions (#23): admin Submissions tab + forms publish kind-30083 instead of DMs. Rollback: set false to hide the admin tab (forms still publish 30083).
  TRUSTED_MUTE_HIDE_THRESHOLD: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  TRUSTED_SPAM_HIDE_THRESHOLD: DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  WSS_TRACKERS: DEFAULT_WSS_TRACKERS,
});

const globalScope = typeof globalThis === "object" && globalThis ? globalThis : undefined;

const runtimeFlags = (() => {
  if (globalScope && typeof globalScope.__BITVID_RUNTIME_FLAGS__ === "object") {
    return globalScope.__BITVID_RUNTIME_FLAGS__;
  }
  const initial = {
    URL_FIRST_ENABLED: DEFAULT_FLAGS.URL_FIRST_ENABLED,
    FEATURE_WATCH_HISTORY_V2: DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2,
    FEATURE_PUBLISH_NIP71: DEFAULT_FLAGS.FEATURE_PUBLISH_NIP71,
    FEATURE_NIP71_MIRROR: DEFAULT_FLAGS.FEATURE_NIP71_MIRROR,
    FEATURE_NIP71_INGEST: DEFAULT_FLAGS.FEATURE_NIP71_INGEST,
    FEATURE_AUDIO_INGEST: DEFAULT_FLAGS.FEATURE_AUDIO_INGEST,
    FEATURE_HASHTAG_PREFERENCES: DEFAULT_FLAGS.FEATURE_HASHTAG_PREFERENCES,
    FEATURE_TRUST_SEEDS: DEFAULT_FLAGS.FEATURE_TRUST_SEEDS,
    FEATURE_TRUSTED_HIDE_CONTROLS: DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS,
    FEATURE_IMPROVED_COMMENT_FETCHING:
      DEFAULT_FLAGS.FEATURE_IMPROVED_COMMENT_FETCHING,
    FEATURE_TRENDING_FEED: DEFAULT_FLAGS.FEATURE_TRENDING_FEED,
    FEATURE_MOST_ZAPPED_FEED: DEFAULT_FLAGS.FEATURE_MOST_ZAPPED_FEED,
    FEATURE_ZAP_TALLY: DEFAULT_FLAGS.FEATURE_ZAP_TALLY,
    FEATURE_PLAYLISTS: DEFAULT_FLAGS.FEATURE_PLAYLISTS,
    FEATURE_SUBMISSIONS: DEFAULT_FLAGS.FEATURE_SUBMISSIONS,
    TRUSTED_MUTE_HIDE_THRESHOLD: DEFAULT_FLAGS.TRUSTED_MUTE_HIDE_THRESHOLD,
    TRUSTED_SPAM_HIDE_THRESHOLD: DEFAULT_FLAGS.TRUSTED_SPAM_HIDE_THRESHOLD,
    WSS_TRACKERS: [...DEFAULT_FLAGS.WSS_TRACKERS],
  };
  if (globalScope) {
    globalScope.__BITVID_RUNTIME_FLAGS__ = initial;
  }
  return initial;
})();

export let URL_FIRST_ENABLED = coerceBoolean(
  runtimeFlags.URL_FIRST_ENABLED,
  DEFAULT_FLAGS.URL_FIRST_ENABLED
);

export let FEATURE_WATCH_HISTORY_V2 = coerceBoolean(
  runtimeFlags.FEATURE_WATCH_HISTORY_V2,
  DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2
);

export let FEATURE_PUBLISH_NIP71 = coerceBoolean(
  runtimeFlags.FEATURE_PUBLISH_NIP71,
  DEFAULT_FLAGS.FEATURE_PUBLISH_NIP71
);

export let FEATURE_NIP71_MIRROR = coerceBoolean(
  runtimeFlags.FEATURE_NIP71_MIRROR,
  DEFAULT_FLAGS.FEATURE_NIP71_MIRROR
);

export let FEATURE_NIP71_INGEST = coerceBoolean(
  runtimeFlags.FEATURE_NIP71_INGEST,
  DEFAULT_FLAGS.FEATURE_NIP71_INGEST
);

export let FEATURE_AUDIO_INGEST = coerceBoolean(
  runtimeFlags.FEATURE_AUDIO_INGEST,
  DEFAULT_FLAGS.FEATURE_AUDIO_INGEST
);

export let FEATURE_HASHTAG_PREFERENCES = coerceBoolean(
  runtimeFlags.FEATURE_HASHTAG_PREFERENCES,
  DEFAULT_FLAGS.FEATURE_HASHTAG_PREFERENCES
);

export let FEATURE_TRENDING_FEED = coerceBoolean(
  runtimeFlags.FEATURE_TRENDING_FEED,
  DEFAULT_FLAGS.FEATURE_TRENDING_FEED
);

export let FEATURE_MOST_ZAPPED_FEED = coerceBoolean(
  runtimeFlags.FEATURE_MOST_ZAPPED_FEED,
  DEFAULT_FLAGS.FEATURE_MOST_ZAPPED_FEED
);

export let FEATURE_ZAP_TALLY = coerceBoolean(
  runtimeFlags.FEATURE_ZAP_TALLY,
  DEFAULT_FLAGS.FEATURE_ZAP_TALLY
);

export let FEATURE_PLAYLISTS = coerceBoolean(
  runtimeFlags.FEATURE_PLAYLISTS,
  DEFAULT_FLAGS.FEATURE_PLAYLISTS
);

export let FEATURE_SUBMISSIONS = coerceBoolean(
  runtimeFlags.FEATURE_SUBMISSIONS,
  DEFAULT_FLAGS.FEATURE_SUBMISSIONS
);

export let FEATURE_TRUST_SEEDS = coerceBoolean(
  runtimeFlags.FEATURE_TRUST_SEEDS,
  DEFAULT_FLAGS.FEATURE_TRUST_SEEDS
);

export let FEATURE_TRUSTED_HIDE_CONTROLS = coerceBoolean(
  runtimeFlags.FEATURE_TRUSTED_HIDE_CONTROLS,
  DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS
);

export let FEATURE_IMPROVED_COMMENT_FETCHING = coerceBoolean(
  runtimeFlags.FEATURE_IMPROVED_COMMENT_FETCHING,
  DEFAULT_FLAGS.FEATURE_IMPROVED_COMMENT_FETCHING
);

export let WSS_TRACKERS = freezeTrackers(
  sanitizeTrackerList(runtimeFlags.WSS_TRACKERS, DEFAULT_FLAGS.WSS_TRACKERS)
);

export let TRUSTED_MUTE_HIDE_THRESHOLD = coerceNonNegativeInteger(
  runtimeFlags.TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_FLAGS.TRUSTED_MUTE_HIDE_THRESHOLD
);

export let TRUSTED_SPAM_HIDE_THRESHOLD = coerceNonNegativeInteger(
  runtimeFlags.TRUSTED_SPAM_HIDE_THRESHOLD,
  DEFAULT_FLAGS.TRUSTED_SPAM_HIDE_THRESHOLD
);

Object.defineProperty(runtimeFlags, "URL_FIRST_ENABLED", {
  configurable: true,
  enumerable: true,
  get() {
    return URL_FIRST_ENABLED;
  },
  set(next) {
    URL_FIRST_ENABLED = coerceBoolean(next, DEFAULT_FLAGS.URL_FIRST_ENABLED);
  },
});

Object.defineProperty(runtimeFlags, "FEATURE_WATCH_HISTORY_V2", {
  configurable: true,
  enumerable: true,
  get() {
    return FEATURE_WATCH_HISTORY_V2;
  },
  set(next) {
    FEATURE_WATCH_HISTORY_V2 = coerceBoolean(
      next,
      DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2
    );
  },
});

Object.defineProperty(runtimeFlags, "FEATURE_PUBLISH_NIP71", {
  configurable: true,
  enumerable: true,
  get() {
    return FEATURE_PUBLISH_NIP71;
  },
  set(next) {
    FEATURE_PUBLISH_NIP71 = coerceBoolean(
      next,
      DEFAULT_FLAGS.FEATURE_PUBLISH_NIP71
    );
  },
});

Object.defineProperty(runtimeFlags, "FEATURE_HASHTAG_PREFERENCES", {
  configurable: true,
  enumerable: true,
  get() {
    return FEATURE_HASHTAG_PREFERENCES;
  },
  set(next) {
    FEATURE_HASHTAG_PREFERENCES = coerceBoolean(
      next,
      DEFAULT_FLAGS.FEATURE_HASHTAG_PREFERENCES
    );
  },
});

Object.defineProperty(runtimeFlags, "FEATURE_TRUST_SEEDS", {
  configurable: true,
  enumerable: true,
  get() {
    return FEATURE_TRUST_SEEDS;
  },
  set(next) {
    FEATURE_TRUST_SEEDS = coerceBoolean(
      next,
      DEFAULT_FLAGS.FEATURE_TRUST_SEEDS
    );
  },
});

Object.defineProperty(runtimeFlags, "FEATURE_TRUSTED_HIDE_CONTROLS", {
  configurable: true,
  enumerable: true,
  get() {
    return FEATURE_TRUSTED_HIDE_CONTROLS;
  },
  set(next) {
    FEATURE_TRUSTED_HIDE_CONTROLS = coerceBoolean(
      next,
      DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS
    );
  },
});

Object.defineProperty(runtimeFlags, "FEATURE_IMPROVED_COMMENT_FETCHING", {
  configurable: true,
  enumerable: true,
  get() {
    return FEATURE_IMPROVED_COMMENT_FETCHING;
  },
  set(next) {
    FEATURE_IMPROVED_COMMENT_FETCHING = coerceBoolean(
      next,
      DEFAULT_FLAGS.FEATURE_IMPROVED_COMMENT_FETCHING
    );
  },
});

Object.defineProperty(runtimeFlags, "WSS_TRACKERS", {
  configurable: true,
  enumerable: true,
  get() {
    return [...WSS_TRACKERS];
  },
  set(next) {
    WSS_TRACKERS = freezeTrackers(
      sanitizeTrackerList(next, DEFAULT_FLAGS.WSS_TRACKERS)
    );
  },
});

Object.defineProperty(runtimeFlags, "TRUSTED_MUTE_HIDE_THRESHOLD", {
  configurable: true,
  enumerable: true,
  get() {
    return TRUSTED_MUTE_HIDE_THRESHOLD;
  },
  set(next) {
    TRUSTED_MUTE_HIDE_THRESHOLD = coerceNonNegativeInteger(
      next,
      DEFAULT_FLAGS.TRUSTED_MUTE_HIDE_THRESHOLD
    );
  },
});

Object.defineProperty(runtimeFlags, "TRUSTED_SPAM_HIDE_THRESHOLD", {
  configurable: true,
  enumerable: true,
  get() {
    return TRUSTED_SPAM_HIDE_THRESHOLD;
  },
  set(next) {
    TRUSTED_SPAM_HIDE_THRESHOLD = coerceNonNegativeInteger(
      next,
      DEFAULT_FLAGS.TRUSTED_SPAM_HIDE_THRESHOLD
    );
  },
});

// Ensure the runtime object reflects the sanitized defaults immediately.
runtimeFlags.URL_FIRST_ENABLED = URL_FIRST_ENABLED;
runtimeFlags.FEATURE_WATCH_HISTORY_V2 = FEATURE_WATCH_HISTORY_V2;
runtimeFlags.FEATURE_PUBLISH_NIP71 = FEATURE_PUBLISH_NIP71;
runtimeFlags.FEATURE_HASHTAG_PREFERENCES = FEATURE_HASHTAG_PREFERENCES;
runtimeFlags.FEATURE_TRUST_SEEDS = FEATURE_TRUST_SEEDS;
runtimeFlags.FEATURE_TRUSTED_HIDE_CONTROLS = FEATURE_TRUSTED_HIDE_CONTROLS;
runtimeFlags.FEATURE_IMPROVED_COMMENT_FETCHING =
  FEATURE_IMPROVED_COMMENT_FETCHING;
runtimeFlags.WSS_TRACKERS = WSS_TRACKERS;
runtimeFlags.TRUSTED_MUTE_HIDE_THRESHOLD = TRUSTED_MUTE_HIDE_THRESHOLD;
runtimeFlags.TRUSTED_SPAM_HIDE_THRESHOLD = TRUSTED_SPAM_HIDE_THRESHOLD;

export function setUrlFirstEnabled(next) {
  runtimeFlags.URL_FIRST_ENABLED = next;
  return URL_FIRST_ENABLED;
}

// -----------------------------------------------------------------------------
// Card liveness visibility policy (see config/instance-config.js). Resolved on
// every read so it can be flipped live for A/B feel-testing via the console:
//   window.__BITVID_CARD_LIVENESS_POLICY__ = "hide-foreign"   // then refresh/scroll
// -----------------------------------------------------------------------------
export const CARD_LIVENESS_POLICIES = Object.freeze([
  "show-pending",
  "hide-foreign",
  "hide-all",
]);

function normalizeLivenessPolicy(value) {
  return typeof value === "string" && CARD_LIVENESS_POLICIES.includes(value)
    ? value
    : null;
}

let cardLivenessPolicy =
  normalizeLivenessPolicy(CONFIG_CARD_LIVENESS_POLICY) || "show-pending";

export function getCardLivenessPolicy() {
  const override =
    typeof globalThis !== "undefined"
      ? normalizeLivenessPolicy(globalThis.__BITVID_CARD_LIVENESS_POLICY__)
      : null;
  return override || cardLivenessPolicy;
}

export function setCardLivenessPolicy(next) {
  const normalized = normalizeLivenessPolicy(next);
  if (normalized) {
    cardLivenessPolicy = normalized;
    if (typeof globalThis !== "undefined") {
      globalThis.__BITVID_CARD_LIVENESS_POLICY__ = normalized;
    }
  }
  return cardLivenessPolicy;
}

// IntersectionObserver rootMargin for the liveness probes — lets cards just below
// the fold probe ahead of the scroll. Live-overridable for tuning.
const DEFAULT_LIVENESS_PREFETCH_MARGIN =
  typeof CONFIG_LIVENESS_PROBE_PREFETCH_MARGIN === "string" &&
  CONFIG_LIVENESS_PROBE_PREFETCH_MARGIN.trim()
    ? CONFIG_LIVENESS_PROBE_PREFETCH_MARGIN.trim()
    : "0px";

export function getLivenessProbePrefetchMargin() {
  const override =
    typeof globalThis !== "undefined"
      ? globalThis.__BITVID_LIVENESS_PREFETCH_MARGIN__
      : null;
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }
  return DEFAULT_LIVENESS_PREFETCH_MARGIN;
}

export function setWssTrackers(next) {
  runtimeFlags.WSS_TRACKERS = next;
  return WSS_TRACKERS;
}

export function setTrustSeedsEnabled(next) {
  runtimeFlags.FEATURE_TRUST_SEEDS = next;
  return FEATURE_TRUST_SEEDS;
}

export function setTrustedHideControlsEnabled(next) {
  runtimeFlags.FEATURE_TRUSTED_HIDE_CONTROLS = next;
  return FEATURE_TRUSTED_HIDE_CONTROLS;
}

export function setImprovedCommentFetchingEnabled(next) {
  runtimeFlags.FEATURE_IMPROVED_COMMENT_FETCHING = next;
  return FEATURE_IMPROVED_COMMENT_FETCHING;
}

export function setHashtagPreferencesEnabled(next) {
  runtimeFlags.FEATURE_HASHTAG_PREFERENCES = next;
  return FEATURE_HASHTAG_PREFERENCES;
}

export function resetRuntimeFlags() {
  setUrlFirstEnabled(DEFAULT_FLAGS.URL_FIRST_ENABLED);
  setWatchHistoryV2Enabled(DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2);
  setHashtagPreferencesEnabled(DEFAULT_FLAGS.FEATURE_HASHTAG_PREFERENCES);
  setTrustSeedsEnabled(DEFAULT_FLAGS.FEATURE_TRUST_SEEDS);
  setTrustedHideControlsEnabled(DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS);
  setImprovedCommentFetchingEnabled(
    DEFAULT_FLAGS.FEATURE_IMPROVED_COMMENT_FETCHING
  );
  setTrustedMuteHideThreshold(DEFAULT_FLAGS.TRUSTED_MUTE_HIDE_THRESHOLD);
  setTrustedSpamHideThreshold(DEFAULT_FLAGS.TRUSTED_SPAM_HIDE_THRESHOLD);
  setWssTrackers(DEFAULT_FLAGS.WSS_TRACKERS);
}

export const RUNTIME_FLAGS = runtimeFlags;

export function setWatchHistoryV2Enabled(next) {
  runtimeFlags.FEATURE_WATCH_HISTORY_V2 = next;
  return FEATURE_WATCH_HISTORY_V2;
}

export function setTrustedMuteHideThreshold(next) {
  runtimeFlags.TRUSTED_MUTE_HIDE_THRESHOLD = next;
  return TRUSTED_MUTE_HIDE_THRESHOLD;
}

export function setTrustedSpamHideThreshold(next) {
  runtimeFlags.TRUSTED_SPAM_HIDE_THRESHOLD = next;
  return TRUSTED_SPAM_HIDE_THRESHOLD;
}

export function getTrustedMuteHideThreshold() {
  return TRUSTED_MUTE_HIDE_THRESHOLD;
}

export function getTrustedSpamHideThreshold() {
  return TRUSTED_SPAM_HIDE_THRESHOLD;
}

export const FEED_TYPES = Object.freeze({
  RECENT: "most-recent-videos",
  FOR_YOU: "for-you",
  KIDS: "kids",
  EXPLORE: "explore",
  TRENDING: "trending",
  MOST_ZAPPED: "most-zapped",
  SUBSCRIPTIONS: "subscriptions",
  HISTORY: "history",
  CHANNEL: "channel-profile",
  DOCS: "docs",
  SEARCH: "search",
  PLAYLIST: "playlist",
});
