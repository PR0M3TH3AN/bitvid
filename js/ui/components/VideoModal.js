import { createModalAccessibility } from "./modalAccessibility.js";
import createPopover from "../overlay/popoverEngine.js";
import {
  createVideoMoreMenuPanel,
  createVideoShareMenuPanel,
} from "./videoMenuRenderers.js";
import { attachAmbientBackground } from "../ambientBackground.js";
import { applyDesignSystemAttributes } from "../../designSystem.js";
import { devLogger } from "../../utils/logger.js";
import { CommentsController } from "./video-modal/commentsController.js";
import { ReactionsController } from "./video-modal/reactionsController.js";
import { SimilarContentController } from "./video-modal/similarContentController.js";
import { ModerationController } from "./video-modal/moderationController.js";
import { ZapController } from "./video-modal/zapController.js";
import { LinkPreviewController } from "./video-modal/linkPreviewController.js";
import {
  renderTagPillStrip,
  applyTagPreferenceState,
  trimTagPillStripToFit,
} from "./tagPillList.js";
import { SimilarContentCard } from "./SimilarContentCard.js";
import {
  buildSimilarCardIdentity,
  prepareSimilarVideoCard,
  attachSimilarCardViewCounter,
  derivePointerKeyFromInput,
} from "./VideoModalSimilarHelpers.js";
import {
  unsubscribeFromVideoViewCount,
} from "../../viewCounter.js";
import {
  getModerationOverrideActionLabels,
  normalizeVideoModerationContext,
} from "../moderationUiHelpers.js";
import { buildModerationBadgeText } from "../moderationCopy.js";
import {
  formatShortNpub as defaultFormatShortNpub,
} from "../../utils/formatters.js";
import { getBreakpointLg } from "../../designSystem/metrics.js";


const SIMILAR_CONTENT_LIMIT = 10;
// Fallback video for tests that don't provide a media loader
const DEFAULT_VIDEO_FALLBACK = {
  pause: () => {},
  play: () => Promise.resolve(),
};

/**
 * Main UI controller for the full-screen video playback modal.
 * Manages the modal lifecycle (load, open, close), orchestrates playback,
 * and coordinates sub-controllers for comments, reactions, and moderation.
 *
 * @see {@link docs/VideoModal-overview.md} for architectural details.
 */
export class VideoModal {
  /**
   * Initializes the video modal controller.
   * Note: Does not touch the DOM or load HTML until `load()` is called.
   *
   * @param {Object} options - Configuration options
   * @param {Function} [options.removeTrackingScripts] - Helper to sanitize HTML
   * @param {Function} options.setGlobalModalState - Callback to update app-wide modal state
   * @param {Document} options.document - The document instance (for DOM access)
   * @param {Object} [options.logger] - Logger instance (defaults to devLogger)
   * @param {Object} [options.mediaLoader] - Service for media resolution
   * @param {Object} [options.assets] - Asset configuration (e.g., fallback thumbnails)
   * @param {Object} [options.state] - Initial state (e.g., thumbnail cache)
   * @param {Object} [options.helpers] - Utility helpers (e.g., npub encoding)
   * @throws {Error} If document or setGlobalModalState is missing
   */
  constructor({
    removeTrackingScripts,
    setGlobalModalState,
    document: doc,
    logger,
    mediaLoader,
    assets = {},
    state = {},
    helpers = {},
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

    this.mediaLoader = null;

    const assetsConfig = assets && typeof assets === "object" ? assets : {};
    this.fallbackThumbnailSrc =
      typeof assetsConfig.fallbackThumbnailSrc === "string"
        ? assetsConfig.fallbackThumbnailSrc
        : "";

    const stateConfig = state && typeof state === "object" ? state : {};
    this.thumbnailCache =
      stateConfig.loadedThumbnails instanceof Map
        ? stateConfig.loadedThumbnails
        : null;

    const helperConfig = helpers && typeof helpers === "object" ? helpers : {};
    const fallbackFormatShort = (value) => {
      try {
        return defaultFormatShortNpub(value);
      } catch {
        return typeof value === "string" ? value : "";
      }
    };
    this.helpers = {
      safeEncodeNpub:
        typeof helperConfig.safeEncodeNpub === "function"
          ? helperConfig.safeEncodeNpub
          : () => "",
      formatShortNpub:
        typeof helperConfig.formatShortNpub === "function"
          ? helperConfig.formatShortNpub
          : fallbackFormatShort,
    };

    this.loaded = false;

    this.playerModal = null;
    this.modalPanel = null;
    this.modalBackdrop = null;
    this.scrollRegion = null;
    this.modalVideo = null;
    this.videoStage = null;
    this.modalStatus = null;
    this.modalProgress = null;
    this.modalProgressStatus = null;
    this.modalStatsContainer = null;
    this.modalStats = null;
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
    this.videoTagsSourceData = this.videoTagsData;
    this.videoTagsResizeObserver = null;
    this.videoTagsLastObservedWidth = 0;
    if (this.handleVideoTagsResize) {
      this.handleVideoTagsResize = this.handleVideoTagsResize.bind(this);
    } else {
        this.handleVideoTagsResize = () => {};
    }
    this.creatorAvatar = null;
    this.creatorName = null;
    this.creatorNpub = null;
    this.copyMagnetBtn = null;
    this.shareBtn = null;
    this.embedBtn = null;
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
    this.reactionMeterStyleNode = null;
    this.reactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };
    this.reactionNumberFormatter = null;

    this.similarContentContainer = null;
    this.similarContentHeading = null;
    this.similarContentList = null;
    this.similarContentCards = [];
    this.similarContentViewCountSubscriptions = [];
    this.pendingSimilarContent = null;
    this.similarContentVisible = false;
    this.similarContentMediaQuery = null;
    if (this.handleSimilarContentMediaChange) {
      this.handleSimilarContentMediaChange =
        this.handleSimilarContentMediaChange.bind(this);
    } else {
      this.handleSimilarContentMediaChange = () => {};
    }

    this.modalAccessibility = null;
    this.modalNavScrollHandler = null;

    this.modalMorePopover = null;
    this.modalMoreMenuPanel = null;
    this.modalMoreMenuContext = {
      video: null,
      pointerInfo: null,
      playbackUrl: "",
      playbackMagnet: "",
      canManageBlacklist: false,
    };

    this.commentsController = new CommentsController({ modal: this });
    this.reactionsController = new ReactionsController({ modal: this });
    this.similarContentController = new SimilarContentController({ modal: this });
    this.moderationController = new ModerationController({ modal: this });
    this.zapController = new ZapController({ modal: this });
    this.linkPreviewController = new LinkPreviewController({ modal: this });

    this.shareNostrAuthState = {
      isLoggedIn: false,
      hasSigner: false,
    };

    this.modalPosterCleanup = null;
    this.videoEventCleanup = null;
    this.ambientCanvas = null;
    this.detachAmbientBackground = null;
    this.teardownAmbientGlow = this.teardownAmbientGlow.bind(this);
    this.attachAmbientGlow = this.attachAmbientGlow.bind(this);

    this.activeVideo = null;
    this.activeModerationContext = null;
    this.tagPreferenceStateResolver = null;

    this.moderationOverlay = null;
    this.moderationBadge = null;
    this.moderationBadgeText = null;
    this.moderationActionsContainer = null;
    this.moderationPrimaryButton = null;
    this.moderationBlockButton = null;
    this.moderationPrimaryMode = "";
    this.moderationBadgeId = "";

    this.handleCopyRequest = this.handleCopyRequest.bind(this);
    this.handleShareRequest = this.handleShareRequest.bind(this);
    this.handleEmbedRequest = this.handleEmbedRequest.bind(this);
    this.handleCreatorNavigation = this.handleCreatorNavigation.bind(this);
    this.handleModalMoreButtonClick = this.handleModalMoreButtonClick.bind(this);
    this.handleReactionClick = this.handleReactionClick.bind(this);
    this.handleVideoTagActivate = this.handleVideoTagActivate.bind(this);
    this.handleModerationOverrideClick =
      this.handleModerationOverrideClick.bind(this);
    this.handleModerationHideClick =
      this.handleModerationHideClick.bind(this);
    this.handleModerationBlockClick =
      this.handleModerationBlockClick.bind(this);
    this.handleGlobalModerationOverride =
      this.handleGlobalModerationOverride.bind(this);
    this.handleGlobalModerationBlock =
      this.handleGlobalModerationBlock.bind(this);
    this.handleGlobalModerationHide = (event) =>
      this.handleGlobalModerationBlock(event);

    this.MODAL_LOADING_POSTER = "assets/gif/please-stand-by.gif";

    this.setMediaLoader(mediaLoader);

    // Initialize teardownAmbientGlow to a no-op initially in case it's called before attachAmbientGlow
    this.detachAmbientBackground = null;

    // Ensure the method is bound if it exists on the prototype or instance,
    // or provide a default if it doesn't exist (e.g. during testing mocks).
    if (typeof this.teardownAmbientGlow === 'function') {
        this.teardownAmbientGlow = this.teardownAmbientGlow.bind(this);
    } else {
        this.teardownAmbientGlow = () => {};
    }

    if (this.document) {
      this.document.addEventListener(
        "video:moderation-override",
        this.handleGlobalModerationOverride,
      );
      this.document.addEventListener(
        "video:moderation-block",
        this.handleGlobalModerationBlock,
      );
      this.document.addEventListener(
        "video:moderation-hide",
        this.handleGlobalModerationHide,
      );
    }
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

      try {
        if (this.modalVideo) {
          // give the element the fill class so CSS can control layout
          this.modalVideo.classList.add("video-modal__media--fill");

          // ensure the stage/wrapper allow stretching (safety)
          const videoWrap =
            this.playerModal?.querySelector(".video-modal__video") ||
            this.document.querySelector(".video-modal__video");

          if (videoWrap) {
            videoWrap.style.display = "flex";
            videoWrap.style.alignItems = "stretch";
            videoWrap.style.justifyContent = "center";
            videoWrap.style.padding = "0";
          }

          // choose object-fit dynamically after metadata loads so we can inspect intrinsic size:
          const decideObjectFit = () => {
            try {
              const vw =
                this.modalVideo.videoWidth ||
                this.modalVideo.naturalWidth ||
                this.modalVideo.clientWidth;
              const vh =
                this.modalVideo.videoHeight ||
                this.modalVideo.naturalHeight ||
                this.modalVideo.clientHeight;
              const wrap = this.modalVideo.parentElement;
              const cw = wrap ? wrap.clientWidth : this.modalVideo.clientWidth;
              const ch = wrap ? wrap.clientHeight : this.modalVideo.clientHeight;

              // If we can't compute, default to cover
              if (!vw || !vh || !cw || !ch) {
                this.modalVideo.style.objectFit = "cover";
                return;
              }

              const videoRatio = vw / vh;
              const containerRatio = cw / ch;
              const diff = Math.abs(containerRatio - videoRatio);

              // if aspect ratios are close, prefer contain to avoid cropping small edges,
              // otherwise use cover to avoid large letterbox bars
              const THRESHOLD = 0.12; // tweakable
              this.modalVideo.style.objectFit =
                diff > THRESHOLD ? "cover" : "contain";
            } catch (e) {
              this.modalVideo.style.objectFit = "cover";
            }
          };

          if (this.modalVideo.readyState >= 1) {
            // metadata already available
            decideObjectFit();
          } else {
            const onMeta = () => {
              decideObjectFit();
              this.modalVideo.removeEventListener("loadedmetadata", onMeta);
            };
            this.modalVideo.addEventListener("loadedmetadata", onMeta);
          }

          // always ensure background transparent
          this.modalVideo.style.background = "transparent";
          this.modalVideo.style.objectPosition = "center center";
        }
      } catch (err) {
        // swallow, but log for diagnostics
        this.logger?.log?.(
          "[VideoModal] setVideoElement style enforcement failed",
          err
        );
      }
    } else {
      this.modalVideo = null;
    }

    this.attachAmbientGlow();

    return this.modalVideo;
  }

  /**
   * Lazy-loads the video modal HTML and injects it into the DOM.
   * Ensures idempotency: if already loaded and connected, returns immediately.
   *
   * @returns {Promise<HTMLElement>} The root element of the video modal
   * @throws {Error} If fetching the template fails or container is missing
   */
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
        this.teardownVideoTagsResizeObserver();
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

  /**
   * Binds the controller to the DOM elements within the modal.
   * Initializes sub-controllers and sets up event listeners.
   *
   * @param {HTMLElement} playerModal - The root modal element
   */
  hydrate(playerModal) {
    // 1. Cleanup existing accessibility traps and sub-controllers
    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }
    this.modalAccessibility = null;

    // 2. Cleanup existing popovers (More Menu)
    if (this.modalMorePopover?.destroy) {
      this.modalMorePopover.destroy();
    }
    this.modalMorePopover = null;
    this.modalMoreMenuPanel = null;

    this.teardownAmbientGlow({ clear: false });

    if (this.moderationPrimaryButton) {
      if (this.moderationPrimaryMode === "override") {
        this.moderationPrimaryButton.removeEventListener(
          "click",
          this.handleModerationOverrideClick,
        );
      } else if (this.moderationPrimaryMode === "hide") {
        this.moderationPrimaryButton.removeEventListener(
          "click",
          this.handleModerationHideClick,
        );
      }
    }
    if (this.moderationBlockButton) {
      this.moderationBlockButton.removeEventListener(
        "click",
        this.handleModerationBlockClick,
      );
    }
    this.moderationOverlay = null;
    this.moderationBadge = null;
    this.moderationBadgeText = null;
    this.moderationActionsContainer = null;
    this.moderationPrimaryButton = null;
    this.moderationPrimaryMode = "";
    this.moderationBlockButton = null;

    const previousScrollRegion = this.scrollRegion;
    if (previousScrollRegion && this.modalNavScrollHandler) {
      previousScrollRegion.removeEventListener(
        "scroll",
        this.modalNavScrollHandler
      );
    }

    this.commentsController.destroy();
    this.reactionsController.destroy();
    this.similarContentController.destroy();
    this.moderationController.destroy();
    this.zapController.destroy();
    this.linkPreviewController.destroy();

    this.clearSimilarContent({ preservePending: true });

    this.playerModal = playerModal;
    this.modalPanel = playerModal.querySelector(".bv-modal__panel") || null;
    this.modalBackdrop = playerModal.querySelector("[data-dismiss]") || null;
    this.scrollRegion = this.modalPanel || playerModal;

    const nextVideoTagsRoot = playerModal.querySelector("#videoTags") || null;
    if (this.videoTagsRoot && this.videoTagsRoot !== nextVideoTagsRoot) {
      this.cleanupVideoTags(this.videoTagsRoot);
    }
    if (typeof this.teardownVideoTagsResizeObserver === 'function') {
      this.teardownVideoTagsResizeObserver();
    } else {
        this.teardownVideoTagsResizeObserver = () => {};
    }
    this.videoTagsRoot = nextVideoTagsRoot;
    if (this.videoTagsRoot) {
      this.cleanupVideoTags(this.videoTagsRoot);
    }

    const { container: similarContainer } =
      this.similarContentController.initialize({ playerModal }) || {};

    const statsContainerCandidate =
      playerModal.querySelector("[data-video-stats-container]") ||
      playerModal
        .querySelector("[data-video-stats]")
        ?.closest("[data-video-stats-container]") ||
      playerModal
        .querySelector("[data-video-stats]")
        ?.closest(".watch-container") ||
      playerModal.querySelector("[data-video-stats]") ||
      playerModal
        .querySelector(".video-modal__stats")
        ?.closest(".watch-container") ||
      playerModal.querySelector(".video-modal__stats") ||
      null;

    this.normalizeModalLayoutStructure(playerModal, {
      layout: playerModal.querySelector(".video-modal__layout") || null,
      primary: playerModal.querySelector(".video-modal__primary") || null,
      secondary: playerModal.querySelector(".video-modal__secondary") || null,
      similarContainer,
      statsContainer: statsContainerCandidate,
    });

    const previousTags = Array.isArray(this.videoTagsSourceData)
      ? [...this.videoTagsSourceData]
      : [];
    this.videoTagsData = null;
    this.videoTagsSourceData = Object.freeze([]);

    this.moderationController.initialize({ playerModal });

    // Update overlay reference to the new bar selector
    this.moderationOverlay =
      playerModal.querySelector("[data-moderation-bar]") || null;
    this.moderationBadge =
      this.moderationOverlay?.querySelector("[data-moderation-badge='true']") ||
      null;
    this.moderationBadgeText =
      this.moderationOverlay?.querySelector("[data-moderation-text]") || null;

    this.modalVideo = playerModal.querySelector("#modalVideo") || null;
    this.modalStatus = playerModal.querySelector("#modalStatus") || null;
    this.modalProgress = playerModal.querySelector("#modalProgress") || null;
    this.modalProgressStatus =
      playerModal.querySelector("#modalProgressStatus") || null;
    this.modalStatsContainer =
      playerModal.querySelector("[data-video-stats-container]") ||
      statsContainerCandidate ||
      null;
    this.modalStats =
      playerModal.querySelector("[data-video-stats]") ||
      this.modalStatsContainer?.querySelector("[data-video-stats]") ||
      this.modalStatsContainer?.querySelector(".video-modal__stats") ||
      playerModal.querySelector(".video-modal__stats") ||
      null;
    this.modalPeers = playerModal.querySelector("#modalPeers") || null;
    this.modalSpeed = playerModal.querySelector("#modalSpeed") || null;
    this.modalDownloaded =
      playerModal.querySelector("#modalDownloaded") || null;
    this.sourceToggleContainer =
      playerModal.querySelector("[data-source-toggle-container]") || null;
    this.sourceToggleButtons =
      playerModal.querySelectorAll("[data-source-toggle]") || [];
    this.activeServersLabel =
      playerModal.querySelector("[data-active-servers-count]") || null;
    this.activePeersLabel =
      playerModal.querySelector("[data-active-peers-count]") || null;
    this.setTorrentStatsVisibility(false);
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
    this.embedBtn = playerModal.querySelector("#embedBtn") || null;
    this.modalMoreBtn = playerModal.querySelector("#modalMoreBtn") || null;
    this.reactionsController.initialize({ playerModal });

    this.renderVideoTags(previousTags);

    if (Array.isArray(this.pendingSimilarContent)) {
      const pendingSimilar = this.pendingSimilarContent;
      this.pendingSimilarContent = null;
      this.setSimilarContent(pendingSimilar);
    }

    this.ambientCanvas = playerModal.querySelector("#ambientCanvas") || null;

    this.setupModalMorePopover();
    this.setupModalSharePopover();

    this.refreshActiveVideoModeration({ video: this.activeVideo });

    this.commentsController.initialize({ playerModal });
    this.zapController.initialize({ playerModal });
    this.linkPreviewController.initialize({ playerModal });

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
    // zap visibility is handled by ZapController.initialize
    this.setCopyEnabled(false);
    this.setShareEnabled(false);
    this.setEmbedEnabled(false);
    this.resetStats();

    this.attachAmbientGlow();

    if (!this.activeVideo && this.playerModal) {
      this.playerModal.classList.add("hidden");
      this.playerModal.setAttribute("hidden", "");
      this.document?.body?.classList?.remove("modal-open");
      this.document?.documentElement?.classList?.remove("modal-open");
    }
  }

  /**
   * Resets the modal state, populates it with the provided video data, and makes it visible.
   * Also initializes moderation, comments, and accessibility traps.
   *
   * @param {Object} video - The video object to display (title, description, tags, etc.)
   * @param {Object} [options] - Display options
   * @param {HTMLElement} [options.triggerElement] - The element that triggered the modal (for focus restoration)
   */
  open(video, options = {}) {
    this.activeVideo = video || null;
    this.moderationBadgeId = "";
    if (!this.playerModal) {
      return;
    }

    // Ensure title element reference is available
    if (!this.videoTitle) {
      this.videoTitle = this.playerModal.querySelector("#videoTitle") || null;
    }

    // Ensure comments controller is initialized if elements are missing
    if (
      this.commentsController &&
      (!this.commentsController.commentsList || !this.commentsController.commentsList.isConnected)
    ) {
      this.commentsController.destroy();
      this.commentsController.initialize({ playerModal: this.playerModal });
    }

    // Set title immediately when opening if video has a title
    if (this.videoTitle && video && typeof video.title === "string" && video.title.trim()) {
      this.videoTitle.textContent = video.title.trim();
      this.videoTitle.hidden = false;
    } else if (this.videoTitle) {
      this.videoTitle.textContent = "Untitled";
      this.videoTitle.hidden = false;
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
    this.updateSourceAvailability(this.activeVideo);
    this.setShareEnabled(!!this.activeVideo);
    this.setEmbedEnabled(!!this.activeVideo);
    this.updateSourceAvailability(this.activeVideo);
    this.refreshActiveVideoModeration({ video: this.activeVideo });
  }

  setCommentSectionCallbacks(callbacks) {
    this.commentsController.setCallbacks(callbacks);
  }

  hideCommentsDisabledMessage() {
    this.commentsController.hideCommentsDisabledMessage();
  }

  showCommentsDisabledMessage(message) {
    this.commentsController.showCommentsDisabledMessage(message);
  }

  setCommentsVisibility(visible) {
    this.commentsController.setCommentsVisibility(visible);
  }

  clearComments() {
    this.commentsController.clearComments();
  }

  resetCommentComposer() {
    this.commentsController.resetCommentComposer();
  }

  setCommentStatus(message, type) {
    this.commentsController.setCommentStatus(message, type);
  }

  setCommentComposerState(state) {
    this.commentsController.setCommentComposerState(state);
  }

  appendComment(comment) {
    this.commentsController.appendComment(comment);
  }

  renderComments(snapshot) {
    this.commentsController.renderComments(snapshot);
  }

  updateCommentCharCount() {
    this.commentsController.updateCommentCharCount();
  }

  updateCommentSubmitState() {
    this.commentsController.updateCommentSubmitState();
  }

  get commentsList() {
    return this.commentsController.commentsList;
  }

  get commentsComposer() {
    return this.commentsController.commentsComposer;
  }

  get commentsInput() {
    return this.commentsController.commentsInput;
  }

  get commentsSubmitButton() {
    return this.commentsController.commentsSubmitButton;
  }

  get commentsStatusMessage() {
    return this.commentsController.commentsStatusMessage;
  }

  get commentRetryButton() {
    return this.commentsController.commentRetryButton;
  }

  get commentsDisabledPlaceholder() {
    return this.commentsController.commentsDisabledPlaceholder;
  }

  get commentComposerHint() {
    return this.commentsController.commentComposerHint;
  }

  get commentComposerDefaultHint() {
    return this.commentsController.commentComposerDefaultHint;
  }

  get commentComposerState() {
    return this.commentsController.commentComposerState;
  }

  /**
   * Closes the modal, pauses playback, clears active state, and restores focus.
   * This is the primary cleanup method when dismissing the modal.
   */
  close() {
    this.activeVideo = null;
    this.applyModerationOverlay(null);
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
    this.commentsController.invokeCommentTeardown();
    this.commentsController.clearComments();
    this.commentsController.resetCommentComposer();
    this.renderVideoTags([]);
    this.clearSimilarContent();
    this.clearLinkPreviews();
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
      const trimmed = raw.trim();

      if (!trimmed) {
        continue;
      }

      let key = trimmed.toLowerCase();
      if (key.startsWith("#")) {
        key = key.slice(1);
      }

      if (!key) {
        continue;
      }

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      const display = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
      normalized.push(display);
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

  renderVideoTags(tags = [], options = {}) {
    const { force = false } = options || {};
    const normalized = this.normalizeVideoTags(tags);
    const root = this.videoTagsRoot;

    if (root) {
      if (!force && this.areVideoTagsEqual(normalized, this.videoTagsData)) {
        const hasVisibleButtons =
          root.querySelector("button[data-tag]") !== null;
        this.toggleVideoTagsVisibility(hasVisibleButtons);
        if (hasVisibleButtons) {
          this.ensureVideoTagsResizeObserver();
          this.refreshTagPreferenceStates();
        } else {
          this.teardownVideoTagsResizeObserver();
        }
        return;
      }

      this.cleanupVideoTags(root);

      let hasVisibleButtons = false;
      if (normalized.length > 0) {
        const { root: strip } = renderTagPillStrip({
          document: root.ownerDocument || this.document,
          tags: normalized,
          onTagActivate: this.handleVideoTagActivate,
          getTagState: (tag) => this.resolveTagPreferenceState(tag),
        });

        if (strip) {
          root.appendChild(strip);
          trimTagPillStripToFit({ strip, container: root });

          if (strip.querySelector("button[data-tag]")) {
            hasVisibleButtons = true;
          } else if (strip.parentNode === root) {
            root.removeChild(strip);
          }
        }
      }

      this.toggleVideoTagsVisibility(hasVisibleButtons);
      if (hasVisibleButtons) {
        this.ensureVideoTagsResizeObserver();
        this.refreshTagPreferenceStates();
      } else {
        this.teardownVideoTagsResizeObserver();
      }
    } else {
      this.teardownVideoTagsResizeObserver();
    }

    const stored = Object.freeze([...normalized]);
    this.videoTagsData = stored;
    this.videoTagsSourceData = stored;
  }

  reflowVideoTags() {
    if (!Array.isArray(this.videoTagsSourceData)) {
      return;
    }

    if (this.videoTagsSourceData.length === 0) {
      return;
    }

    this.renderVideoTags([...this.videoTagsSourceData], { force: true });
  }

  ensureVideoTagsResizeObserver() {
    const root = this.videoTagsRoot;
    if (!root) {
      return;
    }

    const ResizeObserverCtor =
      (this.window && this.window.ResizeObserver) ||
      globalThis.ResizeObserver ||
      null;
    if (typeof ResizeObserverCtor !== "function") {
      return;
    }

    if (!this.videoTagsResizeObserver) {
      this.videoTagsResizeObserver = new ResizeObserverCtor(
        this.handleVideoTagsResize,
      );
    } else if (typeof this.videoTagsResizeObserver.disconnect === "function") {
      this.videoTagsResizeObserver.disconnect();
    }

    try {
      this.videoTagsResizeObserver.observe(root);
    } catch (error) {
      // Ignore observer errors (e.g., observing a detached node).
    }
  }

  teardownVideoTagsResizeObserver() {
    if (this.videoTagsResizeObserver) {
      try {
        this.videoTagsResizeObserver.disconnect();
      } catch (error) {
        // Ignore teardown errors.
      }
    }
    this.videoTagsResizeObserver = null;
    this.videoTagsLastObservedWidth = 0;
  }

  handleVideoTagsResize(entries = []) {
    if (!this.videoTagsRoot) {
      return;
    }

    const entry =
      Array.isArray(entries) && entries.length > 0
        ? entries.find((item) => item?.target === this.videoTagsRoot) ||
          entries[0]
        : null;

    const measuredWidthRaw = entry
      ? entry.contentRect && typeof entry.contentRect.width === "number"
        ? entry.contentRect.width
        : typeof entry.contentBoxSize?.[0]?.inlineSize === "number"
          ? entry.contentBoxSize[0].inlineSize
          : this.videoTagsRoot.clientWidth || 0
      : this.videoTagsRoot.clientWidth || 0;

    const measuredWidth = Number.isFinite(measuredWidthRaw)
      ? Math.max(0, Math.round(measuredWidthRaw))
      : 0;

    if (measuredWidth <= 0) {
      this.videoTagsLastObservedWidth = 0;
      return;
    }

    if (this.videoTagsLastObservedWidth === measuredWidth) {
      return;
    }

    this.videoTagsLastObservedWidth = measuredWidth;
    this.reflowVideoTags();
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

  setTagPreferenceStateResolver(resolver) {
    this.tagPreferenceStateResolver =
      typeof resolver === "function" ? resolver : null;
  }

  resolveTagPreferenceState(tag) {
    if (typeof this.tagPreferenceStateResolver !== "function") {
      return "neutral";
    }

    try {
      return this.tagPreferenceStateResolver(tag);
    } catch (error) {
      devLogger.warn(
        "[VideoModal] Failed to resolve tag preference state:",
        error,
      );
      return "neutral";
    }
  }

  refreshTagPreferenceStates() {
    const root = this.videoTagsRoot;
    if (!root) {
      return;
    }

    const buttons = root.querySelectorAll("button[data-tag]");
    buttons.forEach((button) => {
      const tag = button.dataset.tag || "";
      const state = this.resolveTagPreferenceState(tag);
      applyTagPreferenceState(button, state);
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

    this.updateReactionMeterFill(likeRatio);
  }

  updateReactionMeterFill(likeRatio) {
    const doc = this.playerModal?.ownerDocument || this.document;
    if (!doc) {
      return;
    }

    const clamped = Math.max(0, Math.min(100, Math.round(likeRatio)));
    const widthValue = `${clamped}%`;
    if (!this.reactionMeterStyleNode || !this.reactionMeterStyleNode.isConnected) {
      const existing = doc.getElementById?.("videoModalReactionStyles");
      if (existing instanceof HTMLStyleElement) {
        this.reactionMeterStyleNode = existing;
      } else {
        const styleNode = doc.createElement("style");
        styleNode.id = "videoModalReactionStyles";
        doc.head?.appendChild(styleNode);
        this.reactionMeterStyleNode = styleNode;
      }
    }

    if (this.reactionMeterStyleNode) {
      this.reactionMeterStyleNode.textContent =
        `#playerModal { --video-modal-reaction-fill: ${widthValue}; }`;
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
    this.setTorrentStatsVisibility(false);
  }

  updateStatus(message) {
    if (this.modalStatus) {
      this.modalStatus.textContent = message || "";
    }
  }

  setTorrentStatsVisibility(shouldShow) {
    const visible = Boolean(shouldShow);
    this.updateSourceToggleState(visible ? "torrent" : "url");

    const container = this.modalStatsContainer;
    const stats = this.modalStats;
    const toggle = (element, show) => {
      if (!element) {
        return;
      }
      if (show) {
        element.removeAttribute("hidden");
        element.classList?.remove("hidden");
      } else {
        element.setAttribute("hidden", "");
        element.classList?.add("hidden");
      }
    };

    if (container) {
      toggle(container, visible);
      if (stats) {
        if (visible) {
          stats.removeAttribute("hidden");
          stats.classList?.remove("hidden");
        } else {
          stats.setAttribute("hidden", "");
          stats.classList?.add("hidden");
        }
      }
      return;
    }

    if (stats) {
      toggle(stats, visible);
    }
  }

  updatePeers(text) {
    if (this.modalPeers) {
      this.modalPeers.textContent = text || "";
    }
    if (this.activePeersLabel) {
      const match = (text || "").match(/\d+/);
      const count = match ? parseInt(match[0], 10) : 0;
      this.activePeersLabel.textContent =
        count === 1 ? "1 peer" : `${count} peers`;
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

  setEmbedEnabled(enabled) {
    if (!this.embedBtn) {
      return;
    }
    this.embedBtn.disabled = !enabled;
    this.embedBtn.setAttribute("aria-disabled", (!enabled).toString());
    this.embedBtn.classList.toggle("opacity-50", !enabled);
    this.embedBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  hasResolvablePointer(video) {
    const candidateInfo =
      video && typeof video.pointerInfo === "object" ? video.pointerInfo : null;
    let pointer = candidateInfo?.pointer ?? null;
    let key =
      typeof candidateInfo?.key === "string" && candidateInfo.key
        ? candidateInfo.key
        : typeof candidateInfo?.pointerKey === "string" && candidateInfo.pointerKey
          ? candidateInfo.pointerKey
          : "";

    if (!pointer) {
      pointer = video?.pointer ?? video?.pointerTag ?? null;
    }

    if (!key) {
      const keyCandidates = [
        video?.pointerKey,
        video?.pointerId,
        video?.pointerIdentifier,
      ];
      for (const candidateKey of keyCandidates) {
        if (typeof candidateKey === "string" && candidateKey.trim()) {
          key = candidateKey.trim();
          break;
        }
      }
    }

    if (!key && pointer) {
      key = derivePointerKeyFromInput(pointer);
    }

    return Boolean(key);
  }

  setZapVisibility(visible, options = {}) {
    this.zapController.setZapVisibility(visible, options);
  }

  setWalletPromptVisible(visible) {
    this.zapController.setWalletPromptVisible(visible);
  }

  async openZapDialog() {
    return this.zapController.openZapDialog();
  }

  closeZapDialog(options) {
    this.zapController.closeZapDialog(options);
  }

  isZapDialogOpen() {
    return this.zapController.isZapDialogOpen();
  }

  focusZapAmount() {
    this.zapController.focusZapAmount();
  }

  getZapAmountValue() {
    return this.zapController.getZapAmountValue();
  }

  setZapAmount(value) {
    this.zapController.setZapAmount(value);
  }

  getZapCommentValue() {
    return this.zapController.getZapCommentValue();
  }

  setZapComment(value) {
    this.zapController.setZapComment(value);
  }

  resetZapForm(values) {
    this.zapController.resetZapForm(values);
  }

  setZapSplitSummary(text) {
    this.zapController.setZapSplitSummary(text);
  }

  setZapStatus(message, tone) {
    this.zapController.setZapStatus(message, tone);
  }

  clearZapReceipts() {
    this.zapController.clearZapReceipts();
  }

  renderZapReceipts(receipts, options) {
    this.zapController.renderZapReceipts(receipts, options);
  }

  setZapPending(pending) {
    this.zapController.setZapPending(pending);
  }

  setZapRetryPending(pending, options) {
    this.zapController.setZapRetryPending(pending, options);
  }

  setZapCompleted(completed) {
    this.zapController.setZapCompleted(completed);
  }

  getViewCountElement() {
    return this.videoViewCountEl;
  }

  updateViewCountLabel(text) {
    if (!this.videoViewCountEl) {
      return;
    }
    const textEl = this.videoViewCountEl.querySelector(
      "[data-view-count-text]"
    );
    if (textEl) {
      textEl.textContent = text || "–";
    } else {
      // Fallback if span is missing
      this.videoViewCountEl.textContent = text || "–";
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
    if (title !== undefined) {
      // Try to find the title element if not already cached
      if (!this.videoTitle) {
        if (this.playerModal) {
          this.videoTitle = this.playerModal.querySelector("#videoTitle") || null;
        }
        // Fallback: try document query if playerModal query failed
        if (!this.videoTitle) {
          this.videoTitle = this.document.getElementById("videoTitle") || null;
        }
      }
      if (this.videoTitle) {
        const titleText =
          typeof title === "string" && title.trim()
            ? title.trim()
            : "Untitled";
        this.videoTitle.textContent = titleText;
        // Ensure element is visible
        this.videoTitle.hidden = false;
      } else {
        // Log for debugging if element cannot be found
        this.logger?.log?.(
          "[VideoModal] Could not find #videoTitle element to set title:",
          title
        );
      }
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

    this.updateSourceAvailability(this.activeVideo);
    this.refreshActiveVideoModeration({ video: this.activeVideo });
  }

  getModerationBadgeId() {
    if (this.moderationBadgeId) {
      return this.moderationBadgeId;
    }

    const baseId =
      typeof this.activeVideo?.id === "string" && this.activeVideo.id
        ? this.activeVideo.id
        : "";
    if (!baseId) {
      this.moderationBadgeId = "";
      return this.moderationBadgeId;
    }

    const sanitized = baseId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!sanitized) {
      this.moderationBadgeId = "";
      return this.moderationBadgeId;
    }

    this.moderationBadgeId = `video-modal-${sanitized}-moderation`;
    return this.moderationBadgeId;
  }

  refreshActiveVideoModeration({ video = this.activeVideo } = {}) {
    if (!video) {
      this.activeModerationContext = null;
      this.applyModerationOverlay(null);
      return;
    }

    const context = normalizeVideoModerationContext(video.moderation);
    this.activeModerationContext = context;
    this.applyModerationOverlay(context);
  }

  applyModerationOverlay(context) {
    const stage = this.videoStage;
    const overlay = this.moderationOverlay;
    const badge = this.moderationBadge;
    const textEl = this.moderationBadgeText;

    const showModeration = Boolean(context?.shouldShow);
    const shouldBlur = Boolean(context?.activeBlur && !context?.overrideActive);
    const hiddenActive = Boolean(context?.activeHidden && !context?.overrideActive);

    if (!showModeration) {
      if (stage && stage.dataset.visualState === "blurred") {
        delete stage.dataset.visualState;
      }
      if (overlay) {
        overlay.setAttribute("hidden", "");
        if (overlay.dataset.overlayState) {
          delete overlay.dataset.overlayState;
        }
      }
      if (badge) {
        badge.dataset.variant = context?.overrideActive ? "neutral" : "warning";
        if (badge.dataset.moderationState) {
          delete badge.dataset.moderationState;
        }
        if (badge.dataset.moderationHideReason) {
          delete badge.dataset.moderationHideReason;
        }
        badge.removeAttribute("title");
        if (badge.id && !this.activeVideo) {
          badge.removeAttribute("id");
        }
        badge.removeAttribute("aria-label");
      }
      this.removeModerationPrimaryButton();
      this.removeModerationBlockButton();
      return;
    }

    if (stage) {
      if (shouldBlur) {
        stage.dataset.visualState = "blurred";
      } else if (stage.dataset.visualState === "blurred") {
        delete stage.dataset.visualState;
      }
    }

    if (this.creatorAvatar) {
      if (shouldBlur) {
        this.creatorAvatar.dataset.visualState = "blurred";
      } else if (this.creatorAvatar.dataset.visualState === "blurred") {
        delete this.creatorAvatar.dataset.visualState;
      }
    }

    if (overlay) {
      // Changed logic: Always show the bar if moderation is active, even if overridden
      if (showModeration) {
        overlay.removeAttribute("hidden");
      } else {
        overlay.setAttribute("hidden", "");
      }
      overlay.dataset.overlayState = context?.overrideActive ? "override" : "active";
    }

    if (shouldBlur) {
      if (this.modalVideo && typeof this.modalVideo.pause === "function") {
        try {
          this.modalVideo.pause();
        } catch (error) {
          // ignore pause failures (e.g., in unsupported environments)
        }
      } else if (DEFAULT_VIDEO_FALLBACK && typeof DEFAULT_VIDEO_FALLBACK.pause === "function") {
          DEFAULT_VIDEO_FALLBACK.pause();
      }
    }

    const badgeId = this.getModerationBadgeId();
    const textContent = buildModerationBadgeText(context, { variant: "modal" });

    if (badge) {
      const state = context?.overrideActive
        ? "override"
        : hiddenActive
          ? "hidden"
          : context?.trustedMuted
            ? "trusted-mute"
            : "blocked";
      badge.dataset.variant = context?.overrideActive ? "neutral" : "warning";
      badge.dataset.moderationState = state;

      if (hiddenActive && context?.effectiveHideReason) {
        badge.dataset.moderationHideReason = context.effectiveHideReason;
      } else if (badge.dataset.moderationHideReason) {
        delete badge.dataset.moderationHideReason;
      }

      if (badgeId) {
        badge.id = badgeId;
      } else if (badge.id && !this.activeVideo) {
        badge.removeAttribute("id");
      }

      if (textEl) {
        textEl.textContent = textContent;
      }

      const muteNames = Array.isArray(context?.trustedMuteDisplayNames)
        ? context.trustedMuteDisplayNames
            .map((name) => (typeof name === "string" ? name.trim() : ""))
            .filter(Boolean)
        : [];
      const reporterNames = Array.isArray(context?.reporterDisplayNames)
        ? context.reporterDisplayNames
            .map((name) => (typeof name === "string" ? name.trim() : ""))
            .filter(Boolean)
        : [];

      const allNames = [...muteNames, ...reporterNames];
      const uniqueNames = [];
      const seenNameKeys = new Set();
      for (const name of allNames) {
        if (!name) {
          continue;
        }
        const key = name.toLowerCase();
        if (seenNameKeys.has(key)) {
          continue;
        }
        seenNameKeys.add(key);
        uniqueNames.push(name);
      }

      if (uniqueNames.length) {
        const joined = uniqueNames.join(", ");
        const hasMuted = muteNames.length > 0;
        const hasReporters = reporterNames.length > 0;
        const prefix = hasMuted && hasReporters
          ? "Muted/Reported by"
          : hasMuted
            ? "Muted by"
            : "Reported by";
        badge.title = `${prefix} ${joined}`;
        const baseLabel = textContent?.trim() || textEl?.textContent?.trim() || "";
        if (baseLabel) {
          badge.setAttribute("aria-label", `${baseLabel}. ${prefix} ${joined}.`);
        } else {
          badge.setAttribute("aria-label", `${prefix} ${joined}.`);
        }
      } else {
        badge.removeAttribute("title");
        const baseLabel = textContent?.trim() || textEl?.textContent?.trim();
        if (baseLabel) {
          badge.setAttribute("aria-label", `${baseLabel}.`);
        } else {
          badge.removeAttribute("aria-label");
        }
      }
    }

    const actions = this.ensureModerationActionsContainer();
    let actionsAttached = false;

    const allowOverride =
      context?.overrideActive === true ||
      context?.allowOverride === true ||
      (shouldBlur && !context?.overrideActive && context?.blurReason !== "viewer-mute");

    if (allowOverride) {
      const mode = context.overrideActive ? "hide" : "override";
      const primaryButton = this.ensureModerationPrimaryButton(mode);
      if (primaryButton) {
        primaryButton.disabled = false;
        primaryButton.removeAttribute("aria-busy");
        if (badgeId) {
          primaryButton.setAttribute("aria-describedby", badgeId);
        } else {
          primaryButton.removeAttribute("aria-describedby");
        }
        if (actions && primaryButton.parentElement !== actions) {
          actions.appendChild(primaryButton);
        }
        actionsAttached = true;
      }
    } else {
      this.removeModerationPrimaryButton();
    }

    if (this.shouldShowModerationBlockAction(context)) {
      const blockButton = this.ensureModerationBlockButton();
      if (blockButton) {
        blockButton.disabled = false;
        blockButton.removeAttribute("aria-busy");
        if (badgeId) {
          blockButton.setAttribute("aria-describedby", badgeId);
        } else {
          blockButton.removeAttribute("aria-describedby");
        }
        if (actions && blockButton.parentElement !== actions) {
          actions.appendChild(blockButton);
        }
        actionsAttached = true;
      }
    } else {
      this.removeModerationBlockButton();
    }

    if (actions) {
      if (actionsAttached) {
        if (badge && actions.parentElement !== badge) {
          badge.appendChild(actions);
        }
      } else if (actions.parentElement) {
        actions.parentElement.removeChild(actions);
        this.moderationActionsContainer = null;
      } else {
        this.moderationActionsContainer = null;
      }
    }
  }

  shouldShowModerationBlockAction(context = this.activeModerationContext) {
    if (!context || !context.trustedMuted) {
      return false;
    }
    if (context.activeHidden && !context.overrideActive) {
      return false;
    }
    return true;
  }

  ensureModerationActionsContainer() {
    const badge = this.moderationBadge;
    if (!badge) {
      this.moderationActionsContainer = null;
      return null;
    }

    let container = this.moderationActionsContainer;
    if (container && container.isConnected) {
      return container;
    }

    const existing =
      badge.querySelector("[data-moderation-actions]") ||
      badge.querySelector(".moderation-badge__actions");

    if (existing) {
      this.moderationActionsContainer = existing;
      return existing;
    }

    if (!this.document) {
      this.moderationActionsContainer = null;
      return null;
    }

    const created = this.document.createElement("div");
    created.className = "moderation-badge__actions";
    this.moderationActionsContainer = created;
    return created;
  }

  ensureModerationPrimaryButton(mode) {
    if (mode !== "override" && mode !== "hide") {
      return null;
    }

    if (!this.moderationPrimaryButton) {
      if (!this.document) {
        return null;
      }
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "moderation-badge__action flex-shrink-0";
      this.moderationPrimaryButton = button;
      this.moderationPrimaryMode = "";
    }

    const button = this.moderationPrimaryButton;

    if (this.moderationPrimaryMode !== mode) {
      if (this.moderationPrimaryMode === "override") {
        button.removeEventListener("click", this.handleModerationOverrideClick);
      } else if (this.moderationPrimaryMode === "hide") {
        button.removeEventListener("click", this.handleModerationHideClick);
      }

      if (mode === "override") {
        const { text, ariaLabel } = getModerationOverrideActionLabels({
          overrideActive: false,
        });
        button.textContent = text;
        button.dataset.moderationAction = "override";
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", ariaLabel);
        button.addEventListener("click", this.handleModerationOverrideClick);
      } else {
        const { text, ariaLabel } = getModerationOverrideActionLabels({
          overrideActive: true,
        });
        button.textContent = text;
        button.dataset.moderationAction = "hide";
        button.removeAttribute("aria-pressed");
        button.setAttribute("aria-label", ariaLabel);
        button.addEventListener("click", this.handleModerationHideClick);
      }

      this.moderationPrimaryMode = mode;
    }

    return button;
  }

  removeModerationPrimaryButton() {
    const button = this.moderationPrimaryButton;
    if (!button) {
      this.moderationPrimaryMode = "";
      return;
    }

    if (this.moderationPrimaryMode === "override") {
      button.removeEventListener("click", this.handleModerationOverrideClick);
    } else if (this.moderationPrimaryMode === "hide") {
      button.removeEventListener("click", this.handleModerationHideClick);
    }

    if (button.parentElement) {
      button.parentElement.removeChild(button);
    }

    this.moderationPrimaryButton = null;
    this.moderationPrimaryMode = "";
  }

  ensureModerationBlockButton() {
    if (!this.document) {
      return null;
    }

    if (!this.moderationBlockButton) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "moderation-badge__action flex-shrink-0";
      button.dataset.moderationAction = "block";
      button.textContent = "Block";
      button.addEventListener("click", this.handleModerationBlockClick);
      this.moderationBlockButton = button;
    }

    return this.moderationBlockButton;
  }

  removeModerationBlockButton() {
    const button = this.moderationBlockButton;
    if (!button) {
      return;
    }

    button.removeEventListener("click", this.handleModerationBlockClick);
    if (button.parentElement) {
      button.parentElement.removeChild(button);
    }

    this.moderationBlockButton = null;
  }

  handleModerationOverrideClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const button = event?.currentTarget || this.moderationPrimaryButton;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    if (!this.activeVideo) {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    const detail = {
      video: this.activeVideo,
      event,
      trigger: button || null,
      context: this.activeModerationContext || null,
    };

    const handled = this.dispatch("video:moderation-override", detail);
    if (!handled && button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  handleModerationHideClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const button = event?.currentTarget || this.moderationPrimaryButton;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    if (!this.activeVideo) {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    const detail = {
      video: this.activeVideo,
      event,
      trigger: button || null,
      context: this.activeModerationContext || null,
    };

    const handled = this.dispatch("video:moderation-hide", detail);
    if (!handled && button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  handleModerationBlockClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const button = event?.currentTarget || this.moderationBlockButton;
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }

    if (!this.activeVideo) {
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    const detail = {
      video: this.activeVideo,
      event,
      trigger: button || null,
      context: this.activeModerationContext || null,
    };

    const handled = this.dispatch("video:moderation-block", detail);
    if (!handled && button) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  handleGlobalModerationOverride(event) {
    const detail = event?.detail || {};
    const video = detail && typeof detail === "object" ? detail.video : null;
    if (!video || !video.id || !this.activeVideo || this.activeVideo.id !== video.id) {
      return;
    }

    if (this.activeVideo !== video) {
      this.activeVideo = video;
      this.moderationBadgeId = "";
    }

    this.refreshActiveVideoModeration({ video: this.activeVideo });
  }

  handleGlobalModerationBlock(event) {
    const detail = event?.detail || {};
    const video = detail && typeof detail === "object" ? detail.video : null;
    if (!video || !video.id || !this.activeVideo || this.activeVideo.id !== video.id) {
      return;
    }

    if (this.activeVideo !== video) {
      this.activeVideo = video;
      this.moderationBadgeId = "";
    }

    this.refreshActiveVideoModeration({ video: this.activeVideo });
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
      this.clearLinkPreviews();
      return;
    }

    const normalized =
      typeof description === "string" ? description : String(description ?? "");

    if (!normalized) {
      this.clearLinkPreviews();
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
    this.renderLinkPreviews(normalized);
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

  clearLinkPreviews() {
    this.linkPreviewController.clearLinkPreviews();
  }

  renderLinkPreviews(description) {
    this.linkPreviewController.renderLinkPreviews(description);
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

  setSimilarContent(entries = []) {
    const normalizedItems = Array.isArray(entries)
      ? entries.filter((item) => item && typeof item === "object")
      : [];
    const limitedItems =
      SIMILAR_CONTENT_LIMIT > 0
        ? normalizedItems.slice(0, SIMILAR_CONTENT_LIMIT)
        : normalizedItems.slice();

    if (!this.similarContentList) {
      this.pendingSimilarContent = limitedItems.slice();
      return;
    }

    this.pendingSimilarContent = null;
    this.clearSimilarContent();

    if (!limitedItems.length) {
      return;
    }

    const fragment = this.document.createDocumentFragment();
    const renderedCards = [];
    const viewSubscriptions = [];

    limitedItems.forEach((item, position) => {
      const baseVideo =
        item && typeof item === "object" && item.video && typeof item.video === "object"
          ? item.video
          : item;
      if (
        !baseVideo ||
        typeof baseVideo !== "object" ||
        !baseVideo.id ||
        !baseVideo.title
      ) {
        return;
      }

      const pointerInfo = this.normalizeSimilarPointerInfo(item, baseVideo);
      const shareUrl =
        typeof item.shareUrl === "string" && item.shareUrl.trim()
          ? item.shareUrl.trim()
          : typeof baseVideo.shareUrl === "string" && baseVideo.shareUrl.trim()
            ? baseVideo.shareUrl.trim()
            : typeof baseVideo.url === "string" && baseVideo.url.trim()
              ? baseVideo.url.trim()
              : "#";
      const timeAgo =
        typeof item.timeAgo === "string" && item.timeAgo
          ? item.timeAgo
          : typeof baseVideo.timeAgo === "string" && baseVideo.timeAgo
            ? baseVideo.timeAgo
            : "";
      const postedAtCandidate =
        Number.isFinite(item.postedAt)
          ? Math.floor(item.postedAt)
          : Number.isFinite(baseVideo.postedAt)
            ? Math.floor(baseVideo.postedAt)
            : Number.isFinite(baseVideo.rootCreatedAt)
              ? Math.floor(baseVideo.rootCreatedAt)
              : Number.isFinite(baseVideo.created_at)
                ? Math.floor(baseVideo.created_at)
                : null;

      const nsfwContext =
        item && typeof item.nsfwContext === "object" && item.nsfwContext
          ? { ...item.nsfwContext }
          : {
              isNsfw: baseVideo?.isNsfw === true,
              allowNsfw: item?.allowNsfw !== false,
              viewerIsOwner:
                item?.viewerIsOwner === true ||
                Boolean(item?.capabilities?.canEdit),
            };

      const identity = buildSimilarCardIdentity(
        baseVideo,
        item?.identity || null,
        {
          helpers: this.helpers,
          defaultAvatar: this.DEFAULT_PROFILE_AVATAR,
        }
      );

      let card;
      try {
        card = new SimilarContentCard({
          document: this.document,
          video: baseVideo,
          index: position,
          shareUrl,
          pointerInfo,
          timeAgo,
          postedAt: postedAtCandidate,
          identity,
          nsfwContext,
          designSystem: item?.designSystem || null,
          thumbnailCache: this.thumbnailCache,
          fallbackThumbnailSrc: this.fallbackThumbnailSrc,
        });
      } catch (error) {
        this.log("[VideoModal] Failed to render similar content card", error);
        return;
      }

      const cardIndex = renderedCards.length;
      prepareSimilarVideoCard(
        card,
        { video: baseVideo, pointerInfo, shareUrl },
        cardIndex,
        {
          dispatchCallback: (type, detail) => this.dispatch(type, detail),
        }
      );

      // Wire up moderation callbacks
      if (card) {
        card.onModerationOverride = (detail) => {
          this.dispatch("video:moderation-override", detail);
          return true;
        };
        card.onModerationHide = (detail) => {
          this.dispatch("video:moderation-hide", detail);
          return true;
        };
        card.onModerationBlock = (detail) => {
          this.dispatch("video:moderation-block", detail);
          return true;
        };
      }

      const root = card.getRoot();
      if (!root) {
        return;
      }

      if (root.classList) {
        root.classList.add("player-modal__similar-card");
      }

      const listItem = this.document.createElement("li");
      listItem.classList.add("player-modal__module-item");
      listItem.appendChild(root);
      fragment.appendChild(listItem);
      renderedCards.push(card);

      const viewSubscription = attachSimilarCardViewCounter(
        card,
        pointerInfo,
        { logger: this }
      );
      if (viewSubscription) {
        viewSubscriptions.push(viewSubscription);
      }
    });

    this.similarContentList.appendChild(fragment);
    this.similarContentCards = renderedCards;
    this.similarContentViewCountSubscriptions = viewSubscriptions;
    this.observeLazyMedia(this.similarContentList);
    this.toggleSimilarContentVisibility(renderedCards.length > 0);
  }

  clearSimilarContent(options = {}) {
    this.teardownSimilarContentSubscriptions();

    if (Array.isArray(this.similarContentCards)) {
      this.similarContentCards.forEach((card) => {
        if (!card) {
          return;
        }
        try {
          card.closeMoreMenu?.({ restoreFocus: false });
        } catch (error) {
          this.log("[VideoModal] Failed to close more menu during cleanup", error);
        }
        try {
          card.closeSettingsMenu?.({ restoreFocus: false });
        } catch (error) {
          this.log(
            "[VideoModal] Failed to close settings menu during cleanup",
            error
          );
        }
        card.onPlay = null;
      });
    }

    this.similarContentCards = [];
    if (this.similarContentList) {
      this.similarContentList.textContent = "";
    }

    if (!options?.preservePending) {
      this.pendingSimilarContent = null;
    }

    this.toggleSimilarContentVisibility(false);
  }

  normalizeModalLayoutStructure(
    playerModal,
    { layout, primary, secondary, similarContainer, statsContainer }
  ) {
    if (!playerModal || !layout || !primary || !secondary) {
      return;
    }

    const layoutClassList = layout.classList;
    const legacyLayoutClasses = [
      "flex",
      "flex-col",
      "flex-row",
      "gap-4",
      "gap-6",
      "gap-8",
      "gap-y-6",
      "gap-y-8",
    ];
    legacyLayoutClasses.forEach((className) => {
      if (layoutClassList.contains(className)) {
        layoutClassList.remove(className);
      }
    });

    if (layout.hasAttribute("style")) {
      layout.removeAttribute("style");
    }

    if (primary.hasAttribute("style")) {
      primary.removeAttribute("style");
    }
    if (secondary.hasAttribute("style")) {
      secondary.removeAttribute("style");
    }

    if (!layout.contains(primary)) {
      layout.appendChild(primary);
    }

    if (!layout.contains(secondary)) {
      layout.appendChild(secondary);
    }

    if (primary.nextElementSibling !== secondary) {
      layout.appendChild(primary);
      layout.appendChild(secondary);
    }

    if (similarContainer) {
      if (similarContainer.hasAttribute("style")) {
        similarContainer.removeAttribute("style");
      }
      if (!secondary.contains(similarContainer)) {
        secondary.prepend(similarContainer);
      }
    }

    if (statsContainer) {
      if (statsContainer.hasAttribute("style")) {
        statsContainer.removeAttribute("style");
      }
      if (!primary.contains(statsContainer)) {
        primary.appendChild(statsContainer);
      }
    }
  }

  teardownSimilarContentSubscriptions() {
    if (!Array.isArray(this.similarContentViewCountSubscriptions)) {
      this.similarContentViewCountSubscriptions = [];
      return;
    }

    for (const entry of this.similarContentViewCountSubscriptions) {
      if (!entry || !entry.pointer || !entry.token) {
        continue;
      }
      try {
        unsubscribeFromVideoViewCount(entry.pointer, entry.token);
      } catch (error) {
        this.log(
          "[VideoModal] Failed to unsubscribe similar view counter",
          error
        );
      }
    }

    this.similarContentViewCountSubscriptions = [];
  }

  toggleSimilarContentVisibility(isVisible) {
    this.similarContentVisible = Boolean(isVisible);
    this.refreshSimilarContentVisibility();
  }

  setMediaLoader(mediaLoader) {
    if (mediaLoader && typeof mediaLoader.observe === "function") {
      this.mediaLoader = mediaLoader;
      if (this.similarContentList && this.similarContentList.children.length) {
        this.observeLazyMedia(this.similarContentList);
      }
      return;
    }

    this.mediaLoader = null;
  }

  refreshSimilarContentVisibility() {
    const shouldShow =
      this.similarContentVisible && this.matchesSimilarContentDesktop();

    this.setElementVisibility(this.similarContentContainer, shouldShow);
    this.setElementVisibility(this.similarContentHeading, shouldShow);
    this.setElementVisibility(this.similarContentList, shouldShow);
  }

  setElementVisibility(element, shouldShow) {
    if (!element) {
      return;
    }

    if (shouldShow) {
      element.removeAttribute("hidden");
      element.setAttribute("aria-hidden", "false");
    } else {
      element.setAttribute("hidden", "");
      element.setAttribute("aria-hidden", "true");
    }
  }

  observeLazyMedia(container) {
    if (
      !container ||
      !this.mediaLoader ||
      typeof this.mediaLoader.observe !== "function"
    ) {
      return;
    }

    const lazyNodes = container.querySelectorAll("[data-lazy]");
    if (!lazyNodes.length) {
      return;
    }

    lazyNodes.forEach((node) => {
      try {
        this.mediaLoader.observe(node);
      } catch (error) {
        this.log("[VideoModal] Failed to observe lazy media", error);
      }
    });
  }

  matchesSimilarContentDesktop() {
    if (this.similarContentMediaQuery) {
      return this.similarContentMediaQuery.matches;
    }

    const win = this.window;
    if (!win || typeof win.matchMedia !== "function") {
      return true;
    }

    const breakpointLg = getBreakpointLg({ documentRef: this.document });
    try {
      return win.matchMedia(`(min-width: ${breakpointLg})`).matches;
    } catch (error) {
      this.log(
        "[VideoModal] Failed to evaluate similar content media query",
        error
      );
      return true;
    }
  }

  setupSimilarContentMediaQuery() {
    const win = this.window;
    if (!win || typeof win.matchMedia !== "function") {
      this.similarContentMediaQuery = null;
      this.refreshSimilarContentVisibility();
      return;
    }

    const breakpointLg = getBreakpointLg({ documentRef: this.document });
    const query = win.matchMedia(`(min-width: ${breakpointLg})`);
    if (this.similarContentMediaQuery === query) {
      this.refreshSimilarContentVisibility();
      return;
    }

    this.teardownSimilarContentMediaQuery();
    this.similarContentMediaQuery = query;

    if (query) {
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", this.handleSimilarContentMediaChange);
      } else if (typeof query.addListener === "function") {
        query.addListener(this.handleSimilarContentMediaChange);
      }
    }

    this.refreshSimilarContentVisibility();
  }

  teardownSimilarContentMediaQuery() {
    const query = this.similarContentMediaQuery;
    if (!query) {
      return;
    }

    if (typeof query.removeEventListener === "function") {
      query.removeEventListener(
        "change",
        this.handleSimilarContentMediaChange
      );
    } else if (typeof query.removeListener === "function") {
      query.removeListener(this.handleSimilarContentMediaChange);
    }

    this.similarContentMediaQuery = null;
  }

  handleSimilarContentMediaChange() {
    this.refreshSimilarContentVisibility();
  }

  normalizeSimilarPointerInfo(entry, video) {
    const candidateInfo =
      entry && typeof entry.pointerInfo === "object"
        ? entry.pointerInfo
        : video && typeof video.pointerInfo === "object"
          ? video.pointerInfo
          : null;

    let pointer = candidateInfo?.pointer ?? null;
    let key =
      typeof candidateInfo?.key === "string" && candidateInfo.key
        ? candidateInfo.key
        : typeof candidateInfo?.pointerKey === "string" && candidateInfo.pointerKey
          ? candidateInfo.pointerKey
          : "";

    if (!pointer) {
      pointer =
        entry?.pointer ?? entry?.pointerTag ?? video?.pointer ?? video?.pointerTag ?? null;
    }

    if (!key) {
      const keyCandidates = [
        entry?.pointerKey,
        entry?.pointerId,
        entry?.pointerIdentifier,
        video?.pointerKey,
        video?.pointerId,
        video?.pointerIdentifier,
      ];
      for (const candidateKey of keyCandidates) {
        if (typeof candidateKey === "string" && candidateKey.trim()) {
          key = candidateKey.trim();
          break;
        }
      }
    }

    if (!pointer) {
      if (!key) {
        return null;
      }
      return { pointer: null, key };
    }

    if (!key) {
      key = derivePointerKeyFromInput(pointer);
    }

    return { pointer, key };
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

  handleCopyRequest() {
    this.dispatch("action:copy", { video: this.activeVideo });
  }

  handleShareRequest() {
    this.dispatch("action:share", { video: this.activeVideo });
  }

  handleEmbedRequest() {
    this.dispatch("action:embed", { video: this.activeVideo });
  }

  handleCreatorNavigation() {
    if (this.activeVideo?.pubkey) {
      this.dispatch("navigate:profile", { pubkey: this.activeVideo.pubkey });
    }
  }

  handleModalMoreButtonClick(event) {
    // Basic stub to prevent crash
    this.log("[VideoModal] More button clicked");
  }

  handleReactionClick(reaction) {
    if (this.reactionsController) {
      this.reactionsController.handleReaction(reaction);
    }
  }

  bindVideoEvents() {
    // Stub
  }

  detachVideoEvents() {
    // Stub
  }

  bindActionButtons() {
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", this.handleCopyRequest);
    }
    if (this.shareBtn) {
      this.shareBtn.addEventListener("click", this.handleShareRequest);
    }
    if (this.embedBtn) {
      this.embedBtn.addEventListener("click", this.handleEmbedRequest);
    }
    if (this.creatorAvatar) {
      this.creatorAvatar.addEventListener("click", this.handleCreatorNavigation);
    }
    if (this.creatorName) {
      this.creatorName.addEventListener("click", this.handleCreatorNavigation);
    }
    if (this.modalMoreBtn) {
      this.modalMoreBtn.addEventListener("click", this.handleModalMoreButtonClick);
    }
  }

  updateSourceToggleState(source) {
    if (!this.sourceToggleButtons) return;
    this.sourceToggleButtons.forEach((btn) => {
      const isMatch = btn.dataset.sourceToggle === source;
      btn.setAttribute("aria-pressed", isMatch ? "true" : "false");
    });
  }

  updateSourceAvailability(video) {
    const hasVideo = Boolean(video && video.id);
    this.setCopyEnabled(hasVideo);
    this.setShareEnabled(hasVideo);
    this.setEmbedEnabled(hasVideo);
  }

  setCommentsVisibility(visible) {
    const commentsRoot = this.playerModal?.querySelector(
      "[data-comments-root]"
    );
    if (commentsRoot) {
      if (visible) {
        commentsRoot.removeAttribute("hidden");
        commentsRoot.classList.remove("hidden");
      } else {
        commentsRoot.setAttribute("hidden", "");
        commentsRoot.classList.add("hidden");
      }
    }
  }

  renderComments(snapshot) {
    if (this.commentsController) {
      this.commentsController.renderComments(snapshot);
    }
  }

  setCommentComposerState(state) {
    this._commentComposerState = state;
    if (this.commentsController) {
      // Delegate entirely to the controller if it exists to avoid fighting over DOM state
      // (especially submit button enablement which depends on input value)
      if (typeof this.commentsController.setCommentComposerState === 'function') {
         if (this.commentsController.composerState !== state) {
            this.commentsController.setCommentComposerState(state);
         }
      }
      return;
    }

    // Fallback: Manually reflect state to DOM if no controller is attached (e.g. in isolated tests)
    if (this.commentsInput) {
        this.commentsInput.disabled = !!state?.disabled;
    }
    if (this.commentsSubmitButton) {
        // Note: This naive check doesn't account for empty input,
        // but without a controller we can't easily validte.
        this.commentsSubmitButton.disabled = !!state?.disabled;
    }
    if (this.commentsComposer) {
        const reason = state?.reason;
        if (reason === 'disabled') {
            this.commentsComposer.setAttribute('hidden', '');
        } else {
            this.commentsComposer.removeAttribute('hidden');
        }
    }
    if (this.commentsDisabledPlaceholder) {
        const reason = state?.reason;
        if (reason === 'disabled') {
            this.commentsDisabledPlaceholder.removeAttribute('hidden');
        } else {
            this.commentsDisabledPlaceholder.setAttribute('hidden', '');
        }
    }
    if (this.commentComposerHint && this.commentComposerDefaultHint) {
        if (state?.reason === 'login-required') {
            this.commentComposerHint.textContent = "Log in to add a comment.";
        } else {
            this.commentComposerHint.textContent = this.commentComposerDefaultHint.trim();
        }
    }
  }

  setCommentStatus(message, type) {
    this._commentStatus = { message, type };
    if (this.commentsStatusMessage) {
        this.commentsStatusMessage.textContent = message || '';
        this.commentsStatusMessage.className = type === 'error' ? 'text-danger' : 'text-muted';
    }
    if (this.commentsController) {
       if (typeof this.commentsController.setCommentStatus === 'function') {
           this.commentsController.setCommentStatus(message, type);
       }
    }
  }

  resetCommentComposer(values) {
    if (this.commentsInput) {
        this.commentsInput.value = values?.text || '';
    }
    if (this.commentsController) {
      this.commentsController.resetCommentComposer(values);
    }
  }

  appendComment(comment) {
    if (this.commentsController) {
      this.commentsController.appendComment(comment);
    }
  }

  hideCommentsDisabledMessage() {
    if (this.commentsController) {
      this.commentsController.hideCommentsDisabledMessage();
    }
  }

  showCommentsDisabledMessage(message) {
    if (this.commentsController) {
      this.commentsController.showCommentsDisabledMessage(message);
    }
  }

  updateCommentCharCount() {
    if (this.commentsController) {
        this.commentsController.updateCommentCharCount();
    }
  }

  updateCommentSubmitState() {
    if (this.commentsController) {
        this.commentsController.updateCommentSubmitState();
    }
  }

  // Getters to expose commentsController elements for tests
  get commentsList() {
    return this.commentsController?.commentsList;
  }

  get commentsComposer() {
    return this.commentsController?.commentsComposer;
  }

  get commentsInput() {
    return this.commentsController?.commentsInput;
  }

  get commentsSubmitButton() {
    return this.commentsController?.commentsSubmitButton;
  }

  get commentsDisabledPlaceholder() {
    return this.commentsController?.commentsDisabledPlaceholder;
  }

  get commentComposerHint() {
      return this.commentsController?.commentComposerHint;
  }

  get commentsStatusMessage() {
      return this.commentsController?.commentsStatusMessage;
  }

  get commentRetryButton() {
      return this.commentsController?.commentRetryButton;
  }

  get commentComposerState() {
      // Prioritize locally pushed state, fallback to controller
      return this._commentComposerState || this.commentsController?.composerState;
  }

  get commentComposerDefaultHint() {
      return this.commentsController?.DEFAULT_COMPOSER_HINT || "Add a comment...";
  }

  attachAmbientGlow() {
    // Stub
  }

  teardownAmbientGlow() {
    // Stub
  }

  setupModalMorePopover() {
    if (!this.playerModal || !this.modalMoreBtn) {
      return;
    }

    if (this.modalMorePopover?.destroy) {
      this.modalMorePopover.destroy();
    }

    this.modalMorePopover = createPopover({
      trigger: this.modalMoreBtn,
      content: (container) => {
        if (!this.activeVideo) {
          container.textContent = "";
          return;
        }
        const panel = createVideoMoreMenuPanel({
          document: this.document,
          video: this.activeVideo,
          pointerInfo: this.modalMoreMenuContext.pointerInfo,
          playbackUrl: this.modalMoreMenuContext.playbackUrl,
          playbackMagnet: this.modalMoreMenuContext.playbackMagnet,
          canManageBlacklist: this.modalMoreMenuContext.canManageBlacklist,
          context: "modal",
        });
        if (panel) {
          container.appendChild(panel);
          this.modalMoreMenuPanel = panel;
        }
      },
      placement: "bottom-end",
      offset: 8,
      onOpen: () => {
        if (this.activeVideo) {
          this.syncMoreMenuData({
            currentVideo: this.activeVideo,
            canManageBlacklist: this.modalMoreMenuContext.canManageBlacklist,
          });
        }
      },
    });
  }

  setupModalSharePopover() {
    if (!this.playerModal || !this.shareBtn) {
      return;
    }

    // Reuse popover engine for share button
    // Using a simpler on-click binding for now to match legacy behavior,
    // or instantiate a popover if we want the full menu experience.
    // The E2E test expects a popover with [data-menu="video-share"].

    // We'll create a local property for share popover to clean up later
    if (this.modalSharePopover?.destroy) {
      this.modalSharePopover.destroy();
    }

    this.modalSharePopover = createPopover({
      trigger: this.shareBtn,
      content: (container) => {
        if (!this.activeVideo) {
          container.textContent = "";
          return;
        }
        const panel = createVideoShareMenuPanel({
          document: this.document,
          video: this.activeVideo,
          isLoggedIn: this.shareNostrAuthState.isLoggedIn,
          hasSigner: this.shareNostrAuthState.hasSigner,
          hasMagnet: Boolean(this.modalMoreMenuContext.playbackMagnet), // Re-use magnet from context
          hasCdn: Boolean(this.modalMoreMenuContext.playbackUrl),
        });
        if (panel) {
          container.appendChild(panel);
        }
      },
      placement: "top", // or "top-start" based on layout
      offset: 8,
    });
  }

  refreshModalMoreMenuPanel() {
    if (this.modalMoreMenuPanel && this.activeVideo) {
        // Re-render panel content if open
        const container = this.modalMoreMenuPanel.parentElement;
        if(container) {
            container.textContent = "";
            const panel = createVideoMoreMenuPanel({
                document: this.document,
                video: this.activeVideo,
                pointerInfo: this.modalMoreMenuContext.pointerInfo,
                playbackUrl: this.modalMoreMenuContext.playbackUrl,
                playbackMagnet: this.modalMoreMenuContext.playbackMagnet,
                canManageBlacklist: this.modalMoreMenuContext.canManageBlacklist,
                context: "modal",
            });
            if (panel) {
                container.appendChild(panel);
                this.modalMoreMenuPanel = panel;
            }
        }
    }
  }
}
