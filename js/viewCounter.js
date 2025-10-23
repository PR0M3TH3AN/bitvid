/**
 * @module viewCounter
 * @description Public API for tracking and formatting bitvid video view totals.
 *
 * The module exposes lifecycle helpers:
 *   - {@link initViewCounter} to prime the counter with the active Nostr client.
 *   - {@link subscribeToVideoViewCount} / {@link unsubscribeFromVideoViewCount}
 *     to observe live totals for an `a` or `e` pointer.
 *   - {@link ingestLocalViewEvent} so playback flows can optimistically update
 *     counts immediately after publishing a view event.
 *   - {@link formatViewCount} for rendering localized view totals in the UI.
 */

import {
  VIEW_COUNT_BACKFILL_MAX_DAYS,
  VIEW_COUNT_CACHE_TTL_MS,
  VIEW_COUNT_DEDUPE_WINDOW_SECONDS,
} from "./config.js";
import { userLogger } from "./utils/logger.js";
import { nostrClient } from "./nostr.js";
import {
  countVideoViewEvents,
  listVideoViewEvents,
  subscribeVideoViewEvents,
} from "./nostr/viewEventBindings.js";

const VIEW_COUNTER_STORAGE_KEY = "bitvid:view-counter:v1";
const STORAGE_DEBOUNCE_MS = 500;
const SECONDS_PER_DAY = 86_400;

const listVideoViewEventsApi = (pointer, options) =>
  listVideoViewEvents(pointer, options);
const subscribeVideoViewEventsApi = (pointer, options) =>
  subscribeVideoViewEvents(pointer, options);
const countVideoViewEventsApi = (pointer, options) =>
  countVideoViewEvents(pointer, options);

/** @type {Map<string, ViewCounterState>} */
const pointerStates = new Map();
/** @type {Map<string, PointerListeners>} */
const pointerListeners = new Map();
let persistTimer = null;
let nextTokenId = 1;

restoreCacheSnapshot();

/**
 * @typedef {Object} ViewCounterState
 * @property {number} total
 * @property {Map<string, number>} dedupeBuckets
 * @property {number} lastSyncedAt
 * @property {"idle"|"hydrating"|"live"} status
 */

/**
 * @typedef {Object} PointerListeners
 * @property {{ type: string, value: string, relay?: string | null }} pointer
 * @property {Map<string, Function>} handlers
 * @property {(() => void) | null} liveUnsub
 * @property {Promise<void> | null} hydrationPromise
 * @property {Object | null} options
 */

/**
 * Persist the in-memory cache to localStorage after a short debounce.
 */
function schedulePersist() {
  if (!supportsStorage()) {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistCacheSnapshot();
  }, STORAGE_DEBOUNCE_MS);
}

/**
 * Convert a raw pointer input into the canonical key and normalized descriptor.
 *
 * @param {string | { type?: string, value?: string, relay?: string | null } | { tag?: any }} input
 * @returns {{ key: string, pointer: { type: string, value: string, relay?: string | null } }}
 */
function canonicalizePointer(input) {
  const normalized = normalizePointer(input);
  if (!normalized) {
    throw new Error("Invalid pointer supplied for view counting.");
  }

  const type = normalized.type === "a" ? "a" : "e";
  const value = typeof normalized.value === "string" ? normalized.value.trim() : "";
  if (!value) {
    throw new Error("Invalid pointer supplied for view counting.");
  }

  const key = `${type}:${value}`;
  const descriptor = { type, value };
  if (normalized.relay) {
    descriptor.relay = normalized.relay;
  }
  return { key, pointer: descriptor };
}

/**
 * Mirror the pointer normalization logic used inside the Nostr client.
 *
 * @param {any} pointer
 * @returns {{ type: string, value: string, relay?: string | null } | null}
 */
function normalizePointer(pointer) {
  if (!pointer) {
    return null;
  }

  if (Array.isArray(pointer)) {
    return normalizePointerTag(pointer);
  }

  if (typeof pointer === "object") {
    if (typeof pointer.type === "string" && typeof pointer.value === "string") {
      return clonePointer(pointer);
    }
    if (Array.isArray(pointer.tag)) {
      return normalizePointerTag(pointer.tag);
    }
  }

  if (typeof pointer !== "string") {
    return null;
  }

  const trimmed = pointer.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("naddr") || trimmed.startsWith("nevent")) {
    const decoder = typeof window !== "undefined" ? window?.NostrTools?.nip19?.decode : null;
    if (typeof decoder === "function") {
      try {
        const decoded = decoder(trimmed);
        if (decoded?.type === "naddr" && decoded.data) {
          const { kind, pubkey, identifier, relays } = decoded.data;
          if (
            typeof kind === "number" &&
            typeof pubkey === "string" &&
            typeof identifier === "string"
          ) {
            const relay = Array.isArray(relays) && relays.length && typeof relays[0] === "string"
              ? relays[0]
              : null;
            return {
              type: "a",
              value: `${kind}:${pubkey}:${identifier}`,
              relay,
            };
          }
        }
        if (decoded?.type === "nevent" && decoded.data) {
          const { id, relays } = decoded.data;
          if (typeof id === "string" && id.trim()) {
            const relay = Array.isArray(relays) && relays.length && typeof relays[0] === "string"
              ? relays[0]
              : null;
            return {
              type: "e",
              value: id.trim(),
              relay,
            };
          }
        }
      } catch (error) {
        userLogger.warn("[viewCounter] Failed to decode NIP-19 pointer:", error);
      }
    }
  }

  const type = trimmed.includes(":") ? "a" : "e";
  return { type, value: trimmed, relay: null };
}

function clonePointer(pointer) {
  const type = pointer.type === "a" ? "a" : "e";
  const value = typeof pointer.value === "string" ? pointer.value.trim() : "";
  if (!value) {
    return null;
  }
  const relay = typeof pointer.relay === "string" ? pointer.relay : null;
  return relay ? { type, value, relay } : { type, value };
}

function normalizePointerTag(tag) {
  if (!Array.isArray(tag) || tag.length < 2) {
    return null;
  }
  const [label, value, relay] = tag;
  if (label === "a" && typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const relayValue = typeof relay === "string" ? relay : null;
    return relayValue ? { type: "a", value: normalized, relay: relayValue } : { type: "a", value: normalized };
  }
  if (label === "e" && typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const relayValue = typeof relay === "string" ? relay : null;
    return relayValue ? { type: "e", value: normalized, relay: relayValue } : { type: "e", value: normalized };
  }
  return null;
}

function supportsStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch (error) {
    return false;
  }
}

function restoreCacheSnapshot() {
  if (!supportsStorage()) {
    return;
  }
  try {
    const raw = localStorage.getItem(VIEW_COUNTER_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const payload = JSON.parse(raw);
    if (!payload || payload.version !== 1) {
      return;
    }
    const savedAt = Number(payload.savedAt) || 0;
    const now = Date.now();
    if (!savedAt || now - savedAt > VIEW_COUNT_CACHE_TTL_MS) {
      localStorage.removeItem(VIEW_COUNTER_STORAGE_KEY);
      return;
    }
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        continue;
      }
      const [key, state] = entry;
      if (typeof key !== "string" || !state || typeof state !== "object") {
        continue;
      }
      const total = Number.isFinite(state.total) ? Number(state.total) : 0;
      const lastSyncedAt = Number.isFinite(state.lastSyncedAt) ? Number(state.lastSyncedAt) : 0;
      const status = typeof state.status === "string" ? state.status : "idle";
      const dedupeBuckets = new Map();
      if (Array.isArray(state.dedupeBuckets)) {
        for (const bucket of state.dedupeBuckets) {
          if (!Array.isArray(bucket) || bucket.length < 1) {
            continue;
          }
          const [bucketKey, bucketValue] = bucket;
          if (typeof bucketKey === "string") {
            dedupeBuckets.set(
              bucketKey,
              Number.isFinite(bucketValue) ? Number(bucketValue) : 0
            );
          }
        }
      } else if (state.dedupeBuckets && typeof state.dedupeBuckets === "object") {
        for (const bucketKey of Object.keys(state.dedupeBuckets)) {
          const bucketValue = state.dedupeBuckets[bucketKey];
          if (typeof bucketKey === "string") {
            dedupeBuckets.set(
              bucketKey,
              Number.isFinite(bucketValue) ? Number(bucketValue) : 0
            );
          }
        }
      }
      pointerStates.set(key, {
        total,
        dedupeBuckets,
        lastSyncedAt,
        status: status === "hydrating" || status === "live" ? "idle" : status,
      });
    }
  } catch (error) {
    userLogger.warn("[viewCounter] Failed to restore cached view counts:", error);
  }
}

function persistCacheSnapshot() {
  if (!supportsStorage()) {
    return;
  }
  try {
    const entries = [];
    for (const [key, state] of pointerStates.entries()) {
      entries.push([
        key,
        {
          total: state.total,
          dedupeBuckets: Array.from(state.dedupeBuckets.entries()),
          lastSyncedAt: state.lastSyncedAt,
          status: state.status,
        },
      ]);
    }
    const payload = {
      version: 1,
      savedAt: Date.now(),
      entries,
    };
    localStorage.setItem(VIEW_COUNTER_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    userLogger.warn("[viewCounter] Failed to persist view count cache:", error);
  }
}

function ensurePointerState(key) {
  let state = pointerStates.get(key);
  if (!state) {
    state = {
      total: 0,
      dedupeBuckets: new Map(),
      lastSyncedAt: 0,
      status: "idle",
    };
    pointerStates.set(key, state);
  } else if (!(state.dedupeBuckets instanceof Map)) {
    state.dedupeBuckets = new Map(
      state.dedupeBuckets ? Object.entries(state.dedupeBuckets) : []
    );
  }
  return state;
}

function mergePointerDescriptor(existing, next) {
  if (!existing) {
    return next;
  }
  if (!next) {
    return existing;
  }
  if (!existing.relay && next.relay) {
    return { ...existing, relay: next.relay };
  }
  return existing;
}

function ensurePointerListeners(key, pointer) {
  let listeners = pointerListeners.get(key);
  if (!listeners) {
    listeners = {
      pointer,
      handlers: new Map(),
      liveUnsub: null,
      hydrationPromise: null,
      options: null,
    };
    pointerListeners.set(key, listeners);
  } else if (!listeners.pointer) {
    listeners.pointer = pointer;
  } else {
    listeners.pointer = mergePointerDescriptor(listeners.pointer, pointer);
  }
  return listeners;
}

function notifyHandlers(key) {
  const listeners = pointerListeners.get(key);
  if (!listeners || !listeners.handlers.size) {
    return;
  }
  const state = ensurePointerState(key);
  const snapshot = {
    total: state.total,
    lastSyncedAt: state.lastSyncedAt,
    status: state.status,
  };
  for (const handler of listeners.handlers.values()) {
    try {
      handler(snapshot);
    } catch (error) {
      userLogger.warn("[viewCounter] View handler threw:", error);
    }
  }
}

function setPointerStatus(key, status) {
  const state = ensurePointerState(key);
  if (state.status === status) {
    return;
  }
  state.status = status;
  schedulePersist();
  notifyHandlers(key);
}

function applyEventToState(key, event) {
  if (!event || typeof event !== "object") {
    return false;
  }
  const state = ensurePointerState(key);
  const bucketKey = deriveBucketKey(event);
  const finalKey = bucketKey || deriveFallbackKey(event);
  if (!finalKey) {
    return false;
  }
  const seenBefore = state.dedupeBuckets.has(finalKey);
  const createdAt = Number.isFinite(event.created_at)
    ? Number(event.created_at)
    : Math.floor(Date.now() / 1000);
  state.dedupeBuckets.set(finalKey, createdAt);
  if (seenBefore) {
    return false;
  }
  state.total += 1;
  state.lastSyncedAt = Date.now();
  return true;
}

function deriveBucketKey(event) {
  const pubkey = typeof event?.pubkey === "string" ? event.pubkey : null;
  if (!pubkey) {
    return null;
  }
  const createdAt = Number.isFinite(event?.created_at)
    ? Number(event.created_at)
    : Math.floor(Date.now() / 1000);
  const windowSize = Math.max(1, VIEW_COUNT_DEDUPE_WINDOW_SECONDS);
  const bucket = Math.floor(createdAt / windowSize);
  return `${pubkey}:${bucket}`;
}

function deriveFallbackKey(event) {
  if (typeof event?.id === "string" && event.id) {
    return `event:${event.id}`;
  }
  if (typeof event?.sig === "string" && event.sig) {
    return `sig:${event.sig}`;
  }
  return null;
}

function mergeListenerOptions(existing, next) {
  if (!existing) {
    return next || null;
  }
  if (!next) {
    return existing;
  }
  return {
    ...existing,
    ...next,
  };
}

async function hydratePointer(key, listeners) {
  const pointer = listeners.pointer;
  const options = listeners.options || {};
  setPointerStatus(key, "hydrating");
  const sinceSeconds = Math.floor(Date.now() / 1000) - VIEW_COUNT_BACKFILL_MAX_DAYS * SECONDS_PER_DAY;
  const listPromise = listVideoViewEventsApi(pointer, {
    since: sinceSeconds,
    relays: options.relays,
  });
  const countPromise = countVideoViewEventsApi(pointer, {
    relays: options.relays,
    signal: options.signal,
  });
  let listResult = [];
  let countResult = null;
  try {
    listResult = await listPromise;
  } catch (error) {
    userLogger.warn("[viewCounter] Failed to hydrate view events via list:", error);
  }
  try {
    countResult = await countPromise;
  } catch (error) {
    if (error?.name === "AbortError") {
      userLogger.warn("[viewCounter] View count hydration aborted:", error);
    } else {
      userLogger.warn("[viewCounter] Failed to count view events:", error);
    }
  }
  let mutated = false;
  if (Array.isArray(listResult)) {
    for (const event of listResult) {
      mutated = applyEventToState(key, event) || mutated;
    }
  }
  const bestCount = Number.isFinite(countResult?.best?.count)
    ? Number(countResult.best.count)
    : Number.isFinite(countResult?.total)
    ? Number(countResult.total)
    : null;

  if (bestCount !== null) {
    const state = ensurePointerState(key);
    const shouldUpdate =
      !countResult?.fallback || bestCount >= state.total || state.total === 0;
    if (shouldUpdate && state.total !== bestCount) {
      state.total = bestCount;
      state.lastSyncedAt = Date.now();
      mutated = true;
    }
  }
  if (mutated) {
    schedulePersist();
    notifyHandlers(key);
  } else {
    // Even if nothing changed we still update last synced timestamp.
    const state = ensurePointerState(key);
    state.lastSyncedAt = Date.now();
    schedulePersist();
    notifyHandlers(key);
  }
}

function ensureHydration(key, listeners) {
  if (!listeners.hydrationPromise) {
    listeners.hydrationPromise = hydratePointer(key, listeners).finally(() => {
      listeners.hydrationPromise = null;
      if (listeners.liveUnsub) {
        setPointerStatus(key, "live");
      } else {
        setPointerStatus(key, "idle");
      }
    });
  }
}

function ensureLiveSubscription(key, listeners) {
  if (listeners.liveUnsub || !listeners.handlers.size) {
    return;
  }
  const pointer = listeners.pointer;
  const options = listeners.options || {};
  try {
    const since = Math.floor(Date.now() / 1000) - Math.max(1, VIEW_COUNT_DEDUPE_WINDOW_SECONDS);
    const unsubscribe = subscribeVideoViewEventsApi(pointer, {
      relays: options.relays,
      since,
      onEvent: (event) => {
        const changed = applyEventToState(key, event);
        if (changed) {
          schedulePersist();
          notifyHandlers(key);
        }
      },
    });
    listeners.liveUnsub = () => {
      try {
        unsubscribe();
      } catch (error) {
        userLogger.warn("[viewCounter] Failed to unsubscribe from view events:", error);
      }
      listeners.liveUnsub = null;
      if (!listeners.hydrationPromise) {
        setPointerStatus(key, "idle");
      }
    };
    setPointerStatus(key, "live");
  } catch (error) {
    userLogger.warn("[viewCounter] Failed to open live view subscription:", error);
  }
}

export function initViewCounter({ nostrClient } = {}) {
  if (nostrClient && typeof nostrClient === "object") {
    // The singleton Nostr client is already registered inside js/nostr.js.
    // This hook remains for backwards compatibility.
  }
}

export function subscribeToVideoViewCount(pointerInput, handler, options = {}) {
  if (typeof handler !== "function") {
    throw new Error("A handler function is required to subscribe to view counts.");
  }
  const { key, pointer } = canonicalizePointer(pointerInput);
  const listeners = ensurePointerListeners(key, pointer);
  listeners.options = mergeListenerOptions(listeners.options, options);
  const token = `token-${nextTokenId++}`;
  listeners.handlers.set(token, handler);
  const state = ensurePointerState(key);
  try {
    handler({
      total: state.total,
      lastSyncedAt: state.lastSyncedAt,
      status: state.status,
    });
  } catch (error) {
    userLogger.warn("[viewCounter] Initial handler invocation threw:", error);
  }
  ensureHydration(key, listeners);
  ensureLiveSubscription(key, listeners);
  return token;
}

export function unsubscribeFromVideoViewCount(pointerInput, token) {
  if (!token) {
    return;
  }
  const { key } = canonicalizePointer(pointerInput);
  const listeners = pointerListeners.get(key);
  if (!listeners) {
    return;
  }
  listeners.handlers.delete(token);
  if (!listeners.handlers.size && listeners.liveUnsub) {
    listeners.liveUnsub();
  }
}

export function ingestLocalViewEvent({ event, pointer }) {
  if (!event || !pointer) {
    return;
  }
  try {
    const { key } = canonicalizePointer(pointer);
    const changed = applyEventToState(key, event);
    if (changed) {
      schedulePersist();
      notifyHandlers(key);
    }
  } catch (error) {
    userLogger.warn("[viewCounter] Failed to ingest local view event:", error);
  }
}

const numberFormatter = typeof Intl !== "undefined" && Intl.NumberFormat
  ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
  : null;
const compactFormatter = typeof Intl !== "undefined" && Intl.NumberFormat
  ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 })
  : null;

export function formatViewCount(total) {
  const value = Number.isFinite(total) ? Number(total) : 0;
  if (value < 1000) {
    if (numberFormatter) {
      return numberFormatter.format(value);
    }
    return String(value);
  }
  if (compactFormatter) {
    return compactFormatter.format(value);
  }
  return String(value);
}
