import { devLogger } from "../utils/logger.js";

export default class VideoModalController {
  constructor({
    getVideoModal,
    callbacks: {
      showError,
      getLastModalTrigger,
      setLastModalTrigger,
      getCurrentVideo,
    } = {},
  }) {
    this.getVideoModal = getVideoModal;
    this.showError = showError;
    this.getLastModalTrigger = getLastModalTrigger;
    this.setLastModalTrigger = setLastModalTrigger;
    this.getCurrentVideo = getCurrentVideo;

    this.videoModalReadyPromise = null;
  }

  get videoModal() {
    return this.getVideoModal ? this.getVideoModal() : null;
  }

  log(message, ...args) {
    devLogger.log("[VideoModalController]", message, ...args);
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
