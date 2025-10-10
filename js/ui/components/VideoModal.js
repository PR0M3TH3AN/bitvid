import { createModalAccessibility } from "./modalAccessibility.js";

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
    this.modalPanel = null;
    this.modalBackdrop = null;
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
    this.videoEditedTimestamp = null;
    this.videoViewCountEl = null;
    this.creatorAvatar = null;
    this.creatorName = null;
    this.creatorNpub = null;
    this.copyMagnetBtn = null;
    this.shareBtn = null;
    this.modalZapBtn = null;
    this.modalMoreBtn = null;
    this.modalMoreMenu = null;

    this.modalAccessibility = null;
    this.modalNavScrollHandler = null;

    this.modalZapDialog = null;
    this.modalZapForm = null;
    this.modalZapAmountInput = null;
    this.modalZapCommentInput = null;
    this.modalZapSplitSummary = null;
    this.modalZapStatusEl = null;
    this.modalZapReceipts = null;
    this.modalZapSendBtn = null;
    this.modalZapCloseBtn = null;
    this.modalZapWalletPrompt = null;
    this.modalZapWalletLink = null;
    this.modalZapDialogOpen = false;
    this.modalZapPending = false;

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
    if (this.loaded) {
      const root = this.playerModal;
      const rootConnected = root && root.isConnected;
      if (rootConnected) {
        const video = this.modalVideo;
        const videoConnected = video && video.isConnected;
        if (!videoConnected) {
          const existingVideo = root.querySelector("#modalVideo");
          if (existingVideo) {
            this.hydrate(root);
            if (this.modalVideo && this.modalVideo.isConnected) {
              return this.playerModal;
            }
          }
          this.loaded = false;
        } else {
          return this.playerModal;
        }
      } else {
        this.loaded = false;
        this.playerModal = null;
      }
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

    const fragment = this.document.createDocumentFragment();
    while (wrapper.firstChild) {
      fragment.appendChild(wrapper.firstChild);
    }
    container.appendChild(fragment);

    const playerModal = container.querySelector("#playerModal");
    if (!playerModal) {
      throw new Error("Player modal root not found in markup.");
    }

    this.hydrate(playerModal);
    this.loaded = true;
    return this.playerModal;
  }

  hydrate(playerModal) {
    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }
    this.modalAccessibility = null;

    const previousScrollRegion = this.scrollRegion;
    if (previousScrollRegion && this.modalNavScrollHandler) {
      previousScrollRegion.removeEventListener(
        "scroll",
        this.modalNavScrollHandler
      );
    }

    this.playerModal = playerModal;
    this.modalPanel = playerModal.querySelector(".bv-modal__panel") || null;
    this.modalBackdrop = playerModal.querySelector("[data-dismiss]") || null;
    this.scrollRegion = this.modalPanel || playerModal;

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
    this.videoEditedTimestamp =
      playerModal.querySelector("#videoEditedTimestamp") || null;
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

    this.modalZapDialog =
      playerModal.querySelector("#modalZapDialog") || null;
    this.modalZapForm = playerModal.querySelector("#modalZapForm") || null;
    this.modalZapAmountInput =
      playerModal.querySelector("#modalZapAmountInput") || null;
    this.modalZapCommentInput =
      playerModal.querySelector("#modalZapCommentInput") || null;
    this.modalZapSplitSummary =
      playerModal.querySelector("#modalZapSplitSummary") || null;
    this.modalZapStatusEl =
      playerModal.querySelector("#modalZapStatus") || null;
    this.modalZapReceipts =
      playerModal.querySelector("#modalZapReceipts") || null;
    this.modalZapSendBtn =
      playerModal.querySelector("#modalZapSendBtn") || null;
    this.modalZapCloseBtn =
      playerModal.querySelector("#modalZapCloseBtn") || null;
    this.modalZapWalletPrompt =
      playerModal.querySelector("#modalZapWalletPrompt") || null;
    this.modalZapWalletLink =
      playerModal.querySelector("#modalZapWalletLink") || null;

    const closeButton = playerModal.querySelector("#closeModal");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        this.dispatch("modal:close", { video: this.activeVideo });
      });
    }

    const modalNav = playerModal.querySelector("#modalNav");
    if (modalNav && this.scrollRegion) {
      let lastScrollY = 0;
      this.modalNavScrollHandler = () => {
        const currentScrollY = this.scrollRegion.scrollTop;
        const shouldShowNav =
          currentScrollY <= lastScrollY || currentScrollY < 50;
        modalNav.style.transform = shouldShowNav
          ? "translateY(0)"
          : "translateY(-100%)";
        lastScrollY = currentScrollY;
      };
      this.scrollRegion.addEventListener("scroll", this.modalNavScrollHandler);
    } else {
      this.modalNavScrollHandler = null;
    }

    this.modalAccessibility = createModalAccessibility({
      root: this.playerModal,
      panel: this.modalPanel,
      backdrop: this.modalBackdrop,
      document: this.document,
      onRequestClose: () => {
        this.dispatch("modal:close", { video: this.activeVideo });
      },
    });

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
        if (this.modalZapBtn?.disabled) {
          return;
        }
        this.openZapDialog();
        this.dispatch("zap:open", { video: this.activeVideo });
      });
    }

    if (this.modalZapCloseBtn) {
      this.modalZapCloseBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        this.closeZapDialog();
      });
    }

    if (this.modalZapWalletLink) {
      this.modalZapWalletLink.addEventListener("click", (event) => {
        event?.preventDefault?.();
        this.dispatch("zap:wallet-link", { video: this.activeVideo });
      });
    }

    if (this.modalZapForm) {
      this.modalZapForm.addEventListener("submit", (event) => {
        event?.preventDefault?.();
        if (this.modalZapSendBtn?.dataset.completed === "true") {
          this.closeZapDialog();
          return;
        }
        if (this.modalZapSendBtn?.disabled) {
          return;
        }
        this.dispatch("video:zap", {
          video: this.activeVideo,
          amount: this.getZapAmountValue(),
          comment: this.getZapCommentValue(),
        });
      });
    }

    if (this.modalZapSendBtn) {
      this.modalZapSendBtn.addEventListener("click", (event) => {
        if (this.modalZapSendBtn?.dataset.completed === "true") {
          event?.preventDefault?.();
          this.closeZapDialog();
        }
      });
    }

    if (this.modalZapAmountInput) {
      const amountHandler = () => {
        this.dispatch("zap:amount-change", {
          video: this.activeVideo,
          amount: this.getZapAmountValue(),
        });
      };
      this.modalZapAmountInput.addEventListener("input", amountHandler);
      this.modalZapAmountInput.addEventListener("change", amountHandler);
    }

    if (this.modalZapCommentInput) {
      const commentHandler = () => {
        this.dispatch("zap:comment-change", {
          video: this.activeVideo,
          comment: this.getZapCommentValue(),
        });
      };
      this.modalZapCommentInput.addEventListener("input", commentHandler);
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

  open(video, options = {}) {
    this.activeVideo = video || null;
    if (!this.playerModal) {
      return;
    }

    this.playerModal.style.display = "flex";
    this.playerModal.classList.remove("hidden");
    this.document.body.classList.add("modal-open");
    this.document.documentElement.classList.add("modal-open");
    const triggerElement =
      options && typeof options === "object" ? options.triggerElement : null;
    this.modalAccessibility?.activate({ triggerElement });
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
    this.modalAccessibility?.deactivate();
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
    const shouldShow = !!visible;
    if (this.modalZapBtn) {
      this.modalZapBtn.classList.toggle("hidden", !shouldShow);
      const disableButton = !shouldShow || this.modalZapPending;
      this.modalZapBtn.disabled = disableButton;
      this.modalZapBtn.setAttribute("aria-disabled", (!shouldShow).toString());
      this.modalZapBtn.setAttribute("aria-hidden", (!shouldShow).toString());
      this.modalZapBtn.setAttribute("aria-expanded", "false");
      if (shouldShow) {
        this.modalZapBtn.removeAttribute("tabindex");
      } else {
        this.modalZapBtn.setAttribute("tabindex", "-1");
      }
      if (this.modalZapPending) {
        this.modalZapBtn.setAttribute("aria-busy", "true");
        this.modalZapBtn.classList.add("opacity-50", "pointer-events-none");
      } else {
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
      }
    }

    if (!shouldShow) {
      this.closeZapDialog({ silent: true });
    }
  }

  setWalletPromptVisible(visible) {
    if (!this.modalZapWalletPrompt) {
      return;
    }
    const shouldShow = !!visible;
    this.modalZapWalletPrompt.classList.toggle("hidden", !shouldShow);
    this.modalZapWalletPrompt.setAttribute(
      "aria-hidden",
      (!shouldShow).toString()
    );
  }

  openZapDialog() {
    if (!this.modalZapDialog) {
      return;
    }
    this.modalZapDialog.classList.remove("hidden");
    this.modalZapDialogOpen = true;
    this.modalZapDialog.setAttribute("aria-hidden", "false");
    if (this.modalZapBtn) {
      this.modalZapBtn.setAttribute("aria-expanded", "true");
    }
    this.focusZapAmount();
  }

  closeZapDialog({ silent = false } = {}) {
    if (!this.modalZapDialog) {
      return;
    }
    if (this.modalZapDialogOpen) {
      this.modalZapDialog.classList.add("hidden");
      this.modalZapDialog.setAttribute("aria-hidden", "true");
      this.modalZapDialogOpen = false;
      if (this.modalZapBtn) {
        this.modalZapBtn.setAttribute("aria-expanded", "false");
      }
      if (!silent) {
        this.dispatch("zap:close", { video: this.activeVideo });
      }
    }
  }

  isZapDialogOpen() {
    return !!this.modalZapDialogOpen;
  }

  focusZapAmount() {
    if (
      this.modalZapAmountInput &&
      typeof this.modalZapAmountInput.focus === "function"
    ) {
      this.modalZapAmountInput.focus();
    }
  }

  getZapAmountValue() {
    if (!this.modalZapAmountInput) {
      return 0;
    }
    const numeric = Number(this.modalZapAmountInput.value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.round(numeric));
  }

  setZapAmount(value) {
    if (!this.modalZapAmountInput) {
      return;
    }
    if (value === null || value === undefined || value === "") {
      this.modalZapAmountInput.value = "";
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      this.modalZapAmountInput.value = Math.max(0, Math.round(numeric));
      return;
    }
    this.modalZapAmountInput.value = value;
  }

  getZapCommentValue() {
    if (!this.modalZapCommentInput) {
      return "";
    }
    return (this.modalZapCommentInput.value || "").trim();
  }

  setZapComment(value) {
    if (!this.modalZapCommentInput) {
      return;
    }
    this.modalZapCommentInput.value = typeof value === "string" ? value : "";
  }

  resetZapForm({ amount = "", comment = "" } = {}) {
    this.setZapAmount(amount);
    this.setZapComment(comment);
    this.setZapStatus("", "neutral");
    this.clearZapReceipts();
    this.setZapRetryPending(false);
    this.setZapCompleted(false);
  }

  setZapSplitSummary(text) {
    if (!this.modalZapSplitSummary) {
      return;
    }
    const message = typeof text === "string" ? text : "";
    this.modalZapSplitSummary.textContent = message || "Enter an amount to view the split.";
  }

  setZapStatus(message, tone = "neutral") {
    if (!this.modalZapStatusEl) {
      return;
    }

    const normalizedTone = typeof tone === "string" ? tone : "neutral";
    const text = typeof message === "string" ? message : "";
    this.modalZapStatusEl.textContent = text;
    this.modalZapStatusEl.classList.remove(
      "text-gray-300",
      "text-gray-400",
      "text-green-300",
      "text-red-300",
      "text-yellow-300"
    );

    if (!text) {
      this.modalZapStatusEl.classList.add("text-gray-400");
      return;
    }

    if (normalizedTone === "success") {
      this.modalZapStatusEl.classList.add("text-green-300");
    } else if (normalizedTone === "error") {
      this.modalZapStatusEl.classList.add("text-red-300");
    } else if (normalizedTone === "warning") {
      this.modalZapStatusEl.classList.add("text-yellow-300");
    } else {
      this.modalZapStatusEl.classList.add("text-gray-300");
    }
  }

  clearZapReceipts() {
    if (!this.modalZapReceipts) {
      return;
    }
    while (this.modalZapReceipts.firstChild) {
      this.modalZapReceipts.removeChild(this.modalZapReceipts.firstChild);
    }
  }

  renderZapReceipts(receipts = [], { partial = false } = {}) {
    if (!this.modalZapReceipts || !this.document) {
      return;
    }

    this.clearZapReceipts();

    if (!Array.isArray(receipts) || receipts.length === 0) {
      if (partial) {
        const empty = this.document.createElement("li");
        empty.className = "text-sm text-gray-300";
        empty.textContent = "No zap receipts available.";
        this.modalZapReceipts.appendChild(empty);
      }
      return;
    }

    receipts.forEach((receipt) => {
      const li = this.document.createElement("li");
      li.className = "rounded border border-gray-700 p-3 bg-gray-800/70";

      const header = this.document.createElement("div");
      header.className = "flex items-center justify-between gap-2 text-xs text-gray-300";

      const shareType = receipt.recipientType || receipt.type || "creator";
      const shareLabel = this.document.createElement("span");
      const label =
        shareType === "platform"
          ? "Platform"
          : shareType === "creator"
          ? "Creator"
          : "Lightning";
      shareLabel.textContent = `${label} • ${Math.max(
        0,
        Math.round(Number(receipt.amount || 0))
      )} sats`;

      const status = this.document.createElement("span");
      const isSuccess = receipt.status
        ? receipt.status === "success"
        : !receipt.error;
      status.textContent = isSuccess ? "Success" : "Failed";
      status.className = isSuccess ? "text-green-300" : "text-red-300";

      header.appendChild(shareLabel);
      header.appendChild(status);
      li.appendChild(header);

      const address = this.document.createElement("p");
      address.className = "mt-1 text-xs text-gray-300 break-all";
      if (receipt.address) {
        address.textContent = receipt.address;
        li.appendChild(address);
      }

      const detail = this.document.createElement("p");
      detail.className = "mt-2 text-xs text-gray-400";
      if (isSuccess) {
        let detailMessage = "Invoice settled.";
        const preimage = receipt.payment?.result?.preimage;
        if (typeof preimage === "string" && preimage) {
          detailMessage = `Preimage: ${preimage.slice(0, 18)}${
            preimage.length > 18 ? "…" : ""
          }`;
        }
        detail.textContent = detailMessage;
      } else {
        const errorMessage =
          (receipt.error && receipt.error.message) ||
          (typeof receipt.error === "string"
            ? receipt.error
            : "Payment failed.");
        detail.textContent = errorMessage;
      }
      li.appendChild(detail);

      this.modalZapReceipts.appendChild(li);
    });
  }

  setZapPending(pending) {
    const isPending = !!pending;
    this.modalZapPending = isPending;

    if (this.modalZapSendBtn) {
      this.modalZapSendBtn.disabled = isPending;
      this.modalZapSendBtn.setAttribute(
        "aria-busy",
        isPending ? "true" : "false"
      );
      this.modalZapSendBtn.classList.toggle("opacity-50", isPending);
      this.modalZapSendBtn.classList.toggle("pointer-events-none", isPending);
    }

    if (this.modalZapAmountInput) {
      this.modalZapAmountInput.disabled = isPending;
    }

    if (this.modalZapCommentInput) {
      this.modalZapCommentInput.disabled = isPending;
    }

    if (this.modalZapCloseBtn) {
      this.modalZapCloseBtn.disabled = isPending;
      this.modalZapCloseBtn.classList.toggle("opacity-50", isPending);
      this.modalZapCloseBtn.classList.toggle("pointer-events-none", isPending);
    }

    if (this.modalZapBtn) {
      if (isPending) {
        this.modalZapBtn.disabled = true;
        this.modalZapBtn.setAttribute("aria-busy", "true");
        this.modalZapBtn.classList.add("opacity-50", "pointer-events-none");
      } else if (!this.modalZapBtn.classList.contains("hidden")) {
        this.modalZapBtn.disabled = false;
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
      } else {
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
        this.modalZapBtn.disabled = true;
      }
    }
  }

  setZapRetryPending(pending, { summary = "" } = {}) {
    if (!this.modalZapSendBtn) {
      return;
    }

    if (pending) {
      delete this.modalZapSendBtn.dataset.completed;
      this.modalZapSendBtn.dataset.retryPending = "true";
      if (summary) {
        this.modalZapSendBtn.dataset.retrySummary = summary;
      } else {
        delete this.modalZapSendBtn.dataset.retrySummary;
      }
    } else {
      delete this.modalZapSendBtn.dataset.retryPending;
      delete this.modalZapSendBtn.dataset.retrySummary;
    }

    this.applyZapSendButtonState();
  }

  setZapCompleted(completed) {
    if (!this.modalZapSendBtn) {
      return;
    }

    if (completed) {
      delete this.modalZapSendBtn.dataset.retryPending;
      delete this.modalZapSendBtn.dataset.retrySummary;
      this.modalZapSendBtn.dataset.completed = "true";
    } else {
      delete this.modalZapSendBtn.dataset.completed;
    }

    this.applyZapSendButtonState();
  }

  applyZapSendButtonState() {
    if (!this.modalZapSendBtn) {
      return;
    }

    if (this.modalZapSendBtn.dataset.completed === "true") {
      this.modalZapSendBtn.textContent = "Done";
      this.modalZapSendBtn.setAttribute("aria-label", "Close zap dialog");
      this.modalZapSendBtn.title = "Close zap dialog";
      return;
    }

    if (this.modalZapSendBtn.dataset.retryPending === "true") {
      this.modalZapSendBtn.textContent = "Retry";
      this.modalZapSendBtn.setAttribute(
        "aria-label",
        "Retry failed zap shares"
      );
      const summary = this.modalZapSendBtn.dataset.retrySummary;
      if (summary) {
        this.modalZapSendBtn.title = summary;
      } else {
        this.modalZapSendBtn.removeAttribute("title");
      }
      return;
    }

    this.modalZapSendBtn.textContent = "Send";
    this.modalZapSendBtn.setAttribute("aria-label", "Send a zap");
    this.modalZapSendBtn.removeAttribute("title");
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
    timestamps,
    viewCount,
    creator,
  } = {}) {
    if (this.videoTitle && title !== undefined) {
      this.videoTitle.textContent = title || "Untitled";
    }
    if (this.videoDescription && description !== undefined) {
      this.videoDescription.textContent = description || "";
    }
    if (timestamps) {
      this.updateTimestamps(timestamps);
    } else if (timestamp !== undefined) {
      this.updateTimestamps({ posted: timestamp });
    }
    if (this.videoViewCountEl && viewCount !== undefined) {
      if (typeof viewCount === "string") {
        this.updateViewCountLabel(viewCount);
      } else {
        this.updateViewCountLabel("");
      }
    }
    if (creator !== undefined) {
      this.updateCreator(creator);
    }
  }

  updateTimestamps({ posted, edited } = {}) {
    if (this.videoTimestamp) {
      if (posted) {
        this.videoTimestamp.textContent = posted;
        this.videoTimestamp.classList.remove("hidden");
      } else {
        this.videoTimestamp.textContent = "";
        this.videoTimestamp.classList.add("hidden");
      }
    }

    if (this.videoEditedTimestamp) {
      if (edited) {
        this.videoEditedTimestamp.textContent = edited;
        this.videoEditedTimestamp.classList.remove("hidden");
      } else {
        this.videoEditedTimestamp.textContent = "";
        this.videoEditedTimestamp.classList.add("hidden");
      }
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

      if (action === "repost-event") {
        if (currentVideo?.id) {
          button.dataset.eventId = currentVideo.id;
        } else {
          delete button.dataset.eventId;
        }

        if (currentVideo?.pubkey) {
          button.dataset.author = currentVideo.pubkey;
        } else {
          delete button.dataset.author;
        }

        if (
          Array.isArray(currentVideo?.pointer) &&
          currentVideo.pointer.length >= 2
        ) {
          const [pointerType, pointerValue, pointerRelay] = currentVideo.pointer;
          button.dataset.pointerType = pointerType || "";
          button.dataset.pointerValue = pointerValue || "";
          if (pointerRelay) {
            button.dataset.pointerRelay = pointerRelay;
          } else {
            delete button.dataset.pointerRelay;
          }
        } else {
          delete button.dataset.pointerType;
          delete button.dataset.pointerValue;
          delete button.dataset.pointerRelay;
        }

        if (Number.isFinite(currentVideo?.kind)) {
          button.dataset.kind = String(Math.floor(currentVideo.kind));
        } else {
          delete button.dataset.kind;
        }
        return;
      }

      if (action === "mirror-video") {
        const hasUrl =
          typeof currentVideo?.url === "string" && currentVideo.url.trim();
        const isPrivate = currentVideo?.isPrivate === true;

        if (hasUrl && !isPrivate) {
          button.classList.remove("hidden");
          button.setAttribute("aria-hidden", "false");
          button.dataset.eventId = currentVideo.id || "";
          button.dataset.author = currentVideo.pubkey || "";
          button.dataset.url = currentVideo.url || "";
          button.dataset.magnet =
            currentVideo.magnet || currentVideo.originalMagnet || "";
          button.dataset.thumbnail = currentVideo.thumbnail || "";
          button.dataset.description = currentVideo.description || "";
          button.dataset.title = currentVideo.title || "";
          button.dataset.isPrivate = "false";
        } else {
          delete button.dataset.eventId;
          delete button.dataset.author;
          delete button.dataset.url;
          delete button.dataset.magnet;
          delete button.dataset.thumbnail;
          delete button.dataset.description;
          delete button.dataset.title;
          button.dataset.isPrivate = "true";
          button.classList.add("hidden");
          button.setAttribute("aria-hidden", "true");
        }
        return;
      }

      if (action === "ensure-presence") {
        if (currentVideo?.id) {
          button.dataset.eventId = currentVideo.id;
        } else {
          delete button.dataset.eventId;
        }

        if (currentVideo?.pubkey) {
          button.dataset.author = currentVideo.pubkey;
          button.dataset.pubkey = currentVideo.pubkey;
        } else {
          delete button.dataset.author;
          delete button.dataset.pubkey;
        }

        if (
          Array.isArray(currentVideo?.pointer) &&
          currentVideo.pointer.length >= 2
        ) {
          const [pointerType, pointerValue, pointerRelay] = currentVideo.pointer;
          button.dataset.pointerType = pointerType || "";
          button.dataset.pointerValue = pointerValue || "";
          if (pointerRelay) {
            button.dataset.pointerRelay = pointerRelay;
          } else {
            delete button.dataset.pointerRelay;
          }
        } else {
          delete button.dataset.pointerType;
          delete button.dataset.pointerValue;
          delete button.dataset.pointerRelay;
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
