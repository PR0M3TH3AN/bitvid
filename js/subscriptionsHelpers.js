// js/subscriptionsHelpers.js
//
// State-free helpers extracted from subscriptions.js to keep that module under
// the file-size budget. No behavior change.

import { devLogger, userLogger } from "./utils/logger.js";

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
          `[SubscriptionsManager] listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

const MAX_DECRYPT_RETRY_DELAY_MS = 60000;

// Transient decrypt failures that must RETRY rather than give up: our own
// timeout, a severed nip-07 message port ("message channel closed"), and the
// circuit breaker's fast-fail. Without this a brief channel drop during the
// login burst abandons the subscription list until a refresh (KNOWN_BUGS #0).
const TRANSIENT_DECRYPT_ERROR_CODES = new Set([
  "subscriptions-decrypt-timeout",
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

export function normalizeHexPubkey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

export function normalizeEncryptionToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function serializeSubscriptionTagMatrix(values) {
  const tags = [];
  const seen = new Set();
  if (!values) {
    return JSON.stringify(tags);
  }
  const iterable = Array.isArray(values)
    ? values
    : values instanceof Set
    ? Array.from(values)
    : [];
  for (const candidate of iterable) {
    const normalized = normalizeHexPubkey(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tags.push(["p", normalized]);
  }
  return JSON.stringify(tags);
}

export function parseSubscriptionPlaintext(plaintext) {
  if (typeof plaintext !== "string" || !plaintext) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch (error) {
    devLogger.warn(
      "[SubscriptionsManager] Failed to parse subscription ciphertext as JSON; treating as empty.",
      error,
    );
    return [];
  }

  if (Array.isArray(parsed)) {
    const collected = [];
    const seen = new Set();
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const marker = typeof entry[0] === "string" ? entry[0].trim().toLowerCase() : "";
      if (marker !== "p") {
        continue;
      }
      const normalized = normalizeHexPubkey(entry[1]);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      collected.push(normalized);
    }
    return collected;
  }

  if (parsed && typeof parsed === "object") {
    const tagArray = Array.isArray(parsed.tags) ? parsed.tags : [];
    if (tagArray.length) {
      try {
        return parseSubscriptionPlaintext(JSON.stringify(tagArray));
      } catch {
        // fall through to legacy handling
      }
    }

    const legacy = Array.isArray(parsed.subPubkeys) ? parsed.subPubkeys : [];
    return legacy.map((value) => normalizeHexPubkey(value)).filter(Boolean);
  }

  return [];
}

export function parseCachedSubscriptionSnapshot(cached) {
  if (Array.isArray(cached)) {
    const normalized = cached.map((value) => normalizeHexPubkey(value)).filter(Boolean);
    return {
      subscribedPubkeys: normalized,
      eventId: null,
      createdAt: null,
      hasSnapshot: true,
    };
  }

  if (cached && typeof cached === "object") {
    const listCandidate = Array.isArray(cached.subscribedPubkeys)
      ? cached.subscribedPubkeys
      : Array.isArray(cached.subPubkeys)
        ? cached.subPubkeys
        : [];
    const normalized = listCandidate
      .map((value) => normalizeHexPubkey(value))
      .filter(Boolean);
    const eventId = typeof cached.eventId === "string" ? cached.eventId : null;
    const createdAtRaw = cached.createdAt;
    const createdAtCandidate =
      typeof createdAtRaw === "number"
        ? createdAtRaw
        : typeof createdAtRaw === "string" && createdAtRaw.trim()
          ? Number(createdAtRaw)
          : Number.NaN;
    const createdAt = Number.isFinite(createdAtCandidate)
      ? Math.floor(createdAtCandidate)
      : null;
    const hasSnapshot =
      Array.isArray(cached.subscribedPubkeys) ||
      Array.isArray(cached.subPubkeys) ||
      Boolean(eventId) ||
      Number.isFinite(createdAtCandidate);
    return {
      subscribedPubkeys: normalized,
      eventId,
      createdAt,
      hasSnapshot,
    };
  }

  return {
    subscribedPubkeys: [],
    eventId: null,
    createdAt: null,
    hasSnapshot: false,
  };
}
