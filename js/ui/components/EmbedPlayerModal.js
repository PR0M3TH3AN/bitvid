export class EmbedPlayerModal {
  constructor({ document: doc, logger } = {}) {
    this.document = doc || (typeof document !== "undefined" ? document : null);
    this.logger = logger || console;
    this.root = null;
    this.video = null;
    this.status = null;
    this.eventTarget = new EventTarget();

    // Overlay elements
    this.watchButton = null;
    this.viewCountEl = null;
    this.likeCountEl = null;
    this.dislikeCountEl = null;

    this.toneClasses = {
      default: "text-white/90",
      error: "text-red-400",
      success: "text-green-400",
    };
  }

  load() {
    if (this.document) {
      this.root = this.document.getElementById("embedRoot");
      this.video = this.document.getElementById("embedVideo");
      this.status = this.document.getElementById("embedStatus");

      this.watchButton = this.document.getElementById("embedWatchButton");
      this.viewCountEl = this.document.getElementById("embedViewCount");
      this.likeCountEl = this.document.getElementById("embedLikeCount");
      this.dislikeCountEl = this.document.getElementById("embedDislikeCount");
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
    // no-op for embed view (torrent stats)
  }

  setStatus(message, tone = "default") {
    if (!this.status) {
      return;
    }

    const normalizedMessage = typeof message === "string" ? message.trim() : "";
    this.status.textContent = normalizedMessage;

    // Reset classes
    this.status.className = "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-1 text-sm backdrop-blur-sm";

    const toneClass = this.toneClasses[tone] || this.toneClasses.default;
    this.status.classList.add(toneClass);

    if (!normalizedMessage) {
        this.status.hidden = true;
    } else {
        this.status.hidden = false;
    }
  }

  updateStatus(message) {
    this.setStatus(message, "default");
  }

  applyLoadingPoster() {
    this.setStatus("Loading…", "default");
  }

  forceRemovePoster() {
    this.setStatus("", "default");
    return true;
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

  // --- New Methods for Overlay ---

  setShareUrl(url) {
    if (this.watchButton && url) {
      this.watchButton.href = url;
    }
  }

  getViewCountElement() {
    return this.viewCountEl;
  }

  updateViewCountLabel(text) {
    if (!this.viewCountEl) {
      return;
    }
    const label = this.viewCountEl.querySelector("[data-view-count-text]");
    if (label) {
        // App passes "123 views" or "– views". We strip "views" to keep it compact if desired,
        // but the prompt asked for "view count" so maybe "1.2k views" is fine.
        // Given the compact design (icon + text), just number is often cleaner, but let's stick to what app sends or simple parse.
        // Actually app sends formatted string.
        // Let's try to extract just the number/text if possible, or just render what is sent.
        // "1.2k views" -> "1.2k"
        const parts = (text || "").split(' ');
        const compactText = parts[0] || "–";
        label.textContent = compactText;
    }
  }

  setViewCountPointer(pointerKey) {
    if (this.viewCountEl && pointerKey) {
        this.viewCountEl.dataset.pointerKey = pointerKey;
    }
  }

  formatCount(num) {
    const val = Number.isFinite(num) ? num : 0;
    if (val === 0) return "0";

    // Simple compact formatter
    if (typeof Intl !== "undefined" && Intl.NumberFormat) {
        try {
            return new Intl.NumberFormat('en-US', {
                notation: "compact",
                maximumFractionDigits: 1
            }).format(val);
        } catch (e) {
            // fallback
        }
    }

    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
    return String(val);
  }

  updateReactionSummary({ total, counts, userReaction } = {}) {
    const likeCount = counts && typeof counts['+'] === 'number' ? counts['+'] : 0;
    const dislikeCount = counts && typeof counts['-'] === 'number' ? counts['-'] : 0;

    if (this.likeCountEl) {
        const label = this.likeCountEl.querySelector("[data-count]");
        if (label) label.textContent = this.formatCount(likeCount);

        // Highlight if user liked? (Read-only for now but good visual feedback if we had auth state)
        if (userReaction === '+') {
            this.likeCountEl.classList.add("text-primary");
            this.likeCountEl.classList.remove("text-white/80");
        } else {
            this.likeCountEl.classList.remove("text-primary");
            this.likeCountEl.classList.add("text-white/80");
        }
    }

    if (this.dislikeCountEl) {
        const label = this.dislikeCountEl.querySelector("[data-count]");
        if (label) label.textContent = this.formatCount(dislikeCount);

        if (userReaction === '-') {
            this.dislikeCountEl.classList.add("text-red-400");
            this.dislikeCountEl.classList.remove("text-white/80");
        } else {
            this.dislikeCountEl.classList.remove("text-red-400");
            this.dislikeCountEl.classList.add("text-white/80");
        }
    }
  }

  setUserReaction(reaction) {
    // We don't have the full counts here to update UI fully,
    // but updateReactionSummary will be called by controller with full data.
    // So we can ignore this or just toggle classes optimistically.
  }
}
