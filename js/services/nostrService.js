import {
  nostrClient,
  convertEventToVideo,
} from "../nostr.js";
import { accessControl } from "../accessControl.js";
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
            console.warn("[nostrService] listener logger threw", logError);
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
        console.warn("[nostrService] logger threw", logError);
      }
    });
    this.videosMap = null;
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (error) {
      console.warn("[nostrService] logger threw", error);
    }
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  emit(eventName, detail) {
    this.emitter.emit(eventName, detail);
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
        console.warn("[nostrService] Failed to unsubscribe from video feed:", error);
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
    this.emit("videos:cache", { size: map.size });
  }

  shouldIncludeVideo(video, {
    blacklistedEventIds = new Set(),
    isAuthorBlocked = () => false,
  } = {}) {
    if (!video || typeof video !== "object") {
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
        console.warn("[nostrService] isAuthorBlocked handler threw", error);
      }
    }

    if (this.accessControl && typeof this.accessControl.canAccess === "function") {
      try {
        if (!this.accessControl.canAccess(video)) {
          return false;
        }
      } catch (error) {
        console.warn("[nostrService] access control check failed", error);
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
      console.warn(
        "[nostrService] Failed to ensure access control lists are ready:",
        error
      );
    }
  }

  getFilteredActiveVideos(options = {}) {
    const all = this.nostrClient.getActiveVideos();
    return this.filterVideos(all, options);
  }

  async loadVideos({
    forceFetch = false,
    blacklistedEventIds,
    isAuthorBlocked,
    onVideos,
  } = {}) {
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
          console.warn("[nostrService] onVideos handler threw", error);
        }
      }
      this.emit("videos:updated", { videos: filtered, reason });
      return filtered;
    };

    const cached = this.nostrClient.getActiveVideos();
    const initial = applyAndNotify(cached, "cache");

    if (!getStoredVideoSubscription()) {
      const subscription = this.nostrClient.subscribeVideos(() => {
        const updated = this.nostrClient.getActiveVideos();
        applyAndNotify(updated, "subscription");
      });
      this.setVideoSubscription(subscription);
      this.emit("subscription:started", { subscription });
    }

    return initial;
  }

  async fetchVideos(options = {}) {
    try {
      const videos = await this.nostrClient.fetchVideos();
      const filtered = this.filterVideos(videos, options);
      this.cacheVideos(filtered);
      this.emit("videos:fetched", { videos: filtered });
      return filtered;
    } catch (error) {
      console.error("[nostrService] Failed to fetch videos:", error);
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
          if (collected.has(video.id)) {
            continue;
          }
          collected.set(video.id, video);
          this.nostrClient.allEvents.set(video.id, video);
        } catch (error) {
          console.warn("[nostrService] Failed to convert older event", error);
        }
      }
    } catch (error) {
      console.error("[nostrService] Failed to load older videos:", error);
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
      nip71Result = await this.nostrClient.publishNip71Video(
        publishPayload,
        pubkey
      );
      legacyResult = await this.nostrClient.publishVideo(
        publishPayload,
        pubkey
      );
    } catch (error) {
      detail.error = error;
      throw error;
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

  async handleFullDeleteVideo({ videoRootId, pubkey, confirm = true } = {}) {
    const result = await this.nostrClient.deleteAllVersions(videoRootId, pubkey, {
      confirm,
    });
    if (result) {
      this.emit("videos:deleted", { videoRootId, pubkey });
    }
    return result;
  }

  async getOldEventById(eventId) {
    const map = this.ensureVideosMap();
    if (map.has(eventId)) {
      return map.get(eventId);
    }

    const cached = this.nostrClient.allEvents.get(eventId);
    if (cached && !cached.deleted) {
      map.set(eventId, cached);
      setStoredVideosMap(map);
      return cached;
    }

    const fetched = await this.nostrClient.getEventById(eventId);
    if (fetched && !fetched.deleted) {
      map.set(eventId, fetched);
      setStoredVideosMap(map);
      return fetched;
    }

    return null;
  }
}

const nostrService = new NostrService();

export default nostrService;
