export class EmbedPlayerModal {
  constructor({ document: doc, logger } = {}) {
    this.document = doc || (typeof document !== "undefined" ? document : null);
    this.logger = logger || console;
    this.root = null;
    this.video = null;
    this.status = null;
    this.eventTarget = new EventTarget();

    this.toneClasses = {
      default: "text-muted",
      error: "text-danger",
      success: "text-success",
    };
  }

  load() {
    if (this.document) {
      this.root = this.document.getElementById("embedRoot");
      this.video = this.document.getElementById("embedVideo");
      this.status = this.document.getElementById("embedStatus");
    }
    return Promise.resolve(this.root);
  }

  getRoot() {
    return this.root;
  }

  getVideoElement() {
    return this.video;
  }

  setVideoElement(videoElement) {
    if (videoElement) {
      this.video = videoElement;
    }
    return this.video;
  }

  resetStats() {
    // no-op for embed view
  }

  setStatus(message, tone = "default") {
    if (!this.status) {
      return;
    }

    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    this.status.textContent = normalizedMessage;

    Object.values(this.toneClasses).forEach((className) => {
      if (className) {
        this.status.classList.remove(className);
      }
    });

    const toneClass = this.toneClasses[tone] || this.toneClasses.default;
    if (toneClass) {
      this.status.classList.add(toneClass);
    }
  }

  updateStatus(message) {
    this.setStatus(message, "default");
  }

  applyLoadingPoster() {
    this.setStatus("Preparing playback…", "default");
  }

  forceRemovePoster() {
    return false;
  }

  clearPosterCleanup() {}

  setTorrentStatsVisibility(isVisible) {
    if (!this.root) {
      return;
    }
    this.root.dataset.torrentStats = isVisible ? "true" : "false";
  }

  open() {
    return this.root;
  }

  close() {}

  updateMetadata() {}
  setShareEnabled() {}

  addEventListener(type, listener, options) {
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.eventTarget.removeEventListener(type, listener, options);
  }

  dispatch(type, detail) {
    return this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
