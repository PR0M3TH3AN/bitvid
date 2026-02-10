import { emit } from "../embedDiagnostics.js";

/**
 * PlaybackStrategyService orchestrates the decision-making process for video playback.
 * It determines whether to reuse an existing session, manages the lifecycle of the
 * playback session, and coordinates between the PlaybackService (mechanism) and
 * the Application (state/UI).
 */
export class PlaybackStrategyService {
  constructor({ playbackService, logger }) {
    this.playbackService = playbackService;
    this.logger = logger || console;
    this.activePlaybackSession = null;
    this.activePlaybackResultPromise = null;
    this.playSource = null;
  }

  log(...args) {
    if (this.logger && typeof this.logger.log === "function") {
      const prefix = "[PlaybackStrategy]";
      if (typeof args[0] === "string") {
        this.logger.log(`${prefix} ${args[0]}`, ...args.slice(1));
      } else {
        this.logger.log(prefix, ...args);
      }
    }
  }

  /**
   * Orchestrates the playback flow.
   *
   * @param {object} options - Playback options (url, magnet, trigger, forcedSource).
   * @param {object} context - Application context providing UI and State access.
   * @returns {Promise<object>} The result of the playback attempt.
   */
  async play(options = {}, context = {}) {
    const { url = "", magnet = "", trigger, forcedSource } = options || {};

    emit("playback-decision", {
      method: forcedSource || (magnet ? "webtorrent" : "url"), // heuristic
      details: {
        url: Boolean(url),
        magnet: Boolean(magnet),
        forcedSource,
      },
    });

    const hasTrigger = Object.prototype.hasOwnProperty.call(options || {}, "trigger");
    if (hasTrigger && typeof context.setLastModalTrigger === "function") {
      context.setLastModalTrigger(trigger);
    }

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const previousSource = this.playSource || null;
    const requestSignature = JSON.stringify({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
      forcedSource,
    });

    const modalVideoIsConnected = (() => {
      const modalVideo = context.getModalVideo ? context.getModalVideo() : null;
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
          this.log("Failed to determine modal video connection state", error);
        }
      }
      return true;
    })();

    const shouldReuseActiveSession =
      modalVideoIsConnected &&
      this.activePlaybackSession &&
      typeof this.activePlaybackSession.matchesRequestSignature === "function" &&
      this.activePlaybackSession.matchesRequestSignature(requestSignature);

    if (shouldReuseActiveSession) {
      this.log("Duplicate playback request detected; reusing active session.");
      if (this.activePlaybackResultPromise) {
        return this.activePlaybackResultPromise;
      }
      if (typeof this.activePlaybackSession.getResult === "function") {
        return this.activePlaybackSession.getResult();
      }
      return { source: null };
    }

    if (typeof context.waitForCleanup === "function") {
      await context.waitForCleanup();
    }
    if (typeof context.cancelPendingViewLogging === "function") {
      context.cancelPendingViewLogging();
    }

    if (
      previousSource === "torrent" &&
      sanitizedUrl &&
      this.playbackService &&
      this.playbackService.torrentClient &&
      typeof this.playbackService.torrentClient.cleanup === "function"
    ) {
      try {
        this.log("Previous playback used WebTorrent; cleaning up before preparing hosted session.");
        await this.playbackService.torrentClient.cleanup();
      } catch (error) {
        this.log("Pre-playback torrent cleanup threw:", error);
      }
    }

    let modalVideoEl = context.getModalVideo ? context.getModalVideo() : null;
    const modalVideoFromController =
      context.getVideoModalElement ? context.getVideoModalElement() : null;

    if (modalVideoFromController && modalVideoFromController !== modalVideoEl) {
      modalVideoEl = modalVideoFromController;
      if (context.setModalVideo) {
        context.setModalVideo(modalVideoEl);
      }
    }

    const modalVideoConnected = Boolean(modalVideoEl && modalVideoEl.isConnected);
    if (!modalVideoEl || !modalVideoConnected) {
      try {
        if (typeof context.ensureVideoModalReady === "function") {
          const { videoElement } = await context.ensureVideoModalReady({
            ensureVideoElement: true,
          });
          modalVideoEl = videoElement;
          if (context.setModalVideo) {
            context.setModalVideo(modalVideoEl);
          }
        }
      } catch (error) {
        this.log("Failed to load video modal before playback:", error);
        if (typeof context.showError === "function") {
          context.showError("Could not prepare the video player. Please try again.");
        }
        return { source: null, error };
      }
    }

    if (!modalVideoEl) {
      const error = new Error("Video element is not ready for playback.");
      this.log("Video element missing after modal load attempt.");
      if (typeof context.showError === "function") {
        context.showError("Video player is not ready yet. Please try again.");
      }
      return { source: null, error };
    }

    if (context.cleanupVideoModalPoster) {
      try {
        context.cleanupVideoModalPoster();
      } catch (err) {
        this.log("video modal poster cleanup threw:", err);
      }
    }

    let refreshedModal = null;
    if (typeof context.teardownVideoElement === "function") {
      refreshedModal = context.teardownVideoElement(modalVideoEl, {
        replaceNode: true,
      });
    }

    if (refreshedModal) {
      if (context.setVideoModalElement) {
        context.setVideoModalElement(refreshedModal);
      }
      if (context.setModalVideo) {
        context.setModalVideo(refreshedModal);
      }
      modalVideoEl = refreshedModal; // Ensure we use the new element
      if (typeof context.applyModalLoadingPoster === "function") {
        context.applyModalLoadingPoster();
      }
    } else {
      if (typeof context.applyModalLoadingPoster === "function") {
        context.applyModalLoadingPoster();
      }
    }

    // Double check that modalVideoEl is current (it might have been replaced)
    modalVideoEl = context.getModalVideo ? context.getModalVideo() : modalVideoEl;

    const session = this.playbackService.createSession({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
      requestSignature,
      videoElement: modalVideoEl,
      waitForCleanup: context.waitForCleanup,
      cancelPendingViewLogging: context.cancelPendingViewLogging,
      clearActiveIntervals: context.clearActiveIntervals,
      showModalWithPoster: context.showModalWithPoster,
      teardownVideoElement: context.teardownVideoElement,
      probeUrl: context.probeUrl,
      playViaWebTorrent: context.playViaWebTorrent,
      autoplay: context.autoplay,
      unsupportedBtihMessage: context.unsupportedBtihMessage,
      forcedSource,
    });

    this.activePlaybackSession = session;
    if (typeof context.setActivePlaybackSession === "function") {
      context.setActivePlaybackSession(session);
    }
    this.activePlaybackResultPromise = null;
    if (typeof context.setActivePlaybackResultPromise === "function") {
      context.setActivePlaybackResultPromise(null);
    }

    if (typeof context.resetTorrentStats === "function") {
      context.resetTorrentStats();
    }
    this.playSource = null;
    if (typeof context.setPlaySource === "function") {
      context.setPlaySource(null);
    }

    const playbackConfig = session.getPlaybackConfig();
    const magnetForPlayback = session.getMagnetForPlayback();
    const fallbackMagnet = session.getFallbackMagnet();
    // const magnetProvided = session.getMagnetProvided();

    if (context.updateCurrentVideoMetadata) {
        context.updateCurrentVideoMetadata({
            magnet: magnetForPlayback,
            normalizedMagnet: magnetForPlayback,
            normalizedMagnetFallback: fallbackMagnet,
            legacyInfoHash: playbackConfig?.infoHash || null,
            torrentSupported: !!magnetForPlayback
        });
    }

    // this.currentMagnetUri = magnetForPlayback || null; // Logic is in context if needed

    const unsubscribers = [];
    const subscribe = (eventName, handler) => {
      const off = session.on(eventName, handler);
      unsubscribers.push(off);
    };

    subscribe("status", ({ message } = {}) => {
      if (typeof context.updateVideoModalStatus === "function") {
        context.updateVideoModalStatus(typeof message === "string" ? message : "");
      }
    });

    subscribe("video-prepared", ({ videoElement } = {}) => {
      if (videoElement && videoElement !== (context.getModalVideo ? context.getModalVideo() : null)) {
        if (context.setModalVideo) {
          context.setModalVideo(videoElement);
        }
      }
    });

    subscribe("view-logging-request", ({ videoElement } = {}) => {
      if (videoElement && typeof context.preparePlaybackLogging === "function") {
        context.preparePlaybackLogging(videoElement);
      }
    });

    subscribe("poster-remove", ({ reason } = {}) => {
      if (typeof context.forceRemoveModalPoster === "function") {
        context.forceRemoveModalPoster(reason || "playback");
      }
    });

    subscribe("sourcechange", ({ source } = {}) => {
      this.playSource = source || null;
      if (typeof context.setPlaySource === "function") {
        context.setPlaySource(this.playSource);
      }
      const usingTorrent = source === "torrent";
      if (typeof context.setTorrentStatsVisibility === "function") {
        context.setTorrentStatsVisibility(usingTorrent);
      }
    });

    subscribe("error", ({ error, message } = {}) => {
      const displayMessage =
        typeof message === "string"
          ? message
          : error && error.message
          ? `Playback error: ${error.message}`
          : "Playback error";
      if (typeof context.showError === "function") {
        context.showError(displayMessage);
      }
    });

    subscribe("finished", () => {
      if (this.activePlaybackSession === session) {
        this.activePlaybackSession = null;
        if (typeof context.setActivePlaybackSession === "function") {
          context.setActivePlaybackSession(null);
        }
        this.activePlaybackResultPromise = null;
        if (typeof context.setActivePlaybackResultPromise === "function") {
          context.setActivePlaybackResultPromise(null);
        }
      }
      while (unsubscribers.length) {
        const off = unsubscribers.pop();
        if (typeof off === "function") {
          try {
            off();
          } catch (err) {
            this.log("Listener cleanup error:", err);
          }
        }
      }
    });

    const startPromise = session.start();
    this.activePlaybackResultPromise = startPromise;
    if (typeof context.setActivePlaybackResultPromise === "function") {
      context.setActivePlaybackResultPromise(startPromise);
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
export default PlaybackStrategyService;
