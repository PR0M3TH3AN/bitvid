// js/payments/platformFee.js

import { PLATFORM_FEE_PERCENT } from "../config.js";

export function parsePercentValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return NaN;
    }

    if (trimmed.includes("/")) {
      const [firstRaw, secondRaw] = trimmed.split("/").map((part) => part.trim());
      if (firstRaw && secondRaw) {
        const first = Number(firstRaw);
        const second = Number(secondRaw);
        if (Number.isFinite(first) && Number.isFinite(second) && first >= 0 && second >= 0) {
          const total = first + second;
          if (total > 0) {
            return (second / total) * 100;
          }
        }
      }
    }

    const percentStripped = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;
    const directNumeric = Number(percentStripped);
    if (Number.isFinite(directNumeric)) {
      return directNumeric;
    }

    const match = percentStripped.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const fallback = Number(match[0]);
      return Number.isFinite(fallback) ? fallback : NaN;
    }

    return NaN;
  }

  return Number.isFinite(value) ? Number(value) : NaN;
}

export function clampPercent(value) {
  const numeric = parsePercentValue(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(100, Math.max(0, numeric));
}

export function getDefaultPlatformFeePercent() {
  const parsed = parsePercentValue(PLATFORM_FEE_PERCENT);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return clampPercent(parsed);
}

export function resolvePlatformFeePercent(overrideValue) {
  const parsedOverride = parsePercentValue(overrideValue);
  if (Number.isFinite(parsedOverride)) {
    return clampPercent(parsedOverride);
  }
  return getDefaultPlatformFeePercent();
}
