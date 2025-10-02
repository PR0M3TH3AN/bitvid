// js/watchHistoryService.js

import {
  nostrClient,
  normalizePointerInput,
  pointerKey,
  normalizeActorKey,
} from "./nostr.js";
import {
  WATCH_HISTORY_CACHE_TTL_MS,
  WATCH_HISTORY_MAX_ITEMS,
} from "./config.js";
import {
  FEATURE_WATCH_HISTORY_V2,
  getWatchHistoryV2Enabled,
} from "./constants.js";
import { isDevMode } from "./config.js";

const SESSION_STORAGE_KEY = "bitvid:watch-history:session:v1";
const SESSION_STORAGE_VERSION = 1;
const POINTER_THROTTLE_MS = 60 * 1000;
const METADATA_STORAGE_KEY = "bitvid:watch-history:metadata-cache:v1";
const METADATA_STORAGE_VERSION = 1;
const METADATA_PREFERENCE_KEY = "bitvid:watch-history:metadata:store-locally";

const state = {
  restored: false,
  queues: new Map(),
  inflightSnapshots: new Map(),
  fingerprintCache: new Map(),
  listeners: new Map(),
  metadata: {
    restored: false,
    cache: new Map(),
    preference: null,
  },
};

function isFeatureEnabled() {
  try {
    if (typeof getWatchHistoryV2Enabled === "function") {
      return getWatchHistoryV2Enabled();
    }
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryService] Failed to read FEATURE_WATCH_HISTORY_V2 flag:",
        error,
      );
    }
  }
  return FEATURE_WATCH_HISTORY_V2 === true;
}

function getSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch (error) {
    if (isDevMode) {
      console.warn("[watchHistoryService] sessionStorage unavailable:", error);
    }
  }
  return null;
}

function getLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    if (isDevMode) {
      console.warn("[watchHistoryService] localStorage unavailable:", error);
    }
  }
  return null;
}

function ensureMetadataPreference() {
  if (typeof state.metadata.preference === "boolean") {
    return state.metadata.preference;
  }
  const storage = getLocalStorage();
  if (!storage) {
    state.metadata.preference = true;
    return state.metadata.preference;
  }
  try {
    const stored = storage.getItem(METADATA_PREFERENCE_KEY);
    if (stored === null) {
      state.metadata.preference = true;
    } else {
      state.metadata.preference = stored === "true";
    }
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryService] Failed to read metadata preference:",
        error,
      );
    }
    state.metadata.preference = true;
  }
  return state.metadata.preference;
}

function persistMetadataPreference(value) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    if (value === true) {
      storage.setItem(METADATA_PREFERENCE_KEY, "true");
    } else {
      storage.setItem(METADATA_PREFERENCE_KEY, "false");
    }
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryService] Failed to persist metadata preference:",
        error,
      );
    }
  }
}

function sanitizeVideoForStorage(video) {
  if (!video || typeof video !== "object") {
    return null;
  }
  const createdAt = Number.isFinite(video.created_at)
    ? Math.floor(Number(video.created_at))
    : null;
  return {
    id: typeof video.id === "string" ? video.id : "",
    title: typeof video.title === "string" ? video.title : "",
    thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
    url: typeof video.url === "string" ? video.url : "",
    magnet: typeof video.magnet === "string" ? video.magnet : "",
    pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
    created_at: createdAt,
    infoHash: typeof video.infoHash === "string" ? video.infoHash : "",
    mode: typeof video.mode === "string" ? video.mode : "",
    isPrivate: video?.isPrivate === true,
    description:
      typeof video.description === "string" ? video.description : "",
  };
}

function sanitizeProfileForStorage(profile) {
  if (!profile || typeof profile !== "object") {
    return null;
  }
  return {
    pubkey: typeof profile.pubkey === "string" ? profile.pubkey : "",
    name: typeof profile.name === "string" ? profile.name : "",
    display_name:
      typeof profile.display_name === "string" ? profile.display_name : "",
    picture: typeof profile.picture === "string" ? profile.picture : "",
    nip05: typeof profile.nip05 === "string" ? profile.nip05 : "",
  };
}

function restoreMetadataCache() {
  if (state.metadata.restored) {
    return;
  }
  state.metadata.restored = true;

  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  let raw = null;
  try {
    raw = storage.getItem(METADATA_STORAGE_KEY);
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryService] Failed to read metadata cache:",
        error,
      );
    }
    return;
  }

  if (!raw || typeof raw !== "string") {
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryService] Failed to parse metadata cache:",
        error,
      );
    }
    try {
      storage.removeItem(METADATA_STORAGE_KEY);
    } catch (cleanupError) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryService] Failed to clear corrupt metadata cache:",
          cleanupError,
        );
      }
    }
    return;
  }

  if (!parsed || parsed.version !== METADATA_STORAGE_VERSION) {
    try {
      storage.removeItem(METADATA_STORAGE_KEY);
    } catch (cleanupError) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryService] Failed to clear outdated metadata cache:",
          cleanupError,
        );
      }
    }
    return;
  }

  state.metadata.cache.clear();
  const entries = parsed.entries && typeof parsed.entries === "object"
    ? parsed.entries
    : {};
  for (const [key, entry] of Object.entries(entries)) {
    if (typeof key !== "string" || !key) {
      continue;
    }
    const sanitizedVideo = sanitizeVideoForStorage(entry?.video);
    const sanitizedProfile = sanitizeProfileForStorage(entry?.profile);
    state.metadata.cache.set(key, {
      video: sanitizedVideo,
      profile: sanitizedProfile,
      storedAt: Number.isFinite(entry?.storedAt) ? entry.storedAt : Date.now(),
    });
  }
}

function persistMetadataCache() {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  const shouldStore = shouldStoreMetadataLocally();
  if (!shouldStore || !state.metadata.cache.size) {
    try {
      storage.removeItem(METADATA_STORAGE_KEY);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryService] Failed to clear metadata cache:",
          error,
        );
      }
    }
    return;
  }

  const payload = { version: METADATA_STORAGE_VERSION, entries: {} };
  for (const [key, entry] of state.metadata.cache.entries()) {
    payload.entries[key] = {
      video: sanitizeVideoForStorage(entry?.video) || null,
      profile: sanitizeProfileForStorage(entry?.profile) || null,
      storedAt: Number.isFinite(entry?.storedAt) ? entry.storedAt : Date.now(),
    };
  }
  try {
    storage.setItem(METADATA_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[watchHistoryService] Failed to persist metadata cache:",
        error,
      );
    }
  }
}

function shouldStoreMetadataLocally() {
  return ensureMetadataPreference() === true;
}

function setMetadataPreference(enabled) {
  const normalized = enabled === false ? false : true;
  const previous = ensureMetadataPreference();
  state.metadata.preference = normalized;
  persistMetadataPreference(normalized);
  if (!normalized) {
    state.metadata.cache.clear();
    persistMetadataCache();
  } else {
    persistMetadataCache();
  }
  if (previous !== normalized) {
    emit("metadata-preference", { enabled: normalized });
  }
}

function getMetadataPreference() {
  return ensureMetadataPreference();
}

function getLocalMetadata(pointerKeyValue) {
  restoreMetadataCache();
  const key = typeof pointerKeyValue === "string" ? pointerKeyValue : "";
  if (!key) {
    return null;
  }
  const stored = state.metadata.cache.get(key);
  if (!stored) {
    return null;
  }
  return {
    video: stored.video ? { ...stored.video } : null,
    profile: stored.profile ? { ...stored.profile } : null,
    storedAt: stored.storedAt,
  };
}

function setLocalMetadata(pointerKeyValue, metadata) {
  if (!shouldStoreMetadataLocally()) {
    return;
  }
  const key = typeof pointerKeyValue === "string" ? pointerKeyValue : "";
  if (!key) {
    return;
  }
  restoreMetadataCache();
  if (!metadata || typeof metadata !== "object") {
    state.metadata.cache.delete(key);
    persistMetadataCache();
    return;
  }
  const video = sanitizeVideoForStorage(metadata.video);
  const profile = sanitizeProfileForStorage(metadata.profile);
  state.metadata.cache.set(key, {
    video,
    profile,
    storedAt: Date.now(),
  });
  persistMetadataCache();
}

function removeLocalMetadata(pointerKeyValue) {
  const key = typeof pointerKeyValue === "string" ? pointerKeyValue : "";
  if (!key) {
    return;
  }
  restoreMetadataCache();
  if (state.metadata.cache.delete(key)) {
    persistMetadataCache();
  }
}

function clearLocalMetadata() {
  restoreMetadataCache();
  if (!state.metadata.cache.size) {
    return;
  }
  state.metadata.cache.clear();
  persistMetadataCache();
}

function emit(eventName, payload) {
  const listeners = state.listeners.get(eventName);
  if (listeners && listeners.size) {
    for (const callback of Array.from(listeners)) {
      try {
        callback(payload);
      } catch (error) {
        if (isDevMode) {
          console.warn(
            `[watchHistoryService] Listener for ${eventName} failed:`,
            error
          );
        }
      }
    }
  }

  const wildcard = state.listeners.get("*");
  if (wildcard && wildcard.size) {
    for (const callback of Array.from(wildcard)) {
      try {
        callback({ event: eventName, payload });
      } catch (error) {
        if (isDevMode) {
          console.warn(
            `[watchHistoryService] Wildcard listener error for ${eventName}:`,
            error
          );
        }
      }
    }
  }

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      const detail = { event: eventName, payload };
      const evt = new CustomEvent("bitvid:watchHistory", { detail });
      window.dispatchEvent(evt);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          `[watchHistoryService] Failed to dispatch window event for ${eventName}:`,
          error
        );
      }
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
      pendingSnapshotId: null,
      lastSnapshotReason: null,
      republishScheduled: false,
    };
    state.queues.set(actorKey, queue);
  }
  return queue;
}

function restoreQueueState() {
  if (!isFeatureEnabled()) {
    return;
  }
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
    if (isDevMode) {
      console.warn("[watchHistoryService] Failed to read session cache:", error);
    }
    return;
  }

  if (!raw || typeof raw !== "string") {
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (isDevMode) {
      console.warn("[watchHistoryService] Failed to parse session cache:", error);
    }
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryService] Failed to clear corrupt session cache:",
          cleanupError
        );
      }
    }
    return;
  }

  if (!parsed || parsed.version !== SESSION_STORAGE_VERSION) {
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch (cleanupError) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryService] Failed to clear outdated session cache:",
          cleanupError
        );
      }
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

    if (typeof entry?.pendingSnapshotId === "string" && entry.pendingSnapshotId) {
      queue.pendingSnapshotId = entry.pendingSnapshotId;
    } else {
      queue.pendingSnapshotId = null;
    }
    if (
      typeof entry?.lastSnapshotReason === "string" &&
      entry.lastSnapshotReason
    ) {
      queue.lastSnapshotReason = entry.lastSnapshotReason;
    } else {
      queue.lastSnapshotReason = null;
    }

    if (queue.pendingSnapshotId && isFeatureEnabled()) {
      scheduleRepublishForQueue(actorKey);
    }
  }
}

function ensureQueue(actorKey) {
  if (!isFeatureEnabled()) {
    return null;
  }
  if (!actorKey) {
    return null;
  }
  if (!state.restored) {
    restoreQueueState();
  }
  return getOrCreateQueue(actorKey);
}

function persistQueueState() {
  if (!isFeatureEnabled()) {
    return;
  }
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  const payload = { version: SESSION_STORAGE_VERSION, actors: {} };
  let hasEntries = false;

  for (const [actorKey, queue] of state.queues.entries()) {
    const items = collectQueueItems(actorKey);
    if (!items.length && !queue.pendingSnapshotId) {
      continue;
    }
    payload.actors[actorKey] = {
      items,
      pendingSnapshotId: queue.pendingSnapshotId,
      lastSnapshotReason: queue.lastSnapshotReason,
    };
    hasEntries = true;
  }

  if (!hasEntries) {
    try {
      storage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[watchHistoryService] Failed to clear empty session cache:",
          error
        );
      }
    }
    return;
  }

  try {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    if (isDevMode) {
      console.warn("[watchHistoryService] Failed to persist session cache:", error);
    }
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
  if (!isFeatureEnabled()) {
    return [];
  }
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

function notifyQueueChange(actorKey) {
  if (!isFeatureEnabled()) {
    return;
  }
  emit("queue-changed", {
    actor: actorKey,
    items: collectQueueItems(actorKey),
  });
}

function clearQueue(actorKey) {
  if (!isFeatureEnabled()) {
    return;
  }
  const queue = state.queues.get(actorKey);
  if (!queue) {
    return;
  }
  queue.items.clear();
  queue.throttle.clear();
  queue.pendingSnapshotId = null;
  queue.republishScheduled = false;
  persistQueueState();
  notifyQueueChange(actorKey);
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
  if (!isFeatureEnabled()) {
    return;
  }
  const queue = state.queues.get(actorKey);
  if (!queue || !queue.pendingSnapshotId || queue.republishScheduled) {
    return;
  }
  const snapshotId = queue.pendingSnapshotId;
  queue.republishScheduled = true;
  nostrClient.scheduleWatchHistoryRepublish(
    snapshotId,
    async (attempt) => {
      const latestItems = collectQueueItems(actorKey);
      if (!latestItems.length) {
        queue.pendingSnapshotId = null;
        queue.republishScheduled = false;
        persistQueueState();
        return {
          ok: true,
          skipped: true,
          actor: actorKey,
          snapshotId,
        };
      }
      const publishResult = await nostrClient.publishWatchHistorySnapshot(
        latestItems,
        {
          actorPubkey: actorKey,
          snapshotId,
          attempt,
          source: `${queue.lastSnapshotReason || "session"}-retry`,
        }
      );
      if (publishResult?.snapshotId) {
        queue.pendingSnapshotId = publishResult.snapshotId;
      }
      if (publishResult?.ok) {
        queue.pendingSnapshotId = null;
        queue.republishScheduled = false;
        queue.items.clear();
        queue.throttle.clear();
        await updateFingerprintCache(
          actorKey,
          publishResult.items || latestItems,
        );
        persistQueueState();
        notifyQueueChange(actorKey);
      } else if (!publishResult?.retryable) {
        queue.pendingSnapshotId =
          publishResult?.snapshotId || queue.pendingSnapshotId;
        queue.republishScheduled = false;
        persistQueueState();
      }
      return publishResult;
    },
    {
      onSchedule: ({ delay }) => {
        emit("republish-scheduled", {
          actor: actorKey,
          snapshotId,
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

async function publishView(pointerInput, createdAt, metadata = {}) {
  const recordOptions = {};
  if (Number.isFinite(createdAt)) {
    recordOptions.created_at = createdAt;
  }
  if (metadata && typeof metadata === "object") {
    if (Array.isArray(metadata.additionalTags)) {
      recordOptions.additionalTags = metadata.additionalTags;
    }
    if (Array.isArray(metadata.relays)) {
      recordOptions.relays = metadata.relays;
    }
    if (metadata.content != null) {
      recordOptions.content = metadata.content;
    }
  }

  const viewResult = await nostrClient.recordVideoView(pointerInput, recordOptions);

  if (!isFeatureEnabled()) {
    return viewResult;
  }

  const pointer = normalizePointerInput(pointerInput);
  if (!pointer) {
    return viewResult;
  }

  const actorCandidate =
    (typeof metadata.actor === "string" && metadata.actor.trim()) ||
    viewResult?.event?.pubkey ||
    nostrClient?.pubkey ||
    nostrClient?.sessionActor?.pubkey ||
    "";
  const actorKey = normalizeActorKey(actorCandidate);
  if (!actorKey) {
    return viewResult;
  }

  const queue = ensureQueue(actorKey);
  if (!queue) {
    return viewResult;
  }

  const normalizedPointer = normalizePointerInput(pointer);
  if (!normalizedPointer) {
    return viewResult;
  }

  normalizedPointer.watchedAt = resolveWatchedAt(
    createdAt,
    viewResult?.event?.created_at
  );

  const normalizedLogged = normalizeActorKey(nostrClient?.pubkey);
  const normalizedEventActor = normalizeActorKey(
    viewResult?.event?.pubkey || actorCandidate
  );
  if (normalizedEventActor && normalizedEventActor !== normalizedLogged) {
    normalizedPointer.session = true;
  }

  const key = pointerKey(normalizedPointer);
  if (!key) {
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
    return viewResult;
  }

  if (throttled) {
    queue.throttle.set(key, now);
    if (isDevMode) {
      console.info(
        `[watchHistoryService] Throttled pointer ${key} for actor ${actorKey}.`
      );
    }
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

  return viewResult;
}

async function snapshot(items, options = {}) {
  if (!isFeatureEnabled()) {
    return { ok: true, skipped: true, reason: "feature-disabled" };
  }
  const reason = typeof options.reason === "string" ? options.reason : "manual";
  const actorKey = resolveActorKey(options.actor);
  if (!actorKey) {
    return { ok: false, error: "missing-actor" };
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

  const run = (async () => {
    emit("snapshot-start", { actor: actorKey, reason, items: payloadItems });
    const publishResult = await nostrClient.publishWatchHistorySnapshot(
      payloadItems,
      {
        actorPubkey: actorKey,
        source: reason,
      }
    );

    if (!publishResult?.ok) {
      if (publishResult?.retryable && publishResult?.snapshotId) {
        if (queue) {
          queue.pendingSnapshotId = publishResult.snapshotId;
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

    if (!items) {
      clearQueue(actorKey);
    } else if (queue) {
      queue.pendingSnapshotId = null;
      queue.republishScheduled = false;
      persistQueueState();
    }

    await updateFingerprintCache(actorKey, publishResult.items || payloadItems);
    emit("snapshot-complete", { actor: actorKey, reason, result: publishResult });
    return publishResult;
  })()
    .catch((error) => {
      if (isDevMode) {
        console.warn("[watchHistoryService] Snapshot failed:", error);
      }
      throw error;
    })
    .finally(() => {
      state.inflightSnapshots.delete(actorKey);
    });

  state.inflightSnapshots.set(actorKey, run);
  return run;
}

async function loadLatest(actorInput) {
  if (!isFeatureEnabled()) {
    return [];
  }
  const actorKey = resolveActorKey(actorInput);
  if (!actorKey) {
    return [];
  }

  const now = Date.now();
  const cacheEntry = state.fingerprintCache.get(actorKey);
  if (
    cacheEntry?.items &&
    cacheEntry.expiresAt &&
    cacheEntry.expiresAt > now &&
    Array.isArray(cacheEntry.items)
  ) {
    return cacheEntry.items;
  }

  if (cacheEntry?.promise) {
    return cacheEntry.promise;
  }

  const promise = nostrClient
    .resolveWatchHistory(actorKey, { forceRefresh: true })
    .then((resolvedItems) => updateFingerprintCache(actorKey, resolvedItems))
    .then(() => {
      const latest = state.fingerprintCache.get(actorKey);
      return latest?.items || [];
    })
    .catch((error) => {
      if (isDevMode) {
        console.warn("[watchHistoryService] Failed to load watch history:", error);
      }
      throw error;
    })
    .finally(() => {
      const entry = state.fingerprintCache.get(actorKey);
      if (entry) {
        delete entry.promise;
      }
    });

  state.fingerprintCache.set(actorKey, {
    ...(cacheEntry || {}),
    promise,
  });

  return promise;
}

async function getFingerprint(actorInput) {
  if (!isFeatureEnabled()) {
    return "";
  }
  const actorKey = resolveActorKey(actorInput);
  if (!actorKey) {
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
  if (!isFeatureEnabled()) {
    return;
  }
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
  if (!isFeatureEnabled()) {
    return [];
  }
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
  if (!isFeatureEnabled()) {
    return {};
  }
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

function getSettings() {
  const preference = getMetadataPreference();
  return {
    metadata: {
      preference,
      storeLocally: preference === true,
      cacheSize: state.metadata.cache.size,
    },
  };
}

const watchHistoryService = {
  isEnabled: isFeatureEnabled,
  publishView,
  snapshot,
  loadLatest,
  getFingerprint,
  resetProgress,
  getQueuedPointers,
  getAllQueues,
  getMetadataPreference,
  setMetadataPreference,
  shouldStoreMetadata: shouldStoreMetadataLocally,
  getLocalMetadata,
  setLocalMetadata,
  removeLocalMetadata,
  clearLocalMetadata,
  getSettings,
  subscribe,
};

if (typeof window !== "undefined") {
  window.bitvid = window.bitvid || {};
  window.bitvid.watchHistory = watchHistoryService;
}

export { watchHistoryService };
export default watchHistoryService;
