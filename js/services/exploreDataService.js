import { devLogger } from "../utils/logger.js";
import { FIVE_MINUTES_MS, ONE_MINUTE_MS } from "../constants.js";

const DEFAULT_IDF_REFRESH_INTERVAL_MS = FIVE_MINUTES_MS;
const DEFAULT_HISTORY_REFRESH_INTERVAL_MS = ONE_MINUTE_MS;
const DEFAULT_REFRESH_DEBOUNCE_MS = 200;

let workerInstance = null;
function getWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL("../workers/exploreData.worker.js", import.meta.url), { type: "module" });
  }
  return workerInstance;
}

function runWorkerTask(type, payload) {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const id = crypto.randomUUID();
    const handler = (e) => {
      if (e.data.id === id) {
        worker.removeEventListener("message", handler);
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.result);
        }
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ type, id, payload });
  });
}

export function toLightweightVideo(video) {
  if (!video || typeof video !== "object") {
    return null;
  }

  const lightweight = {
    id: video.id,
    kind: video.kind,
    pubkey: video.pubkey,
    nip71: video.nip71,
    tags: [],
  };

  if (Array.isArray(video.tags)) {
    for (const t of video.tags) {
      if (Array.isArray(t) && t.length >= 2) {
        const type = t[0];
        if (type === "d" || type === "t") {
          lightweight.tags.push(t);
        }
      }
    }
  }

  return lightweight;
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

  const sourceMap =
    nostrService && typeof nostrService.getVideosMap === "function"
      ? nostrService.getVideosMap()
      : new Map();

  const videosMap = new Map();
  for (const [id, video] of sourceMap) {
    videosMap.set(id, toLightweightVideo(video));
  }

  try {
    const counts = await runWorkerTask('CALC_HISTORY_COUNTS', { items, videosMap });
    return counts instanceof Map ? counts : new Map();
  } catch (error) {
    devLogger.warn("[exploreData] Worker failed to calculate history counts:", error);
    return new Map();
  }
}

export async function buildTagIdf({ videos } = {}) {
  const list = Array.isArray(videos) ? videos : [];
  if (!list.length) {
    return new Map();
  }

  const lightweightVideos = list.map(toLightweightVideo);

  try {
    const idf = await runWorkerTask('CALC_IDF', { videos: lightweightVideos });
    return idf instanceof Map ? idf : new Map();
  } catch (error) {
    devLogger.warn("[exploreData] Worker failed to calculate IDF:", error);
    return new Map();
  }
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
    this.boundHandleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  initialize() {
    this.refreshWatchHistoryTagCounts({ force: true, reason: "init" });
    this.refreshTagIdf({ force: true, reason: "init" });
    this.subscribeToUpdates();
    this.startIntervals();
  }

  startIntervals() {
    this.clearIntervals();

    // If hidden, do not start intervals (will start on visibility change)
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    if (
      Number.isFinite(this.historyRefreshIntervalMs) &&
      this.historyRefreshIntervalMs > 0
    ) {
      this.watchHistoryInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        this.refreshWatchHistoryTagCounts({ reason: "interval" });
      }, this.historyRefreshIntervalMs);
    }
    if (
      Number.isFinite(this.idfRefreshIntervalMs) &&
      this.idfRefreshIntervalMs > 0
    ) {
      this.tagIdfInterval = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        this.refreshTagIdf({ reason: "interval" });
      }, this.idfRefreshIntervalMs);
    }
  }

  handleVisibilityChange() {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      this.clearIntervals();
    } else {
      this.refreshWatchHistoryTagCounts({ reason: "visibility" });
      this.refreshTagIdf({ reason: "visibility" });
      this.startIntervals();
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

    if (typeof document !== "undefined") {
      const handler = () => this.handleVisibilityChange();
      document.addEventListener("visibilitychange", handler);
      this.unsubscribeHandlers.push(() => {
        document.removeEventListener("visibilitychange", handler);
      });
    }

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

  async refreshTagIdf({ force = false, videos, reason } = {}) {
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
      this.tagIdf = await buildTagIdf({ videos: sourceVideos });
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
