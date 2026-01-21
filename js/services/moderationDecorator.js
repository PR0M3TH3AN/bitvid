// js/services/moderationDecorator.js

import { getTrustedMuteHideThreshold, getTrustedSpamHideThreshold, DEFAULT_BLUR_THRESHOLD, DEFAULT_AUTOPLAY_BLOCK_THRESHOLD, DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD, DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD } from "../constants.js";
import { formatShortNpub } from "../utils/formatters.js";
import { getModerationOverride, getModerationSettings, getDefaultModerationSettings } from "../state/cache.js";
import { userLogger } from "../utils/logger.js";

/**
 * Service class that handles decorating video objects with moderation state.
 * Extracts complex logic from Application class.
 */
export class ModerationDecorator {
  constructor(services = {}) {
    this.services = {
        getProfileCacheEntry: services.getProfileCacheEntry || (() => null),
    };
    this.moderationSettings = this.normalizeModerationSettings(getModerationSettings());
  }

  deriveModerationReportType(summary) {
    if (!summary || typeof summary !== "object") {
      return "";
    }

    const types = summary.types && typeof summary.types === "object" ? summary.types : null;
    if (!types) {
      return "";
    }

    let bestType = "";
    let bestScore = -1;
    for (const [type, stats] of Object.entries(types)) {
      if (!stats || typeof stats !== "object") {
        continue;
      }
      const trusted = Number.isFinite(stats.trusted) ? Math.floor(stats.trusted) : 0;
      if (trusted > bestScore) {
        bestScore = trusted;
        bestType = typeof type === "string" ? type : bestType;
      }
    }

    return typeof bestType === "string" ? bestType.toLowerCase() : "";
  }

  deriveModerationTrustedCount(summary, reportType) {
    if (!summary || typeof summary !== "object") {
      return 0;
    }

    const normalizedType = typeof reportType === "string" ? reportType.toLowerCase() : "";
    const types = summary.types && typeof summary.types === "object" ? summary.types : {};

    if (normalizedType && types[normalizedType]) {
      const entry = types[normalizedType];
      if (entry && Number.isFinite(entry.trusted)) {
        return Math.max(0, Math.floor(entry.trusted));
      }
    }

    if (Number.isFinite(summary.totalTrusted)) {
      return Math.max(0, Math.floor(summary.totalTrusted));
    }

    for (const stats of Object.values(types)) {
      if (stats && Number.isFinite(stats.trusted)) {
        return Math.max(0, Math.floor(stats.trusted));
      }
    }

    return 0;
  }

  getReporterDisplayName(pubkey) {
    if (typeof pubkey !== "string") {
      return "";
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return "";
    }

    const cachedProfile = this.services.getProfileCacheEntry(trimmed);
    const cachedName = cachedProfile?.profile?.name;
    if (typeof cachedName === "string" && cachedName.trim()) {
      return cachedName.trim();
    }

    try {
      if (typeof window !== "undefined" && window.NostrTools?.nip19?.npubEncode) {
        const encoded = window.NostrTools.nip19.npubEncode(trimmed);
        if (encoded && typeof encoded === "string") {
          return formatShortNpub(encoded);
        }
      }
    } catch (error) {
      userLogger.warn("[Application] Failed to encode reporter npub", error);
    }

    return formatShortNpub(trimmed);
  }

  normalizeModerationSettings(settings = null) {
    const defaults = this.defaultModerationSettings || getDefaultModerationSettings();
    const sanitizeThresholdMap = (value, fallback = {}) => {
      const fallbackMap = fallback && typeof fallback === "object" ? fallback : {};
      if (!value || typeof value !== "object") {
        return { ...fallbackMap };
      }
      const sanitized = {};
      for (const [key, entry] of Object.entries(value)) {
        if (typeof key !== "string") {
          continue;
        }
        const normalizedKey = key.trim().toLowerCase();
        if (!normalizedKey) {
          continue;
        }
        const numeric = Number(entry);
        if (Number.isFinite(numeric)) {
          sanitized[normalizedKey] = Math.max(0, Math.floor(numeric));
        }
      }
      return { ...fallbackMap, ...sanitized };
    };
    const defaultBlur = Number.isFinite(defaults?.blurThreshold)
      ? Math.max(0, Math.floor(defaults.blurThreshold))
      : DEFAULT_BLUR_THRESHOLD;
    const defaultAutoplay = Number.isFinite(defaults?.autoplayBlockThreshold)
      ? Math.max(0, Math.floor(defaults.autoplayBlockThreshold))
      : DEFAULT_AUTOPLAY_BLOCK_THRESHOLD;

    const runtimeMuteSource = getTrustedMuteHideThreshold();
    const runtimeTrustedMute = Number.isFinite(runtimeMuteSource)
      ? Math.max(0, Math.floor(runtimeMuteSource))
      : DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD;
    const defaultTrustedMuteHide = Number.isFinite(
      defaults?.trustedMuteHideThreshold,
    )
      ? Math.max(0, Math.floor(defaults.trustedMuteHideThreshold))
      : runtimeTrustedMute;

    const runtimeSpamSource = getTrustedSpamHideThreshold();
    const runtimeTrustedSpam = Number.isFinite(runtimeSpamSource)
      ? Math.max(0, Math.floor(runtimeSpamSource))
      : DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD;
    const defaultTrustedSpamHide = Number.isFinite(
      defaults?.trustedSpamHideThreshold,
    )
      ? Math.max(0, Math.floor(defaults.trustedSpamHideThreshold))
      : runtimeTrustedSpam;

    const defaultTrustedMuteHideThresholds = sanitizeThresholdMap(
      defaults?.trustedMuteHideThresholds,
      {},
    );

    const blurSource = Number.isFinite(settings?.blurThreshold)
      ? Math.max(0, Math.floor(settings.blurThreshold))
      : defaultBlur;
    const autoplaySource = Number.isFinite(settings?.autoplayBlockThreshold)
      ? Math.max(0, Math.floor(settings.autoplayBlockThreshold))
      : defaultAutoplay;
    const muteHideSource = Number.isFinite(settings?.trustedMuteHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedMuteHideThreshold))
      : defaultTrustedMuteHide;
    const spamHideSource = Number.isFinite(settings?.trustedSpamHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedSpamHideThreshold))
      : defaultTrustedSpamHide;
    const muteHideThresholdsSource = sanitizeThresholdMap(
      settings?.trustedMuteHideThresholds,
      defaultTrustedMuteHideThresholds,
    );

    return {
      blurThreshold: blurSource,
      autoplayBlockThreshold: autoplaySource,
      trustedMuteHideThreshold: muteHideSource,
      trustedMuteHideThresholds: muteHideThresholdsSource,
      trustedSpamHideThreshold: spamHideSource,
    };
  }

  getActiveModerationThresholds() {
    this.moderationSettings = this.normalizeModerationSettings(this.moderationSettings);
    return { ...this.moderationSettings };
  }

  updateSettings(settings) {
     this.moderationSettings = this.normalizeModerationSettings(settings);
  }

  decorateVideo(video, feedContext = {}) {
    if (!video || typeof video !== "object") {
      return video;
    }

    const existingModeration =
      video.moderation && typeof video.moderation === "object"
        ? { ...video.moderation }
        : {};

    const summary =
      existingModeration.summary && typeof existingModeration.summary === "object"
        ? existingModeration.summary
        : null;

    const rawReportType =
      typeof existingModeration.reportType === "string" &&
      existingModeration.reportType.trim()
        ? existingModeration.reportType.trim().toLowerCase()
        : "";

    const reportType = rawReportType || this.deriveModerationReportType(summary) || "";

    const sanitizedReporters = Array.isArray(existingModeration.trustedReporters)
      ? existingModeration.trustedReporters
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const pubkey =
              typeof entry.pubkey === "string" ? entry.pubkey.trim().toLowerCase() : "";
            if (!pubkey) {
              return null;
            }
            const latest = Number.isFinite(entry.latest)
              ? Math.floor(entry.latest)
              : 0;
            return { pubkey, latest };
          })
          .filter(Boolean)
      : [];

    const reporterPubkeys = sanitizedReporters.map((entry) => entry.pubkey);

    const rawTrustedMuters = Array.isArray(existingModeration.trustedMuters)
      ? existingModeration.trustedMuters
          .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
          .filter(Boolean)
      : [];

    const trustedMuteCount = Number.isFinite(existingModeration.trustedMuteCount)
      ? Math.max(0, Math.floor(existingModeration.trustedMuteCount))
      : rawTrustedMuters.length;

    const trustedMuted = existingModeration.trustedMuted === true || trustedMuteCount > 0;

    const reporterDisplayNames = [];
    const seenNames = new Set();
    for (const reporterPubkey of reporterPubkeys) {
      const name = this.getReporterDisplayName(reporterPubkey);
      if (!name) {
        continue;
      }
      const normalizedName = name.trim();
      if (!normalizedName) {
        continue;
      }
      const key = normalizedName.toLowerCase();
      if (seenNames.has(key)) {
        continue;
      }
      seenNames.add(key);
      reporterDisplayNames.push(normalizedName);
    }

    const trustedMuterDisplayNames = [];
    if (trustedMuted) {
      const seenMuteNames = new Set();
      for (const muterPubkey of rawTrustedMuters) {
        const name = this.getReporterDisplayName(muterPubkey);
        if (!name) {
          continue;
        }
        const normalizedName = name.trim();
        if (!normalizedName) {
          continue;
        }
        const key = normalizedName.toLowerCase();
        if (seenMuteNames.has(key)) {
          continue;
        }
        seenMuteNames.add(key);
        trustedMuterDisplayNames.push(normalizedName);
      }
    }

    const trustedCount = Number.isFinite(existingModeration.trustedCount)
      ? Math.max(0, Math.floor(existingModeration.trustedCount))
      : this.deriveModerationTrustedCount(summary, reportType);

    const viewerMuted = existingModeration.viewerMuted === true;
    const existingBlockAutoplay = existingModeration.blockAutoplay === true;
    const existingBlurThumbnail = existingModeration.blurThumbnail === true;
    const existingBlurReason =
      typeof existingModeration.blurReason === "string"
        ? existingModeration.blurReason.trim()
        : "";

    const thresholds = this.getActiveModerationThresholds();
    const computedBlockAutoplayBase =
      trustedCount >= thresholds.autoplayBlockThreshold || trustedMuted;
    const computedBlockAutoplay =
      computedBlockAutoplayBase || viewerMuted || existingBlockAutoplay;

    const blurFromReports = trustedCount >= thresholds.blurThreshold;
    let computedBlurThumbnail =
      blurFromReports || trustedMuted || viewerMuted || existingBlurThumbnail;
    let computedBlurReason = "";

    if (blurFromReports) {
      computedBlurReason = "trusted-report";
    } else if (trustedMuted) {
      computedBlurReason = "trusted-mute";
    } else if (viewerMuted) {
      computedBlurReason = "viewer-mute";
    } else if (existingBlurThumbnail && existingBlurReason) {
      computedBlurReason = existingBlurReason;
    }

    const muteHideThreshold = Number.isFinite(thresholds.trustedMuteHideThreshold)
      ? Math.max(0, Math.floor(thresholds.trustedMuteHideThreshold))
      : Number.POSITIVE_INFINITY;
    const reportHideThreshold = Number.isFinite(thresholds.trustedSpamHideThreshold)
      ? Math.max(0, Math.floor(thresholds.trustedSpamHideThreshold))
      : Number.POSITIVE_INFINITY;

    const existingHideReason =
      typeof existingModeration.hideReason === "string"
        ? existingModeration.hideReason.trim() : "";
    const existingHideBypass =
      typeof existingModeration.hideBypass === "string"
        ? existingModeration.hideBypass.trim() : "";
    const existingHideCounts =
      existingModeration.hideCounts && typeof existingModeration.hideCounts === "object"
        ? existingModeration.hideCounts
        : null;

    let hideReason = "";
    let hideTriggered = false;

    if (trustedMuted && trustedMuteCount >= muteHideThreshold) {
      hideReason = "trusted-mute-hide";
      hideTriggered = true;
    } else if (trustedCount >= reportHideThreshold) {
      hideReason = "trusted-report-hide";
      hideTriggered = true;
    } else if (existingHideReason && existingHideCounts) {
      hideReason = existingHideReason;
      hideTriggered = true;
    }

    if (!computedBlurThumbnail && (viewerMuted || trustedMuted || hideTriggered)) {
      computedBlurThumbnail = true;
      if (hideTriggered) {
        computedBlurReason = hideReason || "trusted-hide";
      } else if (viewerMuted) {
        computedBlurReason = "viewer-mute";
      } else if (trustedMuted) {
        computedBlurReason = "trusted-mute";
      }
    } else if (computedBlurThumbnail) {
      if (hideTriggered) {
        computedBlurReason = hideReason || "trusted-hide";
      } else if (viewerMuted && !blurFromReports && !trustedMuted) {
        computedBlurReason = "viewer-mute";
      } else if (trustedMuted && !blurFromReports) {
        computedBlurReason = "trusted-mute";
      } else if (!computedBlurReason && blurFromReports) {
        computedBlurReason = "trusted-report";
      }
    }

    if (computedBlurThumbnail && !computedBlurReason && existingBlurReason) {
      computedBlurReason = existingBlurReason;
    }

    const hideCounts = hideTriggered
      ? {
          trustedMuteCount,
          trustedReportCount: trustedCount,
        }
      : null;

    const FEED_HIDE_BYPASS_NAMES = new Set(["home", "recent"]);
    const normalizedFeedName =
      typeof feedContext?.feedName === "string" ? feedContext.feedName.trim().toLowerCase() : "";
    const normalizedFeedVariant =
      typeof feedContext?.feedVariant === "string"
        ? feedContext.feedVariant.trim().toLowerCase()
        : "";
    const feedPolicyBypass =
      (normalizedFeedName && FEED_HIDE_BYPASS_NAMES.has(normalizedFeedName)) ||
      (normalizedFeedVariant && FEED_HIDE_BYPASS_NAMES.has(normalizedFeedVariant));

    let hideBypass = hideTriggered ? existingHideBypass : "";

    if (hideTriggered && !hideBypass && feedPolicyBypass) {
      hideBypass = "feed-policy";
    }

    const computedHidden = hideTriggered && !hideBypass;

    const overrideEntry = getModerationOverride({
      eventId: video.id,
      authorPubkey: video.pubkey || video.author?.pubkey || "",
    });
    const overrideActive = overrideEntry?.showAnyway === true;
    const overrideUpdatedAt = Number.isFinite(overrideEntry?.updatedAt)
      ? Math.floor(overrideEntry.updatedAt)
      : Date.now();

    const originalHideCounts = hideCounts
      ? {
          trustedMuteCount: Math.max(0, Math.floor(hideCounts.trustedMuteCount)),
          trustedReportCount: Math.max(0, Math.floor(hideCounts.trustedReportCount)),
        }
      : null;

    const originalState = {
      blockAutoplay: computedBlockAutoplay,
      blurThumbnail: computedBlurThumbnail,
      hidden: computedHidden,
      hideReason: hideTriggered ? hideReason : "",
      hideCounts: originalHideCounts,
      hideBypass,
      hideTriggered,
      blurReason: computedBlurThumbnail ? computedBlurReason : "",
    };

    const decoratedModeration = {
      ...existingModeration,
      reportType,
      trustedCount,
      trustedReporters: sanitizedReporters,
      reporterPubkeys,
      reporterDisplayNames,
      trustedMuted,
      trustedMuters: rawTrustedMuters,
      trustedMuteCount,
      trustedMuterDisplayNames,
      blurReason: computedBlurThumbnail ? computedBlurReason : "",
      original: {
        blockAutoplay: originalState.blockAutoplay,
        blurThumbnail: originalState.blurThumbnail,
        hidden: originalState.hidden,
        hideReason: originalState.hideReason,
        hideCounts: originalState.hideCounts,
        hideBypass: originalState.hideBypass,
        hideTriggered: originalState.hideTriggered,
        blurReason: originalState.blurReason,
      },
    };

    if (!computedBlurThumbnail && decoratedModeration.blurReason) {
      delete decoratedModeration.blurReason;
    }

    if (overrideActive) {
      decoratedModeration.blockAutoplay = false;
      decoratedModeration.blurThumbnail = false;
      decoratedModeration.hidden = false;
      if (decoratedModeration.hideReason) {
        delete decoratedModeration.hideReason;
      }
      if (decoratedModeration.hideCounts) {
        delete decoratedModeration.hideCounts;
      }
      if (decoratedModeration.hideBypass) {
        delete decoratedModeration.hideBypass;
      }
      decoratedModeration.viewerOverride = {
        showAnyway: true,
        updatedAt: overrideUpdatedAt,
      };
    } else {
      decoratedModeration.blockAutoplay = originalState.blockAutoplay;
      decoratedModeration.blurThumbnail = originalState.blurThumbnail;
      decoratedModeration.hidden = originalState.hidden;
      if (originalState.hideReason) {
        decoratedModeration.hideReason = originalState.hideReason;
      } else if (decoratedModeration.hideReason) {
        delete decoratedModeration.hideReason;
      }
      if (originalState.hideCounts) {
        decoratedModeration.hideCounts = { ...originalState.hideCounts };
      } else if (decoratedModeration.hideCounts) {
        delete decoratedModeration.hideCounts;
      }
      if (originalState.hideBypass) {
        decoratedModeration.hideBypass = originalState.hideBypass;
      } else if (decoratedModeration.hideBypass) {
        delete decoratedModeration.hideBypass;
      }
      if (decoratedModeration.viewerOverride) {
        delete decoratedModeration.viewerOverride;
      }
    }

    video.moderation = decoratedModeration;
    return video;
  }
}

export default ModerationDecorator;
