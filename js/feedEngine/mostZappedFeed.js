// js/feedEngine/mostZappedFeed.js
//
// The "Most Zapped" tab (#47): the recently-added (active) source ranked by
// ZAP TOTAL (sats from kind-9735 receipts). Mirrors trendingFeed.js — lives
// outside feedCoordinator.js (size cap) and is wired in via thin delegations.
// The metric getter uses requestVideoZapTotal, which returns the cached total
// AND schedules a batched receipt fetch for unknown pointers; the Most Zapped
// view re-runs the feed on zapTotals' change signal so the order settles as
// totals stream in.

import { FEED_TYPES } from "../constants.js";
import { requestVideoZapTotal } from "../zapTotals.js";
import {
  createActiveNostrSource,
  createBlacklistFilterStage,
  createDedupeByRootStage,
  createModerationStage,
  createResolvePostedAtStage,
} from "./index.js";
import { createMostZappedSorter } from "./sorters.js";

// Resolve a video's zap total via the app's canonical pointer derivation (the
// same pointer keys the zap flow tags receipts with, so ranking and receipts
// agree).
function makeGetZapTotal(app) {
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
      const total = requestVideoZapTotal(info.pointer);
      return Number.isFinite(total) ? Number(total) : 0;
    } catch (error) {
      return 0;
    }
  };
}

export function buildMostZappedFeedRuntime(app) {
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
    getZapTotal: makeGetZapTotal(app),
  };
}

export function registerMostZappedFeed(app) {
  if (!app?.feedEngine || typeof app.feedEngine.registerFeed !== "function") {
    return null;
  }
  const existing =
    typeof app.feedEngine.getFeedDefinition === "function"
      ? app.feedEngine.getFeedDefinition(FEED_TYPES.MOST_ZAPPED)
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
    return app.feedEngine.registerFeed(FEED_TYPES.MOST_ZAPPED, {
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
      sorter: createMostZappedSorter(),
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
