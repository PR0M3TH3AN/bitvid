// js/services/playbackService.js

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
      } catch (err) {
        if (this.logger) {
          this.logger("[PlaybackService] Listener error", err);
        }
      }
    }
  }
}

const HOSTED_URL_SUCCESS_MESSAGE = "✅ Streaming from hosted URL";
const DEFAULT_UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

export class PlaybackService {
  constructor({
    logger,
    torrentClient,
    deriveTorrentPlaybackConfig,
    isValidMagnetUri,
    urlFirstEnabled = true,
    analyticsCallbacks = {},
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
    this.currentSession = null;
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (err) {
      console.warn("[PlaybackService] logger threw", err);
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

    addListener("error", () => triggerFallback("error"));
    addListener("abort", () => triggerFallback("abort"));
    addListener("stalled", () => triggerFallback("stalled"));
    addListener("playing", handleSuccess);
    addListener("ended", handleSuccess);

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

  cleanupWatchdog() {
    if (this.currentSession) {
      this.currentSession.cleanupWatchdog();
    }
  }

  createSession(options = {}) {
    const session = new PlaybackSession(this, options);
    this.currentSession = session;
    return session;
  }
}

class PlaybackSession extends SimpleEventEmitter {
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

  isActive() {
    return !this.finished;
  }

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

  registerWatchdogs(videoElement, options) {
    this.cleanupWatchdog();
    this.watchdogCleanup = this.service.registerUrlPlaybackWatchdogs(
      videoElement,
      options
    );
  }

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

  async start() {
    if (this.startPromise) {
      return this.startPromise;
    }
    this.startPromise = this.execute();
    return this.startPromise;
  }

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
        showModalWithPoster();
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

      const httpsUrl = this.sanitizedUrl;
      const webSeedCandidates = httpsUrl ? [httpsUrl] : [];

      let fallbackStarted = false;
      const startTorrentFallback = async (reason) => {
        if (fallbackStarted) {
          this.service.log(
            `[playVideoWithFallback] Duplicate fallback request ignored (${reason}).`
          );
          return null;
        }
        fallbackStarted = true;
        this.cleanupWatchdog();
        cleanupHostedUrlStatusListeners();
        cleanupDebugListeners();

        if (activeVideoEl) {
          try {
            activeVideoEl.pause();
          } catch (err) {
            this.service.log(
              "[playVideoWithFallback] Ignoring pause error before torrent fallback:",
              err
            );
          }
          try {
            activeVideoEl.removeAttribute("src");
          } catch (err) {
            // ignore attribute removal errors
          }
          activeVideoEl.src = "";
          activeVideoEl.srcObject = null;
          try {
            activeVideoEl.load();
          } catch (err) {
            this.service.log(
              "[playVideoWithFallback] Ignoring load error before torrent fallback:",
              err
            );
          }
        }

        if (!this.magnetForPlayback) {
          const message =
            "Hosted playback failed and no magnet fallback is available.";
          this.emit("status", { message });
          this.emit("sourcechange", { source: null });
          const error = new Error(message);
          this.service.handleAnalyticsEvent("error", { error });
          this.emit("error", { error, message });
          this.result = { source: null, error };
          return null;
        }

        this.emit("status", { message: "Switching to WebTorrent..." });
        this.service.handleAnalyticsEvent("fallback", { reason });
        this.emit("fallback", { reason });

        if (typeof playViaWebTorrent !== "function") {
          const error = new Error("No torrent playback handler provided.");
          this.service.handleAnalyticsEvent("error", { error });
          this.emit("error", { error, message: error.message });
          this.result = { source: null, error };
          return null;
        }

        const torrentInstance = await playViaWebTorrent(this.magnetForPlayback, {
          fallbackMagnet: this.fallbackMagnet,
          urlList: webSeedCandidates,
        });
        this.service.handleAnalyticsEvent("sourcechange", { source: "torrent" });
        this.emit("sourcechange", { source: "torrent" });
        if (typeof autoplay === "function") {
          autoplay();
        }
        this.result = { source: "torrent", torrentInstance };
        return torrentInstance;
      };

      if (this.service.urlFirstEnabled && httpsUrl) {
        this.emit("status", { message: "Checking hosted URL..." });
        this.service.log(
          `[playVideoWithFallback] Probing hosted URL ${httpsUrl} (readyState=${activeVideoEl.readyState} networkState=${activeVideoEl.networkState}).`
        );

        let hostedStatusResolved = false;
        const hostedStatusHandlers = [];
        const addHostedStatusListener = (eventName, handler, options) => {
          if (!activeVideoEl) {
            return;
          }
          activeVideoEl.addEventListener(eventName, handler, options);
          hostedStatusHandlers.push([eventName, handler, options]);
        };
        const markHostedUrlAsLive = () => {
          if (hostedStatusResolved) {
            return;
          }
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

        const probeResult =
          typeof probeUrl === "function" ? await probeUrl(httpsUrl) : null;
        const probeOutcome = probeResult?.outcome || "error";
        const shouldAttemptHosted =
          probeOutcome !== "bad" && probeOutcome !== "error";

        this.service.log(
          `[playVideoWithFallback] Hosted URL probe outcome=${probeOutcome} shouldAttemptHosted=${shouldAttemptHosted}`
        );

        if (shouldAttemptHosted) {
          let outcomeResolved = false;
          let outcomeResolver = () => {};
          let autoplayBlocked = false;

          const playbackOutcomePromise = new Promise((resolve) => {
            outcomeResolver = (value) => {
              if (outcomeResolved) {
                return;
              }
              outcomeResolved = true;
              resolve(value);
            };
          });

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

                outcomeResolver({ status: "fallback", reason });
              },
            });
          };

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
            this.result = { source: "url" };
            return this.result;
          }

          const fallbackReason =
            playbackOutcome?.reason || "watchdog-triggered";
          const torrentInstance = await startTorrentFallback(fallbackReason);
          this.result = torrentInstance
            ? { source: "torrent", torrentInstance }
            : this.result;
          return this.result;
        }

        this.service.log(
          `[playVideoWithFallback] Hosted URL probe reported "${probeOutcome}"; deferring to WebTorrent.`
        );
        cleanupHostedUrlStatusListeners();
        cleanupDebugListeners();
      }

      if (this.magnetForPlayback) {
        const torrentInstance = await startTorrentFallback("magnet-primary");
        this.result = torrentInstance
          ? { source: "torrent", torrentInstance }
          : this.result;
        return this.result;
      }

      const message = this.magnetProvided && !this.magnetForPlayback
        ? unsupportedBtihMessage
        : "No playable source found.";
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
      const message = error && error.message
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
