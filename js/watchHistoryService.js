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
import { getApplication } from "./applicationContext.js";

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

function resolveFlagEnabled() {
  try {
    if (typeof getWatchHistoryV2Enabled === "function") {
      return getWatchHistoryV2Enabled() === true;
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
          if (isDevMode) {
            console.warn(
              "[watchHistoryService] Failed to normalize app login pubkey:",
              error
            );
          }
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
    legacyInfoHash:
      typeof video.legacyInfoHash === "string" ? video.legacyInfoHash : "",
    mode: typeof video.mode === "string" ? video.mode : "",
    isPrivate: video?.isPrivate === true,
    description:
      typeof video.description === "string" ? video.description : "",
  };
}

function sanitizeVideoForHistory(video) {
  const sanitized = sanitizeVideoForStorage(video);
  if (!sanitized) {
    return null;
  }

  return {
    id: sanitized.id,
    title: sanitized.title,
    thumbnail: sanitized.thumbnail,
    pubkey: sanitized.pubkey,
    created_at: sanitized.created_at,
    url: sanitized.url,
    magnet: sanitized.magnet,
    infoHash: sanitized.infoHash,
    legacyInfoHash:
      typeof video?.legacyInfoHash === "string"
        ? video.legacyInfoHash
        : typeof sanitized.legacyInfoHash === "string"
        ? sanitized.legacyInfoHash
        : "",
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

function sanitizePointerMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const pointerMetadata = {};
  const video = sanitizeVideoForHistory(metadata.video);
  if (video) {
    pointerMetadata.video = video;
  }

  const profile = sanitizeProfileForStorage(metadata.profile);
  if (profile) {
    pointerMetadata.profile = profile;
  }

  const resumeCandidates = [
    metadata.resumeAt,
    metadata.resume,
    metadata.resumeSeconds,
  ];
  for (const candidate of resumeCandidates) {
    if (Number.isFinite(candidate)) {
      pointerMetadata.resumeAt = Math.max(0, Math.floor(candidate));
      break;
    }
  }

  if (metadata.completed === true) {
    pointerMetadata.completed = true;
  }

  return Object.keys(pointerMetadata).length ? pointerMetadata : null;
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

    if (queue.pendingSnapshotId && isFeatureEnabled(actorKey)) {
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
  if (!isFeatureEnabled(actorKey)) {
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

  console.info(
    "[watchHistoryService] Video view recorded. Preparing watch list update.",
    {
      pointer: pointerInput,
      createdAt,
      hasMetadata: !!metadata,
    }
  );

  const pointer = normalizePointerInput(pointerInput);
  if (!pointer) {
    console.warn(
      "[watchHistoryService] Skipping watch list update because pointer normalization failed.",
      { pointerInput }
    );
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
    console.warn(
      "[watchHistoryService] Unable to resolve actor for watch list update.",
      { actorCandidate }
    );
    return viewResult;
  }

  const queue = ensureQueue(actorKey);
  if (!queue) {
    console.warn(
      "[watchHistoryService] Failed to resolve queue for actor.",
      { actorKey }
    );
    return viewResult;
  }

  const remoteEnabled = isFeatureEnabled(actorKey);

  const normalizedPointer = normalizePointerInput(pointer);
  if (!normalizedPointer) {
    console.warn(
      "[watchHistoryService] Pointer normalization failed during queue preparation.",
      { pointerInput }
    );
    return viewResult;
  }

  normalizedPointer.watchedAt = resolveWatchedAt(
    createdAt,
    viewResult?.event?.created_at
  );

  const pointerMetadata = sanitizePointerMetadata(metadata);
  if (pointerMetadata) {
    const existingMetadata =
      typeof normalizedPointer.metadata === "object"
        ? normalizedPointer.metadata
        : {};
    normalizedPointer.metadata = { ...existingMetadata, ...pointerMetadata };
    if (pointerMetadata.video) {
      normalizedPointer.video = pointerMetadata.video;
    }
    if (pointerMetadata.profile) {
      normalizedPointer.profile = pointerMetadata.profile;
    }
    if (
      Number.isFinite(pointerMetadata.resumeAt) &&
      !Number.isFinite(normalizedPointer.resumeAt)
    ) {
      normalizedPointer.resumeAt = Math.max(
        0,
        Math.floor(pointerMetadata.resumeAt),
      );
    }
    if (pointerMetadata.completed === true) {
      normalizedPointer.completed = true;
    }
  }

  const key = pointerKey(normalizedPointer);
  console.info(
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
    console.warn(
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
    console.info(
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

  console.info(
    "[watchHistoryService] Added pointer to pending watch list snapshot queue.",
    {
      actor: actorKey,
      pointerKey: key,
      queueSize: queue.items.size,
    }
  );

  if (!remoteEnabled) {
    console.info(
      "[watchHistoryService] Watch history sync unavailable for this actor; retaining pointer in local session queue only.",
      {
        actor: actorKey,
        pointerKey: key,
        watchedAt: normalizedPointer.watchedAt,
      }
    );
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
    console.info(
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

  console.info(
    "[watchHistoryService] Initiating watch list snapshot publish.",
    {
      actor: actorKey,
      reason,
      itemCount: payloadItems.length,
      queued: queue?.items?.size ?? 0,
    }
  );

  const run = (async () => {
    emit("snapshot-start", { actor: actorKey, reason, items: payloadItems });
    const publishResult = await nostrClient.publishWatchHistorySnapshot(
      payloadItems,
      {
        actorPubkey: actorKey,
        source: reason,
      }
    );

    console.info(
      "[watchHistoryService] Watch list snapshot publish completed.",
      {
        actor: actorKey,
        reason,
        success: !!publishResult?.ok,
        snapshotId: publishResult?.snapshotId || null,
        retryable: !!publishResult?.retryable,
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
    console.info(
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

function scheduleWatchHistoryRefresh(actorKey, cacheEntry = {}) {
  if (!actorKey) {
    return Promise.resolve([]);
  }

  if (cacheEntry && typeof cacheEntry === "object" && cacheEntry.promise) {
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

  console.info("[watchHistoryService] Triggered nostr watch list refresh.", {
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
    console.info(
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
  console.info(
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
    console.info(
      "[watchHistoryService] Returning cached watch list items.",
      {
        actor: actorKey,
        itemCount: cacheEntry.items.length,
      }
    );
    return cacheEntry.items;
  }

  if (cacheEntry?.promise) {
    console.info(
      "[watchHistoryService] Awaiting in-flight watch list refresh.",
      {
        actor: actorKey,
      }
    );
    if (allowStale && hasCachedItems) {
      console.info(
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

  console.info(
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
  supportsLocalHistory,
  isLocalOnly,
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
