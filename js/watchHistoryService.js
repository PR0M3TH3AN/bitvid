// js/watchHistoryService.js

import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostrClientFacade.js";
import {
  normalizePointerInput,
  pointerKey,
  normalizeActorKey,
} from "./nostr/watchHistory.js";
import {
  WATCH_HISTORY_CACHE_TTL_MS,
  WATCH_HISTORY_MAX_ITEMS,
} from "./config.js";
import {
  FEATURE_WATCH_HISTORY_V2,
  getWatchHistoryV2Enabled,
} from "./constants.js";
import { isDevMode } from "./config.js";
import { getApplication } from "./applicationContext.js";
import { devLogger, userLogger } from "./utils/logger.js";

const SESSION_STORAGE_KEY = "bitvid:watch-history:session:v1";
const SESSION_STORAGE_VERSION = 1;
const POINTER_THROTTLE_MS = 60 * 1000;
const state = {
  restored: false,
  queues: new Map(),
  inflightSnapshots: new Map(),
  fingerprintCache: new Map(),
  listeners: new Map(),
};

function resolveFlagEnabled() {
  try {
    if (typeof getWatchHistoryV2Enabled === "function") {
      return getWatchHistoryV2Enabled() === true;
    }
  } catch (error) {
    devLogger.warn(
      "[watchHistoryService] Failed to read FEATURE_WATCH_HISTORY_V2 flag:",
      error,
    );
  }
  return FEATURE_WATCH_HISTORY_V2 === true;
}

function getLoggedInActorKey() {
  const direct = normalizeActorKey(nostrClient?.pubkey);
  if (direct) {
    return direct;
  }

  if (typeof window !== "undefined") {
    const appCandidate =
      getApplication() || null;
    if (appCandidate && typeof appCandidate === "object") {
      if (typeof appCandidate.normalizeHexPubkey === "function") {
        try {
          const normalized = appCandidate.normalizeHexPubkey(
            appCandidate.pubkey
          );
          if (normalized) {
            return normalizeActorKey(normalized);
          }
        } catch (error) {
          devLogger.warn(
            "[watchHistoryService] Failed to normalize app login pubkey:",
            error
          );
        }
      }

      if (typeof appCandidate.pubkey === "string" && appCandidate.pubkey) {
        const fallback = normalizeActorKey(appCandidate.pubkey);
        if (fallback) {
          return fallback;
        }
      }
    }
  }

  return "";
}

function getSessionActorKey() {
  const logged = getLoggedInActorKey();
  if (logged) {
    return "";
  }
  return normalizeActorKey(nostrClient?.sessionActor?.pubkey);
}

function shouldUseExtensionForHistory(actorKey) {
  const normalizedActor = normalizeActorKey(actorKey);
  if (!normalizedActor) {
    return false;
  }

  const loggedActor = normalizeActorKey(nostrClient?.pubkey);
  if (!loggedActor || loggedActor !== normalizedActor) {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const extension = window.nostr;
  if (!extension || !extension.nip04) {
    return false;
  }

  return typeof extension.nip04.decrypt === "function";
}

async function ensureWatchHistoryExtensionPermissions(actorKey) {
  if (!shouldUseExtensionForHistory(actorKey)) {
    return { ok: true };
  }

  const permissionResult = await requestDefaultExtensionPermissions();
  if (permissionResult.ok) {
    return { ok: true };
  }

  const message =
    "Approve your NIP-07 extension to sync watch history.";
  const error = new Error(message);
  error.code = "watch-history-extension-permission-denied";
  error.cause = permissionResult.error;

  userLogger.warn(
    "[watchHistoryService] Extension denied decrypt permission required for watch history.",
    {
      actor: normalizeActorKey(actorKey) || null,
      error: permissionResult.error,
    },
  );

  return { ok: false, error };
}

function resolveEffectiveActorKey(actorInput) {
  const supplied =
    typeof actorInput === "string" && actorInput.trim()
      ? normalizeActorKey(actorInput)
      : "";
  if (supplied) {
    return supplied;
  }
  const logged = getLoggedInActorKey();
  if (logged) {
    return logged;
  }
  const session = getSessionActorKey();
  if (session) {
    return session;
  }
  return "";
}

function isFeatureEnabled(actorInput) {
  const baseEnabled = resolveFlagEnabled();
  const actorKey = resolveEffectiveActorKey(actorInput);
  const logged = getLoggedInActorKey();
  const session = getSessionActorKey();

  if (actorKey && logged && actorKey === logged) {
    return true;
  }

  if (actorKey && session && actorKey === session) {
    return false;
  }

  if (!actorKey) {
    if (logged) {
      return true;
    }
    if (session) {
      return false;
    }
  }

  return baseEnabled;
}

function isLocalOnly(actorInput) {
  const actorKey = resolveEffectiveActorKey(actorInput);
  const session = getSessionActorKey();
  if (!session) {
    return false;
  }
  if (!actorKey) {
    return true;
  }
  return actorKey === session;
}

function supportsLocalHistory(actorInput) {
  return isLocalOnly(actorInput);
}

function getSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch (error) {
    devLogger.warn("[watchHistoryService] sessionStorage unavailable:", error);
  }
  return null;
}

function getLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    devLogger.warn("[watchHistoryService] localStorage unavailable:", error);
  }
  return null;
}

function emit(eventName, payload) {
  const listeners = state.listeners.get(eventName);
  if (listeners && listeners.size) {
    for (const callback of Array.from(listeners)) {
      try {
        callback(payload);
      } catch (error) {
        devLogger.warn(
        `[watchHistoryService] Listener for ${eventName} failed:`,
        error
        );
      }
    }
  }

  const wildcard = state.listeners.get("*");
  if (wildcard && wildcard.size) {
    for (const callback of Array.from(wildcard)) {
      try {
        callback({ event: eventName, payload });
      } catch (error) {
        devLogger.warn(
        `[watchHistoryService] Wildcard listener error for ${eventName}:`,
        error
        );
      }
    }
  }

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      const detail = { event: eventName, payload };
      const evt = new CustomEvent("bitvid:watchHistory", { detail });
      window.dispatchEvent(evt);
    } catch (error) {
      devLogger.warn(
      `[watchHistoryService] Failed to dispatch window event for ${eventName}:`,
      error
      );
    }
  }
}

function subscribe(eventName, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  if (!state.listeners.has(eventName)) {
    state.listeners.set(eventName, new Set());
  }
  const listeners = state.listeners.get(eventName);
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
    if (!listeners.size) {
      state.listeners.delete(eventName);
    }
  };
}

function getOrCreateQueue(actorKey) {
  let queue = state.queues.get(actorKey);
  if (!queue) {
    queue = {
      items: new Map(),
      throttle: new Map(),
      lastSnapshotReason: null,
      republishScheduled: false,
    };
    state.queues.set(actorKey, queue);
  }
  return queue;
}

function restoreQueueState() {
  if (state.restored) {
    return;
  }
  state.restored = true;

  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  let raw = null;
  try {
    raw = storage.getItem(SESSION_STORAGE_KEY);
  } catch (error) {
    devLogger.warn("[watchHistoryService] Failed to read session cache:", error);
    return;
  }

  if (!raw || typeof raw !== "string") {
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    devLogger.warn("[watchHistoryService] Failed to parse session cache:", error);
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[watchHistoryService] Failed to clear corrupt session cache:",
        cleanupError
      );
    }
    return;
  }

  if (!parsed || parsed.version !== SESSION_STORAGE_VERSION) {
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[watchHistoryService] Failed to clear outdated session cache:",
        cleanupError
      );
    }
    return;
  }

  const actors = parsed.actors;
  if (!actors || typeof actors !== "object") {
    return;
  }

  const now = Date.now();
  for (const [actor, entry] of Object.entries(actors)) {
    const actorKey = normalizeActorKey(actor);
    if (!actorKey) {
      continue;
    }
    const queue = getOrCreateQueue(actorKey);
    queue.items.clear();

    const items = Array.isArray(entry?.items) ? entry.items : [];
    for (const candidate of items) {
      const pointer = normalizePointerInput(candidate);
      if (!pointer) {
        continue;
      }
      const key = pointerKey(pointer);
      if (!key) {
        continue;
      }
      queue.items.set(key, {
        pointer,
        addedAt: now,
        updatedAt: now,
      });
    }

    if (
      typeof entry?.lastSnapshotReason === "string" &&
      entry.lastSnapshotReason
    ) {
      queue.lastSnapshotReason = entry.lastSnapshotReason;
    } else {
      queue.lastSnapshotReason = null;
    }

    // If there are items in the queue, schedule a sync
    if (queue.items.size > 0 && isFeatureEnabled(actorKey)) {
      scheduleRepublishForQueue(actorKey);
    }
  }
}

function ensureQueue(actorKey) {
  if (!actorKey) {
    return null;
  }
  if (!state.restored) {
    restoreQueueState();
  }
  return getOrCreateQueue(actorKey);
}

function persistQueueState() {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  const payload = { version: SESSION_STORAGE_VERSION, actors: {} };
  let hasEntries = false;

  for (const [actorKey, queue] of state.queues.entries()) {
    const items = collectQueueItems(actorKey);
    if (!items.length) {
      continue;
    }
    payload.actors[actorKey] = {
      items,
      lastSnapshotReason: queue.lastSnapshotReason,
    };
    hasEntries = true;
  }

  if (!hasEntries) {
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      devLogger.warn(
        "[watchHistoryService] Failed to clear empty session cache:",
        error
      );
    }
    return;
  }

  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    devLogger.warn("[watchHistoryService] Failed to persist session cache:", error);
  }
}

function resolveActorKey(actorInput) {
  const supplied =
    typeof actorInput === "string" && actorInput.trim()
      ? normalizeActorKey(actorInput)
      : "";
  if (supplied) {
    return supplied;
  }
  const logged = normalizeActorKey(nostrClient?.pubkey);
  if (logged) {
    return logged;
  }
  const session = normalizeActorKey(nostrClient?.sessionActor?.pubkey);
  if (session) {
    return session;
  }
  return "";
}

function collectQueueItems(actorKey) {
  const queue = state.queues.get(actorKey);
  if (!queue) {
    return [];
  }
  const items = [];
  for (const { pointer } of queue.items.values()) {
    const normalized = normalizePointerInput(pointer);
    if (normalized) {
      items.push(normalized);
    }
  }
  items.sort((a, b) => {
    const watchedA = Number.isFinite(a?.watchedAt) ? a.watchedAt : 0;
    const watchedB = Number.isFinite(b?.watchedAt) ? b.watchedAt : 0;
    if (watchedA !== watchedB) {
      return watchedB - watchedA;
    }
    const keyA = pointerKey(a);
    const keyB = pointerKey(b);
    return keyA.localeCompare(keyB);
  });
  return items.slice(0, WATCH_HISTORY_MAX_ITEMS);
}

function getCachedSnapshotItems(actorKey) {
  if (!actorKey) {
    return [];
  }

  const fingerprintEntry = state.fingerprintCache.get(actorKey);
  if (Array.isArray(fingerprintEntry?.items) && fingerprintEntry.items.length) {
    return Array.from(fingerprintEntry.items);
  }

  const clientCache =
    nostrClient &&
    nostrClient.watchHistoryCache instanceof Map &&
    nostrClient.watchHistoryCache.get(actorKey);
  if (Array.isArray(clientCache?.items) && clientCache.items.length) {
    return Array.from(clientCache.items);
  }

  if (typeof nostrClient?.getWatchHistoryStorage === "function") {
    try {
      const storage = nostrClient.getWatchHistoryStorage();
      const storedItems = storage?.actors?.[actorKey]?.items;
      if (Array.isArray(storedItems) && storedItems.length) {
        return Array.from(storedItems);
      }
    } catch (error) {
      devLogger.warn(
        "[watchHistoryService] Failed to read cached watch history items:",
        error,
      );
    }
  }

  return [];
}

function notifyQueueChange(actorKey) {
  emit("queue-changed", {
    actor: actorKey,
    items: collectQueueItems(actorKey),
  });
}

function clearQueue(actorKey) {
  const queue = state.queues.get(actorKey);
  if (!queue) {
    return;
  }
  queue.items.clear();
  queue.throttle.clear();
  queue.republishScheduled = false;
  persistQueueState();
  notifyQueueChange(actorKey);
}

function pruneQueueAfterSnapshot(actorKey, queue, keysToClear, snapshotStart) {
  if (!actorKey || !queue) {
    return;
  }

  const keySet = new Set(keysToClear || []);
  const normalizedStart = Number(snapshotStart);
  const cutoff = Number.isFinite(normalizedStart) ? normalizedStart : Date.now();

  let mutated = false;

  if (keySet.size > 0) {
    for (const key of keySet) {
      const entry = queue.items.get(key);
      if (!entry) {
        continue;
      }
      const updatedAt = Number(entry?.updatedAt);
      const addedAt = Number(entry?.addedAt);
      const referenceTime = Number.isFinite(updatedAt)
        ? updatedAt
        : Number.isFinite(addedAt)
          ? addedAt
          : 0;
      if (referenceTime > cutoff) {
        continue;
      }
      queue.items.delete(key);
      queue.throttle.delete(key);
      mutated = true;
    }
  }

  if (queue.republishScheduled) {
    queue.republishScheduled = false;
    mutated = true;
  }

  if (mutated) {
    persistQueueState();
    notifyQueueChange(actorKey);
  }
}

function resolveWatchedAt(...candidates) {
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) {
      continue;
    }
    let value = Math.floor(Number(candidate));
    if (value <= 0) {
      continue;
    }
    if (value > 10_000_000_000) {
      value = Math.floor(value / 1000);
    }
    if (value > 0) {
      return value;
    }
  }
  return Math.floor(Date.now() / 1000);
}

function scheduleRepublishForQueue(actorKey) {
  if (!isFeatureEnabled(actorKey)) {
    return;
  }
  const queue = state.queues.get(actorKey);
  if (!queue || !queue.items.size || queue.republishScheduled) {
    return;
  }

  const taskId = `watch-history-sync:${actorKey}`;
  queue.republishScheduled = true;

  nostrClient.scheduleWatchHistoryRepublish(
    taskId,
    async (attempt) => {
      const latestItems = collectQueueItems(actorKey);
      if (!latestItems.length) {
        queue.republishScheduled = false;
        persistQueueState();
        return {
          ok: true,
          skipped: true,
          actor: actorKey,
        };
      }

      const snapshotStartTime = Date.now();
      const keysToClear = new Set(
        latestItems
          .map((pointer) => pointerKey(pointer))
          .filter((keyValue) => typeof keyValue === "string" && keyValue)
      );

      const publishResult = await nostrClient.updateWatchHistoryList(
        latestItems,
        {
          actorPubkey: actorKey,
          attempt,
        }
      );

      if (publishResult?.ok) {
        pruneQueueAfterSnapshot(
          actorKey,
          queue,
          keysToClear,
          snapshotStartTime
        );
        await updateFingerprintCache(
          actorKey,
          publishResult.items || latestItems,
        );
      } else if (!publishResult?.retryable) {
        // If not retryable, we clear the scheduled flag to allow new attempts later
        queue.republishScheduled = false;
        persistQueueState();
      }
      return publishResult;
    },
    {
      onSchedule: ({ delay }) => {
        emit("republish-scheduled", {
          actor: actorKey,
          delayMs: Number.isFinite(delay) ? delay : null,
        });
      },
    }
  );
}

async function updateFingerprintCache(actorKey, items) {
  const ttl = Math.max(0, Number(WATCH_HISTORY_CACHE_TTL_MS) || 0);
  const fingerprint = await nostrClient.getWatchHistoryFingerprint(
    actorKey,
    items
  );
  const entry = state.fingerprintCache.get(actorKey) || {};
  const nextEntry = {
    ...entry,
    items: Array.isArray(items) ? items : [],
    fingerprint,
    expiresAt: Date.now() + ttl,
  };
  delete nextEntry.promise;
  state.fingerprintCache.set(actorKey, nextEntry);
  emit("fingerprint", { actor: actorKey, fingerprint, items: nextEntry.items });
  return fingerprint;
}

async function publishView(pointerInput, createdAt) {
  const recordOptions = {};
  if (Number.isFinite(createdAt)) {
    recordOptions.created_at = createdAt;
  }

  const viewResult = await nostrClient.recordVideoView(pointerInput, recordOptions);

  devLogger.info(
    "[watchHistoryService] Video view recorded. Preparing watch list update.",
    {
    pointer: pointerInput,
    createdAt,
    }
  );

  const pointer = normalizePointerInput(pointerInput);
  if (!pointer) {
    userLogger.warn(
      "[watchHistoryService] Skipping watch list update because pointer normalization failed.",
      { pointerInput }
    );
    return viewResult;
  }

  const actorCandidate =
    viewResult?.event?.pubkey ||
    nostrClient?.pubkey ||
    nostrClient?.sessionActor?.pubkey ||
    "";
  const actorKey = normalizeActorKey(actorCandidate);
  if (!actorKey) {
    userLogger.warn(
      "[watchHistoryService] Unable to resolve actor for watch list update.",
      { actorCandidate }
    );
    return viewResult;
  }

  const queue = ensureQueue(actorKey);
  if (!queue) {
    userLogger.warn(
      "[watchHistoryService] Failed to resolve queue for actor.",
      { actorKey }
    );
    return viewResult;
  }

  const remoteEnabled = isFeatureEnabled(actorKey);

  const normalizedPointer = normalizePointerInput(pointer);
  if (!normalizedPointer) {
    userLogger.warn(
      "[watchHistoryService] Pointer normalization failed during queue preparation.",
      { pointerInput }
    );
    return viewResult;
  }

  normalizedPointer.watchedAt = resolveWatchedAt(
    createdAt,
    viewResult?.event?.created_at
  );

  delete normalizedPointer.video;
  delete normalizedPointer.profile;
  delete normalizedPointer.resumeAt;
  delete normalizedPointer.completed;

  const key = pointerKey(normalizedPointer);
  devLogger.info(
    "[watchHistoryService] Watch list process triggered by video view.",
    {
    actor: actorKey,
    pointerKey: key,
    watchedAt: normalizedPointer.watchedAt,
    sessionEvent: normalizedPointer.session === true,
    remoteSyncEnabled: remoteEnabled,
    }
  );

  const normalizedLogged = normalizeActorKey(nostrClient?.pubkey);
  const normalizedEventActor = normalizeActorKey(
    viewResult?.event?.pubkey || actorCandidate
  );
  if (normalizedEventActor && normalizedEventActor !== normalizedLogged) {
    normalizedPointer.session = true;
  }

  if (!key) {
    userLogger.warn(
      "[watchHistoryService] Pointer key generation failed. Skipping queue update.",
      { pointer: normalizedPointer }
    );
    return viewResult;
  }

  const now = Date.now();
  const existing = queue.items.get(key);
  const lastSeen = queue.throttle.get(key) || 0;
  const throttled = !existing && now - lastSeen < POINTER_THROTTLE_MS;

  if (existing) {
    const currentWatched = Number.isFinite(existing.pointer?.watchedAt)
      ? existing.pointer.watchedAt
      : 0;
    if (
      Number.isFinite(normalizedPointer.watchedAt) &&
      normalizedPointer.watchedAt > currentWatched
    ) {
      existing.pointer.watchedAt = normalizedPointer.watchedAt;
    }
    if (normalizedPointer.session === true) {
      existing.pointer.session = true;
    }
    existing.updatedAt = now;
    queue.items.set(key, existing);
    queue.throttle.set(key, now);
    persistQueueState();
    notifyQueueChange(actorKey);
    devLogger.debug(
      "[watchHistoryService] Updated existing watch list entry.",
      {
      actor: actorKey,
      pointerKey: key,
      watchedAt: existing.pointer.watchedAt,
      }
    );
    return viewResult;
  }

  if (throttled) {
    queue.throttle.set(key, now);
    devLogger.debug(
    `[watchHistoryService] Throttled pointer ${key} for actor ${actorKey}.`
    );
    return viewResult;
  }

  queue.items.set(key, {
    pointer: normalizedPointer,
    addedAt: now,
    updatedAt: now,
  });
  queue.throttle.set(key, now);
  persistQueueState();
  notifyQueueChange(actorKey);

  devLogger.info(
    "[watchHistoryService] Added pointer to pending watch list snapshot queue.",
    {
    actor: actorKey,
    pointerKey: key,
    queueSize: queue.items.size,
    }
  );

  if (!remoteEnabled) {
    devLogger.debug(
      "[watchHistoryService] Watch history sync unavailable for this actor; retaining pointer in local session queue only.",
      {
        actor: actorKey,
        pointerKey: key,
        watchedAt: normalizedPointer.watchedAt,
      }
    );
  } else {
    // Automatically schedule a republish if enabled
    scheduleRepublishForQueue(actorKey);
  }

  return viewResult;
}

async function snapshot(items, options = {}) {
  const reason = typeof options.reason === "string" ? options.reason : "manual";
  const actorKey = resolveActorKey(options.actor);
  if (!actorKey) {
    return { ok: false, error: "missing-actor" };
  }

  if (!isFeatureEnabled(actorKey)) {
    devLogger.debug(
      "[watchHistoryService] Snapshot skipped because watch history sync is unavailable for this actor.",
      {
      actor: actorKey,
      requestedItems: Array.isArray(items) ? items.length : 0,
      reason,
      }
    );
    return { ok: true, skipped: true, reason: "feature-disabled" };
  }

  if (state.inflightSnapshots.has(actorKey)) {
    return state.inflightSnapshots.get(actorKey);
  }

  let payloadItems = [];
  if (Array.isArray(items) && items.length) {
    payloadItems = items
      .map((item) => normalizePointerInput(item))
      .filter(Boolean);
  } else {
    payloadItems = collectQueueItems(actorKey);
  }

  if (!payloadItems.length) {
    const result = { ok: true, empty: true, actor: actorKey };
    emit("snapshot-empty", result);
    return result;
  }

  const queue = ensureQueue(actorKey);
  const queuePayloadKeys =
    !items && queue && payloadItems.length
      ? new Set(
          payloadItems
            .map((pointer) => pointerKey(pointer))
            .filter((keyValue) => typeof keyValue === "string" && keyValue)
        )
      : new Set();

  if (!items) {
    const cachedItems = getCachedSnapshotItems(actorKey);
    if (cachedItems.length) {
      payloadItems = [...payloadItems, ...cachedItems];
    }
  }

  devLogger.info(
    "[watchHistoryService] Initiating watch list snapshot publish.",
    {
      actor: actorKey,
    reason,
    itemCount: payloadItems.length,
    queued: queue?.items?.size ?? 0,
    }
  );

  const run = (async () => {
    const snapshotStartTime = Date.now();
    emit("snapshot-start", { actor: actorKey, reason, items: payloadItems });
    const publishResult = await nostrClient.updateWatchHistoryList(
      payloadItems,
      {
        actorPubkey: actorKey,
      }
    );

    devLogger.debug(
      "[watchHistoryService] Watch list snapshot publish completed.",
      {
      actor: actorKey,
      reason,
      success: !!publishResult?.ok,
      retryable: !!publishResult?.retryable,
      }
    );

    if (!publishResult?.ok) {
      if (publishResult?.retryable) {
        if (queue) {
          queue.lastSnapshotReason = reason;
          queue.republishScheduled = false;
          persistQueueState();
          scheduleRepublishForQueue(actorKey);
        }
      }
      const error = new Error("watch-history-snapshot-failed");
      error.result = publishResult;
      emit("snapshot-error", { actor: actorKey, reason, error });
      throw error;
    }

    if (publishResult?.ok) {
      if (!items) {
        pruneQueueAfterSnapshot(actorKey, queue, queuePayloadKeys, snapshotStartTime);
      } else if (queue) {
        queue.republishScheduled = false;
        persistQueueState();
      }
    }

    await updateFingerprintCache(actorKey, publishResult.items || payloadItems);
    emit("snapshot-complete", { actor: actorKey, reason, result: publishResult });
    devLogger.debug(
      "[watchHistoryService] Watch list snapshot processed and fingerprint cache updated.",
      {
      actor: actorKey,
      reason,
      fingerprintUpdated: true,
      }
    );
    return publishResult;
  })()
    .catch((error) => {
      devLogger.warn("[watchHistoryService] Snapshot failed:", error);
      throw error;
    })
    .finally(() => {
      state.inflightSnapshots.delete(actorKey);
    });

  state.inflightSnapshots.set(actorKey, run);
  return run;
}

function scheduleWatchHistoryRefresh(actorKey, cacheEntry = {}) {
  if (!actorKey) {
    return Promise.resolve([]);
  }

  if (cacheEntry && typeof cacheEntry === "object" && cacheEntry.promise) {
    return cacheEntry.promise;
  }

  const promise = (async () => {
    const permissionResult = await ensureWatchHistoryExtensionPermissions(
      actorKey,
    );
    if (!permissionResult.ok) {
      throw permissionResult.error;
    }
    return nostrClient.resolveWatchHistory(actorKey, { forceRefresh: true });
  })()
    .then((resolvedItems) => updateFingerprintCache(actorKey, resolvedItems))
    .then(() => {
      const latest = state.fingerprintCache.get(actorKey);
      return latest?.items || [];
    })
    .catch((error) => {
      devLogger.warn("[watchHistoryService] Failed to load watch history:", error);
      throw error;
    })
    .finally(() => {
      const entry = state.fingerprintCache.get(actorKey);
      if (entry) {
        delete entry.promise;
      }
    });

  devLogger.info("[watchHistoryService] Triggered nostr watch list refresh.", {
    actor: actorKey,
    });

  const baseEntry = cacheEntry && typeof cacheEntry === "object" ? cacheEntry : {};
  state.fingerprintCache.set(actorKey, {
    ...baseEntry,
    promise,
  });

  return promise;
}

async function loadLatest(actorInput, options = {}) {
  const actorKey = resolveActorKey(actorInput);
  if (!actorKey) {
    return [];
  }

  const normalizedOptions =
    options && typeof options === "object" ? options : {};
  // Only callers that can react to a later fingerprint update should opt into
  // stale cache reads; everyone else waits for the fresh list so they do not
  // miss entries.
  const allowStale = normalizedOptions.allowStale === true;

  if (!isFeatureEnabled(actorKey)) {
    if (!state.restored) {
      restoreQueueState();
    }
    const items = collectQueueItems(actorKey);
    devLogger.debug(
      "[watchHistoryService] loadLatest returning local-only watch history queue.",
      {
      actor: actorKey,
      itemCount: items.length,
      }
    );
    return items;
  }

  const now = Date.now();
  const cacheEntry = state.fingerprintCache.get(actorKey);
  devLogger.info(
    "[watchHistoryService] loadLatest invoked.",
    {
    actor: actorKey,
    cacheHasItems: Array.isArray(cacheEntry?.items),
    cacheExpiresAt: cacheEntry?.expiresAt || null,
    }
  );
  const hasCachedItems = Array.isArray(cacheEntry?.items);
  const cacheIsFresh =
    hasCachedItems &&
    cacheEntry?.expiresAt &&
    cacheEntry.expiresAt > now;

  if (cacheIsFresh) {
    devLogger.debug(
      "[watchHistoryService] Returning cached watch list items.",
      {
      actor: actorKey,
      itemCount: cacheEntry.items.length,
      }
    );
    return cacheEntry.items;
  }

  if (cacheEntry?.promise) {
    devLogger.debug(
      "[watchHistoryService] Awaiting in-flight watch list refresh.",
      {
      actor: actorKey,
      }
    );
    if (allowStale && hasCachedItems) {
      devLogger.debug(
        "[watchHistoryService] Returning stale watch list items while refresh completes.",
        {
        actor: actorKey,
        itemCount: cacheEntry.items.length,
        }
      );
      return cacheEntry.items;
    }
    return cacheEntry.promise;
  }

  if (!allowStale || !hasCachedItems) {
    return scheduleWatchHistoryRefresh(actorKey, cacheEntry);
  }

  const refreshPromise = scheduleWatchHistoryRefresh(actorKey, cacheEntry);
  refreshPromise.catch(() => {});

  devLogger.info(
    "[watchHistoryService] Returning stale watch list items while refresh is pending.",
    {
    actor: actorKey,
    itemCount: cacheEntry?.items?.length || 0,
    }
  );

  return cacheEntry.items || [];
}

async function getFingerprint(actorInput) {
  const actorKey = resolveActorKey(actorInput);
  if (!actorKey) {
    return "";
  }
  if (!isFeatureEnabled(actorKey)) {
    return "";
  }
  const now = Date.now();
  const cacheEntry = state.fingerprintCache.get(actorKey);
  if (
    cacheEntry?.fingerprint &&
    cacheEntry.expiresAt &&
    cacheEntry.expiresAt > now
  ) {
    return cacheEntry.fingerprint;
  }
  const fingerprint = await nostrClient.getWatchHistoryFingerprint(actorKey);
  const ttl = Math.max(0, Number(WATCH_HISTORY_CACHE_TTL_MS) || 0);
  const nextEntry = {
    ...(cacheEntry || {}),
    fingerprint,
    expiresAt: now + ttl,
  };
  state.fingerprintCache.set(actorKey, nextEntry);
  emit("fingerprint", { actor: actorKey, fingerprint });
  return fingerprint;
}

function resetProgress(actorInput) {
  const actorKey = normalizeActorKey(actorInput);
  if (actorKey) {
    state.queues.delete(actorKey);
    state.fingerprintCache.delete(actorKey);
    state.inflightSnapshots.delete(actorKey);
    persistQueueState();
    notifyQueueChange(actorKey);
    return;
  }
  state.queues.clear();
  state.fingerprintCache.clear();
  state.inflightSnapshots.clear();
  persistQueueState();
  emit("queue-changed", { actor: null, items: [] });
}

function getQueuedPointers(actorInput) {
  const actorKey = normalizeActorKey(actorInput);
  if (!actorKey) {
    return [];
  }
  if (!state.restored) {
    restoreQueueState();
  }
  return collectQueueItems(actorKey);
}

function getAllQueues() {
  if (!state.restored) {
    restoreQueueState();
  }
  const summary = {};
  for (const actorKey of state.queues.keys()) {
    const items = collectQueueItems(actorKey);
    if (items.length) {
      summary[actorKey] = items;
    }
  }
  return summary;
}

const watchHistoryService = {
  isEnabled: isFeatureEnabled,
  supportsLocalHistory,
  isLocalOnly,
  publishView,
  snapshot,
  loadLatest,
  getFingerprint,
  resetProgress,
  getQueuedPointers,
  getAllQueues,
  subscribe,
};

if (typeof window !== "undefined") {
  window.bitvid = window.bitvid || {};
  window.bitvid.watchHistory = watchHistoryService;
}

export { watchHistoryService };
export default watchHistoryService;
