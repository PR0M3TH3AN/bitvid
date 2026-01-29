import { devLogger } from "../utils/logger.js";
import { normalizeHashtag } from "../utils/hashtagNormalization.js";
import { normalizePointerInput } from "../nostr/watchHistory.js";
import { buildVideoAddressPointer } from "../utils/videoPointer.js";

const DEFAULT_IDF_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_HISTORY_REFRESH_INTERVAL_MS = 60 * 1000;
const DEFAULT_REFRESH_DEBOUNCE_MS = 200;

function normalizeAddressKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toLowerCase();
}

function collectVideoTags(video) {
  const tags = new Set();

  if (!video || typeof video !== "object") {
    return tags;
  }

  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (Array.isArray(tag) && tag[0] === "t" && typeof tag[1] === "string") {
        const normalized = normalizeHashtag(tag[1]);
        if (normalized) {
          tags.add(normalized);
        }
      }
    }
  }

  if (Array.isArray(video.nip71?.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      if (typeof tag !== "string") {
        continue;
      }
      const normalized = normalizeHashtag(tag);
      if (normalized) {
        tags.add(normalized);
      }
    }
  }

  return tags;
}

export async function buildWatchHistoryTagCounts({
  watchHistoryService,
  nostrService,
  actor,
} = {}) {
  if (!watchHistoryService || typeof watchHistoryService.loadLatest !== "function") {
    return new Map();
  }

  let items = [];
  try {
    items = await Promise.resolve(
      watchHistoryService.loadLatest(actor, { allowStale: true })
    );
  } catch (error) {
    devLogger.warn("[exploreData] Failed to load watch history entries:", error);
    items = [];
  }

  const videosMap =
    nostrService && typeof nostrService.getVideosMap === "function"
      ? nostrService.getVideosMap()
      : new Map();

  const needsAddressIndex = Array.isArray(items)
    ? items.some((item) => {
        const pointer = normalizePointerInput(item?.pointer || item);
        return pointer?.type === "a";
      })
    : false;

  let addressIndex = null;
  if (needsAddressIndex) {
    addressIndex = new Map();
    for (const video of videosMap.values()) {
      const address = buildVideoAddressPointer(video);
      const key = normalizeAddressKey(address);
      if (key) {
        addressIndex.set(key, video);
      }
    }
  }

  const counts = new Map();
  if (!Array.isArray(items)) {
    return counts;
  }

  for (const entry of items) {
    const pointer = normalizePointerInput(entry?.pointer || entry);
    let video = entry?.video || entry?.metadata?.video || null;

    if (pointer?.type === "e" && pointer.value) {
      const eventId = typeof pointer.value === "string" ? pointer.value.trim() : "";
      if (eventId) {
        video = videosMap.get(eventId) || videosMap.get(eventId.toLowerCase()) || video;
      }
    } else if (pointer?.type === "a" && pointer.value && addressIndex) {
      const key = normalizeAddressKey(pointer.value);
      if (key && addressIndex.has(key)) {
        video = addressIndex.get(key);
      }
    }

    if (!video) {
      continue;
    }

    const tags = collectVideoTags(video);
    for (const tag of tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return counts;
}

export function buildTagIdf({ videos } = {}) {
  const idf = new Map();
  const list = Array.isArray(videos) ? videos : [];
  if (!list.length) {
    return idf;
  }

  const docFrequency = new Map();
  const totalDocs = list.length;

  for (const video of list) {
    const tags = collectVideoTags(video);
    if (!tags.size) {
      continue;
    }

    for (const tag of tags) {
      docFrequency.set(tag, (docFrequency.get(tag) || 0) + 1);
    }
  }

  for (const [tag, df] of docFrequency.entries()) {
    const ratio = (totalDocs + 1) / (df + 1);
    const value = 1 + Math.log(ratio);
    if (Number.isFinite(value) && value > 0) {
      idf.set(tag, value);
    }
  }

  return idf;
}

export default class ExploreDataService {
  constructor({
    watchHistoryService,
    nostrService,
    getActiveActor,
    logger = devLogger,
    idfRefreshIntervalMs = DEFAULT_IDF_REFRESH_INTERVAL_MS,
    historyRefreshIntervalMs = DEFAULT_HISTORY_REFRESH_INTERVAL_MS,
    refreshDebounceMs = DEFAULT_REFRESH_DEBOUNCE_MS,
  } = {}) {
    this.watchHistoryService = watchHistoryService;
    this.nostrService = nostrService;
    this.getActiveActor =
      typeof getActiveActor === "function" ? getActiveActor : () => "";
    this.logger = logger && typeof logger.warn === "function" ? logger : devLogger;
    this.idfRefreshIntervalMs = idfRefreshIntervalMs;
    this.historyRefreshIntervalMs = historyRefreshIntervalMs;
    this.refreshDebounceMs = refreshDebounceMs;

    this.watchHistoryTagCounts = new Map();
    this.watchHistoryTagCountsUpdatedAt = 0;
    this.tagIdf = new Map();
    this.tagIdfUpdatedAt = 0;

    this.watchHistoryRefreshHandle = null;
    this.tagIdfRefreshHandle = null;
    this.watchHistoryInterval = null;
    this.tagIdfInterval = null;
    this.unsubscribeHandlers = [];
  }

  initialize() {
    this.refreshWatchHistoryTagCounts({ force: true, reason: "init" });
    this.refreshTagIdf({ force: true, reason: "init" });
    this.subscribeToUpdates();
    this.startIntervals();
  }

  startIntervals() {
    this.clearIntervals();
    if (Number.isFinite(this.historyRefreshIntervalMs) && this.historyRefreshIntervalMs > 0) {
      this.watchHistoryInterval = setInterval(() => {
        this.refreshWatchHistoryTagCounts({ reason: "interval" });
      }, this.historyRefreshIntervalMs);
    }
    if (Number.isFinite(this.idfRefreshIntervalMs) && this.idfRefreshIntervalMs > 0) {
      this.tagIdfInterval = setInterval(() => {
        this.refreshTagIdf({ reason: "interval" });
      }, this.idfRefreshIntervalMs);
    }
  }

  clearIntervals() {
    if (this.watchHistoryInterval) {
      clearInterval(this.watchHistoryInterval);
      this.watchHistoryInterval = null;
    }
    if (this.tagIdfInterval) {
      clearInterval(this.tagIdfInterval);
      this.tagIdfInterval = null;
    }
  }

  subscribeToUpdates() {
    this.unsubscribeHandlers.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
    this.unsubscribeHandlers = [];

    if (this.watchHistoryService && typeof this.watchHistoryService.subscribe === "function") {
      const unsubscribe = this.watchHistoryService.subscribe("fingerprint", () => {
        this.queueWatchHistoryRefresh("watch-history");
      });
      this.unsubscribeHandlers.push(unsubscribe);
    }

    if (this.nostrService && typeof this.nostrService.on === "function") {
      const events = [
        "videos:updated",
        "videos:fetched",
        "videos:published",
        "videos:edited",
        "videos:deleted",
        "videos:cache",
      ];
      events.forEach((eventName) => {
        const unsubscribe = this.nostrService.on(eventName, () => {
          this.queueTagIdfRefresh(eventName);
        });
        this.unsubscribeHandlers.push(unsubscribe);
      });
    }
  }

  queueWatchHistoryRefresh(reason) {
    if (this.watchHistoryRefreshHandle) {
      return;
    }
    this.watchHistoryRefreshHandle = setTimeout(() => {
      this.watchHistoryRefreshHandle = null;
      this.refreshWatchHistoryTagCounts({ reason });
    }, this.refreshDebounceMs);
  }

  queueTagIdfRefresh(reason) {
    if (this.tagIdfRefreshHandle) {
      return;
    }
    this.tagIdfRefreshHandle = setTimeout(() => {
      this.tagIdfRefreshHandle = null;
      this.refreshTagIdf({ reason });
    }, this.refreshDebounceMs);
  }

  async refreshWatchHistoryTagCounts({ force = false, reason } = {}) {
    const now = Date.now();
    if (!force && this.watchHistoryTagCountsUpdatedAt) {
      const elapsed = now - this.watchHistoryTagCountsUpdatedAt;
      if (elapsed < this.historyRefreshIntervalMs) {
        return this.watchHistoryTagCounts;
      }
    }

    try {
      const actorRaw = this.getActiveActor();
      const actor = typeof actorRaw === "string" && actorRaw.trim() ? actorRaw.trim() : undefined;
      const counts = await buildWatchHistoryTagCounts({
        watchHistoryService: this.watchHistoryService,
        nostrService: this.nostrService,
        actor,
      });
      this.watchHistoryTagCounts = counts instanceof Map ? counts : new Map();
      this.watchHistoryTagCountsUpdatedAt = now;
      return this.watchHistoryTagCounts;
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          "[exploreData] Failed to refresh watch history tag counts:",
          error,
        );
      }
      if (reason) {
        return this.watchHistoryTagCounts;
      }
      return this.watchHistoryTagCounts;
    }
  }

  refreshTagIdf({ force = false, videos, reason } = {}) {
    const now = Date.now();
    if (!force && this.tagIdfUpdatedAt) {
      const elapsed = now - this.tagIdfUpdatedAt;
      if (elapsed < this.idfRefreshIntervalMs) {
        return this.tagIdf;
      }
    }

    const sourceVideos = Array.isArray(videos)
      ? videos
      : this.nostrService && typeof this.nostrService.getFilteredActiveVideos === "function"
      ? this.nostrService.getFilteredActiveVideos()
      : [];

    try {
      this.tagIdf = buildTagIdf({ videos: sourceVideos });
      this.tagIdfUpdatedAt = now;
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn("[exploreData] Failed to refresh tag IDF:", error);
      }
    }

    if (reason) {
      return this.tagIdf;
    }

    return this.tagIdf;
  }

  getWatchHistoryTagCounts() {
    return this.watchHistoryTagCounts;
  }

  getTagIdf() {
    return this.tagIdf;
  }

  destroy() {
    this.clearIntervals();

    if (this.watchHistoryRefreshHandle) {
      clearTimeout(this.watchHistoryRefreshHandle);
      this.watchHistoryRefreshHandle = null;
    }
    if (this.tagIdfRefreshHandle) {
      clearTimeout(this.tagIdfRefreshHandle);
      this.tagIdfRefreshHandle = null;
    }

    this.unsubscribeHandlers.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
    this.unsubscribeHandlers = [];
  }
}
