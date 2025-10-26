import { nostrClient } from "../nostr.js";
import { convertEventToVideo } from "../nostr/index.js";
import { accessControl } from "../accessControl.js";
import { ALLOW_NSFW_CONTENT } from "../config.js";
import { userLogger } from "../utils/logger.js";
import moderationService from "./moderationService.js";
import {
  getVideosMap as getStoredVideosMap,
  setVideosMap as setStoredVideosMap,
  getVideoSubscription as getStoredVideoSubscription,
  setVideoSubscription as setStoredVideoSubscription,
} from "../state/appState.js";

const VIDEO_KIND = 30078;

class SimpleEventEmitter {
  constructor(logger = null) {
    this.logger = typeof logger === "function" ? logger : null;
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== "function") {
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
        if (this.logger) {
          try {
            this.logger(`nostrService listener for "${eventName}" threw`, error);
          } catch (logError) {
            userLogger.warn("[nostrService] listener logger threw", logError);
          }
        }
      }
    }
  }
}

function normalizeLogger(logger) {
  if (typeof logger === "function") {
    return logger;
  }
  if (logger && typeof logger.log === "function") {
    return (...args) => logger.log(...args);
  }
  return () => {};
}

function ensureSet(value) {
  if (value instanceof Set) {
    return value;
  }
  if (Array.isArray(value)) {
    return new Set(value);
  }
  return new Set();
}

function normalizeHexPubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }

  const trimmed = pubkey.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

function normalizeUntil(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const seconds = Math.floor(value);
  return seconds > 0 ? seconds : 0;
}

export class NostrService {
  constructor({ logger } = {}) {
    this.nostrClient = nostrClient;
    this.accessControl = accessControl;
    this.logger = normalizeLogger(logger);
    this.emitter = new SimpleEventEmitter((message, error) => {
      try {
        this.logger(message, error);
      } catch (logError) {
        userLogger.warn("[nostrService] logger threw", logError);
      }
    });
    this.videosMap = null;
    this.videosByAuthorIndex = null;
    this.authorIndexDirty = false;
    this.moderationService = moderationService || null;
    this.initialLoadPromise = null;
    this.initialLoadResolved = false;
    this.initialLoadResolve = null;
    try {
      if (this.moderationService && typeof this.moderationService.setNostrClient === "function") {
        this.moderationService.setNostrClient(this.nostrClient);
      }
    } catch (error) {
      userLogger.warn("[nostrService] Failed to attach moderation service", error);
    }
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (error) {
      userLogger.warn("[nostrService] logger threw", error);
    }
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  emit(eventName, detail) {
    this.emitter.emit(eventName, detail);
  }

  ensureInitialLoadDeferred() {
    if (!this.initialLoadPromise) {
      this.initialLoadResolved = false;
      this.initialLoadPromise = new Promise((resolve) => {
        this.initialLoadResolve = (value) => {
          if (this.initialLoadResolved) {
            return;
          }
          this.initialLoadResolved = true;
          this.initialLoadResolve = null;
          resolve(value);
        };
      });
    }

    return this.initialLoadPromise;
  }

  resolveInitialLoad(value) {
    if (this.initialLoadResolved) {
      return;
    }

    if (typeof this.initialLoadResolve === "function") {
      try {
        this.initialLoadResolve(value);
      } finally {
        this.initialLoadResolve = null;
        this.initialLoadResolved = true;
      }
    }
  }

  awaitInitialLoad() {
    return this.ensureInitialLoadDeferred();
  }

  getModerationService() {
    if (!this.moderationService) {
      return null;
    }

    try {
      if (
        typeof this.moderationService.setNostrClient === "function" &&
        this.moderationService.nostrClient !== this.nostrClient
      ) {
        this.moderationService.setNostrClient(this.nostrClient);
      }

      if (typeof this.moderationService.refreshViewerFromClient === "function") {
        this.moderationService.refreshViewerFromClient();
      }
    } catch (error) {
      userLogger.warn("[nostrService] Failed to synchronize moderation service", error);
    }

    return this.moderationService;
  }

  ensureVideosMap() {
    if (this.videosMap instanceof Map) {
      return this.videosMap;
    }

    let map = getStoredVideosMap();
    if (!(map instanceof Map)) {
      map = new Map();
      setStoredVideosMap(map);
    }

    this.videosMap = map;
    this.markAuthorIndexDirty();
    return this.videosMap;
  }

  getVideosMap() {
    return this.ensureVideosMap();
  }

  getVideoSubscription() {
    return getStoredVideoSubscription();
  }

  setVideoSubscription(subscription) {
    setStoredVideoSubscription(subscription || null);
    this.emit("subscription:changed", { subscription: subscription || null });
  }

  clearVideoSubscription() {
    const current = getStoredVideoSubscription();
    if (current && typeof current.unsub === "function") {
      try {
        current.unsub();
      } catch (error) {
        userLogger.warn("[nostrService] Failed to unsubscribe from video feed:", error);
      }
    }
    this.setVideoSubscription(null);
  }

  cacheVideos(videos = []) {
    if (!Array.isArray(videos) || !videos.length) {
      return;
    }

    const map = this.ensureVideosMap();
    for (const video of videos) {
      if (video && typeof video.id === "string" && video.id) {
        map.set(video.id, video);
      }
    }
    setStoredVideosMap(map);
    this.markAuthorIndexDirty();
    this.emit("videos:cache", { size: map.size });
  }

  resetVideosCache() {
    const map = new Map();
    this.videosMap = map;
    this.videosByAuthorIndex = new Map();
    this.authorIndexDirty = false;
    setStoredVideosMap(map);
    this.emit("videos:cache", { size: 0 });
  }

  markAuthorIndexDirty() {
    this.authorIndexDirty = true;
  }

  ensureVideosByAuthorIndex() {
    const videosMap = this.ensureVideosMap();

    if (this.videosByAuthorIndex instanceof Map && !this.authorIndexDirty) {
      return this.videosByAuthorIndex;
    }

    const index = new Map();
    for (const video of videosMap.values()) {
      if (!video || typeof video !== "object") {
        continue;
      }
      const author = normalizeHexPubkey(video.pubkey);
      if (!author) {
        continue;
      }
      if (!index.has(author)) {
        index.set(author, []);
      }
      index.get(author).push(video);
    }

    for (const [author, videos] of index.entries()) {
      if (!Array.isArray(videos) || videos.length <= 1) {
        continue;
      }
      videos.sort((a, b) => {
        const aCreatedCandidate = Number(a?.created_at);
        const bCreatedCandidate = Number(b?.created_at);
        const aCreated = Number.isFinite(aCreatedCandidate)
          ? aCreatedCandidate
          : 0;
        const bCreated = Number.isFinite(bCreatedCandidate)
          ? bCreatedCandidate
          : 0;
        return bCreated - aCreated;
      });
      index.set(author, videos);
    }

    this.videosByAuthorIndex = index;
    this.authorIndexDirty = false;
    return this.videosByAuthorIndex;
  }

  shouldIncludeVideo(video, {
    blacklistedEventIds = new Set(),
    isAuthorBlocked = () => false,
  } = {}) {
    if (!video || typeof video !== "object") {
      return false;
    }

    const viewerIsAuthor = this.isViewerVideoAuthor(video);

    if (ALLOW_NSFW_CONTENT !== true && video.isNsfw === true && !viewerIsAuthor) {
      return false;
    }

    if (blacklistedEventIds.has(video.id)) {
      return false;
    }

    if (typeof video.pubkey === "string" && video.pubkey) {
      try {
        if (isAuthorBlocked(video.pubkey)) {
          return false;
        }
      } catch (error) {
        userLogger.warn("[nostrService] isAuthorBlocked handler threw", error);
      }
    }

    if (video.isPrivate === true && !viewerIsAuthor) {
      return false;
    }

    if (this.accessControl && typeof this.accessControl.canAccess === "function") {
      try {
        if (!this.accessControl.canAccess(video)) {
          return false;
        }
      } catch (error) {
        userLogger.warn("[nostrService] access control check failed", error);
        return false;
      }
    }

    return true;
  }

  filterVideos(videos = [], options = {}) {
    const blacklist = ensureSet(options.blacklistedEventIds);
    const isAuthorBlocked =
      typeof options.isAuthorBlocked === "function"
        ? options.isAuthorBlocked
        : () => false;

    return videos.filter((video) =>
      this.shouldIncludeVideo(video, {
        blacklistedEventIds: blacklist,
        isAuthorBlocked,
      })
    );
  }

  async ensureAccessControlReady() {
    if (!this.accessControl || typeof this.accessControl.ensureReady !== "function") {
      return;
    }

    try {
      await this.accessControl.ensureReady();
    } catch (error) {
      userLogger.warn(
        "[nostrService] Failed to ensure access control lists are ready:",
        error
      );
    }
  }

  getFilteredActiveVideos(options = {}) {
    const all = this.nostrClient.getActiveVideos();
    return this.filterVideos(all, options);
  }

  getActiveVideosByAuthors(authors = [], options = {}) {
    const candidates = ensureSet(authors);
    const normalizedAuthors = new Set();
    for (const candidate of candidates) {
      const normalized = normalizeHexPubkey(candidate);
      if (normalized) {
        normalizedAuthors.add(normalized);
      }
    }

    if (!normalizedAuthors.size) {
      return this.getFilteredActiveVideos(options);
    }

    const index = this.ensureVideosByAuthorIndex();
    const collected = [];
    const seen = new Set();
    const limitCandidate = Number(options?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;
    const perAuthorLimit = limit
      ? Math.max(limit * 2, limit + 5)
      : null;

    for (const author of normalizedAuthors) {
      const entries = index.get(author);
      if (!Array.isArray(entries) || entries.length === 0) {
        continue;
      }
      const sliceCount = perAuthorLimit
        ? Math.min(perAuthorLimit, entries.length)
        : entries.length;
      for (let idx = 0; idx < sliceCount; idx += 1) {
        const video = entries[idx];
        if (!video || typeof video !== "object") {
          continue;
        }
        const id = typeof video.id === "string" ? video.id : "";
        if (!id || seen.has(id)) {
          continue;
        }
        seen.add(id);
        collected.push(video);
      }
    }

    const filtered = this.filterVideos(collected, options);

    const sorted = filtered.sort((a, b) => {
      const aCreatedCandidate = Number(a?.created_at);
      const bCreatedCandidate = Number(b?.created_at);
      const aCreated = Number.isFinite(aCreatedCandidate) ? aCreatedCandidate : 0;
      const bCreated = Number.isFinite(bCreatedCandidate) ? bCreatedCandidate : 0;
      return bCreated - aCreated;
    });

    if (limit) {
      return sorted.slice(0, limit);
    }

    return sorted;
  }

  async loadVideos({
    forceFetch = false,
    blacklistedEventIds,
    isAuthorBlocked,
    onVideos,
  } = {}) {
    this.ensureInitialLoadDeferred();

    try {
      await this.ensureAccessControlReady();

      if (forceFetch) {
        this.clearVideoSubscription();
      }

      const applyAndNotify = (videos, reason) => {
        const filtered = this.filterVideos(videos, {
          blacklistedEventIds,
          isAuthorBlocked,
        });
        this.cacheVideos(filtered);
        if (typeof onVideos === "function") {
          try {
            onVideos(filtered, { reason });
          } catch (error) {
            userLogger.warn("[nostrService] onVideos handler threw", error);
          }
        }
        this.emit("videos:updated", { videos: filtered, reason });
        return filtered;
      };

      const cached = this.nostrClient.getActiveVideos();
      const initial = applyAndNotify(cached, "cache");

      this.resolveInitialLoad({ videos: initial, reason: "cache" });

      if (!getStoredVideoSubscription()) {
        const subscription = this.nostrClient.subscribeVideos(() => {
          const updated = this.nostrClient.getActiveVideos();
          applyAndNotify(updated, "subscription");
        });
        this.setVideoSubscription(subscription);
        this.emit("subscription:started", { subscription });
      }

      return initial;
    } catch (error) {
      this.resolveInitialLoad({ videos: [], reason: "error", error });
      throw error;
    }
  }

  async fetchVideos(options = {}) {
    try {
      const videos = await this.nostrClient.fetchVideos();
      const filtered = this.filterVideos(videos, options);
      this.cacheVideos(filtered);
      this.emit("videos:fetched", { videos: filtered });
      return filtered;
    } catch (error) {
      userLogger.error("[nostrService] Failed to fetch videos:", error);
      return [];
    }
  }

  async loadOlderVideos(lastTimestamp, {
    blacklistedEventIds,
    isAuthorBlocked,
    limit = 150,
  } = {}) {
    const until = normalizeUntil(lastTimestamp) - 1;
    if (until <= 0 || !this.nostrClient?.pool || !Array.isArray(this.nostrClient?.relays)) {
      return [];
    }

    const filter = {
      kinds: [VIDEO_KIND],
      "#t": ["video"],
      until,
      limit,
    };

    const collected = new Map();

    try {
      const events = await this.nostrClient.pool.list(this.nostrClient.relays, [filter]);
      for (const event of Array.isArray(events) ? events : []) {
        try {
          const video = convertEventToVideo(event);
          if (video.invalid) {
            continue;
          }
          if (
            this.nostrClient &&
            typeof this.nostrClient.applyRootCreatedAt === "function"
          ) {
            this.nostrClient.applyRootCreatedAt(video);
          }
          if (collected.has(video.id)) {
            continue;
          }
          collected.set(video.id, video);
          this.nostrClient.allEvents.set(video.id, video);
        } catch (error) {
          userLogger.warn("[nostrService] Failed to convert older event", error);
        }
      }
    } catch (error) {
      userLogger.error("[nostrService] Failed to load older videos:", error);
      return [];
    }

    const videos = Array.from(collected.values());
    const filtered = this.filterVideos(videos, {
      blacklistedEventIds,
      isAuthorBlocked,
    });

    this.cacheVideos(filtered);
    this.emit("videos:older", { videos: filtered, until });

    return filtered;
  }

  async publishVideoNote(publishPayload, pubkey) {
    const detail = { pubkey };
    if (publishPayload && typeof publishPayload === "object") {
      detail.payload = publishPayload;
      if (publishPayload.legacyFormData) {
        detail.legacyFormData = publishPayload.legacyFormData;
      }
      if (publishPayload.nip71) {
        detail.nip71 = publishPayload.nip71;
      }
    } else {
      detail.formData = publishPayload;
    }

    let nip71Result = null;
    let legacyResult = null;

    try {
      legacyResult = await this.nostrClient.publishVideo(
        publishPayload,
        pubkey
      );
    } catch (error) {
      detail.error = error;
      throw error;
    }

    let shouldAttemptNip71 = true;
    const pointerIdentifiers = {
      eventId: legacyResult?.id,
    };

    if (Array.isArray(legacyResult?.tags)) {
      const dTag = legacyResult.tags.find(
        (tag) => Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string"
      );
      if (dTag) {
        pointerIdentifiers.dTag = dTag[1];
      }
    }

    if (legacyResult?.content) {
      try {
        const parsed = JSON.parse(legacyResult.content);
        if (parsed && typeof parsed.videoRootId === "string") {
          pointerIdentifiers.videoRootId = parsed.videoRootId;
        }
        if (parsed && parsed.isPrivate) {
          shouldAttemptNip71 = false;
        }
      } catch (parseError) {
        this.log("[nostrService] Failed to parse legacy publish payload", parseError);
      }
    }

    if (!pointerIdentifiers.videoRootId) {
      shouldAttemptNip71 = false;
    }

    if (shouldAttemptNip71) {
      try {
        nip71Result = await this.nostrClient.publishNip71Video(
          publishPayload,
          pubkey,
          pointerIdentifiers
        );
      } catch (nip71Error) {
        detail.nip71Error = nip71Error;
        this.log("[nostrService] NIP-71 publish failed", nip71Error);
      }
    }

    const result = { legacy: legacyResult, nip71: nip71Result };
    detail.result = result;
    this.emit("videos:published", detail);
    return result;
  }

  async handleEditVideoSubmit({ originalEvent, updatedData, pubkey }) {
    const result = await this.nostrClient.editVideo(originalEvent, updatedData, pubkey);
    this.emit("videos:edited", { originalEvent, updatedData, pubkey, result });
    return result;
  }

  async handleFullDeleteVideo({ videoRootId, video, pubkey, confirm = true } = {}) {
    const result = await this.nostrClient.deleteAllVersions(videoRootId, pubkey, {
      confirm,
      video,
    });

    if (!result) {
      return result;
    }

    const revertFailures = [];
    const deleteFailures = [];

    if (Array.isArray(result.reverts)) {
      for (const entry of result.reverts) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const failed = Array.isArray(entry?.summary?.failed)
          ? entry.summary.failed.filter(Boolean)
          : [];
        if (failed.length) {
          revertFailures.push({
            targetId: entry.targetId || "",
            eventId: entry.event?.id || "",
            failed,
          });
        }
      }
    }

    if (Array.isArray(result.deletes)) {
      for (const entry of result.deletes) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const failed = Array.isArray(entry?.summary?.failed)
          ? entry.summary.failed.filter(Boolean)
          : [];
        if (failed.length) {
          deleteFailures.push({
            eventId: entry.event?.id || "",
            identifiers: entry.identifiers || { events: [], addresses: [] },
            failed,
          });
        }
      }
    }

    const detail = {
      videoRootId,
      video,
      pubkey,
      result,
      revertFailures,
      deleteFailures,
    };

    this.emit("videos:deleted", detail);

    return detail;
  }

  async getOldEventById(eventId) {
    const map = this.ensureVideosMap();
    const isBlockedNsfw = (video) =>
      ALLOW_NSFW_CONTENT !== true &&
      video?.isNsfw === true &&
      !this.isViewerVideoAuthor(video);

    if (map.has(eventId)) {
      const existing = map.get(eventId);
      if (existing && !existing.deleted) {
        this.nostrClient.applyTombstoneGuard(existing);
      }
      if (!existing || existing.deleted) {
        map.delete(eventId);
        setStoredVideosMap(map);
        return null;
      }
      if (isBlockedNsfw(existing)) {
        map.delete(eventId);
        setStoredVideosMap(map);
        return null;
      }
      return existing;
    }

    const cached = this.nostrClient.allEvents.get(eventId);
    if (cached) {
      if (!cached.deleted) {
        this.nostrClient.applyTombstoneGuard(cached);
      }
    }
    if (cached && !cached.deleted) {
      if (isBlockedNsfw(cached)) {
        return null;
      }
      map.set(eventId, cached);
      setStoredVideosMap(map);
      return cached;
    }

    const fetched = await this.nostrClient.getEventById(eventId);
    if (fetched && !fetched.deleted) {
      if (isBlockedNsfw(fetched)) {
        return null;
      }
      map.set(eventId, fetched);
      setStoredVideosMap(map);
      return fetched;
    }

    return null;
  }

  isViewerVideoAuthor(video) {
    try {
      this.getModerationService();
    } catch (error) {
      userLogger.warn("[nostrService] Failed to refresh moderation context", error);
    }
    if (!video || typeof video !== "object") {
      return false;
    }

    const viewerPubkey = normalizeHexPubkey(this.nostrClient?.pubkey);
    if (!viewerPubkey) {
      return false;
    }

    const videoPubkey = normalizeHexPubkey(video.pubkey);
    return !!videoPubkey && videoPubkey === viewerPubkey;
  }
}

const nostrService = new NostrService();

export default nostrService;
