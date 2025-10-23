import { createModalAccessibility } from "./modalAccessibility.js";
import createPopover from "../overlay/popoverEngine.js";
import { createVideoMoreMenuPanel } from "./videoMenuRenderers.js";
import { attachAmbientBackground } from "../ambientBackground.js";
import { applyDesignSystemAttributes } from "../../designSystem.js";
import { devLogger } from "../../utils/logger.js";
import { renderTagPillStrip } from "./tagPillList.js";

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
    const providedLogger = logger ?? devLogger;
    if (typeof providedLogger === "function") {
      this.logger = { log: providedLogger };
    } else if (providedLogger && typeof providedLogger.log === "function") {
      this.logger = providedLogger;
    } else {
      this.logger = devLogger;
    }
    this.eventTarget = new EventTarget();

    this.loaded = false;

    this.playerModal = null;
    this.modalPanel = null;
    this.modalBackdrop = null;
    this.scrollRegion = null;
    this.modalVideo = null;
    this.modalStatus = null;
    this.modalProgress = null;
    this.modalProgressStatus = null;
    this.modalPeers = null;
    this.modalSpeed = null;
    this.modalDownloaded = null;
    this.videoTitle = null;
    this.videoDescription = null;
    this.videoTimestamp = null;
    this.videoEditedTimestamp = null;
    this.videoViewCountEl = null;
    this.videoTagsRoot = null;
    this.videoTagsData = Object.freeze([]);
    this.creatorAvatar = null;
    this.creatorName = null;
    this.creatorNpub = null;
    this.copyMagnetBtn = null;
    this.shareBtn = null;
    this.modalZapBtn = null;
    this.modalMoreBtn = null;
    this.reactionButtons = {
      "+": null,
      "-": null,
    };
    this.reactionMeter = null;
    this.reactionMeterFill = null;
    this.reactionMeterLabel = null;
    this.reactionMeterAssistive = null;
    this.reactionCountLabels = {
      "+": null,
      "-": null,
    };
    this.reactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };
    this.reactionNumberFormatter = null;

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
    this.modalZapRequiresLogin = false;
    this.modalZapPopover = null;
    this.modalZapOpenPromise = null;
    this.modalZapPendingToggle = null;

    this.modalMorePopover = null;
    this.modalMoreMenuPanel = null;
    this.modalMoreMenuContext = {
      video: null,
      pointerInfo: null,
      playbackUrl: "",
      playbackMagnet: "",
      canManageBlacklist: false,
    };

    this.modalPosterCleanup = null;
    this.videoEventCleanup = null;
    this.ambientCanvas = null;
    this.detachAmbientBackground = null;

    this.activeVideo = null;

    this.handleCopyRequest = this.handleCopyRequest.bind(this);
    this.handleShareRequest = this.handleShareRequest.bind(this);
    this.handleCreatorNavigation = this.handleCreatorNavigation.bind(this);
    this.handleModalMoreButtonClick = this.handleModalMoreButtonClick.bind(this);
    this.handleReactionClick = this.handleReactionClick.bind(this);
    this.handleVideoTagActivate = this.handleVideoTagActivate.bind(this);

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
    devLogger.log(message, ...args);
  }

  addEventListener(type, listener, options) {
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.eventTarget.removeEventListener(type, listener, options);
  }

  dispatch(type, detail, options = {}) {
    const config =
      options && typeof options === "object" ? { ...options } : Object.create(null);
    const event = new CustomEvent(type, {
      detail,
      cancelable: Boolean(config.cancelable),
    });
    return this.eventTarget.dispatchEvent(event);
  }

  getRoot() {
    return this.playerModal;
  }

  getVideoElement() {
    return this.modalVideo;
  }

  setVideoElement(videoElement) {
    this.teardownAmbientGlow({ clear: false });
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

    this.attachAmbientGlow();

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
        this.cleanupVideoTags();
        this.videoTagsRoot = null;
        this.playerModal = null;
      }
    }

    const existing = this.document.getElementById("playerModal");
    if (existing) {
      if (this.playerModal === existing && this.loaded) {
        return this.playerModal;
      }
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

    applyDesignSystemAttributes(playerModal);

    this.hydrate(playerModal);
    this.loaded = true;
    return this.playerModal;
  }

  hydrate(playerModal) {
    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }
    this.modalAccessibility = null;

    if (this.modalZapPopover?.destroy) {
      this.modalZapPopover.destroy();
    }
    if (this.modalMorePopover?.destroy) {
      this.modalMorePopover.destroy();
    }
    this.modalZapPopover = null;
    this.modalZapOpenPromise = null;
    this.modalZapPendingToggle = null;
    this.modalMorePopover = null;
    this.modalMoreMenuPanel = null;

    this.teardownAmbientGlow({ clear: false });

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

    const nextVideoTagsRoot = playerModal.querySelector("#videoTags") || null;
    if (this.videoTagsRoot && this.videoTagsRoot !== nextVideoTagsRoot) {
      this.cleanupVideoTags(this.videoTagsRoot);
    }
    this.videoTagsRoot = nextVideoTagsRoot;
    if (this.videoTagsRoot) {
      this.cleanupVideoTags(this.videoTagsRoot);
    }

    const previousTags = Array.isArray(this.videoTagsData)
      ? [...this.videoTagsData]
      : [];
    this.videoTagsData = null;

    this.modalVideo = playerModal.querySelector("#modalVideo") || null;
    this.modalStatus = playerModal.querySelector("#modalStatus") || null;
    this.modalProgress = playerModal.querySelector("#modalProgress") || null;
    this.modalProgressStatus =
      playerModal.querySelector("#modalProgressStatus") || null;
    this.modalPeers = playerModal.querySelector("#modalPeers") || null;
    this.modalSpeed = playerModal.querySelector("#modalSpeed") || null;
    this.modalDownloaded =
      playerModal.querySelector("#modalDownloaded") || null;
    this.videoTitle = playerModal.querySelector("#videoTitle") || null;
    this.videoDescription =
      playerModal.querySelector("#videoDescription") || null;
    this.videoTimestamp = playerModal.querySelector("#videoTimestamp") || null;
    this.videoEditedTimestamp =
      playerModal.querySelector("#videoEditedTimestamp") || null;
    this.videoViewCountEl =
      playerModal.querySelector("#videoViewCount") || null;
    this.creatorAvatar = playerModal.querySelector("#creatorAvatar") || null;
    this.creatorName = playerModal.querySelector("#creatorName") || null;
    this.creatorNpub = playerModal.querySelector("#creatorNpub") || null;
    this.copyMagnetBtn = playerModal.querySelector("#copyMagnetBtn") || null;
    this.shareBtn = playerModal.querySelector("#shareBtn") || null;
    this.modalZapBtn = playerModal.querySelector("#modalZapBtn") || null;
    this.modalMoreBtn = playerModal.querySelector("#modalMoreBtn") || null;
    this.reactionButtons["+"] =
      playerModal.querySelector("#modalLikeBtn") || null;
    this.reactionButtons["-"] =
      playerModal.querySelector("#modalDislikeBtn") || null;
    this.reactionMeter =
      playerModal.querySelector("[data-reaction-meter]") || null;
    this.reactionMeterFill =
      playerModal.querySelector("[data-reaction-meter-fill]") || null;
    this.reactionMeterLabel =
      playerModal.querySelector("[data-reaction-meter-label]") || null;
    this.reactionMeterAssistive =
      playerModal.querySelector("[data-reaction-meter-sr]") || null;
    this.reactionCountLabels["+"] =
      playerModal.querySelector("[data-reaction-like-count]") || null;
    this.reactionCountLabels["-"] =
      playerModal.querySelector("[data-reaction-dislike-count]") || null;

    this.renderVideoTags(previousTags);

    this.ambientCanvas = playerModal.querySelector("#ambientCanvas") || null;

    this.modalZapDialog = playerModal.querySelector("#modalZapDialog") || null;
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
    this.modalZapDialogOpen = false;
    this.setupModalZapPopover();
    this.setupModalMorePopover();

    Object.values(this.reactionButtons).forEach((button) => {
      if (button) {
        button.addEventListener("click", this.handleReactionClick);
      }
    });
    this.syncReactionButtons();
    this.updateReactionMeterDisplay();

    const closeButton = playerModal.querySelector("#closeModal");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        this.dispatch("modal:close", { video: this.activeVideo });
      });
    }

    const modalNav = playerModal.querySelector("#modalNav");
    if (modalNav && this.scrollRegion) {
      let lastScrollY = 0;
      const updateNavVisibility = (shouldShowNav) => {
        modalNav.classList.toggle("modal-nav--hidden", !shouldShowNav);
        modalNav.classList.toggle("modal-nav--visible", shouldShowNav);
      };
      this.modalNavScrollHandler = () => {
        const currentScrollY = this.scrollRegion.scrollTop;
        const shouldShowNav =
          currentScrollY <= lastScrollY || currentScrollY < 50;
        updateNavVisibility(shouldShowNav);
        lastScrollY = currentScrollY;
      };
      updateNavVisibility(true);
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
      }
    });

    this.bindVideoEvents();
    this.bindActionButtons();
    this.setZapVisibility(false);
    this.setCopyEnabled(false);
    this.setShareEnabled(false);
    this.resetStats();

    this.attachAmbientGlow();

    if (!this.activeVideo && this.playerModal) {
      this.playerModal.classList.add("hidden");
      this.playerModal.setAttribute("hidden", "");
      this.document?.body?.classList?.remove("modal-open");
      this.document?.documentElement?.classList?.remove("modal-open");
    }
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
        active: this.activeVideo
      });
    };
    const playingHandler = () => {
      this.dispatch("playback:playing", {
        video: this.modalVideo,
        active: this.activeVideo
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

  getAmbientFallbackColor() {
    const canvas = this.ambientCanvas;
    const doc =
      canvas?.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);
    const win = doc?.defaultView || (typeof window !== "undefined" ? window : null);

    if (doc && win && typeof win.getComputedStyle === "function") {
      const styles = win.getComputedStyle(doc.documentElement);
      const tokens = [
        "--color-overlay-strong",
        "--color-overlay",
        "--color-surface",
        "--color-bg",
      ];

      for (const token of tokens) {
        const value = styles.getPropertyValue(token);
        if (value && value.trim()) {
          return value.trim();
        }
      }
    }

    return "#000000";
  }

  clearAmbientCanvas() {
    const canvas = this.ambientCanvas;
    if (!canvas || typeof canvas.getContext !== "function") {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = canvas.width || canvas.clientWidth || 0;
    const height = canvas.height || canvas.clientHeight || 0;
    if (!width || !height) {
      return;
    }

    context.fillStyle = this.getAmbientFallbackColor();
    context.fillRect(0, 0, width, height);
  }

  teardownAmbientGlow({ clear = true } = {}) {
    const detach = this.detachAmbientBackground;
    this.detachAmbientBackground = null;

    if (typeof detach === "function") {
      try {
        detach({ clear });
        return;
      } catch (error) {
        this.log("[VideoModal] Failed to teardown ambient background", error);
      }
    }

    if (clear) {
      this.clearAmbientCanvas();
    }
  }

  attachAmbientGlow() {
    if (!this.modalVideo || !this.ambientCanvas) {
      this.clearAmbientCanvas();
      return;
    }

    try {
      this.detachAmbientBackground = attachAmbientBackground(
        this.modalVideo,
        this.ambientCanvas,
      );
    } catch (error) {
      this.detachAmbientBackground = null;
      this.log("[VideoModal] Failed to attach ambient background", error);
      this.clearAmbientCanvas();
    }
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
        event?.stopPropagation?.();

        if (this.modalZapBtn?.disabled) {
          return;
        }

        if (this.modalZapRequiresLogin) {
          this.dispatch(
            "zap:open",
            {
              video: this.activeVideo,
              requiresLogin: true,
            },
            { cancelable: false },
          );
          return;
        }

        const popoverIsOpen = this.isZapDialogOpen();

        if (this.modalZapOpenPromise) {
          this.modalZapPendingToggle = "close";
          return;
        }

        if (popoverIsOpen) {
          if (this.modalZapPending) {
            return;
          }

          this.closeZapDialog();
          return;
        }

        const allowed = this.dispatch(
          "zap:open",
          { video: this.activeVideo },
          { cancelable: true },
        );
        if (allowed === false) {
          return;
        }

        this.modalZapPendingToggle = null;
        this.openZapDialog();
      });
    }

    if (this.modalMoreBtn && this.modalMoreBtn.dataset.modalMenuHandler !== "true") {
      this.modalMoreBtn.dataset.modalMenuHandler = "true";
      this.modalMoreBtn.addEventListener("click", this.handleModalMoreButtonClick);
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
          comment: this.getZapCommentValue()
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
          amount: this.getZapAmountValue()
        });
      };
      this.modalZapAmountInput.addEventListener("input", amountHandler);
      this.modalZapAmountInput.addEventListener("change", amountHandler);
    }

    if (this.modalZapCommentInput) {
      const commentHandler = () => {
        this.dispatch("zap:comment-change", {
          video: this.activeVideo,
          comment: this.getZapCommentValue()
        });
      };
      this.modalZapCommentInput.addEventListener("input", commentHandler);
    }

    if (this.creatorAvatar) {
      this.creatorAvatar.addEventListener(
        "click",
        this.handleCreatorNavigation
      );
    }
    if (this.creatorName) {
      this.creatorName.addEventListener("click", this.handleCreatorNavigation);
    }
  }

  setupModalZapPopover() {
    if (!this.modalZapDialog) {
      this.modalZapPopover = null;
      return;
    }

    if (!this.modalZapDialog.dataset.state) {
      const isHidden =
        this.modalZapDialog.hasAttribute("hidden") ||
        this.modalZapDialog.getAttribute("aria-hidden") === "true";
      this.modalZapDialog.dataset.state = isHidden ? "closed" : "open";
    }

    if (this.modalZapDialog.dataset.state !== "open") {
      this.modalZapDialog.hidden = true;
      this.modalZapDialog.setAttribute("aria-hidden", "true");
      this.modalZapDialogOpen = false;
    }

    if (!this.modalZapBtn) {
      this.modalZapPopover = null;
      return;
    }

    const documentRef =
      this.modalZapDialog.ownerDocument ||
      this.modalZapBtn.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);

    const popover = createPopover(
      this.modalZapBtn,
      () => this.modalZapDialog,
      {
        document: documentRef,
        placement: "bottom-end",
        restoreFocusOnClose: true,
      },
    );

    if (!popover) {
      this.modalZapPopover = null;
      return;
    }

    const originalOpen = popover.open?.bind(popover);
    if (originalOpen) {
      popover.open = async (...args) => {
        const result = await originalOpen(...args);
        if (result) {
          this.modalZapDialog.dataset.state = "open";
          this.modalZapDialog.hidden = false;
          this.modalZapDialog.setAttribute("aria-hidden", "false");
          this.modalZapDialogOpen = true;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "true");
          }
          this.focusZapAmount();
        }
        return result;
      };
    }

    const originalClose = popover.close?.bind(popover);
    if (originalClose) {
      popover.close = (options = {}) => {
        const { silent = false, ...rest } = options;
        const wasOpen = popover.isOpen?.() === true;
        const result = originalClose(rest);
        if (wasOpen && result) {
          this.modalZapPendingToggle = null;
          this.modalZapOpenPromise = null;
          this.modalZapDialog.dataset.state = "closed";
          this.modalZapDialog.setAttribute("aria-hidden", "true");
          this.modalZapDialog.hidden = true;
          this.modalZapDialogOpen = false;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "false");
          }
          if (!silent) {
            this.dispatch("zap:close", { video: this.activeVideo });
          }
        }
        return result;
      };
    }

    const originalDestroy = popover.destroy?.bind(popover);
    if (originalDestroy) {
      popover.destroy = (...args) => {
        originalDestroy(...args);
        if (this.modalZapPopover === popover) {
          this.modalZapPopover = null;
        }
      };
    }

    this.modalZapPopover = popover;
  }

  setupModalMorePopover() {
    if (!this.modalMoreBtn) {
      this.modalMorePopover = null;
      this.modalMoreMenuPanel = null;
      return;
    }

    const documentRef =
      this.modalMoreBtn.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);

    const render = ({ document: doc, close }) => {
      const panel = this.buildModalMoreMenuPanel({ document: doc, close });
      this.modalMoreMenuPanel = panel;
      return panel;
    };

    const popover = createPopover(this.modalMoreBtn, render, {
      document: documentRef,
      placement: "bottom-end",
      restoreFocusOnClose: true,
    });

    if (!popover) {
      this.modalMorePopover = null;
      this.modalMoreMenuPanel = null;
      return;
    }

    const originalOpen = popover.open?.bind(popover);
    if (originalOpen) {
      popover.open = async (...args) => {
        this.refreshModalMoreMenuPanel();
        return originalOpen(...args);
      };
    }

    const originalDestroy = popover.destroy?.bind(popover);
    if (originalDestroy) {
      popover.destroy = (...args) => {
        originalDestroy(...args);
        if (this.modalMorePopover === popover) {
          this.modalMorePopover = null;
          this.modalMoreMenuPanel = null;
        }
      };
    }

    this.modalMoreBtn.dataset.moreMenuToggleBound = "true";
    this.modalMorePopover = popover;
  }

  buildModalMoreMenuPanel({ document: doc, close }) {
    const panel = createVideoMoreMenuPanel({
      document: doc,
      video: this.modalMoreMenuContext.video,
      pointerInfo: this.modalMoreMenuContext.pointerInfo,
      playbackUrl: this.modalMoreMenuContext.playbackUrl,
      playbackMagnet: this.modalMoreMenuContext.playbackMagnet,
      canManageBlacklist: this.modalMoreMenuContext.canManageBlacklist,
      context: "modal",
    });

    if (!panel) {
      return null;
    }

    const buttons = panel.querySelectorAll("button[data-action]");
    buttons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const dataset = {};
        Object.entries(button.dataset || {}).forEach(([key, value]) => {
          dataset[key] = value;
        });
        if (!dataset.context) {
          dataset.context = "modal";
        }

        const action = dataset.action || "";
        this.dispatch("video:context-action", {
          action,
          dataset,
        });

        if (typeof close === "function") {
          close({ reason: "action" });
        }
      });
    });

    return panel;
  }

  refreshModalMoreMenuPanel() {
    if (!this.modalMorePopover) {
      return;
    }

    const existingPanel =
      this.modalMorePopover.getPanel?.() || this.modalMoreMenuPanel;

    const documentRef =
      existingPanel?.ownerDocument ||
      this.modalMoreBtn?.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);

    if (!documentRef) {
      return;
    }

    const nextPanel = this.buildModalMoreMenuPanel({
      document: documentRef,
      close: (options) => this.modalMorePopover?.close(options),
    });

    if (!nextPanel) {
      return;
    }

    const currentPanel = this.modalMorePopover.getPanel?.();
    if (currentPanel && currentPanel.parentNode) {
      currentPanel.parentNode.replaceChild(nextPanel, currentPanel);
    } else if (existingPanel?.parentNode) {
      existingPanel.parentNode.replaceChild(nextPanel, existingPanel);
    }

    this.modalMoreMenuPanel = nextPanel;
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

  handleModalMoreButtonClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.modalMoreBtn?.disabled) {
      return;
    }
    if (this.modalMorePopover?.toggle) {
      this.modalMorePopover.toggle();
      return;
    }
    if (this.modalMorePopover?.isOpen?.()) {
      this.modalMorePopover.close?.();
    } else {
      this.modalMorePopover?.open?.();
    }
  }

  handleReactionClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const button = event?.currentTarget;
    if (!button || typeof button !== "object") {
      return;
    }

    if (button.disabled || button.getAttribute("aria-disabled") === "true") {
      return;
    }

    const reactionValue =
      typeof button.dataset?.reaction === "string"
        ? button.dataset.reaction.trim()
        : "";
    const normalized =
      reactionValue === "+"
        ? "+"
        : reactionValue === "-"
          ? "-"
          : "";

    if (!normalized) {
      return;
    }

    const currentReaction = this.reactionState?.userReaction || "";
    if (normalized === currentReaction) {
      return;
    }

    this.dispatch("video:reaction", {
      video: this.activeVideo,
      reaction: normalized,
      previousReaction: currentReaction,
    });
  }

  open(video, options = {}) {
    this.activeVideo = video || null;
    if (!this.playerModal) {
      return;
    }

    this.resetReactions();

    this.playerModal.classList.remove("hidden");
    this.playerModal.removeAttribute("hidden");
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
      this.playerModal.classList.add("hidden");
      this.playerModal.setAttribute("hidden", "");
    }
    this.document.body.classList.remove("modal-open");
    this.document.documentElement.classList.remove("modal-open");
    this.modalAccessibility?.deactivate();
    this.setGlobalModalState("player", false);
    this.closeZapDialog({ silent: true, restoreFocus: false });
    if (this.modalMorePopover?.close) {
      this.modalMorePopover.close({ restoreFocus: false });
    }
    this.renderVideoTags([]);
    this.forceRemovePoster("close");
  }

  resetReactions() {
    this.reactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };
    this.syncReactionButtons();
    this.updateReactionMeterDisplay();
  }

  setUserReaction(reaction) {
    const normalized = reaction === "+" ? "+" : reaction === "-" ? "-" : "";
    if (!this.reactionState) {
      this.reactionState = {
        counts: { "+": 0, "-": 0 },
        total: 0,
        userReaction: normalized,
      };
    } else {
      this.reactionState.userReaction = normalized;
    }
    this.syncReactionButtons();
  }

  updateReactionSummary({ total, counts, userReaction } = {}) {
    if (!this.reactionState) {
      this.reactionState = {
        counts: { "+": 0, "-": 0 },
        total: 0,
        userReaction: "",
      };
    }

    if (counts && typeof counts === "object") {
      const nextCounts = { ...this.reactionState.counts };
      for (const [key, value] of Object.entries(counts)) {
        nextCounts[key] = this.normalizeReactionCount(value);
      }
      this.reactionState.counts = nextCounts;
    }

    if (Number.isFinite(total)) {
      this.reactionState.total = Math.max(0, Number(total));
    } else if (counts && typeof counts === "object") {
      let computedTotal = 0;
      for (const value of Object.values(this.reactionState.counts)) {
        computedTotal += this.normalizeReactionCount(value);
      }
      this.reactionState.total = computedTotal;
    }

    if (userReaction !== undefined) {
      this.setUserReaction(userReaction);
    } else {
      this.syncReactionButtons();
    }

    this.updateReactionMeterDisplay();
  }

  syncReactionButtons() {
    const current = this.reactionState?.userReaction || "";
    const likeButton = this.reactionButtons?.["+"] || null;
    const dislikeButton = this.reactionButtons?.["-"] || null;
    if (likeButton) {
      likeButton.setAttribute("aria-pressed", current === "+" ? "true" : "false");
    }
    if (dislikeButton) {
      dislikeButton.setAttribute("aria-pressed", current === "-" ? "true" : "false");
    }
  }

  cleanupVideoTags(root = this.videoTagsRoot) {
    if (!root) {
      return;
    }

    const buttons = root.querySelectorAll("button");
    buttons.forEach((button) => {
      const handler = button.__tagPillClickHandler;
      if (handler) {
        button.removeEventListener("click", handler);
        delete button.__tagPillClickHandler;
      }
    });

    root.textContent = "";
  }

  toggleVideoTagsVisibility(isVisible) {
    const root = this.videoTagsRoot;
    if (!root) {
      return;
    }

    if (isVisible) {
      root.classList.remove("hidden");
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "false");
      return;
    }

    root.classList.add("hidden");
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
  }

  normalizeVideoTags(tags) {
    if (!tags) {
      return [];
    }

    let iterable;
    if (Array.isArray(tags)) {
      iterable = tags;
    } else if (typeof tags === "string") {
      iterable = [tags];
    } else if (typeof tags?.[Symbol.iterator] === "function") {
      iterable = Array.from(tags);
    } else {
      iterable = [];
    }

    const seen = new Set();
    const normalized = [];

    for (const entry of iterable) {
      if (entry === null || entry === undefined) {
        continue;
      }

      const raw = typeof entry === "string" ? entry : String(entry ?? "");
      const trimmed = raw.trim().replace(/^#+/, "");

      if (!trimmed) {
        continue;
      }

      const key = trimmed.toLocaleLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(trimmed);
    }

    return normalized.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }

  areVideoTagsEqual(nextTags, previousTags) {
    if (!Array.isArray(nextTags) || !Array.isArray(previousTags)) {
      return false;
    }

    if (nextTags.length !== previousTags.length) {
      return false;
    }

    for (let index = 0; index < nextTags.length; index += 1) {
      if (nextTags[index] !== previousTags[index]) {
        return false;
      }
    }

    return true;
  }

  renderVideoTags(tags = []) {
    const normalized = this.normalizeVideoTags(tags);
    const hasTags = normalized.length > 0;
    const root = this.videoTagsRoot;

    if (root) {
      if (this.areVideoTagsEqual(normalized, this.videoTagsData)) {
        this.toggleVideoTagsVisibility(hasTags);
        return;
      }

      this.cleanupVideoTags(root);

      if (hasTags) {
        const { root: strip } = renderTagPillStrip({
          document: root.ownerDocument || this.document,
          tags: normalized,
          onTagActivate: this.handleVideoTagActivate,
        });

        if (strip) {
          root.appendChild(strip);
        }
      }

      this.toggleVideoTagsVisibility(hasTags);
    }

    this.videoTagsData = Object.freeze([...normalized]);
  }

  handleVideoTagActivate(tag, { event, button } = {}) {
    const normalized =
      typeof tag === "string" ? tag : String(tag ?? "");

    if (!normalized) {
      return;
    }

    this.dispatch("tag:activate", {
      tag: normalized,
      video: this.activeVideo,
      trigger: button || null,
      nativeEvent: event || null,
    });
  }

  updateReactionMeterDisplay() {
    if (!this.reactionState) {
      return;
    }

    const counts = this.reactionState.counts || {};
    const likeCount = this.normalizeReactionCount(counts["+"]);
    const dislikeCount = this.normalizeReactionCount(counts["-"]);
    const totalReactions = likeCount + dislikeCount;
    const likeRatio = totalReactions > 0
      ? Math.round((likeCount / totalReactions) * 100)
      : 0;

    if (this.reactionCountLabels?.["+"]) {
      this.reactionCountLabels["+"].textContent = this.formatReactionCount(
        likeCount
      );
    }
    if (this.reactionCountLabels?.["-"]) {
      this.reactionCountLabels["-"].textContent = this.formatReactionCount(
        dislikeCount
      );
    }

    const meterLabel =
      totalReactions > 0
        ? `${likeRatio}% positive`
        : "No reactions yet";
    const assistiveLabel =
      totalReactions > 0
        ? `${likeRatio}% positive (${this.formatReactionCount(
            likeCount
          )} likes and ${this.formatReactionCount(dislikeCount)} dislikes)`
        : "No reactions yet";

    if (this.reactionMeter) {
      this.reactionMeter.setAttribute("aria-valuenow", String(likeRatio));
      this.reactionMeter.setAttribute("aria-valuetext", assistiveLabel);
    }

    if (this.reactionMeterLabel) {
      this.reactionMeterLabel.textContent = meterLabel;
    }

    if (this.reactionMeterAssistive) {
      this.reactionMeterAssistive.textContent = assistiveLabel;
    }

    if (this.reactionMeterFill) {
      this.reactionMeterFill.style.inlineSize = `${likeRatio}%`;
      this.reactionMeterFill.style.width = `${likeRatio}%`;
    }
  }

  normalizeReactionCount(value) {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.round(Number(value)));
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  getReactionNumberFormatter() {
    if (this.reactionNumberFormatter === false) {
      return null;
    }
    if (this.reactionNumberFormatter) {
      return this.reactionNumberFormatter;
    }
    try {
      if (this.window?.Intl?.NumberFormat) {
        this.reactionNumberFormatter = new this.window.Intl.NumberFormat();
        return this.reactionNumberFormatter;
      }
    } catch (error) {
      this.reactionNumberFormatter = false;
      return null;
    }
    this.reactionNumberFormatter = false;
    return null;
  }

  formatReactionCount(value) {
    const numeric = Number.isFinite(value) ? Number(value) : Number(value || 0);
    const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
    const formatter = this.getReactionNumberFormatter();
    if (formatter) {
      try {
        return formatter.format(safeValue);
      } catch (error) {
        // fallback below
      }
    }
    return String(safeValue);
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

    let nextValue = null;

    if (typeof value === "number" && Number.isFinite(value)) {
      nextValue = value;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        const parsed = Number.parseFloat(trimmed);
        if (Number.isFinite(parsed)) {
          nextValue = parsed;
        }
      }
    }

    if (!Number.isFinite(nextValue)) {
      this.modalProgress.value = 0;
      delete this.modalProgress.dataset.progress;
      this.modalProgress.dataset.state = "idle";
      this.modalProgress.setAttribute(
        "aria-valuetext",
        "Download progress unavailable",
      );
      if (this.modalProgressStatus) {
        this.modalProgressStatus.textContent = "";
      }
      return;
    }

    const clamped = Math.max(0, Math.min(100, nextValue));
    this.modalProgress.max = 100;
    this.modalProgress.value = clamped;
    this.modalProgress.dataset.progress = String(clamped);
    const state = clamped >= 100 ? "complete" : "active";
    this.modalProgress.dataset.state = state;
    const valueText = `Download ${clamped}% complete`;
    this.modalProgress.setAttribute("aria-valuetext", valueText);
    if (this.modalProgressStatus) {
      this.modalProgressStatus.textContent = valueText;
    }
  }

  setCopyEnabled(enabled) {
    if (!this.copyMagnetBtn) {
      return;
    }
    this.copyMagnetBtn.disabled = !enabled;
    this.copyMagnetBtn.setAttribute("aria-disabled", (!enabled).toString());
    this.copyMagnetBtn.classList.toggle("opacity-50", !enabled);
    this.copyMagnetBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  setShareEnabled(enabled) {
    if (!this.shareBtn) {
      return;
    }
    this.shareBtn.disabled = !enabled;
    this.shareBtn.setAttribute("aria-disabled", (!enabled).toString());
    this.shareBtn.classList.toggle("opacity-50", !enabled);
    this.shareBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  setZapVisibility(visible, options = {}) {
    let config;
    if (typeof visible === "object" && visible !== null) {
      config = { ...visible };
    } else {
      config = {
        visible,
        ...(options && typeof options === "object" ? options : {}),
      };
    }

    const shouldShow = !!config.visible;
    const requiresLogin = shouldShow && !!config.requiresLogin;
    this.modalZapRequiresLogin = requiresLogin;

    if (this.modalZapBtn) {
      this.modalZapBtn.toggleAttribute("hidden", !shouldShow);
      const disableButton =
        !shouldShow || (this.modalZapPending && !requiresLogin);
      this.modalZapBtn.disabled = disableButton;
      const ariaDisabledValue =
        requiresLogin || !shouldShow ? "true" : "false";
      this.modalZapBtn.setAttribute("aria-disabled", ariaDisabledValue);
      this.modalZapBtn.setAttribute("aria-hidden", (!shouldShow).toString());
      this.modalZapBtn.setAttribute("aria-expanded", "false");
      if (shouldShow) {
        this.modalZapBtn.removeAttribute("tabindex");
      } else {
        this.modalZapBtn.setAttribute("tabindex", "-1");
      }
      if (requiresLogin) {
        this.modalZapBtn.dataset.requiresLogin = "true";
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
      } else {
        delete this.modalZapBtn.dataset.requiresLogin;
        if (this.modalZapPending) {
          this.modalZapBtn.setAttribute("aria-busy", "true");
          this.modalZapBtn.classList.add("opacity-50", "pointer-events-none");
        } else {
          this.modalZapBtn.removeAttribute("aria-busy");
          this.modalZapBtn.classList.remove(
            "opacity-50",
            "pointer-events-none",
          );
        }
      }
    }

    if (!shouldShow || requiresLogin) {
      this.closeZapDialog({ silent: true, restoreFocus: false });
    }
  }

  setWalletPromptVisible(visible) {
    if (!this.modalZapWalletPrompt) {
      return;
    }
    const shouldShow = !!visible;
    this.modalZapWalletPrompt.toggleAttribute("hidden", !shouldShow);
    this.modalZapWalletPrompt.setAttribute(
      "aria-hidden",
      (!shouldShow).toString()
    );
  }

  async openZapDialog() {
    if (this.modalZapRequiresLogin) {
      return Promise.resolve(false);
    }

    if (this.modalZapOpenPromise) {
      return this.modalZapOpenPromise;
    }

    const runOpen = async () => {
      if (this.modalZapPopover?.open) {
        const opened = await this.modalZapPopover.open();
        if (opened) {
          this.modalZapDialogOpen = true;
          if (this.modalZapDialog) {
            this.modalZapDialog.dataset.state = "open";
            this.modalZapDialog.hidden = false;
            this.modalZapDialog.setAttribute("aria-hidden", "false");
          }
          this.focusZapAmount();
        }
        return opened;
      }

      if (!this.modalZapDialog) {
        return false;
      }

      this.modalZapDialog.hidden = false;
      this.modalZapDialog.dataset.state = "open";
      this.modalZapDialog.setAttribute("aria-hidden", "false");
      this.modalZapDialogOpen = true;
      if (this.modalZapBtn) {
        this.modalZapBtn.setAttribute("aria-expanded", "true");
      }
      this.focusZapAmount();
      return true;
    };

    const promise = runOpen().catch((error) => {
      this.log("[VideoModal] Failed to open zap popover", error);
      return false;
    });

    this.modalZapOpenPromise = promise.finally(() => {
      const shouldClose = this.modalZapPendingToggle === "close";
      this.modalZapOpenPromise = null;
      this.modalZapPendingToggle = null;
      if (shouldClose && !this.modalZapPending) {
        this.closeZapDialog();
      }
    });

    return this.modalZapOpenPromise;
  }

  closeZapDialog({ silent = false, restoreFocus } = {}) {
    this.modalZapPendingToggle = null;
    if (this.modalZapPopover?.close) {
      const options = { silent };
      if (restoreFocus !== undefined) {
        options.restoreFocus = restoreFocus;
      }
      const closeResult = this.modalZapPopover.close(options);

      if (
        closeResult !== true &&
        this.modalZapDialog &&
        this.modalZapDialogOpen
      ) {
        this.modalZapDialog.dataset.state = "closed";
        this.modalZapDialog.setAttribute("aria-hidden", "true");
        this.modalZapDialog.hidden = true;
        this.modalZapDialogOpen = false;
        if (this.modalZapBtn) {
          this.modalZapBtn.setAttribute("aria-expanded", "false");
        }
        if (!silent) {
          this.dispatch("zap:close", { video: this.activeVideo });
        }
      }

      return;
    }

    if (!this.modalZapDialog) {
      return;
    }
    if (this.modalZapDialogOpen) {
      this.modalZapDialog.dataset.state = "closed";
      this.modalZapDialog.setAttribute("aria-hidden", "true");
      this.modalZapDialog.hidden = true;
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
    const popoverIsOpen =
      typeof this.modalZapPopover?.isOpen === "function"
        ? this.modalZapPopover.isOpen()
        : null;

    if (popoverIsOpen === true) {
      return true;
    }

    if (popoverIsOpen === false && this.modalZapDialogOpen) {
      return true;
    }

    if (this.modalZapDialog?.dataset?.state === "open") {
      return true;
    }

    if (this.modalZapDialog && this.modalZapDialog.hidden === false) {
      return true;
    }

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
    this.modalZapSplitSummary.textContent =
      message || "Enter an amount to view the split.";
  }

  setZapStatus(message, tone = "neutral") {
    if (!this.modalZapStatusEl) {
      return;
    }

    const normalizedTone = typeof tone === "string" ? tone : "neutral";
    const text = typeof message === "string" ? message : "";
    this.modalZapStatusEl.textContent = text;
    this.modalZapStatusEl.classList.remove(
      "text-text",
      "text-muted",
      "text-info",
      "text-critical",
      "text-warning-strong"
    );

    if (!text) {
      this.modalZapStatusEl.classList.add("text-muted");
      return;
    }

    if (normalizedTone === "success") {
      this.modalZapStatusEl.classList.add("text-info");
    } else if (normalizedTone === "error") {
      this.modalZapStatusEl.classList.add("text-critical");
    } else if (normalizedTone === "warning") {
      this.modalZapStatusEl.classList.add("text-warning-strong");
    } else {
      this.modalZapStatusEl.classList.add("text-text");
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
        empty.className = "text-sm text-text";
        empty.textContent = "No zap receipts available.";
        this.modalZapReceipts.appendChild(empty);
      }
      return;
    }

    receipts.forEach((receipt) => {
      const li = this.document.createElement("li");
      li.className = "rounded border border-border p-3 bg-panel/70";

      const header = this.document.createElement("div");
      header.className =
        "flex items-center justify-between gap-2 text-xs text-text";

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
      status.className = isSuccess ? "text-info" : "text-critical";

      header.appendChild(shareLabel);
      header.appendChild(status);
      li.appendChild(header);

      const address = this.document.createElement("p");
      address.className = "mt-1 text-xs text-text break-all";
      if (receipt.address) {
        address.textContent = receipt.address;
        li.appendChild(address);
      }

      const detail = this.document.createElement("p");
      detail.className = "mt-2 text-xs text-muted";
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
      const buttonHidden = this.modalZapBtn.hasAttribute("hidden");
      if (isPending && !this.modalZapRequiresLogin) {
        this.modalZapBtn.disabled = true;
        this.modalZapBtn.setAttribute("aria-busy", "true");
        this.modalZapBtn.classList.add("opacity-50", "pointer-events-none");
      } else if (!buttonHidden) {
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
    tags,
  } = {}) {
    if (this.videoTitle && title !== undefined) {
      this.videoTitle.textContent = title || "Untitled";
    }
    if (this.videoDescription && description !== undefined) {
      this.renderVideoDescription(description);
    }
    if (tags !== undefined) {
      this.renderVideoTags(tags ?? []);
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

  renderVideoDescription(description) {
    const target = this.videoDescription;
    if (!target) {
      return;
    }

    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }

    if (description === null || description === undefined) {
      return;
    }

    const normalized =
      typeof description === "string" ? description : String(description ?? "");

    if (!normalized) {
      return;
    }

    const fragment = this.document.createDocumentFragment();
    const lines = normalized.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (index > 0) {
        fragment.appendChild(this.document.createElement("br"));
      }
      this.appendDescriptionLine(fragment, line);
    });

    target.appendChild(fragment);
  }

  appendDescriptionLine(target, line) {
    if (!target) {
      return;
    }

    const text = typeof line === "string" ? line : String(line ?? "");

    if (!text) {
      return;
    }

    const urlPattern = /\bhttps?:\/\/[^\s<>"']+/gi;
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
      const preceding = text.slice(lastIndex, match.index);
      if (preceding) {
        target.appendChild(this.document.createTextNode(preceding));
      }

      const { anchor, trailing } = this.createDescriptionLink(match[0]);

      if (anchor) {
        target.appendChild(anchor);
      } else if (match[0]) {
        target.appendChild(this.document.createTextNode(match[0]));
      }

      if (trailing) {
        target.appendChild(this.document.createTextNode(trailing));
      }

      lastIndex = match.index + match[0].length;
    }

    const remaining = text.slice(lastIndex);
    if (remaining) {
      target.appendChild(this.document.createTextNode(remaining));
    }
  }

  createDescriptionLink(rawMatch) {
    const normalized =
      typeof rawMatch === "string" ? rawMatch : String(rawMatch ?? "");

    if (!normalized) {
      return { anchor: null, trailing: "" };
    }

    let href = normalized;
    let trailing = "";
    const trailingPattern = /[)\]\}>"',.;!?]+$/;

    while (href && trailingPattern.test(href)) {
      trailing = href.slice(-1) + trailing;
      href = href.slice(0, -1);
    }

    if (!href) {
      return { anchor: null, trailing: normalized };
    }

    const anchor = this.document.createElement("a");
    anchor.classList.add("video-modal__description-link", "focus-ring");
    anchor.textContent = href;
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";

    return { anchor, trailing };
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
    this.modalMoreMenuContext.video = currentVideo || null;
    this.modalMoreMenuContext.canManageBlacklist = !!canManageBlacklist;

    const pointerArray =
      Array.isArray(currentVideo?.pointer) && currentVideo.pointer.length >= 2
        ? currentVideo.pointer
        : null;
    const pointerKey =
      typeof currentVideo?.pointerKey === "string"
        ? currentVideo.pointerKey
        : "";

    this.modalMoreMenuContext.pointerInfo = pointerArray
      ? { pointer: pointerArray, key: pointerKey }
      : null;

    this.modalMoreMenuContext.playbackUrl =
      typeof currentVideo?.url === "string" ? currentVideo.url : "";

    const magnetCandidate = (() => {
      if (typeof currentVideo?.magnet === "string" && currentVideo.magnet) {
        return currentVideo.magnet;
      }
      if (
        typeof currentVideo?.originalMagnet === "string" &&
        currentVideo.originalMagnet
      ) {
        return currentVideo.originalMagnet;
      }
      if (typeof currentVideo?.infoHash === "string" && currentVideo.infoHash) {
        return currentVideo.infoHash;
      }
      return "";
    })();

    this.modalMoreMenuContext.playbackMagnet = magnetCandidate;

    if (this.modalMorePopover?.isOpen?.()) {
      this.refreshModalMoreMenuPanel();
    }
  }
}
