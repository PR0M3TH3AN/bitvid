// js/feedEngine/stages.js

import { getApplication } from "../applicationContext.js";
import { IS_DEV_MODE } from "../config.js";
import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
} from "../constants.js";
import nostrService from "../services/nostrService.js";
import moderationService from "../services/moderationService.js";
import logger from "../utils/logger.js";
import { dedupeToNewestByRoot } from "../utils/videoDeduper.js";
import { normalizeHashtag } from "../utils/hashtagNormalization.js";
import { isPlainObject, toSet } from "./utils.js";

const FEED_HIDE_BYPASS_NAMES = new Set(["home", "recent"]);

function normalizeTagSet(values) {
  const normalized = new Set();
  const source = toSet(values);

  for (const value of source) {
    const tag = normalizeHashtag(value);
    if (tag) {
      normalized.add(tag);
    }
  }

  return normalized;
}

function resolveDedupeFunction(customDedupe) {
  if (typeof customDedupe === "function") {
    return customDedupe;
  }

  const app = getApplication?.();
  if (app && typeof app.dedupeVideosByRoot === "function") {
    return (videos) => app.dedupeVideosByRoot(videos);
  }

  return (videos) => dedupeToNewestByRoot(videos);
}

export function createDedupeByRootStage({
  stageName = "dedupe-by-root",
  dedupe: customDedupe,
} = {}) {
  const dedupeFn = resolveDedupeFunction(customDedupe);

  return async function dedupeByRootStage(items = [], context = {}) {
    const videos = items.map((item) => item?.video).filter(Boolean);
    const dedupedVideos = dedupeFn(videos) || [];
    const allowedIds = new Set();

    for (const video of dedupedVideos) {
      if (video && typeof video.id === "string") {
        allowedIds.add(video.id);
      }
    }

    if (!allowedIds.size) {
      return items;
    }

    const keep = [];
    for (const item of items) {
      const video = item?.video;
      const videoId = video && typeof video.id === "string" ? video.id : "";
      if (!videoId || allowedIds.has(videoId)) {
        keep.push(item);
        continue;
      }

      const rootId =
        typeof video?.videoRootId === "string" && video.videoRootId
          ? video.videoRootId
          : videoId;

      if (typeof item?.metadata === "object" && item.metadata) {
        item.metadata.droppedByStage = stageName;
      }

      context?.addWhy?.({
        stage: stageName,
        type: "dedupe",
        reason: "older-root-version",
        videoId,
        rootId,
      });
    }

    return keep;
  };
}

function gatherTimestampFunctions({
  context,
  knownOverride,
  resolveOverride,
}) {
  const knownFns = [];
  const resolveFns = [];

  const addKnown = (fn) => {
    if (typeof fn === "function") {
      knownFns.push(fn);
    }
  };

  const addResolver = (fn) => {
    if (typeof fn === "function") {
      resolveFns.push(fn);
    }
  };

  addKnown(knownOverride);
  addResolver(resolveOverride);

  const hookCandidates = [context?.hooks, context?.runtime];
  for (const candidate of hookCandidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const timestamps = candidate.timestamps;
    if (!timestamps || typeof timestamps !== "object") {
      continue;
    }

    addKnown(timestamps.getKnownVideoPostedAt);
    addKnown(timestamps.getKnownPostedAt);
    addResolver(timestamps.resolveVideoPostedAt);
    addResolver(timestamps.getVideoPostedAt);
  }

  return { knownFns, resolveFns };
}

function applyResolvedTimestamp(video, timestamp) {
  if (!video || typeof video !== "object") {
    return false;
  }

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const normalized = Math.floor(timestamp);
  if (!Number.isFinite(normalized)) {
    return false;
  }

  if (Number.isFinite(video.rootCreatedAt)) {
    const existing = Math.floor(video.rootCreatedAt);
    if (Number.isFinite(existing) && existing <= normalized) {
      video.rootCreatedAt = existing;
      return true;
    }
  }

  video.rootCreatedAt = normalized;
  return true;
}

async function resolveTimestampWithResolvers({
  video,
  detail,
  resolvers,
  stageName,
  context,
}) {
  if (!Array.isArray(resolvers) || resolvers.length === 0) {
    return null;
  }

  for (const resolver of resolvers) {
    if (typeof resolver !== "function") {
      continue;
    }

    try {
      const value = await resolver(video, detail);
      if (Number.isFinite(value)) {
        return Math.floor(value);
      }
    } catch (error) {
      context?.log?.(`[${stageName}] resolve timestamp hook threw`, error);
    }
  }

  return null;
}

export function createResolvePostedAtStage({
  stageName = "resolve-posted-at",
  getKnownPostedAt,
  resolvePostedAt,
} = {}) {
  return async function resolvePostedAtStage(items = [], context = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      return items;
    }

    const { knownFns, resolveFns } = gatherTimestampFunctions({
      context,
      knownOverride: getKnownPostedAt,
      resolveOverride: resolvePostedAt,
    });

    if (knownFns.length === 0 && resolveFns.length === 0) {
      return items;
    }

    const tasks = [];

    for (const item of items) {
      const video = item?.video;
      if (!video || typeof video !== "object") {
        continue;
      }

      if (Number.isFinite(video.rootCreatedAt)) {
        continue;
      }

      const detail = { entry: item, context };

      let knownValue = null;
      for (const candidate of knownFns) {
        try {
          const value = candidate(video, detail);
          if (Number.isFinite(value)) {
            knownValue = Math.floor(value);
            break;
          }
        } catch (error) {
          context?.log?.(`[${stageName}] known timestamp hook threw`, error);
        }
      }

      if (knownValue !== null && Number.isFinite(knownValue)) {
        applyResolvedTimestamp(video, knownValue);
        continue;
      }

      if (!resolveFns.length) {
        continue;
      }

      tasks.push(async () => {
        const resolved = await resolveTimestampWithResolvers({
          video,
          detail,
          resolvers: resolveFns,
          stageName,
          context,
        });
        if (resolved !== null && Number.isFinite(resolved)) {
          applyResolvedTimestamp(video, resolved);
        }
      });
    }

    for (const task of tasks) {
      try {
        await task();
      } catch (error) {
        context?.log?.(`[${stageName}] resolution task failed`, error);
      }
    }

    return items;
  };
}

export function createTagPreferenceFilterStage({
  stageName = "tag-preference-filter",
  enforceInterests,
  matchInterests = true,
} = {}) {
  const shouldMatchInterests =
    typeof enforceInterests === "boolean"
      ? enforceInterests
      : matchInterests !== false;

  return async function tagPreferenceFilterStage(items = [], context = {}) {
    return filterByTagPreferences({
      items,
      context,
      stageName,
      enforceInterests: shouldMatchInterests,
    });
  };
}

export function createDisinterestFilterStage({
  stageName = "tag-disinterest-filter",
} = {}) {
  return async function disinterestFilterStage(items = [], context = {}) {
    return filterByTagPreferences({
      items,
      context,
      stageName,
      enforceInterests: false,
    });
  };
}

function collectVideoTags(video) {
  const videoTags = new Set();

  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (Array.isArray(tag) && tag[0] === "t" && typeof tag[1] === "string") {
        const normalized = normalizeHashtag(tag[1]);
        if (normalized) {
          videoTags.add(normalized);
        }
      }
    }
  }

  if (Array.isArray(video.nip71?.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      if (typeof tag === "string") {
        const normalized = normalizeHashtag(tag);
        if (normalized) {
          videoTags.add(normalized);
        }
      }
    }
  }

  return videoTags;
}

function filterByTagPreferences({
  items = [],
  context = {},
  stageName,
  enforceInterests,
}) {
  const tagPreferences = context?.runtime?.tagPreferences;
  const interests = normalizeTagSet(tagPreferences?.interests);
  const disinterests = normalizeTagSet(tagPreferences?.disinterests);
  if (!interests.size && !disinterests.size) {
    return items;
  }

  const results = [];

  for (const item of items) {
    const video = item?.video;
    if (!video || typeof video !== "object") {
      results.push(item);
      continue;
    }

    const videoTags = collectVideoTags(video);

    let disinterested = false;
    if (disinterests.size) {
      for (const tag of videoTags) {
        if (disinterests.has(tag)) {
          disinterested = true;
          break;
        }
      }
    }

    if (disinterested) {
      context?.addWhy?.({
        stage: stageName,
        type: "filter",
        reason: "disinterested-tag",
        videoId: typeof video.id === "string" ? video.id : null,
        pubkey: typeof video.pubkey === "string" ? video.pubkey : null,
      });
      continue;
    }

    let matchedInterests = [];
    if (interests.size) {
      matchedInterests = [...videoTags].filter((tag) => interests.has(tag));
      if (enforceInterests && matchedInterests.length === 0) {
        context?.addWhy?.({
          stage: stageName,
          type: "filter",
          reason: "no-interest-match",
          videoId: typeof video.id === "string" ? video.id : null,
          pubkey: typeof video.pubkey === "string" ? video.pubkey : null,
        });
        continue;
      }
    }

    if (matchedInterests.length > 0) {
      if (!isPlainObject(item.metadata)) {
        item.metadata = {};
      }
      item.metadata.matchedInterests = matchedInterests;
      context?.addWhy?.({
        stage: stageName,
        type: "filter",
        reason: "matched-interests",
        videoId: typeof video.id === "string" ? video.id : null,
        pubkey: typeof video.pubkey === "string" ? video.pubkey : null,
        tags: matchedInterests,
      });
    }

    results.push(item);
  }

  return results;
}

export function createBlacklistFilterStage({
  stageName = "blacklist-filter",
  shouldIncludeVideo,
} = {}) {
  const includeFn =
    typeof shouldIncludeVideo === "function"
      ? shouldIncludeVideo
      : (video, options) => nostrService.shouldIncludeVideo(video, options);

  return async function blacklistFilterStage(items = [], context = {}) {
    const blacklist = toSet(context?.runtime?.blacklistedEventIds);
    const isAuthorBlocked =
      typeof context?.runtime?.isAuthorBlocked === "function"
        ? context.runtime.isAuthorBlocked
        : () => false;

    const options = { blacklistedEventIds: blacklist, isAuthorBlocked };

    const results = [];

    for (const item of items) {
      const video = item?.video;
      if (!video || typeof video !== "object") {
        results.push(item);
        continue;
      }

      let include = false;
      try {
        include = includeFn(video, options) !== false;
      } catch (error) {
        context?.log?.(`[${stageName}] shouldIncludeVideo threw`, error);
        include = false;
      }

      if (!include) {
        context?.addWhy?.({
          stage: stageName,
          type: "filter",
          reason: "blacklist",
          videoId: typeof video.id === "string" ? video.id : null,
          pubkey: typeof video.pubkey === "string" ? video.pubkey : null,
        });
        continue;
      }

      results.push(item);
    }

    return results;
  };
}

function resolveSuppressionHook(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const fromHooks = context?.hooks?.watchHistory;
  if (isPlainObject(fromHooks) && typeof fromHooks.shouldSuppress === "function") {
    return fromHooks.shouldSuppress;
  }

  const runtime = context?.runtime?.watchHistory;
  if (isPlainObject(runtime) && typeof runtime.shouldSuppress === "function") {
    return runtime.shouldSuppress;
  }

  return null;
}

export function createWatchHistorySuppressionStage({
  stageName = "watch-history-suppression",
  shouldSuppress,
} = {}) {
  return async function watchHistorySuppressionStage(items = [], context = {}) {
    const hook =
      typeof shouldSuppress === "function" ? shouldSuppress : resolveSuppressionHook(context);

    if (typeof hook !== "function") {
      return items;
    }

    const results = [];

    for (const item of items) {
      let suppress = false;
      try {
        suppress = await hook(item, context);
      } catch (error) {
        context?.log?.(`[${stageName}] suppression hook threw`, error);
        suppress = false;
      }

      if (suppress) {
        const detail = {
          stage: stageName,
          type: "filter",
          reason: "watch-history",
        };
        if (item?.video && typeof item.video.id === "string") {
          detail.videoId = item.video.id;
        }
        if (item?.pointer) {
          detail.pointer = item.pointer;
        } else if (item?.metadata && item.metadata.pointerKey) {
          detail.pointerKey = item.metadata.pointerKey;
        }
        context?.addWhy?.(detail);
        continue;
      }

      results.push(item);
    }

    return results;
  };
}

export function createModerationStage({
  stageName = "moderation",
  autoplayThreshold,
  blurThreshold,
  reportType = "nudity",
  service = null,
  getService,
  trustedMuteHideThreshold,
  trustedReportHideThreshold,
} = {}) {
  const sanitizeThreshold = (value, { fallback, allowInfinity = false } = {}) => {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (allowInfinity && value === Number.POSITIVE_INFINITY) {
      return Number.POSITIVE_INFINITY;
    }
    return fallback;
  };

  const createThresholdResolver = (
    candidate,
    { runtimeKey, defaultValue, fallbackValue, allowInfinity = false },
  ) => {
    return (context) => {
      const runtimeThresholds =
        context?.runtime && typeof context.runtime === "object"
          ? context.runtime.moderationThresholds
          : null;

      const runtimeValue =
        runtimeThresholds && typeof runtimeThresholds === "object"
          ? runtimeThresholds[runtimeKey]
          : undefined;

      const runtimeValid =
        Number.isFinite(runtimeValue) ||
        (allowInfinity && runtimeValue === Number.POSITIVE_INFINITY);

      let value;

      if (typeof candidate === "function") {
        try {
          value = candidate({
            context,
            runtimeThresholds,
            runtimeValue,
            defaultValue,
          });
        } catch (error) {
          context?.log?.(
            `[${stageName}] threshold resolver threw for ${runtimeKey}`,
            error,
          );
          value = undefined;
        }
      } else if (Number.isFinite(candidate)) {
        value = candidate;
      } else if (allowInfinity && candidate === Number.POSITIVE_INFINITY) {
        value = Number.POSITIVE_INFINITY;
      }

      const hasValidValue =
        Number.isFinite(value) ||
        (allowInfinity && value === Number.POSITIVE_INFINITY);

      if (!hasValidValue) {
        if (runtimeValid) {
          value = runtimeValue;
        } else {
          value = defaultValue;
        }
      }

      return sanitizeThreshold(value, {
        fallback: fallbackValue,
        allowInfinity,
      });
    };
  };

  const resolveAutoplayThreshold = createThresholdResolver(autoplayThreshold, {
    runtimeKey: "autoplayBlockThreshold",
    defaultValue: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    fallbackValue: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  });
  const resolveBlurThreshold = createThresholdResolver(blurThreshold, {
    runtimeKey: "blurThreshold",
    defaultValue: DEFAULT_BLUR_THRESHOLD,
    fallbackValue: DEFAULT_BLUR_THRESHOLD,
  });
  const resolveMuteHideThresholdBase = createThresholdResolver(
    trustedMuteHideThreshold,
    {
      runtimeKey: "trustedMuteHideThreshold",
      defaultValue: Number.POSITIVE_INFINITY,
      fallbackValue: Number.POSITIVE_INFINITY,
      allowInfinity: true,
    },
  );
  const resolveMuteHideThreshold = (context, category) => {
    const base = resolveMuteHideThresholdBase(context);
    const normalizedCategory =
      typeof category === "string" ? category.trim().toLowerCase() : "";
    if (!normalizedCategory) {
      return base;
    }

    const runtimeThresholds =
      context?.runtime && typeof context.runtime === "object"
        ? context.runtime.moderationThresholds
        : null;

    const thresholdMap =
      runtimeThresholds && typeof runtimeThresholds === "object"
        ? runtimeThresholds.trustedMuteHideThresholds
        : null;

    if (!thresholdMap || typeof thresholdMap !== "object") {
      return base;
    }

    const override = thresholdMap[normalizedCategory];
    if (Number.isFinite(override)) {
      return Math.max(0, Math.floor(override));
    }

    return base;
  };
  const resolveReportHideThreshold = createThresholdResolver(
    trustedReportHideThreshold,
    {
      runtimeKey: "trustedSpamHideThreshold",
      defaultValue: Number.POSITIVE_INFINITY,
      fallbackValue: Number.POSITIVE_INFINITY,
      allowInfinity: true,
    },
  );
  const normalizedReportType = typeof reportType === "string" ? reportType.trim().toLowerCase() : "nudity";

  return async function moderationStage(items = [], context = {}) {
    let resolvedService = null;
    try {
      resolvedService =
        typeof getService === "function"
          ? getService({ context })
          : service || nostrService.getModerationService?.() || moderationService;
    } catch (error) {
      context?.log?.(`[${stageName}] Failed to resolve moderation service`, error);
      resolvedService = service || moderationService;
    }

    if (!resolvedService) {
      return items;
    }

    try {
      if (typeof resolvedService.refreshViewerFromClient === "function") {
        await resolvedService.refreshViewerFromClient();
      }
    } catch (error) {
      context?.log?.(`[${stageName}] Failed to refresh viewer context`, error);
    }

    const normalizedAutoplayThreshold = resolveAutoplayThreshold(context);
    const normalizedBlurThreshold = resolveBlurThreshold(context);
    const normalizedReportHideThreshold = resolveReportHideThreshold(context);

    const activeIds = new Set();
    for (const item of items) {
      const videoId = typeof item?.video?.id === "string" ? item.video.id : "";
      if (videoId) {
        activeIds.add(videoId);
      }
    }

    try {
      if (typeof resolvedService.setActiveEventIds === "function") {
        await resolvedService.setActiveEventIds(activeIds);
      }
    } catch (error) {
      context?.log?.(`[${stageName}] Failed to prime report subscriptions`, error);
    }

    const toStringSet = (input, { lowercase = false } = {}) => {
      const output = new Set();
      if (input instanceof Set) {
        for (const value of input) {
          if (typeof value !== "string") {
            continue;
          }
          const trimmed = value.trim();
          if (!trimmed) {
            continue;
          }
          output.add(lowercase ? trimmed.toLowerCase() : trimmed);
        }
        return output;
      }
      if (Array.isArray(input)) {
        for (const value of input) {
          if (typeof value !== "string") {
            continue;
          }
          const trimmed = value.trim();
          if (!trimmed) {
            continue;
          }
          output.add(lowercase ? trimmed.toLowerCase() : trimmed);
        }
      }
      return output;
    };

    let adminSnapshot = {
      whitelist: new Set(),
      whitelistHex: new Set(),
      blacklist: new Set(),
      blacklistHex: new Set(),
    };

    try {
      if (typeof resolvedService.getAdminListSnapshot === "function") {
        const snapshot = resolvedService.getAdminListSnapshot();
        if (snapshot && typeof snapshot === "object") {
          adminSnapshot = {
            whitelist: toStringSet(snapshot.whitelist),
            whitelistHex: toStringSet(snapshot.whitelistHex, { lowercase: true }),
            blacklist: toStringSet(snapshot.blacklist),
            blacklistHex: toStringSet(snapshot.blacklistHex, { lowercase: true }),
          };
        }
      }
    } catch (error) {
      context?.log?.(`[${stageName}] Failed to load admin list snapshot`, error);
    }

    const resolveAdminStatus =
      typeof resolvedService.getAccessControlStatus === "function"
        ? (identifier) => {
            try {
              return (
                resolvedService.getAccessControlStatus(identifier, adminSnapshot) || {
                  hex: "",
                  whitelisted: false,
                  blacklisted: false,
                }
              );
            } catch (error) {
              context?.log?.(`[${stageName}] getAccessControlStatus threw`, error);
              return { hex: "", whitelisted: false, blacklisted: false };
            }
          }
        : () => ({ hex: "", whitelisted: false, blacklisted: false });

    const normalizedFeedName =
      typeof context?.feedName === "string" ? context.feedName.trim().toLowerCase() : "";
    const normalizedFeedVariant =
      typeof context?.runtime?.feedVariant === "string"
        ? context.runtime.feedVariant.trim().toLowerCase()
        : "";
    const runtimeDisableHardHide = context?.runtime?.disableHardHide === true;
    const feedPolicyBypass =
      runtimeDisableHardHide ||
      (normalizedFeedName && FEED_HIDE_BYPASS_NAMES.has(normalizedFeedName)) ||
      (normalizedFeedVariant && FEED_HIDE_BYPASS_NAMES.has(normalizedFeedVariant));

    const runtimeForOverride = context?.runtime && typeof context.runtime === "object"
      ? context.runtime
      : null;

    const overrideChecker = (() => {
      if (!runtimeForOverride) {
        return () => false;
      }

      const overrideMap = runtimeForOverride.moderationOverrides;
      const overrideIds = runtimeForOverride.moderationOverrideIds;
      const hasFn =
        typeof runtimeForOverride.hasModerationOverride === "function"
          ? runtimeForOverride.hasModerationOverride.bind(runtimeForOverride)
          : null;
      const getFn =
        typeof runtimeForOverride.getModerationOverride === "function"
          ? runtimeForOverride.getModerationOverride.bind(runtimeForOverride)
          : null;

      const checkEntry = (entry) => {
        if (!entry) {
          return false;
        }
        if (entry === true) {
          return true;
        }
        if (typeof entry === "object" && entry.showAnyway === true) {
          return true;
        }
        return false;
      };

      return (videoId) => {
        if (typeof videoId !== "string") {
          return false;
        }
        const trimmed = videoId.trim();
        if (!trimmed) {
          return false;
        }
        const normalizedId = trimmed.toLowerCase();

        if (overrideMap instanceof Map) {
          const entry = overrideMap.get(normalizedId) ?? overrideMap.get(trimmed);
          if (checkEntry(entry)) {
            return true;
          }
        } else if (overrideMap && typeof overrideMap === "object") {
          const entry = overrideMap[normalizedId] ?? overrideMap[trimmed];
          if (checkEntry(entry)) {
            return true;
          }
        }

        if (overrideIds instanceof Set) {
          if (overrideIds.has(normalizedId) || overrideIds.has(trimmed)) {
            return true;
          }
        }

        if (hasFn) {
          try {
            if (hasFn(normalizedId) || (normalizedId !== trimmed && hasFn(trimmed))) {
              return true;
            }
          } catch (error) {
            context?.log?.(`[${stageName}] hasModerationOverride threw`, error);
          }
        }

        if (getFn) {
          try {
            const entry = getFn(normalizedId) ?? (normalizedId !== trimmed ? getFn(trimmed) : null);
            if (checkEntry(entry)) {
              return true;
            }
          } catch (error) {
            context?.log?.(`[${stageName}] getModerationOverride threw`, error);
          }
        }

        return false;
      };
    })();

    const results = [];

    for (const item of items) {
      if (!item || typeof item !== "object") {
        results.push(item);
        continue;
      }

      const video = item.video;
      if (!video || typeof video !== "object") {
        results.push(item);
        continue;
      }

      const videoId = typeof video.id === "string" ? video.id : "";
      const authorPubkey = typeof video.pubkey === "string" ? video.pubkey : "";

      let viewerBlocked = false;
      if (authorPubkey && typeof context?.runtime?.isAuthorBlocked === "function") {
        try {
          viewerBlocked = !!context.runtime.isAuthorBlocked(authorPubkey);
        } catch (error) {
          context?.log?.(`[${stageName}] isAuthorBlocked threw`, error);
        }
      }

      const adminStatus = resolveAdminStatus(authorPubkey);
      const authorHex =
        (adminStatus?.hex && typeof adminStatus.hex === "string"
          ? adminStatus.hex
          : authorPubkey)
          ?.trim()
          .toLowerCase() || "";

      if (viewerBlocked) {
        context?.addWhy?.({
          stage: stageName,
          type: "filter",
          reason: "viewer-block",
          videoId: videoId || null,
          pubkey: authorHex || authorPubkey || null,
        });
        continue;
      }

      if (adminStatus?.blacklisted) {
        context?.addWhy?.({
          stage: stageName,
          type: "filter",
          reason: "admin-blacklist",
          videoId: videoId || null,
          pubkey: authorHex || authorPubkey || null,
        });
        continue;
      }

      let summary = null;
      let trustedCount = 0;
      let trustedReporters = [];
      let trustedMuted = false;
      let trustedMuters = [];
      let trustedMuteCount = 0;
      let trustedMuteCountTotal = 0;
      let trustedMuteCategory = "";
      let trustedMuteCountsByCategory = null;
      let viewerMuted = false;
      if (videoId) {
        try {
          if (typeof resolvedService.getTrustedReportSummary === "function") {
            summary = resolvedService.getTrustedReportSummary(videoId);
          }
          if (typeof resolvedService.trustedReportCount === "function") {
            trustedCount = resolvedService.trustedReportCount(videoId, normalizedReportType) || 0;
          }
          if (typeof resolvedService.getTrustedReporters === "function") {
            const reporterEntries = resolvedService.getTrustedReporters(
              videoId,
              normalizedReportType
            );
            if (Array.isArray(reporterEntries) && reporterEntries.length) {
              trustedReporters = reporterEntries
                .map((entry) => {
                  if (!entry || typeof entry !== "object") {
                    return null;
                  }
                  const pubkey = typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";
                  if (!pubkey) {
                    return null;
                  }
                  const latest = Number.isFinite(entry.latest)
                    ? Math.floor(entry.latest)
                    : 0;
                  return { pubkey, latest };
                })
                .filter(Boolean);
            }
          }
        } catch (error) {
          context?.log?.(`[${stageName}] Failed to fetch moderation summary`, error);
          summary = null;
          trustedCount = 0;
          trustedReporters = [];
        }
      }

      if (authorHex) {
        try {
          if (typeof resolvedService.isAuthorMutedByTrusted === "function") {
            trustedMuted = resolvedService.isAuthorMutedByTrusted(authorHex) === true;
          }
          if (trustedMuted && typeof resolvedService.getTrustedMutersForAuthor === "function") {
            const muters = resolvedService.getTrustedMutersForAuthor(authorHex);
            if (Array.isArray(muters)) {
              const seen = new Set();
              trustedMuters = muters
                .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
                .filter((value) => {
                  if (!value || seen.has(value)) {
                    return false;
                  }
                  seen.add(value);
                  return true;
                });
            }
          }
          if (
            trustedMuted &&
            typeof resolvedService.getTrustedMuteCountsForAuthor === "function"
          ) {
            const summary = resolvedService.getTrustedMuteCountsForAuthor(authorHex);
            if (summary && typeof summary === "object") {
              trustedMuteCountTotal = Number.isFinite(summary.total)
                ? Math.max(0, Math.floor(summary.total))
                : 0;
              trustedMuteCountsByCategory =
                summary.categories && typeof summary.categories === "object"
                  ? { ...summary.categories }
                  : null;
            }
          }
          if (typeof resolvedService.isAuthorMutedByViewer === "function") {
            viewerMuted = resolvedService.isAuthorMutedByViewer(authorHex) === true;
          }
        } catch (error) {
          context?.log?.(`[${stageName}] Failed to resolve trusted/viewer mute info`, error);
          trustedMuted = false;
          trustedMuters = [];
          viewerMuted = false;
        }
      }

      if (trustedMuted) {
        trustedMuteCountTotal = Number.isFinite(video?.moderation?.trustedMuteCount)
          ? Math.max(0, Math.floor(video.moderation.trustedMuteCount))
          : trustedMuteCountTotal || trustedMuters.length;
        if (!trustedMuteCountTotal) {
          trustedMuteCountTotal = trustedMuters.length;
        }
        if (trustedMuteCountTotal <= 0) {
          trustedMuteCountTotal = Math.max(1, trustedMuters.length || 1);
        }
        trustedMuteCategory = normalizedReportType;
        if (
          trustedMuteCountsByCategory &&
          typeof trustedMuteCountsByCategory === "object"
        ) {
          const categoryCount =
            trustedMuteCategory &&
            Number.isFinite(trustedMuteCountsByCategory[trustedMuteCategory])
              ? Math.max(
                  0,
                  Math.floor(trustedMuteCountsByCategory[trustedMuteCategory]),
                )
              : null;
          if (categoryCount !== null && categoryCount !== undefined) {
            trustedMuteCount = categoryCount;
          } else if (!trustedMuteCategory) {
            let bestCategory = "";
            let bestCount = 0;
            for (const [category, count] of Object.entries(
              trustedMuteCountsByCategory,
            )) {
              if (!Number.isFinite(count)) {
                continue;
              }
              const normalizedCategory = category.trim().toLowerCase();
              const normalizedCount = Math.max(0, Math.floor(count));
              if (!normalizedCategory) {
                continue;
              }
              if (normalizedCount > bestCount) {
                bestCount = normalizedCount;
                bestCategory = normalizedCategory;
              }
            }
            if (bestCategory) {
              trustedMuteCategory = bestCategory;
              trustedMuteCount = bestCount;
            } else {
              trustedMuteCount = trustedMuteCountTotal;
            }
          } else {
            trustedMuteCount = trustedMuteCountTotal;
          }
        } else {
          trustedMuteCount = trustedMuteCountTotal;
        }
        if (trustedMuteCount <= 0) {
          trustedMuteCount = trustedMuteCountTotal || Math.max(1, trustedMuters.length || 1);
        }
      } else {
        trustedMuteCount = 0;
        trustedMuteCountTotal = 0;
        trustedMuteCategory = "";
        trustedMuters = [];
      }

      const normalizedMuteHideThreshold = resolveMuteHideThreshold(
        context,
        trustedMuteCategory,
      );

      const blockAutoplay =
        trustedCount >= normalizedAutoplayThreshold || trustedMuted || viewerMuted;
      const blurFromReports = trustedCount >= normalizedBlurThreshold;
      let blurThumbnail = blurFromReports;
      let blurReason = blurThumbnail ? "trusted-report" : "";
      const adminWhitelist = adminStatus?.whitelisted === true;
      const adminWhitelistBypass = false;

      if (!item.metadata || typeof item.metadata !== "object") {
        item.metadata = {};
      }

      const metadataModeration =
        item.metadata.moderation && typeof item.metadata.moderation === "object"
          ? { ...item.metadata.moderation }
          : {};

      metadataModeration.blockAutoplay = blockAutoplay;
      metadataModeration.summary = summary;
      metadataModeration.trustedCount = trustedCount;
      metadataModeration.reportType = normalizedReportType;
      metadataModeration.trustedReporters = Array.isArray(trustedReporters)
        ? trustedReporters.slice()
        : [];
      metadataModeration.adminWhitelist = adminWhitelist;
      metadataModeration.adminWhitelistBypass = adminWhitelistBypass;
      metadataModeration.trustedMuted = trustedMuted;
      metadataModeration.trustedMuters = trustedMuters.slice();
      metadataModeration.trustedMuteCount = trustedMuteCount;
      metadataModeration.viewerMuted = viewerMuted;

      if (!video.moderation || typeof video.moderation !== "object") {
        video.moderation = {};
      }

      video.moderation.blockAutoplay = blockAutoplay;
      video.moderation.trustedCount = trustedCount;
      video.moderation.reportType = normalizedReportType;
      video.moderation.adminWhitelist = adminWhitelist;
      video.moderation.adminWhitelistBypass = adminWhitelistBypass;
      video.moderation.trustedMuted = trustedMuted;
      if (trustedMuted) {
        video.moderation.trustedMuters = trustedMuters.slice();
        video.moderation.trustedMuteCount = trustedMuteCount;
      } else {
        if (video.moderation.trustedMuters) {
          delete video.moderation.trustedMuters;
        }
        if (video.moderation.trustedMuteCount) {
          delete video.moderation.trustedMuteCount;
        }
      }
      video.moderation.viewerMuted = viewerMuted;
      if (Array.isArray(trustedReporters) && trustedReporters.length) {
        video.moderation.trustedReporters = trustedReporters.slice();
      } else if (video.moderation.trustedReporters) {
        delete video.moderation.trustedReporters;
      }
      if (summary) {
        video.moderation.summary = summary;
      } else if (video.moderation.summary) {
        delete video.moderation.summary;
      }

      const hideCounts = {
        trustedMuteCount,
        trustedReportCount: trustedCount,
      };

      let hideReason = "";
      let hideTriggered = false;

      if (trustedMuted && trustedMuteCount >= normalizedMuteHideThreshold) {
        hideReason = "trusted-mute-hide";
        hideTriggered = true;
      } else if (trustedCount >= normalizedReportHideThreshold) {
        hideReason = "trusted-report-hide";
        hideTriggered = true;
      }

      const viewerOverrideActive = overrideChecker(videoId);

      let hideBypass = "";
      if (hideTriggered) {
        if (viewerOverrideActive) {
          hideBypass = "viewer-override";
        } else if (feedPolicyBypass) {
          hideBypass = "feed-policy";
        }
      }

      const hidden = hideTriggered && !hideBypass;

      if (hideTriggered) {
        metadataModeration.hidden = hidden;
        metadataModeration.hideReason = hideReason;
        metadataModeration.hideCounts = { ...hideCounts };
        if (hideBypass) {
          metadataModeration.hideBypass = hideBypass;
        } else if (metadataModeration.hideBypass) {
          delete metadataModeration.hideBypass;
        }
        video.moderation.hidden = hidden;
        video.moderation.hideReason = hideReason;
        video.moderation.hideCounts = { ...hideCounts };
        if (hideBypass) {
          video.moderation.hideBypass = hideBypass;
        } else if (video.moderation.hideBypass) {
          delete video.moderation.hideBypass;
        }
      } else {
        metadataModeration.hidden = false;
        if (metadataModeration.hideReason) {
          delete metadataModeration.hideReason;
        }
        if (metadataModeration.hideCounts) {
          delete metadataModeration.hideCounts;
        }
        if (metadataModeration.hideBypass) {
          delete metadataModeration.hideBypass;
        }
        video.moderation.hidden = false;
        if (video.moderation.hideReason) {
          delete video.moderation.hideReason;
        }
        if (video.moderation.hideCounts) {
          delete video.moderation.hideCounts;
        }
        if (video.moderation.hideBypass) {
          delete video.moderation.hideBypass;
        }
      }

      if (!blurThumbnail && (viewerMuted || trustedMuted || hideTriggered)) {
        blurThumbnail = true;
        if (hideTriggered) {
          blurReason = hideReason || "trusted-hide";
        } else if (viewerMuted) {
          blurReason = "viewer-mute";
        } else if (trustedMuted) {
          blurReason = "trusted-mute";
        }
      } else if (blurThumbnail) {
        if (hideTriggered) {
          blurReason = hideReason || "trusted-hide";
        } else if (viewerMuted && !blurFromReports) {
          blurReason = "viewer-mute";
        } else if (trustedMuted && !blurFromReports) {
          blurReason = "trusted-mute";
        } else if (!blurReason && blurFromReports) {
          blurReason = "trusted-report";
        }
      }

      metadataModeration.blurThumbnail = blurThumbnail;
      if (blurThumbnail) {
        metadataModeration.blurReason = blurReason;
      } else if (metadataModeration.blurReason) {
        delete metadataModeration.blurReason;
      }
      video.moderation.blurThumbnail = blurThumbnail;
      if (blurThumbnail) {
        video.moderation.blurReason = blurReason;
      } else if (video.moderation.blurReason) {
        delete video.moderation.blurReason;
      }

      item.metadata.moderation = metadataModeration;

      if (IS_DEV_MODE) {
        logger.dev.debug("[feedEngine/moderation] metadata.moderation updated", {
          stage: stageName,
          videoId: videoId || null,
          blockAutoplay,
          blurThumbnail,
          trustedCount,
          reportType: normalizedReportType,
          hidden,
          hideReason: hideTriggered ? hideReason : null,
          hideBypass: hideBypass || null,
        });
      }

      if (blockAutoplay || blurThumbnail) {
        context?.addWhy?.({
          stage: stageName,
          type: "moderation",
          reason: blurThumbnail ? "blur" : "autoplay-block",
          videoId: videoId || null,
          reportType: normalizedReportType,
          trustedCount,
        });
      }

      if (trustedMuted) {
        context?.addWhy?.({
          stage: stageName,
          type: "moderation",
          reason: "trusted-mute",
          videoId: videoId || null,
          pubkey: authorHex || authorPubkey || null,
          trustedMuteCount,
        });
      }

      if (viewerMuted) {
        context?.addWhy?.({
          stage: stageName,
          type: "moderation",
          reason: "viewer-mute",
          videoId: videoId || null,
          pubkey: authorHex || authorPubkey || null,
        });
      }

      if (hideTriggered) {
        const hideDetail = {
          stage: stageName,
          type: "moderation",
          reason: hideReason,
          videoId: videoId || null,
          trustedMuteCount,
          trustedReportCount: trustedCount,
          hidden,
        };
        if (hideBypass) {
          hideDetail.hideBypass = hideBypass;
        }
        if (adminWhitelist) {
          hideDetail.adminWhitelist = true;
        }
        if (viewerOverrideActive) {
          hideDetail.viewerOverride = true;
        }
        if (feedPolicyBypass) {
          hideDetail.feedPolicyBypass = true;
        }
        context?.addWhy?.(hideDetail);
      }

      if (hidden) {
        continue;
      }

      results.push(item);
    }

    return results;
  };
}
