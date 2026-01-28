import { emit } from "../embedDiagnostics.js";
import { isValidMagnetUri } from "../utils/magnetValidators.js";
import { buildServiceWorkerFallbackStatus } from "../utils/serviceWorkerFallbackMessages.js";
import { devLogger, userLogger } from "../utils/logger.js";

const UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

export class VideoPlaybackController {
  constructor({ services = {}, state = {}, ui = {} } = {}) {
    this.services = services;
    this.state = state;
    this.ui = ui;
  }

  log(message, ...args) {
    if (arguments.length === 0) {
      return;
    }
    const prefix = typeof message === "string" && message.startsWith("[") ? message : `[VideoPlaybackController] ${message}`;
    devLogger.log(prefix, ...args);
  }

  async waitForCleanup() {
    let cleanupPromise = this.state.getCleanupPromise ? this.state.getCleanupPromise() : null;
    if (!cleanupPromise) {
      return;
    }

    this.log("[waitForCleanup] Awaiting previous cleanup before continuing.");
    try {
      await cleanupPromise;
      this.log("[waitForCleanup] Previous cleanup completed.");
    } catch (err) {
      devLogger.warn("waitForCleanup observed a rejected cleanup:", err);
    }
  }

  cancelPendingViewLogging() {
    const videoModal = this.state.getVideoModal();
    if (
      videoModal &&
      typeof videoModal.cancelPendingViewLogging === "function"
    ) {
      videoModal.cancelPendingViewLogging();
    }
  }

  teardownVideoElement(videoElement, { replaceNode = false } = {}) {
    if (!videoElement) {
      this.log(
        `[teardownVideoElement] No video provided (replaceNode=${replaceNode}); skipping.`
      );
      return videoElement;
    }

    const safe = (fn) => {
      try {
        fn();
      } catch (err) {
        devLogger.warn("[teardownVideoElement]", err);
      }
    };

    const describeSource = () => {
      try {
        return videoElement.currentSrc || videoElement.src || "<unset>";
      } catch (err) {
        return "<unavailable>";
      }
    };

    this.log(
      `[teardownVideoElement] Resetting video (replaceNode=${replaceNode}) readyState=${videoElement.readyState} networkState=${videoElement.networkState} src=${describeSource()}`
    );

    safe(() => videoElement.pause());

    safe(() => {
      videoElement.removeAttribute("src");
      videoElement.src = "";
    });

    safe(() => {
      videoElement.srcObject = null;
    });

    safe(() => {
      if ("crossOrigin" in videoElement) {
        videoElement.crossOrigin = null;
      }
      if (videoElement.hasAttribute("crossorigin")) {
        videoElement.removeAttribute("crossorigin");
      }
    });

    safe(() => {
      if (typeof videoElement.load === "function") {
        videoElement.load();
      }
    });

    if (!replaceNode || !videoElement.parentNode) {
      this.log(
        `[teardownVideoElement] Completed without node replacement (readyState=${videoElement.readyState}).`
      );
      return videoElement;
    }

    const parent = videoElement.parentNode;
    const clone = videoElement.cloneNode(false);

    if (clone.dataset && "autoplayBound" in clone.dataset) {
      delete clone.dataset.autoplayBound;
    }
    if (clone.hasAttribute("data-autoplay-bound")) {
      clone.removeAttribute("data-autoplay-bound");
    }

    safe(() => {
      clone.removeAttribute("src");
      clone.src = "";
    });

    safe(() => {
      clone.srcObject = null;
    });

    safe(() => {
      if ("crossOrigin" in clone) {
        clone.crossOrigin = null;
      }
      if (clone.hasAttribute("crossorigin")) {
        clone.removeAttribute("crossorigin");
      }
    });

    clone.autoplay = videoElement.autoplay;
    clone.controls = videoElement.controls;
    clone.loop = videoElement.loop;
    clone.muted = videoElement.muted;
    clone.defaultMuted = videoElement.defaultMuted;
    clone.preload = videoElement.preload;
    clone.playsInline = videoElement.playsInline;

    clone.poster = "";
    if (clone.hasAttribute("poster")) {
      clone.removeAttribute("poster");
    }

    let replaced = false;
    safe(() => {
      parent.replaceChild(clone, videoElement);
      replaced = true;
    });

    if (!replaced) {
      return videoElement;
    }

    safe(() => {
      if (typeof clone.load === "function") {
        clone.load();
      }
    });

    this.log(
      `[teardownVideoElement] Replaced modal video node (readyState=${clone.readyState} networkState=${clone.networkState}).`
    );

    return clone;
  }

  autoplayModalVideo() {
    const currentVideo = this.state.getCurrentVideo();
    if (currentVideo?.moderation?.blockAutoplay) {
      this.log(
        "[moderation] Skipping autoplay due to trusted reports or trusted mutes.",
      );
      return;
    }

    const modalVideo = this.state.getModalVideo();
    if (!modalVideo) {
      return;
    }

    const playPromise = modalVideo.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        this.log("Autoplay failed:", err);
        if (!modalVideo.muted) {
          this.log("Falling back to muted autoplay.");
          modalVideo.muted = true;
          const retryPromise = modalVideo.play();
          if (retryPromise !== undefined) {
            retryPromise.catch((err2) => {
              this.log("Muted autoplay also failed:", err2);
            });
          }
        }
      });
    }
  }

  resetTorrentStats() {
    const videoModal = this.state.getVideoModal();
    if (videoModal && typeof videoModal.resetStats === "function") {
      try {
        videoModal.resetStats();
      } catch (err) {
        devLogger.warn("[VideoPlaybackController] resetTorrentStats failed", err);
      }
    } else {
      this.log(
        "[VideoPlaybackController] resetTorrentStats: videoModal.resetStats not available — skipping."
      );
    }
  }

  clearActiveIntervals() {
    if (typeof this.state.clearActiveIntervals === "function") {
      this.state.clearActiveIntervals();
    }
  }

  preparePlaybackLogging(videoEl) {
    const watchHistoryTelemetry =
      typeof this.services.getWatchHistoryTelemetry === "function"
        ? this.services.getWatchHistoryTelemetry()
        : this.services.watchHistoryTelemetry;

    if (
      watchHistoryTelemetry &&
      typeof watchHistoryTelemetry.preparePlaybackLogging === "function"
    ) {
      const currentVideo = this.state.getCurrentVideo();
      const pointerKey = currentVideo?.pointerKey || null;

      watchHistoryTelemetry.preparePlaybackLogging({
        videoElement: videoEl,
        video: currentVideo,
        pointerKey,
        onView: (detail) => {
            if (this.ui.handleFeedViewTelemetry) {
                this.ui.handleFeedViewTelemetry(detail);
            }
        },
      });
    }
  }

  async playViaWebTorrent(magnet, { fallbackMagnet = "", urlList = [] } = {}) {
    const { torrentClient } = this.services;
    if (!torrentClient) {
      throw new Error("Torrent client service is not available.");
    }

    const sanitizedUrlList = Array.isArray(urlList)
      ? urlList
          .map((entry) =>
            typeof entry === "string" ? entry.trim() : ""
          )
          .filter((entry) => /^https?:\/\//i.test(entry))
      : [];

    const attemptStream = async (candidate) => {
      const trimmedCandidate =
        typeof candidate === "string" ? candidate.trim() : "";
      if (!trimmedCandidate) {
        throw new Error("No magnet URI provided for torrent playback.");
      }
      if (!isValidMagnetUri(trimmedCandidate)) {
        const videoModal = this.state.getVideoModal();
        if (videoModal) {
          videoModal.updateStatus(UNSUPPORTED_BTITH_MESSAGE);
        }
        throw new Error(UNSUPPORTED_BTITH_MESSAGE);
      }

      const modalVideo = this.state.getModalVideo();
      if (!modalVideo) {
        throw new Error(
          "No modal video element available for torrent playback."
        );
      }

      const timestamp = Date.now().toString();
      const [magnetPrefix, magnetQuery = ""] = trimmedCandidate.split("?", 2);
      let normalizedMagnet = magnetPrefix;
      let queryParts = magnetQuery
        .split("&")
        .map((part) => part.trim())
        .filter((part) => part && !/^ts=\d+$/.test(part));

      if (queryParts.length) {
        normalizedMagnet = `${magnetPrefix}?${queryParts.join("&")}`;
      }

      const separator = normalizedMagnet.includes("?") ? "&" : "?";
      const cacheBustedMagnet = `${normalizedMagnet}${separator}ts=${timestamp}`;

      await torrentClient.cleanup();
      this.resetTorrentStats();

      const videoModal = this.state.getVideoModal();
      if (videoModal) {
        videoModal.updateStatus("Streaming via WebTorrent");
        if (typeof videoModal.setTorrentStatsVisibility === 'function') {
            videoModal.setTorrentStatsVisibility(true);
        }
      }

      const torrentInstance = await torrentClient.streamVideo(
        cacheBustedMagnet,
        modalVideo,
        { urlList: sanitizedUrlList }
      );

      if (torrentClient.isServiceWorkerUnavailable()) {
        const swError = torrentClient.getServiceWorkerInitError();
        const statusMessage = buildServiceWorkerFallbackStatus(swError);
        this.log(
          "[playViaWebTorrent] Service worker unavailable; streaming directly via WebTorrent.",
          swError
        );
        if (swError) {
          userLogger.warn(
            "[playViaWebTorrent] Service worker unavailable; direct streaming engaged.",
            swError
          );
        }
        if (videoModal) {
          videoModal.updateStatus(statusMessage);
        }
      }
      if (torrentInstance && torrentInstance.ready) {
        if (typeof this.ui.forceRemoveModalPoster === "function") {
          this.ui.forceRemoveModalPoster("webtorrent-ready");
        }
      }

      if (this.ui.startTorrentStatusMirrors) {
          this.ui.startTorrentStatusMirrors(torrentInstance);
      }

      return torrentInstance;
    };

    const primaryTrimmed =
      typeof magnet === "string" ? magnet.trim() : "";
    const fallbackTrimmed =
      typeof fallbackMagnet === "string" ? fallbackMagnet.trim() : "";
    const hasFallback =
      !!fallbackTrimmed && fallbackTrimmed !== primaryTrimmed;

    try {
      return await attemptStream(primaryTrimmed);
    } catch (primaryError) {
      if (!hasFallback) {
        throw primaryError;
      }
      this.log(
        `[playViaWebTorrent] Normalized magnet failed: ${primaryError.message}`
      );
      this.log(
        "[playViaWebTorrent] Primary magnet failed, retrying original string."
      );
      try {
        return await attemptStream(fallbackTrimmed);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  async playVideoWithFallback(options = {}) {
    const { url = "", magnet = "", trigger, forcedSource } = options || {};

    emit("playback-decision", {
      method: forcedSource || (magnet ? "webtorrent" : "url"),
      details: {
        url: Boolean(url),
        magnet: Boolean(magnet),
        forcedSource,
      },
    });

    const hasTrigger = Object.prototype.hasOwnProperty.call(
      options || {},
      "trigger"
    );
    if (hasTrigger && this.ui.setLastModalTrigger) {
      this.ui.setLastModalTrigger(trigger);
    }
    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";

    // State accessors
    const previousSource = this.state.getPlaySource ? this.state.getPlaySource() : null;
    const activePlaybackSession = this.state.getActivePlaybackSession ? this.state.getActivePlaybackSession() : null;

    const requestSignature = JSON.stringify({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
      forcedSource,
    });

    const modalVideoIsConnected = (() => {
      const modalVideo = this.state.getModalVideo();
      if (!modalVideo) {
        return false;
      }
      if (typeof modalVideo.isConnected === "boolean") {
        return modalVideo.isConnected;
      }
      const ownerDocument = modalVideo.ownerDocument ||
        (typeof document !== "undefined" ? document : null);
      if (ownerDocument?.contains) {
        try {
          return ownerDocument.contains(modalVideo);
        } catch (error) {
          devLogger.warn(
            "[VideoPlaybackController] Failed to determine modal video connection state",
            error,
          );
        }
      }
      return true;
    })();

    const shouldReuseActiveSession =
      modalVideoIsConnected &&
      activePlaybackSession &&
      typeof activePlaybackSession.matchesRequestSignature === "function" &&
      activePlaybackSession.matchesRequestSignature(requestSignature);

    if (shouldReuseActiveSession) {
      this.log(
        "[playVideoWithFallback] Duplicate playback request detected; reusing active session."
      );
      const activePromise = this.state.getActivePlaybackResultPromise ? this.state.getActivePlaybackResultPromise() : null;
      if (activePromise) {
        return activePromise;
      }
      if (typeof activePlaybackSession.getResult === "function") {
        return activePlaybackSession.getResult();
      }
      return { source: null };
    }

    await this.waitForCleanup();
    this.cancelPendingViewLogging();

    const playbackService =
      typeof this.services.getPlaybackService === "function"
        ? this.services.getPlaybackService()
        : this.services.playbackService;

    if (
      previousSource === "torrent" &&
      sanitizedUrl &&
      playbackService &&
      playbackService.torrentClient &&
      typeof playbackService.torrentClient.cleanup === "function"
    ) {
      try {
        this.log(
          "[playVideoWithFallback] Previous playback used WebTorrent; cleaning up before preparing hosted session.",
        );
        await playbackService.torrentClient.cleanup();
      } catch (error) {
        devLogger.warn(
          "[playVideoWithFallback] Pre-playback torrent cleanup threw:",
          error,
        );
      }
    }

    let modalVideoEl = this.state.getModalVideo();
    const videoModal = this.state.getVideoModal();

    const modalVideoFromController =
      videoModal && typeof videoModal.getVideoElement === "function"
        ? videoModal.getVideoElement()
        : null;
    if (modalVideoFromController && modalVideoFromController !== modalVideoEl) {
      modalVideoEl = modalVideoFromController;
      if (this.state.setModalVideo) {
          this.state.setModalVideo(modalVideoEl);
      }
    }
    const modalVideoConnected = Boolean(
      modalVideoEl && modalVideoEl.isConnected,
    );

    if (!modalVideoEl || !modalVideoConnected) {
      try {
        if (!this.ui.ensureVideoModalReady) {
            throw new Error("ensureVideoModalReady UI helper missing");
        }
        const { videoElement } = await this.ui.ensureVideoModalReady({
          ensureVideoElement: true,
        });
        modalVideoEl = videoElement;
        if (this.state.setModalVideo) {
            this.state.setModalVideo(modalVideoEl);
        }
      } catch (error) {
        this.log(
          "[playVideoWithFallback] Failed to load video modal before playback:",
          error
        );
        this.ui.showError("Could not prepare the video player. Please try again.");
        return { source: null, error };
      }
    }

    if (!modalVideoEl) {
      const error = new Error("Video element is not ready for playback.");
      this.log(
        "[playVideoWithFallback] Video element missing after modal load attempt."
      );
      this.ui.showError("Video player is not ready yet. Please try again.");
      return { source: null, error };
    }

    if (
      videoModal &&
      typeof videoModal.clearPosterCleanup === "function"
    ) {
      try {
        videoModal.clearPosterCleanup();
      } catch (err) {
        devLogger.warn(
          "[playVideoWithFallback] video modal poster cleanup threw:",
          err
        );
      }
    }

    const refreshedModal = this.teardownVideoElement(modalVideoEl, {
      replaceNode: true,
    });

    const applyModalLoadingPoster = () => {
        if (videoModal && typeof videoModal.applyLoadingPoster === 'function') {
            videoModal.applyLoadingPoster();
        }
    };

    if (refreshedModal) {
      if (
        videoModal &&
        typeof videoModal.setVideoElement === "function"
      ) {
        videoModal.setVideoElement(refreshedModal);
      }
      if (this.state.setModalVideo) {
          this.state.setModalVideo(refreshedModal);
      }
      modalVideoEl = refreshedModal;
      applyModalLoadingPoster();
    } else {
      applyModalLoadingPoster();
    }

    if (!playbackService) {
      this.ui.showError("Playback service is not available.");
      return { source: null, error: new Error("Playback service missing") };
    }

    const session = playbackService.createSession({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
      requestSignature,
      videoElement: modalVideoEl,
      waitForCleanup: () => this.waitForCleanup(),
      cancelPendingViewLogging: () => this.cancelPendingViewLogging(),
      clearActiveIntervals: () => this.clearActiveIntervals(),
      showModalWithPoster: () => this.ui.showModalWithPoster && this.ui.showModalWithPoster(),
      teardownVideoElement: (videoEl, options) =>
        this.teardownVideoElement(videoEl, options),
      probeUrl: (candidateUrl) => this.ui.probeUrl ? this.ui.probeUrl(candidateUrl) : Promise.reject(new Error("probeUrl missing")),
      playViaWebTorrent: (magnetUri, options) =>
        this.playViaWebTorrent(magnetUri, options),
      autoplay: () => this.autoplayModalVideo(),
      unsupportedBtihMessage: UNSUPPORTED_BTITH_MESSAGE,
      forcedSource,
    });

    if (this.state.setActivePlaybackSession) {
        this.state.setActivePlaybackSession(session);
    }
    if (this.state.setActivePlaybackResultPromise) {
        this.state.setActivePlaybackResultPromise(null);
    }

    this.resetTorrentStats();
    if (this.state.setPlaySource) {
        this.state.setPlaySource(null);
    }

    const playbackConfig = session.getPlaybackConfig();
    const magnetForPlayback = session.getMagnetForPlayback();
    const fallbackMagnet = session.getFallbackMagnet();
    // const magnetProvided = session.getMagnetProvided();

    const currentVideo = this.state.getCurrentVideo();
    if (currentVideo) {
      currentVideo.magnet = magnetForPlayback;
      currentVideo.normalizedMagnet = magnetForPlayback;
      currentVideo.normalizedMagnetFallback = fallbackMagnet;
      if (playbackConfig?.infoHash && !currentVideo.legacyInfoHash) {
        currentVideo.legacyInfoHash = playbackConfig.infoHash;
      }
      currentVideo.torrentSupported = !!magnetForPlayback;
    }

    if (this.state.setCurrentMagnetUri) {
        this.state.setCurrentMagnetUri(magnetForPlayback || null);
    }

    const unsubscribers = [];
    const subscribe = (eventName, handler) => {
      const off = session.on(eventName, handler);
      unsubscribers.push(off);
    };

    subscribe("status", ({ message } = {}) => {
      const vModal = this.state.getVideoModal();
      if (vModal) {
        vModal.updateStatus(
          typeof message === "string" ? message : ""
        );
      }
    });

    subscribe("video-prepared", ({ videoElement } = {}) => {
      const vModal = this.state.getVideoModal();
      const currentModalVideo = this.state.getModalVideo();
      if (videoElement && videoElement !== currentModalVideo) {
        if (this.state.setModalVideo) {
            this.state.setModalVideo(videoElement);
        }
      }
    });

    subscribe("view-logging-request", ({ videoElement } = {}) => {
      if (videoElement) {
        this.preparePlaybackLogging(videoElement);
      }
    });

    subscribe("poster-remove", ({ reason } = {}) => {
      if (typeof this.ui.forceRemoveModalPoster === "function") {
        this.ui.forceRemoveModalPoster(reason || "playback");
      }
    });

    subscribe("sourcechange", ({ source } = {}) => {
      if (this.state.setPlaySource) {
          this.state.setPlaySource(source || null);
      }
      const usingTorrent = source === "torrent";
      const vModal = this.state.getVideoModal();
      if (vModal && typeof vModal.setTorrentStatsVisibility === 'function') {
        vModal.setTorrentStatsVisibility(usingTorrent);
      }
    });

    subscribe("error", ({ error, message } = {}) => {
      const displayMessage =
        typeof message === "string"
          ? message
          : error && error.message
          ? `Playback error: ${error.message}`
          : "Playback error";
      this.ui.showError(displayMessage);
    });

    subscribe("finished", () => {
      const active = this.state.getActivePlaybackSession ? this.state.getActivePlaybackSession() : null;
      if (active === session) {
        if (this.state.setActivePlaybackSession) this.state.setActivePlaybackSession(null);
        if (this.state.setActivePlaybackResultPromise) this.state.setActivePlaybackResultPromise(null);
      }
      while (unsubscribers.length) {
        const off = unsubscribers.pop();
        if (typeof off === "function") {
          try {
            off();
          } catch (err) {
            devLogger.warn(
              "[playVideoWithFallback] Listener cleanup error:",
              err
            );
          }
        }
      }
    });

    const startPromise = session.start();
    if (this.state.setActivePlaybackResultPromise) {
        this.state.setActivePlaybackResultPromise(startPromise);
    }

    const result = await startPromise;

    if (!result || result.error) {
      return result;
    }

    emit("playback-started", {
      method: result.source,
      details: { startedAt: Date.now() },
    });

    return result;
  }
}
