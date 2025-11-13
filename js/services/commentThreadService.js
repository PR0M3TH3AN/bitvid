// js/services/commentThreadService.js

import { devLogger } from "../utils/logger.js";
import { buildVideoAddressPointer } from "../utils/videoPointer.js";
import { COMMENT_EVENT_KIND } from "../nostr/commentEvents.js";
import { FEATURE_IMPROVED_COMMENT_FETCHING } from "../constants.js";

const ROOT_PARENT_KEY = "__root__";
const DEFAULT_INITIAL_LIMIT = 40;
const DEFAULT_HYDRATION_DEBOUNCE_MS = 25;
const COMMENT_CACHE_PREFIX = "bitvid:comments:";
const COMMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMENT_CACHE_VERSION = 2;

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

function normalizeRelay(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

function normalizePubkey(pubkey) {
  const normalized = normalizeString(pubkey);
  return normalized ? normalized.toLowerCase() : "";
}

function normalizeKind(value) {
  if (Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
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
    fetchVideoComments = null,
    subscribeVideoComments = null,
    getProfileCacheEntry = null,
    batchFetchProfiles = null,
    limit = DEFAULT_INITIAL_LIMIT,
    hydrationDebounceMs = DEFAULT_HYDRATION_DEBOUNCE_MS,
    logger = devLogger,
  } = {}) {
    this.nostrClient = nostrClient;
    this.fetchVideoComments = fetchVideoComments;
    this.subscribeVideoComments = subscribeVideoComments;

    if (!this.fetchVideoComments && this.nostrClient) {
      const clientFetcher = this.nostrClient.fetchVideoComments;
      if (typeof clientFetcher === "function") {
        this.fetchVideoComments = (...args) => clientFetcher.apply(this.nostrClient, args);
      }
    }

    if (!this.subscribeVideoComments && this.nostrClient) {
      const clientSubscriber = this.nostrClient.subscribeVideoComments;
      if (typeof clientSubscriber === "function") {
        this.subscribeVideoComments = (...args) => clientSubscriber.apply(this.nostrClient, args);
      }
    }

    this.getProfileCacheEntry =
      typeof getProfileCacheEntry === "function"
        ? getProfileCacheEntry
        : this.app && typeof this.app.getProfileCacheEntry === "function"
        ? (pubkey) => this.app.getProfileCacheEntry(pubkey)
        : null;
    this.batchFetchProfiles =
      typeof batchFetchProfiles === "function"
        ? batchFetchProfiles
        : this.app && typeof this.app.batchFetchProfiles === "function"
        ? (pubkeys) => this.app.batchFetchProfiles(pubkeys)
        : null;
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
    this.videoKind = "";
    this.videoAuthorPubkeyRaw = "";
    this.videoAuthorPubkey = "";
    this.videoRootIdentifier = "";
    this.videoRootRelay = "";
    this.parentCommentId = "";
    this.parentCommentKind = "";
    this.parentCommentPubkey = "";
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

    // Always ensure the pool is ready before proceeding
    if (typeof this.nostrClient?.ensurePool === "function") {
      try {
        await this.nostrClient.ensurePool();
      } catch (error) {
        this.emitError(
          new Error("Unable to initialize Nostr pool before loading comments."),
        );
        return { success: false, error };
      }
    } else {
      this.emitError(
        new Error("Nostr client missing ensurePool implementation."),
      );
      return { success: false };
    }

    const rawVideoAuthorPubkey = normalizeString(video?.pubkey);

    this.videoEventId = normalizeString(video?.id);
    this.videoAddressPointer = buildVideoAddressPointer(video);
    this.videoKind = normalizeKind(video?.kind);
    this.videoAuthorPubkeyRaw = rawVideoAuthorPubkey;
    this.videoAuthorPubkey = normalizePubkey(rawVideoAuthorPubkey);
    this.videoRootIdentifier = normalizeString(video?.videoRootId);
    this.videoRootRelay = normalizeRelay(
      video?.videoRootRelay || video?.rootIdentifierRelay,
    );
    this.parentCommentId = normalizeString(parentCommentId);
    this.parentCommentKind = this.parentCommentId ? String(COMMENT_EVENT_KIND) : "";
    this.parentCommentPubkey = "";
    this.activeRelays = Array.isArray(relays) ? [...relays] : null;

    if (!this.videoEventId) {
      this.emitError(
        new Error("Unable to resolve video pointer for comment thread."),
      );
      return { success: false };
    }

    if (typeof this.fetchVideoComments !== "function") {
      this.emitError(
        new Error("Nostr client is missing fetchVideoComments implementation."),
      );
      return { success: false };
    }

    const fetchLimit = toPositiveInteger(limit, this.defaultLimit);
    const target = {
      videoEventId: this.videoEventId,
      parentCommentId: this.parentCommentId,
    };

    if (this.videoAddressPointer) {
      target.videoDefinitionAddress = this.videoAddressPointer;
    }
    if (this.videoKind) {
      target.videoKind = this.videoKind;
    }
    if (this.videoRootIdentifier) {
      target.rootIdentifier = this.videoRootIdentifier;
    }
    if (this.videoRootRelay) {
      target.rootIdentifierRelay = this.videoRootRelay;
    }
    const targetVideoAuthorPubkey = this.getVideoAuthorPubkeyForOutput();
    if (targetVideoAuthorPubkey) {
      target.videoAuthorPubkey = targetVideoAuthorPubkey;
    }
    if (this.parentCommentId) {
      if (this.parentCommentKind) {
        target.parentCommentKind = this.parentCommentKind;
      }
      if (this.parentCommentPubkey) {
        target.parentCommentPubkey = this.parentCommentPubkey;
      }
    }

    let events = [];
    try {
      events = await this.fetchThread(target, {
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

  async fetchThread(target, options = {}) {
    const fallbackFetch = async (overrideOptions = options) => {
      if (typeof this.fetchVideoComments !== "function") {
        return [];
      }
      return await this.fetchVideoComments(target, overrideOptions);
    };

    if (!FEATURE_IMPROVED_COMMENT_FETCHING) {
      return fallbackFetch(options);
    }

    const targetCandidate =
      target && typeof target === "object" ? target : {};
    const videoEventId = normalizeString(
      targetCandidate.videoEventId || targetCandidate.eventId,
    );

    if (!videoEventId) {
      return fallbackFetch(options);
    }

    const cached = this.getCachedComments(videoEventId);
    if (Array.isArray(cached)) {
      return cached;
    }

    const fetchOptions = {
      ...options,
      since: 0,
    };

    if (Number.isFinite(options?.limit)) {
      fetchOptions.limit = Math.max(
        toPositiveInteger(options.limit, this.defaultLimit),
        this.defaultLimit,
      );
    } else if (!Number.isFinite(fetchOptions.limit)) {
      fetchOptions.limit = Math.max(this.defaultLimit, 100);
    }

    const comments = await fallbackFetch(fetchOptions);
    this.cacheComments(videoEventId, comments);
    return comments;
  }

  getCommentCacheKey(videoEventId) {
    const normalized = normalizeString(videoEventId);
    return normalized ? `${COMMENT_CACHE_PREFIX}${normalized}` : "";
  }

  getCachedComments(videoEventId) {
    if (
      !FEATURE_IMPROVED_COMMENT_FETCHING ||
      typeof localStorage === "undefined"
    ) {
      return null;
    }

    const cacheKey = this.getCommentCacheKey(videoEventId);
    if (!cacheKey) {
      return null;
    }

    let raw = null;
    try {
      raw = localStorage.getItem(cacheKey);
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          `[commentThread] Failed to read cached comments for ${videoEventId}:`,
          error,
        );
      }
      return null;
    }

    if (raw === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        this.removeCommentCache(cacheKey);
        return null;
      }

      const cacheVersion = Number.isFinite(parsed.version)
        ? Number(parsed.version)
        : null;

      if (cacheVersion !== COMMENT_CACHE_VERSION) {
        this.removeCommentCache(cacheKey);
        return null;
      }

      const comments = Array.isArray(parsed.comments)
        ? parsed.comments
        : null;
      const timestamp = Number(parsed.timestamp);

      if (
        Array.isArray(comments) &&
        Number.isFinite(timestamp) &&
        Date.now() - timestamp <= COMMENT_CACHE_TTL_MS
      ) {
        if (devLogger?.info) {
          devLogger.info(
            `[commentThread] Loaded ${comments.length} cached comments for ${videoEventId}.`,
          );
        }
        return comments;
      }

      this.removeCommentCache(cacheKey);
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          `[commentThread] Failed to parse cached comments for ${videoEventId}:`,
          error,
        );
      }
      this.removeCommentCache(cacheKey);
    }

    return null;
  }

  cacheComments(videoEventId, comments) {
    if (
      !FEATURE_IMPROVED_COMMENT_FETCHING ||
      typeof localStorage === "undefined" ||
      !Array.isArray(comments)
    ) {
      return;
    }

    const cacheKey = this.getCommentCacheKey(videoEventId);
    if (!cacheKey) {
      return;
    }

    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          version: COMMENT_CACHE_VERSION,
          comments,
          timestamp: Date.now(),
        }),
      );
      if (devLogger?.info) {
        devLogger.info(
          `[commentThread] Cached ${comments.length} comments for ${videoEventId}.`,
        );
      }
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          `[commentThread] Failed to cache comments for ${videoEventId}:`,
          error,
        );
      }
    }
  }

  removeCommentCache(cacheKey) {
    if (!cacheKey || typeof localStorage === "undefined") {
      return;
    }

    try {
      localStorage.removeItem(cacheKey);
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          `[commentThread] Failed to clear cached comments for ${cacheKey}:`,
          error,
        );
      }
    }
  }

  clearCommentCache(videoEventId = null) {
    if (!FEATURE_IMPROVED_COMMENT_FETCHING || typeof localStorage === "undefined") {
      return;
    }

    if (videoEventId) {
      this.removeCommentCache(this.getCommentCacheKey(videoEventId));
      return;
    }

    try {
      const keys = Object.keys(localStorage);
      keys
        .filter((key) => key.startsWith(COMMENT_CACHE_PREFIX))
        .forEach((key) => this.removeCommentCache(key));
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          "[commentThread] Failed to clear comment cache:",
          error,
        );
      }
    }
  }

  persistCommentCache() {
    if (!FEATURE_IMPROVED_COMMENT_FETCHING || !this.videoEventId) {
      return;
    }

    const comments = this.serializeCommentsForCache();
    this.cacheComments(this.videoEventId, comments);
  }

  serializeCommentsForCache() {
    const events = Array.from(this.eventsById.values());
    return events.sort((a, b) => {
      const aTime = Number.isFinite(a?.created_at) ? a.created_at : 0;
      const bTime = Number.isFinite(b?.created_at) ? b.created_at : 0;
      if (aTime !== bTime) {
        return aTime - bTime;
      }

      const aId = normalizeString(a?.id);
      const bId = normalizeString(b?.id);
      if (aId && bId) {
        return aId.localeCompare(bId);
      }
      if (aId) {
        return -1;
      }
      if (bId) {
        return 1;
      }
      return 0;
    });
  }

  startSubscription(target) {
    if (typeof this.subscribeVideoComments !== "function") {
      return;
    }

    const options = {
      relays: this.activeRelays,
      onEvent: (event) => this.processIncomingEvent(event),
    };

    try {
      const cleanup = this.subscribeVideoComments(target, options);
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
      return;
    }

    if (!isInitial && result.type === "update") {
      this.persistCommentCache();
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
    const { identifier: rootIdentifier, relay: rootRelay } =
      this.extractRootIdentifier(event);
    if (rootIdentifier) {
      this.videoRootIdentifier = rootIdentifier;
      if (rootRelay) {
        this.videoRootRelay = rootRelay;
      }
    }
    if (this.parentCommentId && eventId === this.parentCommentId) {
      const kindValue = normalizeKind(event.kind);
      if (kindValue) {
        this.parentCommentKind = kindValue;
      }
      if (pubkey) {
        this.parentCommentPubkey = pubkey;
      }
    }

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

  extractRootIdentifier(event) {
    const tags = Array.isArray(event?.tags) ? event.tags : [];
    for (let index = tags.length - 1; index >= 0; index -= 1) {
      const tag = tags[index];
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      const name = typeof tag[0] === "string" ? tag[0].trim() : "";
      if (name !== "I") {
        continue;
      }
      const value = normalizeString(tag[1]);
      if (!value) {
        continue;
      }
      return {
        identifier: value,
        relay: normalizeRelay(tag[2]),
      };
    }
    return { identifier: "", relay: "" };
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

    const cachedProfile = this.getProfileFromCache(pubkey);
    if (cachedProfile) {
      this.profileCache.set(pubkey, cachedProfile);
      return;
    }

    this.profileQueue.add(pubkey);
    this.scheduleProfileHydration();
  }

  getProfileFromCache(pubkey) {
    if (typeof this.getProfileCacheEntry !== "function") {
      return null;
    }
    try {
      const entry = this.getProfileCacheEntry(pubkey);
      if (!entry) {
        return null;
      }
      if (entry && typeof entry === "object" && entry.profile) {
        return entry.profile;
      }
      return entry;
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

    if (typeof this.batchFetchProfiles !== "function") {
      return;
    }

    const hydrationPromise = Promise.resolve(
      this.batchFetchProfiles(pubkeys),
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
          const profile = this.getProfileFromCache(pubkey);
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

  getVideoAuthorPubkeyForOutput() {
    return this.videoAuthorPubkeyRaw || this.videoAuthorPubkey || "";
  }

  emitThreadReady() {
    const payload = {
      videoEventId: this.videoEventId,
      parentCommentId: this.parentCommentId || null,
      videoDefinitionAddress: this.videoAddressPointer || null,
      videoKind: this.videoKind || null,
      videoAuthorPubkey: this.getVideoAuthorPubkeyForOutput() || null,
      rootIdentifier: this.videoRootIdentifier || null,
      rootIdentifierRelay: this.videoRootRelay || null,
      parentCommentKind: this.parentCommentKind || null,
      parentCommentPubkey: this.parentCommentPubkey || null,
      topLevelIds: this.getCommentIdsForParent(null),
      commentsById: this.cloneCommentsMap(),
      childrenByParent: this.cloneTreeMap(),
      profiles: this.getProfilesSnapshot(),
    };
    safeCall(this.callbacks.onThreadReady, payload);
    this.persistCommentCache();
  }

  emitAppend({ parentId, eventId }) {
    const payload = {
      videoEventId: this.videoEventId,
      parentCommentId: parentId || null,
      videoDefinitionAddress: this.videoAddressPointer || null,
      videoKind: this.videoKind || null,
      videoAuthorPubkey: this.getVideoAuthorPubkeyForOutput() || null,
      rootIdentifier: this.videoRootIdentifier || null,
      rootIdentifierRelay: this.videoRootRelay || null,
      parentCommentKind: this.parentCommentKind || null,
      parentCommentPubkey: this.parentCommentPubkey || null,
      commentIds: [eventId],
      commentsById: this.cloneCommentsMap(),
      childrenByParent: this.cloneTreeMap(),
      profiles: this.getProfilesSnapshot(),
    };
    safeCall(this.callbacks.onCommentsAppended, payload);
    this.persistCommentCache();
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
      videoDefinitionAddress: this.videoAddressPointer || null,
      videoKind: this.videoKind || null,
      videoAuthorPubkey: this.getVideoAuthorPubkeyForOutput() || null,
      rootIdentifier: this.videoRootIdentifier || null,
      rootIdentifierRelay: this.videoRootRelay || null,
      parentCommentKind: this.parentCommentKind || null,
      parentCommentPubkey: this.parentCommentPubkey || null,
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

    const profile = this.getProfileFromCache(normalized);
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

  getCommentEvent(commentId) {
    const normalized = normalizeString(commentId);
    if (!normalized) {
      return null;
    }
    return this.eventsById.get(normalized) || null;
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
