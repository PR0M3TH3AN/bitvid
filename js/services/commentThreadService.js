// js/services/commentThreadService.js

import { devLogger } from "../utils/logger.js";
import { buildVideoAddressPointer } from "../utils/videoPointer.js";

const ROOT_PARENT_KEY = "__root__";
const DEFAULT_INITIAL_LIMIT = 40;
const DEFAULT_HYDRATION_DEBOUNCE_MS = 25;

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePubkey(pubkey) {
  const normalized = normalizeString(pubkey);
  return normalized ? normalized.toLowerCase() : "";
}

function toParentKey(parentId) {
  return parentId ? parentId : ROOT_PARENT_KEY;
}

function fromParentKey(parentKey) {
  return parentKey === ROOT_PARENT_KEY ? null : parentKey;
}

function safeCall(handler, payload) {
  if (typeof handler !== "function") {
    return;
  }
  try {
    handler(payload);
  } catch (error) {
    devLogger.warn("[commentThread] callback threw", error);
  }
}

export default class CommentThreadService {
  constructor({
    nostrClient = null,
    app = null,
    limit = DEFAULT_INITIAL_LIMIT,
    hydrationDebounceMs = DEFAULT_HYDRATION_DEBOUNCE_MS,
    logger = devLogger,
  } = {}) {
    this.nostrClient = nostrClient;
    this.app = app;
    this.defaultLimit = toPositiveInteger(limit, DEFAULT_INITIAL_LIMIT);
    this.hydrationDelay = Math.max(
      0,
      toPositiveInteger(hydrationDebounceMs, DEFAULT_HYDRATION_DEBOUNCE_MS)
    );
    this.logger =
      logger && typeof logger.warn === "function" ? logger : devLogger;

    this.callbacks = {
      onThreadReady: null,
      onCommentsAppended: null,
      onError: null,
    };

    this.resetInternalState();
  }

  resetInternalState() {
    this.eventsById = new Map();
    this.metaById = new Map();
    this.childrenByParent = new Map();
    this.childrenByParent.set(ROOT_PARENT_KEY, []);
    this.profileCache = new Map();
    this.profileQueue = new Set();
    this.profileHydrationTimer = null;
    this.profileHydrationPromise = null;
    this.subscriptionCleanup = null;
    this.videoEventId = "";
    this.videoAddressPointer = "";
    this.parentCommentId = "";
    this.activeRelays = null;
  }

  setCallbacks({
    onThreadReady = this.callbacks.onThreadReady,
    onCommentsAppended = this.callbacks.onCommentsAppended,
    onError = this.callbacks.onError,
  } = {}) {
    this.callbacks.onThreadReady =
      typeof onThreadReady === "function" ? onThreadReady : null;
    this.callbacks.onCommentsAppended =
      typeof onCommentsAppended === "function" ? onCommentsAppended : null;
    this.callbacks.onError = typeof onError === "function" ? onError : null;
  }

  async loadThread({
    video = null,
    parentCommentId = "",
    limit = this.defaultLimit,
    relays = null,
  } = {}) {
    this.teardown();

    this.videoEventId = normalizeString(video?.id);
    this.videoAddressPointer = buildVideoAddressPointer(video);
    this.parentCommentId = normalizeString(parentCommentId);
    this.activeRelays = Array.isArray(relays) ? [...relays] : null;

    if (!this.videoEventId || !this.videoAddressPointer) {
      this.emitError(
        new Error("Unable to resolve video pointer for comment thread."),
      );
      return { success: false };
    }

    if (!this.nostrClient ||
      typeof this.nostrClient.fetchVideoComments !== "function") {
      this.emitError(
        new Error("Nostr client is missing fetchVideoComments implementation."),
      );
      return { success: false };
    }

    const fetchLimit = toPositiveInteger(limit, this.defaultLimit);
    const target = {
      videoEventId: this.videoEventId,
      videoDefinitionAddress: this.videoAddressPointer,
      parentCommentId: this.parentCommentId,
    };

    let events = [];
    try {
      events = await this.nostrClient.fetchVideoComments(target, {
        limit: fetchLimit,
        relays: this.activeRelays,
      });
    } catch (error) {
      this.emitError(error);
      return { success: false, error };
    }

    if (Array.isArray(events)) {
      events.forEach((event) => {
        this.processIncomingEvent(event, { isInitial: true });
      });
    }

    this.emitThreadReady();
    this.startSubscription(target);

    if (this.profileHydrationTimer) {
      clearTimeout(this.profileHydrationTimer);
      this.profileHydrationTimer = null;
    }

    if (this.profileQueue.size) {
      await this.flushProfileQueue();
    }

    return this.getSnapshot();
  }

  startSubscription(target) {
    if (
      !this.nostrClient ||
      typeof this.nostrClient.subscribeVideoComments !== "function"
    ) {
      return;
    }

    const options = {
      relays: this.activeRelays,
      onEvent: (event) => this.processIncomingEvent(event),
    };

    try {
      const cleanup = this.nostrClient.subscribeVideoComments(target, options);
      if (typeof cleanup === "function") {
        this.subscriptionCleanup = () => {
          try {
            cleanup();
          } catch (error) {
            if (this.logger?.warn) {
              this.logger.warn(
                "[commentThread] Failed to unsubscribe from comment feed:",
                error,
              );
            }
          }
        };
      } else {
        this.subscriptionCleanup = null;
      }
    } catch (error) {
      this.emitError(error);
    }
  }

  processIncomingEvent(event, { isInitial = false } = {}) {
    const result = this.applyEvent(event);
    if (!result) {
      return;
    }

    if (!isInitial && result.type === "insert") {
      this.emitAppend(result);
    }
  }

  applyEvent(event) {
    if (!event || typeof event !== "object") {
      return null;
    }

    const eventId = normalizeString(event.id);
    if (!eventId) {
      return null;
    }

    const parentId = this.extractParentId(event);
    const parentKey = toParentKey(parentId);
    const createdAt = Number.isFinite(event.created_at) ? event.created_at : 0;
    const pubkey = normalizePubkey(event.pubkey);

    const existingMeta = this.metaById.get(eventId);
    this.eventsById.set(eventId, event);
    this.metaById.set(eventId, { parentKey, createdAt });

    if (!existingMeta) {
      this.insertIntoParentList(parentKey, eventId, createdAt);
      if (pubkey) {
        this.queueProfileForHydration(pubkey);
      }
      return { type: "insert", parentId, parentKey, eventId, event };
    }

    if (existingMeta.parentKey !== parentKey) {
      this.removeFromParentList(existingMeta.parentKey, eventId);
      this.insertIntoParentList(parentKey, eventId, createdAt);
    } else if (existingMeta.createdAt !== createdAt) {
      this.reorderParentList(parentKey, eventId, createdAt);
    }

    if (pubkey) {
      this.queueProfileForHydration(pubkey);
    }

    return { type: "update", parentId, parentKey, eventId, event };
  }

  extractParentId(event) {
    const tags = Array.isArray(event.tags) ? event.tags : [];
    const values = [];
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      const [name, value] = tag;
      if (name !== "e") {
        continue;
      }
      const normalizedValue = normalizeString(value);
      if (!normalizedValue) {
        continue;
      }
      values.push(normalizedValue);
    }

    for (let index = values.length - 1; index >= 0; index -= 1) {
      const candidate = values[index];
      if (candidate && candidate !== this.videoEventId) {
        return candidate;
      }
    }

    return "";
  }

  insertIntoParentList(parentKey, eventId, createdAt) {
    const list = this.getParentList(parentKey);
    if (list.includes(eventId)) {
      return;
    }

    const insertIndex = list.findIndex((existingId) => {
      const meta = this.metaById.get(existingId);
      const existingCreated = meta ? meta.createdAt : 0;
      if (createdAt === existingCreated) {
        return eventId.localeCompare(existingId) < 0;
      }
      return createdAt < existingCreated;
    });

    if (insertIndex === -1) {
      list.push(eventId);
    } else {
      list.splice(insertIndex, 0, eventId);
    }
  }

  removeFromParentList(parentKey, eventId) {
    const list = this.childrenByParent.get(parentKey);
    if (!Array.isArray(list)) {
      return;
    }
    const index = list.indexOf(eventId);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  reorderParentList(parentKey, eventId, createdAt) {
    this.removeFromParentList(parentKey, eventId);
    this.insertIntoParentList(parentKey, eventId, createdAt);
  }

  getParentList(parentKey) {
    if (!this.childrenByParent.has(parentKey)) {
      this.childrenByParent.set(parentKey, []);
    }
    return this.childrenByParent.get(parentKey);
  }

  queueProfileForHydration(pubkey) {
    if (!pubkey) {
      return;
    }

    if (this.profileCache.has(pubkey)) {
      return;
    }

    const cachedProfile = this.getProfileFromApp(pubkey);
    if (cachedProfile) {
      this.profileCache.set(pubkey, cachedProfile);
      return;
    }

    this.profileQueue.add(pubkey);
    this.scheduleProfileHydration();
  }

  getProfileFromApp(pubkey) {
    if (!this.app || typeof this.app.getProfileCacheEntry !== "function") {
      return null;
    }
    try {
      const entry = this.app.getProfileCacheEntry(pubkey);
      if (entry && typeof entry === "object" && entry.profile) {
        return entry.profile;
      }
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          "[commentThread] Failed to read profile cache entry:",
          error,
        );
      }
    }
    return null;
  }

  scheduleProfileHydration() {
    if (this.profileQueue.size === 0) {
      return;
    }
    if (this.profileHydrationTimer) {
      return;
    }

    this.profileHydrationTimer = setTimeout(() => {
      this.profileHydrationTimer = null;
      this.flushProfileQueue();
    }, this.hydrationDelay);
  }

  async flushProfileQueue() {
    if (!this.profileQueue.size) {
      return;
    }

    const pubkeys = Array.from(this.profileQueue);
    this.profileQueue.clear();

    if (!this.app || typeof this.app.batchFetchProfiles !== "function") {
      return;
    }

    const hydrationPromise = Promise.resolve(
      this.app.batchFetchProfiles(pubkeys),
    )
      .catch((error) => {
        if (this.logger?.warn) {
          this.logger.warn(
            "[commentThread] Profile hydration failed:",
            error,
          );
        }
        this.emitError(error);
      })
      .then(() => {
        pubkeys.forEach((pubkey) => {
          const profile = this.getProfileFromApp(pubkey);
          if (profile) {
            this.profileCache.set(pubkey, profile);
          }
        });
      })
      .finally(() => {
        if (this.profileHydrationPromise === hydrationPromise) {
          this.profileHydrationPromise = null;
        }
      });

    this.profileHydrationPromise = hydrationPromise;
    await hydrationPromise;
  }

  emitThreadReady() {
    const payload = {
      videoEventId: this.videoEventId,
      parentCommentId: this.parentCommentId || null,
      topLevelIds: this.getCommentIdsForParent(null),
      commentsById: this.cloneCommentsMap(),
      childrenByParent: this.cloneTreeMap(),
      profiles: this.getProfilesSnapshot(),
    };
    safeCall(this.callbacks.onThreadReady, payload);
  }

  emitAppend({ parentId, eventId }) {
    const payload = {
      videoEventId: this.videoEventId,
      parentCommentId: parentId || null,
      commentIds: [eventId],
      commentsById: this.cloneCommentsMap(),
      childrenByParent: this.cloneTreeMap(),
      profiles: this.getProfilesSnapshot(),
    };
    safeCall(this.callbacks.onCommentsAppended, payload);
  }

  emitError(error) {
    if (this.logger?.warn && error) {
      this.logger.warn("[commentThread]", error);
    }
    safeCall(this.callbacks.onError, error);
  }

  getSnapshot() {
    return {
      videoEventId: this.videoEventId,
      parentCommentId: this.parentCommentId || null,
      commentsById: this.cloneCommentsMap(),
      childrenByParent: this.cloneTreeMap(),
      profiles: this.getProfilesSnapshot(),
    };
  }

  cloneCommentsMap() {
    return new Map(this.eventsById);
  }

  cloneTreeMap() {
    const tree = new Map();
    this.childrenByParent.forEach((ids, parentKey) => {
      tree.set(fromParentKey(parentKey), [...ids]);
    });
    return tree;
  }

  getProfilesSnapshot() {
    return new Map(this.profileCache);
  }

  getProfile(pubkey) {
    const normalized = normalizePubkey(pubkey);
    if (!normalized) {
      return null;
    }

    if (this.profileCache.has(normalized)) {
      return this.profileCache.get(normalized);
    }

    const profile = this.getProfileFromApp(normalized);
    if (profile) {
      this.profileCache.set(normalized, profile);
      return profile;
    }

    return null;
  }

  getCommentIdsForParent(parentId) {
    const key = toParentKey(normalizeString(parentId));
    const list = this.childrenByParent.get(key);
    return Array.isArray(list) ? [...list] : [];
  }

  waitForProfileHydration() {
    return this.profileHydrationPromise || Promise.resolve();
  }

  teardown() {
    if (this.subscriptionCleanup) {
      try {
        this.subscriptionCleanup();
      } catch (error) {
        if (this.logger?.warn) {
          this.logger.warn(
            "[commentThread] Failed during teardown unsubscribe:",
            error,
          );
        }
      }
    }
    this.subscriptionCleanup = null;

    if (this.profileHydrationTimer) {
      clearTimeout(this.profileHydrationTimer);
      this.profileHydrationTimer = null;
    }

    this.profileQueue.clear();
    this.profileHydrationPromise = null;
    this.resetInternalState();
  }
}
