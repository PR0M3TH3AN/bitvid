// js/app.js

import { nostrClient } from "./nostrClientFacade.js";
import { recordVideoView } from "./nostrViewEventsFacade.js";
import { torrentClient } from "./webtorrent.js";
import { emit } from "./embedDiagnostics.js";
import {
  isDevMode,
  ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL,
  ALLOW_NSFW_CONTENT,
  ENABLE_NIP17_RELAY_WARNING,
} from "./config.js";
import { accessControl } from "./accessControl.js";
import { extractBtihFromMagnet, safeDecodeMagnet } from "./magnetUtils.js";
import { deriveTorrentPlaybackConfig } from "./playbackUtils.js";
import {
  URL_FIRST_ENABLED,
  getTrustedMuteHideThreshold,
  getTrustedSpamHideThreshold,
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  FEED_TYPES,
} from "./constants.js";
import { updateVideoCardSourceVisibility } from "./utils/cardSourceVisibility.js";
import { collectVideoTags } from "./utils/videoTags.js";
import { normalizeHashtag } from "./utils/hashtagNormalization.js";
import { sanitizeProfileMediaUrl } from "./utils/profileMedia.js";
import { ADMIN_INITIAL_EVENT_BLACKLIST } from "./lists.js";
import { userBlocks, USER_BLOCK_EVENTS } from "./userBlocks.js";
import { relayManager } from "./relayManager.js";
import {
  createFeedEngine,
  createActiveNostrSource,
  createBlacklistFilterStage,
  createDisinterestFilterStage,
  createDedupeByRootStage,
  createExploreDiversitySorter,
  createExploreScorerStage,
  createKidsAudienceFilterStage,
  createKidsScorerStage,
  createKidsScoreSorter,
  createModerationStage,
  createResolvePostedAtStage,
  createTagPreferenceFilterStage,
  createWatchHistorySuppressionStage,
  createChronologicalSorter,
  createSubscriptionAuthorsSource,
  registerWatchHistoryFeed,
} from "./feedEngine/index.js";
import watchHistoryService from "./watchHistoryService.js";
import r2Service from "./services/r2Service.js";
import storageService from "./services/storageService.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
} from "./services/videoNotePayload.js";
import getAuthProvider, {
  providers as authProviders,
} from "./services/authProviders/index.js";
import hashtagPreferences, {
  HASHTAG_PREFERENCES_EVENTS,
} from "./services/hashtagPreferencesService.js";
import {
  fetchProfileMetadata,
  ensureProfileMetadataSubscription,
} from "./services/profileMetadataService.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import { subscriptions } from "./subscriptions.js";
import {
  refreshActiveChannelVideoGrid,
  clearChannelVideoCardRegistry,
} from "./channelProfile.js";
import { isWatchHistoryDebugEnabled } from "./watchHistoryDebug.js";
import { devLogger, userLogger } from "./utils/logger.js";
import createPopover from "./ui/overlay/popoverEngine.js";
import moderationService from "./services/moderationService.js";
import { sanitizeRelayList } from "./nostr/nip46Client.js";
import { buildDmRelayListEvent, buildShareEvent } from "./nostrEventSchemas.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "./nostrPublish.js";
import {
  getActiveSigner,
  onActiveSignerChanged,
} from "./nostrClientRegistry.js";
import { queueSignEvent } from "./nostr/signRequestQueue.js";
import {
  DEFAULT_NIP07_CORE_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
} from "./nostr/nip07Permissions.js";
import {
  initViewCounter,
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
  ingestLocalViewEvent,
} from "./viewCounter.js";
import {
  formatAbsoluteTimestamp as formatAbsoluteTimestampUtil,
  formatAbsoluteDateWithOrdinal as formatAbsoluteDateWithOrdinalUtil,
  formatTimeAgo as formatTimeAgoUtil,
  truncateMiddle,
  formatShortNpub,
} from "./utils/formatters.js";
import reactionCounter from "./reactionCounter.js";
import {
  escapeHTML as escapeHtml,
} from "./utils/domUtils.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./ui/components/staticModalAccessibility.js";
import LoginModalController from "./ui/loginModalController.js";
import EditModalController from "./ui/editModalController.js";
import RevertModalController from "./ui/revertModalController.js";
import TagPreferenceMenuController from "./ui/tagPreferenceMenuController.js";
import ReactionController from "./ui/reactionController.js";
import { pointerArrayToKey } from "./utils/pointer.js";
import { pointerKey } from "./nostr/watchHistory.js";
import resolveVideoPointer, {
  buildVideoAddressPointer,
} from "./utils/videoPointer.js";
import { isValidMagnetUri } from "./utils/magnetValidators.js";
import { dedupeToNewestByRoot } from "./utils/videoDeduper.js";
import { buildServiceWorkerFallbackStatus } from "./utils/serviceWorkerFallbackMessages.js";
import { batchFetchProfilesFromRelays } from "./utils/profileBatchFetcher.js";
import {
  getVideoRootIdentifier,
  applyRootTimestampToVideosMap,
  syncActiveVideoRootTimestamp,
} from "./utils/videoTimestamps.js";
import { getDesignSystemMode as getCanonicalDesignSystemMode } from "./designSystem.js";
import { getHashViewName, setHashView } from "./hashView.js";
import {
  setModalState as setGlobalModalState,
  subscribeToAppStateKey,
} from "./state/appState.js";
import {
  getCachedUrlHealth as readCachedUrlHealth,
  storeUrlHealth as persistUrlHealth,
  setInFlightUrlProbe,
  getInFlightUrlProbe,
  getModerationOverride,
  setModerationOverride,
  clearModerationOverride,
  loadModerationOverridesFromStorage,
  getModerationSettings,
  getDefaultModerationSettings,
  setModerationSettings,
  resetModerationSettings,
  loadModerationSettingsFromStorage,
  loadDmPrivacySettingsFromStorage,
  URL_PROBE_TIMEOUT_MS,
  urlHealthConstants,
} from "./state/cache.js";
import ApplicationBootstrap from "./ui/applicationBootstrap.js";
import EngagementController from "./ui/engagementController.js";
import SimilarContentController from "./ui/similarContentController.js";
import CreatorProfileController from "./ui/creatorProfileController.js";
import UrlHealthController from "./ui/urlHealthController.js";
import VideoModalCommentController from "./ui/videoModalCommentController.js";
import VideoModalController from "./ui/videoModalController.js";
import TorrentStatusController from "./ui/torrentStatusController.js";
import ShareNostrController from "./ui/shareNostrController.js";
import ModerationActionController from "./services/moderationActionController.js";
import ModerationDecorator from "./services/moderationDecorator.js";
import { bootstrapTrustedSeeds } from "./services/trustBootstrap.js";
import bindCoordinator from "./app/bindCoordinator.js";
import { createFeedCoordinator } from "./app/feedCoordinator.js";
import { createPlaybackCoordinator } from "./app/playbackCoordinator.js";
import { createAuthSessionCoordinator } from "./app/authSessionCoordinator.js";
import { createModalCoordinator } from "./app/modalCoordinator.js";
import { createModerationCoordinator } from "./app/moderationCoordinator.js";
import { createRouterCoordinator } from "./app/routerCoordinator.js";
import { createUiCoordinator } from "./app/uiCoordinator.js";
import { HEX64_REGEX } from "./utils/hex.js";
import {
  safeEncodeNpub,
  safeDecodeNpub,
  normalizeHexPubkey,
} from "./utils/nostrHelpers.js";

const recordVideoViewApi = (...args) => recordVideoView(nostrClient, ...args);

const UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

const FALLBACK_THUMBNAIL_SRC = "/assets/jpg/video-thumbnail-fallback.jpg";
const VIDEO_EVENT_KIND = 30078;

const RELAY_UI_BATCH_DELAY_MS = 250;
/**
 * Simple IntersectionObserver-based lazy loader for images (or videos).
 *
 * Usage:
 *   const mediaLoader = new MediaLoader();
 *   mediaLoader.observe(imgElement);
 *
 * This will load the real image source from `imgElement.dataset.lazy`
 * once the image enters the viewport.
 */
class Application {
  get pubkey() {
    return this.authService.pubkey;
  }

  set pubkey(value) {
    this.authService.pubkey = value;
  }

  get currentUserNpub() {
    return this.authService.currentUserNpub;
  }

  set currentUserNpub(value) {
    this.authService.currentUserNpub = value;
  }

  get currentVideo() {
    return this.playbackService.currentVideo;
  }

  set currentVideo(value) {
    this.playbackService.currentVideo = value;
  }

  get activeProfilePubkey() {
    return this.authService.activeProfilePubkey;
  }

  set activeProfilePubkey(value) {
    this.authService.setActiveProfilePubkey(value, { persist: false });
  }

  get savedProfiles() {
    return this.authService.savedProfiles;
  }

  set savedProfiles(value) {
    this.authService.setSavedProfiles(value, { persist: false, persistActive: false });
  }

  constructor({ services = {}, ui = {}, helpers = {}, loadView: viewLoader } = {}) {
    this.loadView = typeof viewLoader === "function" ? viewLoader : null;
    this._setupOptions = { services, ui, helpers };
    this._isSetup = false;
  }

  setup() {
    if (this._isSetup) return;
    this._isSetup = true;

    const { services = {}, ui = {}, helpers = {} } = this._setupOptions || {};

    const bootstrapServices = {
      ...services,
      torrentClient,
      deriveTorrentPlaybackConfig,
      isValidMagnetUri,
      authProviders,
      getAuthProvider,
    };

    this.bootstrapper = new ApplicationBootstrap({
      app: this,
      services: bootstrapServices,
      ui,
      helpers,
      documentRef: typeof document !== "undefined" ? document : null,
      windowRef: typeof window !== "undefined" ? window : null,
      assets: {
        fallbackThumbnailSrc: FALLBACK_THUMBNAIL_SRC,
        unsupportedBtihMessage: UNSUPPORTED_BTITH_MESSAGE,
      },
    });

    const { modalManager } = this.bootstrapper.initialize();
    this.modalManager = modalManager;

    this.creatorProfileController = new CreatorProfileController({
      services: { nostrClient },
      ui: { zapController: this.zapController },
      callbacks: {
        getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
        setProfileCacheEntry: (pubkey, profile, opts) =>
          this.setProfileCacheEntry(pubkey, profile, opts),
        getCurrentVideo: () => this.currentVideo,
        getVideoModal: () => this.videoModal,
      },
      helpers: {
        fetchProfileMetadata,
        ensureProfileMetadataSubscription,
        safeEncodeNpub: (val) => this.safeEncodeNpub(val),
        formatShortNpub,
        sanitizeProfileMediaUrl,
      },
      logger: devLogger,
    });

    this.videoModalController = new VideoModalController({
      getVideoModal: () => this.videoModal,
      callbacks: {
        showError: (msg) => this.showError(msg),
        showSuccess: (msg) => this.showSuccess(msg),
        showStatus: (msg, opts) => this.showStatus(msg, opts),
        getLastModalTrigger: () => this.lastModalTrigger,
        setLastModalTrigger: (val) => this.setLastModalTrigger(val),
        getCurrentVideo: () => this.currentVideo,
        getPlaySource: () => this.playSource,
        getStreamHealthSnapshots: () => this.streamHealthSnapshots,
        getCachedUrlHealth: (id, url) => this.getCachedUrlHealth(id, url),
        handleCopyMagnet: () => this.handleCopyMagnet(),
        openShareNostrModal: (opts) => this.openShareNostrModal(opts),
        playVideoWithFallback: (opts) => this.playVideoWithFallback(opts),
        attachMoreMenuHandlers: (container) =>
          this.attachMoreMenuHandlers(container),
      },
    });

    this.modalCreatorProfileRequestToken = null;
    this.dmRecipientPubkey = null;
    this.dmRelayHints = new Map();
    this.authLoadingState = { profile: "idle", lists: "idle", dms: "idle" };
    this.permissionPromptShownForSession = false;
    this.permissionPromptVisible = false;
    this.permissionPromptInFlight = false;
    this.permissionPromptPending = new Set();
    this.relayUiRefreshTimeout = null;
    this.lastRelayHealthWarningAt = 0;
    this.appStartedAt = Date.now();
    this.activeIntervals = [];
    this.torrentStatusIntervalId = null;
    this.torrentStatusNodes = null;
    this.torrentStatusVisibilityHandler = null;
    this.torrentStatusPageHideHandler = null;
    this.urlProbePromises = new Map();

    this.commentController = null;
    this.initializeCommentController();

    this.torrentStatusController = new TorrentStatusController({
      getVideoModal: () => this.videoModal,
      onRemovePoster: (reason) => this.forceRemoveModalPoster(reason),
    });

    this.reactionController = new ReactionController({
      services: { reactionCounter },
      ui: {
        getVideoModal: () => this.videoModal,
        showError: (msg) => this.showError(msg),
      },
      state: {
        getCurrentVideo: () => this.currentVideo,
        getCurrentVideoPointer: () => this.currentVideoPointer,
        getCurrentVideoPointerKey: () => this.currentVideoPointerKey,
      },
      callbacks: {
        isUserLoggedIn: () => this.isUserLoggedIn(),
        normalizeHexPubkey: (val) => this.normalizeHexPubkey(val),
        getPubkey: () => this.pubkey,
      },
    });

    this.unsubscribeFromPubkeyState = subscribeToAppStateKey(
      "pubkey",
      (next, previous) => {
        if (next !== previous) {
          this.renderSavedProfiles();
          this.updateShareNostrAuthState({ reason: "pubkey-change" });
          if (
            this.reactionController &&
            this.currentVideoPointer &&
            this.currentVideoPointerKey
          ) {
            this.reactionController.subscribe(
              this.currentVideoPointer,
              this.currentVideoPointerKey
            );
          }
        }
      }
    );

    this.unsubscribeFromCurrentUserState = subscribeToAppStateKey(
      "currentUserNpub",
      (next) => {
        if (this.userPubKey) {
          this.userPubKey.textContent = next || "";
        }
      }
    );

    this.tagPreferenceMenuController = new TagPreferenceMenuController({
      services: { hashtagPreferences },
      callbacks: {
        isLoggedIn: () => this.isUserLoggedIn(),
        getMembership: (tag) => this.getTagPreferenceMembership(tag),
        showError: (msg) => this.showError(msg),
        describeError: (err, opts) =>
          this.describeHashtagPreferencesError(err, opts),
        onPreferenceUpdate: () => {
          this.updateCachedHashtagPreferences();
          this.refreshTagPreferenceUi();
        },
        onMenuOpen: (trigger) => {
          this.closeVideoSettingsMenu({ restoreFocus: false });
          this.closeAllMoreMenus({
            restoreFocus: false,
            skipTrigger: trigger,
            skipView: true,
          });
        },
        getPubkey: () => this.normalizeHexPubkey(this.pubkey),
      },
      helpers: {
        createPopover,
        getDesignSystem: () => this.designSystemContext,
      },
    });

    this.moderationDecorator = new ModerationDecorator({
      getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
    });

    this.urlHealthController = new UrlHealthController({
      state: {
        getCachedUrlHealth: (eventId, url) =>
          this.getCachedUrlHealth(eventId, url),
        storeUrlHealth: (eventId, url, result, ttl) =>
          this.storeUrlHealth(eventId, url, result, ttl),
        getInFlightUrlProbe,
        setInFlightUrlProbe,
      },
      utils: {
        updateVideoCardSourceVisibility,
      },
      logger: devLogger,
      constants: {
        URL_PROBE_TIMEOUT_MS,
        urlHealthConstants,
      },
      callbacks: {
        getVideoListView: () => this.videoListView,
      },
    });

    this.engagementController = new EngagementController({
      services: {
        nostrClient,
      },
      ui: {
        showError: (msg) => this.showError(msg),
        showSuccess: (msg) => this.showSuccess(msg),
        showStatus: (msg, opts) => this.showStatus(msg, opts),
      },
      state: {
        getCurrentVideo: () => this.currentVideo,
        getCurrentVideoPointer: () => this.currentVideoPointer,
      },
    });

    this.shareNostrController = new ShareNostrController({
      ui: {
        showError: (msg) => this.showError(msg),
        showSuccess: (msg) => this.showSuccess(msg),
        getModal: () => this.shareNostrModal,
      },
      state: {
        getPubkey: () => this.pubkey,
        normalizeHexPubkey: (key) => this.normalizeHexPubkey(key),
        getCurrentVideo: () => this.currentVideo,
        buildShareUrlFromEventId: (id) => this.buildShareUrlFromEventId(id),
      },
    });

    this.initializeModerationActionController();
    this.initializeSimilarContentController();

    // ── Coordinator modules ──────────────────────────────────────────
    // Lazily initialised via _initCoordinators(). Runs here eagerly for
    // normal construction and is also triggered on first delegator call
    // so that instances created via Object.create() (test harnesses) work.
    this._initCoordinators();

    this.editModalController = new EditModalController({
      services: {
        nostrService: {
          fetchVideos: (...args) => this.nostrService.fetchVideos(...args),
          handleEditVideoSubmit: (...args) =>
            this.nostrService.handleEditVideoSubmit(...args),
        },
      },
      state: {
        getPubkey: () => this.pubkey,
        getBlacklistedEventIds: () => this.blacklistedEventIds,
        getVideosMap: () => this.videosMap,
      },
      ui: {
        getEditModal: () => this.editModal,
        showError: (msg) => this.showError(msg),
        showSuccess: (msg) => this.showSuccess(msg),
      },
      callbacks: {
        loadVideos: () => this.loadVideos(),
        forceRefreshAllProfiles: () => this.forceRefreshAllProfiles(),
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      },
      helpers: {
        normalizeActionTarget: (t) => this.normalizeActionTarget(t),
        resolveVideoActionTarget: (opts) => this.resolveVideoActionTarget(opts),
      },
    });

    this.revertModalController = new RevertModalController({
      revertModal: this.modalManager?.revertModal,
      services: {
        nostrService: this.nostrService,
        nostrClient: nostrClient,
      },
      state: {
        getPubkey: () => this.pubkey,
        getBlacklistedEventIds: () => this.blacklistedEventIds,
      },
      ui: {
        showError: (msg) => this.showError(msg),
        showSuccess: (msg) => this.showSuccess(msg),
      },
      callbacks: {
        loadVideos: () => this.loadVideos(),
        forceRefreshAllProfiles: () => this.forceRefreshAllProfiles(),
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      },
      helpers: {
        normalizeActionTarget: (t) => this.normalizeActionTarget(t),
        resolveVideoActionTarget: (opts) => this.resolveVideoActionTarget(opts),
        formatAbsoluteTimestamp: (ts) => this.formatAbsoluteTimestamp(ts),
      },
    });

    this.handleShareNostrSignerChange = () => {
      this.updateShareNostrAuthState({ reason: "signer-change" });
    };
    onActiveSignerChanged(this.handleShareNostrSignerChange);
    this.updateShareNostrAuthState({ reason: "init" });

    delete this._setupOptions;
  }

  /**
   * Idempotent coordinator initialisation. Called eagerly from the
   * constructor and lazily from delegators so that instances created
   * via Object.create() (e.g. test harnesses) also work.
   */
  _initCoordinators() {
    if (this._coordinatorsReady) return;
    this._coordinatorsReady = true;

    Object.defineProperty(this, "_feed", {
      value: bindCoordinator(this, createFeedCoordinator({
        devLogger,
        userLogger,
        nostrClient,
        watchHistoryService,
        subscriptions,
        getSidebarLoadingMarkup,
        pointerKey: pointerKey,
        isValidMagnetUri,
        readCachedUrlHealth,
        persistUrlHealth,
        createActiveNostrSource,
        createBlacklistFilterStage,
        createDisinterestFilterStage,
        createDedupeByRootStage,
        createExploreDiversitySorter,
        createExploreScorerStage,
        createKidsAudienceFilterStage,
        createKidsScorerStage,
        createKidsScoreSorter,
        createModerationStage,
        createResolvePostedAtStage,
        createTagPreferenceFilterStage,
        createWatchHistorySuppressionStage,
        createChronologicalSorter,
        createSubscriptionAuthorsSource,
        registerWatchHistoryFeedFn: registerWatchHistoryFeed,
      })),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(this, "_playback", {
      value: bindCoordinator(this, createPlaybackCoordinator({
        devLogger,
        userLogger,
        nostrClient,
        torrentClient,
        emit,
        accessControl,
        isValidMagnetUri,
        safeDecodeMagnet,
        extractBtihFromMagnet,
        collectVideoTags,
        resolveVideoPointer,
        formatShortNpub,
        formatAbsoluteDateWithOrdinalUtil,
        getVideoRootIdentifier,
        applyRootTimestampToVideosMap,
        syncActiveVideoRootTimestamp,
        fetchProfileMetadata,
        ensureProfileMetadataSubscription,
        dedupeToNewestByRoot,
        buildServiceWorkerFallbackStatus,
        sanitizeProfileMediaUrl,
        UNSUPPORTED_BTITH_MESSAGE,
        BITVID_WEBSITE_URL,
        FALLBACK_THUMBNAIL_SRC,
      })),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(this, "_auth", {
      value: bindCoordinator(this, createAuthSessionCoordinator({
        devLogger,
        userLogger,
        nostrClient,
        accessControl,
        userBlocks,
        subscriptions,
        hashtagPreferences,
        storageService,
        relayManager,
        torrentClient,
        getHashViewName,
        setHashView,
        DEFAULT_NIP07_PERMISSION_METHODS,
        RELAY_UI_BATCH_DELAY_MS,
        sanitizeRelayList,
        buildDmRelayListEvent,
        publishEventToRelays,
        assertAnyRelayAccepted,
        queueSignEvent,
        bootstrapTrustedSeeds,
        getModerationSettings,
        getActiveProfilePubkey: () => this.authService.activeProfilePubkey,
      })),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(this, "_modal", {
      value: bindCoordinator(this, createModalCoordinator({
        devLogger,
        nostrClient,
        recordVideoViewApi,
        torrentClient,
        watchHistoryService,
        isWatchHistoryDebugEnabled,
        subscribeToVideoViewCount,
        unsubscribeFromVideoViewCount,
        formatViewCount,
        ingestLocalViewEvent,
        pointerArrayToKey,
        pointerKey: pointerKey,
        getCanonicalDesignSystemMode,
        BITVID_WEBSITE_URL,
      })),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(this, "_moderation", {
      value: bindCoordinator(this, createModerationCoordinator({
        devLogger,
        ModerationActionController,
        setModerationOverride,
        clearModerationOverride,
        userBlocks,
        buildVideoAddressPointer,
        VIDEO_EVENT_KIND,
      })),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(this, "_router", {
      value: bindCoordinator(this, createRouterCoordinator({
        devLogger,
      })),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(this, "_ui", {
      value: bindCoordinator(this, createUiCoordinator({
        devLogger,
      })),
      writable: true,
      configurable: true,
    });
  }

  get modalVideo() {
    return this.videoModal ? this.videoModal.getVideoElement() : null;
  }

  set modalVideo(videoElement) {
    if (this.videoModal) {
      this.videoModal.setVideoElement(videoElement);
    }
  }

  loadSavedProfilesFromStorage() {
    const result = this.authService.loadSavedProfilesFromStorage();
    this.renderSavedProfiles();
    return result;
  }

  syncSavedProfileFromCache(pubkey, { persist = false } = {}) {
    const updated = this.authService.syncSavedProfileFromCache(pubkey, {
      persist,
    });
    if (updated) {
      this.renderSavedProfiles();
    }
    return updated;
  }

  loadProfileCacheFromStorage() {
    this.authService.loadProfileCacheFromStorage();
  }

  persistProfileCacheToStorage() {
    this.authService.persistProfileCache();
  }

  getProfileCacheEntry(pubkey) {
    return this.authService.getProfileCacheEntry(pubkey);
  }

  setProfileCacheEntry(pubkey, profile) {
    return this.authService.setProfileCacheEntry(pubkey, profile);
  }

  persistActiveProfileSelection(pubkey, { persist = true } = {}) {
    this.authService.setActiveProfilePubkey(pubkey, { persist });
    this.renderSavedProfiles();
  }

  prepareForViewLoad() {
    clearChannelVideoCardRegistry();
    if (this.videoListView) {
      this.videoListView.destroy();
    }

    this.videoList = null;
    if (this.videoListPopularTags) {
      this.videoListPopularTags.textContent = "";
      this.videoListPopularTags.hidden = true;
    }
    this.videoListPopularTags = null;

    if (this.mediaLoader && typeof this.mediaLoader.disconnect === "function") {
      this.mediaLoader.disconnect();
    }
  }

  forceRefreshAllProfiles() {
    // 1) Grab the newest set of videos from nostrClient
    const activeVideos = nostrClient.getActiveVideos();

    // 2) Build a unique set of pubkeys
    const uniqueAuthors = new Set(activeVideos.map((v) => v.pubkey));

    // 3) For each author, fetchAndRenderProfile with forceRefresh = true
    this.batchFetchProfiles(uniqueAuthors, { forceRefresh: true });
  }

  getCurrentUserNpub() {
    return this.currentUserNpub;
  }

  isAuthorBlocked(pubkey) {
    try {
      const normalized = this.normalizeHexPubkey(pubkey);
      if (userBlocks && typeof userBlocks.isBlocked === "function") {
        if (normalized && userBlocks.isBlocked(normalized)) {
          return true;
        }
      }

      if (!this.isUserLoggedIn()) {
        if (
          normalized &&
          moderationService &&
          typeof moderationService.getTrustedMutersForAuthor === "function"
        ) {
          const muters = moderationService.getTrustedMutersForAuthor(normalized);
          const threshold = getTrustedMuteHideThreshold();
          if (Array.isArray(muters) && muters.length >= threshold) {
            return true;
          }
        }
      }
    } catch (error) {
      devLogger.warn("[Application] Failed to evaluate block status:", error);
    }

    return false;
  }

  async _initViewManager() {
    if (typeof this.loadView !== "function") {
      const module = await import("./viewManager.js");
      this.loadView = module?.loadView || null;
    }
  }

  _warmupNostrExtension() {
    if (nostrClient && typeof nostrClient.warmupExtension === "function") {
      nostrClient.warmupExtension();
    }
  }

  _initServiceWorker() {
    // Force update of any registered service workers to ensure latest code is used.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.update());
      });
    }
  }

  _initAuthAndModeration() {
    this.authService.hydrateFromStorage();
    this.renderSavedProfiles();

    if (
      this.nostrService &&
      typeof this.nostrService.setDmBlockChecker === "function"
    ) {
      this.nostrService.setDmBlockChecker((pubkey) =>
        this.isAuthorBlocked(pubkey),
      );
    }

    loadModerationOverridesFromStorage();
    loadModerationSettingsFromStorage();
    loadDmPrivacySettingsFromStorage();
    this.moderationSettings = this.normalizeModerationSettings(
      getModerationSettings(),
    );
  }

  _initModals() {
    const videoModalPromise = this.videoModal.load().then(() => {
      if (this.videoModalController) {
        this.videoModalController.bindEvents();
      }
    });

    const uploadModalPromise = this.uploadModal.load().catch((error) => {
      devLogger.error("initUploadModal failed:", error);
      this.showError(`Failed to initialize upload modal: ${error.message}`);
    });

    const editModalPromise = this.editModal.load().catch((error) => {
      devLogger.error("Failed to load edit modal:", error);
      this.showError(`Failed to initialize edit modal: ${error.message}`);
    });

    const profileModalPromise = this.profileController
      ? this.profileController
          .load()
          .then(() => {
            try {
              this.renderSavedProfiles();
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to render saved profiles after load:",
                error,
              );
            }

            try {
              this.profileController.refreshWalletPaneState();
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to refresh wallet pane after load:",
                error,
              );
            }
            return true;
          })
          .catch((error) => {
            devLogger.error("Failed to load profile modal:", error);
            return false;
          })
      : Promise.resolve(false);

    return Promise.all([
      videoModalPromise,
      uploadModalPromise,
      editModalPromise,
      profileModalPromise,
    ]);
  }

  async _initTrustedSeeds() {
    try {
      await bootstrapTrustedSeeds();
    } catch (error) {
      devLogger.warn("[app.init()] Trusted seed bootstrap failed:", error);
    }
  }

  _initViewCounter() {
    try {
      initViewCounter({ nostrClient });
    } catch (error) {
      devLogger.warn("Failed to initialize view counter:", error);
    }
  }

  async _initAccessControl() {
    const promises = [];

    const aclRefreshPromise = accessControl
      .refresh()
      .then(() => {
        if (
          accessControl.lastError &&
          accessControl.lastError?.code === "nostr-unavailable"
        ) {
          devLogger.warn(
            "[app.init()] Access control refresh should not run before nostrClient.init()",
            accessControl.lastError
          );
        }
      })
      .catch((error) => {
        devLogger.warn(
          "Failed to refresh admin lists after connecting to Nostr:",
          error
        );
      });

    // Safeguard: Do not block app initialization indefinitely if relays are slow/unresponsive.
    // 15s gives plenty of time for a healthy connection but prevents E2E test timeouts (60s).
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        devLogger.warn("[app.init()] Access control refresh timed out; proceeding without full admin state.");
        resolve();
      }, 15000);
    });

    promises.push(Promise.race([aclRefreshPromise, timeoutPromise]));

    if (this.profileController) {
      promises.push(
        Promise.resolve()
          .then(() => this.profileController.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn(
              "Failed to update admin pane after connecting to Nostr:",
              error,
            );
          })
      );
    }

    await Promise.all(promises);
  }

  async _syncSessionActorBlacklist(trigger) {
    if (this.pubkey) {
      return;
    }

    const sessionActorPubkey = nostrClient.sessionActor?.pubkey;
    if (!sessionActorPubkey) {
      return;
    }

    const blacklist = accessControl.getBlacklist();
    try {
      await userBlocks.seedBaselineDelta(
        sessionActorPubkey,
        Array.from(blacklist || []),
      );
    } catch (error) {
      devLogger.warn(
        `[app.init()] Failed to sync session actor blacklist${
          trigger ? ` (${trigger})` : ""
        }:`,
        error,
      );
    }
  }

  async _handleSessionActorReady({ pubkey, reason } = {}) {
    if (this.pubkey) {
      return;
    }

    const normalizedPubkey = this.normalizeHexPubkey(pubkey);
    if (!normalizedPubkey) {
      return;
    }

    const triggerLabel = reason ? `session-actor-${reason}` : "session-actor";
    await this._syncSessionActorBlacklist(triggerLabel);

    const refreshReason = "session-actor-ready";
    if (typeof this.refreshVisibleModerationUi === "function") {
      try {
        this.refreshVisibleModerationUi({ reason: refreshReason });
      } catch (error) {
        devLogger.warn(
          "[app.init()] Failed to refresh moderation UI after session actor:",
          error,
        );
      }
    } else {
      this.refreshAllVideoGrids({
        reason: refreshReason,
        forceMainReload: true,
      }).catch((error) => {
        devLogger.warn(
          "[app.init()] Failed to refresh video grids after session actor:",
          error,
        );
      });
    }
  }

  async _initNostr() {
    // Kick off relay connection in the background.
    return nostrClient.init().catch((err) => {
      devLogger.warn("[app.init()] Background nostrClient.init failed:", err);
    });
  }

  async _initSessionActor() {
    // Placeholder for session actor initialization if needed
  }

  _initAccessControlListeners() {
    if (typeof accessControl.onBlacklistChange === "function") {
      accessControl.onBlacklistChange(() => {
        this._syncSessionActorBlacklist("blacklist-change");
        if (this.isUserLoggedIn()) {
          return;
        }

        const refreshReason = "admin-blacklist-change";
        this.refreshAllVideoGrids({
          reason: refreshReason,
          forceMainReload: true,
        }).catch((error) => {
          devLogger.warn(
            "[app.init()] Failed to refresh video grids after admin blacklist change:",
            error,
          );
        });

        if (typeof this.refreshVisibleModerationUi === "function") {
          try {
            this.refreshVisibleModerationUi({ reason: refreshReason });
          } catch (error) {
            devLogger.warn(
              "[app.init()] Failed to refresh moderation UI after admin blacklist change:",
              error,
            );
          }
        }
      });
    }

    if (typeof accessControl.onWhitelistChange === "function") {
      accessControl.onWhitelistChange(() => {
        const refreshReason = "admin-whitelist-change";
        this.refreshAllVideoGrids({
          reason: refreshReason,
          forceMainReload: true,
        }).catch((error) => {
          devLogger.warn(
            "[app.init()] Failed to refresh video grids after admin whitelist change:",
            error,
          );
        });
      });
    }
  }

  _initUI() {
    // Grab the "Subscriptions" link by its id in the sidebar
    this.subscriptionsLink = document.getElementById("subscriptionsLink");

    this.syncAuthUiState();

    if (typeof window !== "undefined") {
      window.addEventListener("bitvid:auth-changed", (event) => {
        const detail = event.detail || {};
        const previousPubkey = detail.previousPubkey;

        if (previousPubkey && typeof storageService !== "undefined" && typeof storageService.lock === "function") {
          storageService.lock(previousPubkey);
        }

        if (this.uploadModal && typeof this.uploadModal.refreshState === "function") {
          this.uploadModal.refreshState();
        }
      });
    }
  }

  async _initAutoLogin() {
    const savedPubKey = this.activeProfilePubkey;
    if (savedPubKey) {
      // Look up the saved profile entry to forward authType and providerId.
      // Without this, the login flow defaults to "nip07" and the signer
      // restoration path cannot distinguish NIP-07 from NIP-46 or nsec,
      // which leads to incorrect signer setup on page refresh.
      const savedProfiles = this.authService.cloneSavedProfiles();
      const normalizedSaved = this.normalizeHexPubkey(savedPubKey) || savedPubKey;
      const savedEntry = savedProfiles.find((entry) => {
        const entryPubkey = this.normalizeHexPubkey(entry?.pubkey);
        return entryPubkey && entryPubkey === normalizedSaved;
      });
      const loginOptions = { persistActive: false };
      if (savedEntry?.authType) {
        loginOptions.authType = savedEntry.authType;
      }
      if (savedEntry?.providerId) {
        loginOptions.providerId = savedEntry.providerId;
      }

      try {
        await this.authService.login(savedPubKey, loginOptions);
      } catch (error) {
        devLogger.error("Auto-login failed:", error);
        if (error && error.code === "site-lockdown") {
          const message = this.describeLoginError(
            error,
            "Auto-login failed. Please sign in again once lockdown ends.",
          );
          this.showStatus(message, { autoHideMs: 12000 });
        }
      }
    }
  }

  async _initWatchHistory() {
    const watchHistoryInitPromise =
      this.watchHistoryTelemetry?.initPreferenceSync?.().catch((error) => {
        devLogger.warn(
          "[app.init()] Failed to initialize watch history metadata sync:",
          error
        );
      }) || Promise.resolve();

    await watchHistoryInitPromise;
  }

  async initializeServices() {
    await this._initViewManager();
    this._warmupNostrExtension();
    this._initServiceWorker();
    this._initAuthAndModeration();
  }

  initializeUIResources() {
    return this._initModals();
  }

  async initializeNetwork() {
    await this._initNostr();
  }

  async initializeDataAndSession() {
    await this._initTrustedSeeds();
    this._initViewCounter();
    await this._initAccessControl();

    await this._initSessionActor();
    this._initAccessControlListeners();
  }

  initializeUserInterface() {
    this._initUI();
  }

  async performAutoLogin() {
    await this._initAutoLogin();
  }

  async finalizeInitialization() {
    this.setupEventListeners();
    await this._initWatchHistory();
    this.checkUrlParams();
  }

  async init() {
    try {
      await this.initializeServices();

      const modalPromise = this.initializeUIResources();
      await this.initializeNetwork();
      await modalPromise;

      await this.initializeDataAndSession();

      this.initializeUserInterface();
      await this.performAutoLogin();

      await this.finalizeInitialization();
    } catch (error) {
      devLogger.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  goToProfile(...args) {
    this._initCoordinators();
    return this._router.goToProfile(...args);
  }

  openCreatorChannel(...args) {
    this._initCoordinators();
    return this._router.openCreatorChannel(...args);
  }

  openWalletPane() {
    if (
      !this.profileController ||
      typeof this.profileController.showWalletPane !== "function"
    ) {
      devLogger.warn(
        "[Application] Wallet pane requested before profile controller initialized.",
      );
      return Promise.resolve(false);
    }

    try {
      const result = this.profileController.showWalletPane();
      if (result && typeof result.then === "function") {
        return result.catch((error) => {
          devLogger.error("[Application] Failed to open wallet pane:", error);
          throw error;
        });
      }
      return Promise.resolve(result);
    } catch (error) {
      devLogger.error("[Application] Failed to open wallet pane:", error);
      return Promise.reject(error);
    }
  }

  dispatchAuthChange(detail = {}) {
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
      return false;
    }

    try {
      const payload = { ...(typeof detail === "object" && detail ? detail : {}) };
      window.dispatchEvent(new CustomEvent("bitvid:auth-changed", { detail: payload }));
      return true;
    } catch (error) {
      devLogger.warn("[Application] Failed to dispatch auth change event:", error);
      return false;
    }
  }

  dispatchAuthLoadingState(...args) {
    this._initCoordinators();
    return this._ui.dispatchAuthLoadingState(...args);
  }

  updateAuthLoadingState(...args) {
    this._initCoordinators();
    return this._ui.updateAuthLoadingState(...args);
  }

  normalizeModalTrigger(...args) {
    this._initCoordinators();
    return this._modal.normalizeModalTrigger(...args);
  }

  setLastModalTrigger(...args) {
    this._initCoordinators();
    return this._modal.setLastModalTrigger(...args);
  }

  getDesignSystemMode(...args) {
    this._initCoordinators();
    return this._modal.getDesignSystemMode(...args);
  }

  isDesignSystemNew(...args) {
    this._initCoordinators();
    return this._modal.isDesignSystemNew(...args);
  }

  /**
   * Show the modal and set the "Please stand by" poster on the video.
   */
  async showModalWithPoster(...args) {
    this._initCoordinators();
    return this._modal.showModalWithPoster(...args);
  }

  applyModalLoadingPoster(...args) {
    this._initCoordinators();
    return this._modal.applyModalLoadingPoster(...args);
  }

  forceRemoveModalPoster(...args) {
    this._initCoordinators();
    return this._modal.forceRemoveModalPoster(...args);
  }

  async ensureVideoModalReady(...args) {
    this._initCoordinators();
    return this._modal.ensureVideoModalReady(...args);
  }

  initializeSimilarContentController() {
    if (this.similarContentController) {
      return;
    }

    this.similarContentController = new SimilarContentController({
      services: {
        nostrClient,
      },
      callbacks: {
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
        decorateVideoModeration: (video) => this.decorateVideoModeration(video),
        decorateVideoCreatorIdentity: (video) => this.decorateVideoCreatorIdentity(video),
      },
      ui: {
        videoModal: this.videoModal,
      },
      state: {
        getVideoListView: () => this.videoListView,
        getVideosMap: () => this.videosMap,
      },
      helpers: {
        getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
        buildShareUrlFromEventId: (id) => this.buildShareUrlFromEventId(id),
        formatTimeAgo: (ts) => this.formatTimeAgo(ts),
      }
    });
  }

  extractDTagValue(tags) {
    if (this.similarContentController) {
      return this.similarContentController.extractDTagValue(tags);
    }
    // Fallback if controller not initialized (though it should be)
    if (!Array.isArray(tags)) {
      return "";
    }
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      if (tag[0] === "d" && typeof tag[1] === "string") {
        return tag[1];
      }
    }
    return "";
  }

  deriveVideoPointerInfo(video) {
    if (this.similarContentController) {
      return this.similarContentController.deriveVideoPointerInfo(video);
    }
    // Fallback if controller not initialized
    if (!video || typeof video !== "object") {
      return null;
    }

    const dTagValue = (this.extractDTagValue(video.tags) || "").trim();

    return resolveVideoPointer({
      kind: video.kind,
      pubkey: video.pubkey,
      videoRootId: video.videoRootId,
      dTag: dTagValue,
      fallbackEventId: video.id,
      relay: video.relay,
    });
  }

  computeSimilarContentCandidates(options = {}) {
    if (this.similarContentController) {
      return this.similarContentController.computeCandidates({
        activeVideo: options.activeVideo || this.currentVideo,
        maxItems: options.maxItems,
      });
    }
    return [];
  }

  updateModalSimilarContent({ activeVideo = this.currentVideo, maxItems } = {}) {
    if (this.similarContentController) {
      this.similarContentController.ui.videoModal = this.videoModal;
      this.similarContentController.updateModal({ activeVideo, maxItems });
    }
  }

  formatViewCountLabel(...args) {
    this._initCoordinators();
    return this._modal.formatViewCountLabel(...args);
  }

  pruneDetachedViewCountElements(...args) {
    this._initCoordinators();
    return this._modal.pruneDetachedViewCountElements(...args);
  }

  teardownAllViewCountSubscriptions(...args) {
    this._initCoordinators();
    return this._modal.teardownAllViewCountSubscriptions(...args);
  }

  teardownModalViewCountSubscription(...args) {
    this._initCoordinators();
    return this._modal.teardownModalViewCountSubscription(...args);
  }


  initializeCommentController() {
    if (!this.commentThreadService || !this.videoModal) {
      return;
    }

    if (this.commentController) {
      return;
    }

    this.commentController = new VideoModalCommentController({
      commentThreadService: this.commentThreadService,
      videoModal: this.videoModal,
      auth: {
        isLoggedIn: () => this.isUserLoggedIn(),
        initializeLoginModalController: (options) =>
          this.initializeLoginModalController(options),
        getLoginModalController: () => this.loginModalController,
        requestLogin: (options) =>
          this.authService?.requestLogin?.(options) ?? Promise.resolve(false),
      },
      callbacks: {
        showError: (message) => this.showError(message),
        showStatus: (message, options) => this.showStatus(message, options),
        muteAuthor: (pubkey) => userBlocks.addBlock(pubkey, this.pubkey),
        shouldHideAuthor: (pubkey) => this.shouldHideCommentAuthor(pubkey),
      },
      services: {
        publishComment: (target, eventData) =>
          nostrClient.publishVideoComment(target, eventData),
      },
      utils: {
        normalizeHexPubkey: (value) => this.normalizeHexPubkey(value),
      },
    });
  }

  shouldHideCommentAuthor(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return false;
    }

    if (userBlocks?.isBlocked?.(normalized)) {
      return true;
    }

    try {
      if (moderationService?.isAuthorMutedByViewer?.(normalized)) {
        return true;
      }
    } catch (error) {
      devLogger.warn("[comment] Failed to check viewer mute state:", error);
    }

    try {
      if (moderationService?.isAuthorMutedByTrusted?.(normalized)) {
        return true;
      }
    } catch (error) {
      devLogger.warn("[comment] Failed to check trusted mute state:", error);
    }

    return false;
  }

  subscribeModalViewCount(...args) {
    this._initCoordinators();
    return this._modal.subscribeModalViewCount(...args);
  }

  async handleVideoReaction(detail = {}) {
    if (this.reactionController) {
      return this.reactionController.handleReaction(detail);
    }
  }

  syncProfileModalState({
    includeSavedProfiles = true,
    includeActivePubkey = true,
  } = {}) {
    if (!this.profileController) {
      return;
    }

    if (includeSavedProfiles) {
      try {
        if (typeof this.profileController.setSavedProfiles === "function") {
          const entries = Array.isArray(this.savedProfiles)
            ? this.savedProfiles.slice()
            : [];
          this.profileController.setSavedProfiles(entries, {
            persist: false,
            persistActive: false,
          });
        }
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to synchronize saved profiles with controller:",
          error,
        );
      }
    }

    if (includeActivePubkey) {
      try {
        if (typeof this.profileController.setActivePubkey === "function") {
          this.profileController.setActivePubkey(
            this.activeProfilePubkey || null,
            { persist: false },
          );
        }
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to synchronize active profile with controller:",
          error,
        );
      }
    }
  }

  renderSavedProfiles() {
    if (!this.profileController) {
      return;
    }
    this.syncProfileModalState();
    try {
      this.profileController.renderSavedProfiles();
    } catch (error) {
      devLogger.warn(
        "[profileModal] Failed to render saved profiles:",
        error,
      );
    }
  }

  handleProfileModalClosed() {
    this.closeAllMoreMenus();
  }

  handleProfileChannelLink(...args) {
    this._initCoordinators();
    return this._router.handleProfileChannelLink(...args);
  }

  async handleLoginModalSuccess(payload = {}) {
    const result =
      payload && typeof payload === "object" ? payload.result || null : null;
    const pubkey =
      (result &&
      typeof result === "object" &&
      typeof result.pubkey === "string"
        ? result.pubkey
        : typeof result === "string"
        ? result
        : null) || null;

    devLogger.log("[LoginModal] Login result returned pubkey:", pubkey);

    if (!result || typeof result !== "object") {
      return;
    }

    const { detail } = result;

    if (
      pubkey &&
      detail &&
      typeof detail === "object" &&
      detail.__handled !== true
    ) {
      try {
        await this.handleAuthLogin(detail);
      } catch (error) {
        devLogger.error(
          "[LoginModal] handleAuthLogin fallback failed:",
          error,
        );
      }
    }
  }

  async handleLoginModalError(payload = {}) {
    const message =
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : null;
    const error = payload?.error || null;
    const provider = payload?.provider || null;

    const fallbackMessage =
      message ||
      this.describeLoginError(
        error,
        provider?.errorMessage || "Failed to login. Please try again.",
      );

    const normalizedMessage =
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : "Failed to login. Please try again.";

    userLogger.warn(
      provider && provider.id
        ? `[LoginModal] Login failed for provider ${provider.id}.`
        : "[LoginModal] Login failed for provider.",
    );
    this.showError(normalizedMessage);
  }

  async requestProfileAdditionLogin({ triggerElement } = {}) {
    this.initializeLoginModalController();
    if (
      this.loginModalController &&
      typeof this.loginModalController.requestAddProfileLogin === "function"
    ) {
      try {
        return await this.loginModalController.requestAddProfileLogin({
          triggerElement,
          requestOptions: {
            allowAccountSelection: true,
            autoApply: false,
          },
        });
      } catch (error) {
        if (
          error &&
          (error.code === "login-cancelled" || error.code === "user-cancelled")
        ) {
          throw error;
        }
        if (
          !error ||
          (error.code !== "modal-unavailable" &&
            error.code !== "modal-open-failed")
        ) {
          throw error;
        }
        devLogger.warn(
          "[profileModal] Falling back to direct login for profile addition:",
          error,
        );
      }
    }

    return this.authService.requestLogin({
      allowAccountSelection: true,
      autoApply: false,
    });
  }

  describeLoginError(error, fallbackMessage = "Failed to login. Please try again.") {
    const code =
      error && typeof error.code === "string" && error.code.trim()
        ? error.code.trim()
        : null;
    if (code === "site-lockdown") {
      return "This site is temporarily locked down. Only administrators may sign in right now.";
    }

    if (error && typeof error.message === "string") {
      const trimmed = error.message.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return fallbackMessage;
  }

  initializeLoginModalController(options = {}) {
    const { logIfMissing = false } =
      options && typeof options === "object" ? options : {};

    if (this.loginModalController) {
      return true;
    }

    let loginModalElement = null;
    try {
      loginModalElement = document.getElementById("loginModal") || null;
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to look up login modal container:",
        error,
      );
    }

    if (!(loginModalElement instanceof HTMLElement)) {
      if (logIfMissing) {
        devLogger.warn(
          "[Application] Login modal controller disabled: modal container not found.",
        );
      }
      return false;
    }

    const preparedModal =
      prepareStaticModal({ root: loginModalElement }) || loginModalElement;

    loginModalElement = preparedModal;

    const closeLoginModal = () => {
      if (closeStaticModal(loginModalElement)) {
        setGlobalModalState("login", false);
      }
    };

    const bringModalToFront = (modal) => {
      if (!(modal instanceof HTMLElement)) {
        return;
      }
      const parent = modal.parentElement;
      if (parent && parent.lastElementChild !== modal) {
        parent.appendChild(modal);
      }
    };

    const openLoginModal = ({ modal, triggerElement } = {}) => {
      const target =
        modal instanceof HTMLElement ? modal : loginModalElement;
      bringModalToFront(target);
      return openStaticModal(target, { triggerElement });
    };

    const prepareLoginModal = (modal) =>
      prepareStaticModal({ root: modal || loginModalElement });

    try {
      this.loginModalController = new LoginModalController({
        modalElement: loginModalElement,
        providers: authProviders,
        services: {
          authService: this.authService,
          nostrClient,
        },
        callbacks: {
          onProviderSelected: (providerId) => {
            devLogger.log(`[LoginModal] Provider selected: ${providerId}.`);
            this.maybeShowExperimentalLoginWarning(providerId);
          },
          onLoginSuccess: (payload) => {
            const maybePromise = this.handleLoginModalSuccess(payload);
            if (maybePromise && typeof maybePromise.then === "function") {
              maybePromise.catch((error) => {
                devLogger.error(
                  "[LoginModal] handleLoginModalSuccess threw:",
                  error,
                );
              });
            }
          },
          onLoginError: (payload) => {
            const maybePromise = this.handleLoginModalError(payload);
            if (maybePromise && typeof maybePromise.then === "function") {
              maybePromise.catch((error) => {
                devLogger.error(
                  "[LoginModal] handleLoginModalError threw:",
                  error,
                );
              });
            }
          },
        },
        helpers: {
          closeModal: closeLoginModal,
          openModal: ({ modal, triggerElement } = {}) =>
            openLoginModal({ modal, triggerElement }),
          prepareModal: (modal) => prepareLoginModal(modal),
          setModalState: (_, isOpen) =>
            setGlobalModalState("login", isOpen === undefined ? false : !!isOpen),
          describeLoginError: (error, fallbackMessage) =>
            this.describeLoginError(
              error,
              typeof fallbackMessage === "string" && fallbackMessage.trim()
                ? fallbackMessage.trim()
                : "Failed to login. Please try again.",
            ),
        },
      });
      return true;
    } catch (error) {
      devLogger.error(
        "[Application] Failed to initialize login modal controller:",
        error,
      );
      return false;
    }
  }

  canCurrentUserManageBlacklist() {
    const actorNpub = this.getCurrentUserNpub();
    if (!actorNpub) {
      return false;
    }

    try {
      return accessControl.canEditAdminLists(actorNpub);
    } catch (error) {
      devLogger.warn("Unable to verify blacklist permissions:", error);
      return false;
    }
  }

  describeAdminError(code) {
    switch (code) {
      case "invalid npub":
        return "Please provide a valid npub address.";
      case "immutable":
        return "That account cannot be modified.";
      case "self":
        return "You cannot blacklist yourself.";
      case "forbidden":
        return "You do not have permission to perform that action.";
      case "nostr-unavailable":
        return "Unable to reach the configured Nostr relays. Please retry once your connection is restored.";

      case "nostr-extension-missing":
        return "Connect a Nostr extension before editing moderation lists.";
      case "signature-failed":
        return "We couldn’t sign the update with your Nostr key. Please reconnect your extension and try again.";
      case "publish-failed":
        return "Failed to publish the update to Nostr relays. Please try again.";
      case "storage-error":
        return "Unable to update moderation settings. Please try again.";
      default:
        return "Unable to update moderation settings. Please try again.";
    }
  }

  describeNotificationError(code) {
    switch (code) {
      case "nostr-extension-missing":
        return "List updated, but the DM notification failed because no Nostr extension is connected.";
      case "nostr-uninitialized":
        return "List updated, but the DM notification system is still connecting to Nostr relays. Please try again in a moment.";
      case "nip04-unavailable":
        return "List updated, but your Nostr extension does not support NIP-04 encryption, so the DM notification was not sent.";
      case "sign-event-unavailable":
        return "List updated, but your Nostr extension could not sign the DM notification.";
      case "missing-actor-pubkey":
        return "List updated, but we could not determine your public key to send the DM notification.";
      case "publish-failed":
        return "List updated, but the DM notification could not be delivered to any relay.";
      case "encryption-failed":
      case "signature-failed":
        return "List updated, but the DM notification failed while preparing the encrypted message.";
      case "invalid-target":
      case "empty-message":
        return "";
      default:
        return "List updated, but the DM notification could not be sent.";
    }
  }

  describeUserBlockActionError(error) {
    const code =
      error && typeof error.code === "string" ? error.code.trim().toLowerCase() : "";

    switch (code) {
      case "nip04-missing":
        return "Your Nostr extension must support NIP-04 to manage private block lists.";
      case "extension-permission-denied":
        return "Your Nostr extension denied the encryption permissions needed to update your block list.";
      case "extension-encryption-permission-denied":
        return "Your Nostr extension denied the encryption permissions needed to update your block list.";
      case "sign-event-missing":
      case "signer-missing":
        return "Connect a Nostr signer that can encrypt and sign updates before managing block lists.";
      case "nostr-extension-missing":
        return "Connect a Nostr extension before updating your block list.";
      case "invalid":
        return "Unable to block that account. Please try again.";
      case "self":
        return "You cannot block yourself.";
      default:
        return "";
    }
  }

  describeHashtagPreferencesError(error, options = {}) {
    const { operation = "update", fallbackMessage } =
      options && typeof options === "object" ? options : {};
    const code =
      error && typeof error.code === "string" ? error.code.trim() : "";

    if (code === "hashtag-preferences-empty") {
      return "";
    }

    switch (code) {
      case "hashtag-preferences-missing-pubkey":
        return "Select a profile before managing hashtag preferences.";
      case "hashtag-preferences-missing-signer":
        return "Connect a Nostr signer that supports encryption before managing hashtag preferences.";
      case "hashtag-preferences-extension-denied":
        return "Your signer denied the encryption permissions needed to manage hashtag preferences.";
      case "hashtag-preferences-permission-required":
        return "Your Nostr extension must grant encryption permissions to read hashtag preferences.";
      case "hashtag-preferences-no-decryptors":
        return "Unable to decrypt hashtag preferences with the active signer.";
      case "hashtag-preferences-decrypt-failed":
        return "Failed to decrypt hashtag preferences. Please try again.";
      case "hashtag-preferences-no-encryptor":
        return "No supported encryption methods are available to publish hashtag preferences.";
      case "hashtag-preferences-encrypt-failed":
        return "Failed to encrypt hashtag preferences. Please try again.";
      case "hashtag-preferences-no-relays":
        return "No relays are configured to publish hashtag preferences.";
      default:
        break;
    }

    const normalizedOperation =
      typeof operation === "string" ? operation.trim().toLowerCase() : "";
    const fallback =
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : normalizedOperation === "load"
        ? "Failed to load hashtag preferences. Please try again."
        : normalizedOperation === "reset"
        ? "Failed to reset hashtag preferences."
        : "Failed to update hashtag preferences. Please try again.";

    return fallback;
  }

  resetPermissionPromptState() {
    this.permissionPromptShownForSession = false;
    this.permissionPromptVisible = false;
    this.permissionPromptInFlight = false;
    if (this.permissionPromptPending instanceof Set) {
      this.permissionPromptPending.clear();
    } else {
      this.permissionPromptPending = new Set();
    }
    this.updatePermissionPromptCta();
  }

  capturePermissionPromptRequirement(source) {
    const normalized =
      typeof source === "string" ? source.trim().toLowerCase() : "";
    if (!normalized) {
      return;
    }

    this.permissionPromptPending.add(normalized);

    if (!this.permissionPromptShownForSession) {
      this.permissionPromptShownForSession = true;
      this.permissionPromptVisible = true;
    }

    this.updatePermissionPromptCta();
  }

  capturePermissionPromptFromError(error) {
    const code =
      error && typeof error.code === "string" ? error.code.trim() : "";

    switch (code) {
      case "subscriptions-permission-required":
        this.capturePermissionPromptRequirement("subscriptions");
        break;
      case "user-blocklist-permission-required":
        this.capturePermissionPromptRequirement("user-blocks");
        break;
      case "hashtag-preferences-permission-required":
        this.capturePermissionPromptRequirement("hashtag-preferences");
        break;
      default:
        break;
    }
  }

  resolvePermissionPromptMessage() {
    const needsSubscriptions = this.permissionPromptPending.has("subscriptions");
    const needsHashtags = this.permissionPromptPending.has("hashtag-preferences");
    const needsBlocks = this.permissionPromptPending.has("user-blocks");

    if (needsBlocks && needsSubscriptions && needsHashtags) {
      return "Unlock private lists and enable permissions to load your subscriptions and hashtag preferences.";
    }
    if (needsBlocks && needsSubscriptions) {
      return "Unlock private lists and enable permissions to load your subscriptions.";
    }
    if (needsBlocks && needsHashtags) {
      return "Unlock private lists and enable permissions to load your hashtag preferences.";
    }
    if (needsSubscriptions && needsHashtags) {
      return "Enable permissions to load your subscriptions and hashtag preferences.";
    }
    if (needsBlocks) {
      return "Unlock private lists to load your block list.";
    }
    if (needsSubscriptions) {
      return "Enable permissions to load your subscriptions.";
    }
    if (needsHashtags) {
      return "Enable permissions to load your hashtag preferences.";
    }
    return "";
  }

  updatePermissionPromptCta() {
    if (!this.profileController?.setPermissionPromptCtaState) {
      return;
    }

    const shouldShow =
      this.permissionPromptVisible && this.permissionPromptPending.size > 0;
    const message = shouldShow ? this.resolvePermissionPromptMessage() : "";

    this.profileController.setPermissionPromptCtaState({
      visible: shouldShow,
      message,
      buttonLabel: "Enable permissions",
      busy: this.permissionPromptInFlight,
    });
  }

  normalizeHashtagPreferenceList(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    const normalized = [];
    const seen = new Set();

    for (const entry of list) {
      if (typeof entry !== "string") {
        continue;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }
      const lowered = trimmed.toLowerCase();
      if (seen.has(lowered)) {
        continue;
      }
      seen.add(lowered);
      normalized.push(lowered);
    }

    normalized.sort((a, b) => a.localeCompare(b));
    return normalized;
  }

  normalizeTagPreferenceCandidate(tag) {
    return normalizeHashtag(tag);
  }

  getTagPreferenceState(tag) {
    const normalized = this.normalizeTagPreferenceCandidate(tag);
    if (!normalized) {
      return "neutral";
    }

    const { interests, disinterests } = this.getHashtagPreferences();
    if (interests.includes(normalized)) {
      return "interest";
    }
    if (disinterests.includes(normalized)) {
      return "disinterest";
    }
    return "neutral";
  }

  getTagPreferenceMembership(tag) {
    const state = this.getTagPreferenceState(tag);
    return {
      state,
      interest: state === "interest",
      disinterest: state === "disinterest",
    };
  }

  createHashtagPreferencesSnapshot(detail = {}) {
    const service = this.hashtagPreferences;
    const sourceInterests = Array.isArray(detail?.interests)
      ? detail.interests
      : typeof service?.getInterests === "function"
      ? service.getInterests()
      : [];
    const sourceDisinterests = Array.isArray(detail?.disinterests)
      ? detail.disinterests
      : typeof service?.getDisinterests === "function"
      ? service.getDisinterests()
      : [];

    const rawEventId =
      typeof detail?.eventId === "string" && detail.eventId.trim()
        ? detail.eventId.trim()
        : typeof service?.eventId === "string" && service.eventId.trim()
        ? service.eventId.trim()
        : "";

    const createdAtSource =
      detail?.createdAt ?? service?.eventCreatedAt ?? null;
    const createdAtNumeric = Number(createdAtSource);
    const createdAt = Number.isFinite(createdAtNumeric)
      ? createdAtNumeric
      : null;

    const action =
      typeof detail?.action === "string" ? detail.action.trim() : "";

    const loaded =
      detail?.loaded === true ||
      (detail?.loaded === false
        ? false
        : Boolean(service && service.loaded));
    const uiReady =
      detail?.uiReady === true ||
      (detail?.uiReady === false
        ? false
        : Boolean(service && service.uiReady));
    const dataReady =
      detail?.dataReady === true ||
      (detail?.dataReady === false
        ? false
        : Boolean(service && service.dataReady));
    const loadedFromCache =
      detail?.loadedFromCache === true ||
      (detail?.loadedFromCache === false
        ? false
        : Boolean(service && service.loadedFromCache));
    const lastLoadError = detail?.lastLoadError || service?.lastLoadError || null;

    return {
      interests: this.normalizeHashtagPreferenceList(sourceInterests),
      disinterests: this.normalizeHashtagPreferenceList(sourceDisinterests),
      eventId: rawEventId || null,
      createdAt,
      loaded,
      uiReady,
      dataReady,
      loadedFromCache,
      lastLoadError,
      action,
    };
  }

  computeHashtagPreferencesSignature(snapshot = {}) {
    const interests = Array.isArray(snapshot.interests)
      ? snapshot.interests.join(",")
      : "";
    const disinterests = Array.isArray(snapshot.disinterests)
      ? snapshot.disinterests.join(",")
      : "";
    const eventId =
      typeof snapshot.eventId === "string" && snapshot.eventId
        ? snapshot.eventId
        : "";
    const createdAt = Number.isFinite(snapshot.createdAt)
      ? Number(snapshot.createdAt)
      : "";
    const loaded = snapshot.loaded === true ? "1" : "0";
    const uiReady = snapshot.uiReady === true ? "1" : "0";
    const dataReady = snapshot.dataReady === true ? "1" : "0";
    const loadedFromCache = snapshot.loadedFromCache === true ? "1" : "0";
    const lastLoadError = snapshot?.lastLoadError?.code || "";

    return [
      interests,
      disinterests,
      eventId,
      createdAt,
      loaded,
      uiReady,
      dataReady,
      loadedFromCache,
      lastLoadError,
    ].join("|");
  }

  updateCachedHashtagPreferences(detail = {}) {
    const snapshot = this.createHashtagPreferencesSnapshot(detail);
    const signature = this.computeHashtagPreferencesSignature(snapshot);
    const changed = signature !== this.hashtagPreferencesSnapshotSignature;

    this.hashtagPreferencesSnapshot = {
      interests: [...snapshot.interests],
      disinterests: [...snapshot.disinterests],
      eventId: snapshot.eventId,
      createdAt: snapshot.createdAt,
      loaded: snapshot.loaded,
      uiReady: snapshot.uiReady,
      dataReady: snapshot.dataReady,
      loadedFromCache: snapshot.loadedFromCache,
      lastLoadError: snapshot.lastLoadError,
      action: snapshot.action,
    };
    this.hashtagPreferencesSnapshotSignature = signature;

    return { snapshot: this.hashtagPreferencesSnapshot, changed };
  }

  handleHashtagPreferencesChange(detail = {}) {
    const { changed } = this.updateCachedHashtagPreferences(detail);

    this.refreshTagPreferenceUi();

    if (
      this.profileController &&
      typeof this.profileController.handleHashtagPreferencesChange ===
        "function"
    ) {
      try {
        this.profileController.handleHashtagPreferencesChange({
          action:
            typeof detail?.action === "string" ? detail.action : "",
          preferences: this.getHashtagPreferences(),
        });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to notify profile controller about hashtag preferences change:",
          error,
        );
      }
    }

    if (!changed) {
      return;
    }

    const action =
      typeof detail?.action === "string" && detail.action.trim()
        ? detail.action.trim()
        : "";
    const refreshReason = action
      ? `hashtag-preferences-${action}`
      : "hashtag-preferences-change";

    Promise.resolve(
      this.onVideosShouldRefresh({ reason: refreshReason }),
    ).catch((error) => {
      devLogger.warn(
        "[Application] Failed to refresh videos after hashtag preference change:",
        error,
      );
    });
  }

  getHashtagPreferences() {
    const snapshot = this.hashtagPreferencesSnapshot || {};
    return {
      interests: Array.isArray(snapshot.interests)
        ? [...snapshot.interests]
        : [],
      disinterests: Array.isArray(snapshot.disinterests)
        ? [...snapshot.disinterests]
        : [],
      eventId:
        typeof snapshot.eventId === "string" && snapshot.eventId
          ? snapshot.eventId
          : null,
      createdAt: Number.isFinite(snapshot.createdAt)
        ? Number(snapshot.createdAt)
        : null,
      loaded: snapshot.loaded === true,
      uiReady: snapshot.uiReady === true,
      dataReady: snapshot.dataReady === true,
      loadedFromCache: snapshot.loadedFromCache === true,
      lastLoadError: snapshot.lastLoadError || null,
    };
  }

  refreshTagPreferenceUi() {
    if (this.videoModal?.refreshTagPreferenceStates) {
      try {
        this.videoModal.refreshTagPreferenceStates();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh video modal tag preference states:",
          error,
        );
      }
    }

    if (this.videoListView?.refreshTagPreferenceStates) {
      try {
        this.videoListView.refreshTagPreferenceStates();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh list view tag preference states:",
          error,
        );
      }
    }

    this.tagPreferenceMenuController.refreshActiveMenus();
  }

  async loadHashtagPreferencesForPubkey(pubkey, options = {}) {
    if (
      !this.hashtagPreferences ||
      typeof this.hashtagPreferences.load !== "function"
    ) {
      return null;
    }

    try {
      await this.hashtagPreferences.load(pubkey, options);
      return true;
    } catch (error) {
      devLogger.error(
        "[Application] Failed to load hashtag preferences:",
        error,
      );
      const message = this.describeHashtagPreferencesError(error, {
        operation: "load",
      });
      if (message) {
        this.showError(message);
      }
      return null;
    }
  }

  resetHashtagPreferencesState() {
    if (
      !this.hashtagPreferences ||
      typeof this.hashtagPreferences.reset !== "function"
    ) {
      return false;
    }

    try {
      this.hashtagPreferences.reset();
      return true;
    } catch (error) {
      devLogger.error(
        "[Application] Failed to reset hashtag preferences:",
        error,
      );
      const message = this.describeHashtagPreferencesError(error, {
        operation: "reset",
      });
      if (message) {
        this.showError(message);
      }
      return false;
    }
  }

  async onAccessControlUpdated() {
    if (this.profileController) {
      try {
        await this.profileController.refreshAdminPaneState();
      } catch (error) {
        devLogger.error("Failed to refresh admin pane after update:", error);
      }
    }

    this.refreshAllVideoGrids({
      reason: "access-control-update",
      forceMainReload: true,
    }).catch((error) => {
      devLogger.error("Failed to refresh video grids after admin update:", error);
    });
    window.dispatchEvent(new CustomEvent("bitvid:access-control-updated"));
  }

  async refreshAllVideoGrids({ reason, forceMainReload = false } = {}) {
    const normalizedReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : undefined;

    if (typeof moderationService?.awaitUserBlockRefresh === "function") {
      moderationService.awaitUserBlockRefresh().catch((error) => {
        const contextMessage = normalizedReason
          ? ` in background during ${normalizedReason}`
          : " in background";
        devLogger.warn(
          `Failed to sync moderation summaries${contextMessage}:`,
          error,
        );
      });
    }

    try {
      if (this.isForYouFeedActive()) {
        await this.loadForYouVideos(forceMainReload);
      } else if (this.isFeedActive("kids")) {
        await this.loadKidsVideos(forceMainReload);
      } else if (this.isFeedActive("explore")) {
        await this.loadExploreVideos(forceMainReload);
      } else {
        await this.loadVideos(forceMainReload);
      }
    } catch (error) {
      const contextMessage = normalizedReason
        ? ` after ${normalizedReason}`
        : "";
      devLogger.error(
        `Failed to refresh videos${contextMessage}:`,
        error,
      );
    }

    const refreshTasks = [];

    if (typeof subscriptions?.refreshActiveFeed === "function") {
      const subscriptionPromise = subscriptions
        .refreshActiveFeed({ reason: normalizedReason })
        .catch((error) => {
          const contextMessage = normalizedReason
            ? ` after ${normalizedReason}`
            : "";
          devLogger.warn(
            `Failed to refresh subscriptions grid${contextMessage}:`,
            error,
          );
        });
      refreshTasks.push(subscriptionPromise);
    }

    if (typeof refreshActiveChannelVideoGrid === "function") {
      try {
        const maybePromise = refreshActiveChannelVideoGrid({
          reason: normalizedReason,
        });
        if (maybePromise && typeof maybePromise.then === "function") {
          refreshTasks.push(
            maybePromise.catch((error) => {
              const contextMessage = normalizedReason
                ? ` after ${normalizedReason}`
                : "";
              devLogger.warn(
                `Failed to refresh channel grid${contextMessage}:`,
                error,
              );
            }),
          );
        }
      } catch (error) {
        const contextMessage = normalizedReason
          ? ` after ${normalizedReason}`
          : "";
        devLogger.warn(
          `Failed to trigger channel grid refresh${contextMessage}:`,
          error,
        );
      }
    }

    if (refreshTasks.length) {
      await Promise.allSettled(refreshTasks);
    }

    if (typeof this.refreshVisibleModerationUi === "function") {
      const refreshReason =
        normalizedReason || (forceMainReload ? "refresh-all-video-grids" : "refresh");
      try {
        this.refreshVisibleModerationUi({ reason: refreshReason });
      } catch (error) {
        const contextMessage = refreshReason ? ` after ${refreshReason}` : "";
        devLogger.warn(
          `[Application] Failed to refresh moderation UI${contextMessage}:`,
          error,
        );
      }
    }
  }

  async onVideosShouldRefresh({ reason } = {}) {
    try {
      await this.refreshAllVideoGrids({ reason, forceMainReload: true });
    } catch (error) {
      const context = reason ? ` after ${reason}` : "";
      devLogger.error(`Failed to refresh video grids${context}:`, error);
    }
  }

  /**
   * Setup general event listeners for logout, modals, etc.
   */
  setupEventListeners() {
    if (moderationService && typeof moderationService.on === "function") {
      moderationService.on("trusted-mutes", () => {
        if (!this.isUserLoggedIn()) {
          this.refreshAllVideoGrids({ reason: "trusted-mutes" });
        } else {
          this.refreshVisibleModerationUi({ reason: "trusted-mutes" });
        }
      });
      moderationService.on("user-blocks", () => {
        this.refreshVisibleModerationUi({ reason: "user-blocks" });
      });
      moderationService.on("summary", () => {
        this.refreshVisibleModerationUi({ reason: "moderation-summary" });
      });
    }

    if (userBlocks && typeof userBlocks.on === "function") {
      userBlocks.on(USER_BLOCK_EVENTS.STATUS, (detail) => {
        if (detail?.status === "permission-required") {
          this.capturePermissionPromptRequirement("user-blocks");
        }
      });
    }

    if (this.appChromeController) {
      this.appChromeController.initialize();
      return;
    }

    devLogger.warn(
      "[Application] AppChromeController missing; global UI events were not bound.",
    );
  }

  mountVideoListView({ container = null, includeTags = true } = {}) {
    if (!this.videoListView) {
      return null;
    }

    if (this.videoListViewController) {
      const { videoList, popularTags } = this.videoListViewController.mount({
        container,
        view: this.videoListView,
        currentVideoList: this.videoList,
        includeTags,
      });
      this.videoList = videoList || null;
      this.videoListPopularTags = popularTags || null;
      return this.videoList;
    }

    const isElement = (value) =>
      typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

    const target = container || document.getElementById("videoList");
    this.videoList = target || null;

    let tagsRoot = null;
    if (includeTags) {
      tagsRoot = document.getElementById("videoListTags");
    }
    this.videoListPopularTags = tagsRoot || null;
    if (typeof this.videoListView.setPopularTagsContainer === "function") {
      this.videoListView.setPopularTagsContainer(this.videoListPopularTags);
    }
    this.videoListView.mount(this.videoList || null);
    return this.videoList;
  }

  reinitializeVideoListView({ reason, postLoginResult } = {}) {
    if (!this.videoListView) {
      return;
    }

    if (this.videoListViewController) {
      const { videoList, popularTags } = this.videoListViewController.reinitialize({
        view: this.videoListView,
        reason,
        postLoginResult,
        currentVideoList: this.videoList,
      });
      this.videoList = videoList || null;
      this.videoListPopularTags = popularTags || null;
      return;
    }

    const isElement = (value) =>
      typeof HTMLElement !== "undefined" && value instanceof HTMLElement;

    const container = isElement(this.videoList)
      ? this.videoList
      : document.getElementById("videoList");

    try {
      this.videoListView.destroy();
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to destroy VideoListView during reinitialization:",
        error,
      );
    }

    const messageContext =
      reason === "login" && postLoginResult?.blocksLoaded === true
        ? "Applying your filters…"
        : "Refreshing videos…";

    this.videoList = isElement(container) ? container : null;
    const tagsRoot = document.getElementById("videoListTags");
    this.videoListPopularTags = isElement(tagsRoot) ? tagsRoot : null;
    if (typeof this.videoListView.setPopularTagsContainer === "function") {
      this.videoListView.setPopularTagsContainer(this.videoListPopularTags);
    }

    if (this.videoList && this.videoList.children.length === 0) {
      this.videoList.innerHTML = getSidebarLoadingMarkup(messageContext);
    }
  }

  /**
   * Attempt to load the user's own profile from Nostr (kind:0).
   */
  async loadOwnProfile(pubkey) {
    return this.authService.loadOwnProfile(pubkey);
  }

  async fetchAndRenderProfile(pubkey, forceRefresh = false) {
    return this.authService.fetchAndRenderProfile(pubkey, forceRefresh);
  }

  async batchFetchProfiles(authorSet, { forceRefresh = false } = {}) {
    return batchFetchProfilesFromRelays({
      authorSet,
      forceRefresh,
      getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
      setProfileCacheEntry: (pubkey, profile) =>
        this.setProfileCacheEntry(pubkey, profile),
      updateProfileInDOM: (pubkey, profile) =>
        this.updateProfileInDOM(pubkey, profile),
      hex64Regex: HEX64_REGEX,
    });
  }

  getDmRecipientPubkey() {
    return this.dmRecipientPubkey;
  }

  setDmRecipientPubkey(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    this.dmRecipientPubkey = normalized || null;
    return this.dmRecipientPubkey;
  }

  getDmRelayHints(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized || !(this.dmRelayHints instanceof Map)) {
      return [];
    }
    const hints = this.dmRelayHints.get(normalized);
    return Array.isArray(hints) ? hints.slice() : [];
  }

  setDmRelayHints(pubkey, hints = []) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return [];
    }
    if (!(this.dmRelayHints instanceof Map)) {
      this.dmRelayHints = new Map();
    }
    const stored = sanitizeRelayList(Array.isArray(hints) ? hints : []);
    this.dmRelayHints.set(normalized, stored);
    return stored.slice();
  }

  async publishDmRelayPreferences({ pubkey, relays } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey || this.pubkey);
    if (!normalized) {
      const error = new Error("A valid pubkey is required to publish DM relays.");
      error.code = "invalid-pubkey";
      throw error;
    }

    const relayHints = sanitizeRelayList(Array.isArray(relays) ? relays : []);
    if (!relayHints.length) {
      const error = new Error("Add at least one DM relay before publishing.");
      error.code = "empty";
      throw error;
    }

    if (!nostrClient?.pool) {
      const error = new Error(
        "Nostr is not connected yet. Please try again once relays are ready.",
      );
      error.code = "nostr-uninitialized";
      throw error;
    }

    const signer = await nostrClient.ensureActiveSignerForPubkey(normalized);
    if (!signer || typeof signer.signEvent !== "function") {
      const error = new Error(
        "An active signer with signEvent support is required to publish DM relays.",
      );
      error.code = "nostr-extension-missing";
      throw error;
    }

    if ((signer.type === "extension" || signer.type === "nip07") && nostrClient.ensureExtensionPermissions) {
      const permissionResult = await nostrClient.ensureExtensionPermissions(
        DEFAULT_NIP07_CORE_METHODS,
      );
      if (!permissionResult?.ok) {
        userLogger.warn(
          "[Application] Signer permissions denied while publishing DM relays.",
          permissionResult?.error,
        );
        const error = new Error(
          "The active signer must allow signing before publishing DM relays.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult?.error;
        throw error;
      }
    }

    const event = buildDmRelayListEvent({
      pubkey: normalized,
      created_at: Math.floor(Date.now() / 1000),
      relays: relayHints,
    });

    const signedEvent = await signer.signEvent(event);

    const relayTargets = sanitizeRelayList(
      Array.isArray(nostrClient.writeRelays) && nostrClient.writeRelays.length
        ? nostrClient.writeRelays
        : Array.isArray(nostrClient.relays)
        ? nostrClient.relays
        : [],
    );

    if (!relayTargets.length) {
      const error = new Error("No relay targets are available for publishing.");
      error.code = "no-targets";
      throw error;
    }

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      relayTargets,
      signedEvent,
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "dm relay hints update",
        message: "No relays accepted the DM relay list.",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[Application] Relay ${url} rejected DM relay list: ${reason}`,
              relayError || reason,
            );
          },
        );
      }
      throw publishError;
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[Application] Relay ${url} did not acknowledge DM relay hints: ${reason}`,
          relayError,
        );
      });
    }

    return {
      ok: true,
      event: signedEvent,
      accepted: publishSummary.accepted.map(({ url }) => url),
      failed: publishSummary.failed.map(({ url, error: relayError }) => ({
        url,
        error: relayError || null,
      })),
    };
  }

  handleProfilePublishDmRelayPreferences({ relays, pubkey } = {}) {
    return this.publishDmRelayPreferences({ relays, pubkey });
  }

  async fetchDmRelayHints(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return [];
    }

    const cached = this.getDmRelayHints(normalized);
    if (cached.length) {
      return cached;
    }

    const relayCandidates =
      Array.isArray(nostrClient?.readRelays) && nostrClient.readRelays.length
        ? nostrClient.readRelays
        : Array.isArray(nostrClient?.relays)
        ? nostrClient.relays
        : [];

    const relayList = sanitizeRelayList(relayCandidates);
    if (!relayList.length) {
      return [];
    }

    if (!nostrClient?.pool || typeof nostrClient.pool.list !== "function") {
      return [];
    }

    try {
      const events = await nostrClient.pool.list(relayList, [
        { kinds: [10050], authors: [normalized], limit: 1 },
      ]);
      const sorted = Array.isArray(events)
        ? events
            .filter((event) => event && event.pubkey === normalized)
            .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0))
        : [];
      if (!sorted.length) {
        return [];
      }

      const tags = Array.isArray(sorted[0]?.tags) ? sorted[0].tags : [];
      const relayHints = sanitizeRelayList(
        tags
          .filter((tag) => Array.isArray(tag) && tag[0] === "relay")
          .map((tag) => (typeof tag[1] === "string" ? tag[1].trim() : "")),
      );

      this.setDmRelayHints(normalized, relayHints);
      return relayHints;
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to load DM relay hints:",
        error,
      );
    }

    return [];
  }

  openDirectMessageComposer({ recipientPubkey, source = "" } = {}) {
    const normalized = this.normalizeHexPubkey(recipientPubkey);
    if (!normalized) {
      this.showError("Please select a valid message recipient.");
      return false;
    }

    this.setDmRecipientPubkey(normalized);

    if (this.profileController) {
      try {
        if (typeof this.profileController.setDirectMessageRecipient === "function") {
          this.profileController.setDirectMessageRecipient(normalized, {
            reason: source || "external",
          });
        }
        if (typeof this.profileController.show === "function") {
          this.profileController.show("messages");
        }
        if (typeof this.profileController.focusMessageComposer === "function") {
          this.profileController.focusMessageComposer();
        }
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to open DM composer:",
          error,
        );
      }
    }

    return true;
  }

  handleProfileSendDmRequest({ recipient } = {}) {
    const recipientPubkey =
      typeof recipient?.pubkey === "string"
        ? recipient.pubkey
        : null;

    return this.openDirectMessageComposer({
      recipientPubkey,
      source: "profile-modal",
    });
  }

  handleProfileUseDmRelays({ recipient, controller } = {}) {
    const relayHints = Array.isArray(recipient?.relayHints)
      ? recipient.relayHints
      : [];
    if (!relayHints.length) {
      this.showError("No DM relays found for this recipient.");
      return false;
    }

    if (recipient?.pubkey) {
      this.setDmRelayHints(recipient.pubkey, relayHints);
    }

    this.showSuccess("Recipient DM relays ready for use.");
    if (controller?.focusMessageComposer) {
      controller.focusMessageComposer();
    }
    return true;
  }

  handleProfilePrivacyToggle({ enabled, controller, recipient } = {}) {
    const relayHints = Array.isArray(recipient?.relayHints)
      ? recipient.relayHints
      : [];

    if (ENABLE_NIP17_RELAY_WARNING && enabled && !relayHints.length) {
      this.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
      );
    }

    this.showStatus(
      enabled
        ? "NIP-17 privacy delivery enabled for this recipient."
        : "Using standard DM delivery for this recipient.",
    );
  }

  updateProfileInDOM(pubkey, profile) {
    if (this.profileIdentityController) {
      this.profileIdentityController.updateProfileIdentity({
        pubkey,
        profile,
      });
    } else {
      devLogger.warn(
        "[Application] ProfileIdentityController missing; profile identity was not refreshed in the DOM.",
      );
    }

    const normalizedPubkey =
      this.normalizeHexPubkey(pubkey) ||
      (typeof pubkey === "string" ? pubkey.trim() : "");
    if (!normalizedPubkey) {
      return;
    }

    const maybeDecorateVideo = (video) => {
      if (!video || typeof video !== "object") {
        return;
      }
      const videoPubkey =
        this.normalizeHexPubkey(video.pubkey) ||
        (typeof video.pubkey === "string" ? video.pubkey.trim() : "");
      if (videoPubkey !== normalizedPubkey) {
        return;
      }
      this.decorateVideoCreatorIdentity(video);
    };

    if (this.videosMap instanceof Map) {
      for (const video of this.videosMap.values()) {
        maybeDecorateVideo(video);
      }
    }

    if (
      this.videoListView &&
      Array.isArray(this.videoListView.currentVideos)
    ) {
      this.videoListView.currentVideos.forEach((video) => {
        maybeDecorateVideo(video);
      });
    }

    if (this.currentVideo) {
      maybeDecorateVideo(this.currentVideo);
    }
  }

  async publishVideoNote(payload, { onSuccess, suppressModalClose } = {}) {
    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return false;
    }

    const { payload: publishPayload, errors } = normalizeVideoNotePayload(
      payload,
    );

    if (errors.length) {
      const message = getVideoNoteErrorMessage(errors[0]);
      this.showError(message);
      return false;
    }

    try {
      await this.nostrService.publishVideoNote(publishPayload, this.pubkey);
    } catch (err) {
      devLogger.error("Failed to publish video:", err);
      this.showError("Failed to share video. Please try again later.");
      return false;
    }

    if (typeof onSuccess === "function") {
      await onSuccess();
    }

    if (suppressModalClose !== true && this.uploadModal) {
      this.uploadModal.close();
    }

    let loadVideosError = null;

    try {
      await this.loadVideos();
    } catch (error) {
      loadVideosError = error;
      devLogger.error(
        "[Application] Failed to refresh videos after publishing:",
        error
      );
    }

    this.showSuccess("Video shared successfully!");

    if (loadVideosError) {
      this.showStatus(
        "Video shared, but the feed may be out of date. Refresh the page to see the latest posts.",
        { autoHideMs: 8000 }
      );
    }

    return true;
  }

  /**
   * Actually handle the upload form submission.
   */
  async handleUploadSubmitEvent(event) {
    if (this.uploadSubmitPromise) {
      devLogger.warn(
        "[Application] Ignoring upload submit while a publish is already in progress.",
      );
      this.showStatus(
        "Please wait for your current video to finish publishing before sharing another.",
        { autoHideMs: 6000, showSpinner: false },
      );
      if (this.uploadModal?.updateCustomSubmitButtonState) {
        this.uploadModal.updateCustomSubmitButtonState();
      }
      return;
    }

    const payload = event?.detail?.payload || {};

    const submitPromise = (async () => {
      try {
        const publishResult = await this.authService.handleUploadSubmit(payload, {
          publish: (data) =>
            this.publishVideoNote(data, {
              onSuccess: () => {
                if (this.uploadModal?.resetCustomForm) {
                  this.uploadModal.resetCustomForm();
                }
              },
            }),
        });
        if (!publishResult && this.uploadModal?.cancelCustomSubmitCooldown) {
          this.uploadModal.cancelCustomSubmitCooldown();
        }
      } catch (error) {
        if (this.uploadModal?.cancelCustomSubmitCooldown) {
          this.uploadModal.cancelCustomSubmitCooldown();
        }
        const message = this.describeLoginError(
          error,
          "Login required to publish videos.",
        );
        this.showError(message);
      }
    })();

    this.uploadSubmitPromise = submitPromise;

    try {
      await submitPromise;
    } finally {
      if (this.uploadSubmitPromise === submitPromise) {
        this.uploadSubmitPromise = null;
      }
    }
  }

  async handleProfileSwitchRequest(...args) {
    this._initCoordinators();
    return this._auth.handleProfileSwitchRequest(...args);
  }

  async waitForIdentityRefresh(...args) {
    this._initCoordinators();
    return this._auth.waitForIdentityRefresh(...args);
  }

  async handleProfileLogoutRequest(...args) {
    this._initCoordinators();
    return this._auth.handleProfileLogoutRequest(...args);
  }

  async handleProfileRelayOperation(...args) {
    this._initCoordinators();
    return this._auth.handleProfileRelayOperation(...args);
  }

  handleProfileRelayModeToggle(...args) {
    this._initCoordinators();
    return this._auth.handleProfileRelayModeToggle(...args);
  }

  handleProfileRelayRestore(...args) {
    this._initCoordinators();
    return this._auth.handleProfileRelayRestore(...args);
  }

  async handleProfileBlocklistMutation(...args) {
    this._initCoordinators();
    return this._auth.handleProfileBlocklistMutation(...args);
  }

  async handleProfileAdminMutation(...args) {
    this._initCoordinators();
    return this._auth.handleProfileAdminMutation(...args);
  }

  async handleProfileWalletPersist(...args) {
    this._initCoordinators();
    return this._auth.handleProfileWalletPersist(...args);
  }

  async handleProfileWalletTest(...args) {
    this._initCoordinators();
    return this._auth.handleProfileWalletTest(...args);
  }

  async handleProfileWalletDisconnect(...args) {
    this._initCoordinators();
    return this._auth.handleProfileWalletDisconnect(...args);
  }

  handleProfileAdminNotifyError(...args) {
    this._initCoordinators();
    return this._auth.handleProfileAdminNotifyError(...args);
  }

  handleProfileHistoryEvent(...args) {
    this._initCoordinators();
    return this._auth.handleProfileHistoryEvent(...args);
  }

  async handleModerationSettingsChange(...args) {
    this._initCoordinators();
    return this._moderation.handleModerationSettingsChange(...args);
  }

  refreshVisibleModerationUi(...args) {
    this._initCoordinators();
    return this._moderation.refreshVisibleModerationUi(...args);
  }

  updateActiveProfileUI(...args) {
    this._initCoordinators();
    return this._ui.updateActiveProfileUI(...args);
  }

  async hydrateNwcSettingsForPubkey(pubkey) {
    return this.nwcSettingsService.hydrateNwcSettingsForPubkey(pubkey);
  }

  getActiveNwcSettings() {
    return this.nwcSettingsService.getActiveNwcSettings();
  }

  hasActiveWalletConnection() {
    return this.nwcSettingsService.hasActiveWalletConnection();
  }

  validateWalletUri(uri, options) {
    return this.nwcSettingsService.validateWalletUri(uri, options);
  }

  isUserLoggedIn() {
    const normalizedPubkey = this.normalizeHexPubkey(this.pubkey);
    if (!normalizedPubkey) {
      return false;
    }

    const clientPubkey = this.normalizeHexPubkey(nostrClient?.pubkey);
    if (clientPubkey && clientPubkey !== normalizedPubkey) {
      return false;
    }

    const sessionActor = nostrClient?.sessionActor || null;
    const sessionActorPubkey = this.normalizeHexPubkey(sessionActor?.pubkey);
    if (sessionActorPubkey && sessionActorPubkey !== normalizedPubkey) {
      const rawPrivateKey =
        typeof sessionActor?.privateKey === "string"
          ? sessionActor.privateKey.trim()
          : "";
      const hasEmbeddedPrivateKey =
        rawPrivateKey.length > 0 && HEX64_REGEX.test(rawPrivateKey);

      const declaredSource =
        typeof sessionActor?.source === "string"
          ? sessionActor.source.trim()
          : "";
      const isPersisted = sessionActor?.persisted === true;

      if (!hasEmbeddedPrivateKey || declaredSource || isPersisted) {
        return false;
      }
    }

    return true;
  }

  updateShareNostrAuthState({ reason = "" } = {}) {
    if (!this.videoModal?.setShareNostrAuthState) {
      return;
    }

    const isLoggedIn = this.isUserLoggedIn();
    const hasSigner = Boolean(getActiveSigner());

    this.videoModal.setShareNostrAuthState({
      isLoggedIn,
      hasSigner,
      reason,
    });
  }

  async updateActiveNwcSettings(partial = {}) {
    return this.nwcSettingsService.updateActiveNwcSettings(partial);
  }

  async ensureWallet({ nwcUri, defaultZap } = {}) {
    return this.nwcSettingsService.ensureWallet({ nwcUri, defaultZap });
  }

  async clearStoredNwcSettings(pubkey, options = {}) {
    return this.nwcSettingsService.clearStoredNwcSettings(pubkey, options);
  }

  applyAuthenticatedUiState(...args) {
    this._initCoordinators();
    return this._ui.applyAuthenticatedUiState(...args);
  }

  applyLoggedOutUiState(...args) {
    this._initCoordinators();
    return this._ui.applyLoggedOutUiState(...args);
  }

  syncAuthUiState(...args) {
    this._initCoordinators();
    return this._ui.syncAuthUiState(...args);
  }

  refreshChromeElements(...args) {
    this._initCoordinators();
    return this._ui.refreshChromeElements(...args);
  }

  resolveSubscriptionsLink(...args) {
    this._initCoordinators();
    return this._ui.resolveSubscriptionsLink(...args);
  }

  resolveForYouLink(...args) {
    this._initCoordinators();
    return this._ui.resolveForYouLink(...args);
  }

  resolveExploreLink(...args) {
    this._initCoordinators();
    return this._ui.resolveExploreLink(...args);
  }

  hydrateSidebarNavigation(...args) {
    this._initCoordinators();
    return this._ui.hydrateSidebarNavigation(...args);
  }

  maybeShowExperimentalLoginWarning(...args) {
    this._initCoordinators();
    return this._ui.maybeShowExperimentalLoginWarning(...args);
  }

  async handlePermissionPromptRequest() {
    if (this.permissionPromptInFlight) {
      return;
    }

    const activePubkey = this.normalizeHexPubkey(this.pubkey);
    if (!activePubkey) {
      return;
    }

    const needsSubscriptions = this.permissionPromptPending.has("subscriptions");
    const needsHashtags = this.permissionPromptPending.has("hashtag-preferences");
    const needsBlocks = this.permissionPromptPending.has("user-blocks");

    if (!needsSubscriptions && !needsHashtags && !needsBlocks) {
      return;
    }

    this.permissionPromptInFlight = true;
    this.updatePermissionPromptCta();

    const tasks = [];

    if (needsSubscriptions && subscriptions?.ensureLoaded) {
      const subscriptionTask = subscriptions
        .ensureLoaded(activePubkey, { allowPermissionPrompt: true })
        .then(() => {
          this.capturePermissionPromptFromError(subscriptions?.lastLoadError);
          if (
            subscriptions?.lastLoadError?.code !==
            "subscriptions-permission-required"
          ) {
            this.permissionPromptPending.delete("subscriptions");
            if (this.profileController) {
              this.profileController.populateSubscriptionsList();
            }
            if (typeof subscriptions?.refreshActiveFeed === "function") {
              return subscriptions.refreshActiveFeed({
                reason: "permission-prompt",
              });
            }
          }
          return null;
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to refresh subscriptions after permission prompt:",
            error,
          );
          this.capturePermissionPromptFromError(error);
        });
      tasks.push(subscriptionTask);
    }

    if (needsBlocks && userBlocks?.loadBlocks) {
      let permissionRequired = false;
      const blocksTask = userBlocks
        .loadBlocks(activePubkey, {
          allowPermissionPrompt: true,
          statusCallback: (detail) => {
            if (detail?.status === "permission-required") {
              permissionRequired = true;
            }
          },
        })
        .then(() => {
          if (!permissionRequired) {
            this.permissionPromptPending.delete("user-blocks");
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to refresh block list after permission prompt:",
            error,
          );
          this.capturePermissionPromptFromError(error);
        });
      tasks.push(blocksTask);
    }

    if (needsHashtags && this.hashtagPreferences?.load) {
      const hashtagTask = this.hashtagPreferences
        .load(activePubkey, { allowPermissionPrompt: true })
        .then(() => {
          this.capturePermissionPromptFromError(
            this.hashtagPreferences?.lastLoadError,
          );
          if (
            this.hashtagPreferences?.lastLoadError?.code !==
            "hashtag-preferences-permission-required"
          ) {
            this.permissionPromptPending.delete("hashtag-preferences");
            this.updateCachedHashtagPreferences();
            this.refreshTagPreferenceUi();
            if (this.profileController) {
              this.profileController.populateHashtagPreferences();
            }
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to refresh hashtag preferences after permission prompt:",
            error,
          );
          this.capturePermissionPromptFromError(error);
        });
      tasks.push(hashtagTask);
    }

    await Promise.allSettled(tasks);

    if (this.permissionPromptPending.size === 0) {
      this.permissionPromptVisible = false;
    }

    this.permissionPromptInFlight = false;
    this.updatePermissionPromptCta();
  }

  async handleAuthSyncRetryRequest() {
    const activePubkey = this.normalizeHexPubkey(this.pubkey);
    if (!activePubkey) {
      return;
    }

    this.updateAuthLoadingState({ lists: "loading" });

    const taskResults = await Promise.allSettled([
      Promise.resolve()
        .then(() => this.authService?.loadBlocksForPubkey?.(activePubkey, {
          allowPermissionPrompt: true,
        }))
        .then((loaded) => ({ name: "blocks", ok: loaded !== false }))
        .catch((error) => ({ name: "blocks", ok: false, error })),
      Promise.resolve()
        .then(() => subscriptions?.ensureLoaded?.(activePubkey, {
          allowPermissionPrompt: true,
        }))
        .then(() => ({
          name: "subscriptions",
          ok: !subscriptions?.lastLoadError,
          error: subscriptions?.lastLoadError || null,
        }))
        .catch((error) => ({ name: "subscriptions", ok: false, error })),
      Promise.resolve()
        .then(() => this.hashtagPreferences?.load?.(activePubkey, {
          allowPermissionPrompt: true,
        }))
        .then(() => {
          const error = this.hashtagPreferences?.lastLoadError || null;
          if (!error) {
            this.updateCachedHashtagPreferences();
          }
          return {
            name: "hashtags",
            ok: !error,
            error,
          };
        })
        .catch((error) => ({ name: "hashtags", ok: false, error })),
    ]);

    const tasks = taskResults.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : {
            name: "unknown",
            ok: false,
            error: result.reason || null,
          },
    );
    const hasFailure = tasks.some((task) => !task.ok);

    this.updateAuthLoadingState({
      lists: hasFailure ? "error" : "ready",
      listsDetail: {
        ready: !hasFailure,
        degraded: hasFailure,
        error: hasFailure,
        retryScheduled: false,
        retryCompleted: true,
        tasks: tasks.map((task) => ({
          name: task.name,
          ok: task.ok,
          fromCache: false,
          error: task.error || null,
        })),
      },
    });

    this.dispatchAuthChange({
      status: "auth-sync-retry",
      loggedIn: true,
      pubkey: activePubkey,
      authLoadingState: this.authLoadingState,
    });

    if (this.profileController) {
      this.profileController.populateBlockedList();
      void this.profileController.populateSubscriptionsList();
      this.profileController.populateHashtagPreferences();
    }

    if (!hasFailure) {
      await this.onVideosShouldRefresh({ reason: "auth-sync-retry-success" });
    }
  }

  async handleAuthLogin(...args) {
    this._initCoordinators();
    return this._auth.handleAuthLogin(...args);
  }

  handleBlocksLoaded(...args) {
    this._initCoordinators();
    return this._auth.handleBlocksLoaded(...args);
  }

  handleRelaysLoaded(...args) {
    this._initCoordinators();
    return this._auth.handleRelaysLoaded(...args);
  }

  scheduleRelayUiRefresh(...args) {
    this._initCoordinators();
    return this._auth.scheduleRelayUiRefresh(...args);
  }

  flushRelayUiRefresh(...args) {
    this._initCoordinators();
    return this._auth.flushRelayUiRefresh(...args);
  }

  async requestLogout(...args) {
    this._initCoordinators();
    return this._auth.requestLogout(...args);
  }

  async handleAuthLogout(...args) {
    this._initCoordinators();
    return this._auth.handleAuthLogout(...args);
  }

  handleProfileUpdated(...args) {
    this._initCoordinators();
    return this._auth.handleProfileUpdated(...args);
  }

  /**
   * Cleanup resources on unload or modal close.
   *
   * When `preserveModals` is true the modal infrastructure is kept alive so the
   * next playback session can reuse the existing controllers without
   * reinitializing DOM bindings.
   */
  async cleanup(...args) {
    this._initCoordinators();
    return this._auth.cleanup(...args);
  }

  async waitForCleanup(...args) {
    this._initCoordinators();
    return this._auth.waitForCleanup(...args);
  }

  clearActiveIntervals(...args) {
    this._initCoordinators();
    return this._auth.clearActiveIntervals(...args);
  }

  cacheTorrentStatusNodes(...args) {
    this._initCoordinators();
    return this._auth.cacheTorrentStatusNodes(...args);
  }

  clearTorrentStatusNodes(...args) {
    this._initCoordinators();
    return this._auth.clearTorrentStatusNodes(...args);
  }

  removeActiveInterval(...args) {
    this._initCoordinators();
    return this._auth.removeActiveInterval(...args);
  }

  addTorrentStatusVisibilityHandlers(...args) {
    this._initCoordinators();
    return this._auth.addTorrentStatusVisibilityHandlers(...args);
  }

  removeTorrentStatusVisibilityHandlers(...args) {
    this._initCoordinators();
    return this._auth.removeTorrentStatusVisibilityHandlers(...args);
  }

  cancelPendingViewLogging(...args) {
    this._initCoordinators();
    return this._modal.cancelPendingViewLogging(...args);
  }

  resetViewLoggingState(...args) {
    this._initCoordinators();
    return this._modal.resetViewLoggingState(...args);
  }

  persistWatchHistoryMetadataForVideo(...args) {
    this._initCoordinators();
    return this._modal.persistWatchHistoryMetadataForVideo(...args);
  }

  dropWatchHistoryMetadata(...args) {
    this._initCoordinators();
    return this._modal.dropWatchHistoryMetadata(...args);
  }

  async handleRemoveHistoryAction(...args) {
    this._initCoordinators();
    return this._modal.handleRemoveHistoryAction(...args);
  }

  async handleWatchHistoryRemoval(...args) {
    this._initCoordinators();
    return this._modal.handleWatchHistoryRemoval(...args);
  }

  flushWatchHistory(...args) {
    this._initCoordinators();
    return this._modal.flushWatchHistory(...args);
  }

  getActiveViewIdentityKey(...args) {
    this._initCoordinators();
    return this._modal.getActiveViewIdentityKey(...args);
  }

  deriveViewIdentityKeyFromEvent(...args) {
    this._initCoordinators();
    return this._modal.deriveViewIdentityKeyFromEvent(...args);
  }

  buildViewCooldownKey(...args) {
    this._initCoordinators();
    return this._modal.buildViewCooldownKey(...args);
  }

  preparePlaybackLogging(...args) {
    this._initCoordinators();
    return this._modal.preparePlaybackLogging(...args);
  }

  teardownVideoElement(...args) {
    this._initCoordinators();
    return this._modal.teardownVideoElement(...args);
  }

  resetTorrentStats(...args) {
    this._initCoordinators();
    return this._modal.resetTorrentStats(...args);
  }


  setShareButtonState(...args) {
    this._initCoordinators();
    return this._modal.setShareButtonState(...args);
  }

  getShareUrlBase(...args) {
    this._initCoordinators();
    return this._modal.getShareUrlBase(...args);
  }

  shouldDeferModeratedPlayback(...args) {
    this._initCoordinators();
    return this._playback.shouldDeferModeratedPlayback(...args);
  }

  resumePendingModeratedPlayback(...args) {
    this._initCoordinators();
    return this._playback.resumePendingModeratedPlayback(...args);
  }

  buildShareUrlFromNevent(...args) {
    this._initCoordinators();
    return this._playback.buildShareUrlFromNevent(...args);
  }

  buildShareUrlFromEventId(...args) {
    this._initCoordinators();
    return this._playback.buildShareUrlFromEventId(...args);
  }

  dedupeVideosByRoot(...args) {
    this._initCoordinators();
    return this._playback.dedupeVideosByRoot(...args);
  }

  autoplayModalVideo(...args) {
    this._initCoordinators();
    return this._playback.autoplayModalVideo(...args);
  }

  startTorrentStatusMirrors(...args) {
    this._initCoordinators();
    return this._playback.startTorrentStatusMirrors(...args);
  }

  startTorrentStatusInterval(...args) {
    this._initCoordinators();
    return this._playback.startTorrentStatusInterval(...args);
  }

  stopTorrentStatusInterval(...args) {
    this._initCoordinators();
    return this._playback.stopTorrentStatusInterval(...args);
  }

  /**
   * Hide the video modal.
   */
  async hideModal(...args) {
    this._initCoordinators();
    return this._modal.hideModal(...args);
  }

  /**
   * Register the default "recent" feed pipeline.
   */
  registerRecentFeed(...args) {
    this._initCoordinators();
    return this._feed.registerRecentFeed(...args);
  }

  /**
   * Register the "for-you" feed pipeline.
   */
  registerForYouFeed(...args) {
    this._initCoordinators();
    return this._feed.registerForYouFeed(...args);
  }

  /**
   * Register the "kids" feed pipeline.
   */
  registerKidsFeed(...args) {
    this._initCoordinators();
    return this._feed.registerKidsFeed(...args);
  }

  /**
   * Register the "explore" feed pipeline.
   */
  registerExploreFeed(...args) {
    this._initCoordinators();
    return this._feed.registerExploreFeed(...args);
  }

  registerSubscriptionsFeed(...args) {
    this._initCoordinators();
    return this._feed.registerSubscriptionsFeed(...args);
  }

  registerWatchHistoryFeed(...args) {
    this._initCoordinators();
    return this._feed.registerWatchHistoryFeed(...args);
  }

  buildForYouFeedRuntime(...args) {
    this._initCoordinators();
    return this._feed.buildForYouFeedRuntime(...args);
  }

  buildExploreFeedRuntime(...args) {
    this._initCoordinators();
    return this._feed.buildExploreFeedRuntime(...args);
  }

  buildRecentFeedRuntime(...args) {
    this._initCoordinators();
    return this._feed.buildRecentFeedRuntime(...args);
  }

  buildKidsFeedRuntime(...args) {
    this._initCoordinators();
    return this._feed.buildKidsFeedRuntime(...args);
  }

  async refreshForYouFeed(...args) {
    this._initCoordinators();
    return this._feed.refreshFeed(FEED_TYPES.FOR_YOU, ...args);
  }

  refreshKidsFeed(...args) {
    this._initCoordinators();
    return this._feed.refreshFeed(FEED_TYPES.KIDS, ...args);
  }

  refreshExploreFeed(...args) {
    this._initCoordinators();
    return this._feed.refreshFeed(FEED_TYPES.EXPLORE, ...args);
  }

  refreshRecentFeed(...args) {
    this._initCoordinators();
    return this._feed.refreshFeed("recent", ...args);
  }

  async refreshFeed(...args) {
    this._initCoordinators();
    return this._feed.refreshFeed(...args);
  }

  checkRelayHealthWarning(...args) {
    this._initCoordinators();
    return this._feed.checkRelayHealthWarning(...args);
  }

  async loadFeedVideos(...args) {
    this._initCoordinators();
    return this._feed.loadFeedVideos(...args);
  }

  /**
   * Subscribe to videos (older + new) and render them as they come in.
   */
  async loadVideos(...args) {
    this._initCoordinators();
    return this._feed.loadVideos(...args);
  }

  async loadForYouVideos(...args) {
    this._initCoordinators();
    return this._feed.loadForYouVideos(...args);
  }

  async loadKidsVideos(...args) {
    this._initCoordinators();
    return this._feed.loadKidsVideos(...args);
  }

  async loadExploreVideos(...args) {
    this._initCoordinators();
    return this._feed.loadExploreVideos(...args);
  }

  async loadOlderVideos(...args) {
    this._initCoordinators();
    return this._feed.loadOlderVideos(...args);
  }

  /**
   * Returns true if there's at least one strictly older version
   * (same videoRootId, created_at < current) which is NOT deleted.
   */
  hasOlderVersion(...args) {
    this._initCoordinators();
    return this._feed.hasOlderVersion(...args);
  }

  /**
   * Centralised helper for other modules (channel profiles, subscriptions)
   * so they can re-use the exact same badge skeleton. Keeping the markup in
   * one place avoids subtle mismatches when we tweak copy or classes later.
   */
  getUrlHealthPlaceholderMarkup(...args) {
    this._initCoordinators();
    return this._feed.getUrlHealthPlaceholderMarkup(...args);
  }

  getTorrentHealthBadgeMarkup(...args) {
    this._initCoordinators();
    return this._feed.getTorrentHealthBadgeMarkup(...args);
  }

  isMagnetUriSupported(...args) {
    this._initCoordinators();
    return this._feed.isMagnetUriSupported(...args);
  }

  getCachedUrlHealth(...args) {
    this._initCoordinators();
    return this._feed.getCachedUrlHealth(...args);
  }

  storeUrlHealth(...args) {
    this._initCoordinators();
    return this._feed.storeUrlHealth(...args);
  }

  updateUrlHealthBadge(...args) {
    this._initCoordinators();
    return this._feed.updateUrlHealthBadge(...args);
  }

  handleUrlHealthBadge(...args) {
    this._initCoordinators();
    return this._feed.handleUrlHealthBadge(...args);
  }

  handleStreamHealthBadgeUpdate(...args) {
    this._initCoordinators();
    return this._feed.handleStreamHealthBadgeUpdate(...args);
  }

  getFeedTelemetryState(...args) {
    this._initCoordinators();
    return this._feed.getFeedTelemetryState(...args);
  }

  setFeedTelemetryContext(...args) {
    this._initCoordinators();
    return this._feed.setFeedTelemetryContext(...args);
  }

  isFeedActive(...args) {
    this._initCoordinators();
    return this._feed.isFeedActive(...args);
  }

  isForYouFeedActive(...args) {
    this._initCoordinators();
    return this._feed.isForYouFeedActive(...args);
  }

  updateFeedTelemetryMetadata(...args) {
    this._initCoordinators();
    return this._feed.updateFeedTelemetryMetadata(...args);
  }

  updateForYouTelemetryMetadata(...args) {
    this._initCoordinators();
    return this._feed.updateForYouTelemetryMetadata(...args);
  }

  resolveVideoForTelemetry(...args) {
    this._initCoordinators();
    return this._feed.resolveVideoForTelemetry(...args);
  }

  resolveVideoIndex(...args) {
    this._initCoordinators();
    return this._feed.resolveVideoIndex(...args);
  }

  buildModerationTelemetry(...args) {
    this._initCoordinators();
    return this._feed.buildModerationTelemetry(...args);
  }

  buildFeedTelemetryPayload(...args) {
    this._initCoordinators();
    return this._feed.buildFeedTelemetryPayload(...args);
  }

  buildForYouTelemetryPayload(...args) {
    this._initCoordinators();
    return this._feed.buildForYouTelemetryPayload(...args);
  }

  emitTelemetryEvent(...args) {
    this._initCoordinators();
    return this._feed.emitTelemetryEvent(...args);
  }

  resolveFeedTelemetryEventName(...args) {
    this._initCoordinators();
    return this._feed.resolveFeedTelemetryEventName(...args);
  }

  emitFeedTelemetryEvent(...args) {
    this._initCoordinators();
    return this._feed.emitFeedTelemetryEvent(...args);
  }

  emitForYouTelemetryEvent(...args) {
    this._initCoordinators();
    return this._feed.emitForYouTelemetryEvent(...args);
  }

  emitFeedImpressions(...args) {
    this._initCoordinators();
    return this._feed.emitFeedImpressions(...args);
  }

  emitForYouImpressions(...args) {
    this._initCoordinators();
    return this._feed.emitForYouImpressions(...args);
  }

  recordFeedClick(...args) {
    this._initCoordinators();
    return this._feed.recordFeedClick(...args);
  }

  recordForYouClick(...args) {
    this._initCoordinators();
    return this._feed.recordForYouClick(...args);
  }

  handleFeedViewTelemetry(...args) {
    this._initCoordinators();
    return this._feed.handleFeedViewTelemetry(...args);
  }

  async renderVideoList(...args) {
    this._initCoordinators();
    return this._feed.renderVideoList(...args);
  }

  refreshVideoDiscussionCounts(...args) {
    this._initCoordinators();
    return this._feed.refreshVideoDiscussionCounts(...args);
  }

  deriveModerationReportType(...args) {
    this._initCoordinators();
    return this._moderation.deriveModerationReportType(...args);
  }

  deriveModerationTrustedCount(...args) {
    this._initCoordinators();
    return this._moderation.deriveModerationTrustedCount(...args);
  }

  getReporterDisplayName(...args) {
    this._initCoordinators();
    return this._moderation.getReporterDisplayName(...args);
  }

  normalizeModerationSettings(...args) {
    this._initCoordinators();
    return this._moderation.normalizeModerationSettings(...args);
  }

  getActiveModerationThresholds(...args) {
    this._initCoordinators();
    return this._moderation.getActiveModerationThresholds(...args);
  }

  decorateVideoModeration(...args) {
    this._initCoordinators();
    return this._moderation.decorateVideoModeration(...args);
  }

  initializeModerationActionController(...args) {
    this._initCoordinators();
    return this._moderation.initializeModerationActionController(...args);
  }

  refreshCardModerationUi(...args) {
    this._initCoordinators();
    return this._moderation.refreshCardModerationUi(...args);
  }

  dispatchModerationEvent(...args) {
    this._initCoordinators();
    return this._moderation.dispatchModerationEvent(...args);
  }

  handleModerationOverride(...args) {
    this._initCoordinators();
    return this._moderation.handleModerationOverride(...args);
  }

  async handleModerationBlock(...args) {
    this._initCoordinators();
    return this._moderation.handleModerationBlock(...args);
  }

  handleModerationHide(...args) {
    this._initCoordinators();
    return this._moderation.handleModerationHide(...args);
  }

  getVideoAddressPointer(...args) {
    this._initCoordinators();
    return this._moderation.getVideoAddressPointer(...args);
  }

  bindThumbnailFallbacks(container) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return;
    }

    const thumbnails = container.querySelectorAll("[data-video-thumbnail]");
    thumbnails.forEach((img) => {
      if (!img) {
        return;
      }

      const ensureFallbackSource = () => {
        let fallbackSrc = "";
        if (typeof img.dataset.fallbackSrc === "string") {
          fallbackSrc = img.dataset.fallbackSrc.trim();
        }

        if (!fallbackSrc) {
          const attr = img.getAttribute("data-fallback-src") || "";
          fallbackSrc = attr.trim();
        }

        if (!fallbackSrc && img.tagName === "IMG") {
          fallbackSrc = FALLBACK_THUMBNAIL_SRC;
        }

        if (fallbackSrc) {
          if (img.dataset.fallbackSrc !== fallbackSrc) {
            img.dataset.fallbackSrc = fallbackSrc;
          }
          if (!img.getAttribute("data-fallback-src")) {
            img.setAttribute("data-fallback-src", fallbackSrc);
          }
        }

        return fallbackSrc;
      };

      const applyFallback = () => {
        const fallbackSrc = ensureFallbackSource() || FALLBACK_THUMBNAIL_SRC;
        if (!fallbackSrc) {
          return;
        }

        if (img.src !== fallbackSrc) {
          img.src = fallbackSrc;
        }

        img.dataset.thumbnailFailed = "true";
      };

      const handleLoad = () => {
        if (
          (img.naturalWidth === 0 && img.naturalHeight === 0) ||
          !img.currentSrc
        ) {
          applyFallback();
        } else {
          delete img.dataset.thumbnailFailed;
        }
      };

      ensureFallbackSource();

      if (img.dataset.thumbnailFallbackBound === "true") {
        if (img.complete) {
          handleLoad();
        }
        return;
      }

      img.addEventListener("error", applyFallback);
      img.addEventListener("load", handleLoad);

      img.dataset.thumbnailFallbackBound = "true";

      if (img.complete) {
        handleLoad();
      }
    });
  }

  ensureGlobalMoreMenuHandlers() {
    if (this.moreMenuController) {
      this.moreMenuController.ensureGlobalMoreMenuHandlers();
    }
  }

  closeAllMoreMenus(options = {}) {
    if (this.moreMenuController) {
      this.moreMenuController.closeAllMoreMenus(options);
    }

    this.closeVideoSettingsMenu({ restoreFocus: options?.restoreFocus !== false });
    this.tagPreferenceMenuController.closeMenus({
      restoreFocus: options?.restoreFocus !== false,
    });
  }

  attachMoreMenuHandlers(container) {
    if (this.moreMenuController) {
      this.moreMenuController.attachMoreMenuHandlers(container);
    }
  }

  requestMoreMenu(detail = {}) {
    if (!this.moreMenuController) {
      return;
    }

    const trigger = detail.trigger || null;
    if (!trigger) {
      return;
    }

    const capabilities = detail.capabilities || {};
    const canManage =
      typeof capabilities.canManageBlacklist === "boolean"
        ? capabilities.canManageBlacklist
        : this.canCurrentUserManageBlacklist();

    this.moreMenuController.toggleMoreMenu({
      trigger,
      video: detail.video || null,
      pointerInfo: detail.pointerInfo || null,
      playbackUrl: detail.playbackUrl || "",
      playbackMagnet: detail.playbackMagnet || "",
      context: detail.context || "card",
      canManageBlacklist: canManage,
      designSystem: detail.designSystem || this.designSystemContext,
      onAction: detail.onAction || null,
      onClose: detail.onClose || null,
      restoreFocusOnClose: detail.restoreFocus !== false,
    });
  }

  closeMoreMenu(detail = {}) {
    if (!this.moreMenuController) {
      return false;
    }

    const trigger = detail.trigger || null;
    if (trigger) {
      return this.moreMenuController.closePopoverForTrigger(trigger, {
        restoreFocus: detail.restoreFocus !== false,
      });
    }

    this.moreMenuController.closeAllMoreMenus({
      restoreFocus: detail.restoreFocus !== false,
      skipView: detail.skipView === true,
    });
    return true;
  }

  requestVideoSettingsMenu(detail = {}) {
    if (this.videoSettingsMenuController) {
      this.videoSettingsMenuController.requestMenu(detail);
    }
  }

  closeVideoSettingsMenu(detail = {}) {
    if (this.videoSettingsMenuController) {
      return this.videoSettingsMenuController.closeMenu(detail);
    }
    return false;
  }

  ensureTagPreferencePopover(detail) {
    return this.tagPreferenceMenuController.ensurePopover(detail);
  }

  requestTagPreferenceMenu(detail) {
    return this.tagPreferenceMenuController.requestMenu(detail);
  }

  closeTagPreferenceMenus(detail) {
    return this.tagPreferenceMenuController.closeMenus(detail);
  }

  handleTagPreferenceActivation(detail = {}) {
    this.tagPreferenceMenuController.handleActivation(detail);
  }

  syncModalMoreMenuData() {
    if (this.moreMenuController) {
      this.moreMenuController.syncModalMoreMenuData();
    }
  }

  async handleMoreMenuAction(action, dataset = {}) {
    if (!this.moreMenuController) {
      return;
    }

    return this.moreMenuController.handleMoreMenuAction(action, dataset);
  }

  async handleRepostAction(dataset = {}) {
    if (this.engagementController) {
      return this.engagementController.handleRepostAction(dataset);
    }
  }

  async handleMirrorAction(dataset = {}) {
    if (this.engagementController) {
      return this.engagementController.handleMirrorAction(dataset);
    }
  }

  async handleEnsurePresenceAction(dataset = {}) {
    if (this.engagementController) {
      return this.engagementController.handleEnsurePresenceAction(dataset);
    }
  }

  /**
   * Updates the modal to reflect current torrent stats.
   * We remove the unused torrent.status references,
   * and do not re-trigger recursion here (no setTimeout).
   */
  updateTorrentStatus(torrent) {
    if (this.torrentStatusController) {
      this.torrentStatusController.update(torrent);
    }
  }

  normalizeActionTarget(target) {
    const isElement = (value) =>
      typeof Element !== "undefined" && value instanceof Element;
    let triggerElement = null;
    let providedVideo = null;
    if (target && typeof target === "object") {
      let eventId =
        typeof target.eventId === "string" ? target.eventId.trim() : "";
      let index = null;
      if (typeof target.index === "number" && Number.isInteger(target.index)) {
        index = target.index;
      } else if (
        typeof target.index === "string" && target.index.trim().length > 0
      ) {
        const parsed = Number.parseInt(target.index.trim(), 10);
        index = Number.isNaN(parsed) ? null : parsed;
      }
      const targetVideo = target.video;
      if (targetVideo && typeof targetVideo === "object") {
        const candidateId =
          typeof targetVideo.id === "string" ? targetVideo.id.trim() : "";
        if (candidateId) {
          providedVideo = targetVideo;
          if (!eventId) {
            eventId = candidateId;
          }
        }
      }
      if (isElement(target.triggerElement)) {
        triggerElement = target.triggerElement;
      } else if (isElement(target.trigger)) {
        triggerElement = target.trigger;
      }
      return { eventId, index, triggerElement, video: providedVideo };
    }

    if (typeof target === "string") {
      const trimmed = target.trim();
      if (!trimmed) {
        return { eventId: "", index: null, triggerElement, video: null };
      }
      if (/^-?\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        return {
          eventId: "",
          index: Number.isNaN(parsed) ? null : parsed,
          triggerElement,
          video: null,
        };
      }
      return { eventId: trimmed, index: null, triggerElement, video: null };
    }

    if (typeof target === "number" && Number.isInteger(target)) {
      return { eventId: "", index: target, triggerElement, video: null };
    }

    return { eventId: "", index: null, triggerElement, video: null };
  }

  async resolveVideoActionTarget({
    eventId = "",
    index = null,
    preloadedList,
    video: providedVideo = null,
  } = {}) {
    const trimmedEventId = typeof eventId === "string" ? eventId.trim() : "";
    const normalizedIndex =
      typeof index === "number" && Number.isInteger(index) && index >= 0
        ? index
        : null;

    const ensureCreatorIdentity = (video) => {
      if (
        !video ||
        typeof video !== "object" ||
        typeof this.decorateVideoCreatorIdentity !== "function"
      ) {
        return video;
      }
      try {
        const decorated = this.decorateVideoCreatorIdentity(video);
        return decorated && typeof decorated === "object" ? decorated : video;
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to decorate video identity for action target:",
          error,
        );
        return video;
      }
    };

    const initialVideo =
      providedVideo && typeof providedVideo === "object" ? providedVideo : null;
    const preparedInitialVideo = ensureCreatorIdentity(initialVideo);
    const providedId =
      preparedInitialVideo && typeof preparedInitialVideo.id === "string"
        ? preparedInitialVideo.id.trim()
        : "";
    const targetEventId = trimmedEventId || providedId;

    const candidateLists = Array.isArray(preloadedList)
      ? [preloadedList]
      : [];

    if (providedId) {
      this.videosMap.set(providedId, preparedInitialVideo);
      if (!trimmedEventId || providedId === trimmedEventId) {
        return preparedInitialVideo;
      }
    }

    for (const list of candidateLists) {
      if (targetEventId) {
        const match = list.find((video) => video?.id === targetEventId);
        if (match) {
          const preparedMatch = ensureCreatorIdentity(match);
          this.videosMap.set(preparedMatch.id, preparedMatch);
          return preparedMatch;
        }
      }
      if (
        normalizedIndex !== null &&
        normalizedIndex >= 0 &&
        normalizedIndex < list.length
      ) {
        const match = list[normalizedIndex];
        if (match) {
          const preparedMatch = ensureCreatorIdentity(match);
          this.videosMap.set(preparedMatch.id, preparedMatch);
          return preparedMatch;
        }
      }
    }

    if (targetEventId) {
      const fromMap = this.videosMap.get(targetEventId);
      if (fromMap) {
        return fromMap;
      }

      const activeVideos = nostrClient.getActiveVideos();
      const fromActive = activeVideos.find((video) => video.id === targetEventId);
      if (fromActive) {
        const preparedActive = ensureCreatorIdentity(fromActive);
        this.videosMap.set(preparedActive.id, preparedActive);
        return preparedActive;
      }

      const fromAll = nostrClient.allEvents.get(targetEventId);
      if (fromAll) {
        const preparedFromAll = ensureCreatorIdentity(fromAll);
        this.videosMap.set(preparedFromAll.id, preparedFromAll);
        return preparedFromAll;
      }

      const fetched = await nostrClient.getEventById(targetEventId);
      if (fetched) {
        const preparedFetched = ensureCreatorIdentity(fetched);
        this.videosMap.set(preparedFetched.id, preparedFetched);
        return preparedFetched;
      }
    }

    if (normalizedIndex !== null) {
      const activeVideos = nostrClient.getActiveVideos();
      if (normalizedIndex >= 0 && normalizedIndex < activeVideos.length) {
        const candidate = activeVideos[normalizedIndex];
        if (candidate) {
          const preparedCandidate = ensureCreatorIdentity(candidate);
          this.videosMap.set(preparedCandidate.id, preparedCandidate);
          return preparedCandidate;
        }
      }
    }

    return null;
  }

  /**
   * Handle "Edit Video" from gear menu.
   */
  async handleEditModalSubmit(event) {
    if (this.editModalController) {
      return this.editModalController.handleSubmit(event);
    }
  }

  async handleEditVideo(target) {
    if (this.editModalController) {
      return this.editModalController.open(target);
    }
  }

  async handleRevertVideo(target) {
    if (this.revertModalController) {
      return this.revertModalController.open(target);
    }
  }

  async handleRevertModalConfirm(event) {
    if (this.revertModalController) {
      return this.revertModalController.handleConfirm(event);
    }
  }

  async handleDeleteModalConfirm(event) {
    const detail = event?.detail || {};
    const targetVideo = detail.video || this.deleteModal?.activeVideo || null;

    if (!targetVideo) {
      return;
    }

    if (!this.pubkey) {
      this.showError("Please login to delete videos.");
      return;
    }

    if (!this.deleteModal) {
      this.showError("Delete modal is not available right now.");
      return;
    }

    const rootId = targetVideo.videoRootId || targetVideo.id || "";
    if (!rootId) {
      this.showError("Unable to determine the video root for deletion.");
      return;
    }

    this.deleteModal.setBusy(true, "Deleting…");
    this.showStatus("Deleting. Please wait.", { showSpinner: true });

    try {
      await this.nostrService.handleFullDeleteVideo({
        videoRootId: rootId,
        video: targetVideo,
        pubkey: this.pubkey,
        confirm: false,
      });

      await this.loadVideos();
      this.showSuccess("All versions deleted successfully!");
      this.deleteModal.close();
      this.forceRefreshAllProfiles();
    } catch (err) {
      devLogger.error("Failed to delete all versions:", err);
      this.showError("Failed to delete all versions. Please try again.");
    } finally {
      if (this.deleteModal) {
        this.deleteModal.setBusy(false);
      }
      this.showStatus("");
    }
  }

  /**
   * Handle "Delete Video" from gear menu.
   */
  async handleFullDeleteVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
      const { triggerElement } = normalizedTarget;
      const all = this.nostrService.getFilteredActiveVideos({
        blacklistedEventIds: this.blacklistedEventIds,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      });
      const video = await this.resolveVideoActionTarget({
        ...normalizedTarget,
        preloadedList: all,
      });

      if (!this.pubkey) {
        this.showError("Please login to delete videos.");
        return;
      }
      const userPubkey = (this.pubkey || "").toLowerCase();
      const videoPubkey = (video?.pubkey || "").toLowerCase();
      if (!video || !videoPubkey || videoPubkey !== userPubkey) {
        this.showError("You do not own this video.");
        return;
      }
      if (!this.deleteModal) {
        this.showError("Delete modal is not available right now.");
        return;
      }

      const loaded = await this.deleteModal.load();
      if (!loaded) {
        this.showError("Delete modal is not available right now.");
        return;
      }

      this.deleteModal.setVideo(video);
      this.deleteModal.open({ video }, { triggerElement });
    } catch (err) {
      devLogger.error("Failed to delete all versions:", err);
      this.showError("Failed to delete all versions. Please try again.");
    }
  }

  /**
   * If there's a ?v= param in the URL, auto-open that video.
   */
  checkUrlParams(...args) {
    this._initCoordinators();
    return this._playback.checkUrlParams(...args);
  }

  async probeUrlWithVideoElement(...args) {
    this._initCoordinators();
    return this._playback.probeUrlWithVideoElement(...args);
  }

  async probeUrl(...args) {
    this._initCoordinators();
    return this._playback.probeUrl(...args);
  }

  async playHttp(...args) {
    this._initCoordinators();
    return this._playback.playHttp(...args);
  }

  async playViaWebTorrent(...args) {
    this._initCoordinators();
    return this._playback.playViaWebTorrent(...args);
  }

  /**
   * Unified playback helper that prefers HTTP URL sources
   * and falls back to WebTorrent when needed.
   */
  async playVideoWithFallback(...args) {
    this._initCoordinators();
    return this._playback.playVideoWithFallback(...args);
  }


  async playVideoByEventId(...args) {
    this._initCoordinators();
    return this._playback.playVideoByEventId(...args);
  }

  buildModalTimestampPayload(...args) {
    this._initCoordinators();
    return this._playback.buildModalTimestampPayload(...args);
  }

  getKnownVideoPostedAt(...args) {
    this._initCoordinators();
    return this._playback.getKnownVideoPostedAt(...args);
  }

  cacheVideoRootCreatedAt(...args) {
    this._initCoordinators();
    return this._playback.cacheVideoRootCreatedAt(...args);
  }

  async resolveVideoPostedAt(...args) {
    this._initCoordinators();
    return this._playback.resolveVideoPostedAt(...args);
  }

  async resolveVideoPostedAtBatch(...args) {
    this._initCoordinators();
    return this._playback.resolveVideoPostedAtBatch(...args);
  }

  async ensureModalPostedTimestamp(...args) {
    this._initCoordinators();
    return this._playback.ensureModalPostedTimestamp(...args);
  }

  async playVideoWithoutEvent(...args) {
    this._initCoordinators();
    return this._playback.playVideoWithoutEvent(...args);
  }

  /**
   * Simple helper to safely encode an npub.
   */
  safeEncodeNpub(pubkey) {
    return safeEncodeNpub(pubkey);
  }

  safeDecodeNpub(npub) {
    return safeDecodeNpub(npub);
  }

  selectPreferredCreatorName(candidates = []) {
    return this.creatorProfileController
      ? this.creatorProfileController.selectPreferredCreatorName(candidates)
      : "";
  }

  selectPreferredCreatorPicture(candidates = []) {
    return this.creatorProfileController
      ? this.creatorProfileController.selectPreferredCreatorPicture(candidates)
      : "";
  }

  resolveCreatorProfileFromSources(options) {
    return this.creatorProfileController
      ? this.creatorProfileController.resolveCreatorProfileFromSources(options)
      : { name: "Unknown", picture: "assets/svg/default-profile.svg" };
  }

  resolveModalCreatorProfile(options) {
    return this.creatorProfileController
      ? this.creatorProfileController.resolveModalCreatorProfile(options)
      : { name: "Unknown", picture: "assets/svg/default-profile.svg" };
  }

  decorateVideoCreatorIdentity(video) {
    return this.creatorProfileController
      ? this.creatorProfileController.decorateVideoCreatorIdentity(video)
      : video;
  }

  async fetchModalCreatorProfile(options) {
    if (this.creatorProfileController) {
      return this.creatorProfileController.fetchModalCreatorProfile(options);
    }
  }

  normalizeReactionCount(value) {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.round(Number(value)));
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  normalizeHexPubkey(pubkey) {
    return normalizeHexPubkey(pubkey);
  }

  /**
   * Attempts to fetch an older event by its ID if we can't find it in
   * this.videosMap or from a bulk fetch. Uses nostrClient.getEventById.
   */
  async getOldEventById(eventId) {
    return this.nostrService.getOldEventById(eventId);
  }

  /**
   * Format "time ago" for a given timestamp (in seconds).
   */
  formatAbsoluteTimestamp(timestamp) {
    return formatAbsoluteTimestampUtil(timestamp);
  }

  formatTimeAgo(timestamp) {
    return formatTimeAgoUtil(timestamp);
  }

  escapeHTML(unsafe) {
    return escapeHtml(unsafe);
  }

  updateNotificationPortalVisibility() {
    if (this.notificationController) {
      this.notificationController.updateNotificationPortalVisibility();
    }
  }

  showError(msg) {
    if (this.notificationController) {
      this.notificationController.showError(msg);
    } else if (msg) {
      userLogger.error(msg);
    }
  }

  showStatus(msg, options = {}) {
    if (this.notificationController) {
      this.notificationController.showStatus(msg, options);
    }
  }

  showSuccess(msg) {
    if (this.notificationController) {
      this.notificationController.showSuccess(msg);
    }
  }

  log(message, ...args) {
    if (arguments.length === 0) {
      return;
    }

    if (typeof message === "string") {
      const prefix = message.startsWith("[") ? message : `[app] ${message}`;
      devLogger.log(prefix, ...args);
      return;
    }

    devLogger.log("[app]", message, ...args);
  }

  destroy() {
    this.clearActiveIntervals();
    this.teardownModalViewCountSubscription();

    if (this.moderationActionController) {
      try {
        this.moderationActionController.destroy();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to destroy moderation action controller:",
          error,
        );
      }
      this.moderationActionController = null;
    }

    if (this.notificationController) {
      this.notificationController.destroy();
      this.notificationController = null;
    }

    if (this.watchHistoryTelemetry) {
      try {
        this.watchHistoryTelemetry.destroy();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to destroy watch history telemetry:",
          error
        );
      }
      this.watchHistoryTelemetry = null;
    }

    if (this.exploreDataService && typeof this.exploreDataService.destroy === "function") {
      try {
        this.exploreDataService.destroy();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to destroy explore data service:",
          error,
        );
      }
      this.exploreDataService = null;
    }

    if (typeof this.unsubscribeFromHashtagPreferencesChange === "function") {
      try {
        this.unsubscribeFromHashtagPreferencesChange();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to unsubscribe hashtag preferences change listener:",
          error,
        );
      }
      this.unsubscribeFromHashtagPreferencesChange = null;
    }
    this.boundHashtagPreferencesChangeHandler = null;

    if (typeof this.unsubscribeFromPubkeyState === "function") {
      try {
        this.unsubscribeFromPubkeyState();
      } catch (error) {
        devLogger.warn("[Application] Failed to unsubscribe pubkey state:", error);
      }
      this.unsubscribeFromPubkeyState = null;
    }

    if (typeof this.unsubscribeFromCurrentUserState === "function") {
      try {
        this.unsubscribeFromCurrentUserState();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to unsubscribe current user state:",
          error
        );
      }
      this.unsubscribeFromCurrentUserState = null;
    }

    if (
      this.boundNwcSettingsToastHandler &&
      typeof window !== "undefined" &&
      typeof window.removeEventListener === "function"
    ) {
      window.removeEventListener(
        "bitvid:toast",
        this.boundNwcSettingsToastHandler
      );
      this.boundNwcSettingsToastHandler = null;
    }

    if (
      this.nwcSettingsService &&
      typeof this.nwcSettingsService.clearCache === "function"
    ) {
      this.nwcSettingsService.clearCache();
    }

    this.authEventUnsubscribes.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          devLogger.warn("[Application] Auth listener unsubscribe failed:", error);
        }
      }
    });
    this.authEventUnsubscribes = [];

    if (typeof this.unsubscribeFromNostrService === "function") {
      try {
        this.unsubscribeFromNostrService();
      } catch (error) {
        devLogger.warn("[Application] Failed to unsubscribe nostr service:", error);
      }
      this.unsubscribeFromNostrService = null;
    }

    if (this.commentController) {
      try {
        this.commentController.destroy({ resetUi: false });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to destroy comment controller:",
          error,
        );
      }
      this.commentController = null;
    }

    if (this.modalManager) {
      try {
        this.modalManager.teardown();
      } catch (error) {
        devLogger.warn("[Application] Modal teardown failed:", error);
      }
      this.modalManager = null;
    }

    if (this.tagPreferenceMenuController) {
      this.tagPreferenceMenuController.clear();
    }

    if (this.videoListView) {
      if (this.moreMenuController) {
        this.moreMenuController.detachVideoListView();
      }
      this.videoListView.setPlaybackHandler(null);
      this.videoListView.setEditHandler(null);
      this.videoListView.setRevertHandler(null);
      this.videoListView.setDeleteHandler(null);
      if (
        typeof this.videoListView.setTagPreferenceStateResolver === "function"
      ) {
        this.videoListView.setTagPreferenceStateResolver(null);
      }
      if (typeof this.videoListView.setTagActivationHandler === "function") {
        this.videoListView.setTagActivationHandler(null);
      }
      this.videoListViewPlaybackHandler = null;
      this.videoListViewEditHandler = null;
      this.videoListViewRevertHandler = null;
      this.videoListViewDeleteHandler = null;
      try {
        this.videoListView.destroy();
      } catch (error) {
        devLogger.warn("[Application] Failed to destroy VideoListView:", error);
      }
      this.videoListView = null;
    }

    if (this.moreMenuController) {
      this.moreMenuController.setVideoModal(null);
      this.moreMenuController.destroy();
      this.moreMenuController = null;
    }

    if (this.videoSettingsMenuController) {
      this.videoSettingsMenuController.destroy();
      this.videoSettingsMenuController = null;
    }

    if (this.profileController) {
      if (typeof this.profileController.destroy === "function") {
        try {
          this.profileController.destroy();
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to destroy profile controller:",
            error,
          );
        }
      }
      this.profileController = null;
    }

    if (this.loginModalController) {
      if (typeof this.loginModalController.destroy === "function") {
        try {
          this.loginModalController.destroy();
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to destroy login modal controller:",
            error,
          );
        }
      }
      this.loginModalController = null;
    }
    if (this.bootstrapper) {
      try {
        this.bootstrapper.teardown();
      } catch (error) {
        devLogger.warn("[Application] Bootstrap teardown failed:", error);
      }
    }


    if (this.commentThreadService?.setCallbacks) {
      this.commentThreadService.setCallbacks({
        onThreadReady: null,
        onCommentsAppended: null,
        onError: null,
      });
    }
    if (this.commentThreadService) {
      try {
        this.commentThreadService.teardown();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to destroy comment thread service:",
          error,
        );
      }
      this.commentThreadService = null;
    }

    this.videoList = null;
    if (this.videoListPopularTags) {
      this.videoListPopularTags.textContent = "";
      this.videoListPopularTags.hidden = true;
    }
    this.videoListPopularTags = null;
  }

  async handleShareNostrPost(payload = {}) {
    if (this.shareNostrController) {
      return this.shareNostrController.handleShare(payload);
    }
  }

  shareActiveVideo() {
    if (!this.currentVideo || !this.currentVideo.id) {
      this.showError("No shareable video is loaded.");
      return;
    }

    const shareUrl = this.buildShareUrlFromEventId(this.currentVideo.id);
    if (!shareUrl) {
      this.showError("Could not generate link.");
      return;
    }

    navigator.clipboard
      .writeText(shareUrl)
      .then(() => this.showSuccess("Video link copied to clipboard!"))
      .catch(() => this.showError("Failed to copy the link."));
  }

  async openShareNostrModal({ video, triggerElement } = {}) {
    if (this.shareNostrController) {
      return this.shareNostrController.openModal({ video, triggerElement });
    }
  }

  /**
   * Copies the current video's magnet link to the clipboard.
   */
  handleCopyMagnet() {
    if (!this.currentVideo || !this.currentVideo.magnet) {
      if (
        this.currentVideo &&
        this.currentVideo.originalMagnet &&
        !this.currentVideo.torrentSupported
      ) {
        this.showError(UNSUPPORTED_BTITH_MESSAGE);
        return;
      }

      this.showError("No magnet link to copy.");
      return;
    }
    try {
      navigator.clipboard.writeText(this.currentVideo.magnet);
      this.showSuccess("Magnet link copied to clipboard!");
    } catch (err) {
      devLogger.error("Failed to copy magnet link:", err);
      this.showError("Could not copy magnet link. Please copy it manually.");
    }
  }
}

Application.recordVideoView = recordVideoViewApi;

/**
 * Given an array of video objects,
 * return only the newest (by created_at) for each videoRootId.
 * If no videoRootId is present, treat the video’s own ID as its root.
 */
export { Application };
export default Application;
