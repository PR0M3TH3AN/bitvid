import { createModalAccessibility } from "./modalAccessibility.js";
import createPopover from "../overlay/popoverEngine.js";
import { createVideoMoreMenuPanel } from "./videoMenuRenderers.js";
import { attachAmbientBackground } from "../ambientBackground.js";
import { applyDesignSystemAttributes } from "../../designSystem.js";
import { devLogger } from "../../utils/logger.js";
import { renderTagPillStrip } from "./tagPillList.js";
import { SimilarContentCard } from "./SimilarContentCard.js";
import {
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
} from "../../viewCounter.js";
import {
  formatAbsoluteTimestamp,
  formatTimeAgo,
  formatShortNpub as defaultFormatShortNpub,
} from "../../utils/formatters.js";
import { sanitizeProfileMediaUrl } from "../../utils/profileMedia.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const SIMILAR_CONTENT_LIMIT = 10;

export class VideoModal {
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

    this.similarContentContainer = null;
    this.similarContentHeading = null;
    this.similarContentList = null;
    this.similarContentCards = [];
    this.similarContentViewCountSubscriptions = [];
    this.pendingSimilarContent = null;
    this.similarContentVisible = false;
    this.similarContentMediaQuery = null;
    this.handleSimilarContentMediaChange =
      this.handleSimilarContentMediaChange.bind(this);

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

    this.commentsRoot = null;
    this.commentsContainer = null;
    this.commentsCountLabel = null;
    this.commentsEmptyState = null;
    this.commentsList = null;
    this.commentsLoadMoreButton = null;
    this.commentsDisabledPlaceholder = null;
    this.commentsDisabledPlaceholderDefaultText = "";
    this.commentsComposer = null;
    this.commentsInput = null;
    this.commentsSubmitButton = null;
    this.commentsStatusMessage = null;
    this.commentsCharCount = null;
    this.commentComposerHint = null;
    this.commentComposerDefaultHint = "";
    this.commentComposerDefaultCountText = "";
    this.commentStatusDefaultText = "";
    this.commentComposerMaxLength = 0;
    this.commentComposerState = {
      disabled: true,
      reason: "",
      parentCommentId: null,
    };
    this.commentThreadContext = {
      videoEventId: "",
      parentCommentId: null,
    };
    this.commentProfiles = new Map();
    this.commentNodes = new Map();
    this.commentChildLists = new Map();
    this.commentNodeElements = new Map();
    this.commentNpubEncodingFailures = new Set();
    this.commentAvatarCache = new Map();
    this.commentAvatarFailures = new Set();
    this.commentRetryButton = null;
    this.commentCallbacks = {
      teardown: null,
    };
    this.boundCommentSubmitHandler =
      this.handleCommentComposerSubmit.bind(this);
    this.boundCommentInputHandler =
      this.handleCommentComposerInput.bind(this);
    this.boundCommentLoadMoreHandler =
      this.handleCommentLoadMore.bind(this);
    this.boundCommentRetryHandler = this.handleCommentRetry.bind(this);

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
    this.DEFAULT_PROFILE_AVATAR = "assets/svg/default-profile.svg";

    this.setMediaLoader(mediaLoader);
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

    this.clearSimilarContent({ preservePending: true });

    this.playerModal = playerModal;
    this.modalPanel = playerModal.querySelector(".bv-modal__panel") || null;
    this.modalBackdrop = playerModal.querySelector("[data-dismiss]") || null;
    this.scrollRegion = this.modalPanel || playerModal;

    this.teardownSimilarContentMediaQuery();
    const nextVideoTagsRoot = playerModal.querySelector("#videoTags") || null;
    if (this.videoTagsRoot && this.videoTagsRoot !== nextVideoTagsRoot) {
      this.cleanupVideoTags(this.videoTagsRoot);
    }
    this.videoTagsRoot = nextVideoTagsRoot;
    if (this.videoTagsRoot) {
      this.cleanupVideoTags(this.videoTagsRoot);
    }

    const similarHeading =
      playerModal.querySelector("#playerModalSimilarContentHeading") || null;
    const similarList =
      playerModal.querySelector("#playerModalSimilarContentList") || null;
    const similarSection =
      similarList?.closest(
        "[aria-labelledby='playerModalSimilarContentHeading']"
      ) || similarHeading?.closest(
        "[aria-labelledby='playerModalSimilarContentHeading']"
      ) || null;
    const similarContainer =
      similarList?.closest(".watch-container") ||
      similarHeading?.closest(".watch-container") ||
      similarSection?.closest(".watch-container") ||
      similarSection ||
      null;

    this.similarContentHeading = similarHeading;
    this.similarContentList = similarList;
    this.similarContentContainer = similarContainer;

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

    this.setupSimilarContentMediaQuery();

    if (similarList && similarList.children.length) {
      this.toggleSimilarContentVisibility(true);
    } else {
      this.toggleSimilarContentVisibility(false);
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

    if (Array.isArray(this.pendingSimilarContent)) {
      const pendingSimilar = this.pendingSimilarContent;
      this.pendingSimilarContent = null;
      this.setSimilarContent(pendingSimilar);
    }

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

    this.detachCommentEventHandlers();

    const commentsRoot =
      playerModal.querySelector("[data-comments-root]") || null;
    this.commentsRoot = commentsRoot;
    this.commentsContainer = commentsRoot;
    this.commentsCountLabel =
      commentsRoot?.querySelector("[data-comments-count]") || null;
    this.commentsEmptyState =
      commentsRoot?.querySelector("[data-comments-empty]") || null;
    this.commentsList =
      commentsRoot?.querySelector("[data-comments-list]") || null;
    this.commentsLoadMoreButton =
      commentsRoot?.querySelector("[data-comments-load-more]") || null;
    this.commentsDisabledPlaceholder =
      playerModal.querySelector("[data-comments-disabled-placeholder]") ||
      commentsRoot?.querySelector("[data-comments-disabled]") ||
      null;
    this.commentsComposer =
      commentsRoot?.querySelector("[data-comments-composer]") || null;
    this.commentsInput =
      this.commentsComposer?.querySelector("[data-comments-input]") || null;
    this.commentsSubmitButton =
      this.commentsComposer?.querySelector("[data-comments-submit]") || null;
    this.commentsStatusMessage =
      this.commentsComposer?.querySelector("[data-comments-status]") ||
      commentsRoot?.querySelector("[data-comments-status]") ||
      null;
    this.commentsCharCount =
      this.commentsComposer?.querySelector("[data-comments-char-count]") ||
      null;
    this.commentComposerHint =
      this.commentsComposer?.querySelector("#commentComposerHelp") ||
      this.commentsComposer?.querySelector(".comment-composer__hint") ||
      this.commentComposerHint ||
      null;

    if (this.commentComposerHint) {
      const hintText = this.commentComposerHint.textContent || "";
      if (hintText) {
        this.commentComposerDefaultHint = hintText;
      }
    }
    if (this.commentsCharCount) {
      const countText = this.commentsCharCount.textContent || "";
      if (countText) {
        this.commentComposerDefaultCountText = countText;
      }
    }
    if (this.commentsStatusMessage) {
      const statusText = this.commentsStatusMessage.textContent || "";
      if (statusText) {
        this.commentStatusDefaultText = statusText;
      }
    }
    if (this.commentsInput) {
      const parsedMax = Number(this.commentsInput.maxLength);
      if (Number.isFinite(parsedMax) && parsedMax > 0) {
        this.commentComposerMaxLength = parsedMax;
      }
    }

    if (this.commentsDisabledPlaceholder) {
      const disabledText = this.commentsDisabledPlaceholder.textContent || "";
      if (disabledText) {
        this.commentsDisabledPlaceholderDefaultText = disabledText;
      }
      this.commentsDisabledPlaceholder.setAttribute("hidden", "");
    }
    if (this.commentsComposer) {
      this.commentsComposer.removeAttribute("hidden");
    }

    this.clearComments();
    this.resetCommentComposer();
    this.attachCommentEventHandlers();

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

  attachCommentEventHandlers() {
    if (this.commentsComposer && this.boundCommentSubmitHandler) {
      this.commentsComposer.addEventListener(
        "submit",
        this.boundCommentSubmitHandler
      );
    }
    if (this.commentsInput && this.boundCommentInputHandler) {
      this.commentsInput.addEventListener(
        "input",
        this.boundCommentInputHandler
      );
    }
    if (this.commentsLoadMoreButton && this.boundCommentLoadMoreHandler) {
      this.commentsLoadMoreButton.addEventListener(
        "click",
        this.boundCommentLoadMoreHandler
      );
    }
    if (this.commentRetryButton && this.boundCommentRetryHandler) {
      this.commentRetryButton.addEventListener(
        "click",
        this.boundCommentRetryHandler
      );
    }
  }

  detachCommentEventHandlers() {
    if (this.commentsComposer && this.boundCommentSubmitHandler) {
      this.commentsComposer.removeEventListener(
        "submit",
        this.boundCommentSubmitHandler
      );
    }
    if (this.commentsInput && this.boundCommentInputHandler) {
      this.commentsInput.removeEventListener(
        "input",
        this.boundCommentInputHandler
      );
    }
    if (this.commentsLoadMoreButton && this.boundCommentLoadMoreHandler) {
      this.commentsLoadMoreButton.removeEventListener(
        "click",
        this.boundCommentLoadMoreHandler
      );
    }
    if (this.commentRetryButton && this.boundCommentRetryHandler) {
      this.commentRetryButton.removeEventListener(
        "click",
        this.boundCommentRetryHandler
      );
    }
  }

  handleCommentComposerSubmit(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    const triggerElement =
      (event && event.submitter) || this.commentsSubmitButton || null;

    if (this.commentComposerState.reason === "login-required") {
      this.dispatch("comment:login-required", { triggerElement });
      return;
    }

    if (this.commentComposerState.disabled) {
      return;
    }

    const text = this.getCommentInputValue();
    if (!text) {
      return;
    }

    this.dispatch("comment:submit", {
      text,
      parentId: this.commentComposerState.parentCommentId || null,
      triggerElement,
    });
  }

  handleCommentComposerInput() {
    this.updateCommentCharCount();
    this.updateCommentSubmitState();
  }

  handleCommentLoadMore(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const triggerElement =
      (event && event.currentTarget) || this.commentsLoadMoreButton || null;
    this.dispatch("comment:load-more", {
      parentId: this.commentThreadContext.parentCommentId || null,
      triggerElement,
    });
  }

  handleCommentRetry(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const triggerElement =
      (event && event.currentTarget) || this.commentRetryButton || null;
    this.dispatch("comment:retry", {
      text: this.getCommentInputValue(),
      parentId: this.commentComposerState.parentCommentId || null,
      triggerElement,
    });
  }

  getCommentInputValue({ trimmed = true } = {}) {
    const value = this.commentsInput ? this.commentsInput.value || "" : "";
    return trimmed ? value.trim() : value;
  }

  updateCommentSubmitState() {
    if (!this.commentsSubmitButton) {
      return;
    }
    const hasText = !!this.getCommentInputValue();
    const shouldDisable = this.commentComposerState.disabled || !hasText;
    this.commentsSubmitButton.disabled = shouldDisable;
  }

  updateCommentCharCount() {
    if (!this.commentsCharCount) {
      return;
    }
    const length = this.commentsInput ? this.commentsInput.value.length : 0;
    const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0;
    const max = Number.isFinite(this.commentComposerMaxLength)
      ? Math.max(0, this.commentComposerMaxLength)
      : 0;
    const label = max > 0 ? `${safeLength} / ${max}` : `${safeLength}`;
    this.commentsCharCount.textContent = label;
  }

  setCommentHintText(text) {
    if (!this.commentComposerHint) {
      return;
    }
    const message =
      typeof text === "string" && text
        ? text
        : this.commentComposerDefaultHint || "";
    this.commentComposerHint.textContent = message;
  }

  removeCommentRetryButton() {
    if (!this.commentRetryButton) {
      return;
    }
    this.commentRetryButton.removeEventListener(
      "click",
      this.boundCommentRetryHandler
    );
    if (this.commentRetryButton.parentNode) {
      this.commentRetryButton.parentNode.removeChild(this.commentRetryButton);
    }
    this.commentRetryButton = null;
  }

  setCommentStatus(message, { showRetry = false } = {}) {
    if (!this.commentsStatusMessage) {
      return;
    }

    this.removeCommentRetryButton();

    while (this.commentsStatusMessage.firstChild) {
      this.commentsStatusMessage.removeChild(
        this.commentsStatusMessage.firstChild
      );
    }

    const text =
      typeof message === "string" && message
        ? message
        : this.commentStatusDefaultText || "";
    if (text) {
      this.commentsStatusMessage.appendChild(
        this.document.createTextNode(text)
      );
    }

    if (showRetry) {
      const spacer = this.document.createTextNode(" ");
      const retryButton = this.document.createElement("button");
      retryButton.type = "button";
      retryButton.classList.add("comment-thread__retry", "focus-ring");
      retryButton.appendChild(this.document.createTextNode("Retry"));
      retryButton.addEventListener("click", this.boundCommentRetryHandler);
      this.commentsStatusMessage.appendChild(spacer);
      this.commentsStatusMessage.appendChild(retryButton);
      this.commentRetryButton = retryButton;
    }
  }

  setCommentsVisibility(isVisible) {
    const root = this.commentsContainer || this.commentsRoot;
    if (!root) {
      return;
    }
    const shouldShow = Boolean(isVisible);
    if (shouldShow) {
      root.removeAttribute("hidden");
      root.classList?.remove("hidden");
    } else {
      root.setAttribute("hidden", "");
      root.classList?.add("hidden");
    }
  }

  showCommentsDisabledMessage(message) {
    const placeholder = this.commentsDisabledPlaceholder;
    if (placeholder) {
      const fallbackText = this.commentsDisabledPlaceholderDefaultText || "";
      const nextText =
        typeof message === "string" && message.trim()
          ? message.trim()
          : fallbackText;
      if (nextText) {
        placeholder.textContent = nextText;
      } else if (fallbackText) {
        placeholder.textContent = fallbackText;
      }
      placeholder.removeAttribute("hidden");
      placeholder.classList?.remove("hidden");
    }
    this.setCommentsVisibility(false);
  }

  hideCommentsDisabledMessage() {
    const placeholder = this.commentsDisabledPlaceholder;
    if (placeholder) {
      if (this.commentsDisabledPlaceholderDefaultText) {
        placeholder.textContent = this.commentsDisabledPlaceholderDefaultText;
      }
      placeholder.setAttribute("hidden", "");
      placeholder.classList?.add("hidden");
    }
  }

  setCommentComposerState({ disabled = false, reason = "" } = {}) {
    const normalizedReason = typeof reason === "string" ? reason : "";

    let shouldDisable = !!disabled;
    switch (normalizedReason) {
      case "login-required":
      case "submitting":
      case "disabled":
        shouldDisable = true;
        break;
      case "error":
        shouldDisable = false;
        break;
      default:
        break;
    }

    this.commentComposerState.disabled = shouldDisable;
    this.commentComposerState.reason = normalizedReason;

    if (this.commentsInput) {
      this.commentsInput.disabled = shouldDisable;
    }

    if (normalizedReason !== "disabled") {
      this.hideCommentsDisabledMessage();
    }

    if (this.commentsComposer) {
      if (normalizedReason === "disabled") {
        this.commentsComposer.setAttribute("hidden", "");
      } else {
        this.commentsComposer.removeAttribute("hidden");
      }
    }

    if (normalizedReason === "login-required") {
      this.setCommentHintText("Log in to add a comment.");
      this.setCommentStatus("");
    } else if (normalizedReason === "submitting") {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("Posting comment…");
    } else if (normalizedReason === "error") {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("We couldn't post your comment. Try again?", {
        showRetry: true,
      });
    } else if (normalizedReason === "disabled") {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("");
    } else {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("");
    }

    this.updateCommentSubmitState();
  }

  resetCommentComposer() {
    if (this.commentsInput) {
      this.commentsInput.disabled = false;
      this.commentsInput.value = "";
    }
    this.hideCommentsDisabledMessage();
    this.commentComposerState = {
      disabled: false,
      reason: "",
      parentCommentId: null,
    };
    this.setCommentHintText(this.commentComposerDefaultHint);
    this.setCommentStatus("");
    this.updateCommentCharCount();
    this.updateCommentSubmitState();
  }

  setCommentSectionCallbacks({ teardown = null } = {}) {
    this.commentCallbacks.teardown =
      typeof teardown === "function" ? teardown : null;
  }

  invokeCommentTeardown() {
    const teardown = this.commentCallbacks.teardown;
    if (typeof teardown !== "function") {
      return;
    }
    this.commentCallbacks.teardown = null;
    try {
      teardown();
    } catch (error) {
      this.log("[VideoModal] Failed to teardown comment services", error);
    }
  }

  renderComments(snapshot) {
    if (!this.commentsList || !this.document) {
      return;
    }

    const commentsMap = this.normalizeCommentMap(snapshot?.commentsById);
    const childrenMap = this.normalizeChildrenMap(snapshot?.childrenByParent);
    this.commentProfiles = this.normalizeProfileMap(snapshot?.profiles);

    this.commentThreadContext.videoEventId =
      typeof snapshot?.videoEventId === "string"
        ? snapshot.videoEventId.trim()
        : "";
    this.commentThreadContext.parentCommentId =
      typeof snapshot?.parentCommentId === "string" &&
      snapshot.parentCommentId.trim()
        ? snapshot.parentCommentId.trim()
        : null;

    this.commentNodes.clear();
    this.commentChildLists = new Map();
    this.commentChildLists.set(null, this.commentsList);

    this.commentsList.textContent = "";

    const fragment = this.document.createDocumentFragment();
    const topLevelIds = this.getChildCommentIds(childrenMap, null);
    topLevelIds.forEach((commentId) => {
      const node = this.buildCommentTree(
        commentId,
        commentsMap,
        childrenMap,
        0
      );
      if (node) {
        fragment.appendChild(node);
      }
    });

    this.commentsList.appendChild(fragment);

    this.updateCommentCount(this.commentNodes.size);
    this.toggleCommentEmptyState(this.commentNodes.size === 0);
  }

  appendComment(event) {
    if (!event || typeof event !== "object" || !this.commentsList) {
      return;
    }

    const commentId =
      typeof event.id === "string" && event.id.trim() ? event.id.trim() : "";
    if (!commentId || this.commentNodes.has(commentId)) {
      return;
    }

    if (event.profile && typeof event.pubkey === "string") {
      this.mergeCommentProfile(event.pubkey, event.profile);
    }

    const parentId = this.extractParentCommentId(event);
    const parentNode =
      parentId && this.commentNodes.has(parentId)
        ? this.commentNodes.get(parentId)
        : null;
    const depth = parentNode
      ? Math.max(0, Number(parentNode.dataset?.commentDepth) || 0) + 1
      : 0;

    const node = this.createCommentNode(event, { depth });
    if (!node) {
      return;
    }

    const container = this.getCommentChildrenContainer(parentId);
    if (!container) {
      this.log("[VideoModal] Missing container for appended comment", parentId);
      return;
    }

    container.appendChild(node);
    this.updateCommentCount(this.commentNodes.size);
    this.toggleCommentEmptyState(this.commentNodes.size === 0);
  }

  buildCommentTree(commentId, commentsMap, childrenMap, depth = 0) {
    const normalizedId =
      typeof commentId === "string" && commentId.trim()
        ? commentId.trim()
        : "";
    if (!normalizedId) {
      return null;
    }

    const event = commentsMap.get(normalizedId);
    if (!event) {
      return null;
    }

    const node = this.createCommentNode(event, { depth });
    if (!node) {
      return null;
    }

    const repliesContainer = this.commentChildLists.get(normalizedId);
    if (repliesContainer) {
      const childIds = this.getChildCommentIds(childrenMap, normalizedId);
      if (childIds.length) {
        const fragment = this.document.createDocumentFragment();
        childIds.forEach((childId) => {
          const childNode = this.buildCommentTree(
            childId,
            commentsMap,
            childrenMap,
            depth + 1
          );
          if (childNode) {
            fragment.appendChild(childNode);
          }
        });
        if (fragment.childNodes.length) {
          repliesContainer.appendChild(fragment);
        }
      }
    }

    return node;
  }

  createCommentNode(event, { depth = 0 } = {}) {
    if (!event || typeof event !== "object" || !this.document) {
      return null;
    }

    const commentId =
      typeof event.id === "string" && event.id.trim() ? event.id.trim() : "";
    if (!commentId) {
      return null;
    }

    if (this.commentNodes.has(commentId)) {
      return this.commentNodes.get(commentId);
    }

    const listItem = this.document.createElement("li");
    listItem.classList.add("comment-thread__item");
    listItem.dataset.commentId = commentId;
    listItem.dataset.commentDepth = String(Math.max(0, depth));
    if (typeof event.pubkey === "string" && event.pubkey.trim()) {
      listItem.dataset.commentAuthor = event.pubkey.trim();
    }

    const avatarWrapper = this.document.createElement("div");
    avatarWrapper.classList.add("comment-thread__avatar");

    const avatarImg = this.document.createElement("img");
    avatarImg.hidden = true;
    avatarImg.loading = "lazy";
    avatarImg.decoding = "async";
    avatarWrapper.appendChild(avatarImg);

    const avatarLabel = this.document.createElement("span");
    avatarWrapper.appendChild(avatarLabel);

    const content = this.document.createElement("div");
    content.classList.add("comment-thread__content");

    const meta = this.document.createElement("div");
    meta.classList.add("comment-thread__meta");

    const authorEl = this.document.createElement("span");
    authorEl.classList.add("comment-thread__author");
    meta.appendChild(authorEl);

    const timestamp = this.getCommentTimestampLabel(event.created_at);
    if (timestamp.text) {
      const timeEl = this.document.createElement("time");
      timeEl.classList.add("comment-thread__timestamp");
      if (timestamp.iso) {
        timeEl.setAttribute("datetime", timestamp.iso);
      }
      if (timestamp.title) {
        timeEl.title = timestamp.title;
      }
      timeEl.appendChild(this.document.createTextNode(timestamp.text));
      meta.appendChild(timeEl);
    }

    content.appendChild(meta);

    const identityMeta = this.document.createElement("div");
    identityMeta.classList.add(
      "flex",
      "items-center",
      "gap-2",
      "text-2xs",
      "text-muted-strong"
    );
    identityMeta.hidden = true;
    const npubLabel = this.document.createElement("span");
    npubLabel.classList.add("truncate");
    identityMeta.appendChild(npubLabel);
    content.appendChild(identityMeta);

    const body = this.document.createElement("p");
    body.classList.add("comment-thread__body");
    body.appendChild(
      this.document.createTextNode(
        typeof event.content === "string" ? event.content : ""
      )
    );
    content.appendChild(body);

    const actions = this.document.createElement("div");
    actions.classList.add("comment-thread__actions");

    const copyButton = this.document.createElement("button");
    copyButton.type = "button";
    copyButton.classList.add("comment-thread__copy-npub");
    copyButton.textContent = "Copy npub";
    copyButton.dataset.originalLabel = "Copy npub";
    copyButton.hidden = true;
    this.bindCommentCopyHandler(copyButton);
    actions.appendChild(copyButton);

    const muteButton = this.document.createElement("button");
    muteButton.type = "button";
    muteButton.classList.add("comment-thread__mute");
    muteButton.appendChild(this.document.createTextNode("Mute author"));
    muteButton.addEventListener("click", (domEvent) => {
      const triggerElement = domEvent?.currentTarget || muteButton;
      this.dispatch("comment:mute-author", {
        commentId,
        pubkey:
          typeof event.pubkey === "string" && event.pubkey
            ? event.pubkey
            : "",
        triggerElement,
      });
    });
    actions.appendChild(muteButton);

    content.appendChild(actions);

    const replies = this.document.createElement("ul");
    replies.classList.add("comment-thread__replies");
    replies.setAttribute("data-comment-replies", "");
    content.appendChild(replies);

    listItem.appendChild(avatarWrapper);
    listItem.appendChild(content);

    this.commentNodes.set(commentId, listItem);
    this.commentChildLists.set(commentId, replies);
    this.commentNodeElements.set(commentId, {
      avatarImg,
      avatarLabel,
      authorEl,
      npubContainer: identityMeta,
      npubLabel,
      copyButton,
    });

    this.updateCommentNodeProfile(commentId, event.pubkey);

    return listItem;
  }

  bindCommentCopyHandler(button) {
    if (!button) {
      return;
    }

    button.addEventListener("click", async () => {
      const npub =
        typeof button.dataset.npub === "string" && button.dataset.npub
          ? button.dataset.npub
          : "";
      const originalLabel =
        typeof button.dataset.originalLabel === "string" &&
        button.dataset.originalLabel
          ? button.dataset.originalLabel
          : "Copy npub";
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = originalLabel;
      }

      if (!npub) {
        this.showCommentCopyFeedback(button, "Copy failed", "error");
        return;
      }

      try {
        const clipboard = this.window?.navigator?.clipboard;
        if (!clipboard || typeof clipboard.writeText !== "function") {
          throw new Error("Clipboard unavailable");
        }
        await clipboard.writeText(npub);
        this.showCommentCopyFeedback(button, "Copied!", "copied");
      } catch (error) {
        this.log("[VideoModal] Failed to copy comment npub", error);
        this.showCommentCopyFeedback(button, "Copy failed", "error");
      }
    });
  }

  showCommentCopyFeedback(button, message, state = "") {
    if (!button) {
      return;
    }

    const originalLabel =
      typeof button.dataset.originalLabel === "string" &&
      button.dataset.originalLabel
        ? button.dataset.originalLabel
        : "Copy npub";

    button.textContent = message;
    if (state) {
      button.dataset.state = state;
    } else if (button.dataset.state) {
      delete button.dataset.state;
    }

    const timeoutId = Number.parseInt(
      button.dataset.feedbackTimeoutId || "",
      10
    );
    if (
      Number.isFinite(timeoutId) &&
      this.window &&
      typeof this.window.clearTimeout === "function"
    ) {
      this.window.clearTimeout(timeoutId);
    }

    if (!this.window || typeof this.window.setTimeout !== "function") {
      button.textContent = button.dataset.originalLabel || originalLabel;
      if (button.dataset.feedbackTimeoutId) {
        delete button.dataset.feedbackTimeoutId;
      }
      return;
    }

    const nextId = this.window.setTimeout(() => {
      button.textContent = button.dataset.originalLabel || originalLabel;
      if (button.dataset.state) {
        delete button.dataset.state;
      }
      if (button.dataset.feedbackTimeoutId) {
        delete button.dataset.feedbackTimeoutId;
      }
    }, 2000);

    button.dataset.feedbackTimeoutId = String(nextId);
  }

  updateCommentNodeProfile(commentId, pubkey) {
    if (!(this.commentNodeElements instanceof Map)) {
      this.commentNodeElements = new Map();
    }

    if (!commentId || !this.commentNodeElements.has(commentId)) {
      return;
    }

    const node = this.commentNodes.get(commentId);
    if (!node) {
      return;
    }

    const refs = this.commentNodeElements.get(commentId);
    const profile = this.getCommentAuthorProfile(pubkey);

    if (refs.authorEl) {
      refs.authorEl.textContent = profile.displayName;
    }

    if (refs.avatarLabel) {
      refs.avatarLabel.textContent = profile.initial;
      refs.avatarLabel.hidden = Boolean(profile.avatarUrl);
    }

    if (refs.avatarImg) {
      if (!refs.avatarImg.dataset.commentAvatarBound) {
        const labelRef = refs.avatarLabel;
        const imgRef = refs.avatarImg;
        refs.avatarImg.addEventListener("error", () => {
          const failedSource =
            typeof imgRef?.dataset?.commentAvatarSource === "string"
              ? imgRef.dataset.commentAvatarSource
              : "";
          if (failedSource) {
            this.registerCommentAvatarFailure(failedSource);
          }
          if (
            imgRef &&
            imgRef.dataset.commentAvatarCurrent !== this.DEFAULT_PROFILE_AVATAR
          ) {
            imgRef.dataset.commentAvatarCurrent = this.DEFAULT_PROFILE_AVATAR;
            imgRef.src = this.DEFAULT_PROFILE_AVATAR;
            return;
          }
          if (imgRef) {
            imgRef.hidden = true;
          }
          if (labelRef) {
            labelRef.hidden = false;
          }
        });
        refs.avatarImg.dataset.commentAvatarBound = "true";
      }

      const nextSource = profile.avatarSource || "";
      refs.avatarImg.dataset.commentAvatarSource = nextSource;

      if (profile.avatarUrl) {
        if (
          refs.avatarImg.dataset.commentAvatarCurrent !== profile.avatarUrl
        ) {
          refs.avatarImg.dataset.commentAvatarCurrent = profile.avatarUrl;
          refs.avatarImg.src = profile.avatarUrl;
        }
        refs.avatarImg.alt = `${profile.displayName}'s avatar`;
        refs.avatarImg.hidden = false;
        if (refs.avatarLabel) {
          refs.avatarLabel.hidden = true;
        }
      } else {
        if (
          refs.avatarImg.dataset.commentAvatarCurrent !==
          this.DEFAULT_PROFILE_AVATAR
        ) {
          refs.avatarImg.dataset.commentAvatarCurrent =
            this.DEFAULT_PROFILE_AVATAR;
          refs.avatarImg.src = this.DEFAULT_PROFILE_AVATAR;
        }
        refs.avatarImg.hidden = true;
        if (refs.avatarLabel) {
          refs.avatarLabel.hidden = false;
        }
      }
    }

    if (refs.npubContainer) {
      if (profile.shortNpub) {
        refs.npubContainer.hidden = false;
        if (refs.npubLabel) {
          refs.npubLabel.textContent = profile.shortNpub;
          if (profile.npub) {
            refs.npubLabel.title = profile.npub;
          } else if (refs.npubLabel.title) {
            refs.npubLabel.removeAttribute("title");
          }
        }
      } else {
        refs.npubContainer.hidden = true;
        if (refs.npubLabel) {
          refs.npubLabel.textContent = "";
          if (refs.npubLabel.title) {
            refs.npubLabel.removeAttribute("title");
          }
        }
      }
    }

    if (refs.copyButton) {
      const originalLabel =
        typeof refs.copyButton.dataset.originalLabel === "string" &&
        refs.copyButton.dataset.originalLabel
          ? refs.copyButton.dataset.originalLabel
          : "Copy npub";

      if (profile.npub) {
        refs.copyButton.hidden = false;
        refs.copyButton.disabled = false;
        refs.copyButton.dataset.npub = profile.npub;
        refs.copyButton.setAttribute(
          "aria-label",
          `Copy ${profile.displayName}'s npub`
        );
        refs.copyButton.textContent = originalLabel;
        if (refs.copyButton.dataset.state) {
          delete refs.copyButton.dataset.state;
        }
      } else {
        refs.copyButton.hidden = true;
        refs.copyButton.disabled = true;
        if (refs.copyButton.dataset.state) {
          delete refs.copyButton.dataset.state;
        }
        if (refs.copyButton.dataset.npub) {
          delete refs.copyButton.dataset.npub;
        }
        refs.copyButton.removeAttribute("aria-label");
        refs.copyButton.textContent = originalLabel;
      }
    }
  }

  updateCommentNodesForAuthor(pubkey) {
    if (typeof pubkey !== "string" || !pubkey.trim()) {
      return;
    }
    const normalized = pubkey.trim().toLowerCase();
    this.commentNodes.forEach((node, id) => {
      const author =
        typeof node?.dataset?.commentAuthor === "string"
          ? node.dataset.commentAuthor.trim().toLowerCase()
          : "";
      if (author && author === normalized) {
        this.updateCommentNodeProfile(id, pubkey);
      }
    });
  }

  getCommentAuthorName(pubkey) {
    return this.getCommentAuthorProfile(pubkey).displayName;
  }

  getCommentAvatarInitial(pubkey) {
    return this.getCommentAuthorProfile(pubkey).initial;
  }

  getCommentAuthorProfile(pubkey) {
    const normalized =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    const profileEntry = normalized
      ? this.commentProfiles.get(normalized.toLowerCase()) || null
      : null;

    const rawPicture =
      profileEntry && typeof profileEntry.picture === "string"
        ? profileEntry.picture
        : "";
    const sanitizedPicture = sanitizeProfileMediaUrl(rawPicture);
    const avatar = this.resolveCommentAvatarAsset(normalized, sanitizedPicture);

    let npub = "";
    if (profileEntry && typeof profileEntry.npub === "string") {
      const trimmed = profileEntry.npub.trim();
      if (trimmed) {
        if (trimmed.startsWith("npub")) {
          npub = trimmed;
        } else if (HEX64_REGEX.test(trimmed)) {
          npub = this.encodeCommentPubkeyToNpub(trimmed);
        }
      }
    }

    if (!npub && profileEntry && typeof profileEntry.pubkey === "string") {
      const trimmed = profileEntry.pubkey.trim();
      if (trimmed) {
        npub = this.encodeCommentPubkeyToNpub(trimmed);
      }
    }

    if (!npub && normalized) {
      npub = this.encodeCommentPubkeyToNpub(normalized);
    }

    let displayName = "";
    if (profileEntry && typeof profileEntry === "object") {
      const candidates = [
        profileEntry.display_name,
        profileEntry.name,
        profileEntry.username,
      ];
      for (const candidate of candidates) {
        if (typeof candidate !== "string") {
          continue;
        }
        const trimmed = candidate.trim();
        if (trimmed) {
          displayName = trimmed;
          break;
        }
      }
    }

    if (displayName && HEX64_REGEX.test(displayName)) {
      displayName = "";
    }

    if (!displayName && npub) {
      displayName = this.helpers.formatShortNpub(npub);
    }

    if (!displayName) {
      displayName = "Anonymous";
    }

    const shortNpub = npub ? this.helpers.formatShortNpub(npub) : "";
    const initialCandidate = displayName.trim().charAt(0) || "";
    const initial = initialCandidate ? initialCandidate.toUpperCase() : "?";

    return {
      displayName,
      avatarUrl: avatar.url,
      avatarSource: avatar.source,
      npub,
      shortNpub,
      initial,
    };
  }

  resolveCommentAvatarAsset(pubkey, sanitizedPicture) {
    const normalizedPubkey = this.normalizeCommentAvatarKey(pubkey);
    const normalizedSource =
      typeof sanitizedPicture === "string" && sanitizedPicture
        ? sanitizedPicture
        : "";

    if (normalizedSource && this.commentAvatarFailures.has(normalizedSource)) {
      return { url: this.DEFAULT_PROFILE_AVATAR, source: "" };
    }

    if (normalizedPubkey && this.commentAvatarCache.has(normalizedPubkey)) {
      const cached = this.commentAvatarCache.get(normalizedPubkey);
      if (cached) {
        const cachedSource =
          typeof cached.source === "string" ? cached.source : "";
        const cachedUrl =
          typeof cached.url === "string" && cached.url
            ? cached.url
            : this.DEFAULT_PROFILE_AVATAR;

        if (!normalizedSource) {
          return { url: cachedUrl, source: cachedSource };
        }

        if (cachedSource === normalizedSource) {
          return { url: cachedUrl, source: cachedSource };
        }
      }
    }

    const resolvedUrl = normalizedSource || this.DEFAULT_PROFILE_AVATAR;
    if (normalizedPubkey) {
      this.commentAvatarCache.set(normalizedPubkey, {
        url: resolvedUrl,
        source: normalizedSource,
      });
    }

    return { url: resolvedUrl, source: normalizedSource };
  }

  normalizeCommentAvatarKey(value) {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    return trimmed.toLowerCase();
  }

  registerCommentAvatarFailure(sourceUrl) {
    if (typeof sourceUrl !== "string") {
      return;
    }
    const trimmed = sourceUrl.trim();
    if (!trimmed || trimmed === this.DEFAULT_PROFILE_AVATAR) {
      return;
    }

    if (this.commentAvatarFailures.has(trimmed)) {
      return;
    }

    this.commentAvatarFailures.add(trimmed);

    this.commentAvatarCache.forEach((entry, key) => {
      if (entry && entry.source === trimmed) {
        this.commentAvatarCache.set(key, {
          url: this.DEFAULT_PROFILE_AVATAR,
          source: "",
        });
      }
    });
  }

  encodeCommentPubkeyToNpub(pubkey) {
    if (typeof pubkey !== "string") {
      return "";
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("npub1")) {
      return trimmed;
    }

    if (!HEX64_REGEX.test(trimmed)) {
      return "";
    }

    if (this.commentNpubEncodingFailures.has(trimmed)) {
      return "";
    }

    try {
      const encoded = this.window?.NostrTools?.nip19?.npubEncode?.(trimmed);
      if (typeof encoded === "string" && encoded) {
        return encoded;
      }
    } catch (error) {
      if (!this.commentNpubEncodingFailures.has(trimmed)) {
        this.log("[VideoModal] Failed to encode comment author pubkey", error);
      }
    }

    this.commentNpubEncodingFailures.add(trimmed);
    return "";
  }

  getCommentTimestampLabel(createdAt) {
    const numeric = Number(createdAt);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { text: "", iso: "", title: "" };
    }

    const date = new Date(numeric * 1000);
    if (Number.isNaN(date.getTime())) {
      return { text: "", iso: "", title: "" };
    }

    let text = "";
    try {
      text = formatTimeAgo(numeric);
    } catch (error) {
      this.log("[VideoModal] Failed to format comment timestamp", error);
    }
    if (!text) {
      text = formatAbsoluteTimestamp(numeric);
    }

    return {
      text,
      iso: date.toISOString(),
      title: formatAbsoluteTimestamp(numeric),
    };
  }

  normalizeCommentMap(candidate) {
    if (candidate instanceof Map) {
      return new Map(candidate);
    }
    if (Array.isArray(candidate)) {
      const map = new Map();
      candidate.forEach(([key, value]) => {
        if (typeof key === "string" && key.trim()) {
          map.set(key.trim(), value);
        }
      });
      return map;
    }
    if (candidate && typeof candidate === "object") {
      const map = new Map();
      Object.entries(candidate).forEach(([key, value]) => {
        if (typeof key === "string" && key.trim()) {
          map.set(key.trim(), value);
        }
      });
      return map;
    }
    return new Map();
  }

  normalizeChildrenMap(candidate) {
    const map = new Map();
    if (candidate instanceof Map) {
      candidate.forEach((value, key) => {
        map.set(this.normalizeParentKey(key), this.normalizeIdList(value));
      });
      return map;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(([key, value]) => {
        map.set(this.normalizeParentKey(key), this.normalizeIdList(value));
      });
      return map;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([key, value]) => {
        map.set(this.normalizeParentKey(key), this.normalizeIdList(value));
      });
    }
    return map;
  }

  normalizeProfileMap(candidate) {
    const map = new Map();
    if (candidate instanceof Map) {
      candidate.forEach((value, key) => {
        const normalizedKey =
          typeof key === "string" && key.trim() ? key.trim().toLowerCase() : "";
        if (normalizedKey) {
          map.set(normalizedKey, value);
        }
      });
      return map;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(([key, value]) => {
        const normalizedKey =
          typeof key === "string" && key.trim() ? key.trim().toLowerCase() : "";
        if (normalizedKey) {
          map.set(normalizedKey, value);
        }
      });
      return map;
    }
    if (candidate && typeof candidate === "object") {
      Object.entries(candidate).forEach(([key, value]) => {
        const normalizedKey =
          typeof key === "string" && key.trim() ? key.trim().toLowerCase() : "";
        if (normalizedKey) {
          map.set(normalizedKey, value);
        }
      });
    }
    return map;
  }

  normalizeIdList(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((entry) =>
        typeof entry === "string" && entry.trim() ? entry.trim() : ""
      )
      .filter(Boolean);
  }

  normalizeParentKey(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || trimmed === "null" || trimmed === "undefined") {
        return null;
      }
      return trimmed;
    }
    return this.normalizeParentKey(String(value));
  }

  getChildCommentIds(childrenMap, parentId) {
    const key = this.normalizeParentKey(parentId);
    const list = childrenMap.get(key);
    return Array.isArray(list) ? [...list] : [];
  }

  getCommentChildrenContainer(parentId) {
    const key = this.normalizeParentKey(parentId);
    if (key === null) {
      return this.commentChildLists.get(null) || this.commentsList;
    }
    if (this.commentChildLists.has(key)) {
      return this.commentChildLists.get(key);
    }
    const parentNode = this.commentNodes.get(key);
    if (parentNode) {
      const existing = parentNode.querySelector("[data-comment-replies]");
      if (existing) {
        this.commentChildLists.set(key, existing);
        return existing;
      }
    }
    return this.commentChildLists.get(null) || this.commentsList;
  }

  extractParentCommentId(event) {
    const tags = Array.isArray(event?.tags) ? event.tags : [];
    const values = [];
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      const [name, value] = tag;
      if (name !== "e") {
        continue;
      }
      const normalized = typeof value === "string" ? value.trim() : "";
      if (!normalized || normalized === this.commentThreadContext.videoEventId) {
        continue;
      }
      values.push(normalized);
    }
    if (!values.length) {
      return null;
    }
    return values[values.length - 1];
  }

  mergeCommentProfile(pubkey, profile) {
    if (typeof pubkey !== "string" || !pubkey.trim()) {
      return;
    }
    const normalized = pubkey.trim().toLowerCase();
    this.commentProfiles.set(normalized, profile);
    this.updateCommentNodesForAuthor(pubkey);
  }

  clearComments() {
    if (!(this.commentNodes instanceof Map)) {
      this.commentNodes = new Map();
    } else {
      this.commentNodes.clear();
    }
    if (!(this.commentChildLists instanceof Map)) {
      this.commentChildLists = new Map();
    } else {
      this.commentChildLists.clear();
    }
    if (!(this.commentNodeElements instanceof Map)) {
      this.commentNodeElements = new Map();
    } else {
      this.commentNodeElements.clear();
    }
    if (this.commentNpubEncodingFailures instanceof Set) {
      this.commentNpubEncodingFailures.clear();
    } else {
      this.commentNpubEncodingFailures = new Set();
    }
    if (this.commentsList) {
      this.commentsList.textContent = "";
      this.commentChildLists.set(null, this.commentsList);
    }
    this.updateCommentCount(0);
    this.toggleCommentEmptyState(true);
  }

  updateCommentCount(count) {
    if (!this.commentsCountLabel) {
      return;
    }
    const numeric = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const label = numeric === 1 ? "1 comment" : `${numeric} comments`;
    this.commentsCountLabel.textContent = label;
  }

  toggleCommentEmptyState(isEmpty) {
    const shouldShow = Boolean(isEmpty);
    if (this.commentsEmptyState) {
      if (shouldShow) {
        this.commentsEmptyState.removeAttribute("hidden");
      } else {
        this.commentsEmptyState.setAttribute("hidden", "");
      }
    }
    if (this.commentsList) {
      if (shouldShow) {
        this.commentsList.setAttribute("data-empty", "true");
      } else {
        this.commentsList.removeAttribute("data-empty");
      }
    }
  }

  destroy() {
    this.close();
    this.detachCommentEventHandlers();
    this.removeCommentRetryButton();
    this.invokeCommentTeardown();

    this.commentProfiles = new Map();
    this.commentNodes = new Map();
    this.commentChildLists = new Map();
    this.commentNodeElements = new Map();
    this.commentComposerState = {
      disabled: true,
      reason: "",
      parentCommentId: null,
    };
    this.commentThreadContext = {
      videoEventId: "",
      parentCommentId: null,
    };
    this.commentComposerDefaultHint = "";
    this.commentComposerDefaultCountText = "";
    this.commentStatusDefaultText = "";
    this.commentComposerMaxLength = 0;

    this.commentsRoot = null;
    this.commentsContainer = null;
    this.commentsCountLabel = null;
    this.commentsEmptyState = null;
    this.commentsList = null;
    this.commentsLoadMoreButton = null;
    this.commentsDisabledPlaceholder = null;
    this.commentsDisabledPlaceholderDefaultText = "";
    this.commentsComposer = null;
    this.commentsInput = null;
    this.commentsSubmitButton = null;
    this.commentsStatusMessage = null;
    this.commentsCharCount = null;
    this.commentComposerHint = null;
    this.commentRetryButton = null;
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
          this.closeZapDialog({ silent: true, restoreFocus: false });
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
        const wasDialogMarkedOpen =
          this.modalZapDialogOpen === true ||
          this.modalZapDialog?.dataset?.state === "open";
        if (wasOpen || wasDialogMarkedOpen) {
          this.modalZapPendingToggle = null;
          this.modalZapOpenPromise = null;
          this.modalZapDialog.dataset.state = "closed";
          this.modalZapDialog.setAttribute("aria-hidden", "true");
          this.modalZapDialog.hidden = true;
          this.modalZapDialogOpen = false;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "false");
          }
          if (!silent && (wasOpen || wasDialogMarkedOpen)) {
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
    this.invokeCommentTeardown();
    this.clearComments();
    this.resetCommentComposer();
    this.renderVideoTags([]);
    this.clearSimilarContent();
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
    this.setTorrentStatsVisibility(false);
  }

  updateStatus(message) {
    if (this.modalStatus) {
      this.modalStatus.textContent = message || "";
    }
  }

  setTorrentStatsVisibility(shouldShow) {
    const visible = Boolean(shouldShow);
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
          return true;
        }

        if (this.modalZapDialog) {
          this.modalZapDialog.hidden = false;
          this.modalZapDialog.dataset.state = "open";
          this.modalZapDialog.setAttribute("aria-hidden", "false");
          this.modalZapDialogOpen = true;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "true");
          }
          this.focusZapAmount();
          return true;
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
    const dialogAppearsOpen = this.isZapDialogOpen();

    if (this.modalZapOpenPromise && !dialogAppearsOpen) {
      this.modalZapPendingToggle = "close";
      return;
    }

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
      const isPlatformShare = shareType === "platform";
      const label = isPlatformShare
        ? "Platform fee"
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
      if (receipt.address && !isPlatformShare) {
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

      const identity = this.buildSimilarCardIdentity(
        baseVideo,
        item?.identity || null
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
      this.prepareSimilarVideoCard(
        card,
        { video: baseVideo, pointerInfo, shareUrl },
        cardIndex
      );

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

      const viewSubscription = this.attachSimilarCardViewCounter(
        card,
        pointerInfo
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

    try {
      return win.matchMedia("(min-width: 1024px)").matches;
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

    const query = win.matchMedia("(min-width: 1024px)");
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
      key = this.derivePointerKeyFromInput(pointer);
    }

    return { pointer, key };
  }

  derivePointerKeyFromInput(pointer) {
    if (!pointer) {
      return "";
    }
    if (Array.isArray(pointer)) {
      const [type, value] = pointer;
      if (typeof value === "string" && value.trim()) {
        const normalizedType = type === "a" ? "a" : "e";
        return `${normalizedType}:${value.trim()}`;
      }
      return "";
    }
    if (typeof pointer === "object") {
      if (typeof pointer.key === "string" && pointer.key.trim()) {
        return pointer.key.trim();
      }
      if (
        typeof pointer.pointerKey === "string" &&
        pointer.pointerKey.trim()
      ) {
        return pointer.pointerKey.trim();
      }
      if (
        typeof pointer.type === "string" &&
        typeof pointer.value === "string" &&
        pointer.value.trim()
      ) {
        const normalizedType = pointer.type === "a" ? "a" : "e";
        return `${normalizedType}:${pointer.value.trim()}`;
      }
      if (Array.isArray(pointer.tag)) {
        return this.derivePointerKeyFromInput(pointer.tag);
      }
      return "";
    }
    if (typeof pointer === "string") {
      const trimmed = pointer.trim();
      if (!trimmed) {
        return "";
      }
      if (/^(?:naddr|nevent)/i.test(trimmed)) {
        return "";
      }
      if (trimmed.includes(":")) {
        return trimmed;
      }
      return `e:${trimmed}`;
    }
    return "";
  }

  prepareSimilarVideoCard(card, meta, index) {
    if (!card) {
      return;
    }

    const pointerInfo = meta?.pointerInfo || null;
    const shareUrl = typeof meta?.shareUrl === "string" ? meta.shareUrl : "#";
    const fallbackVideo = meta?.video || null;

    card.onPlay = ({ event, video: selectedVideo, card: sourceCard }) => {
      this.dispatch("similar:select", {
        event,
        video: selectedVideo || fallbackVideo,
        card: sourceCard || card,
        index,
        pointerInfo: pointerInfo,
        shareUrl,
      });
    };

    if (card.moreMenuButton) {
      const button = card.moreMenuButton;
      const parent = button.parentElement;
      if (parent) {
        parent.removeChild(button);
        if (!parent.childElementCount) {
          parent.remove();
        }
      } else {
        button.remove();
      }
      card.moreMenuButton = null;
    }
  }

  buildSimilarCardIdentity(video, overrides) {
    const override = overrides && typeof overrides === "object" ? overrides : {};

    const pubkeyCandidates = [
      override.pubkey,
      video?.pubkey,
      video?.author?.pubkey,
      video?.creator?.pubkey,
    ];
    let pubkey = "";
    for (const candidate of pubkeyCandidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        pubkey = trimmed;
        break;
      }
    }

    const npubCandidates = [
      override.npub,
      video?.npub,
      video?.authorNpub,
      video?.creatorNpub,
      video?.profile?.npub,
    ];
    let npub = "";
    for (const candidate of npubCandidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        npub = trimmed;
        break;
      }
    }

    if (!npub && pubkey) {
      try {
        const encoded = this.helpers.safeEncodeNpub(pubkey);
        if (typeof encoded === "string" && encoded.trim()) {
          npub = encoded.trim();
        }
      } catch {
        /* noop */
      }
    }

    const shortNpubCandidates = [override.shortNpub, video?.shortNpub];
    let shortNpub = "";
    for (const candidate of shortNpubCandidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        shortNpub = trimmed;
        break;
      }
    }

    if (!shortNpub && npub) {
      shortNpub = this.helpers.formatShortNpub(npub) || npub;
    }

    const nameCandidates = [
      override.name,
      override.displayName,
      override.username,
      video?.authorName,
      video?.creatorName,
      video?.creator?.name,
      video?.author?.name,
      video?.profile?.display_name,
      video?.profile?.name,
      video?.profile?.username,
    ];

    let name = "";
    for (const candidate of nameCandidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }
      if (HEX64_REGEX.test(trimmed)) {
        continue;
      }
      name = trimmed;
      break;
    }

    if (!name && shortNpub) {
      name = shortNpub;
    }
    if (!name && npub) {
      name = npub;
    }

    const pictureCandidates = [
      override.picture,
      override.image,
      override.photo,
      video?.picture,
      video?.authorPicture,
      video?.creatorPicture,
      video?.author?.picture,
      video?.creator?.picture,
      video?.profile?.picture,
    ];

    let picture = "";
    for (const candidate of pictureCandidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        picture = trimmed;
        break;
      }
    }

    return {
      name,
      npub,
      shortNpub,
      pubkey,
      picture,
    };
  }

  attachSimilarCardViewCounter(card, pointerInfo) {
    if (!card || typeof card.getViewCountElement !== "function") {
      return null;
    }

    const viewEl = card.getViewCountElement();
    if (!viewEl) {
      return null;
    }

    if (pointerInfo?.key) {
      viewEl.dataset.viewPointer = pointerInfo.key;
    } else if (viewEl.dataset?.viewPointer) {
      delete viewEl.dataset.viewPointer;
    }

    if (!pointerInfo || !pointerInfo.pointer) {
      viewEl.textContent = "– views";
      return null;
    }

    viewEl.textContent = "Loading views…";

    try {
      const token = subscribeToVideoViewCount(
        pointerInfo.pointer,
        ({ total, status }) => {
          if (!viewEl || !viewEl.isConnected) {
            return;
          }
          viewEl.textContent = this.getViewCountLabel(total, status);
        }
      );
      return { pointer: pointerInfo.pointer, token };
    } catch (error) {
      this.log("[VideoModal] Failed to subscribe similar view counter", error);
      viewEl.textContent = "– views";
      return null;
    }
  }

  getViewCountLabel(total, status) {
    if (Number.isFinite(total)) {
      return this.formatViewCountLabel(Number(total));
    }
    if (status === "hydrating") {
      return "Loading views…";
    }
    return "– views";
  }

  formatViewCountLabel(total) {
    const numeric = Number.isFinite(total) ? Math.max(0, Number(total)) : 0;
    const label = numeric === 1 ? "view" : "views";
    return `${formatViewCount(numeric)} ${label}`;
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
