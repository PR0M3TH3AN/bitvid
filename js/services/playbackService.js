import { userLogger } from "../utils/logger.js";
import { PLAYBACK_START_TIMEOUT } from "../constants.js";
import { getCurrentVideo, setCurrentVideo } from "../state/appState.js";
import {
  SimpleEventEmitter,
  HOSTED_URL_SUCCESS_MESSAGE,
  DEFAULT_UNSUPPORTED_BTITH_MESSAGE,
  PROBE_CACHE_TTL_MS,
  extractWebSeedsFromMagnet,
  getHostedUrlFailureDetails,
  getHostedVideoErrorMessage,
  getTorrentErrorMessage,
} from "./playbackServiceHelpers.js";

// js/services/playbackService.js

/**
 * PlaybackService acts as the central conductor for video playback.
 * It manages the lifecycle of a "PlaybackSession", which encapsulates the complex
 * logic of attempting to play a video from a direct URL (HTTP/CDN) first, and
 * falling back to a WebTorrent (P2P) stream if the URL is unreachable or stalls.
 *
 * Key Responsibilities:
 * - Singleton-ish orchestration (only one active session at a time usually).
 * - "Watchdog" monitoring: It attaches listeners to the <video> element to detect
 *   frozen playback (stalls) or errors.
 * - Fallback logic: If the direct URL fails (404, network error) or playback
 *   stalls, it seamlessly triggers the P2P engine (WebTorrent).
 * - Race Condition Management: Uses "request signatures" to ensure that if the user
 *   clicks "Play" on a new video while the previous one is still loading, the
 *   old session is cancelled and doesn't overwrite the new one.
 */

/**
 * Service for orchestrating video playback.
 * Handles the "Hybrid Playback" strategy: probing hosted URLs, managing fallbacks to WebTorrent,
 * and monitoring playback health via watchdogs.
 */
export class PlaybackService {
  /**
   * @param {Object} config
   * @param {Function} [config.logger] - Logger function.
   * @param {Object} [config.torrentClient] - WebTorrent client instance.
   * @param {Function} [config.deriveTorrentPlaybackConfig] - Helper to parse magnet/URL.
   * @param {Function} [config.isValidMagnetUri] - Helper to validate magnet strings.
   * @param {boolean} [config.urlFirstEnabled=true] - Whether to attempt URL playback before Torrent.
   * @param {Object} [config.analyticsCallbacks] - Callbacks for telemetry.
   * @param {number} [config.playbackStartTimeout] - Ms to wait for playback start before fallback.
   */
  constructor({
    logger,
    torrentClient,
    deriveTorrentPlaybackConfig,
    isValidMagnetUri,
    urlFirstEnabled = true,
    analyticsCallbacks = {},
    playbackStartTimeout = PLAYBACK_START_TIMEOUT,
  } = {}) {
    if (typeof logger === "function") {
      this.logger = logger;
    } else if (logger && typeof logger.log === "function") {
      this.logger = (...args) => logger.log(...args);
    } else {
      this.logger = () => {};
    }

    this.torrentClient = torrentClient;
    this.deriveTorrentPlaybackConfig = deriveTorrentPlaybackConfig;
    this.isValidMagnetUri = isValidMagnetUri;
    this.urlFirstEnabled = !!urlFirstEnabled;
    this.analyticsCallbacks = analyticsCallbacks || {};
    this.playbackStartTimeout = playbackStartTimeout;
    this.currentSession = null;
    this.probeCache = new Map();
    this.probeInFlight = new Map();
    this.probeCacheTtlMs = PROBE_CACHE_TTL_MS;
  }

  get currentVideo() {
    return getCurrentVideo();
  }

  set currentVideo(value) {
    setCurrentVideo(value);
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (err) {
      userLogger.warn("[PlaybackService] logger threw", err);
    }
  }

  handleAnalyticsEvent(eventName, detail) {
    const callbacks = this.analyticsCallbacks || {};
    if (typeof callbacks.onEvent === "function") {
      try {
        callbacks.onEvent(eventName, detail);
      } catch (err) {
        this.log("[PlaybackService] onEvent callback threw", err);
      }
    }
    const specific = callbacks[eventName];
    if (typeof specific === "function") {
      try {
        specific(detail);
      } catch (err) {
        this.log(`[PlaybackService] ${eventName} callback threw`, err);
      }
    }
  }

  /**
   * Generates a cache key for probe results based on URL and magnet.
   * @param {Object} params
   * @param {string} params.url
   * @param {string} params.magnet
   * @returns {string} Cache key.
   */
  getProbeCacheKey({ url, magnet }) {
    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    return `${trimmedUrl}::${trimmedMagnet}`;
  }

  /**
   * Removes expired probe results from the cache.
   * @param {number} [now=Date.now()]
   */
  pruneProbeCache(now = Date.now()) {
    for (const [key, entry] of this.probeCache.entries()) {
      if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
        this.probeCache.delete(key);
      }
    }
  }

  /**
   * Retrieves a valid cached probe result if available.
   * @param {string} cacheKey
   * @param {number} [now=Date.now()]
   * @returns {Object|null} Cached result or null.
   */
  getCachedProbeResult(cacheKey, now = Date.now()) {
    this.pruneProbeCache(now);
    const entry = this.probeCache.get(cacheKey);
    if (!entry || entry.expiresAt <= now) {
      return null;
    }
    return entry.result;
  }

  /**
   * Caches a probe result.
   * @param {string} cacheKey
   * @param {Object} result
   * @param {number} [now=Date.now()]
   */
  storeProbeResult(cacheKey, result, now = Date.now()) {
    const ttl =
      Number.isFinite(this.probeCacheTtlMs) && this.probeCacheTtlMs > 0
        ? this.probeCacheTtlMs
        : PROBE_CACHE_TTL_MS;
    this.probeCache.set(cacheKey, { result, expiresAt: now + ttl });
  }

  /**
   * Probes a hosted URL to check for availability (e.g. via HEAD request).
   * Handles caching and in-flight deduplication.
   * @param {Object} params
   * @param {string} params.url - URL to probe.
   * @param {string} params.magnet - Associated magnet (part of cache key).
   * @param {Function} [params.probeUrl] - Function to perform the actual network probe.
   * @returns {Promise<Object>} Probe result ({ outcome: 'success'|'bad'|..., status: number, error: Error }).
   */
  async probeHostedUrl({ url, magnet, probeUrl } = {}) {
    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    if (!sanitizedUrl) {
      return { outcome: "invalid" };
    }
    const cacheKey = this.getProbeCacheKey({
      url: sanitizedUrl,
      magnet,
    });
    const cachedResult = this.getCachedProbeResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    const inFlight = this.probeInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const probePromise = (async () => {
      try {
        const result =
          typeof probeUrl === "function"
            ? await probeUrl(sanitizedUrl)
            : { outcome: "error" };
        this.storeProbeResult(cacheKey, result);
        return result;
      } catch (error) {
        const result = { outcome: "error", error };
        this.storeProbeResult(cacheKey, result);
        return result;
      } finally {
        this.probeInFlight.delete(cacheKey);
      }
    })();

    this.probeInFlight.set(cacheKey, probePromise);
    return probePromise;
  }

  /**
   * Configures the video element (muting logic, autoplay detection).
   * @param {HTMLVideoElement} videoElement
   */
  prepareVideoElement(videoElement) {
    if (!videoElement) {
      return;
    }
    const storedUnmuted = localStorage.getItem("unmutedAutoplay");
    const userWantsUnmuted = storedUnmuted === "true";
    videoElement.muted = !userWantsUnmuted;

    if (!videoElement.dataset.autoplayBound) {
      videoElement.addEventListener("volumechange", () => {
        localStorage.setItem(
          "unmutedAutoplay",
          (!videoElement.muted).toString()
        );
      });
      videoElement.dataset.autoplayBound = "true";
    }
  }

  /**
   * Registers a set of event listeners ("watchdogs") on the video element to detect
   * when playback has stalled or failed.
   *
   * This is critical for the "Hybrid" playback strategy. We attempt to play the
   * direct URL (which is cheap and fast). If it hangs (e.g., buffering forever)
   * or errors out, this watchdog fires the `onFallback` callback, which triggers
   * the switch to P2P.
   *
   * @param {HTMLVideoElement} videoElement
   * @param {object} options
   * @param {number} options.stallMs - How long to wait without progress before considering it a "stall".
   * @param {Function} options.onSuccess - Called if playback starts successfully (clears the watchdog).
   * @param {Function} options.onFallback - Called if playback fails or stalls.
   * @returns {Function} cleanup function to remove listeners.
   */
  registerUrlPlaybackWatchdogs(
    videoElement,
    { stallMs = 8000, onSuccess, onFallback } = {}
  ) {
    if (!videoElement || typeof onFallback !== "function") {
      return () => {};
    }

    const normalizedStallMs = Number.isFinite(stallMs) && stallMs > 0 ? stallMs : 0;
    this.log(
      `[registerUrlPlaybackWatchdogs] Installing watchdogs (stallMs=${normalizedStallMs}) readyState=${videoElement.readyState} networkState=${videoElement.networkState}`
    );

    let active = true;
    let stallTimerId = null;
    const listeners = [];

    const cleanup = () => {
      if (!active) {
        return;
      }
      active = false;
      if (stallTimerId) {
        clearTimeout(stallTimerId);
        stallTimerId = null;
      }
      for (const [eventName, handler] of listeners) {
        videoElement.removeEventListener(eventName, handler);
      }
    };

    const triggerFallback = (reason) => {
      if (!active) {
        return;
      }
      this.log(
        `[registerUrlPlaybackWatchdogs] Triggering fallback (${reason}) readyState=${videoElement.readyState} networkState=${videoElement.networkState}`
      );
      cleanup();
      onFallback(reason);
    };

    const handleSuccess = () => {
      if (!active) {
        return;
      }
      this.log(
        "[registerUrlPlaybackWatchdogs] Hosted playback signaled success; clearing watchdogs."
      );
      cleanup();
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    };

    // The timer is reset on any "progress" event. If `stallMs` passes without
    // a reset, we assume the connection is dead/stalled and fallback.
    const resetTimer = () => {
      if (!active || !normalizedStallMs) {
        return;
      }
      if (stallTimerId) {
        clearTimeout(stallTimerId);
      }
      stallTimerId = setTimeout(() => triggerFallback("stall"), normalizedStallMs);
    };

    const addListener = (eventName, handler) => {
      videoElement.addEventListener(eventName, handler);
      listeners.push([eventName, handler]);
    };

    // Immediate failure conditions
    addListener("error", () => triggerFallback("error"));
    addListener("abort", () => triggerFallback("abort"));
    addListener("stalled", () => triggerFallback("stalled"));

    // Success conditions
    addListener("playing", handleSuccess);
    addListener("ended", handleSuccess);

    // Keep-alive events that reset the stall timer
    const timerEvents = [
      "timeupdate",
      "progress",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "suspend",
      "waiting",
    ];
    for (const eventName of timerEvents) {
      addListener(eventName, resetTimer);
    }

    if (normalizedStallMs) {
      resetTimer();
    }

    return () => {
      this.log("[registerUrlPlaybackWatchdogs] Manual watchdog cleanup invoked.");
      cleanup();
    };
  }

  /**
   * Cleans up the watchdog of the current session.
   */
  cleanupWatchdog() {
    if (this.currentSession) {
      this.currentSession.cleanupWatchdog();
    }
  }

  /**
   * Creates a new playback session.
   * @param {Object} options - Options for PlaybackSession.
   * @returns {PlaybackSession} The created session.
   */
  createSession(options = {}) {
    const session = new PlaybackSession(this, {
      ...options,
      playbackStartTimeout: this.playbackStartTimeout,
    });
    this.currentSession = session;
    return session;
  }
}

/**
 * PlaybackSession represents a single attempt to play a specific video.
 * It manages the state machine of:
 * 1. Probing the direct URL.
 * 2. Attempting to play the URL.
 * 3. Monitoring for stalls.
 * 4. Falling back to WebTorrent if needed.
 *
 * It uses a `requestSignature` (JSON of url+magnet) to uniquely identify the request.
 * This is used by the UI layer to prevent race conditions: if the user clicks a new video,
 * the UI can check `matchesRequestSignature` to see if it can reuse the active session
 * or if it needs to spin up a new one.
 */
class PlaybackSession extends SimpleEventEmitter {
  /**
   * @param {PlaybackService} service - Parent service instance.
   * @param {Object} options
   * @param {string} [options.url] - Direct playback URL.
   * @param {string} [options.magnet] - Magnet URI.
   * @param {string} [options.requestSignature] - Unique ID for deduplication.
   * @param {HTMLVideoElement} [options.videoElement] - The target video element.
   * @param {Function} [options.probeUrl] - Function to probe URL validity.
   * @param {Function} [options.playViaWebTorrent] - Function to start torrent playback.
   * @param {Function} [options.showModalWithPoster] - UI callback.
   * @param {Function} [options.teardownVideoElement] - UI callback.
   * @param {string} [options.forcedSource] - 'url' or 'torrent' override.
   */
  constructor(service, options = {}) {
    super((message, ...args) => service.log(message, ...args));
    this.service = service;
    this.options = options;
    this.watchdogCleanup = null;
    this.result = { source: null };
    this.finished = false;
    this.startPromise = null;

    this.sanitizedUrl =
      typeof options.url === "string" ? options.url.trim() : "";
    this.trimmedMagnet =
      typeof options.magnet === "string" ? options.magnet.trim() : "";

    // The signature prevents duplicate work if the same video is requested again
    // while already loading/playing.
    this.requestSignature =
      typeof options.requestSignature === "string"
        ? options.requestSignature
        : JSON.stringify({
            url: this.sanitizedUrl,
            magnet: this.trimmedMagnet,
          });

    if (typeof service.deriveTorrentPlaybackConfig === "function") {
      this.playbackConfig = service.deriveTorrentPlaybackConfig({
        magnet: this.trimmedMagnet,
        url: this.sanitizedUrl,
        logger: (message) => service.log(message),
        appProtocol: options.appProtocol,
      });
    } else {
      this.playbackConfig = {
        magnet: this.trimmedMagnet,
        fallbackMagnet: "",
        provided: !!this.trimmedMagnet,
        usedInfoHash: false,
        originalInput: this.trimmedMagnet,
        didMutate: false,
        infoHash: "",
      };
    }

    const magnetIsUsable =
      typeof service.isValidMagnetUri === "function"
        ? service.isValidMagnetUri(this.playbackConfig.magnet)
        : false;

    this.magnetForPlayback = magnetIsUsable
      ? this.playbackConfig.magnet
      : "";
    this.fallbackMagnet = magnetIsUsable
      ? this.playbackConfig.fallbackMagnet
      : "";
    this.magnetProvided = !!this.playbackConfig.provided;
  }

  /**
   * Checks if the session is currently active (not finished).
   * @returns {boolean}
   */
  isActive() {
    return !this.finished;
  }

  /**
   * Determines if this session corresponds to the given signature.
   * Used for request deduplication.
   * @param {string} signature
   * @returns {boolean}
   */
  matchesRequestSignature(signature) {
    if (!this.isActive()) {
      return false;
    }
    if (typeof signature !== "string" || !signature) {
      return false;
    }
    return signature === this.requestSignature;
  }

  getResult() {
    return this.result;
  }

  getPlaybackConfig() {
    return this.playbackConfig;
  }

  getMagnetForPlayback() {
    return this.magnetForPlayback;
  }

  getFallbackMagnet() {
    return this.fallbackMagnet;
  }

  getMagnetProvided() {
    return this.magnetProvided;
  }

  /**
   * Cleans up any active watchdog listeners.
   */
  cleanupWatchdog() {
    if (typeof this.watchdogCleanup === "function") {
      try {
        this.watchdogCleanup();
      } catch (err) {
        this.service.log("[PlaybackSession] Watchdog cleanup threw", err);
      } finally {
        this.watchdogCleanup = null;
      }
    }
  }

  /**
   * Registers new watchdog listeners on the video element.
   * @param {HTMLVideoElement} videoElement
   * @param {Object} options
   */
  registerWatchdogs(videoElement, options) {
    this.cleanupWatchdog();
    this.watchdogCleanup = this.service.registerUrlPlaybackWatchdogs(
      videoElement,
      options
    );
  }

  /**
   * Attaches debug listeners to log video element events.
   * @param {HTMLVideoElement} videoElement
   * @returns {Function} Cleanup function.
   */
  attachDebugListeners(videoElement) {
    if (!videoElement) {
      return () => {};
    }

    const debugEvents = [
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "play",
      "playing",
      "pause",
      "stalled",
      "suspend",
      "waiting",
      "ended",
      "error",
    ];

    const handlers = [];
    for (const eventName of debugEvents) {
      const handler = () => {
        const { readyState, networkState, currentTime, paused, error } =
          videoElement;
        let suffix =
          `readyState=${readyState} networkState=${networkState} currentTime=${
            Number.isFinite(currentTime) ? currentTime.toFixed(2) : currentTime
          } paused=${paused}`;
        if (eventName === "error" && error) {
          const errorMessage = error.message || "";
          suffix += ` code=${error.code || ""} message=${errorMessage}`;
        }
        this.service.log(
          `[playVideoWithFallback] <video> event ${eventName}; ${suffix}`
        );
      };
      videoElement.addEventListener(eventName, handler);
      handlers.push([eventName, handler]);
    }

    return () => {
      if (!handlers.length) {
        return;
      }
      for (const [eventName, handler] of handlers) {
        videoElement.removeEventListener(eventName, handler);
      }
      handlers.length = 0;
    };
  }

  /**
   * Begins the playback flow. Returns a promise that resolves when playback
   * has either successfully started (URL or Torrent) or fatally failed.
   * @returns {Promise<Object>} The result object { source: 'url'|'torrent'|null, error? }.
   */
  async start() {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = this.execute();
    return this.startPromise;
  }

  /**
   * The core execution loop for the session.
   * Flow:
   * 1. Check if forced source (e.g. user manually switched to "Torrent")
   * 2. If URL available & URL-first enabled:
   *    a. Probe the URL (HEAD request) to see if it's reachable.
   *    b. If probe succeeds, attempt to play.
   *    c. Attach watchdogs.
   *    d. If watchdog triggers (stall/error), trigger `startTorrentFallback`.
   * 3. If URL fails or not available, call `startTorrentFallback`.
   */
  async execute() {
    const {
      videoElement,
      waitForCleanup,
      cancelPendingViewLogging,
      clearActiveIntervals,
      showModalWithPoster,
      teardownVideoElement,
      probeUrl,
      playViaWebTorrent,
      autoplay,
      unsupportedBtihMessage = DEFAULT_UNSUPPORTED_BTITH_MESSAGE,
      forcedSource = null,
      playbackStartTimeout = PLAYBACK_START_TIMEOUT,
    } = this.options;

    this.result = { source: null };
    this.finished = false;

    const detail = {
      urlProvided: !!this.sanitizedUrl,
      magnetProvided: this.magnetProvided,
      magnetUsable: !!this.magnetForPlayback,
    };
    this.service.handleAnalyticsEvent("session-start", detail);
    this.emit("session-start", detail);

    try {
      // --- Step 0: Pre-flight cleanup and UI preparation ---
      if (typeof waitForCleanup === "function") {
        await waitForCleanup();
      }
      if (typeof cancelPendingViewLogging === "function") {
        cancelPendingViewLogging();
      }

      if (!videoElement) {
        throw new Error("Video element is not ready for playback.");
      }

      if (typeof showModalWithPoster === "function") {
        await Promise.resolve(showModalWithPoster());
      }

      this.emit("status", { message: "Preparing video..." });

      if (typeof clearActiveIntervals === "function") {
        clearActiveIntervals();
      }

      this.service.prepareVideoElement(videoElement);

      if (
        this.service.torrentClient &&
        typeof this.service.torrentClient.cleanup === "function"
      ) {
        await this.service.torrentClient.cleanup();
      }

      const activeVideoEl =
        typeof teardownVideoElement === "function"
          ? teardownVideoElement(videoElement) || videoElement
          : videoElement;

      if (!activeVideoEl) {
        throw new Error("Video element is not ready for playback.");
      }

      this.options.videoElement = activeVideoEl;
      this.emit("video-prepared", { videoElement: activeVideoEl });
      this.emit("view-logging-request", { videoElement: activeVideoEl });

      const cleanupDebugListeners = this.attachDebugListeners(activeVideoEl);
      let cleanupHostedUrlStatusListeners = () => {};

      // --- Step 1: WebSeed and Source Preparation ---
      const httpsUrl = this.sanitizedUrl;
      const webSeedCandidates = [];
      const webSeedSet = new Set();

      const addWebSeedCandidate = (candidate) => {
        if (typeof candidate !== "string") {
          return;
        }
        const trimmed = candidate.trim();
        if (!trimmed) {
          return;
        }
        const key = trimmed.toLowerCase();
        if (webSeedSet.has(key)) {
          return;
        }
        webSeedSet.add(key);
        webSeedCandidates.push(trimmed);
      };

      // Add the hosted URL as a webseed candidate
      if (httpsUrl) {
        addWebSeedCandidate(httpsUrl);
      }

      // Add any webseeds found in the magnet link
      const magnetWebSeeds = extractWebSeedsFromMagnet(this.magnetForPlayback);
      if (magnetWebSeeds.length > 0) {
        magnetWebSeeds.forEach((seed) => addWebSeedCandidate(seed));
      }

      if (webSeedCandidates.length > 0) {
        this.service.log(
          `[playVideoWithFallback] Adding ${webSeedCandidates.length} web seed candidate(s) for fallback:`,
          webSeedCandidates
        );
      }

      const resetVideoElement = () => {
        if (!activeVideoEl) return;
        try {
          activeVideoEl.pause();
        } catch (err) {
          this.service.log("[playVideoWithFallback] Pause threw during reset:", err);
        }
        try {
          activeVideoEl.removeAttribute("src");
        } catch (err) {
          // ignore
        }
        activeVideoEl.src = "";
        activeVideoEl.srcObject = null;
        try {
          activeVideoEl.load();
        } catch (err) {
          this.service.log("[playVideoWithFallback] Load threw during reset:", err);
        }
      };

      // --- Helper: Torrent Playback Attempt ---
      let torrentAttempted = false;
      const attemptTorrentPlayback = async (reason) => {
        if (torrentAttempted) return null;
        torrentAttempted = true;

        this.cleanupWatchdog();
        cleanupHostedUrlStatusListeners();
        cleanupDebugListeners();
        resetVideoElement();

        if (!this.magnetForPlayback) {
          // No magnet available to try
          return null;
        }

        this.emit("status", { message: "Switching to WebTorrent..." });
        this.service.handleAnalyticsEvent("fallback", { reason });
        this.emit("fallback", { reason });

        if (typeof playViaWebTorrent !== "function") {
          throw new Error("No torrent playback handler provided.");
        }

        let torrentInstance;
        try {
          torrentInstance = await playViaWebTorrent(this.magnetForPlayback, {
            fallbackMagnet: this.fallbackMagnet,
            urlList: webSeedCandidates,
          });
        } catch (err) {
          const errorMessage = getTorrentErrorMessage(err);
          if (errorMessage) {
            this.emit("status", { message: errorMessage });
          }
          throw new Error(errorMessage, { cause: err });
        }

        this.service.handleAnalyticsEvent("sourcechange", { source: "torrent" });
        this.emit("sourcechange", { source: "torrent" });
        if (typeof autoplay === "function") {
          autoplay();
        }

        const result = { source: "torrent", torrentInstance };
        this.result = result;
        return result;
      };

      // --- Helper: Hosted URL Playback Attempt ---
      const attemptHostedPlayback = async () => {
        if (!httpsUrl) return null;

        this.emit("status", { message: "Checking hosted URL..." });
        this.service.log(
          `[playVideoWithFallback] Probing hosted URL ${httpsUrl} (readyState=${activeVideoEl.readyState} networkState=${activeVideoEl.networkState}).`
        );

        let hostedStatusResolved = false;
        const hostedStatusHandlers = [];
        const addHostedStatusListener = (eventName, handler, options) => {
          if (!activeVideoEl) return;
          activeVideoEl.addEventListener(eventName, handler, options);
          hostedStatusHandlers.push([eventName, handler, options]);
        };

        const markHostedUrlAsLive = () => {
          if (hostedStatusResolved) return;
          hostedStatusResolved = true;
          this.emit("status", { message: HOSTED_URL_SUCCESS_MESSAGE });
          cleanupHostedUrlStatusListeners();
        };

        const maybeMarkHostedUrl = () => {
          if (
            hostedStatusResolved ||
            !activeVideoEl ||
            activeVideoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            return;
          }
          if (activeVideoEl.currentTime > 0 || !activeVideoEl.paused) {
            markHostedUrlAsLive();
          }
        };

        cleanupHostedUrlStatusListeners = () => {
          if (!hostedStatusHandlers.length || !activeVideoEl) {
            hostedStatusHandlers.length = 0;
            cleanupHostedUrlStatusListeners = () => {};
            return;
          }
          for (const [eventName, handler, options] of hostedStatusHandlers) {
            activeVideoEl.removeEventListener(eventName, handler, options);
          }
          hostedStatusHandlers.length = 0;
          cleanupHostedUrlStatusListeners = () => {};
        };

        addHostedStatusListener("playing", markHostedUrlAsLive, { once: true });
        addHostedStatusListener("loadeddata", maybeMarkHostedUrl);
        addHostedStatusListener("canplay", maybeMarkHostedUrl);
        addHostedStatusListener(
          "error",
          () => {
            cleanupHostedUrlStatusListeners();
            cleanupDebugListeners();
          },
          { once: true }
        );

        // Probe the URL for availability (HEAD request)
        const probeResult = await this.service.probeHostedUrl({
          url: httpsUrl,
          magnet: this.trimmedMagnet,
          probeUrl,
        });
        const probeOutcome = probeResult?.outcome || "error";
        const probeStatus = probeResult?.status || "unknown";
        const shouldAttemptHosted =
          probeOutcome !== "bad" && probeOutcome !== "error";

        this.service.log(
          `[playVideoWithFallback] Hosted URL probe outcome=${probeOutcome} status=${probeStatus} shouldAttemptHosted=${shouldAttemptHosted}`
        );

        if (probeOutcome === "bad") {
          this.service.log(
            `[playVideoWithFallback] ⚠️ Direct URL probe failed with status ${probeStatus}. WebSeed fallback using this same URL will likely also fail.`
          );
        }

        if (shouldAttemptHosted) {
          let outcomeResolved = false;
          let outcomeResolver = () => {};
          let autoplayBlocked = false;

          const playbackOutcomePromise = new Promise((resolve) => {
            outcomeResolver = (value) => {
              if (outcomeResolved) return;
              outcomeResolved = true;
              resolve(value);
            };
          });

          // Attach watchdogs to detect stalls during playback
          const attachWatchdogs = ({ stallMs = 8000 } = {}) => {
            this.registerWatchdogs(activeVideoEl, {
              stallMs,
              onSuccess: () => outcomeResolver({ status: "success" }),
              onFallback: (reason) => {
                if (autoplayBlocked && reason === "stall") {
                  this.service.log(
                    "[playVideoWithFallback] Autoplay blocked; waiting for user gesture before falling back."
                  );
                  this.emit("status", {
                    message: "Press play to start the hosted video.",
                  });
                  this.emit("autoplay-blocked", { reason });
                  attachWatchdogs({ stallMs: 0 });
                  return;
                }
                const errorMessage = getHostedVideoErrorMessage(activeVideoEl);
                if (errorMessage) {
                  this.emit("status", { message: errorMessage });
                }
                outcomeResolver({ status: "fallback", reason, errorMessage });
              },
            });
          };

          // Use default stall timeout here; the initial start timeout is handled by the race wrapper
          attachWatchdogs({ stallMs: 8000 });

          const handleFatalPlaybackError = (err) => {
            this.service.log(
              "[playVideoWithFallback] Direct URL playback threw:",
              err
            );
            outcomeResolver({ status: "fallback", reason: "play-error" });
          };

          try {
            activeVideoEl.src = httpsUrl;
            const playPromise = activeVideoEl.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch((err) => {
                if (err?.name === "NotAllowedError") {
                  autoplayBlocked = true;
                  this.service.log(
                    "[playVideoWithFallback] Autoplay blocked by browser; awaiting user interaction.",
                    err
                  );
                  this.emit("status", {
                    message: "Press play to start the hosted video.",
                  });
                  this.cleanupWatchdog();
                  attachWatchdogs({ stallMs: 0 });
                  const restoreOnPlay = () => {
                    activeVideoEl.removeEventListener("play", restoreOnPlay);
                    this.cleanupWatchdog();
                    autoplayBlocked = false;
                    attachWatchdogs({ stallMs: 8000 });
                  };
                  activeVideoEl.addEventListener("play", restoreOnPlay, {
                    once: true,
                  });
                  return;
                }
                handleFatalPlaybackError(err);
              });
            }
          } catch (err) {
            handleFatalPlaybackError(err);
          }

          const playbackOutcome = await playbackOutcomePromise;
          if (playbackOutcome?.status === "success") {
            this.emit("poster-remove", { reason: "http-success" });
            this.service.handleAnalyticsEvent("sourcechange", {
              source: "url",
            });
            this.emit("sourcechange", { source: "url" });
            cleanupHostedUrlStatusListeners();
            cleanupDebugListeners();
            const result = { source: "url" };
            this.result = result;
            return result;
          }

          // Fallback triggered
          const fallbackReason = playbackOutcome?.reason || "watchdog-triggered";
          return {
            status: "fallback",
            reason: fallbackReason,
            errorMessage: playbackOutcome?.errorMessage,
          };
        }

        const failureDetails = getHostedUrlFailureDetails(probeResult);
        if (failureDetails?.message) {
          this.emit("status", { message: failureDetails.message });
        }

        cleanupHostedUrlStatusListeners();
        cleanupDebugListeners();
        return {
          status: "fallback",
          reason: "probe-failed",
          errorMessage: failureDetails?.message,
        };
      };

      // --- Helper: Timeout Wrapper ---
      const withTimeout = (promise, ms, label = "Operation") => {
        if (!ms || ms <= 0) return promise;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.service.log(`[playVideoWithFallback] ${label} timed out after ${ms}ms.`);
            resolve({ status: "fallback", reason: "timeout", source: "timeout" });
          }, ms);

          promise
            .then((result) => {
              clearTimeout(timer);
              resolve(result);
            })
            .catch((err) => {
              clearTimeout(timer);
              reject(err);
            });
        });
      };

      // --- Step 2: Main Execution Flow ---

      let tryUrlFirst = this.service.urlFirstEnabled;
      if (forcedSource === "url") tryUrlFirst = true;
      if (forcedSource === "torrent") tryUrlFirst = false;

      const effectiveTimeout = forcedSource ? 0 : playbackStartTimeout;

      let hostedErrorMessage = "";

      if (tryUrlFirst) {
        if (httpsUrl) {
          // STRATEGY: Try URL first
          // Wrap URL attempt in timeout
          const urlResult = await withTimeout(
            attemptHostedPlayback(),
            effectiveTimeout,
            "URL Playback"
          );

          if (urlResult && urlResult.source === "url") {
            return urlResult;
          }

          if (typeof urlResult?.errorMessage === "string") {
            hostedErrorMessage = urlResult.errorMessage;
          }

          // If timeout or failure, proceed to fallback
          if (urlResult?.reason === "timeout") {
            // Need to ensure URL probing/playback is effectively cancelled
            this.cleanupWatchdog();
            cleanupHostedUrlStatusListeners();
            resetVideoElement();
          }

          const fallbackReason = urlResult?.reason || "url-unavailable";
          if (this.magnetForPlayback && forcedSource !== "url") {
            return await attemptTorrentPlayback(fallbackReason);
          }
        } else if (this.magnetForPlayback && forcedSource !== "url") {
          return await attemptTorrentPlayback("url-missing");
        }
      } else {
        // STRATEGY: Try Torrent first
        if (this.magnetForPlayback) {
          try {
            // If we have a fallback URL, use the effective timeout.
            // Otherwise, we must wait indefinitely for peers because there is no plan B.
            const torrentTimeout = httpsUrl ? effectiveTimeout : 0;

            // Wrap Torrent attempt in timeout
            const torrentResult = await withTimeout(
              attemptTorrentPlayback("preference"),
              torrentTimeout,
              "Torrent Playback"
            );

            if (torrentResult && torrentResult.source === "torrent") {
              return torrentResult;
            }

            if (torrentResult?.reason === "timeout") {
              this.service.log(
                "[playVideoWithFallback] Torrent timed out; cleaning up."
              );
              if (
                this.service.torrentClient &&
                typeof this.service.torrentClient.cleanup === "function"
              ) {
                await this.service.torrentClient.cleanup();
              }
              resetVideoElement();
            }
          } catch (err) {
            this.service.log(
              "[playVideoWithFallback] Torrent preference failed, trying URL:",
              err
            );
            if (
              this.service.torrentClient &&
              typeof this.service.torrentClient.cleanup === "function"
            ) {
              await this.service.torrentClient.cleanup();
            }
            resetVideoElement();
          }
        }

        // Fallback to URL
        if (httpsUrl && forcedSource !== "torrent") {
          const urlResult = await attemptHostedPlayback();
          if (urlResult && urlResult.source === "url") {
            return urlResult;
          }

          if (typeof urlResult?.errorMessage === "string") {
            hostedErrorMessage = urlResult.errorMessage;
          }
        }
      }

      // --- Step 3: Final Failure Handling ---
      const message =
        hostedErrorMessage ||
        (this.magnetProvided && !this.magnetForPlayback
          ? unsupportedBtihMessage
          : "No playable source found.");
      this.emit("status", { message });
      this.service.handleAnalyticsEvent("sourcechange", { source: null });
      this.emit("sourcechange", { source: null });
      cleanupDebugListeners();
      const error = new Error(message);
      this.service.handleAnalyticsEvent("error", { error });
      this.emit("error", { error, message });
      this.result = { source: null, error };
      return this.result;
    } catch (error) {
      this.service.log("Error in playVideoWithFallback:", error);
      const message =
        error && error.message
          ? `Playback error: ${error.message}`
          : "Playback error";
      this.service.handleAnalyticsEvent("error", { error });
      this.emit("error", { error, message });
      this.result = { source: null, error };
      return this.result;
    } finally {
      this.cleanupWatchdog();
      this.finished = true;
      if (this.result) {
        this.emit("finished", this.result);
      }
    }
  }
}

export default PlaybackService;
