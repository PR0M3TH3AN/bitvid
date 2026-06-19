// js/services/hashtagPreferencesHelpers.js
//
// Pure helpers extracted from hashtagPreferencesService.js to keep that service
// under the file-size budget. No module state — safe to test in isolation.

import { HEX64_REGEX } from "../utils/hex.js";

const MAX_DECRYPT_RETRY_DELAY_MS = 60000;

// Transient decrypt failures that must RETRY in the background rather than give
// up: our own timeout, a severed nip-07 message port ("message channel closed"),
// and the circuit breaker's fast-fail. Without this a brief channel drop during
// the login burst abandons hashtag prefs until a refresh (KNOWN_BUGS #0).
const TRANSIENT_DECRYPT_ERROR_CODES = new Set([
  "hashtag-preferences-decrypt-timeout",
  "nip07-channel-unresponsive",
]);
const TRANSIENT_DECRYPT_MESSAGE_PATTERNS = [
  "message channel closed",
  "could not establish connection",
  "receiving end does not exist",
  "extension context invalidated",
  "connection lost",
  "channel is unresponsive",
];

export function isTransientDecryptError(error) {
  if (!error) return false;
  if (error.code && TRANSIENT_DECRYPT_ERROR_CODES.has(error.code)) return true;
  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  if (TRANSIENT_DECRYPT_MESSAGE_PATTERNS.some((p) => message.includes(p))) {
    return true;
  }
  // decryptEvent wraps the per-scheme Promise.any failures in a generic
  // "decrypt-failed" error and nests the real causes under .errors/.cause —
  // recurse so a channel-death sub-error still triggers a retry.
  const nested = Array.isArray(error.errors)
    ? error.errors
    : Array.isArray(error.cause)
      ? error.cause
      : null;
  if (nested) {
    return nested.some((entry) => isTransientDecryptError(entry?.error || entry));
  }
  return false;
}

export function computeRetryDelay(baseDelayMs, attempt) {
  const normalizedAttempt =
    Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const multiplier = 2 ** normalizedAttempt;
  const nextDelay = Math.max(250, Math.floor(baseDelayMs * multiplier));
  return Math.min(MAX_DECRYPT_RETRY_DELAY_MS, nextDelay);
}

export function normalizeHexPubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}
