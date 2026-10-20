import { getUrlHealthBadgeOwner } from "../urlHealthObserver.js";
import { SHORT_TIMEOUT_MS } from "../constants.js";
import {
  isHlsUrl,
  prefersNativeHls,
  probeHlsManifest
} from "../services/hlsPlayback.js";

// Inflight cache is shared, so ownership also spans controller instances.
const urlProbeRecords = new WeakMap();

export default class UrlHealthController {
  constructor({
    state = {},
    utils = {},
    logger = {},
    constants = {},
    callbacks = {}
  } = {}) {
    this.state = state;
    this.utils = utils;
    this.logger = logger;
    this.constants = constants;
    this.callbacks = callbacks;

    this.activeVideoProbes = 0;
    this.videoProbeQueue = [];
    this.MAX_CONCURRENT_VIDEO_PROBES = 3;
  }

  getUrlHealthPlaceholderMarkup(options = {}) {
    const includeMargin = options?.includeMargin !== false;
    const classes = ["badge", "url-health-badge", "text-muted"];
    if (includeMargin) {
      classes.push("mt-sm");
    }

    return `
      <span
        class="${classes.join(" ")}"
        data-url-health-state="checking"
        data-variant="neutral"
        aria-live="polite"
        role="status"
      >
        ⏳ CDN
      </span>
    `;
  }

  updateUrlHealthBadge(
    badgeEl,
    state,
    videoId,
    owner = getUrlHealthBadgeOwner(badgeEl)
  ) {
    if (owner && !owner.active) return;
    if (!badgeEl) {
      return;
    }

    if (
      videoId &&
      badgeEl.dataset.urlHealthFor &&
      badgeEl.dataset.urlHealthFor !== videoId
    ) {
      return;
    }

    if (!badgeEl.isConnected) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          if (badgeEl.isConnected) {
            this.updateUrlHealthBadge(badgeEl, state, videoId, owner);
          }
        });
      }
      return;
    }

    const status = state?.status || "checking";
    const fallbackMessages = {
      healthy: "✅ CDN",
      offline: "❌ CDN",
      unknown: "⚠️ CDN",
      timeout: "⚠️ CDN timed out",
      checking: "⏳ CDN"
    };
    const message =
      state?.message || fallbackMessages[status] || fallbackMessages.checking;

    const hadCompactMargin =
      badgeEl.classList.contains("mt-sm") || badgeEl.classList.contains("mt-3");
    badgeEl.dataset.urlHealthState = status;
    const cardEl = badgeEl.closest(".card[data-video-id]");
    if (
      cardEl &&
      typeof this.utils.updateVideoCardSourceVisibility === "function"
    ) {
      cardEl.dataset.urlHealthState = status;
      this.utils.updateVideoCardSourceVisibility(cardEl);
    }
    badgeEl.setAttribute("aria-live", "polite");
    badgeEl.setAttribute("role", status === "offline" ? "alert" : "status");
    badgeEl.textContent = message;

    const classes = ["badge", "url-health-badge"];
    if (hadCompactMargin) {
      classes.push("mt-sm");
    }
    badgeEl.className = classes.join(" ");

    const variantMap = {
      healthy: "success",
      offline: "critical",
      unknown: "neutral",
      timeout: "neutral",
      checking: "neutral"
    };
    const variant = variantMap[status];
    if (variant) {
      badgeEl.dataset.variant = variant;
    } else if (badgeEl.dataset.variant) {
      delete badgeEl.dataset.variant;
    }

    const videoListView =
      this.callbacks.getVideoListView &&
      typeof this.callbacks.getVideoListView === "function"
        ? this.callbacks.getVideoListView()
        : null;

    if (
      videoId &&
      videoListView &&
      typeof videoListView.cacheUrlHealth === "function"
    ) {
      videoListView.cacheUrlHealth(videoId, {
        status,
        message,
        lastCheckedAt: Number.isFinite(state?.lastCheckedAt)
          ? state.lastCheckedAt
          : undefined
      });
    }
  }

  handleUrlHealthBadge({ video, url, badgeEl }) {
    if (!video?.id || !badgeEl || !url) {
      return;
    }

    const owner = getUrlHealthBadgeOwner(badgeEl) || { active: true };
    if (!owner.active) return;
    const eventId = video.id;
    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    if (!trimmedUrl) {
      return;
    }

    badgeEl.dataset.urlHealthFor = eventId;

    if (typeof this.state.getCachedUrlHealth === "function") {
      const cached = this.state.getCachedUrlHealth(eventId, trimmedUrl);
      if (cached) {
        this.updateUrlHealthBadge(badgeEl, cached, eventId);
        return;
      }
    }

    this.updateUrlHealthBadge(badgeEl, { status: "checking" }, eventId);

    if (!owner.active) return;

    // Try the primary url plus any additional NIP-71 source mirrors, so one dead
    // host doesn't mark a video offline when an alternate plays.
    const sources = Array.isArray(video?.sources) ? video.sources : [];
    const candidateUrls = [];
    const seenUrls = new Set();
    for (const candidate of [
      trimmedUrl,
      ...sources.map((s) =>
        s && typeof s.url === "string" ? s.url.trim() : ""
      )
    ]) {
      if (candidate && !seenUrls.has(candidate)) {
        seenUrls.add(candidate);
        candidateUrls.push(candidate);
      }
    }

    const probeOptions = { confirmPlayable: true };
    const getInFlight = this.state.getInFlightUrlProbe;
    const existingProbe =
      typeof getInFlight === "function"
        ? getInFlight(eventId, trimmedUrl, probeOptions)
        : null;

    const existingRecord = existingProbe && urlProbeRecords.get(existingProbe);
    if (existingProbe && !existingRecord?.cancelled) {
      const release = existingRecord
        ? this.retainUrlProbe(existingRecord, owner)
        : () => {};

      existingProbe
        .then((entry) => {
          release();
          if (entry && owner.active) {
            this.updateUrlHealthBadge(badgeEl, entry, eventId, owner);
          }
        })
        .catch((err) => {
          release();
          this.logger.warn(
            `[urlHealth] cached probe promise rejected for ${trimmedUrl}:`,
            err
          );
        });
      return;
    }

    const record = { owners: new Set(), cancelled: false, cancelQueued: null };
    const release = this.retainUrlProbe(record, owner);
    const probePromise = this.probeUrlList(candidateUrls, {
      ...probeOptions,
      lifecycle: record
    })
      .then((result) => {
        if (record.cancelled || result?.outcome === "cancelled") return null;
        const outcome = result?.outcome || "error";
        let entry;

        if (outcome === "ok") {
          entry = { status: "healthy", message: "✅ CDN" };
        } else if (outcome === "opaque" || outcome === "unknown") {
          entry = {
            status: "unknown",
            message: "⚠️ CDN"
          };
        } else if (outcome === "timeout") {
          entry = {
            status: "timeout",
            message: "⚠️ CDN timed out"
          };
        } else {
          entry = {
            status: "offline",
            message: "❌ CDN"
          };
        }

        const urlHealthConstants = this.constants.urlHealthConstants || {};
        const ttlOverride =
          entry.status === "timeout" || entry.status === "unknown"
            ? urlHealthConstants.URL_HEALTH_TIMEOUT_RETRY_MS
            : undefined;

        if (typeof this.state.storeUrlHealth === "function") {
          return this.state.storeUrlHealth(
            eventId,
            trimmedUrl,
            entry,
            ttlOverride
          );
        }
        return entry;
      })
      .catch((err) => {
        if (record.cancelled) return null;
        this.logger.warn(`[urlHealth] probe failed for ${trimmedUrl}:`, err);
        const entry = {
          status: "offline",
          message: "❌ CDN"
        };
        if (typeof this.state.storeUrlHealth === "function") {
          return this.state.storeUrlHealth(eventId, trimmedUrl, entry);
        }
        return entry;
      });

    urlProbeRecords.set(probePromise, record);
    if (typeof this.state.setInFlightUrlProbe === "function") {
      this.state.setInFlightUrlProbe(
        eventId,
        trimmedUrl,
        probePromise,
        probeOptions
      );
    }

    probePromise
      .then((entry) => {
        release();
        if (entry && owner.active) {
          this.updateUrlHealthBadge(badgeEl, entry, eventId, owner);
        }
      })
      .catch((err) => {
        release();
        this.logger.warn(
          `[urlHealth] probe promise rejected post-cache for ${trimmedUrl}:`,
          err
        );
      });
  }

  retainUrlProbe(record, owner) {
    record.owners.add(owner);
    const onDispose = () => {
      record.owners.delete(owner);
      if (!record.owners.size) record.cancelQueued?.();
    };
    owner.releases?.add(onDispose);
    return () => {
      record.owners.delete(owner);
      owner.releases?.delete(onDispose);
    };
  }

  async probeUrlWithVideoElement(url, timeoutMs, lifecycle) {
    const defaultTimeout =
      this.constants.URL_PROBE_TIMEOUT_MS || SHORT_TIMEOUT_MS;
    const effectiveTimeout =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultTimeout;

    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed || typeof document === "undefined") {
      return { outcome: "error" };
    }

    // A bare <video> cannot load an .m3u8 on the browsers bitvid actually runs
    // hls.js on. Worse, Chrome neither plays it NOR errors — it emits no events
    // at all, so this probe burned the full timeout on every healthy HLS card.
    // Since playback will use hls.js (which fetches the playlist over CORS), a
    // readable #EXTM3U response is the accurate signal — and far cheaper than
    // pulling in the hls.js bundle just to paint a badge.
    if (isHlsUrl(trimmed) && !prefersNativeHls()) {
      const defaultTimeout =
        this.constants.URL_PROBE_TIMEOUT_MS || SHORT_TIMEOUT_MS;
      const effective =
        Number.isFinite(timeoutMs) && timeoutMs > 0
          ? timeoutMs
          : defaultTimeout;
      const outcome = await probeHlsManifest(trimmed, effective);
      return { outcome };
    }

    if (lifecycle && !lifecycle.owners.size) {
      lifecycle.cancelled = true;
      return { outcome: "cancelled" };
    }
    if (this.activeVideoProbes >= this.MAX_CONCURRENT_VIDEO_PROBES) {
      const acquired = await new Promise((resolve) => {
        const job = {
          resume: () => {
            if (lifecycle) lifecycle.cancelQueued = null;
            // Reserve the slot synchronously, before another caller can use it.
            this.activeVideoProbes++;
            resolve(true);
          }
        };
        this.videoProbeQueue.push(job);
        if (lifecycle) {
          lifecycle.cancelQueued = () => {
            const index = this.videoProbeQueue.indexOf(job);
            if (index < 0) return;
            this.videoProbeQueue.splice(index, 1);
            lifecycle.cancelled = true;
            lifecycle.cancelQueued = null;
            resolve(false);
          };
        }
      });
      if (!acquired) return { outcome: "cancelled" };
    } else {
      this.activeVideoProbes++;
    }

    try {
      if (lifecycle && !lifecycle.owners.size) {
        lifecycle.cancelled = true;
        return { outcome: "cancelled" };
      }
      return await new Promise((resolve) => {
        const video = document.createElement("video");
        let settled = false;
        let timeoutId = null;

        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          video.removeEventListener("loadeddata", handleSuccess);
          video.removeEventListener("canplay", handleSuccess);
          video.removeEventListener("error", handleError);
          try {
            video.pause();
          } catch (err) {
            // ignore pause failures
          }
          try {
            video.removeAttribute("src");
            video.load();
          } catch (err) {
            // ignore cleanup failures
          }
        };

        const settle = (result) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(result);
        };

        const handleSuccess = () => {
          settle({ outcome: "ok" });
        };

        const handleError = () => {
          settle({ outcome: "error" });
        };

        if (Number.isFinite(effectiveTimeout) && effectiveTimeout > 0) {
          timeoutId = setTimeout(() => {
            settle({ outcome: "timeout" });
          }, effectiveTimeout);
        }

        try {
          video.preload = "metadata";
          video.muted = true;
          video.playsInline = true;
          video.addEventListener("loadeddata", handleSuccess, { once: true });
          video.addEventListener("canplay", handleSuccess, { once: true });
          video.addEventListener("error", handleError, { once: true });
          video.src = trimmed;
          video.load();
        } catch (err) {
          settle({ outcome: "error", error: err });
        }
      });
    } finally {
      this.activeVideoProbes--;
      if (this.videoProbeQueue.length > 0) {
        const next = this.videoProbeQueue.shift();
        next.resume();
      }
    }
  }

  // Probe several candidate URLs (mirrors) in order; "ok" as soon as one is
  // playable, "timeout" if none played but at least one timed out, else
  // "offline". Lets a video with a dead primary host survive on a live mirror.
  async probeUrlList(urls, options = {}) {
    const list = Array.isArray(urls)
      ? urls.filter((u) => typeof u === "string" && u.trim())
      : [];
    if (!list.length) {
      return { outcome: "error" };
    }
    let sawTimeout = false;
    for (const url of list) {
      // Completed active work may still cache its result, but starting another
      // source requires a live owner (including a card that rejoined meanwhile).
      if (options.lifecycle && !options.lifecycle.owners.size) {
        options.lifecycle.cancelled = true;
        return { outcome: "cancelled" };
      }
      let result;
      try {
        result = await this.probeUrl(url, options);
      } catch (err) {
        this.logger.warn(`[probeUrlList] probe threw for ${url}:`, err);
        continue;
      }
      const outcome = result?.outcome;
      if (outcome === "cancelled") return result;
      if (outcome === "ok") {
        return { outcome: "ok", url };
      }
      if (outcome === "timeout") {
        sawTimeout = true;
      }
    }
    return { outcome: sawTimeout ? "timeout" : "offline" };
  }

  async probeUrl(url, options = {}) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) {
      return { outcome: "invalid" };
    }

    const confirmPlayable = options?.confirmPlayable === true;
    const defaultTimeout =
      this.constants.URL_PROBE_TIMEOUT_MS || SHORT_TIMEOUT_MS;
    const urlHealthConstants = this.constants.urlHealthConstants || {};

    const confirmWithVideoElement = async () => {
      if (!confirmPlayable) {
        return null;
      }

      const initialTimeout =
        Number.isFinite(options?.videoProbeTimeoutMs) &&
        options.videoProbeTimeoutMs > 0
          ? options.videoProbeTimeoutMs
          : defaultTimeout;

      const attemptWithTimeout = async (timeoutMs) => {
        try {
          const result = await this.probeUrlWithVideoElement(
            trimmed,
            timeoutMs,
            options.lifecycle
          );
          if (result && result.outcome) {
            return result;
          }
        } catch (err) {
          this.logger.warn(
            `[probeUrl] Video element probe threw for ${trimmed}:`,
            err
          );
        }
        return null;
      };

      let result = await attemptWithTimeout(initialTimeout);

      if (
        result &&
        result.outcome === "timeout" &&
        Number.isFinite(urlHealthConstants.URL_PROBE_TIMEOUT_RETRY_MS) &&
        urlHealthConstants.URL_PROBE_TIMEOUT_RETRY_MS > initialTimeout
      ) {
        const retryResult = await attemptWithTimeout(
          urlHealthConstants.URL_PROBE_TIMEOUT_RETRY_MS
        );
        if (retryResult) {
          result = { ...retryResult, retriedAfterTimeout: true };
        }
      }

      return result;
    };

    const supportsAbort = typeof AbortController !== "undefined";
    const controller = supportsAbort ? new AbortController() : null;
    let timeoutId = null;

    const racers = [
      fetch(trimmed, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: controller ? controller.signal : undefined
      })
    ];

    if (Number.isFinite(defaultTimeout) && defaultTimeout > 0) {
      racers.push(
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            if (controller) {
              try {
                controller.abort();
              } catch (err) {
                // ignore abort errors
              }
            }
            resolve({ outcome: "timeout" });
          }, defaultTimeout);
        })
      );
    }

    let responseOrTimeout;
    try {
      responseOrTimeout = await Promise.race(racers);
    } catch (err) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.logger.warn(`[probeUrl] HEAD request failed for ${trimmed}:`, err);
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return confirmPlayable
        ? { outcome: "error", error: err }
        : { outcome: "unknown", error: err };
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (responseOrTimeout && responseOrTimeout.outcome === "timeout") {
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return confirmPlayable ? { outcome: "timeout" } : { outcome: "unknown" };
    }

    const response = responseOrTimeout;
    if (!response) {
      return { outcome: "error" };
    }

    if (response.type === "opaque") {
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return { outcome: confirmPlayable ? "opaque" : "unknown" };
    }

    if (!response.ok) {
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return {
        outcome: "bad",
        status: response.status
      };
    }

    const playbackCheck = await confirmWithVideoElement();
    if (playbackCheck) {
      if (playbackCheck.outcome === "ok") {
        return {
          ...playbackCheck,
          status: response.status
        };
      }
      return playbackCheck;
    }

    return {
      outcome: "ok",
      status: response.status
    };
  }
}
