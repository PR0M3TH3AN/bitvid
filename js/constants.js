export const DEFAULT_TRUST_SEED_NPUBS = Object.freeze([
  // Rollout: trust seeds count as F1 contacts. Rollback: flip FEATURE_TRUST_SEEDS to false.
  "npub1424242424242424242424242424242424242424242424242424qamrcaj",
  "npub1hwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwamhwasxw04hu",
]);

const DEFAULT_FLAGS = Object.freeze({
  URL_FIRST_ENABLED: true, // try URL before magnet in the player
  ACCEPT_LEGACY_V1: true, // accept v1 magnet-only notes
  VIEW_FILTER_INCLUDE_LEGACY_VIDEO: false,
  FEATURE_WATCH_HISTORY_V2: true,
  FEATURE_PUBLISH_NIP71: false,
  FEATURE_TRUST_SEEDS: true, // Rollback: disable to drop baseline trust seeds without code changes.
  WSS_TRACKERS: Object.freeze([
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.fastcast.nz",
    "wss://tracker.webtorrent.dev",
    "wss://tracker.sloppyta.co:443/announce",
  ]),
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
    WSS_TRACKERS: [...DEFAULT_FLAGS.WSS_TRACKERS],
  };
  if (globalScope) {
    globalScope.__BITVID_RUNTIME_FLAGS__ = initial;
  }
  return initial;
})();

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

function sanitizeTrackerList(candidate) {
  const input = Array.isArray(candidate) ? candidate : DEFAULT_FLAGS.WSS_TRACKERS;
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
    return [...DEFAULT_FLAGS.WSS_TRACKERS];
  }

  return sanitized;
}

function freezeTrackers(list) {
  return Object.freeze([...list]);
}

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

export let WSS_TRACKERS = freezeTrackers(
  sanitizeTrackerList(runtimeFlags.WSS_TRACKERS)
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

Object.defineProperty(runtimeFlags, "WSS_TRACKERS", {
  configurable: true,
  enumerable: true,
  get() {
    return [...WSS_TRACKERS];
  },
  set(next) {
    WSS_TRACKERS = freezeTrackers(sanitizeTrackerList(next));
  },
});

// Ensure the runtime object reflects the sanitized defaults immediately.
runtimeFlags.URL_FIRST_ENABLED = URL_FIRST_ENABLED;
runtimeFlags.ACCEPT_LEGACY_V1 = ACCEPT_LEGACY_V1;
runtimeFlags.VIEW_FILTER_INCLUDE_LEGACY_VIDEO = VIEW_FILTER_INCLUDE_LEGACY_VIDEO;
runtimeFlags.FEATURE_WATCH_HISTORY_V2 = FEATURE_WATCH_HISTORY_V2;
runtimeFlags.FEATURE_PUBLISH_NIP71 = FEATURE_PUBLISH_NIP71;
runtimeFlags.FEATURE_TRUST_SEEDS = FEATURE_TRUST_SEEDS;
runtimeFlags.WSS_TRACKERS = WSS_TRACKERS;

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

export function resetRuntimeFlags() {
  setUrlFirstEnabled(DEFAULT_FLAGS.URL_FIRST_ENABLED);
  setAcceptLegacyV1(DEFAULT_FLAGS.ACCEPT_LEGACY_V1);
  setViewFilterIncludeLegacyVideo(
    DEFAULT_FLAGS.VIEW_FILTER_INCLUDE_LEGACY_VIDEO
  );
  setWatchHistoryV2Enabled(DEFAULT_FLAGS.FEATURE_WATCH_HISTORY_V2);
  setTrustSeedsEnabled(DEFAULT_FLAGS.FEATURE_TRUST_SEEDS);
  setWssTrackers(DEFAULT_FLAGS.WSS_TRACKERS);
}

export const RUNTIME_FLAGS = runtimeFlags;

export function setWatchHistoryV2Enabled(next) {
  runtimeFlags.FEATURE_WATCH_HISTORY_V2 = next;
  return FEATURE_WATCH_HISTORY_V2;
}

