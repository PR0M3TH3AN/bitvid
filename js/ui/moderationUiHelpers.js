export function normalizeVideoModerationContext(moderationInput) {
  const moderation =
    moderationInput && typeof moderationInput === "object"
      ? moderationInput
      : null;

  const summary =
    moderation?.summary && typeof moderation.summary === "object"
      ? moderation.summary
      : null;

  let reportType = "";
  if (typeof moderation?.reportType === "string" && moderation.reportType.trim()) {
    reportType = moderation.reportType.trim().toLowerCase();
  }

  if (!reportType && summary && summary.types && typeof summary.types === "object") {
    for (const [type, stats] of Object.entries(summary.types)) {
      if (stats && Number.isFinite(stats.trusted) && Math.floor(stats.trusted) > 0) {
        reportType = String(type).toLowerCase();
        break;
      }
    }
  }

  let trustedCount = Number.isFinite(moderation?.trustedCount)
    ? Math.max(0, Math.floor(moderation.trustedCount))
    : 0;

  if (!trustedCount && summary && summary.types && typeof summary.types === "object") {
    for (const stats of Object.values(summary.types)) {
      if (stats && Number.isFinite(stats.trusted)) {
        trustedCount = Math.max(trustedCount, Math.floor(stats.trusted));
      }
    }
  }

  const reporterDisplayNames = Array.isArray(moderation?.reporterDisplayNames)
    ? moderation.reporterDisplayNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    : [];

  const trustedMuted = moderation?.trustedMuted === true;
  let trustedMuteCount = Number.isFinite(moderation?.trustedMuteCount)
    ? Math.max(0, Math.floor(moderation.trustedMuteCount))
    : 0;

  if (!trustedMuteCount && Array.isArray(moderation?.trustedMuters)) {
    const muters = moderation.trustedMuters
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    trustedMuteCount = muters.length;
  }

  const trustedMuteDisplayNames = Array.isArray(moderation?.trustedMuterDisplayNames)
    ? moderation.trustedMuterDisplayNames
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean)
    : [];

  const original =
    moderation?.original && typeof moderation.original === "object"
      ? moderation.original
      : {};

  const activeHidden = moderation?.hidden === true;
  const originalHidden = original.hidden === true;
  const hideReasonActive =
    typeof moderation?.hideReason === "string" ? moderation.hideReason.trim() : "";
  const hideBypassActive =
    typeof moderation?.hideBypass === "string" ? moderation.hideBypass.trim() : "";
  const originalHideReason =
    typeof original.hideReason === "string" ? original.hideReason.trim() : "";
  const originalHideBypass =
    typeof original.hideBypass === "string" ? original.hideBypass.trim() : "";
  const originalHideTriggered = original.hideTriggered === true;

  const normalizeHideCounts = (input) => {
    if (!input || typeof input !== "object") {
      return null;
    }
    const normalized = {};
    let hasValue = false;
    if (Number.isFinite(input.trustedMuteCount)) {
      normalized.trustedMuteCount = Math.max(0, Math.floor(input.trustedMuteCount));
      hasValue = true;
    }
    if (Number.isFinite(input.trustedReportCount)) {
      normalized.trustedReportCount = Math.max(0, Math.floor(input.trustedReportCount));
      hasValue = true;
    }
    return hasValue ? normalized : null;
  };

  const baseHideCounts = {
    trustedMuteCount,
    trustedReportCount: trustedCount,
  };

  const activeHideCounts =
    normalizeHideCounts(moderation?.hideCounts) ||
    (activeHidden || hideReasonActive ? { ...baseHideCounts } : null);
  const originalHideCounts =
    normalizeHideCounts(original?.hideCounts) ||
    (originalHideTriggered ? { ...baseHideCounts } : null);

  const effectiveHideReason = hideReasonActive || originalHideReason;
  const effectiveHideCounts = activeHideCounts || originalHideCounts;

  const blurReason =
    typeof moderation?.blurReason === "string" ? moderation.blurReason.trim() : "";
  const originalBlurReason =
    typeof original?.blurReason === "string" ? original.blurReason.trim() : "";

  const context = {
    reportType,
    friendlyType: reportType ? reportType.replace(/[_-]+/g, " ").trim() : "",
    trustedCount,
    reporterDisplayNames,
    trustedMuted,
    trustedMuteCount,
    trustedMuteDisplayNames,
    blurReason,
    originalBlurReason,
    originalBlur: original.blurThumbnail === true,
    originalBlockAutoplay: original.blockAutoplay === true,
    activeBlur: moderation?.blurThumbnail === true,
    activeBlockAutoplay: moderation?.blockAutoplay === true,
    overrideActive: moderation?.viewerOverride?.showAnyway === true,
    activeHidden,
    originalHidden,
    originalHideTriggered,
    hideReason: hideReasonActive,
    hideCounts: activeHideCounts,
    hideBypass: hideBypassActive,
    originalHideReason,
    originalHideCounts,
    originalHideBypass,
    effectiveHideReason,
    effectiveHideCounts,
  };

  context.shouldShow =
    context.originalBlur ||
    context.originalBlockAutoplay ||
    context.trustedCount > 0 ||
    context.trustedMuted ||
    context.overrideActive ||
    context.originalHidden ||
    context.activeHidden ||
    context.originalHideTriggered;

  context.allowOverride =
    context.originalBlur || context.originalBlockAutoplay || context.originalHidden;

  return context;
}

function collectElements(...inputs) {
  const result = [];
  const seen = new Set();
  inputs.forEach((input) => {
    if (!input) {
      return;
    }
    const values = Array.isArray(input) ? input : [input];
    values.forEach((value) => {
      if (!value || typeof value !== "object") {
        return;
      }
      if (!("dataset" in value)) {
        return;
      }
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      result.push(value);
    });
  });
  return result;
}

export function applyModerationContextDatasets(
  context,
  {
    root,
    roots,
    thumbnail,
    thumbnails,
    avatar,
    avatars,
    shouldMaskNsfwForOwner = false,
  } = {},
) {
  if (!context || typeof context !== "object") {
    return;
  }

  const rootElements = collectElements(root, roots);
  const thumbnailElements = shouldMaskNsfwForOwner
    ? []
    : collectElements(thumbnail, thumbnails);
  const avatarElements = shouldMaskNsfwForOwner ? [] : collectElements(avatar, avatars);

  const shouldBlur = context.activeBlur && !context.overrideActive;

  thumbnailElements.forEach((el) => {
    if (shouldBlur) {
      el.dataset.thumbnailState = "blurred";
    } else if (el.dataset.thumbnailState === "blurred") {
      delete el.dataset.thumbnailState;
    }
  });

  avatarElements.forEach((el) => {
    if (shouldBlur) {
      el.dataset.visualState = "blurred";
    } else if (el.dataset.visualState) {
      delete el.dataset.visualState;
    }
  });

  const applyToRoots = (callback) => {
    rootElements.forEach((el) => {
      if (el) {
        callback(el);
      }
    });
  };

  applyToRoots((el) => {
    if (context.originalBlockAutoplay && !context.overrideActive) {
      el.dataset.autoplayPolicy = "blocked";
    } else if (el.dataset.autoplayPolicy) {
      delete el.dataset.autoplayPolicy;
    }

    if (context.overrideActive) {
      el.dataset.moderationOverride = "show-anyway";
    } else if (el.dataset.moderationOverride) {
      delete el.dataset.moderationOverride;
    }
  });

  const reportCount = Math.max(0, Number(context.trustedCount) || 0);
  applyToRoots((el) => {
    if (reportCount > 0) {
      el.dataset.moderationReportCount = String(reportCount);
      if (context.reportType) {
        el.dataset.moderationReportType = context.reportType;
      } else if (el.dataset.moderationReportType) {
        delete el.dataset.moderationReportType;
      }
    } else {
      if (el.dataset.moderationReportType) {
        delete el.dataset.moderationReportType;
      }
      if (el.dataset.moderationReportCount) {
        delete el.dataset.moderationReportCount;
      }
    }
  });

  applyToRoots((el) => {
    if (context.trustedMuted) {
      el.dataset.moderationTrustedMute = "true";
      const muteCount = Math.max(0, Number(context.trustedMuteCount) || 0);
      if (muteCount > 0) {
        el.dataset.moderationTrustedMuteCount = String(muteCount);
      } else if (el.dataset.moderationTrustedMuteCount) {
        delete el.dataset.moderationTrustedMuteCount;
      }
    } else {
      if (el.dataset.moderationTrustedMute) {
        delete el.dataset.moderationTrustedMute;
      }
      if (el.dataset.moderationTrustedMuteCount) {
        delete el.dataset.moderationTrustedMuteCount;
      }
    }
  });

  applyToRoots((el) => {
    if (context.activeHidden && !context.overrideActive) {
      el.dataset.moderationHidden = "true";
      const reason = context.effectiveHideReason || context.hideReason;
      if (reason) {
        el.dataset.moderationHideReason = reason;
      } else if (el.dataset.moderationHideReason) {
        delete el.dataset.moderationHideReason;
      }

      const counts = context.hideCounts || context.effectiveHideCounts || null;
      const muteCount = counts && Number.isFinite(counts.trustedMuteCount)
        ? Math.max(0, Number(counts.trustedMuteCount))
        : null;
      const reportCountHide = counts && Number.isFinite(counts.trustedReportCount)
        ? Math.max(0, Number(counts.trustedReportCount))
        : null;

      if (muteCount !== null) {
        el.dataset.moderationHideTrustedMuteCount = String(muteCount);
      } else if (el.dataset.moderationHideTrustedMuteCount) {
        delete el.dataset.moderationHideTrustedMuteCount;
      }

      if (reportCountHide !== null) {
        el.dataset.moderationHideTrustedReportCount = String(reportCountHide);
      } else if (el.dataset.moderationHideTrustedReportCount) {
        delete el.dataset.moderationHideTrustedReportCount;
      }
    } else {
      if (el.dataset.moderationHidden) {
        delete el.dataset.moderationHidden;
      }
      if (el.dataset.moderationHideReason) {
        delete el.dataset.moderationHideReason;
      }
      if (el.dataset.moderationHideTrustedMuteCount) {
        delete el.dataset.moderationHideTrustedMuteCount;
      }
      if (el.dataset.moderationHideTrustedReportCount) {
        delete el.dataset.moderationHideTrustedReportCount;
      }
    }
  });
}
