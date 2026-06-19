// js/userBlocksHelpers.js
//
// State-free helpers extracted from userBlocks.js to keep that module under the
// file-size budget. No behavior change.

import { userLogger } from "./utils/logger.js";

export class TinyEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
      return () => {};
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        userLogger.warn(
          `[UserBlockList] listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

// Cap the exponential backoff well above the decrypt budget so a persistently
// unresponsive signer settles into an occasional heartbeat instead of pinning
// the extension/CPU every ~15s indefinitely.
const MAX_DECRYPT_RETRY_DELAY_MS = 60000;

// Transient decrypt failures that must KEEP the stale list and RETRY in the
// background (the channel/extension recovers shortly), rather than giving up
// permanently. Besides our own timeout, this covers a severed nip-07 message
// port ("message channel closed" — KNOWN_BUGS #0) and the circuit breaker's
// fast-fail while it probes for recovery. Without this, a brief channel drop
// during the login burst abandons the block list until a page refresh, even
// though the channel comes back seconds later.
const TRANSIENT_DECRYPT_ERROR_CODES = new Set([
  "user-blocklist-decrypt-timeout",
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
  if (error.code && TRANSIENT_DECRYPT_ERROR_CODES.has(error.code)) {
    return true;
  }
  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  return TRANSIENT_DECRYPT_MESSAGE_PATTERNS.some((p) => message.includes(p));
}

export function computeRetryDelay(baseDelayMs, attempt) {
  const normalizedAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const multiplier = 2 ** normalizedAttempt;
  const nextDelay = Math.max(250, Math.floor(baseDelayMs * multiplier));
  return Math.min(MAX_DECRYPT_RETRY_DELAY_MS, nextDelay);
}
