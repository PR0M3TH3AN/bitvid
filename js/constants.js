import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD as CONFIG_DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD as CONFIG_DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUST_SEED_NPUBS as CONFIG_DEFAULT_TRUST_SEED_NPUBS,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD as CONFIG_DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD as CONFIG_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
} from "./config.js";

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
  "wss://tracker.fastcast.nz",
  "wss://tracker.webtorrent.dev",
  "wss://tracker.sloppyta.co:443/announce",
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
  1,
);
const SANITIZED_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD = coerceNonNegativeInteger(
  CONFIG_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  3,
);

const SANITIZED_DEFAULT_TRUST_SEED_NPUBS = Object.freeze(
  sanitizeTrustSeedList(CONFIG_DEFAULT_TRUST_SEED_NPUBS)
);

export const DEFAULT_BLUR_THRESHOLD = SANITIZED_DEFAULT_BLUR_THRESHOLD;
export const DEFAULT_AUTOPLAY_BLOCK_THRESHOLD =
  SANITIZED_DEFAULT_AUTOPLAY_BLOCK_THRESHOLD;
export const DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD =
  SANITIZED_DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD;
export const DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD =
  SANITIZED_DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD;
export const DEFAULT_TRUST_SEED_NPUBS = SANITIZED_DEFAULT_TRUST_SEED_NPUBS;

const DEFAULT_FLAGS = Object.freeze({
  URL_FIRST_ENABLED: true, // try URL before magnet in the player
  ACCEPT_LEGACY_V1: true, // accept v1 magnet-only notes
  VIEW_FILTER_INCLUDE_LEGACY_VIDEO: false,
  FEATURE_WATCH_HISTORY_V2: true,
  FEATURE_PUBLISH_NIP71: false,
  FEATURE_TRUST_SEEDS: true, // Rollback: disable to drop baseline trust seeds without code changes.
  FEATURE_TRUSTED_HIDE_CONTROLS: true,
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
    ACCEPT_LEGACY_V1: DEFAULT_FLAGS.ACCEPT_LEGACY_V1,
    VIEW_FILTER_INCLUDE_LEGACY_VIDEO:
      DEFAULT_FLAGS.VIEW_FILTER_INCLUDE_LEGACY_VIDEO,
    FEATURE_WATCH_HISTORY_V2: DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2,
    FEATURE_PUBLISH_NIP71: DEFAULT_FLAGS.FEATURE_PUBLISH_NIP71,
    FEATURE_TRUST_SEEDS: DEFAULT_FLAGS.FEATURE_TRUST_SEEDS,
    FEATURE_TRUSTED_HIDE_CONTROLS: DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS,
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

export let ACCEPT_LEGACY_V1 = coerceBoolean(
  runtimeFlags.ACCEPT_LEGACY_V1,
  DEFAULT_FLAGS.ACCEPT_LEGACY_V1
);

export let VIEW_FILTER_INCLUDE_LEGACY_VIDEO = coerceBoolean(
  runtimeFlags.VIEW_FILTER_INCLUDE_LEGACY_VIDEO,
  DEFAULT_FLAGS.VIEW_FILTER_INCLUDE_LEGACY_VIDEO
);

export let FEATURE_WATCH_HISTORY_V2 = coerceBoolean(
  runtimeFlags.FEATURE_WATCH_HISTORY_V2,
  DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2
);

export let FEATURE_PUBLISH_NIP71 = coerceBoolean(
  runtimeFlags.FEATURE_PUBLISH_NIP71,
  DEFAULT_FLAGS.FEATURE_PUBLISH_NIP71
);

export let FEATURE_TRUST_SEEDS = coerceBoolean(
  runtimeFlags.FEATURE_TRUST_SEEDS,
  DEFAULT_FLAGS.FEATURE_TRUST_SEEDS
);

export let FEATURE_TRUSTED_HIDE_CONTROLS = coerceBoolean(
  runtimeFlags.FEATURE_TRUSTED_HIDE_CONTROLS,
  DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS
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

Object.defineProperty(runtimeFlags, "ACCEPT_LEGACY_V1", {
  configurable: true,
  enumerable: true,
  get() {
    return ACCEPT_LEGACY_V1;
  },
  set(next) {
    ACCEPT_LEGACY_V1 = coerceBoolean(next, DEFAULT_FLAGS.ACCEPT_LEGACY_V1);
  },
});

Object.defineProperty(runtimeFlags, "VIEW_FILTER_INCLUDE_LEGACY_VIDEO", {
  configurable: true,
  enumerable: true,
  get() {
    return VIEW_FILTER_INCLUDE_LEGACY_VIDEO;
  },
  set(next) {
    VIEW_FILTER_INCLUDE_LEGACY_VIDEO = coerceBoolean(
      next,
      DEFAULT_FLAGS.VIEW_FILTER_INCLUDE_LEGACY_VIDEO
    );
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
runtimeFlags.ACCEPT_LEGACY_V1 = ACCEPT_LEGACY_V1;
runtimeFlags.VIEW_FILTER_INCLUDE_LEGACY_VIDEO = VIEW_FILTER_INCLUDE_LEGACY_VIDEO;
runtimeFlags.FEATURE_WATCH_HISTORY_V2 = FEATURE_WATCH_HISTORY_V2;
runtimeFlags.FEATURE_PUBLISH_NIP71 = FEATURE_PUBLISH_NIP71;
runtimeFlags.FEATURE_TRUST_SEEDS = FEATURE_TRUST_SEEDS;
runtimeFlags.FEATURE_TRUSTED_HIDE_CONTROLS = FEATURE_TRUSTED_HIDE_CONTROLS;
runtimeFlags.WSS_TRACKERS = WSS_TRACKERS;
runtimeFlags.TRUSTED_MUTE_HIDE_THRESHOLD = TRUSTED_MUTE_HIDE_THRESHOLD;
runtimeFlags.TRUSTED_SPAM_HIDE_THRESHOLD = TRUSTED_SPAM_HIDE_THRESHOLD;

export function setUrlFirstEnabled(next) {
  runtimeFlags.URL_FIRST_ENABLED = next;
  return URL_FIRST_ENABLED;
}

export function setAcceptLegacyV1(next) {
  runtimeFlags.ACCEPT_LEGACY_V1 = next;
  return ACCEPT_LEGACY_V1;
}

export function setViewFilterIncludeLegacyVideo(next) {
  runtimeFlags.VIEW_FILTER_INCLUDE_LEGACY_VIDEO = next;
  return VIEW_FILTER_INCLUDE_LEGACY_VIDEO;
}

export function getWatchHistoryV2Enabled() {
  return FEATURE_WATCH_HISTORY_V2 === true;
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

export function resetRuntimeFlags() {
  setUrlFirstEnabled(DEFAULT_FLAGS.URL_FIRST_ENABLED);
  setAcceptLegacyV1(DEFAULT_FLAGS.ACCEPT_LEGACY_V1);
  setViewFilterIncludeLegacyVideo(
    DEFAULT_FLAGS.VIEW_FILTER_INCLUDE_LEGACY_VIDEO
  );
  setWatchHistoryV2Enabled(DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2);
  setTrustSeedsEnabled(DEFAULT_FLAGS.FEATURE_TRUST_SEEDS);
  setTrustedHideControlsEnabled(DEFAULT_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS);
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

