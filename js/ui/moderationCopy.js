// js/ui/moderationCopy.js

function buildModerationReasonText(context) {
  if (!context) {
    return "";
  }

  const reasons = [];

  if (context.trustedMuted) {
    const muteCount = Math.max(1, Number(context.trustedMuteCount) || 0);
    const muteLabel = muteCount === 1 ? "trusted contact" : "trusted contacts";
    const countLabel = muteCount === 1 ? "a" : muteCount;
    reasons.push(`muted by ${countLabel} ${muteLabel}`);
  }

  const typeLabel = context.friendlyType || "this video";
  const reportCount = Math.max(0, Number(context.trustedCount) || 0);
  if (reportCount > 0) {
    const friendLabel = reportCount === 1 ? "friend" : "friends";
    reasons.push(`${reportCount} ${friendLabel} reported ${typeLabel}`);
  } else if (!context.trustedMuted) {
    reasons.push(context.friendlyType ? `reports of ${typeLabel}` : "reports");
  }

  if (!reasons.length) {
    return "";
  }

  const combined = reasons.join(" · ");
  return combined.charAt(0).toUpperCase() + combined.slice(1);
}

function buildHiddenSummaryLabel(context) {
  if (!context) {
    return "";
  }

  const reason = context.effectiveHideReason;
  if (!reason) {
    return "";
  }

  const countsSource =
    context.effectiveHideCounts || context.originalHideCounts || context.hideCounts || null;

  const getCount = (key, fallback) => {
    if (countsSource && Number.isFinite(countsSource[key])) {
      return Math.max(0, Number(countsSource[key]));
    }
    if (Number.isFinite(context[key])) {
      return Math.max(0, Number(context[key]));
    }
    return Math.max(0, Number(fallback) || 0);
  };

  if (reason === "trusted-mute-hide") {
    const count = getCount("trustedMuteCount", context.trustedMuteCount || 0);
    if (count > 0) {
      const label = count === 1 ? "trusted mute" : "trusted mutes";
      return `${count} ${label}`;
    }
    return "trusted mute";
  }

  if (reason === "trusted-report-hide") {
    const count = getCount("trustedReportCount", context.trustedCount || 0);
    const type = typeof context.friendlyType === "string" ? context.friendlyType.trim() : "";
    const normalizedType = type ? type.toLowerCase() : "";
    if (count > 0) {
      const label = count === 1 ? "report" : "reports";
      if (normalizedType) {
        return `${count} trusted ${normalizedType} ${label}`;
      }
      const base = count === 1 ? "trusted report" : "trusted reports";
      return `${count} ${base}`;
    }
    if (normalizedType) {
      return `trusted ${normalizedType} reports`;
    }
    return "trusted reports";
  }

  return "";
}

export function buildModerationBadgeText(context, options = {}) {
  if (!context) {
    return "";
  }

  const variant = typeof options.variant === "string" ? options.variant : "card";

  if (variant === "modal") {
    if (context.originalBlockAutoplay && context.trustedMuted) {
      return "Content or user blocked by a trusted contact.";
    }

    const blurSource = (context.originalBlurReason || context.blurReason || "")
      .toLowerCase()
      .trim();
    const suppressBlurLabel =
      blurSource === "trusted-mute" || blurSource === "trusted-mute-hide";

    const parts = [];
    if (!suppressBlurLabel) {
      parts.push("Blurred");
    }

    const reason = buildModerationReasonText(context);
    if (reason) {
      parts.push(reason);
    }

    if (!parts.length) {
      return "Blurred due to reports";
    }

    return parts.join(" · ");
  }

  const hiddenLabel = buildHiddenSummaryLabel(context);
  const reason = buildModerationReasonText(context);

  if (context.overrideActive) {
    if (hiddenLabel) {
      return `Showing despite ${hiddenLabel}`;
    }
    if (reason) {
      return `Showing despite ${reason}`;
    }
    return "Showing despite reports";
  }

  if (context.activeHidden || (context.originalHidden && !context.overrideActive)) {
    if (hiddenLabel) {
      return `Hidden · ${hiddenLabel}`;
    }
    return "Hidden";
  }

  if (context.originalBlockAutoplay && context.trustedMuted) {
    return "Content or user blocked by a trusted contact.";
  }

  const blurSource = (context.originalBlurReason || context.blurReason || "").toLowerCase();
  const suppressBlurLabel =
    blurSource === "trusted-mute" || blurSource === "trusted-mute-hide";

  const parts = [];
  if (context.originalBlur && !suppressBlurLabel) {
    parts.push("Blurred");
  }
  if (context.originalBlockAutoplay) {
    parts.push("Autoplay blocked");
  }
  if (reason) {
    parts.push(reason);
  }

  return parts.join(" · ");
}
