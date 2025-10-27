// js/nostr/countDiagnostics.js
// Centralized helpers for gating high-volume COUNT diagnostics behind
// verbose dev mode and deduplicating repeated warnings so the console stays
// readable during normal development sessions.

import { devLogger } from "../utils/logger.js";
import { isVerboseDevMode } from "../config.js";

const seenWarningKeys = new Set();

function isVerboseCountLoggingEnabled() {
  if (typeof window !== "undefined" && window) {
    const runtimeFlag = window.__BITVID_VERBOSE_DEV_MODE__;
    if (typeof runtimeFlag === "boolean") {
      return runtimeFlag;
    }
  }
  return Boolean(isVerboseDevMode);
}

function logCountWarning(message, args = [], { key, throttle = true } = {}) {
  if (!isVerboseCountLoggingEnabled()) {
    return;
  }

  if (throttle && key) {
    const normalizedKey = String(key);
    if (seenWarningKeys.has(normalizedKey)) {
      return;
    }
    seenWarningKeys.add(normalizedKey);
  }

  devLogger.warn(message, ...args);
}

export function logCountTimeoutCleanupFailure(error) {
  logCountWarning("[nostr] COUNT timeout cleanup failed:", [error], {
    key: "count-timeout-cleanup",
  });
}

export function logRelayCountFailure(url, error) {
  const normalizedUrl =
    typeof url === "string" && url.trim() ? url.trim() : "(unknown relay)";
  logCountWarning(`[nostr] COUNT request failed on ${normalizedUrl}:`, [error], {
    key: `relay:${normalizedUrl}`,
  });
}

export function logRebroadcastCountFailure(error) {
  logCountWarning("[nostr] COUNT request for rebroadcast failed:", [error], {
    key: "rebroadcast-count-failure",
  });
}

export function logViewCountFailure(error) {
  logCountWarning("[nostr] COUNT view request failed:", [error], {
    key: "view-count-failure",
  });
}

export function resetCountWarningHistory() {
  seenWarningKeys.clear();
}
