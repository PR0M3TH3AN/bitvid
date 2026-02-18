import { devLogger, userLogger } from "../utils/logger.js";

export default class VideoModalController {
  constructor({
    getVideoModal,
    callbacks: {
      showError,
      showSuccess,
      showStatus,
      getLastModalTrigger,
      setLastModalTrigger,
      getCurrentVideo,
      getPlaySource,
      getStreamHealthSnapshots,
      getCachedUrlHealth,
      handleCopyMagnet,
      openShareNostrModal,
      playVideoWithFallback,
      attachMoreMenuHandlers,
    } = {},
  }) {
    this.getVideoModal = getVideoModal;
    this.showError = showError;
    this.showSuccess = showSuccess;
    this.showStatus = showStatus;
    this.getLastModalTrigger = getLastModalTrigger;
    this.setLastModalTrigger = setLastModalTrigger;
    this.getCurrentVideo = getCurrentVideo;
    this.getPlaySource = getPlaySource;
    this.getStreamHealthSnapshots = getStreamHealthSnapshots;
    this.getCachedUrlHealth = getCachedUrlHealth;
    this.handleCopyMagnetCallback = handleCopyMagnet;
    this.openShareNostrModalCallback = openShareNostrModal;
    this.playVideoWithFallbackCallback = playVideoWithFallback;
    this.attachMoreMenuHandlersCallback = attachMoreMenuHandlers;

    this.videoModalReadyPromise = null;
  }

  get videoModal() {
    return this.getVideoModal ? this.getVideoModal() : null;
  }

  log(message, ...args) {
    devLogger.log("[VideoModalController]", message, ...args);
  }

  bindEvents() {
    if (!this.videoModal) {
      return;
    }

    const modalRoot =
      typeof this.videoModal.getRoot === "function"
        ? this.videoModal.getRoot()
        : null;

    if (modalRoot && this.attachMoreMenuHandlersCallback) {
      this.attachMoreMenuHandlersCallback(modalRoot);
    }

    if (typeof this.videoModal.addEventListener === "function") {
      this.videoModal.addEventListener("video:share-nostr", (event) => {
        this.handleShareNostr(event);
      });

      this.videoModal.addEventListener("video:copy-cdn", (event) => {
        this.handleCopyCdn(event);
      });

      this.videoModal.addEventListener("video:copy-magnet", () => {
        if (this.handleCopyMagnetCallback) {
          this.handleCopyMagnetCallback();
        }
      });

      this.videoModal.addEventListener("playback:switch-source", (event) => {
        this.handleSourceSwitch(event);
      });
    }
  }

  handleShareNostr(event) {
    if (this.openShareNostrModalCallback) {
      this.openShareNostrModalCallback({
        video: event?.detail?.video || null,
        triggerElement: event?.detail?.trigger || null,
      });
    }
  }

  handleCopyCdn(event) {
    const video =
      event?.detail?.video ||
      (this.getCurrentVideo ? this.getCurrentVideo() : null);
    const url = video?.url || "";
    if (!url) {
      if (this.showError) {
        this.showError("No CDN link available to copy.");
      }
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        if (this.showSuccess) {
          this.showSuccess("CDN link copied to clipboard!");
        }
      })
      .catch(() => {
        if (this.showError) {
          this.showError("Failed to copy CDN link.");
        }
      });
  }

  handleSourceSwitch(event) {
    const detail = event?.detail || {};
    const { source } = detail;
    if (!source) {
      return;
    }

    const modalVideo = detail?.video || null;
    const fallbackVideo = this.getCurrentVideo ? this.getCurrentVideo() : null;
    const video = {
      ...(fallbackVideo || {}),
      ...(modalVideo || {}),
    };
    const urlCandidate =
      typeof video.url === "string" ? video.url.trim() : "";
    const magnetCandidate =
      typeof video.magnet === "string" ? video.magnet.trim() : "";

    if (!modalVideo && !fallbackVideo) {
      devLogger.warn(
        "[VideoModalController] Playback source switch missing video data.",
      );
      return;
    }

    const magnetAvailable = Boolean(magnetCandidate);
    const streamHealthSnapshots = this.getStreamHealthSnapshots
      ? this.getStreamHealthSnapshots()
      : null;

    const cachedStreamHealth =
      video?.id && streamHealthSnapshots instanceof Map
        ? streamHealthSnapshots.get(video.id)
        : null;
    const cachedPeers = Number.isFinite(cachedStreamHealth?.peers)
      ? cachedStreamHealth.peers
      : null;
    const hasActivePeers = cachedPeers === null ? null : cachedPeers > 0;

    const cachedUrlHealth =
      video?.id && urlCandidate && this.getCachedUrlHealth
        ? this.getCachedUrlHealth(video.id, urlCandidate)
        : null;
    const cdnUnavailable =
      !urlCandidate ||
      ["offline", "timeout"].includes(cachedUrlHealth?.status);

    if (source === "torrent" && !magnetAvailable) {
      userLogger.warn(
        "[VideoModalController] Unable to switch to torrent playback: missing magnet.",
      );
      if (this.showError) {
        this.showError(
          "Torrent playback is unavailable for this video. No magnet was provided.",
        );
      }
      return;
    }

    if (source === "torrent" && hasActivePeers === false) {
      userLogger.warn(
        "[VideoModalController] Switching to torrent playback despite 0 active peers detected.",
      );
      if (this.showStatus) {
        this.showStatus(
          "Warning: No peers detected. Playback may fail or stall.",
          { autoHideMs: 5000 },
        );
      }
      // Proceed anyway
    }

    if (source === "url" && cdnUnavailable) {
      userLogger.warn(
        "[VideoModalController] Unable to switch to CDN playback: URL unavailable.",
      );
      if (this.showError) {
        this.showError(
          "CDN playback is unavailable right now, staying on the torrent stream.",
        );
      }
      return;
    }

    const currentSource = this.getPlaySource ? this.getPlaySource() : null;
    if (currentSource && source === currentSource) {
      return;
    }

    if (this.playVideoWithFallbackCallback) {
      this.playVideoWithFallbackCallback({
        url: urlCandidate,
        magnet: magnetCandidate,
        forcedSource: source,
      }).catch((error) => {
        devLogger.warn(
          "[VideoModalController] Failed to switch playback source:",
          error,
        );
      });
    }
  }

  /**
   * Show the modal and set the "Please stand by" poster on the video.
   */
  async showModalWithPoster(video = null, options = {}) {
    if (!this.videoModal) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(options || {}, "trigger")) {
      if (this.setLastModalTrigger) {
        this.setLastModalTrigger(options.trigger);
      }
    }

    const targetVideo =
      video || (this.getCurrentVideo ? this.getCurrentVideo() : null);
    if (!targetVideo) {
      this.log("Skipping video modal open; no target video is available.");
      return null;
    }

    try {
      const { root } = await this.ensureVideoModalReady({
        ensureVideoElement: true,
      });

      if (!this.videoModal) {
        return root || null;
      }

      const trigger = this.getLastModalTrigger
        ? this.getLastModalTrigger()
        : null;
      this.videoModal.open(targetVideo, {
        triggerElement: trigger,
      });
      this.applyModalLoadingPoster();

      return (
        root ||
        (typeof this.videoModal.getRoot === "function"
          ? this.videoModal.getRoot()
          : null)
      );
    } catch (error) {
      devLogger.error(
        "[VideoModalController] Failed to open the video modal before playback:",
        error,
      );
      if (this.showError) {
        this.showError("Could not open the video player. Please try again.");
      }
      return null;
    }
  }

  applyModalLoadingPoster() {
    if (!this.videoModal) {
      return;
    }
    this.videoModal.applyLoadingPoster();
  }

  forceRemoveModalPoster(reason = "manual-clear") {
    if (!this.videoModal) {
      return false;
    }
    return this.videoModal.forceRemovePoster(reason);
  }

  async ensureVideoModalReady({ ensureVideoElement = false } = {}) {
    if (!this.videoModal) {
      throw new Error("Video modal instance is not available.");
    }

    const getRoot = () =>
      typeof this.videoModal.getRoot === "function"
        ? this.videoModal.getRoot()
        : null;
    const getVideoElement = () =>
      typeof this.videoModal.getVideoElement === "function"
        ? this.videoModal.getVideoElement()
        : null;

    const existingRoot = getRoot();
    const existingVideoElement = getVideoElement();
    const rootConnected = Boolean(existingRoot && existingRoot.isConnected);
    const hasVideoElement = Boolean(existingVideoElement);
    const videoConnected = Boolean(
      existingVideoElement && existingVideoElement.isConnected,
    );

    const needsRehydrate =
      !rootConnected || !hasVideoElement || !videoConnected;

    if (!needsRehydrate) {
      if (
        existingVideoElement &&
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        const currentModalVideo =
          typeof this.videoModal.getVideoElement === "function"
            ? this.videoModal.getVideoElement()
            : null;
        if (currentModalVideo !== existingVideoElement) {
          this.videoModal.setVideoElement(existingVideoElement);
        }
      }

      return {
        root: existingRoot,
        videoElement: existingVideoElement,
      };
    }

    if (!videoConnected) {
      if (
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        this.videoModal.setVideoElement(null);
      }
    }

    if (!this.videoModalReadyPromise) {
      if (typeof this.videoModal.load !== "function") {
        throw new Error("Video modal does not expose a load() method.");
      }
      this.videoModalReadyPromise = Promise.resolve(this.videoModal.load());
    }

    try {
      await this.videoModalReadyPromise;
    } catch (error) {
      this.videoModalReadyPromise = null;
      throw error;
    }

    this.videoModalReadyPromise = null;

    const readyRoot = getRoot();
    const readyVideoElement = getVideoElement();
    const readyVideoConnected = Boolean(
      readyVideoElement && readyVideoElement.isConnected,
    );

    if (readyVideoConnected) {
      if (
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        this.videoModal.setVideoElement(readyVideoElement);
      }
    } else {
      if (
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        this.videoModal.setVideoElement(null);
      }
    }

    if (ensureVideoElement && !readyVideoConnected) {
      throw new Error("Video modal video element is missing after load().");
    }

    return {
      root: readyRoot,
      videoElement: readyVideoConnected ? readyVideoElement : null,
    };
  }
}
