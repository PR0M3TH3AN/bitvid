import { isDevMode } from "../config.js";

const DEFAULT_MAX_DISCUSSION_COUNT_VIDEOS = 24;
const COUNT_UNSUPPORTED_TITLE = "Relay does not support NIP-45 COUNT queries.";

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

export default class DiscussionCountService {
  constructor({
    maxVideos = DEFAULT_MAX_DISCUSSION_COUNT_VIDEOS,
    logger = typeof console !== "undefined" ? console : null,
  } = {}) {
    this.maxVideos = toPositiveInteger(maxVideos, DEFAULT_MAX_DISCUSSION_COUNT_VIDEOS);
    this.logger = logger;
    this.videoDiscussionCountCache = new Map();
    this.inFlightDiscussionCounts = new Map();
  }

  clearCache() {
    this.videoDiscussionCountCache.clear();
    this.inFlightDiscussionCounts.clear();
  }

  getCachedCount(videoId) {
    if (!videoId) {
      return undefined;
    }
    return this.videoDiscussionCountCache.get(videoId);
  }

  refreshCounts(videos = [], options = {}) {
    const { videoListRoot = null, nostrClient = null } = options;

    if (!Array.isArray(videos) || !videos.length) {
      return;
    }

    const root =
      videoListRoot && typeof videoListRoot.querySelector === "function"
        ? videoListRoot
        : null;
    if (!root || !nostrClient?.pool || typeof nostrClient.countEventsAcrossRelays !== "function") {
      return;
    }

    const eligibleVideos = videos
      .filter(
        (video) =>
          video &&
          typeof video.id === "string" &&
          video.id &&
          video.enableComments !== false
      )
      .slice(0, this.maxVideos);

    eligibleVideos.forEach((video) => {
      const container = root.querySelector(`[data-discussion-count="${video.id}"]`);
      if (!container) {
        return;
      }

      const cachedCount = this.getCachedCount(video.id);
      if (typeof cachedCount === "number") {
        this.updateDiscussionCountElement(container, cachedCount);
        return;
      }

      const filters = this.buildDiscussionCountFilters(video);
      if (!filters.length) {
        this.markDiscussionCountError(container, { unsupported: true });
        return;
      }

      if (this.inFlightDiscussionCounts.has(video.id)) {
        this.setDiscussionCountPending(container);
        return;
      }

      this.setDiscussionCountPending(container);

      const request = Promise.resolve()
        .then(() => nostrClient.countEventsAcrossRelays(filters))
        .then((result) => {
          const perRelay = Array.isArray(result?.perRelay)
            ? result.perRelay.filter((entry) => entry && entry.ok)
            : [];

          if (!perRelay.length) {
            this.markDiscussionCountError(container, { unsupported: true });
            return result;
          }

          const total = Number(result?.total);
          const normalized =
            Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0;
          this.videoDiscussionCountCache.set(video.id, normalized);
          this.updateDiscussionCountElement(container, normalized);
          return result;
        })
        .catch((error) => {
          if (isDevMode && this.logger?.warn) {
            this.logger.warn(
              `[counts] Failed to fetch discussion count for ${video.id}:`,
              error
            );
          }
          this.markDiscussionCountError(container);
          throw error;
        })
        .finally(() => {
          this.inFlightDiscussionCounts.delete(video.id);
        });

      this.inFlightDiscussionCounts.set(video.id, request);
    });
  }

  buildDiscussionCountFilters(video) {
    if (!video || typeof video !== "object") {
      return [];
    }

    const filters = [];
    const eventId = typeof video.id === "string" ? video.id.trim() : "";
    if (eventId) {
      filters.push({ kinds: [1], "#e": [eventId] });
    }

    const address = this.getVideoAddressPointer(video);
    if (address) {
      filters.push({ kinds: [1], "#a": [address] });
    }

    return filters;
  }

  getVideoAddressPointer(video) {
    if (!video || typeof video !== "object") {
      return "";
    }

    const tags = Array.isArray(video.tags) ? video.tags : [];
    const dTag = tags.find(
      (tag) =>
        Array.isArray(tag) &&
        tag.length >= 2 &&
        tag[0] === "d" &&
        typeof tag[1] === "string" &&
        tag[1].trim()
    );

    if (!dTag) {
      return "";
    }

    const pubkey = typeof video.pubkey === "string" ? video.pubkey.trim() : "";
    if (!pubkey) {
      return "";
    }

    const identifier = dTag[1].trim();
    if (!identifier) {
      return "";
    }

    const kind =
      Number.isFinite(video.kind) && video.kind > 0
        ? Math.floor(video.kind)
        : 30078;

    return `${kind}:${pubkey}:${identifier}`;
  }

  setDiscussionCountPending(element) {
    if (!element) {
      return;
    }

    element.dataset.countState = "pending";
    const valueEl = element.querySelector("[data-discussion-count-value]");
    if (valueEl) {
      valueEl.textContent = "…";
    }
    element.removeAttribute("title");
  }

  updateDiscussionCountElement(element, count) {
    if (!element) {
      return;
    }

    const valueEl = element.querySelector("[data-discussion-count-value]");
    if (!valueEl) {
      return;
    }

    const numeric = Number(count);
    const safeValue =
      Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
    element.dataset.countState = "ready";
    valueEl.textContent = safeValue.toLocaleString();
    element.removeAttribute("title");
  }

  markDiscussionCountError(element, { unsupported = false } = {}) {
    if (!element) {
      return;
    }

    const valueEl = element.querySelector("[data-discussion-count-value]");
    if (valueEl) {
      valueEl.textContent = "—";
    }

    element.dataset.countState = unsupported ? "unsupported" : "error";

    if (unsupported) {
      element.title = COUNT_UNSUPPORTED_TITLE;
    } else {
      element.removeAttribute("title");
    }
  }
}

export { COUNT_UNSUPPORTED_TITLE };
