export class VideoModal {
  constructor({
    removeTrackingScripts,
    setGlobalModalState,
    document: doc,
    logger,
  } = {}) {
    if (!doc) {
      throw new Error("VideoModal requires a document reference.");
    }
    if (typeof setGlobalModalState !== "function") {
      throw new Error("VideoModal requires setGlobalModalState helper.");
    }

    this.document = doc;
    this.window = doc.defaultView || globalThis;
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function"
        ? removeTrackingScripts
        : () => {};
    this.setGlobalModalState = setGlobalModalState;
    this.logger = logger || console;
    this.eventTarget = new EventTarget();

    this.loaded = false;

    this.playerModal = null;
    this.scrollRegion = null;
    this.modalVideo = null;
    this.modalStatus = null;
    this.modalProgress = null;
    this.modalPeers = null;
    this.modalSpeed = null;
    this.modalDownloaded = null;
    this.videoTitle = null;
    this.videoDescription = null;
    this.videoTimestamp = null;
    this.videoViewCountEl = null;
    this.creatorAvatar = null;
    this.creatorName = null;
    this.creatorNpub = null;
    this.copyMagnetBtn = null;
    this.shareBtn = null;
    this.modalZapBtn = null;
    this.modalMoreBtn = null;
    this.modalMoreMenu = null;

    this.modalPosterCleanup = null;
    this.videoEventCleanup = null;

    this.activeVideo = null;

    this.handleCopyRequest = this.handleCopyRequest.bind(this);
    this.handleShareRequest = this.handleShareRequest.bind(this);
    this.handleCreatorNavigation = this.handleCreatorNavigation.bind(this);

    this.MODAL_LOADING_POSTER = "assets/gif/please-stand-by.gif";
  }

  log(message, ...args) {
    if (!message) {
      return;
    }
    if (this.logger && typeof this.logger.log === "function") {
      this.logger.log(message, ...args);
      return;
    }
    if (typeof this.logger === "function") {
      this.logger(message, ...args);
      return;
    }
    console.log(message, ...args);
  }

  addEventListener(type, listener, options) {
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.eventTarget.removeEventListener(type, listener, options);
  }

  dispatch(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.eventTarget.dispatchEvent(event);
  }

  getRoot() {
    return this.playerModal;
  }

  getVideoElement() {
    return this.modalVideo;
  }

  setVideoElement(videoElement) {
    this.detachVideoEvents();
    this.clearPosterCleanup();

    if (
      this.window &&
      typeof this.window.HTMLVideoElement !== "undefined" &&
      videoElement instanceof this.window.HTMLVideoElement
    ) {
      this.modalVideo = videoElement;
      this.bindVideoEvents();
    } else {
      this.modalVideo = null;
    }

    return this.modalVideo;
  }

  async load() {
    if (this.loaded && this.playerModal && this.playerModal.isConnected) {
      return this.playerModal;
    }

    const existing = this.document.getElementById("playerModal");
    if (existing) {
      this.hydrate(existing);
      this.loaded = true;
      return this.playerModal;
    }

    const response = await fetch("components/video-modal.html");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const container = this.document.getElementById("modalContainer");
    if (!container) {
      throw new Error("Modal container element not found!");
    }

    const wrapper = this.document.createElement("div");
    wrapper.innerHTML = html;
    this.removeTrackingScripts(wrapper);
    container.appendChild(wrapper);

    const playerModal = wrapper.querySelector("#playerModal");
    if (!playerModal) {
      throw new Error("Player modal root not found in markup.");
    }

    this.hydrate(playerModal);
    this.loaded = true;
    return this.playerModal;
  }

  hydrate(playerModal) {
    this.playerModal = playerModal;
    this.scrollRegion =
      playerModal.querySelector(".player-modal__content") || playerModal;

    this.modalVideo = playerModal.querySelector("#modalVideo") || null;
    this.modalStatus = playerModal.querySelector("#modalStatus") || null;
    this.modalProgress = playerModal.querySelector("#modalProgress") || null;
    this.modalPeers = playerModal.querySelector("#modalPeers") || null;
    this.modalSpeed = playerModal.querySelector("#modalSpeed") || null;
    this.modalDownloaded =
      playerModal.querySelector("#modalDownloaded") || null;
    this.videoTitle = playerModal.querySelector("#videoTitle") || null;
    this.videoDescription =
      playerModal.querySelector("#videoDescription") || null;
    this.videoTimestamp =
      playerModal.querySelector("#videoTimestamp") || null;
    this.videoViewCountEl =
      playerModal.querySelector("#videoViewCount") || null;
    this.creatorAvatar =
      playerModal.querySelector("#creatorAvatar") || null;
    this.creatorName = playerModal.querySelector("#creatorName") || null;
    this.creatorNpub = playerModal.querySelector("#creatorNpub") || null;
    this.copyMagnetBtn = playerModal.querySelector("#copyMagnetBtn") || null;
    this.shareBtn = playerModal.querySelector("#shareBtn") || null;
    this.modalZapBtn = playerModal.querySelector("#modalZapBtn") || null;
    this.modalMoreBtn = playerModal.querySelector("#modalMoreBtn") || null;
    this.modalMoreMenu =
      playerModal.querySelector("#moreDropdown-modal") || null;

    const closeButton = playerModal.querySelector("#closeModal");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        this.dispatch("modal:close", { video: this.activeVideo });
      });
    }

    const modalNav = playerModal.querySelector("#modalNav");
    if (modalNav && this.scrollRegion) {
      let lastScrollY = 0;
      this.scrollRegion.addEventListener("scroll", () => {
        const currentScrollY = this.scrollRegion.scrollTop;
        const shouldShowNav =
          currentScrollY <= lastScrollY || currentScrollY < 50;
        modalNav.style.transform = shouldShowNav
          ? "translateY(0)"
          : "translateY(-100%)";
        lastScrollY = currentScrollY;
      });
    }

    this.bindVideoEvents();
    this.bindActionButtons();
    this.setZapVisibility(false);
    this.setCopyEnabled(false);
    this.setShareEnabled(false);
    this.resetStats();
  }

  bindVideoEvents() {
    if (
      !this.modalVideo ||
      !this.window ||
      typeof this.window.HTMLVideoElement === "undefined" ||
      !(this.modalVideo instanceof this.window.HTMLVideoElement)
    ) {
      return;
    }

    const loadedHandler = () => {
      this.dispatch("playback:loadeddata", {
        video: this.modalVideo,
        active: this.activeVideo,
      });
    };
    const playingHandler = () => {
      this.dispatch("playback:playing", {
        video: this.modalVideo,
        active: this.activeVideo,
      });
    };

    this.modalVideo.addEventListener("loadeddata", loadedHandler);
    this.modalVideo.addEventListener("playing", playingHandler);

    this.videoEventCleanup = () => {
      if (!this.modalVideo) {
        return;
      }
      this.modalVideo.removeEventListener("loadeddata", loadedHandler);
      this.modalVideo.removeEventListener("playing", playingHandler);
      this.videoEventCleanup = null;
    };
  }

  detachVideoEvents() {
    if (typeof this.videoEventCleanup === "function") {
      this.videoEventCleanup();
    }
    this.videoEventCleanup = null;
  }

  bindActionButtons() {
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", this.handleCopyRequest);
    }
    if (this.shareBtn) {
      this.shareBtn.addEventListener("click", this.handleShareRequest);
    }

    if (this.modalZapBtn) {
      this.modalZapBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        this.dispatch("video:zap", { video: this.activeVideo });
      });
    }

    if (this.creatorAvatar) {
      this.creatorAvatar.style.cursor = "pointer";
      this.creatorAvatar.addEventListener("click", this.handleCreatorNavigation);
    }
    if (this.creatorName) {
      this.creatorName.style.cursor = "pointer";
      this.creatorName.addEventListener("click", this.handleCreatorNavigation);
    }
  }

  handleCopyRequest(event) {
    event?.preventDefault?.();
    if (this.copyMagnetBtn?.disabled) {
      return;
    }
    this.dispatch("video:copy-magnet", { video: this.activeVideo });
  }

  handleShareRequest(event) {
    event?.preventDefault?.();
    if (this.shareBtn?.disabled) {
      return;
    }
    this.dispatch("video:share", { video: this.activeVideo });
  }

  handleCreatorNavigation(event) {
    event?.preventDefault?.();
    this.dispatch("creator:navigate", { video: this.activeVideo });
  }

  open(video) {
    this.activeVideo = video || null;
    if (!this.playerModal) {
      return;
    }

    this.playerModal.style.display = "flex";
    this.playerModal.classList.remove("hidden");
    this.document.body.classList.add("modal-open");
    this.document.documentElement.classList.add("modal-open");
    if (this.scrollRegion) {
      this.scrollRegion.scrollTop = 0;
    }
    this.setGlobalModalState("player", true);
    this.applyLoadingPoster();
  }

  close() {
    this.activeVideo = null;
    if (this.playerModal) {
      this.playerModal.style.display = "none";
      this.playerModal.classList.add("hidden");
    }
    this.document.body.classList.remove("modal-open");
    this.document.documentElement.classList.remove("modal-open");
    this.setGlobalModalState("player", false);
    this.forceRemovePoster("close");
  }

  applyLoadingPoster() {
    if (!this.modalVideo) {
      return;
    }

    this.clearPosterCleanup();

    const clearPoster = () => {
      this.forceRemovePoster("playback-event");
    };

    this.modalVideo.addEventListener("loadeddata", clearPoster);
    this.modalVideo.addEventListener("playing", clearPoster);
    this.modalVideo.poster = this.MODAL_LOADING_POSTER;

    this.modalPosterCleanup = () => {
      if (!this.modalVideo) {
        return;
      }
      this.modalVideo.removeEventListener("loadeddata", clearPoster);
      this.modalVideo.removeEventListener("playing", clearPoster);
      this.modalPosterCleanup = null;
    };
  }

  clearPosterCleanup() {
    if (typeof this.modalPosterCleanup === "function") {
      this.modalPosterCleanup();
    }
    this.modalPosterCleanup = null;
  }

  forceRemovePoster(reason = "manual-clear") {
    if (!this.modalVideo) {
      return false;
    }

    this.clearPosterCleanup();

    const videoEl = this.modalVideo;
    const hadPoster =
      videoEl.hasAttribute("poster") ||
      (typeof videoEl.poster === "string" && videoEl.poster !== "");

    if (!hadPoster) {
      return false;
    }

    videoEl.poster = "";
    if (videoEl.hasAttribute("poster")) {
      videoEl.removeAttribute("poster");
    }

    this.log(`[VideoModal] Cleared loading poster (${reason}).`);
    return true;
  }

  resetStats() {
    this.updatePeers("");
    this.updateSpeed("");
    this.updateDownloaded("");
    this.updateProgress("0%");
  }

  updateStatus(message) {
    if (this.modalStatus) {
      this.modalStatus.textContent = message || "";
    }
  }

  updatePeers(text) {
    if (this.modalPeers) {
      this.modalPeers.textContent = text || "";
    }
  }

  updateSpeed(text) {
    if (this.modalSpeed) {
      this.modalSpeed.textContent = text || "";
    }
  }

  updateDownloaded(text) {
    if (this.modalDownloaded) {
      this.modalDownloaded.textContent = text || "";
    }
  }

  updateProgress(value) {
    if (!this.modalProgress) {
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      this.modalProgress.style.width = `${Math.max(0, value)}%`;
      return;
    }
    if (typeof value === "string") {
      this.modalProgress.style.width = value;
      return;
    }
    this.modalProgress.style.width = "0%";
  }

  setCopyEnabled(enabled) {
    if (!this.copyMagnetBtn) {
      return;
    }
    this.copyMagnetBtn.disabled = !enabled;
    this.copyMagnetBtn.setAttribute(
      "aria-disabled",
      (!enabled).toString()
    );
    this.copyMagnetBtn.classList.toggle("opacity-50", !enabled);
    this.copyMagnetBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  setShareEnabled(enabled) {
    if (!this.shareBtn) {
      return;
    }
    this.shareBtn.disabled = !enabled;
    this.shareBtn.setAttribute(
      "aria-disabled",
      (!enabled).toString()
    );
    this.shareBtn.classList.toggle("opacity-50", !enabled);
    this.shareBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  setZapVisibility(visible) {
    if (!this.modalZapBtn) {
      return;
    }
    this.modalZapBtn.classList.toggle("hidden", !visible);
    this.modalZapBtn.disabled = !visible;
    this.modalZapBtn.setAttribute("aria-disabled", (!visible).toString());
    this.modalZapBtn.setAttribute("aria-hidden", (!visible).toString());
    if (visible) {
      this.modalZapBtn.removeAttribute("tabindex");
    } else {
      this.modalZapBtn.setAttribute("tabindex", "-1");
    }
  }

  getViewCountElement() {
    return this.videoViewCountEl;
  }

  updateViewCountLabel(text) {
    if (this.videoViewCountEl) {
      this.videoViewCountEl.textContent = text || "";
    }
  }

  setViewCountPointer(pointerKey) {
    if (!this.videoViewCountEl) {
      return;
    }
    if (pointerKey) {
      this.videoViewCountEl.dataset.viewPointer = pointerKey;
    } else if (this.videoViewCountEl.dataset?.viewPointer) {
      delete this.videoViewCountEl.dataset.viewPointer;
    }
  }

  updateMetadata({
    title,
    description,
    timestamp,
    viewCount,
    creator,
  } = {}) {
    if (this.videoTitle) {
      this.videoTitle.textContent = title || "Untitled";
    }
    if (this.videoDescription) {
      this.videoDescription.textContent = description || "";
    }
    if (this.videoTimestamp) {
      this.videoTimestamp.textContent = timestamp || "";
    }
    if (typeof viewCount === "string") {
      this.updateViewCountLabel(viewCount);
    }
    if (creator) {
      this.updateCreator(creator);
    }
  }

  updateCreator({ name, avatarUrl, npub } = {}) {
    if (this.creatorName) {
      this.creatorName.textContent = name || "Unknown";
    }
    if (this.creatorAvatar) {
      this.creatorAvatar.src = avatarUrl || "assets/svg/default-profile.svg";
      this.creatorAvatar.alt = name || "Unknown";
    }
    if (this.creatorNpub) {
      this.creatorNpub.textContent = npub || "";
    }
  }

  syncMoreMenuData({ currentVideo, canManageBlacklist }) {
    if (!this.modalMoreMenu) {
      return;
    }

    const buttons = this.modalMoreMenu.querySelectorAll("button[data-action]");
    const HTMLElementCtor =
      this.window && typeof this.window.HTMLElement !== "undefined"
        ? this.window.HTMLElement
        : null;

    buttons.forEach((button) => {
      if (HTMLElementCtor && !(button instanceof HTMLElementCtor)) {
        return;
      }

      const action = button.dataset.action || "";
      if (action === "blacklist-author") {
        if (canManageBlacklist && currentVideo?.pubkey) {
          button.dataset.author = currentVideo.pubkey;
          button.classList.remove("hidden");
          button.setAttribute("aria-hidden", "false");
        } else {
          delete button.dataset.author;
          button.classList.add("hidden");
          button.setAttribute("aria-hidden", "true");
        }
        return;
      }

      if (action === "open-channel" || action === "block-author") {
        if (currentVideo?.pubkey) {
          button.dataset.author = currentVideo.pubkey;
        } else {
          delete button.dataset.author;
        }
      }

      if (action === "copy-link" || action === "report") {
        if (currentVideo?.id) {
          button.dataset.eventId = currentVideo.id;
        } else {
          delete button.dataset.eventId;
        }
      }
    });
  }
}
