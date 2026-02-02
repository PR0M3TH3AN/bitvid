export default class UrlHealthController {
  constructor({
    state = {},
    utils = {},
    logger = {},
    constants = {},
    callbacks = {},
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

  updateUrlHealthBadge(badgeEl, state, videoId) {
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
            this.updateUrlHealthBadge(badgeEl, state, videoId);
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
      checking: "⏳ CDN",
    };
    const message =
      state?.message ||
      fallbackMessages[status] ||
      fallbackMessages.checking;

    const hadCompactMargin =
      badgeEl.classList.contains("mt-sm") || badgeEl.classList.contains("mt-3");
    badgeEl.dataset.urlHealthState = status;
    const cardEl = badgeEl.closest(".card[data-video-id]");
    if (cardEl && typeof this.utils.updateVideoCardSourceVisibility === "function") {
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
      checking: "neutral",
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
          : undefined,
      });
    }
  }

  handleUrlHealthBadge({ video, url, badgeEl }) {
    if (!video?.id || !badgeEl || !url) {
      return;
    }

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

    const probeOptions = { confirmPlayable: true };
    const getInFlight = this.state.getInFlightUrlProbe;
    const existingProbe =
      typeof getInFlight === "function"
        ? getInFlight(eventId, trimmedUrl, probeOptions)
        : null;

    if (existingProbe) {
      existingProbe
        .then((entry) => {
          if (entry) {
            this.updateUrlHealthBadge(badgeEl, entry, eventId);
          }
        })
        .catch((err) => {
          this.logger.warn(
            `[urlHealth] cached probe promise rejected for ${trimmedUrl}:`,
            err
          );
        });
      return;
    }

    const probePromise = this.probeUrl(trimmedUrl, probeOptions)
      .then((result) => {
        const outcome = result?.outcome || "error";
        let entry;

        if (outcome === "ok") {
          entry = { status: "healthy", message: "✅ CDN" };
        } else if (outcome === "opaque" || outcome === "unknown") {
          entry = {
            status: "unknown",
            message: "⚠️ CDN",
          };
        } else if (outcome === "timeout") {
          entry = {
            status: "timeout",
            message: "⚠️ CDN timed out",
          };
        } else {
          entry = {
            status: "offline",
            message: "❌ CDN",
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
        this.logger.warn(`[urlHealth] probe failed for ${trimmedUrl}:`, err);
        const entry = {
          status: "offline",
          message: "❌ CDN",
        };
        if (typeof this.state.storeUrlHealth === "function") {
          return this.state.storeUrlHealth(eventId, trimmedUrl, entry);
        }
        return entry;
      });

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
        if (entry) {
          this.updateUrlHealthBadge(badgeEl, entry, eventId);
        }
      })
      .catch((err) => {
        this.logger.warn(
          `[urlHealth] probe promise rejected post-cache for ${trimmedUrl}:`,
          err
        );
      });
  }

  async probeUrlWithVideoElement(url, timeoutMs) {
    const defaultTimeout = this.constants.URL_PROBE_TIMEOUT_MS || 5000;
    const effectiveTimeout =
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultTimeout;

    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed || typeof document === "undefined") {
      return { outcome: "error" };
    }

    if (this.activeVideoProbes >= this.MAX_CONCURRENT_VIDEO_PROBES) {
      await new Promise((resolve) => {
        this.videoProbeQueue.push(resolve);
      });
    }

    this.activeVideoProbes++;

    try {
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
        if (typeof next === "function") {
          next();
        }
      }
    }
  }

  async probeUrl(url, options = {}) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) {
      return { outcome: "invalid" };
    }

    const confirmPlayable = options?.confirmPlayable === true;
    const defaultTimeout = this.constants.URL_PROBE_TIMEOUT_MS || 5000;
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
            timeoutMs
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
        signal: controller ? controller.signal : undefined,
      }),
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
        status: response.status,
      };
    }

    const playbackCheck = await confirmWithVideoElement();
    if (playbackCheck) {
      if (playbackCheck.outcome === "ok") {
        return {
          ...playbackCheck,
          status: response.status,
        };
      }
      return playbackCheck;
    }

    return {
      outcome: "ok",
      status: response.status,
    };
  }
}
