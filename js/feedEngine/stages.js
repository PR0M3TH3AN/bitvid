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
import { isPlainObject, toSet } from "./utils.js";

const FEED_HIDE_BYPASS_NAMES = new Set(["home", "recent"]);

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
  autoplayThreshold = DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  blurThreshold = DEFAULT_BLUR_THRESHOLD,
  reportType = "nudity",
  service = null,
  getService,
  trustedMuteHideThreshold = Number.POSITIVE_INFINITY,
  trustedReportHideThreshold = Number.POSITIVE_INFINITY,
} = {}) {
  const sanitizeThreshold = (value, fallback) => {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    return fallback;
  };

  const normalizedAutoplayThreshold = Number.isFinite(autoplayThreshold)
    ? Math.max(0, Math.floor(autoplayThreshold))
    : DEFAULT_AUTOPLAY_BLOCK_THRESHOLD;
  const normalizedBlurThreshold = Number.isFinite(blurThreshold)
    ? Math.max(0, Math.floor(blurThreshold))
    : DEFAULT_BLUR_THRESHOLD;
  const normalizedMuteHideThreshold = sanitizeThreshold(
    trustedMuteHideThreshold,
    Number.POSITIVE_INFINITY,
  );
  const normalizedReportHideThreshold = sanitizeThreshold(
    trustedReportHideThreshold,
    Number.POSITIVE_INFINITY,
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
        } catch (error) {
          context?.log?.(`[${stageName}] Failed to resolve trusted mute info`, error);
          trustedMuted = false;
          trustedMuters = [];
        }
      }

      if (trustedMuted) {
        trustedMuteCount = Number.isFinite(video?.moderation?.trustedMuteCount)
          ? Math.max(0, Math.floor(video.moderation.trustedMuteCount))
          : trustedMuters.length;
        if (!trustedMuteCount) {
          trustedMuteCount = trustedMuters.length;
        }
        if (trustedMuteCount <= 0) {
          trustedMuteCount = Math.max(1, trustedMuters.length || 1);
        }
      } else {
        trustedMuteCount = 0;
        trustedMuters = [];
      }

      const blockAutoplay = trustedCount >= normalizedAutoplayThreshold;
      const blurThumbnail = trustedCount >= normalizedBlurThreshold;
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
      metadataModeration.blurThumbnail = blurThumbnail;
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

      if (!video.moderation || typeof video.moderation !== "object") {
        video.moderation = {};
      }

      video.moderation.blockAutoplay = blockAutoplay;
      video.moderation.blurThumbnail = blurThumbnail;
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
        if (adminWhitelist) {
          hideBypass = "admin-whitelist";
        } else if (viewerOverrideActive) {
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
