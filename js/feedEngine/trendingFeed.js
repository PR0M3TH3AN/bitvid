// js/feedEngine/trendingFeed.js
//
// The "Trending" tab: the recently-added (active) source ranked by VIEW COUNT.
// Lives outside feedCoordinator.js (which is at its size cap) and is wired in via
// thin delegations. The sorter ranks by the shared viewCounter cache; the
// Trending view re-runs the feed on viewCounter's debounced change signal so the
// order settles into true trending as counts stream in.

import { FEED_TYPES } from "../constants.js";
import { getVideoViewCountSnapshot } from "../viewCounter.js";
import {
  createActiveNostrSource,
  createBlacklistFilterStage,
  createDedupeByRootStage,
  createModerationStage,
  createResolvePostedAtStage,
} from "./index.js";
import { createTrendingSorter } from "./sorters.js";

// Resolve a video's deduped view total from the shared viewCounter cache using
// the app's canonical pointer derivation (the same key the grid cards subscribe
// with, so Trending and the per-card count agree).
function makeGetViewCount(app) {
  return (video) => {
    if (!video || typeof video !== "object") {
      return 0;
    }
    try {
      const info =
        typeof app.deriveVideoPointerInfo === "function"
          ? app.deriveVideoPointerInfo(video)
          : null;
      if (!info?.pointer) {
        return 0;
      }
      const total = getVideoViewCountSnapshot(info.pointer);
      return Number.isFinite(total) ? Number(total) : 0;
    } catch (error) {
      return 0;
    }
  };
}

export function buildTrendingFeedRuntime(app) {
  const blacklist =
    app.blacklistedEventIds instanceof Set
      ? new Set(app.blacklistedEventIds)
      : new Set();
  const moderationThresholds =
    typeof app.getActiveModerationThresholds === "function"
      ? app.getActiveModerationThresholds()
      : null;
  return {
    blacklistedEventIds: blacklist,
    isAuthorBlocked: (pubkey) => app.isAuthorBlocked(pubkey),
    moderationThresholds: moderationThresholds
      ? { ...moderationThresholds }
      : undefined,
    getViewCount: makeGetViewCount(app),
  };
}

export function registerTrendingFeed(app) {
  if (!app?.feedEngine || typeof app.feedEngine.registerFeed !== "function") {
    return null;
  }
  const existing =
    typeof app.feedEngine.getFeedDefinition === "function"
      ? app.feedEngine.getFeedDefinition(FEED_TYPES.TRENDING)
      : null;
  if (existing) {
    return existing;
  }

  const resolveThreshold = (key) => ({ runtimeValue, defaultValue }) => {
    if (
      Number.isFinite(runtimeValue) ||
      runtimeValue === Number.POSITIVE_INFINITY
    ) {
      return runtimeValue;
    }
    if (typeof app.getActiveModerationThresholds === "function") {
      const active = app.getActiveModerationThresholds();
      const candidate =
        active && typeof active === "object" ? active[key] : undefined;
      if (Number.isFinite(candidate) || candidate === Number.POSITIVE_INFINITY) {
        return candidate;
      }
    }
    return defaultValue;
  };

  try {
    return app.feedEngine.registerFeed(FEED_TYPES.TRENDING, {
      source: createActiveNostrSource({ service: app.nostrService }),
      stages: [
        createBlacklistFilterStage({
          shouldIncludeVideo: (video, options) =>
            app.nostrService.shouldIncludeVideo(video, options),
        }),
        createDedupeByRootStage({
          dedupe: (videos) => app.dedupeVideosByRoot(videos),
        }),
        createModerationStage({
          getService: () => app.nostrService.getModerationService(),
          autoplayThreshold: resolveThreshold("autoplayBlockThreshold"),
          blurThreshold: resolveThreshold("blurThreshold"),
          trustedMuteHideThreshold: resolveThreshold("trustedMuteHideThreshold"),
          trustedReportHideThreshold: resolveThreshold("trustedSpamHideThreshold"),
        }),
        createResolvePostedAtStage(),
      ],
      sorter: createTrendingSorter(),
      hooks: {
        timestamps: {
          getKnownVideoPostedAt: (video) => app.getKnownVideoPostedAt(video),
          resolveVideoPostedAt: (video) => app.resolveVideoPostedAt(video),
        },
      },
    });
  } catch (error) {
    return null;
  }
}
