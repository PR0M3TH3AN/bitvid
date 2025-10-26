// js/app.js

import { nostrClient } from "./nostrClientFacade.js";
import { recordVideoView } from "./nostrViewEventsFacade.js";
import { torrentClient } from "./webtorrent.js";
import {
  isDevMode,
  ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL,
  MAX_WALLET_DEFAULT_ZAP,
  ALLOW_NSFW_CONTENT,
} from "./config.js";
import { accessControl } from "./accessControl.js";
import { safeDecodeMagnet } from "./magnetUtils.js";
import { extractMagnetHints, normalizeAndAugmentMagnet } from "./magnet.js";
import { deriveTorrentPlaybackConfig } from "./playbackUtils.js";
import {
  URL_FIRST_ENABLED,
  getTrustedMuteHideThreshold,
  getTrustedSpamHideThreshold,
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
} from "./constants.js";
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import { updateVideoCardSourceVisibility } from "./utils/cardSourceVisibility.js";
import { collectVideoTags } from "./utils/videoTags.js";
import { ADMIN_INITIAL_EVENT_BLACKLIST } from "./lists.js";
import { userBlocks } from "./userBlocks.js";
import { relayManager } from "./relayManager.js";
import {
  createFeedEngine,
  createActiveNostrSource,
  createBlacklistFilterStage,
  createDedupeByRootStage,
  createModerationStage,
  createResolvePostedAtStage,
  createChronologicalSorter,
  createSubscriptionAuthorsSource,
  registerWatchHistoryFeed,
} from "./feedEngine/index.js";
import watchHistoryService from "./watchHistoryService.js";
import r2Service from "./services/r2Service.js";
import PlaybackService from "./services/playbackService.js";
import AuthService from "./services/authService.js";
import getAuthProvider, {
  providers as authProviders,
} from "./services/authProviders/index.js";
import NwcSettingsService from "./services/nwcSettingsService.js";
import nostrService from "./services/nostrService.js";
import DiscussionCountService from "./services/discussionCountService.js";
import CommentThreadService from "./services/commentThreadService.js";
import hashtagPreferences, {
  HASHTAG_PREFERENCES_EVENTS,
} from "./services/hashtagPreferencesService.js";
import { initQuickR2Upload } from "./r2-quick.js";
import { createWatchHistoryRenderer } from "./historyView.js";
import WatchHistoryController from "./ui/watchHistoryController.js";
import WatchHistoryTelemetry from "./services/watchHistoryTelemetry.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import { subscriptions } from "./subscriptions.js";
import {
  refreshActiveChannelVideoGrid,
  clearChannelVideoCardRegistry,
} from "./channelProfile.js";
import { isWatchHistoryDebugEnabled } from "./watchHistoryDebug.js";
import { devLogger, userLogger } from "./utils/logger.js";
import createPopover from "./ui/overlay/popoverEngine.js";
import { createVideoSettingsMenuPanel } from "./ui/components/videoMenuRenderers.js";
import moderationService from "./services/moderationService.js";
import {
  initViewCounter,
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
  ingestLocalViewEvent,
} from "./viewCounter.js";
import { splitAndZap as splitAndZapDefault } from "./payments/zapSplit.js";
import { showLoginRequiredToZapNotification } from "./payments/zapNotifications.js";
import {
  formatAbsoluteTimestamp as formatAbsoluteTimestampUtil,
  formatTimeAgo as formatTimeAgoUtil,
  truncateMiddle,
  formatShortNpub,
} from "./utils/formatters.js";
import reactionCounter from "./reactionCounter.js";
import {
  escapeHTML as escapeHtml,
  removeTrackingScripts,
} from "./utils/domUtils.js";
import { VideoModal } from "./ui/components/VideoModal.js";
import { RevertModal } from "./ui/components/RevertModal.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./ui/components/staticModalAccessibility.js";
import { VideoListView } from "./ui/views/VideoListView.js";
import createTagPreferenceMenu, {
  TAG_PREFERENCE_ACTIONS,
  applyTagPreferenceMenuState,
} from "./ui/components/tagPreferenceMenu.js";
import MoreMenuController from "./ui/moreMenuController.js";
import ProfileModalController from "./ui/profileModalController.js";
import LoginModalController from "./ui/loginModalController.js";
import ZapController from "./ui/zapController.js";
import initUploadModal from "./ui/initUploadModal.js";
import initEditModal from "./ui/initEditModal.js";
import initDeleteModal from "./ui/initDeleteModal.js";
import { MediaLoader } from "./utils/mediaLoader.js";
import { pointerArrayToKey } from "./utils/pointer.js";
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
import {
  getPubkey as getStoredPubkey,
  setPubkey as setStoredPubkey,
  getCurrentUserNpub as getStoredCurrentUserNpub,
  setCurrentUserNpub as setStoredCurrentUserNpub,
  getCurrentVideo as getStoredCurrentVideo,
  setCurrentVideo as setStoredCurrentVideo,
  setModalState as setGlobalModalState,
  subscribeToAppStateKey,
} from "./state/appState.js";
import {
  getSavedProfiles,
  getActiveProfilePubkey,
  setActiveProfilePubkey as setStoredActiveProfilePubkey,
  setSavedProfiles,
  persistSavedProfiles,
  getProfileCacheMap,
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
  URL_PROBE_TIMEOUT_MS,
  urlHealthConstants,
} from "./state/cache.js";

const recordVideoViewApi = (...args) => recordVideoView(nostrClient, ...args);

const UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

const FALLBACK_THUMBNAIL_SRC = "assets/jpg/video-thumbnail-fallback.jpg";
const VIDEO_EVENT_KIND = 30078;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
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
    return getStoredPubkey();
  }

  set pubkey(value) {
    setStoredPubkey(value ?? null);
  }

  get currentUserNpub() {
    return getStoredCurrentUserNpub();
  }

  set currentUserNpub(value) {
    setStoredCurrentUserNpub(value ?? null);
  }

  get currentVideo() {
    return getStoredCurrentVideo();
  }

  set currentVideo(value) {
    setStoredCurrentVideo(value ?? null);
  }

  constructor({ services = {}, ui = {}, helpers = {}, loadView: viewLoader } = {}) {
    this.loadView = typeof viewLoader === "function" ? viewLoader : null;

    // Basic auth/display elements
    this.loginButton = document.getElementById("loginButton") || null;
    this.logoutButton = document.getElementById("logoutButton") || null;
    this.userStatus = document.getElementById("userStatus") || null;
    this.userPubKey = document.getElementById("userPubKey") || null;

    const mediaLoaderFactory =
      typeof helpers.mediaLoaderFactory === "function"
        ? helpers.mediaLoaderFactory
        : () => new MediaLoader();
    this.mediaLoader =
      helpers.mediaLoader instanceof MediaLoader
        ? helpers.mediaLoader
        : mediaLoaderFactory();
    this.loadedThumbnails = new Map();
    this.urlHealthSnapshots = new Map();
    this.streamHealthSnapshots = new Map();
    this.boundStreamHealthBadgeHandler = (detail) =>
      this.handleStreamHealthBadgeUpdate(detail);
    this.attachHealthBadgesWithCache = (container) => {
      attachHealthBadges(container, {
        onUpdate: this.boundStreamHealthBadgeHandler,
      });
    };
    this.defaultModerationSettings = getDefaultModerationSettings();
    this.moderationSettings = { ...this.defaultModerationSettings };
    this.relayManager = relayManager;
    this.activeIntervals = [];
    this.watchHistoryTelemetry = null;
    this.authEventUnsubscribes = [];
    this.unsubscribeFromNostrService = null;
    this.designSystemContext = {
      getMode: () => "new",
      isNew: () => true,
    };
    this.videoModalReadyPromise = null;
    this.boundUploadSubmitHandler = null;
    this.boundEditModalSubmitHandler = null;
    this.boundEditModalCancelHandler = null;
    this.boundRevertConfirmHandler = null;
    this.boundDeleteConfirmHandler = null;
    this.boundDeleteCancelHandler = null;
    this.boundVideoModalCloseHandler = null;
    this.boundVideoModalCopyHandler = null;
    this.boundVideoModalShareHandler = null;
    this.boundVideoModalCreatorHandler = null;
    this.boundVideoModalZapHandler = null;
    this.boundVideoModalZapWalletHandler = null;
    this.boundVideoModalCommentSubmitHandler = null;
    this.boundVideoModalCommentRetryHandler = null;
    this.boundVideoModalCommentLoadMoreHandler = null;
    this.boundVideoModalCommentLoginHandler = null;
    this.boundVideoModalCommentMuteHandler = null;
    this.boundVideoModalTagActivateHandler = null;
    this.pendingModalZapOpen = false;
    this.videoListViewPlaybackHandler = null;
    this.videoListViewEditHandler = null;
    this.videoListViewRevertHandler = null;
    this.videoListViewDeleteHandler = null;
    this.deleteModal = null;
    this.moreMenuController = null;
    this.latestFeedMetadata = null;
    this.lastModalTrigger = null;
    this.modalCommentState = {
      videoEventId: null,
      videoDefinitionAddress: null,
      parentCommentId: null,
    };
    this.modalCommentProfiles = new Map();
    this.modalCommentLimit = 40;
    this.modalCommentLoadPromise = null;
    this.modalCommentPublishPromise = null;
    this.pendingModeratedPlayback = null;
    this.lastIdentityRefreshPromise = null;

    this.nostrService = services.nostrService || nostrService;
    this.r2Service = services.r2Service || r2Service;

    this.feedEngine =
      services.feedEngine ||
      createFeedEngine({
        logger: (...args) => {
          if (!isWatchHistoryDebugEnabled()) {
            return;
          }
          devLogger.info(...args);
        },
      });
    this.payments = services.payments || null;
    this.splitAndZap =
      (services.payments && services.payments.splitAndZap) ||
      splitAndZapDefault;

    this.discussionCountService =
      services.discussionCountService || new DiscussionCountService();

    this.nwcSettingsService =
      services.nwcSettingsService ||
      new NwcSettingsService({
        normalizeHexPubkey: (value) => this.normalizeHexPubkey(value),
        getActivePubkey: () => this.pubkey,
        payments: this.payments,
        logger: {
          warn: (...args) => devLogger.warn(...args),
        },
        notifyError: (message) => this.showError(message),
        maxWalletDefaultZap: MAX_WALLET_DEFAULT_ZAP,
      });
    this.hashtagPreferences =
      services.hashtagPreferences || hashtagPreferences;
    this.hashtagPreferencesSnapshot =
      this.createHashtagPreferencesSnapshot();
    this.hashtagPreferencesSnapshotSignature =
      this.computeHashtagPreferencesSignature(
        this.hashtagPreferencesSnapshot,
      );
    this.hashtagPreferencesPublishInFlight = false;
    this.hashtagPreferencesPublishPromise = null;
    this.boundHashtagPreferencesChangeHandler = null;
    this.unsubscribeFromHashtagPreferencesChange = null;
    if (
      this.hashtagPreferences &&
      typeof this.hashtagPreferences.on === "function"
    ) {
      this.boundHashtagPreferencesChangeHandler = (detail) =>
        this.handleHashtagPreferencesChange(detail);
      try {
        this.unsubscribeFromHashtagPreferencesChange =
          this.hashtagPreferences.on(
            HASHTAG_PREFERENCES_EVENTS.CHANGE,
            this.boundHashtagPreferencesChangeHandler,
          );
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to subscribe to hashtag preferences changes:",
          error,
        );
      }
    }
    if (
      this.nwcSettingsService &&
      typeof this.nwcSettingsService.setActivePubkeyGetter === "function"
    ) {
      this.nwcSettingsService.setActivePubkeyGetter(() => this.pubkey);
    }
    if (
      this.nwcSettingsService &&
      typeof this.nwcSettingsService.setPayments === "function"
    ) {
      this.nwcSettingsService.setPayments(this.payments);
    }
    if (
      this.feedEngine &&
      typeof this.feedEngine.run !== "function" &&
      typeof this.feedEngine.runFeed === "function"
    ) {
      this.feedEngine.run = (...args) => this.feedEngine.runFeed(...args);
    }
    this.registerRecentFeed();
    this.registerSubscriptionsFeed();
    this.registerWatchHistoryFeed();

    this.watchHistoryController = new WatchHistoryController({
      watchHistoryService,
      nostrClient,
      showError: (message) => this.showError(message),
      showSuccess: (message) => this.showSuccess(message),
      dropWatchHistoryMetadata: (pointerKey) =>
        this.dropWatchHistoryMetadata(pointerKey),
      getActivePubkey: () =>
        typeof this.pubkey === "string" && this.pubkey ? this.pubkey : "",
      designSystem: this.designSystemContext,
    });

    this.watchHistoryTelemetry = new WatchHistoryTelemetry({
      watchHistoryService,
      watchHistoryController: this.watchHistoryController,
      nostrClient,
      log: (message, ...args) => this.log(message, ...args),
      normalizeHexPubkey: (value) => this.normalizeHexPubkey(value),
      getActiveUserPubkey: () => this.pubkey,
      ingestLocalViewEvent,
    });

    this.playbackService =
      services.playbackService ||
      new PlaybackService({
        logger: devLogger,
        torrentClient,
        deriveTorrentPlaybackConfig,
        isValidMagnetUri,
        urlFirstEnabled: URL_FIRST_ENABLED,
        analyticsCallbacks: {
          "session-start": (detail) => {
            const urlProvided = detail?.urlProvided ? "true" : "false";
            const magnetProvided = detail?.magnetProvided ? "true" : "false";
            const magnetUsable = detail?.magnetUsable ? "true" : "false";
            this.log(
              `[playVideoWithFallback] Session start urlProvided=${urlProvided} magnetProvided=${magnetProvided} magnetUsable=${magnetUsable}`
            );
          },
          fallback: (detail) => {
            if (detail?.reason) {
              this.log(
                `[playVideoWithFallback] Falling back to WebTorrent (${detail.reason}).`
              );
            }
          },
          error: (detail) => {
            if (detail?.error) {
              this.log("[playVideoWithFallback] Playback error observed", detail.error);
            }
          },
        },
      });
    this.activePlaybackResultPromise = null;
    this.activePlaybackSession = null;

    this.authService =
      services.authService ||
      new AuthService({
        nostrClient,
        userBlocks,
        relayManager,
        logger: devLogger,
        accessControl,
        authProviders,
        getAuthProvider,
      });
    this.authEventUnsubscribes.push(
      this.authService.on("auth:login", (detail) => {
        const maybePromise = this.handleAuthLogin(detail);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((error) => {
            devLogger.error("Failed to process auth login event:", error);
          });
        }
      })
    );
    this.authEventUnsubscribes.push(
      this.authService.on("auth:logout", (detail) => {
        if (detail && typeof detail === "object") {
          if (detail.__handled === true) {
            return;
          }
          try {
            detail.__handled = true;
          } catch (error) {
            devLogger.warn(
              "Failed to mark auth logout detail as handled:",
              error,
            );
          }
        }

        const maybePromise = this.handleAuthLogout(detail);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((error) => {
            devLogger.error("Failed to process auth logout event:", error);
          });
        }
      })
    );
    this.authEventUnsubscribes.push(
      this.authService.on("profile:updated", (detail) => {
        try {
          this.handleProfileUpdated(detail);
        } catch (error) {
          devLogger.warn(
            "Failed to process profile update event:",
            error,
          );
        }
      })
    );

    this.commentThreadService =
      services.commentThreadService ||
      new CommentThreadService({
        fetchVideoComments: (target, options) =>
          nostrClient?.fetchVideoComments?.(target, options),
        subscribeVideoComments: (target, options) =>
          nostrClient?.subscribeVideoComments?.(target, options),
        getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
        batchFetchProfiles: (pubkeys) => this.batchFetchProfiles(pubkeys),
        logger: {
          warn: (...args) => devLogger.warn(...args),
        },
      });
    this.boundCommentThreadReadyHandler = (snapshot) =>
      this.handleCommentThreadReady(snapshot);
    this.boundCommentThreadAppendHandler = (payload) =>
      this.handleCommentThreadAppend(payload);
    this.boundCommentThreadErrorHandler = (error) =>
      this.handleCommentThreadError(error);
    if (
      this.commentThreadService &&
      typeof this.commentThreadService.setCallbacks === "function"
    ) {
      this.commentThreadService.setCallbacks({
        onThreadReady: this.boundCommentThreadReadyHandler,
        onCommentsAppended: this.boundCommentThreadAppendHandler,
        onError: this.boundCommentThreadErrorHandler,
      });
      if (this.commentThreadService.defaultLimit) {
        this.modalCommentLimit = this.commentThreadService.defaultLimit;
      }
    }

    // Profile and login modal controller state
    this.profileController = null;
    this.loginModalController = null;
    this.currentUserNpub = null;

    this.initializeLoginModalController({ logIfMissing: true });

    // Optional: a "profile" button or avatar (if used)
    this.profileButton = document.getElementById("profileButton") || null;
    this.profileAvatar = document.getElementById("profileAvatar") || null;

    const modalContainer = document.getElementById("modalContainer") || null;

    // Upload modal component
    this.uploadButton = document.getElementById("uploadButton") || null;
    const uploadModalSetup = initUploadModal({
      app: this,
      uploadModalOverride: ui.uploadModal,
      container: modalContainer,
      services: {
        authService: this.authService,
        r2Service: this.r2Service,
      },
      utilities: {
        removeTrackingScripts,
        setGlobalModalState,
      },
      callbacks: {
        publishVideoNote: (payload, options) =>
          this.publishVideoNote(payload, options),
        showError: (message) => this.showError(message),
        showSuccess: (message) => this.showSuccess(message),
        getCurrentPubkey: () => this.pubkey,
        safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
        onSubmit: (event) => this.handleUploadSubmitEvent(event),
      },
    });
    this.uploadModal = uploadModalSetup.modal;
    this.uploadModalEvents = uploadModalSetup.events;
    this.boundUploadSubmitHandler = uploadModalSetup.handlers.submit;

    const editModalSetup = initEditModal({
      app: this,
      editModalOverride: ui.editModal,
      container: modalContainer,
      services: {
        getMode: ({ video } = {}) => {
          const candidate =
            typeof video?.mode === "string" ? video.mode.trim().toLowerCase() : "";
          return candidate === "dev" ? "dev" : "live";
        },
        sanitizers: {
          text: (value) => (typeof value === "string" ? value.trim() : ""),
          url: (value) => (typeof value === "string" ? value.trim() : ""),
          magnet: (value) => (typeof value === "string" ? value.trim() : ""),
          checkbox: (value) => !!value,
        },
      },
      utilities: {
        removeTrackingScripts,
        setGlobalModalState,
        escapeHtml: (value) => escapeHtml(value),
      },
      callbacks: {
        showError: (message) => this.showError(message),
        onSubmit: (event) => this.handleEditModalSubmit(event),
        onCancel: () => this.showError(""),
      },
    });

    this.editModal = editModalSetup.modal;
    this.editModalEvents = editModalSetup.events;
    this.boundEditModalSubmitHandler = editModalSetup.handlers.submit;
    this.boundEditModalCancelHandler = editModalSetup.handlers.cancel;

    this.revertModal =
      (typeof ui.revertModal === "function"
        ? ui.revertModal({ app: this })
        : ui.revertModal) ||
      new RevertModal({
        removeTrackingScripts,
        setGlobalModalState,
        formatAbsoluteTimestamp: (timestamp) =>
          this.formatAbsoluteTimestamp(timestamp),
        formatTimeAgo: (timestamp) => this.formatTimeAgo(timestamp),
        escapeHTML: (value) => this.escapeHTML(value),
        truncateMiddle,
        formatShortNpub: (value) => formatShortNpub(value),
        fallbackThumbnailSrc: FALLBACK_THUMBNAIL_SRC,
        container: modalContainer,
      });

    this.boundRevertConfirmHandler = (event) => {
      this.handleRevertModalConfirm(event);
    };
    this.revertModal.addEventListener(
      "video:revert-confirm",
      this.boundRevertConfirmHandler
    );

    const deleteModalSetup = initDeleteModal({
      app: this,
      deleteModalOverride: ui.deleteModal,
      container: modalContainer,
      utilities: {
        removeTrackingScripts,
        setGlobalModalState,
        truncateMiddle,
      },
      callbacks: {
        onConfirm: (event) => this.handleDeleteModalConfirm(event),
        onCancel: () => this.showError(""),
      },
    });

    this.deleteModal = deleteModalSetup.modal;
    this.deleteModalEvents = deleteModalSetup.events;
    this.boundDeleteConfirmHandler = deleteModalSetup.handlers.confirm;
    this.boundDeleteCancelHandler = deleteModalSetup.handlers.cancel;

    try {
      const profileModalContainer = document.getElementById("modalContainer") || null;
      if (profileModalContainer) {
        const profileModalServices = {
          normalizeHexPubkey: (value) => this.normalizeHexPubkey(value),
          safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
          safeDecodeNpub: (npub) => this.safeDecodeNpub(npub),
          truncateMiddle: (value, maxLength) => truncateMiddle(value, maxLength),
          formatShortNpub: (value) => formatShortNpub(value),
          getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
          batchFetchProfiles: (authorSet) => this.batchFetchProfiles(authorSet),
          switchProfile: (pubkey) => this.authService.switchProfile(pubkey),
          removeSavedProfile: (pubkey) =>
            this.authService.removeSavedProfile(pubkey),
          relayManager,
          userBlocks,
          nostrClient,
          subscriptions,
          accessControl,
          getCurrentUserNpub: () => this.getCurrentUserNpub(),
          nwcSettings: this.nwcSettingsService,
          moderationSettings: {
            getDefaultModerationSettings: () => getDefaultModerationSettings(),
            getActiveModerationSettings: () => getModerationSettings(),
            updateModerationSettings: (partial = {}) =>
              setModerationSettings(partial),
            resetModerationSettings: () => resetModerationSettings(),
          },
          loadVideos: (forceFetch, context) =>
            this.loadVideos(forceFetch, context),
          onVideosShouldRefresh: (context) =>
            this.onVideosShouldRefresh(context),
          describeAdminError: (code) => this.describeAdminError(code),
          describeNotificationError: (code) =>
            this.describeNotificationError(code),
          onAccessControlUpdated: () => this.onAccessControlUpdated(),
          persistSavedProfiles: (options) => persistSavedProfiles(options),
          watchHistoryService,
          authService: this.authService,
          requestAddProfileLogin: (options) =>
            this.requestProfileAdditionLogin(options),
          describeLoginError: (error, fallbackMessage) =>
            this.describeLoginError(error, fallbackMessage),
          hashtagPreferences: this.hashtagPreferences,
          getHashtagPreferences: () => this.getHashtagPreferences(),
          describeHashtagPreferencesError: (error, fallbackMessage) =>
            this.describeHashtagPreferencesError(error, {
              fallbackMessage,
            }),
          log: (...args) => this.log(...args),
          closeAllMoreMenus: (options) => this.closeAllMoreMenus(options),
          clipboard:
            typeof navigator !== "undefined" && navigator?.clipboard
              ? navigator.clipboard
              : null,
        };

        const profileModalState = {
          getSavedProfiles: () => getSavedProfiles(),
          setSavedProfiles: (profiles, options) =>
            setSavedProfiles(Array.isArray(profiles) ? profiles : [], options),
          persistSavedProfiles: (options) => persistSavedProfiles(options),
          getActivePubkey: () => getActiveProfilePubkey(),
          setActivePubkey: (pubkey, options) => {
            const normalized =
              typeof pubkey === "string" && pubkey.trim()
                ? pubkey.trim()
                : null;
            setStoredActiveProfilePubkey(normalized, options);
            return getActiveProfilePubkey();
          },
        };

        const profileModalCallbacks = {
          onClose: () => this.handleProfileModalClosed(),
          onLogout: async () => this.requestLogout(),
          onChannelLink: (element) => this.handleProfileChannelLink(element),
          onAddAccount: (payload) => this.handleAddProfile(payload),
          onRequestSwitchProfile: (payload) =>
            this.handleProfileSwitchRequest(payload),
          onRelayOperation: (payload) =>
            this.handleProfileRelayOperation(payload),
          onRelayModeToggle: (payload) =>
            this.handleProfileRelayModeToggle(payload),
          onRelayRestore: (payload) =>
            this.handleProfileRelayRestore(payload),
          onBlocklistMutation: (payload) =>
            this.handleProfileBlocklistMutation(payload),
          onWalletPersist: (payload) =>
            this.handleProfileWalletPersist(payload),
          onWalletTestRequest: (payload) =>
            this.handleProfileWalletTest(payload),
          onWalletDisconnectRequest: (payload) =>
            this.handleProfileWalletDisconnect(payload),
          onAdminMutation: (payload) =>
            this.handleProfileAdminMutation(payload),
          onAdminNotifyError: (payload) =>
            this.handleProfileAdminNotifyError(payload),
          onHistoryReady: (payload) =>
            this.handleProfileHistoryEvent(payload),
          onModerationSettingsChange: (payload) =>
            this.handleModerationSettingsChange(payload),
        };

        this.profileController = new ProfileModalController({
          modalContainer: profileModalContainer,
          removeTrackingScripts,
          createWatchHistoryRenderer,
          setGlobalModalState,
          showError: (message) => this.showError(message),
          showSuccess: (message) => this.showSuccess(message),
          showStatus: (message) => this.showStatus(message),
          constants: {
            MAX_WALLET_DEFAULT_ZAP,
            ADMIN_SUPER_NPUB,
            ADMIN_DM_IMAGE_URL,
            BITVID_WEBSITE_URL,
          },
          services: profileModalServices,
          state: profileModalState,
          callbacks: profileModalCallbacks,
          designSystem: this.designSystemContext,
        });
      } else {
        devLogger.warn(
          "[Application] Profile modal controller disabled: modal container not found.",
        );
      }
    } catch (error) {
      devLogger.error("Failed to initialize profile modal controller:", error);
    }


    // Optional small inline player stats
    this.status = document.getElementById("status") || null;
    this.progressBar = document.getElementById("progress") || null;
    this.peers = document.getElementById("peers") || null;
    this.speed = document.getElementById("speed") || null;
    this.downloaded = document.getElementById("downloaded") || null;

    this.cleanupPromise = null;
    this.zapController = null;

    this.videoModal =
      (typeof ui.videoModal === "function"
        ? ui.videoModal({ app: this })
        : ui.videoModal) ||
      new VideoModal({
        removeTrackingScripts,
        setGlobalModalState,
        document,
        logger: {
          log: (message, ...args) => this.log(message, ...args),
        },
        mediaLoader: this.mediaLoader,
        assets: {
          fallbackThumbnailSrc: FALLBACK_THUMBNAIL_SRC,
        },
        state: {
          loadedThumbnails: this.loadedThumbnails,
        },
        helpers: {
          safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
          formatShortNpub: (value) => formatShortNpub(value),
        },
      });

    if (
      this.videoModal &&
      typeof this.videoModal.setMediaLoader === "function"
    ) {
      this.videoModal.setMediaLoader(this.mediaLoader);
    }
    if (
      this.videoModal &&
      typeof this.videoModal.setTagPreferenceStateResolver === "function"
    ) {
      this.videoModal.setTagPreferenceStateResolver((tag) =>
        this.getTagPreferenceState(tag),
      );
    }
    this.zapController = new ZapController({
      videoModal: this.videoModal,
      getCurrentVideo: () => this.currentVideo,
      nwcSettings: this.nwcSettingsService,
      isUserLoggedIn: () => this.isUserLoggedIn(),
      hasSessionActor: () =>
        Boolean(
          typeof nostrClient?.sessionActor?.pubkey === "string" &&
            nostrClient.sessionActor.pubkey.trim()
        ),
      notifyLoginRequired: () =>
        showLoginRequiredToZapNotification({
          app: this,
          document:
            this.statusContainer?.ownerDocument ||
            (typeof document !== "undefined" ? document : null),
        }),
      splitAndZap: (...args) => this.splitAndZap(...args),
      payments: this.payments,
      callbacks: {
        onSuccess: (message) => this.showSuccess(message),
        onError: (message) => this.showError(message),
      },
      requestWalletPane: () => this.openWalletPane(),
    });
    this.boundVideoModalCloseHandler = () => {
      this.hideModal();
    };
    this.videoModal.addEventListener(
      "modal:close",
      this.boundVideoModalCloseHandler
    );
    this.boundVideoModalCopyHandler = () => {
      this.handleCopyMagnet();
    };
    this.videoModal.addEventListener(
      "video:copy-magnet",
      this.boundVideoModalCopyHandler
    );
    this.boundVideoModalShareHandler = () => {
      this.shareActiveVideo();
    };
    this.videoModal.addEventListener(
      "video:share",
      this.boundVideoModalShareHandler
    );
    this.boundVideoModalModerationOverrideHandler = (event) => {
      const detail = event?.detail || {};
      const targetVideo =
        detail && typeof detail.video === "object"
          ? detail.video
          : this.currentVideo || null;
      if (!targetVideo) {
        const trigger = detail?.trigger;
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
        return;
      }

      const handled = this.handleModerationOverride({
        video: targetVideo,
        card: detail?.card || null,
      });

      if (handled === false) {
        const trigger = detail?.trigger;
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
      }
    };
    this.videoModal.addEventListener(
      "video:moderation-override",
      this.boundVideoModalModerationOverrideHandler,
    );
    this.boundVideoModalModerationBlockHandler = (event) => {
      const detail = event?.detail || {};
      const targetVideo =
        detail && typeof detail.video === "object"
          ? detail.video
          : this.currentVideo || null;
      const trigger = detail?.trigger || null;

      if (!targetVideo) {
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
        return;
      }

      Promise.resolve(
        this.handleModerationBlock({
          video: targetVideo,
          card: detail?.card || null,
        }),
      )
        .then((handled) => {
          if (handled === false && trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to handle modal moderation block:",
            error,
          );
          if (trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        });
    };
    this.videoModal.addEventListener(
      "video:moderation-block",
      this.boundVideoModalModerationBlockHandler,
    );
    this.boundVideoModalModerationHideHandler = (event) => {
      const detail = event?.detail || {};
      const targetVideo =
        detail && typeof detail.video === "object"
          ? detail.video
          : this.currentVideo || null;
      const trigger = detail?.trigger || null;

      if (!targetVideo) {
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
        return;
      }

      Promise.resolve(
        this.handleModerationHide({
          video: targetVideo,
          card: detail?.card || null,
        }),
      )
        .then((handled) => {
          if (handled === false && trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to handle modal moderation hide:",
            error,
          );
          if (trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        });
    };
    this.videoModal.addEventListener(
      "video:moderation-hide",
      this.boundVideoModalModerationHideHandler,
    );
    this.boundVideoModalTagActivateHandler = (event) => {
      const detail = event?.detail || {};
      const nativeEvent = detail?.nativeEvent || null;
      if (nativeEvent) {
        nativeEvent.preventDefault?.();
        nativeEvent.stopPropagation?.();
      }

      this.handleTagPreferenceActivation({
        tag: detail?.tag,
        trigger: detail?.trigger || null,
        context: "modal",
        video: detail?.video || this.currentVideo || null,
        event: nativeEvent,
      });
    };
    this.videoModal.addEventListener(
      "tag:activate",
      this.boundVideoModalTagActivateHandler,
    );
    this.boundVideoModalSimilarSelectHandler = (event) => {
      const detail = event?.detail || {};
      const selectedVideo =
        detail && typeof detail.video === "object" ? detail.video : null;
      const triggerCandidate =
        detail?.event?.currentTarget ||
        (detail?.card && typeof detail.card.getRoot === "function"
          ? detail.card.getRoot()
          : null);

      this.setLastModalTrigger(triggerCandidate || null);

      if (detail?.event) {
        detail.event.preventDefault?.();
        detail.event.stopPropagation?.();
      }

      if (!selectedVideo) {
        return;
      }

      const playbackOptions = {
        trigger: this.lastModalTrigger,
      };

      if (typeof selectedVideo.url === "string" && selectedVideo.url) {
        playbackOptions.url = selectedVideo.url;
      }
      if (typeof selectedVideo.magnet === "string" && selectedVideo.magnet) {
        playbackOptions.magnet = selectedVideo.magnet;
      }

      if (typeof selectedVideo.id === "string" && selectedVideo.id) {
        Promise.resolve(
          this.playVideoByEventId(selectedVideo.id, playbackOptions)
        ).catch((error) => {
          devLogger.error(
            "[Application] Failed to play selected similar video:",
            error
          );
        });
        return;
      }

      Promise.resolve(this.playVideoWithFallback(playbackOptions)).catch(
        (error) => {
          devLogger.error(
            "[Application] Failed to start playback for similar video:",
            error
          );
        }
      );
    };
    this.videoModal.addEventListener(
      "similar:select",
      this.boundVideoModalSimilarSelectHandler
    );
    this.boundVideoModalReactionHandler = (event) => {
      const detail = event?.detail || {};
      this.handleVideoReaction(detail);
    };
    this.videoModal.addEventListener(
      "video:reaction",
      this.boundVideoModalReactionHandler
    );
    this.boundVideoModalContextActionHandler = (event) => {
      const detail = event?.detail || {};
      const action = typeof detail.action === "string" ? detail.action : "";
      if (!action) {
        return;
      }
      const dataset = {
        ...(detail.dataset || {}),
      };
      if (!dataset.context) {
        dataset.context = "modal";
      }
      this.handleMoreMenuAction(action, dataset);
    };
    this.videoModal.addEventListener(
      "video:context-action",
      this.boundVideoModalContextActionHandler
    );
    this.boundVideoModalCreatorHandler = () => {
      this.openCreatorChannel();
    };
    this.videoModal.addEventListener(
      "creator:navigate",
      this.boundVideoModalCreatorHandler
    );
    this.boundVideoModalZapHandler = (event) => {
      this.zapController?.sendZap(event?.detail || {});
    };
    this.boundVideoModalZapOpenHandler = (event) => {
      const requiresLogin = Boolean(event?.detail?.requiresLogin);
      this.pendingModalZapOpen = requiresLogin;

      const openResult = this.zapController?.open({ requiresLogin });
      if (!openResult) {
        event?.preventDefault?.();
        if (!requiresLogin) {
          this.pendingModalZapOpen = false;
        }
        this.videoModal?.closeZapDialog?.({
          silent: true,
          restoreFocus: false,
        });
        return;
      }

      this.pendingModalZapOpen = false;
    };
    this.boundVideoModalZapCloseHandler = () => {
      this.zapController?.close();
    };
    this.boundVideoModalZapAmountHandler = (event) => {
      this.zapController?.setAmount(event?.detail?.amount);
    };
    this.boundVideoModalZapCommentHandler = (event) => {
      this.zapController?.setComment(event?.detail?.comment);
    };
    this.videoModal.addEventListener(
      "video:zap",
      this.boundVideoModalZapHandler
    );
    this.videoModal.addEventListener(
      "zap:open",
      this.boundVideoModalZapOpenHandler
    );
    this.videoModal.addEventListener(
      "zap:close",
      this.boundVideoModalZapCloseHandler
    );
    this.videoModal.addEventListener(
      "zap:amount-change",
      this.boundVideoModalZapAmountHandler
    );
    this.videoModal.addEventListener(
      "zap:comment-change",
      this.boundVideoModalZapCommentHandler
    );
    this.boundVideoModalZapWalletHandler = () => {
      this.zapController?.handleWalletLink();
    };
    this.videoModal.addEventListener(
      "zap:wallet-link",
      this.boundVideoModalZapWalletHandler
    );
    this.boundVideoModalCommentSubmitHandler = (event) => {
      this.handleVideoModalCommentSubmit(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:submit",
      this.boundVideoModalCommentSubmitHandler
    );
    this.boundVideoModalCommentRetryHandler = (event) => {
      this.handleVideoModalCommentRetry(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:retry",
      this.boundVideoModalCommentRetryHandler
    );
    this.boundVideoModalCommentLoadMoreHandler = (event) => {
      this.handleVideoModalCommentLoadMore(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:load-more",
      this.boundVideoModalCommentLoadMoreHandler
    );
    this.boundVideoModalCommentLoginHandler = (event) => {
      this.handleVideoModalCommentLoginRequired(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:login-required",
      this.boundVideoModalCommentLoginHandler
    );
    this.boundVideoModalCommentMuteHandler = (event) => {
      this.handleVideoModalCommentMute(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:mute-author",
      this.boundVideoModalCommentMuteHandler
    );

    this.moreMenuController = new MoreMenuController({
      document,
      accessControl,
      userBlocks,
      subscriptions,
      clipboard:
        typeof navigator !== "undefined" && navigator?.clipboard
          ? navigator.clipboard
          : null,
      isDevMode,
      designSystem: this.designSystemContext,
      callbacks: {
        getCurrentVideo: () => this.currentVideo,
        getCurrentUserNpub: () => this.getCurrentUserNpub(),
        getCurrentUserPubkey: () => this.pubkey,
        canCurrentUserManageBlacklist: () =>
          this.canCurrentUserManageBlacklist(),
        openCreatorChannel: () => this.openCreatorChannel(),
        goToProfile: (author) => this.goToProfile(author),
        showError: (message) => this.showError(message),
        showSuccess: (message) => this.showSuccess(message),
        safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
        safeDecodeNpub: (npub) => this.safeDecodeNpub(npub),
        buildShareUrlFromEventId: (eventId) =>
          this.buildShareUrlFromEventId(eventId),
        handleRemoveHistoryAction: (payload) =>
          this.handleRemoveHistoryAction(payload),
        handleRepostAction: (payload) => this.handleRepostAction(payload),
        handleMirrorAction: (payload) => this.handleMirrorAction(payload),
        handleEnsurePresenceAction: (payload) =>
          this.handleEnsurePresenceAction(payload),
        loadVideos: () => this.loadVideos(),
        refreshAllVideoGrids: (options) => this.refreshAllVideoGrids(options),
        onUserBlocksUpdated: () => {
          if (this.profileController) {
            try {
              this.profileController.populateBlockedList();
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to refresh blocked list after update:",
                error,
              );
            }
          }
        },
      },
    });
    this.moreMenuController.setVideoModal(this.videoModal);
    this.videoSettingsPopovers = new Map();
    this.tagPreferencePopovers = new Map();

    // Hide/Show Subscriptions Link
    this.subscriptionsLink = null;

    // Notification containers
    this.notificationPortal =
      document.getElementById("notificationPortal") || null;
    this.errorContainer = document.getElementById("errorContainer") || null;
    this.successContainer = document.getElementById("successContainer") || null;
    this.statusContainer = document.getElementById("statusContainer") || null;
    this.statusMessage =
      this.statusContainer?.querySelector("[data-status-message]") || null;
    this.statusAutoHideHandle = null;
    this.lastExperimentalWarningKey = null;
    this.lastExperimentalWarningAt = 0;

    // Auth state
    this.pubkey = null;
    this.currentMagnetUri = null;
    this.currentVideo = null;
    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;
    this.videoSubscription = this.nostrService.getVideoSubscription() || null;
    this.videoList = null;
    this.videoListPopularTags = null;
    this.modalViewCountUnsub = null;
    this.modalReactionUnsub = null;
    this.modalReactionPointerKey = null;
    this.modalReactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };

    // Videos stored as a Map (key=event.id)
    this.videosMap = this.nostrService.getVideosMap();
    this.unsubscribeFromNostrService = this.nostrService.on(
      "subscription:changed",
      ({ subscription }) => {
        this.videoSubscription = subscription || null;
      }
    );
    this.boundNwcSettingsToastHandler = null;
    Object.defineProperty(this, "savedProfiles", {
      configurable: false,
      enumerable: false,
      get() {
        return getSavedProfiles();
      },
      set(next) {
        setSavedProfiles(Array.isArray(next) ? next : [], {
          persist: false,
          persistActive: false,
        });
      },
    });

    Object.defineProperty(this, "activeProfilePubkey", {
      configurable: false,
      enumerable: false,
      get() {
        return getActiveProfilePubkey();
      },
      set(value) {
        setStoredActiveProfilePubkey(value, { persist: false });
      },
    });

    Object.defineProperty(this, "profileCache", {
      configurable: false,
      enumerable: false,
      get() {
        return getProfileCacheMap();
      },
    });

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      this.boundNwcSettingsToastHandler = (event) => {
        const detail = event?.detail || {};
        if (detail.source !== "nwc-settings") {
          return;
        }
        const rawMessage =
          typeof detail.message === "string" ? detail.message.trim() : "";
        const message = rawMessage || "Wallet settings storage issue detected.";
        this.log(`[nwcSettings] ${message}`);
        if (detail.variant === "warning") {
          this.showStatus(message);
          if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
            window.setTimeout(() => {
              this.showStatus("");
            }, 5000);
          }
        } else {
          this.showError(message);
        }
      };
      window.addEventListener("bitvid:toast", this.boundNwcSettingsToastHandler);
    }

    const videoListViewConfig = {
      document,
      mediaLoader: this.mediaLoader,
      badgeHelpers: {
        attachHealthBadges: this.attachHealthBadgesWithCache,
        attachUrlHealthBadges: (container, onCheck) =>
          attachUrlHealthBadges(container, onCheck),
      },
      formatters: {
        formatTimeAgo: (timestamp) => this.formatTimeAgo(timestamp),
        formatViewCountLabel: (total) => this.formatViewCountLabel(total),
      },
      helpers: {
        escapeHtml: (value) => this.escapeHTML(value),
        isMagnetSupported: (magnet) => isValidMagnetUri(magnet),
        toLocaleString: (value) =>
          typeof value === "number" ? value.toLocaleString() : value,
      },
      assets: {
        fallbackThumbnailSrc: FALLBACK_THUMBNAIL_SRC,
        unsupportedBtihMessage: UNSUPPORTED_BTITH_MESSAGE,
      },
      state: {
        loadedThumbnails: this.loadedThumbnails,
        videosMap: this.videosMap,
        urlHealthByVideoId: this.urlHealthSnapshots,
        streamHealthByVideoId: this.streamHealthSnapshots,
      },
      utils: {
        dedupeVideos: (videos) => this.dedupeVideosByRoot(videos),
        getAllEvents: () => Array.from(nostrClient.allEvents.values()),
        hasOlderVersion: (video, events) => this.hasOlderVersion(video, events),
        derivePointerInfo: (video) => this.deriveVideoPointerInfo(video),
        persistWatchHistoryMetadata: (video, pointerInfo) =>
          this.persistWatchHistoryMetadataForVideo(video, pointerInfo),
        getShareUrlBase: () => this.getShareUrlBase(),
        buildShareUrlFromNevent: (nevent) => this.buildShareUrlFromNevent(nevent),
        buildShareUrlFromEventId: (eventId) => this.buildShareUrlFromEventId(eventId),
        getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
        resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
        canManageBlacklist: () => this.canCurrentUserManageBlacklist(),
        canEditVideo: (video) => video?.pubkey === this.pubkey,
        canDeleteVideo: (video) => video?.pubkey === this.pubkey,
        batchFetchProfiles: (authorSet) => this.batchFetchProfiles(authorSet),
        bindThumbnailFallbacks: (container) => this.bindThumbnailFallbacks(container),
        handleUrlHealthBadge: (payload) => this.handleUrlHealthBadge(payload),
        refreshDiscussionCounts: (videos, { container } = {}) =>
          this.refreshVideoDiscussionCounts(videos, {
            videoListRoot: container || this.videoList || null,
          }),
        ensureGlobalMoreMenuHandlers: () => this.ensureGlobalMoreMenuHandlers(),
        requestMoreMenu: (detail = {}) => this.requestMoreMenu(detail),
        closeMoreMenu: (detail = {}) => this.closeMoreMenu(detail),
        requestSettingsMenu: (detail = {}) =>
          this.requestVideoSettingsMenu(detail),
        closeSettingsMenu: (detail = {}) =>
          this.closeVideoSettingsMenu(detail),
        closeAllMenus: (options) => this.closeAllMoreMenus(options),
      },
      renderers: {
        getLoadingMarkup: (message) => getSidebarLoadingMarkup(message),
      },
      allowNsfw: ALLOW_NSFW_CONTENT === true,
      designSystem: this.designSystemContext,
    };
    this.videoListView =
      (typeof ui.videoListView === "function"
        ? ui.videoListView({ app: this, config: videoListViewConfig })
        : ui.videoListView) ||
      new VideoListView(videoListViewConfig);

    if (
      this.videoListView &&
      typeof this.videoListView.setTagPreferenceStateResolver === "function"
    ) {
      this.videoListView.setTagPreferenceStateResolver((tag) =>
        this.getTagPreferenceState(tag),
      );
    }

    if (
      this.videoListView &&
      typeof this.videoListView.setTagActivationHandler === "function"
    ) {
      this.videoListView.setTagActivationHandler((detail = {}) =>
        this.handleTagPreferenceActivation(detail),
      );
    }

    this.videoListViewPlaybackHandler = ({
      videoId,
      url,
      magnet,
      trigger,
    }) => {
      if (videoId) {
        Promise.resolve(
          this.playVideoByEventId(videoId, { url, magnet, trigger })
        ).catch((error) => {
          devLogger.error("[VideoListView] Failed to play by event id:", error);
        });
        return;
      }
      Promise.resolve(
        this.playVideoWithFallback({ url, magnet, trigger })
      ).catch(
        (error) => {
          devLogger.error("[VideoListView] Failed to start playback:", error);
        }
      );
    };
    this.videoListView.setPlaybackHandler(this.videoListViewPlaybackHandler);

    this.videoListViewEditHandler = ({ video, index, trigger }) => {
      if (!video?.id) {
        return;
      }
      this.handleEditVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        triggerElement: trigger,
      });
    };
    this.videoListView.setEditHandler(this.videoListViewEditHandler);

    this.videoListViewRevertHandler = ({ video, index, trigger }) => {
      if (!video?.id) {
        return;
      }
      this.handleRevertVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        triggerElement: trigger,
      });
    };
    this.videoListView.setRevertHandler(this.videoListViewRevertHandler);

    this.videoListViewDeleteHandler = ({ video, index }) => {
      if (!video?.id) {
        return;
      }
      this.handleFullDeleteVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
      });
    };
    this.videoListView.setDeleteHandler(this.videoListViewDeleteHandler);

    this.videoListView.setModerationOverrideHandler((detail = {}) =>
      this.handleModerationOverride(detail)
    );
    this.videoListView.setModerationBlockHandler((detail = {}) =>
      this.handleModerationBlock(detail)
    );
    this.videoListView.setModerationHideHandler((detail = {}) =>
      this.handleModerationHide(detail)
    );

    if (this.moreMenuController) {
      this.moreMenuController.attachVideoListView(this.videoListView);
    }

    // NEW: reference to the login modal's close button
    this.closeLoginModalBtn =
      document.getElementById("closeLoginModal") || null;

    // Build a set of blacklisted event IDs (hex) from nevent strings, skipping empties
    this.blacklistedEventIds = new Set();
    for (const neventStr of ADMIN_INITIAL_EVENT_BLACKLIST) {
      // Skip any empty or obviously invalid strings
      if (!neventStr || neventStr.trim().length < 8) {
        continue;
      }
      try {
        const decoded = window.NostrTools.nip19.decode(neventStr);
        if (decoded.type === "nevent" && decoded.data.id) {
          this.blacklistedEventIds.add(decoded.data.id);
        }
      } catch (err) {
        devLogger.error(
          "[Application] Invalid nevent in blacklist:",
          neventStr,
          err
        );
      }
    }

    this.unsubscribeFromPubkeyState = subscribeToAppStateKey(
      "pubkey",
      (next, previous) => {
        if (next !== previous) {
          this.renderSavedProfiles();
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
    setStoredActiveProfilePubkey(pubkey, { persist });
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
    for (const authorPubkey of uniqueAuthors) {
      this.authService.fetchAndRenderProfile(authorPubkey, true);
    }
  }

  getCurrentUserNpub() {
    return this.currentUserNpub;
  }

  isAuthorBlocked(pubkey) {
    try {
      if (userBlocks && typeof userBlocks.isBlocked === "function") {
        return userBlocks.isBlocked(pubkey);
      }
    } catch (error) {
      devLogger.warn("[Application] Failed to evaluate block status:", error);
    }

    return false;
  }

  async init() {
    try {
      if (typeof this.loadView !== "function") {
        const module = await import("./viewManager.js");
        this.loadView = module?.loadView || null;
      }

      // Force update of any registered service workers to ensure latest code is used.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => registration.update());
        });
      }

      this.authService.hydrateFromStorage();
      this.renderSavedProfiles();

      loadModerationOverridesFromStorage();
      loadModerationSettingsFromStorage();
      this.moderationSettings = this.normalizeModerationSettings(
        getModerationSettings(),
      );

      const videoModalPromise = this.videoModal.load().then(() => {
        const modalRoot = this.videoModal.getRoot();
        if (modalRoot) {
          this.attachMoreMenuHandlers(modalRoot);
        }
      });

      const uploadModalPromise = this.uploadModal
        .load()
        .catch((error) => {
          devLogger.error("initUploadModal failed:", error);
          this.showError(`Failed to initialize upload modal: ${error.message}`);
        })
        .finally(() => {
          initQuickR2Upload(this);
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

      const modalBootstrapPromise = Promise.all([
        videoModalPromise,
        uploadModalPromise,
        editModalPromise,
        profileModalPromise,
      ]);

      const nostrInitPromise = nostrClient.init();

      await Promise.all([modalBootstrapPromise, nostrInitPromise]);

      try {
        initViewCounter({ nostrClient });
      } catch (error) {
        devLogger.warn("Failed to initialize view counter:", error);
      }

      const accessControlPromise = accessControl
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

      const adminPanePromise = this.profileController
        ? Promise.resolve()
            .then(() => this.profileController.refreshAdminPaneState())
            .catch((error) => {
              devLogger.warn(
                "Failed to update admin pane after connecting to Nostr:",
                error,
              );
            })
        : Promise.resolve(null);

      await Promise.all([accessControlPromise, adminPanePromise]);

      // Grab the "Subscriptions" link by its id in the sidebar
      this.subscriptionsLink = document.getElementById("subscriptionsLink");

      this.syncAuthUiState();

      const savedPubKey = this.activeProfilePubkey;
      if (savedPubKey) {
        // Auto-login if a pubkey was saved
        try {
          await this.authService.login(savedPubKey, { persistActive: false });
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

      // 5. Setup general event listeners
      this.setupEventListeners();

      const watchHistoryInitPromise =
        this.watchHistoryTelemetry?.initPreferenceSync?.().catch((error) => {
          devLogger.warn(
            "[app.init()] Failed to initialize watch history metadata sync:",
            error
          );
        }) || Promise.resolve();

      // 6) Load the default view ONLY if there's no #view= already
      if (!window.location.hash || !window.location.hash.startsWith("#view=")) {
        devLogger.log(
          "[app.init()] No #view= in the URL, loading default home view"
        );
        if (typeof this.loadView === "function") {
          await Promise.all([
            this.loadView("views/most-recent-videos.html"),
            watchHistoryInitPromise,
          ]);
        } else {
          await watchHistoryInitPromise;
        }
      } else {
        devLogger.log(
          "[app.init()] Found hash:",
          window.location.hash,
          "so skipping default load"
        );
        await watchHistoryInitPromise;
      }

      // 7. Once loaded, get a reference to #videoList
      this.mountVideoListView();

      // 8. Subscribe or fetch videos
      await this.loadVideos();

      // 9. Check URL ?v= param
      this.checkUrlParams();

    } catch (error) {
      devLogger.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  goToProfile(pubkey) {
    if (!pubkey) {
      this.showError("No creator info available.");
      return;
    }
    try {
      const npub = window.NostrTools.nip19.npubEncode(pubkey);
      // Switch to channel profile view
      window.location.hash = `#view=channel-profile&npub=${npub}`;
    } catch (err) {
      devLogger.error("Failed to go to channel:", err);
      this.showError("Could not open channel.");
    }
  }

  openCreatorChannel() {
    if (!this.currentVideo || !this.currentVideo.pubkey) {
      this.showError("No creator info available.");
      return;
    }

    try {
      // Encode the hex pubkey to npub
      const npub = window.NostrTools.nip19.npubEncode(this.currentVideo.pubkey);

      // Close the video modal
      this.hideModal();

      // Switch to channel profile view
      window.location.hash = `#view=channel-profile&npub=${npub}`;
    } catch (err) {
      devLogger.error("Failed to open creator channel:", err);
      this.showError("Could not open channel.");
    }
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

  normalizeModalTrigger(candidate) {
    if (!candidate) {
      return null;
    }
    const doc =
      (this.videoModal && this.videoModal.document) ||
      (typeof document !== "undefined" ? document : null);
    const isElement =
      typeof candidate === "object" &&
      candidate !== null &&
      typeof candidate.nodeType === "number" &&
      candidate.nodeType === 1 &&
      typeof candidate.focus === "function";
    if (!isElement) {
      return null;
    }
    if (doc && typeof doc.contains === "function" && !doc.contains(candidate)) {
      return null;
    }
    return candidate;
  }

  setLastModalTrigger(candidate) {
    this.lastModalTrigger = this.normalizeModalTrigger(candidate);
    return this.lastModalTrigger;
  }

  getDesignSystemMode() {
    return getCanonicalDesignSystemMode();
  }

  isDesignSystemNew() {
    return true;
  }

  /**
   * Show the modal and set the "Please stand by" poster on the video.
   */
  async showModalWithPoster(video = this.currentVideo, options = {}) {
    if (!this.videoModal) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(options || {}, "trigger")) {
      this.setLastModalTrigger(options.trigger);
    }

    const targetVideo = video || this.currentVideo;
    if (!targetVideo) {
      this.log(
        "[Application] Skipping video modal open; no target video is available.",
      );
      return null;
    }

    try {
      const { root } = await this.ensureVideoModalReady({
        ensureVideoElement: true,
      });

      if (!this.videoModal) {
        return root || null;
      }

      this.videoModal.open(targetVideo, {
        triggerElement: this.lastModalTrigger,
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
        "[Application] Failed to open the video modal before playback:",
        error
      );
      this.showError("Could not open the video player. Please try again.");
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
      this.modalVideo = existingVideoElement;

      if (
        existingVideoElement &&
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        const modalVideo =
          typeof this.videoModal.getVideoElement === "function"
            ? this.videoModal.getVideoElement()
            : null;
        if (modalVideo !== existingVideoElement) {
          this.videoModal.setVideoElement(existingVideoElement);
        }
      }

      return {
        root: existingRoot,
        videoElement: existingVideoElement,
      };
    }

    if (!videoConnected) {
      this.modalVideo = null;
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
      this.modalVideo = readyVideoElement;
      if (
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        this.videoModal.setVideoElement(readyVideoElement);
      }
    } else {
      this.modalVideo = null;
    }

    if (ensureVideoElement && !readyVideoConnected) {
      throw new Error(
        "Video modal video element is missing after load().",
      );
    }

    return {
      root: readyRoot,
      videoElement: readyVideoConnected ? readyVideoElement : null,
    };
  }

  extractDTagValue(tags) {
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
    });
  }

  computeSimilarContentCandidates({ activeVideo = this.currentVideo, maxItems = 5 } = {}) {
    const decorateCandidate = (video) => {
      if (!video || typeof video !== "object") {
        return video;
      }
      if (typeof this.decorateVideoModeration === "function") {
        try {
          const decorated = this.decorateVideoModeration(video);
          if (decorated && typeof decorated === "object") {
            return decorated;
          }
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to decorate similar content candidate",
            error,
          );
        }
      }
      return video;
    };

    const target = activeVideo && typeof activeVideo === "object" ? decorateCandidate(activeVideo) : null;
    if (!target) {
      return [];
    }

    const activeTagsSource = Array.isArray(target.displayTags) && target.displayTags.length
      ? target.displayTags
      : collectVideoTags(target);

    const activeTagSet = new Set();
    for (const tag of activeTagsSource) {
      if (typeof tag !== "string") {
        continue;
      }
      const normalized = tag.trim().toLowerCase();
      if (normalized) {
        activeTagSet.add(normalized);
      }
    }

    if (activeTagSet.size === 0) {
      return [];
    }

    const limit = Number.isFinite(maxItems) && maxItems > 0
      ? Math.max(1, Math.floor(maxItems))
      : 5;

    let candidateSource = [];
    if (Array.isArray(this.videoListView?.currentVideos) && this.videoListView.currentVideos.length) {
      candidateSource = this.videoListView.currentVideos;
    } else if (this.videosMap instanceof Map && this.videosMap.size) {
      candidateSource = Array.from(this.videosMap.values());
    } else if (nostrClient && typeof nostrClient.getActiveVideos === "function") {
      try {
        const activeVideos = nostrClient.getActiveVideos();
        if (Array.isArray(activeVideos)) {
          candidateSource = activeVideos;
        }
      } catch (error) {
        devLogger.warn("[Application] Failed to read active videos for similar content:", error);
      }
    }

    if (!Array.isArray(candidateSource) || candidateSource.length === 0) {
      return [];
    }

    const activeId = typeof target.id === "string" ? target.id : "";
    const activePointerKey = typeof target.pointerKey === "string" ? target.pointerKey : "";
    const seenKeys = new Set();
    if (activeId) {
      const normalizedId = activeId.trim().toLowerCase();
      if (normalizedId) {
        seenKeys.add(normalizedId);
      }
    }
    if (activePointerKey) {
      const normalizedPointer = activePointerKey.trim().toLowerCase();
      if (normalizedPointer) {
        seenKeys.add(normalizedPointer);
      }
    }

    const results = [];

    for (const candidate of candidateSource) {
      const decoratedCandidate = decorateCandidate(candidate);
      if (!decoratedCandidate || typeof decoratedCandidate !== "object") {
        continue;
      }
      if (decoratedCandidate === target) {
        continue;
      }

      const candidateId = typeof decoratedCandidate.id === "string" ? decoratedCandidate.id : "";
      if (candidateId && candidateId === activeId) {
        continue;
      }
      if (decoratedCandidate.deleted === true) {
        continue;
      }
      if (decoratedCandidate.isPrivate === true) {
        continue;
      }
      if (decoratedCandidate.isNsfw === true && ALLOW_NSFW_CONTENT !== true) {
        continue;
      }

      const candidatePubkey = typeof decoratedCandidate.pubkey === "string" ? decoratedCandidate.pubkey : "";
      if (candidatePubkey && this.isAuthorBlocked(candidatePubkey)) {
        continue;
      }

      const candidateTagsSource = Array.isArray(decoratedCandidate.displayTags) && decoratedCandidate.displayTags.length
        ? decoratedCandidate.displayTags
        : collectVideoTags(decoratedCandidate);
      if (!Array.isArray(candidateTagsSource) || candidateTagsSource.length === 0) {
        continue;
      }

      const candidateTagSet = new Set();
      for (const tag of candidateTagsSource) {
        if (typeof tag !== "string") {
          continue;
        }
        const normalized = tag.trim().toLowerCase();
        if (normalized) {
          candidateTagSet.add(normalized);
        }
      }

      if (candidateTagSet.size === 0) {
        continue;
      }

      let sharedCount = 0;
      for (const tag of candidateTagSet) {
        if (activeTagSet.has(tag)) {
          sharedCount += 1;
        }
      }

      if (sharedCount === 0) {
        continue;
      }

      const pointerInfo = this.deriveVideoPointerInfo(candidate);
      const pointerKey = typeof candidate.pointerKey === "string" && candidate.pointerKey.trim()
        ? candidate.pointerKey.trim()
        : typeof pointerInfo?.key === "string" && pointerInfo.key
          ? pointerInfo.key
          : "";

      const dedupeKeyRaw = (candidateId || pointerKey || "").trim();
      if (dedupeKeyRaw) {
        const dedupeKey = dedupeKeyRaw.toLowerCase();
        if (seenKeys.has(dedupeKey)) {
          continue;
        }
        seenKeys.add(dedupeKey);
      }

      if (!Array.isArray(candidate.displayTags) || candidate.displayTags.length === 0) {
        candidate.displayTags = Array.isArray(candidateTagsSource)
          ? candidateTagsSource.slice()
          : [];
      }

      let postedAt = this.getKnownVideoPostedAt(decoratedCandidate);
      if (!Number.isFinite(postedAt) && Number.isFinite(decoratedCandidate.rootCreatedAt)) {
        postedAt = Math.floor(decoratedCandidate.rootCreatedAt);
      }
      if (!Number.isFinite(postedAt) && Number.isFinite(decoratedCandidate.created_at)) {
        postedAt = Math.floor(decoratedCandidate.created_at);
      }
      if (!Number.isFinite(postedAt)) {
        postedAt = null;
      }

      let shareUrl = "";
      if (typeof decoratedCandidate.shareUrl === "string" && decoratedCandidate.shareUrl.trim()) {
        shareUrl = decoratedCandidate.shareUrl.trim();
      } else if (candidateId) {
        shareUrl = this.buildShareUrlFromEventId(candidateId) || "";
      }

      results.push({
        video: decoratedCandidate,
        pointerInfo: pointerInfo || null,
        shareUrl,
        postedAt,
        sharedTagCount: sharedCount,
      });
    }

    if (results.length === 0) {
      return [];
    }

    results.sort((a, b) => {
      if (b.sharedTagCount !== a.sharedTagCount) {
        return b.sharedTagCount - a.sharedTagCount;
      }
      const tsA = Number.isFinite(a.postedAt) ? a.postedAt : 0;
      const tsB = Number.isFinite(b.postedAt) ? b.postedAt : 0;
      return tsB - tsA;
    });

    return results.slice(0, limit).map((entry) => {
      const normalizedPostedAt = Number.isFinite(entry.postedAt)
        ? Math.floor(entry.postedAt)
        : null;
      const timeAgo = normalizedPostedAt !== null ? this.formatTimeAgo(normalizedPostedAt) : "";
      return {
        video: entry.video,
        pointerInfo: entry.pointerInfo,
        shareUrl: entry.shareUrl,
        postedAt: normalizedPostedAt,
        timeAgo,
        sharedTagCount: entry.sharedTagCount,
      };
    });
  }

  updateModalSimilarContent({ activeVideo = this.currentVideo, maxItems } = {}) {
    if (!this.videoModal) {
      return;
    }

    const target = activeVideo && typeof activeVideo === "object" ? activeVideo : null;
    if (!target) {
      if (typeof this.videoModal.clearSimilarContent === "function") {
        this.videoModal.clearSimilarContent();
      }
      return;
    }

    const matches = this.computeSimilarContentCandidates({ activeVideo: target, maxItems });
    if (matches.length > 0) {
      if (typeof this.videoModal.setSimilarContent === "function") {
        this.videoModal.setSimilarContent(matches);
      }
      return;
    }

    if (typeof this.videoModal.clearSimilarContent === "function") {
      this.videoModal.clearSimilarContent();
    }
  }

  formatViewCountLabel(total) {
    const value = Number.isFinite(total) ? Number(total) : 0;
    const label = value === 1 ? "view" : "views";
    return `${formatViewCount(value)} ${label}`;
  }

  pruneDetachedViewCountElements() {
    if (this.videoListView) {
      this.videoListView.pruneDetachedViewCountElements();
    }
  }

  teardownAllViewCountSubscriptions() {
    if (this.videoListView) {
      this.videoListView.teardownAllViewCountSubscriptions();
    }
  }

  teardownModalViewCountSubscription() {
    if (typeof this.modalViewCountUnsub === "function") {
      try {
        this.modalViewCountUnsub();
      } catch (error) {
        devLogger.warn("[viewCount] Failed to tear down modal subscription:", error);
      }
    }
    this.modalViewCountUnsub = null;
    if (this.videoModal) {
      this.videoModal.updateViewCountLabel("– views");
      this.videoModal.setViewCountPointer(null);
    }
  }

  resetModalReactionState() {
    this.modalReactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };
    if (this.videoModal?.updateReactionSummary) {
      this.videoModal.updateReactionSummary({
        total: 0,
        counts: { "+": 0, "-": 0 },
        userReaction: "",
      });
    }
  }

  teardownModalReactionSubscription() {
    if (typeof this.modalReactionUnsub === "function") {
      try {
        this.modalReactionUnsub();
      } catch (error) {
        devLogger.warn(
          "[reaction] Failed to tear down modal subscription:",
          error,
        );
      }
    }
    this.modalReactionUnsub = null;
    this.modalReactionPointerKey = null;
    this.resetModalReactionState();
  }

  subscribeModalReactions(pointer, pointerKey) {
    if (!this.videoModal?.updateReactionSummary) {
      this.teardownModalReactionSubscription();
      return;
    }

    this.teardownModalReactionSubscription();

    if (!pointer || !pointerKey) {
      return;
    }

    try {
      const normalizedUser = this.normalizeHexPubkey(this.pubkey);
      const unsubscribe = reactionCounter.subscribe(pointer, (snapshot) => {
        const counts = { ...this.modalReactionState.counts };
        if (snapshot?.counts && typeof snapshot.counts === "object") {
          for (const [key, value] of Object.entries(snapshot.counts)) {
            counts[key] = this.normalizeReactionCount(value);
          }
        }
        if (!Object.prototype.hasOwnProperty.call(counts, "+")) {
          counts["+"] = 0;
        }
        if (!Object.prototype.hasOwnProperty.call(counts, "-")) {
          counts["-"] = 0;
        }

        let total = Number.isFinite(snapshot?.total)
          ? Math.max(0, Number(snapshot.total))
          : 0;
        if (!Number.isFinite(total) || total === 0) {
          total = 0;
          for (const value of Object.values(counts)) {
            total += this.normalizeReactionCount(value);
          }
        }

        let userReaction = "";
        if (normalizedUser && snapshot?.reactions) {
          const record = snapshot.reactions[normalizedUser] || null;
          if (record && typeof record.content === "string") {
            userReaction =
              record.content === "+"
                ? "+"
                : record.content === "-"
                  ? "-"
                  : "";
          }
        }

        this.modalReactionState = {
          counts,
          total,
          userReaction,
        };
        this.videoModal.updateReactionSummary({
          total,
          counts,
          userReaction,
        });
      });

      this.modalReactionPointerKey = pointerKey;
      this.modalReactionUnsub = () => {
        try {
          unsubscribe?.();
        } catch (error) {
          devLogger.warn(
            "[reaction] Failed to tear down modal subscription:",
            error,
          );
        } finally {
          this.modalReactionUnsub = null;
          this.modalReactionPointerKey = null;
        }
      };
    } catch (error) {
      devLogger.warn(
        "[reaction] Failed to subscribe modal reaction counter:",
        error,
      );
      this.resetModalReactionState();
    }
  }

  resetModalCommentState({ hide = true } = {}) {
    if (!this.videoModal) {
      return;
    }

    this.videoModal.clearComments?.();
    this.videoModal.resetCommentComposer?.();
    this.videoModal.setCommentComposerState?.({
      disabled: true,
      reason: "disabled",
    });
    if (hide) {
      this.videoModal.setCommentsVisibility?.(false);
    }
    this.videoModal.setCommentStatus?.("");
  }

  teardownModalCommentSubscription({ resetUi = true } = {}) {
    if (this.commentThreadService) {
      try {
        this.commentThreadService.teardown();
      } catch (error) {
        devLogger.warn("[comment] Failed to teardown modal comment thread:", error);
      }
    }
    this.modalCommentLoadPromise = null;
    this.modalCommentPublishPromise = null;
    this.modalCommentState = {
      videoEventId: null,
      videoDefinitionAddress: null,
      parentCommentId: null,
    };
    this.modalCommentProfiles = new Map();
    if (resetUi) {
      this.resetModalCommentState();
    }
    this.videoModal?.setCommentSectionCallbacks?.({ teardown: null });
  }

  subscribeModalComments(video) {
    if (!this.videoModal) {
      return;
    }

    if (!video) {
      this.teardownModalCommentSubscription();
      return;
    }

    this.videoModal.setCommentSectionCallbacks?.({
      teardown: () => this.teardownModalCommentSubscription(),
    });

    if (!this.commentThreadService) {
      this.resetModalCommentState();
      return;
    }

    this.teardownModalCommentSubscription({ resetUi: false });

    this.videoModal.hideCommentsDisabledMessage?.();

    if (video.enableComments === false) {
      this.resetModalCommentState();
      this.videoModal.showCommentsDisabledMessage?.(
        "Comments have been turned off for this video."
      );
      return;
    }

    const videoEventId =
      typeof video.id === "string" && video.id.trim() ? video.id.trim() : "";
    const videoDefinitionAddress = buildVideoAddressPointer(video);

    if (!videoEventId || !videoDefinitionAddress) {
      this.resetModalCommentState({ hide: false });
      this.videoModal.setCommentStatus?.(
        "Comments are unavailable for this video.",
      );
      return;
    }

    this.modalCommentState = {
      videoEventId,
      videoDefinitionAddress,
      parentCommentId: null,
    };
    this.modalCommentProfiles = new Map();
    if (this.commentThreadService.defaultLimit) {
      this.modalCommentLimit = this.commentThreadService.defaultLimit;
    }

    this.videoModal.setCommentsVisibility?.(true);
    this.videoModal.clearComments?.();
    this.videoModal.resetCommentComposer?.();
    this.videoModal.setCommentStatus?.("Loading comments…");
    this.applyCommentComposerAuthState();

    const loadPromise = this.commentThreadService.loadThread({
      video,
      parentCommentId: null,
      limit: this.modalCommentLimit,
    });

    if (!loadPromise || typeof loadPromise.then !== "function") {
      this.applyCommentComposerAuthState();
      return;
    }

    this.modalCommentLoadPromise = loadPromise;
    loadPromise
      .then(() => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        this.applyCommentComposerAuthState();
      })
      .catch((error) => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        this.handleCommentThreadError(error);
      });
  }

  applyCommentComposerAuthState() {
    if (!this.videoModal) {
      return;
    }

    if (!this.modalCommentState.videoEventId) {
      return;
    }

    if (this.currentVideo?.enableComments === false) {
      this.videoModal.showCommentsDisabledMessage?.(
        "Comments have been turned off for this video."
      );
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "disabled",
      });
      return;
    }

    this.videoModal.hideCommentsDisabledMessage?.();

    if (!this.isUserLoggedIn()) {
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "login-required",
      });
      return;
    }

    this.videoModal.setCommentComposerState?.({
      disabled: false,
      reason: "",
    });
    this.videoModal.setCommentStatus?.("");
  }

  handleCommentThreadReady(snapshot) {
    if (!snapshot || !this.videoModal) {
      return;
    }

    if (snapshot.videoEventId !== this.modalCommentState.videoEventId) {
      return;
    }

    this.modalCommentProfiles = this.createMapFromInput(snapshot.profiles);
    this.modalCommentState.parentCommentId =
      typeof snapshot.parentCommentId === "string" &&
      snapshot.parentCommentId.trim()
        ? snapshot.parentCommentId.trim()
        : null;

    const sanitizedSnapshot = this.buildModalCommentSnapshot(snapshot);
    this.videoModal.renderComments?.(sanitizedSnapshot);
    this.videoModal.setCommentStatus?.("");
    this.applyCommentComposerAuthState();
  }

  handleCommentThreadAppend(payload) {
    if (!payload || !this.videoModal) {
      return;
    }

    if (payload.videoEventId !== this.modalCommentState.videoEventId) {
      return;
    }

    const comments = this.createMapFromInput(payload.commentsById);
    const profiles = this.createMapFromInput(payload.profiles);
    profiles.forEach((profile, pubkey) => {
      this.modalCommentProfiles.set(pubkey, profile);
    });

    const commentIds = Array.isArray(payload.commentIds)
      ? payload.commentIds
      : [];

    commentIds.forEach((commentId) => {
      if (!comments.has(commentId)) {
        return;
      }
      const event = comments.get(commentId);
      if (!event || this.shouldHideModalComment(event)) {
        return;
      }
      const enriched = this.enrichCommentEvent(event);
      this.videoModal.appendComment?.(enriched);
    });
  }

  handleCommentThreadError(error) {
    if (error) {
      devLogger.warn("[comment]", error);
    }
    if (!this.videoModal) {
      return;
    }
    this.videoModal.setCommentStatus?.(
      "Failed to load comments. Please try again later.",
    );
    if (!this.isUserLoggedIn()) {
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "login-required",
      });
    }
  }

  createMapFromInput(input) {
    if (input instanceof Map) {
      return new Map(input);
    }
    const map = new Map();
    if (Array.isArray(input)) {
      input.forEach((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          map.set(entry[0], entry[1]);
        }
      });
      return map;
    }
    if (input && typeof input === "object") {
      Object.entries(input).forEach(([key, value]) => {
        map.set(key, value);
      });
    }
    return map;
  }

  createChildrenMapFromInput(input) {
    const source = input instanceof Map ? input : this.createMapFromInput(input);
    const result = new Map();
    source.forEach((value, key) => {
      const list = Array.isArray(value) ? value.filter(Boolean) : [];
      result.set(key, list);
    });
    return result;
  }

  enrichCommentEvent(event) {
    const cloned = { ...(event || {}) };
    const normalized = this.normalizeHexPubkey(cloned.pubkey);
    if (normalized && this.modalCommentProfiles.has(normalized)) {
      cloned.profile = this.modalCommentProfiles.get(normalized);
    }
    return cloned;
  }

  buildModalCommentSnapshot(snapshot) {
    const comments = this.createMapFromInput(snapshot?.commentsById);
    const children = this.createChildrenMapFromInput(snapshot?.childrenByParent);
    const sanitizedComments = new Map();

    comments.forEach((event, key) => {
      if (!event || this.shouldHideModalComment(event)) {
        return;
      }
      sanitizedComments.set(key, this.enrichCommentEvent(event));
    });

    const sanitizedChildren = new Map();
    children.forEach((ids, parentId) => {
      const seen = new Set();
      const filtered = [];
      ids.forEach((id) => {
        if (!sanitizedComments.has(id) || seen.has(id)) {
          return;
        }
        seen.add(id);
        filtered.push(id);
      });
      sanitizedChildren.set(parentId, filtered);
    });

    return {
      videoEventId: snapshot.videoEventId,
      parentCommentId: snapshot.parentCommentId || null,
      commentsById: sanitizedComments,
      childrenByParent: sanitizedChildren,
      profiles: this.modalCommentProfiles,
    };
  }

  shouldHideModalComment(event) {
    const normalized = this.normalizeHexPubkey(event?.pubkey);
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

  async handleVideoModalCommentSubmit(detail = {}) {
    if (this.modalCommentPublishPromise) {
      return;
    }

    const text =
      typeof detail.text === "string" && detail.text.trim()
        ? detail.text.trim()
        : "";
    if (!text) {
      return;
    }

    if (!this.isUserLoggedIn()) {
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "login-required",
      });
      this.handleVideoModalCommentLoginRequired(detail);
      return;
    }

    const video = this.currentVideo;
    if (!video || video.enableComments === false) {
      return;
    }

    const videoEventId =
      typeof video.id === "string" && video.id.trim() ? video.id.trim() : "";
    const videoDefinitionAddress = buildVideoAddressPointer(video);

    if (!videoEventId || !videoDefinitionAddress) {
      this.showError("Comments are unavailable for this video.");
      return;
    }

    const parentCommentId =
      typeof detail.parentId === "string" && detail.parentId.trim()
        ? detail.parentId.trim()
        : null;

    this.videoModal.setCommentComposerState?.({
      disabled: true,
      reason: "submitting",
    });

    const publishPromise = Promise.resolve(
      nostrClient.publishVideoComment(
        {
          videoEventId,
          videoDefinitionAddress,
          parentCommentId,
        },
        {
          content: text,
        },
      ),
    );

    this.modalCommentPublishPromise = publishPromise;

    try {
      const result = await publishPromise;
      if (!result?.ok || !result.event) {
        throw result?.error || new Error("publish-failed");
      }

      const event = this.enrichCommentEvent(result.event);
      if (this.commentThreadService) {
        try {
          this.commentThreadService.processIncomingEvent(event);
        } catch (error) {
          devLogger.warn(
            "[comment] Failed to process optimistic comment event:",
            error,
          );
          this.videoModal.appendComment?.(event);
        }
      } else {
        this.videoModal.appendComment?.(event);
      }

      this.videoModal.resetCommentComposer?.();
      this.applyCommentComposerAuthState();
      this.videoModal.setCommentStatus?.("Comment posted.");
    } catch (error) {
      devLogger.warn("[comment] Failed to publish comment:", error);
      this.videoModal.setCommentComposerState?.({
        disabled: false,
        reason: "error",
      });
      this.showError("Failed to post comment. Please try again.");
    } finally {
      if (this.modalCommentPublishPromise === publishPromise) {
        this.modalCommentPublishPromise = null;
      }
    }
  }

  handleVideoModalCommentRetry(detail = {}) {
    this.handleVideoModalCommentSubmit(detail);
  }

  handleVideoModalCommentLoadMore() {
    if (!this.commentThreadService || !this.currentVideo) {
      return;
    }

    if (this.modalCommentLoadPromise) {
      return;
    }

    const increment = this.commentThreadService.defaultLimit || 40;
    this.modalCommentLimit = (this.modalCommentLimit || increment) + increment;

    const loadPromise = this.commentThreadService.loadThread({
      video: this.currentVideo,
      parentCommentId: this.modalCommentState.parentCommentId,
      limit: this.modalCommentLimit,
    });

    if (!loadPromise || typeof loadPromise.then !== "function") {
      return;
    }

    this.modalCommentLoadPromise = loadPromise;
    loadPromise
      .then(() => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        this.applyCommentComposerAuthState();
      })
      .catch((error) => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        devLogger.warn("[comment] Failed to load more comments:", error);
        this.showError("Failed to load more comments. Please try again.");
      });
  }

  handleVideoModalCommentLoginRequired(detail = {}) {
    this.applyCommentComposerAuthState();
    this.initializeLoginModalController({ logIfMissing: true });
    const triggerElement = detail?.triggerElement || null;
    try {
      const opened = this.loginModalController?.openModal?.({ triggerElement });
      if (opened) {
        return;
      }
    } catch (error) {
      devLogger.warn("[comment] Failed to open login modal:", error);
    }

    this.authService
      .requestLogin({ allowAccountSelection: true })
      .catch((error) => {
        devLogger.warn("[comment] Login request failed:", error);
      });
  }

  async handleVideoModalCommentMute(detail = {}) {
    const pubkey =
      typeof detail?.pubkey === "string" && detail.pubkey.trim()
        ? detail.pubkey.trim()
        : "";
    if (!pubkey) {
      return;
    }

    if (!this.isUserLoggedIn()) {
      this.handleVideoModalCommentLoginRequired(detail);
      return;
    }

    try {
      await userBlocks.addBlock(pubkey, this.pubkey);
      const snapshot = this.commentThreadService?.getSnapshot?.();
      if (snapshot) {
        this.handleCommentThreadReady(snapshot);
      }
      this.showStatus?.("Author muted.");
    } catch (error) {
      devLogger.warn("[comment] Failed to mute author:", error);
      this.showError("Failed to mute this author. Please try again.");
    }
  }

  subscribeModalViewCount(pointer, pointerKey) {
    const viewEl = this.videoModal?.getViewCountElement() || null;
    if (!viewEl) {
      return;
    }

    this.teardownModalViewCountSubscription();

    if (!pointer || !pointerKey) {
      return;
    }

    if (this.videoModal) {
      this.videoModal.updateViewCountLabel("Loading views…");
      this.videoModal.setViewCountPointer(pointerKey);
    }
    try {
      const token = subscribeToVideoViewCount(pointer, ({ total, status }) => {
        const latestViewEl = this.videoModal?.getViewCountElement() || null;
        if (!latestViewEl) {
          return;
        }

        if (Number.isFinite(total)) {
          const numeric = Number(total);
          if (this.videoModal) {
            this.videoModal.updateViewCountLabel(
              this.formatViewCountLabel(numeric)
            );
          }
          return;
        }

        if (status === "hydrating") {
          if (this.videoModal) {
            this.videoModal.updateViewCountLabel("Loading views…");
          }
        } else {
          if (this.videoModal) {
            this.videoModal.updateViewCountLabel("– views");
          }
        }
      });

      this.modalViewCountUnsub = () => {
        try {
          unsubscribeFromVideoViewCount(pointer, token);
        } catch (error) {
          devLogger.warn(
            "[viewCount] Failed to unsubscribe modal view counter:",
            error
          );
        } finally {
          this.modalViewCountUnsub = null;
        }
      };
    } catch (error) {
      devLogger.warn("[viewCount] Failed to subscribe modal view counter:", error);
      if (this.videoModal) {
        this.videoModal.updateViewCountLabel("– views");
        this.videoModal.setViewCountPointer(null);
      }
    }
  }

  applyModalReactionOptimisticUpdate(nextReaction) {
    if (nextReaction !== "+" && nextReaction !== "-") {
      return null;
    }

    const previousCounts = {
      ...(this.modalReactionState?.counts || {}),
    };
    const previousTotalValue = Number.isFinite(this.modalReactionState?.total)
      ? Math.max(0, Number(this.modalReactionState.total))
      : null;
    const previousReaction = this.modalReactionState?.userReaction || "";

    const likeBefore = this.normalizeReactionCount(previousCounts["+"]);
    const dislikeBefore = this.normalizeReactionCount(previousCounts["-"]);
    const otherCounts = {};
    for (const [key, value] of Object.entries(previousCounts)) {
      if (key === "+" || key === "-") {
        continue;
      }
      otherCounts[key] = this.normalizeReactionCount(value);
    }

    let likeCount = likeBefore;
    let dislikeCount = dislikeBefore;

    if (previousReaction === "+") {
      likeCount = Math.max(0, likeCount - 1);
    } else if (previousReaction === "-") {
      dislikeCount = Math.max(0, dislikeCount - 1);
    }

    if (nextReaction === "+") {
      likeCount += 1;
    } else if (nextReaction === "-") {
      dislikeCount += 1;
    }

    const updatedCounts = {
      ...previousCounts,
      "+": likeCount,
      "-": dislikeCount,
    };

    let updatedTotal = likeCount + dislikeCount;
    for (const value of Object.values(otherCounts)) {
      updatedTotal += this.normalizeReactionCount(value);
    }

    this.modalReactionState = {
      counts: updatedCounts,
      total: updatedTotal,
      userReaction: nextReaction,
    };

    if (this.videoModal?.updateReactionSummary) {
      this.videoModal.updateReactionSummary({
        total: updatedTotal,
        counts: updatedCounts,
        userReaction: nextReaction,
      });
    }

    const fallbackPreviousTotal = Number.isFinite(previousTotalValue)
      ? previousTotalValue
      : likeBefore +
        dislikeBefore +
        Object.values(otherCounts).reduce(
          (sum, value) => sum + this.normalizeReactionCount(value),
          0
        );

    return {
      counts: previousCounts,
      total: fallbackPreviousTotal,
      userReaction: previousReaction,
    };
  }

  restoreModalReactionSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    const countsInput =
      snapshot.counts && typeof snapshot.counts === "object"
        ? snapshot.counts
        : {};
    const counts = { ...countsInput };
    for (const [key, value] of Object.entries(counts)) {
      counts[key] = this.normalizeReactionCount(value);
    }
    if (!Object.prototype.hasOwnProperty.call(counts, "+")) {
      counts["+"] = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(counts, "-")) {
      counts["-"] = 0;
    }

    let total = Number.isFinite(snapshot.total)
      ? Math.max(0, Number(snapshot.total))
      : 0;
    if (!Number.isFinite(total) || total === 0) {
      total = 0;
      for (const value of Object.values(counts)) {
        total += this.normalizeReactionCount(value);
      }
    }

    const userReaction =
      snapshot.userReaction === "+"
        ? "+"
        : snapshot.userReaction === "-"
          ? "-"
          : "";

    this.modalReactionState = {
      counts,
      total,
      userReaction,
    };

    if (this.videoModal?.updateReactionSummary) {
      this.videoModal.updateReactionSummary({
        total,
        counts,
        userReaction,
      });
    }
  }

  async handleVideoReaction(detail = {}) {
    if (!this.videoModal) {
      return;
    }

    const requestedReaction =
      typeof detail.reaction === "string" ? detail.reaction : "";
    const normalizedReaction =
      requestedReaction === "+"
        ? "+"
        : requestedReaction === "-"
          ? "-"
          : "";

    if (!normalizedReaction) {
      return;
    }

    const previousReaction = this.modalReactionState?.userReaction || "";
    const pointer = this.currentVideoPointer;
    const pointerKey = this.currentVideoPointerKey || pointerArrayToKey(pointer);
    if (!pointer || !pointerKey) {
      if (this.videoModal) {
        this.videoModal.setUserReaction(previousReaction);
      }
      devLogger.info(
        "[reaction] Ignoring reaction request until modal pointer is available.",
      );
      return;
    }
    if (normalizedReaction === previousReaction) {
      return;
    }

    if (!this.isUserLoggedIn()) {
      this.showError("Please login to react to videos.");
      this.videoModal.setUserReaction(previousReaction);
      return;
    }

    let rollbackSnapshot = null;
    try {
      rollbackSnapshot = this.applyModalReactionOptimisticUpdate(
        normalizedReaction
      );
    } catch (error) {
      devLogger.warn("[reaction] Failed to apply optimistic reaction state:", error);
    }

    try {
      const result = await reactionCounter.publish(pointer, {
        content: normalizedReaction,
        video: this.currentVideo,
        currentVideoPubkey: this.currentVideo?.pubkey,
        pointerKey,
      });

      if (!result?.ok) {
        if (rollbackSnapshot) {
          this.restoreModalReactionSnapshot(rollbackSnapshot);
        }
        this.showError("Failed to send reaction. Please try again.");
      }
    } catch (error) {
      devLogger.warn("[reaction] Failed to publish reaction:", error);
      if (rollbackSnapshot) {
        this.restoreModalReactionSnapshot(rollbackSnapshot);
      }
      this.showError("Failed to send reaction. Please try again.");
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

  handleProfileChannelLink(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const targetNpub =
      typeof element.dataset.targetNpub === "string"
        ? element.dataset.targetNpub
        : "";
    if (this.profileController) {
      this.profileController.hide();
    }
    if (targetNpub) {
      window.location.hash = `#view=channel-profile&npub=${encodeURIComponent(
        targetNpub,
      )}`;
    }
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

  async handleAddProfile(payload = {}) {
    const loginResult =
      payload && typeof payload === "object" ? payload.loginResult : null;

    if (!loginResult) {
      devLogger.warn(
        "[profileModal] Ignoring add profile callback without an authentication result.",
      );
      return;
    }

    try {
      const { pubkey, authType: loginAuthType, providerId } =
        typeof loginResult === "object" && loginResult
          ? loginResult
          : { pubkey: loginResult };

      const detailAuthType =
        typeof loginResult?.detail?.authType === "string"
          ? loginResult.detail.authType
          : null;
      const detailProviderId =
        typeof loginResult?.detail?.providerId === "string"
          ? loginResult.detail.providerId
          : null;

      const resolvedAuthType = (() => {
        const candidates = [
          detailAuthType,
          loginAuthType,
          detailProviderId,
          providerId,
        ];
        for (const candidate of candidates) {
          if (typeof candidate !== "string") {
            continue;
          }
          const trimmed = candidate.trim();
          if (trimmed) {
            return trimmed;
          }
        }
        return "nip07";
      })();

      const resolvedProviderId = (() => {
        const candidates = [detailProviderId, providerId, resolvedAuthType];
        for (const candidate of candidates) {
          if (typeof candidate !== "string") {
            continue;
          }
          const trimmed = candidate.trim();
          if (trimmed) {
            return trimmed;
          }
        }
        return resolvedAuthType;
      })();

      const normalizedPubkey = this.normalizeHexPubkey(pubkey);
      if (!normalizedPubkey) {
        throw new Error(
          "Received an invalid public key from the authentication provider.",
        );
      }

      const alreadySaved = this.savedProfiles.some(
        (entry) => this.normalizeHexPubkey(entry.pubkey) === normalizedPubkey,
      );
      if (alreadySaved) {
        this.showSuccess("That profile is already saved on this device.");
        return;
      }

      const npub = this.safeEncodeNpub(normalizedPubkey) || "";
      let profileMeta = this.getProfileCacheEntry(normalizedPubkey)?.profile;

      if (!profileMeta) {
        await this.authService.loadOwnProfile(normalizedPubkey);
        profileMeta = this.getProfileCacheEntry(normalizedPubkey)?.profile;
      }

      const name = profileMeta?.name || "";
      const picture =
        profileMeta?.picture || "assets/svg/default-profile.svg";

      this.savedProfiles.push({
        pubkey: normalizedPubkey,
        npub,
        name,
        picture,
        authType: resolvedAuthType,
        providerId: resolvedProviderId,
      });

      persistSavedProfiles({ persistActive: false });
      this.renderSavedProfiles();

      this.showSuccess("Profile added. Select it when you're ready to switch.");
    } catch (error) {
      const cancellationCodes = new Set([
        "login-cancelled",
        "user-cancelled",
        "modal-dismissed",
      ]);
      if (
        error &&
        typeof error === "object" &&
        typeof error.code === "string" &&
        cancellationCodes.has(error.code)
      ) {
        devLogger.log("[profileModal] Add profile flow cancelled.", error);
        return;
      }

      devLogger.error(
        "[profileModal] Failed to add profile via authentication provider:",
        error,
      );

      const message = this.describeLoginError(
        error,
        "Couldn't add that profile. Please try again.",
      );

      const rejectionError =
        error instanceof Error
          ? error
          : new Error(message || "Couldn't add that profile. Please try again.");

      if (message && rejectionError.message !== message) {
        rejectionError.message = message;
      }

      if (
        error &&
        typeof error === "object" &&
        error.code &&
        !rejectionError.code
      ) {
        rejectionError.code = error.code;
      }

      throw rejectionError;
    }
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
        return "Permission to update your block list was denied by your Nostr extension.";
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
        return "Permission to manage hashtag preferences was denied by your signer.";
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
    if (typeof tag !== "string") {
      return "";
    }

    const trimmed = tag.trim().replace(/^#+/, "");
    if (!trimmed) {
      return "";
    }

    return trimmed.toLowerCase();
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

    return {
      interests: this.normalizeHashtagPreferenceList(sourceInterests),
      disinterests: this.normalizeHashtagPreferenceList(sourceDisinterests),
      eventId: rawEventId || null,
      createdAt,
      loaded,
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

    return [interests, disinterests, eventId, createdAt, loaded].join("|");
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

    this.refreshActiveTagPreferenceMenus();
  }

  refreshActiveTagPreferenceMenus() {
    if (!this.tagPreferencePopovers) {
      return;
    }

    const isLoggedIn = this.isUserLoggedIn();
    this.tagPreferencePopovers.forEach((entry) => {
      if (!entry) {
        return;
      }

      const buttons = entry.buttons || {};
      if (!buttons || Object.keys(buttons).length === 0) {
        return;
      }

      try {
        applyTagPreferenceMenuState({
          buttons,
          membership: this.getTagPreferenceMembership(entry.tag),
          isLoggedIn,
        });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh tag preference menu state:",
          error,
        );
      }
    });
  }

  async loadHashtagPreferencesForPubkey(pubkey) {
    if (
      !this.hashtagPreferences ||
      typeof this.hashtagPreferences.load !== "function"
    ) {
      return null;
    }

    try {
      await this.hashtagPreferences.load(pubkey);
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
      try {
        await moderationService.awaitUserBlockRefresh();
      } catch (error) {
        const contextMessage = normalizedReason
          ? ` before ${normalizedReason}`
          : "";
        devLogger.warn(
          `Failed to sync moderation summaries${contextMessage}:`,
          error,
        );
      }
    }

    try {
      await this.loadVideos(forceMainReload);
    } catch (error) {
      const contextMessage = normalizedReason
        ? ` after ${normalizedReason}`
        : "";
      devLogger.error(
        `Failed to refresh recent videos${contextMessage}:`,
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
    // 1) Logout button
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", async () => {
        try {
          await this.requestLogout();
        } catch (error) {
          devLogger.error("Logout failed:", error);
          this.showError("Failed to logout. Please try again.");
        }
      });
    }

    // 2) Profile button
    if (this.profileButton) {
      this.profileButton.addEventListener("click", () => {
        if (!this.profileController) {
          return;
        }

        this.profileController
          .show()
          .catch((error) => {
            devLogger.error("Failed to open profile modal:", error);
          });
      });
    }

    // 3) Upload button => show upload modal
    if (this.uploadButton) {
      this.uploadButton.addEventListener("click", (event) => {
        if (this.uploadModal) {
          const trigger = event?.currentTarget || event?.target || null;
          this.uploadModal.open({ triggerElement: trigger });
        }
      });
    }

    // 4) Login button => show the login modal
    if (this.loginButton) {
      this.loginButton.addEventListener("click", (event) => {
        devLogger.log("Login button clicked!");
        const loginModal =
          prepareStaticModal({ id: "loginModal" }) || document.getElementById("loginModal");
        const trigger = event?.currentTarget || event?.target || null;
        if (loginModal && openStaticModal(loginModal, { triggerElement: trigger })) {
          setGlobalModalState("login", true);
        }
      });
    }

    // 5) Close login modal button => hide modal
    if (this.closeLoginModalBtn) {
      this.closeLoginModalBtn.addEventListener("click", () => {
        devLogger.log("[app.js] closeLoginModal button clicked!");
        if (closeStaticModal("loginModal")) {
          setGlobalModalState("login", false);
        }
      });
    }

    // 6) Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      this.flushWatchHistory("session-end", "beforeunload").catch((error) => {
        devLogger.warn("[beforeunload] Watch history flush failed:", error);
      });
      this.cleanup().catch((err) => {
        devLogger.error("Cleanup before unload failed:", err);
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.flushWatchHistory("session-end", "visibilitychange").catch(
          (error) => {
            devLogger.warn(
              "[visibilitychange] Watch history flush failed:",
              error
            );
          }
        );
      }
    });

    // 7) Handle back/forward navigation => hide video modal
    window.addEventListener("popstate", async () => {
      devLogger.log("[popstate] user navigated back/forward; cleaning modal...");
      await this.hideModal();
    });

    // 8) Event delegation for the “Application Form” button inside the login modal
    document.addEventListener("click", (event) => {
      if (event.target && event.target.id === "openApplicationModal") {
        // Hide the login modal
        if (closeStaticModal("loginModal")) {
          setGlobalModalState("login", false);
        }
        // Show the application modal
        const appModal =
          prepareStaticModal({ id: "nostrFormModal" }) ||
          document.getElementById("nostrFormModal");
        if (appModal) {
          openStaticModal(appModal, { triggerElement: event.target });
        }
      }
    });

  }

  mountVideoListView(container = null) {
    if (!this.videoListView) {
      return null;
    }

    const target = container || document.getElementById("videoList");
    this.videoList = target || null;
    const tagsRoot = document.getElementById("recentVideoTags");
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
      reason === "login" && postLoginResult?.blocksLoaded !== false
        ? "Applying your filters…"
        : "Refreshing videos…";

    this.videoList = isElement(container) ? container : null;
    const tagsRoot = document.getElementById("recentVideoTags");
    this.videoListPopularTags = isElement(tagsRoot) ? tagsRoot : null;
    if (typeof this.videoListView.setPopularTagsContainer === "function") {
      this.videoListView.setPopularTagsContainer(this.videoListPopularTags);
    }

    if (this.videoList) {
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

  async batchFetchProfiles(authorSet) {
    return batchFetchProfilesFromRelays({
      authorSet,
      getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
      setProfileCacheEntry: (pubkey, profile) =>
        this.setProfileCacheEntry(pubkey, profile),
      updateProfileInDOM: (pubkey, profile) =>
        this.updateProfileInDOM(pubkey, profile),
      hex64Regex: HEX64_REGEX,
    });
  }

  updateProfileInDOM(pubkey, profile) {
    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    if (!normalizedPubkey) {
      return;
    }

    const normalizedProfile =
      profile && typeof profile === "object" ? profile : {};

    const pictureUrl =
      typeof normalizedProfile.picture === "string"
        ? normalizedProfile.picture
        : "";

    const resolveProfileName = () => {
      const candidates = [
        normalizedProfile.name,
        normalizedProfile.display_name,
        normalizedProfile.displayName,
      ];
      for (const candidate of candidates) {
        if (typeof candidate !== "string") {
          continue;
        }
        const trimmed = candidate.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return "";
    };

    const resolvedName = resolveProfileName();

    const explicitNpub =
      typeof normalizedProfile.npub === "string"
        ? normalizedProfile.npub.trim()
        : "";

    const encodedPubkeyNpub = this.safeEncodeNpub(normalizedPubkey);
    const resolvedNpub = explicitNpub || encodedPubkeyNpub || "";
    const shortNpubLabel = resolvedNpub
      ? formatShortNpub(resolvedNpub) || resolvedNpub
      : "";

    // For any .author-pic[data-pubkey=...]
    const picEls = document.querySelectorAll(
      `.author-pic[data-pubkey="${normalizedPubkey}"]`
    );
    picEls.forEach((el) => {
      if (!el) {
        return;
      }
      el.src = pictureUrl;
    });

    const nameLabel =
      resolvedName || shortNpubLabel || resolvedNpub || "";

    // For any .author-name[data-pubkey=...]
    const nameEls = document.querySelectorAll(
      `.author-name[data-pubkey="${normalizedPubkey}"]`
    );
    nameEls.forEach((el) => {
      if (!el) {
        return;
      }
      el.textContent = nameLabel;
    });

    const npubSelectors = new Set();
    if (resolvedNpub) {
      npubSelectors.add(`.author-npub[data-npub="${resolvedNpub}"]`);
    }
    npubSelectors.add(`.author-npub[data-pubkey="${normalizedPubkey}"]`);

    const npubElements = new Set();
    npubSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el) {
          npubElements.add(el);
        }
      });
    });

    const npubEls = Array.from(npubElements);

    npubEls.forEach((el) => {
      if (!el) {
        return;
      }

      const displayNpub = resolvedNpub
        ? shortNpubLabel || resolvedNpub
        : "";
      const hasDisplayNpub = Boolean(displayNpub);

      if (hasDisplayNpub) {
        el.textContent = displayNpub;
        el.setAttribute("aria-hidden", "false");
      } else {
        el.textContent = "";
        el.setAttribute("aria-hidden", "true");
      }

      if (resolvedNpub) {
        el.setAttribute("title", resolvedNpub);
        if (el.dataset) {
          el.dataset.npub = resolvedNpub;
        }
      } else {
        el.removeAttribute("title");
        if (el.dataset && "npub" in el.dataset) {
          delete el.dataset.npub;
        }
      }

      if (el.dataset && normalizedPubkey) {
        el.dataset.pubkey = normalizedPubkey;
      }
    });

    if (!nameEls.length && !npubEls.length) {
      return;
    }

    const cardInstances = new Set();
    const collectCardInstance = (el) => {
      if (!el || typeof el.closest !== "function") {
        return;
      }
      const cardRoot = el.closest('[data-component="similar-content-card"]');
      if (!cardRoot) {
        return;
      }
      const instance = cardRoot.__bitvidSimilarContentCard;
      if (instance && typeof instance.updateIdentity === "function") {
        cardInstances.add(instance);
      }
    };

    nameEls.forEach(collectCardInstance);
    npubEls.forEach(collectCardInstance);

    if (cardInstances.size) {
      const identityPayload = {
        name: resolvedName,
        npub: resolvedNpub,
        shortNpub: shortNpubLabel,
        pubkey: normalizedPubkey,
      };

      cardInstances.forEach((card) => {
        try {
          card.updateIdentity(identityPayload);
        } catch (error) {
          if (devLogger?.warn) {
            devLogger.warn(
              "[app] Failed to update similar content card identity",
              error
            );
          }
        }
      });
    }
  }

  async publishVideoNote(payload, { onSuccess, suppressModalClose } = {}) {
    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return false;
    }

    const normalizeString = (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      if (typeof value === "number") {
        return Number.isFinite(value) ? String(value).trim() : "";
      }
      return String(value ?? "").trim();
    };

    const parseNumberOrNull = (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseUnixSeconds = (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        const normalized = value > 1e12 ? value / 1000 : value;
        return Math.floor(normalized);
      }
      const trimmed = normalizeString(value);
      if (!trimmed) {
        return null;
      }
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const normalized = numeric > 1e12 ? numeric / 1000 : numeric;
        return Math.floor(normalized);
      }
      const timestamp = Date.parse(trimmed);
      if (!Number.isNaN(timestamp)) {
        return Math.floor(timestamp / 1000);
      }
      return null;
    };

    const normalizeStringArray = (input) => {
      if (!Array.isArray(input)) {
        return [];
      }
      return input
        .map((entry) => normalizeString(entry))
        .filter((entry) => Boolean(entry));
    };

    const normalizeBooleanFlag = (value, defaultValue = false) => {
      if (value === true) {
        return true;
      }
      if (value === false) {
        return false;
      }
      return Boolean(defaultValue);
    };

    const normalizeImetaVariant = (variant) => {
      if (!variant || typeof variant !== "object") {
        return null;
      }
      const normalized = {};
      const m = normalizeString(variant.m);
      if (m) normalized.m = m;
      const dim = normalizeString(variant.dim);
      if (dim) normalized.dim = dim;
      const url = normalizeString(variant.url);
      if (url) normalized.url = url;
      const x = normalizeString(variant.x);
      if (x) normalized.x = x;
      const image = normalizeStringArray(variant.image);
      if (image.length) normalized.image = image;
      const fallback = normalizeStringArray(variant.fallback);
      if (fallback.length) normalized.fallback = fallback;
      const service = normalizeStringArray(variant.service);
      if (service.length) normalized.service = service;
      if (variant.autoGenerated === true) {
        normalized.autoGenerated = true;
      }

      return Object.keys(normalized).length ? normalized : null;
    };

    const normalizeSegments = (segments) => {
      if (!Array.isArray(segments)) {
        return [];
      }
      return segments
        .map((segment) => {
          if (!segment || typeof segment !== "object") {
            return null;
          }
          const startRaw = segment.start;
          const endRaw = segment.end;
          const start = parseNumberOrNull(startRaw);
          const end = parseNumberOrNull(endRaw);
          const normalizedSegment = {};
          if (start !== null) {
            normalizedSegment.start = start;
          } else {
            const startString = normalizeString(startRaw);
            if (startString) {
              normalizedSegment.start = startString;
            }
          }
          if (end !== null) {
            normalizedSegment.end = end;
          } else {
            const endString = normalizeString(endRaw);
            if (endString) {
              normalizedSegment.end = endString;
            }
          }
          const title = normalizeString(segment.title);
          if (title) {
            normalizedSegment.title = title;
          }
          const thumbnail = normalizeString(segment.thumbnail);
          if (thumbnail) {
            normalizedSegment.thumbnail = thumbnail;
          }
          return Object.keys(normalizedSegment).length ? normalizedSegment : null;
        })
        .filter(Boolean);
    };

    const normalizeTextTracks = (tracks) => {
      if (!Array.isArray(tracks)) {
        return [];
      }
      return tracks
        .map((track) => {
          if (!track || typeof track !== "object") {
            return null;
          }
          const normalizedTrack = {};
          const url = normalizeString(track.url);
          if (url) normalizedTrack.url = url;
          const type = normalizeString(track.type);
          if (type) normalizedTrack.type = type;
          const language = normalizeString(track.language);
          if (language) normalizedTrack.language = language;
          return Object.keys(normalizedTrack).length ? normalizedTrack : null;
        })
        .filter(Boolean);
    };

    const normalizeParticipants = (participants) => {
      if (!Array.isArray(participants)) {
        return [];
      }
      return participants
        .map((participant) => {
          if (!participant || typeof participant !== "object") {
            return null;
          }
          const normalizedParticipant = {};
          const pubkey = normalizeString(participant.pubkey);
          if (pubkey) normalizedParticipant.pubkey = pubkey;
          const relay = normalizeString(participant.relay);
          if (relay) normalizedParticipant.relay = relay;
          return Object.keys(normalizedParticipant).length
            ? normalizedParticipant
            : null;
        })
        .filter(Boolean);
    };

    const normalizeNip71Metadata = (rawMetadata) => {
      if (!rawMetadata || typeof rawMetadata !== "object") {
        return null;
      }

      const normalized = {};

      if (rawMetadata.kind !== undefined) {
        const kindNumber = parseNumberOrNull(rawMetadata.kind);
        if (kindNumber !== null) {
          normalized.kind = kindNumber;
        } else {
          const kindString = normalizeString(rawMetadata.kind);
          if (kindString) {
            normalized.kind = kindString;
          }
        }
      }

      const summary = normalizeString(rawMetadata.summary);
      if (summary) {
        normalized.summary = summary;
      }

      const publishedAt = parseUnixSeconds(rawMetadata.publishedAt);
      if (publishedAt !== null) {
        normalized.publishedAt = publishedAt;
      }

      const alt = normalizeString(rawMetadata.alt);
      if (alt) {
        normalized.alt = alt;
      }

      const duration = parseNumberOrNull(rawMetadata.duration);
      if (duration !== null) {
        normalized.duration = duration;
      }

      const contentWarning = normalizeString(rawMetadata.contentWarning);
      if (contentWarning) {
        normalized.contentWarning = contentWarning;
      }

      const imeta = Array.isArray(rawMetadata.imeta)
        ? rawMetadata.imeta
            .map((variant) => normalizeImetaVariant(variant))
            .filter(Boolean)
        : [];
      if (imeta.length) {
        normalized.imeta = imeta;
      }

      const textTracks = normalizeTextTracks(rawMetadata.textTracks);
      if (textTracks.length) {
        normalized.textTracks = textTracks;
      }

      const segments = normalizeSegments(rawMetadata.segments);
      if (segments.length) {
        normalized.segments = segments;
      }

      const hashtags = normalizeStringArray(rawMetadata.hashtags);
      if (hashtags.length) {
        normalized.hashtags = hashtags;
      }

      const participants = normalizeParticipants(rawMetadata.participants);
      if (participants.length) {
        normalized.participants = participants;
      }

      const references = normalizeStringArray(rawMetadata.references);
      if (references.length) {
        normalized.references = references;
      }

      return Object.keys(normalized).length ? normalized : null;
    };

    const rawPayload = payload && typeof payload === "object" ? payload : {};
    const legacyPayload =
      rawPayload.legacyFormData &&
      typeof rawPayload.legacyFormData === "object"
        ? rawPayload.legacyFormData
        : rawPayload;

    const rawNip71 =
      (rawPayload.nip71 && typeof rawPayload.nip71 === "object"
        ? rawPayload.nip71
        : null) ||
      (legacyPayload.nip71 && typeof legacyPayload.nip71 === "object"
        ? legacyPayload.nip71
        : null);

    const title = normalizeString(legacyPayload?.title || "");
    const url = normalizeString(legacyPayload?.url || "");
    const magnet = normalizeString(legacyPayload?.magnet || "");
    const thumbnail = normalizeString(legacyPayload?.thumbnail || "");
    const description = normalizeString(legacyPayload?.description || "");
    const ws = normalizeString(legacyPayload?.ws || "");
    const xs = normalizeString(legacyPayload?.xs || "");
    const rawMode = normalizeString(legacyPayload?.mode || "");
    const normalizedMode =
      rawMode && rawMode.toLowerCase() === "dev" ? "dev" : "live";
    const enableComments = normalizeBooleanFlag(
      legacyPayload?.enableComments,
      true
    );
    const rawIsNsfw = normalizeBooleanFlag(legacyPayload?.isNsfw, false);
    const rawIsForKids = normalizeBooleanFlag(legacyPayload?.isForKids, false);
    const isNsfw = rawIsNsfw;
    const isForKids = rawIsNsfw ? false : rawIsForKids;

    const legacyFormData = {
      version: 3,
      title,
      url,
      magnet,
      thumbnail,
      description,
      mode: normalizedMode,
      enableComments,
      isNsfw,
      isForKids,
    };

    const normalizedNip71 = normalizeNip71Metadata(rawNip71);

    const hasLegacySource = Boolean(legacyFormData.url || legacyFormData.magnet);
    const hasImetaVariant = Boolean(
      normalizedNip71?.imeta?.some((variant) =>
        Boolean(
          (variant.url && variant.url.length) ||
            (variant.m && variant.m.length) ||
            (variant.x && variant.x.length) ||
            (variant.dim && variant.dim.length) ||
            (Array.isArray(variant.image) && variant.image.length > 0) ||
            (Array.isArray(variant.fallback) && variant.fallback.length > 0) ||
            (Array.isArray(variant.service) && variant.service.length > 0)
        )
      )
    );

    if (!legacyFormData.title) {
      this.showError("Title is required.");
      return false;
    }

    if (!hasLegacySource && !hasImetaVariant) {
      this.showError(
        "Provide a hosted URL, magnet link, or an imeta variant before publishing."
      );
      return false;
    }

    if (legacyFormData.url && !/^https:\/\//i.test(legacyFormData.url)) {
      this.showError("Hosted video URLs must use HTTPS.");
      return false;
    }

    if (legacyFormData.magnet) {
      const normalizedMagnet = normalizeAndAugmentMagnet(legacyFormData.magnet, {
        ws,
        xs,
      });
      legacyFormData.magnet = normalizedMagnet;
      const hints = extractMagnetHints(normalizedMagnet);
      legacyFormData.ws = hints.ws;
      legacyFormData.xs = hints.xs;
    } else {
      legacyFormData.ws = "";
      legacyFormData.xs = "";
    }

    const publishPayload = {
      legacyFormData,
    };

    if (normalizedNip71) {
      publishPayload.nip71 = normalizedNip71;
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
    const payload = event?.detail?.payload || {};

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
  }

  async handleProfileSwitchRequest({ pubkey, providerId } = {}) {
    if (!pubkey) {
      throw new Error("Missing pubkey for profile switch request.");
    }

    const result = await this.authService.switchProfile(pubkey, { providerId });

    if (result?.switched) {
      const detail = result.detail || null;

      if (
        detail?.postLoginPromise &&
        typeof detail.postLoginPromise.then === "function"
      ) {
        try {
          await detail.postLoginPromise;
        } catch (error) {
          devLogger.warn(
            "Failed to complete post-login hydration before continuing after profile switch:",
            error,
          );
        }
      }

      let refreshPromise = null;
      if (
        this.lastIdentityRefreshPromise &&
        typeof this.lastIdentityRefreshPromise.then === "function"
      ) {
        refreshPromise = this.lastIdentityRefreshPromise;
      }

      if (refreshPromise) {
        try {
          await refreshPromise;
        } catch (error) {
          devLogger.error(
            "Failed to refresh UI after switching profiles:",
            error,
          );
        }
      } else {
        try {
          await this.refreshAllVideoGrids({
            reason: "profile-switch",
            forceMainReload: true,
          });
        } catch (error) {
          devLogger.error(
            "Failed to refresh video grids after switching profiles:",
            error,
          );
        }
      }

      if (this.watchHistoryTelemetry?.resetPlaybackLoggingState) {
        try {
          this.watchHistoryTelemetry.resetPlaybackLoggingState();
        } catch (error) {
          devLogger.warn(
            "Failed to reset watch history telemetry after profile switch:",
            error,
          );
        }
      }

      if (this.watchHistoryTelemetry?.refreshPreferenceSettings) {
        try {
          this.watchHistoryTelemetry.refreshPreferenceSettings();
        } catch (error) {
          devLogger.warn(
            "Failed to refresh watch history preferences after profile switch:",
            error,
          );
        }
      }
    }

    return result;
  }

  async handleProfileRelayOperation({
    action,
    url,
    activePubkey,
    skipPublishIfUnchanged = true,
  } = {}) {
    const context = {
      action,
      url,
      ok: false,
      changed: false,
      reason: null,
      error: null,
      publishResult: null,
      operationResult: null,
    };

    if (!activePubkey) {
      context.reason = "no-active-pubkey";
      return context;
    }

    const previous = relayManager.snapshot();

    let operationResult;
    try {
      switch (action) {
        case "add":
          operationResult = relayManager.addRelay(url);
          break;
        case "remove":
          operationResult = relayManager.removeRelay(url);
          break;
        case "restore":
          operationResult = relayManager.restoreDefaults();
          break;
        case "mode-toggle":
          operationResult = relayManager.cycleRelayMode(url);
          break;
        default: {
          const error = Object.assign(new Error("Unknown relay operation."), {
            code: "invalid-operation",
          });
          throw error;
        }
      }
    } catch (error) {
      context.reason = error?.code || "operation-error";
      context.error = error;
      return context;
    }

    context.operationResult = operationResult;
    context.changed = Boolean(operationResult?.changed);

    if (!context.changed && skipPublishIfUnchanged) {
      context.reason = operationResult?.reason || "unchanged";
      return context;
    }

    try {
      const publishResult = await relayManager.publishRelayList(activePubkey);
      if (!publishResult?.ok) {
        throw Object.assign(new Error("No relays accepted the update."), {
          code: "publish-failed",
        });
      }
      context.ok = true;
      context.publishResult = publishResult;

      const refreshReason = `relay-${action || "update"}`;
      try {
        await this.onVideosShouldRefresh({ reason: refreshReason });
      } catch (refreshError) {
        devLogger.warn(
          "[Profile] Failed to refresh videos after relay update:",
          refreshError,
        );
      }

      return context;
    } catch (error) {
      context.reason = error?.code || "publish-failed";
      context.error = error;
      try {
        if (Array.isArray(previous)) {
          relayManager.setEntries(previous, { allowEmpty: false });
        }
      } catch (restoreError) {
        devLogger.warn(
          "[Profile] Failed to restore relay preferences after publish error:",
          restoreError,
        );
      }
      return context;
    }
  }

  handleProfileRelayModeToggle(payload = {}) {
    return payload?.context || null;
  }

  handleProfileRelayRestore(payload = {}) {
    return payload?.context || null;
  }

  async handleProfileBlocklistMutation({
    action,
    actorHex,
    targetHex,
  } = {}) {
    const context = { ok: false, reason: null, error: null };

    if (!actorHex || !targetHex) {
      context.reason = "invalid-target";
      return context;
    }

    try {
      await userBlocks.ensureLoaded(actorHex);
      const isBlocked = userBlocks.isBlocked(targetHex);

      if (action === "add") {
        if (isBlocked) {
          context.reason = "already-blocked";
          return context;
        }
        await userBlocks.addBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "blocked";
      } else if (action === "remove") {
        if (!isBlocked) {
          context.reason = "not-blocked";
          return context;
        }
        await userBlocks.removeBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "unblocked";
      } else {
        context.reason = "invalid-action";
        return context;
      }

      if (context.ok) {
        try {
          await this.onVideosShouldRefresh({ reason: `blocklist-${action}` });
        } catch (refreshError) {
          devLogger.error(
            "Failed to refresh videos after blocklist mutation:",
            refreshError,
          );
        }
      }

      return context;
    } catch (error) {
      context.error = error;
      context.reason = error?.code || "service-error";
      return context;
    }
  }

  async handleProfileAdminMutation(payload = {}) {
    const action = payload?.action;
    const context = { ok: false, error: null, result: null };

    try {
      switch (action) {
        case "ensure-ready":
          await accessControl.ensureReady();
          context.ok = true;
          break;
        case "add-moderator":
          context.result = await accessControl.addModerator(
            payload.actorNpub,
            payload.targetNpub,
          );
          context.ok = !!context.result?.ok;
          break;
        case "remove-moderator":
          context.result = await accessControl.removeModerator(
            payload.actorNpub,
            payload.targetNpub,
          );
          context.ok = !!context.result?.ok;
          break;
        case "list-mutation":
          if (payload.listType === "whitelist") {
            context.result =
              payload.mode === "add"
                ? await accessControl.addToWhitelist(
                    payload.actorNpub,
                    payload.targetNpub,
                  )
                : await accessControl.removeFromWhitelist(
                    payload.actorNpub,
                    payload.targetNpub,
                  );
          } else {
            context.result =
              payload.mode === "add"
                ? await accessControl.addToBlacklist(
                    payload.actorNpub,
                    payload.targetNpub,
                  )
                : await accessControl.removeFromBlacklist(
                    payload.actorNpub,
                    payload.targetNpub,
                  );
          }
          context.ok = !!context.result?.ok;
          break;
        default:
          context.error = Object.assign(
            new Error("Unknown admin mutation."),
            { code: "invalid-action" },
          );
      }
    } catch (error) {
      context.error = error;
      return context;
    }

    return context;
  }

  async handleProfileWalletPersist(options = {}) {
    return this.nwcSettingsService.handleProfileWalletPersist(options);
  }

  async handleProfileWalletTest({ nwcUri, defaultZap } = {}) {
    return this.nwcSettingsService.ensureWallet({ nwcUri, defaultZap });
  }

  async handleProfileWalletDisconnect() {
    return this.nwcSettingsService.updateActiveNwcSettings(
      this.nwcSettingsService.createDefaultNwcSettings(),
    );
  }

  handleProfileAdminNotifyError({ error } = {}) {
    if (!error) {
      return;
    }
    devLogger.warn("[admin] Notification dispatch issue:", error);
  }

  handleProfileHistoryEvent() {
    return null;
  }

  async handleModerationSettingsChange({ settings } = {}) {
    const normalized = this.normalizeModerationSettings(settings);
    this.moderationSettings = normalized;

    if (this.videosMap instanceof Map) {
      for (const video of this.videosMap.values()) {
        if (video && typeof video === "object") {
          this.decorateVideoModeration(video);
        }
      }
    }

    if (
      this.videoListView &&
      Array.isArray(this.videoListView.videoCardInstances)
    ) {
      for (const card of this.videoListView.videoCardInstances) {
        if (!card || typeof card.refreshModerationUi !== "function") {
          continue;
        }
        if (card.video && typeof card.video === "object") {
          this.decorateVideoModeration(card.video);
        }
        try {
          card.refreshModerationUi();
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to refresh moderation UI:",
            error,
          );
        }
      }
    }

    if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
      for (const video of this.videoListView.currentVideos) {
        if (video && typeof video === "object") {
          this.decorateVideoModeration(video);
        }
      }
    }

    if (this.currentVideo && typeof this.currentVideo === "object") {
      this.decorateVideoModeration(this.currentVideo);
    }

    try {
      await this.onVideosShouldRefresh({ reason: "moderation-settings-change" });
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to refresh videos after moderation settings change:",
        error,
      );
    }

    return normalized;
  }

  updateActiveProfileUI(pubkey, profile = {}) {
    if (this.profileController) {
      this.profileController.handleProfileUpdated({
        pubkey,
        profile,
      });
      return;
    }

    const picture = profile.picture || "assets/svg/default-profile.svg";

    if (this.profileAvatar) {
      this.profileAvatar.src = picture;
    }

    const channelLink = document.getElementById("profileChannelLink");
    if (channelLink instanceof HTMLElement) {
      const targetNpub = this.safeEncodeNpub(pubkey);
      if (targetNpub) {
        channelLink.href = `#view=channel-profile&npub=${targetNpub}`;
        channelLink.dataset.targetNpub = targetNpub;
        channelLink.classList.remove("hidden");
      } else {
        channelLink.removeAttribute("href");
        if (channelLink.dataset) {
          delete channelLink.dataset.targetNpub;
        }
        channelLink.classList.add("hidden");
      }
    }
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

    const sessionActorPubkey = this.normalizeHexPubkey(
      nostrClient?.sessionActor?.pubkey,
    );
    if (sessionActorPubkey && sessionActorPubkey === normalizedPubkey) {
      return false;
    }

    return true;
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

  applyAuthenticatedUiState() {
    if (this.loginButton) {
      this.loginButton.classList.add("hidden");
      this.loginButton.setAttribute("hidden", "");
    }

    if (this.logoutButton) {
      this.logoutButton.classList.remove("hidden");
    }

    if (this.userStatus) {
      this.userStatus.classList.add("hidden");
    }

    if (this.uploadButton) {
      this.uploadButton.classList.remove("hidden");
      this.uploadButton.removeAttribute("hidden");
    }

    if (this.profileButton) {
      this.profileButton.classList.remove("hidden");
      this.profileButton.removeAttribute("hidden");
    }

    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.remove("hidden");
    }
  }

  applyLoggedOutUiState() {
    if (this.loginButton) {
      this.loginButton.classList.remove("hidden");
      this.loginButton.removeAttribute("hidden");
    }

    if (this.logoutButton) {
      this.logoutButton.classList.add("hidden");
    }

    if (this.userStatus) {
      this.userStatus.classList.add("hidden");
    }

    if (this.userPubKey) {
      this.userPubKey.textContent = "";
    }

    if (this.uploadButton) {
      this.uploadButton.classList.add("hidden");
      this.uploadButton.setAttribute("hidden", "");
    }

    if (this.profileButton) {
      this.profileButton.classList.add("hidden");
      this.profileButton.setAttribute("hidden", "");
    }

    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.add("hidden");
    }
  }

  syncAuthUiState() {
    if (this.isUserLoggedIn()) {
      this.applyAuthenticatedUiState();
    } else {
      this.applyLoggedOutUiState();
    }
  }

  maybeShowExperimentalLoginWarning(provider) {
    const normalizedProvider =
      typeof provider === "string" ? provider.trim().toLowerCase() : "";

    if (normalizedProvider !== "nsec" && normalizedProvider !== "nip46") {
      return;
    }

    const now = Date.now();
    if (
      this.lastExperimentalWarningKey === normalizedProvider &&
      typeof this.lastExperimentalWarningAt === "number" &&
      now - this.lastExperimentalWarningAt < 2000
    ) {
      return;
    }

    this.lastExperimentalWarningKey = normalizedProvider;
    this.lastExperimentalWarningAt = now;

    const providerLabel =
      normalizedProvider === "nsec"
        ? "Direct nsec or seed"
        : "NIP-46 remote signer";

    this.showStatus(
      `${providerLabel} logins are still in development and may not work well yet. We recommend using a NIP-07 browser extension for the most reliable experience.`,
      { showSpinner: false, autoHideMs: 5000 },
    );
  }

  async handleAuthLogin(detail = {}) {
    const postLoginPromise =
      detail && typeof detail.postLoginPromise?.then === "function"
        ? detail.postLoginPromise
        : Promise.resolve(detail?.postLogin ?? null);

    if (detail && typeof detail === "object") {
      try {
        detail.__handled = true;
      } catch (error) {
        // Ignore attempts to mutate read-only descriptors.
      }
    }

    if (detail?.identityChanged) {
      this.resetViewLoggingState();
    }

    this.applyAuthenticatedUiState();
    this.applyCommentComposerAuthState();

    const rawProviderId =
      typeof detail?.providerId === "string" ? detail.providerId.trim() : "";
    const rawAuthType =
      typeof detail?.authType === "string" ? detail.authType.trim() : "";
    const normalizedProvider =
      (rawProviderId || rawAuthType).toLowerCase() || "";

    this.maybeShowExperimentalLoginWarning(normalizedProvider);

    const loginContext = {
      pubkey: detail?.pubkey || this.pubkey,
      previousPubkey: detail?.previousPubkey,
      identityChanged: Boolean(detail?.identityChanged),
    };

    if (loginContext.identityChanged) {
      this.resetHashtagPreferencesState();
      try {
        this.watchHistoryTelemetry?.resetPlaybackLoggingState?.();
        this.watchHistoryTelemetry?.refreshPreferenceSettings?.();
      } catch (error) {
        devLogger.warn(
          "Failed to refresh watch history telemetry after identity change:",
          error,
        );
      }
    }

    const hashtagPreferencesPromise = Promise.resolve(
      this.loadHashtagPreferencesForPubkey(loginContext.pubkey),
    );

    if (this.zapController) {
      try {
        this.zapController.setVisibility(
          Boolean(this.currentVideo?.lightningAddress),
        );
      } catch (error) {
        devLogger.warn("[Application] Failed to refresh zap visibility after login:", error);
      }
    }

    const shouldReopenZap = this.pendingModalZapOpen;
    this.pendingModalZapOpen = false;
    if (shouldReopenZap) {
      const hasLightning = Boolean(this.currentVideo?.lightningAddress);
      if (hasLightning && this.videoModal?.openZapDialog) {
        Promise.resolve()
          .then(() => this.videoModal.openZapDialog())
          .then((opened) => {
            if (opened) {
              this.zapController?.open();
            }
          })
          .catch((error) => {
            devLogger.warn(
              "[Application] Failed to reopen zap dialog after login:",
              error,
            );
          });
      }
    }

    this.dispatchAuthChange({
      status: "login",
      loggedIn: true,
      pubkey: loginContext.pubkey || null,
      previousPubkey: loginContext.previousPubkey || null,
    });

    const nwcPromise = Promise.resolve()
      .then(() => this.nwcSettingsService.onLogin(loginContext))
      .catch((error) => {
        devLogger.error("Failed to process NWC settings during login:", error);
        return null;
      });

    if (this.profileController) {
      try {
        const maybePromise = this.profileController.handleAuthLogin(detail);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((error) => {
            devLogger.error(
              "Failed to process login within the profile controller:",
              error,
            );
          });
        }
      } catch (error) {
        devLogger.error(
          "Failed to process login within the profile controller:",
          error,
        );
      }
    } else {
      this.renderSavedProfiles();
    }

    const activePubkey = detail?.pubkey || this.pubkey;
    postLoginPromise
      .then((postLogin) => {
        if (activePubkey && postLogin?.profile) {
          this.updateActiveProfileUI(activePubkey, postLogin.profile);
        }
        this.forceRefreshAllProfiles();
      })
      .catch((error) => {
        devLogger.error("Post-login hydration failed:", error);
      });

    let postLoginResult = null;
    try {
      postLoginResult = await postLoginPromise;
    } catch (error) {
      devLogger.error("Post-login processing failed:", error);
    }

    await nwcPromise;
    await hashtagPreferencesPromise;

    try {
      await accessControl.ensureReady();
    } catch (error) {
      userLogger.error(
        "[Application] Failed to refresh admin lists after login:",
        error,
      );
    }

    if (activePubkey) {
      const aggregatedBlacklist = accessControl.getBlacklist();
      try {
        await userBlocks.seedWithNpubs(
          activePubkey,
          Array.isArray(aggregatedBlacklist) ? aggregatedBlacklist : [],
        );
      } catch (error) {
        if (
          error?.code === "extension-permission-denied" ||
          error?.code === "nip04-missing" ||
          error?.name === "RelayPublishError"
        ) {
          userLogger.error(
            "[Application] Failed to seed shared block list after login:",
            error,
          );
        } else {
          devLogger.error(
            "[Application] Unexpected error while seeding shared block list:",
            error,
          );
        }
      }
    }

    try {
      this.reinitializeVideoListView({ reason: "login", postLoginResult });
    } catch (error) {
      devLogger.warn("Failed to reinitialize video list view after login:", error);
    }

    try {
      this.lastIdentityRefreshPromise = this.refreshAllVideoGrids({
        reason: "auth-login",
        forceMainReload: true,
      });
      await this.lastIdentityRefreshPromise;
    } catch (error) {
      devLogger.error("Failed to refresh video grids after login:", error);
    } finally {
      this.lastIdentityRefreshPromise = null;
    }

    this.forceRefreshAllProfiles();

    if (this.uploadModal?.refreshCloudflareBucketPreview) {
      await this.uploadModal.refreshCloudflareBucketPreview();
    }
  }

  async requestLogout() {
    const detail = await this.authService.logout();

    if (detail && typeof detail === "object") {
      if (detail.__handled === true) {
        return detail;
      }

      try {
        detail.__handled = true;
      } catch (error) {
        devLogger.warn("Failed to mark logout detail as handled:", error);
      }
    }

    await this.handleAuthLogout(detail);
    return detail ?? null;
  }

  async handleAuthLogout(detail = {}) {
    if (detail && typeof detail === "object") {
      try {
        detail.__handled = true;
      } catch (error) {
        devLogger.warn("Failed to mark logout detail as handled:", error);
      }
    }

    this.resetViewLoggingState();
    this.pendingModalZapOpen = false;

    this.resetHashtagPreferencesState();

    await this.nwcSettingsService.onLogout({
      pubkey: detail?.pubkey || this.pubkey,
      previousPubkey: detail?.previousPubkey,
    });

    if (this.profileController) {
      try {
        await this.profileController.handleAuthLogout(detail);
      } catch (error) {
        devLogger.error(
          "Failed to process logout within the profile controller:",
          error,
        );
      }
    } else {
      this.renderSavedProfiles();
    }

    this.applyLoggedOutUiState();
    this.applyCommentComposerAuthState();

    if (this.videoModal?.closeZapDialog) {
      try {
        this.videoModal.closeZapDialog({ silent: true, restoreFocus: false });
      } catch (error) {
        devLogger.warn("Failed to close zap dialog during logout:", error);
      }
    }

    if (this.zapController) {
      try {
        this.zapController.resetState();
        this.zapController.setVisibility(Boolean(this.currentVideo?.lightningAddress));
      } catch (error) {
        devLogger.warn("Failed to reset zap controller during logout:", error);
      }
    }

    if (typeof this.nostrService?.clearVideoSubscription === "function") {
      try {
        this.nostrService.clearVideoSubscription();
      } catch (error) {
        devLogger.warn("Failed to clear video subscription during logout:", error);
      }
    }

    if (typeof this.nostrService?.resetVideosCache === "function") {
      try {
        this.nostrService.resetVideosCache();
      } catch (error) {
        devLogger.warn("Failed to reset cached videos during logout:", error);
      }
    }

    await this.renderVideoList({
      videos: [],
      metadata: { reason: "auth:logout" },
    });

    this.dispatchAuthChange({
      status: "logout",
      loggedIn: false,
      pubkey: detail?.pubkey || null,
      previousPubkey: detail?.previousPubkey || null,
    });

    try {
      await this.loadVideos(true);
    } catch (error) {
      devLogger.error("Failed to refresh videos after logout:", error);
    }
    this.forceRefreshAllProfiles();
    if (this.uploadModal?.refreshCloudflareBucketPreview) {
      await this.uploadModal.refreshCloudflareBucketPreview();
    }
  }

  handleProfileUpdated(detail = {}) {
    if (this.profileController) {
      this.profileController.handleProfileUpdated(detail);
    } else if (Array.isArray(detail?.savedProfiles)) {
      this.renderSavedProfiles();
    }

    const normalizedPubkey = detail?.pubkey
      ? this.normalizeHexPubkey(detail.pubkey)
      : null;
    const profile = detail?.profile;

    if (normalizedPubkey && profile) {
      this.updateProfileInDOM(normalizedPubkey, profile);
      if (
        !this.profileController &&
        this.normalizeHexPubkey(this.pubkey) === normalizedPubkey
      ) {
        this.updateActiveProfileUI(normalizedPubkey, profile);
      }
    }
  }

  /**
   * Cleanup resources on unload or modal close.
   */
  async cleanup({ preserveSubscriptions = false, preserveObservers = false } = {}) {
    this.log(
      `[cleanup] Requested (preserveSubscriptions=${preserveSubscriptions}, preserveObservers=${preserveObservers})`
    );
    // Serialise teardown so overlapping calls (e.g. close button spam) don't
    // race each other and clobber a fresh playback setup.
    if (this.cleanupPromise) {
      this.log("[cleanup] Waiting for in-flight cleanup to finish before starting a new run.");
      try {
        await this.cleanupPromise;
      } catch (err) {
        devLogger.warn("Previous cleanup rejected:", err);
      }
    }

    const runCleanup = async () => {
      this.log(
        `[cleanup] Begin (preserveSubscriptions=${preserveSubscriptions}, preserveObservers=${preserveObservers})`
      );
      try {
        this.cancelPendingViewLogging();
        await this.flushWatchHistory("session-end", "cleanup").catch(
          (error) => {
            const message =
              error && typeof error.message === "string"
                ? error.message
                : String(error ?? "unknown error");
            this.log(`[cleanup] Watch history flush failed: ${message}`);
          }
        );
        this.clearActiveIntervals();
        if (this.playbackService) {
          this.playbackService.cleanupWatchdog();
        }
        this.teardownModalViewCountSubscription();
        this.teardownModalReactionSubscription();

        if (!preserveObservers && this.mediaLoader) {
          this.mediaLoader.disconnect();
        }

        if (!preserveObservers) {
          this.teardownAllViewCountSubscriptions();
        } else {
          this.pruneDetachedViewCountElements();
        }

        if (!preserveSubscriptions) {
          this.nostrService.clearVideoSubscription();
          this.videoSubscription = this.nostrService.getVideoSubscription() || null;
        }

        // If there's a small inline player
        if (this.videoElement) {
          this.videoElement = this.teardownVideoElement(this.videoElement);
        }
        if (
          this.videoModal &&
          typeof this.videoModal.clearPosterCleanup === "function"
        ) {
          try {
            this.videoModal.clearPosterCleanup();
          } catch (err) {
            devLogger.warn("[cleanup] video modal poster cleanup threw:", err);
          }
        }

        const modalVideoEl = this.modalVideo;
        if (modalVideoEl) {
          const refreshedModal = this.teardownVideoElement(modalVideoEl, {
            replaceNode: true,
          });
          if (refreshedModal) {
            this.modalVideo = refreshedModal;
            if (
              this.videoModal &&
              typeof this.videoModal.setVideoElement === "function"
            ) {
              try {
                this.videoModal.setVideoElement(refreshedModal);
              } catch (err) {
                devLogger.warn(
                  "[cleanup] Failed to sync video modal element after replacement:",
                  err
                );
              }
            }
          }
        }
        // Tell webtorrent to cleanup
        await torrentClient.cleanup();
        this.log("[cleanup] WebTorrent cleanup resolved.");
      } catch (err) {
        devLogger.error("Cleanup error:", err);
      } finally {
        this.log("[cleanup] Finished.");
      }
    };

    const cleanupPromise = runCleanup();
    this.cleanupPromise = cleanupPromise;

    try {
      await cleanupPromise;
    } finally {
      if (this.cleanupPromise === cleanupPromise) {
        this.cleanupPromise = null;
      }
    }
  }

  async waitForCleanup() {
    if (!this.cleanupPromise) {
      return;
    }

    try {
      this.log("[waitForCleanup] Awaiting previous cleanup before continuing.");
      await this.cleanupPromise;
      this.log("[waitForCleanup] Previous cleanup completed.");
    } catch (err) {
      devLogger.warn("waitForCleanup observed a rejected cleanup:", err);
    }
  }

  clearActiveIntervals() {
    if (!Array.isArray(this.activeIntervals) || !this.activeIntervals.length) {
      return;
    }
    this.activeIntervals.forEach((id) => clearInterval(id));
    this.activeIntervals = [];
  }

  cancelPendingViewLogging() {
    this.watchHistoryTelemetry?.cancelPlaybackLogging?.();
  }

  resetViewLoggingState() {
    this.watchHistoryTelemetry?.resetPlaybackLoggingState?.();
  }

  persistWatchHistoryMetadataForVideo(video, pointerInfo) {
    if (this.watchHistoryTelemetry) {
      this.watchHistoryTelemetry.persistMetadataForVideo(video, pointerInfo);
      return;
    }

    if (
      !pointerInfo ||
      !pointerInfo.key ||
      typeof watchHistoryService?.setLocalMetadata !== "function"
    ) {
      return;
    }

    if (!video || typeof video !== "object") {
      return;
    }

    const metadata = {
      video: {
        id: typeof video.id === "string" ? video.id : "",
        title: typeof video.title === "string" ? video.title : "",
        thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
        pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
      },
    };

    try {
      watchHistoryService.setLocalMetadata(pointerInfo.key, metadata);
    } catch (error) {
      devLogger.warn(
        "[watchHistory] Failed to persist local metadata for pointer:",
        pointerInfo.key,
        error,
      );
    }
  }

  dropWatchHistoryMetadata(pointerKey) {
    if (this.watchHistoryTelemetry) {
      this.watchHistoryTelemetry.dropMetadata(pointerKey);
      return;
    }

    if (!pointerKey || typeof pointerKey !== "string") {
      return;
    }
    if (typeof watchHistoryService?.removeLocalMetadata !== "function") {
      return;
    }
    try {
      watchHistoryService.removeLocalMetadata(pointerKey);
    } catch (error) {
      devLogger.warn(
        "[watchHistory] Failed to remove cached metadata for pointer:",
        pointerKey,
        error,
      );
    }
  }

  async handleRemoveHistoryAction(dataset = {}, { trigger } = {}) {
    if (!this.watchHistoryController) {
      this.showError("Watch history sync is not available right now.");
      return;
    }

    try {
      await this.watchHistoryController.removeEntry({
        dataset,
        trigger,
        removeCard: dataset.removeCard === "true",
        reason: dataset.reason || "remove-item",
      });
    } catch (error) {
      if (!error?.handled) {
        this.showError("Failed to remove from history. Please try again.");
      }
    }
  }

  async handleWatchHistoryRemoval(payload = {}) {
    if (!this.watchHistoryTelemetry) {
      this.showError("Watch history sync is not available right now.");
      const error = new Error("watch-history-disabled");
      error.handled = true;
      throw error;
    }
    return this.watchHistoryTelemetry.handleRemoval(payload);
  }

  flushWatchHistory(reason = "session-end", context = "watch-history") {
    if (!this.watchHistoryTelemetry) {
      return Promise.resolve();
    }
    return this.watchHistoryTelemetry.flush(reason, context);
  }

  getActiveViewIdentityKey() {
    if (!this.watchHistoryTelemetry) {
      const normalizedUser = this.normalizeHexPubkey(this.pubkey);
      if (normalizedUser) {
        return `actor:${normalizedUser}`;
      }

      const sessionActorPubkey = this.normalizeHexPubkey(
        nostrClient?.sessionActor?.pubkey
      );
      if (sessionActorPubkey) {
        return `actor:${sessionActorPubkey}`;
      }

      return "actor:anonymous";
    }

    return this.watchHistoryTelemetry.getActiveViewIdentityKey();
  }

  deriveViewIdentityKeyFromEvent(event) {
    if (!this.watchHistoryTelemetry) {
      if (!event || typeof event !== "object") {
        return "";
      }

      const normalizedPubkey = this.normalizeHexPubkey(event.pubkey);
      if (!normalizedPubkey) {
        return "";
      }

      return `actor:${normalizedPubkey}`;
    }

    return this.watchHistoryTelemetry.deriveViewIdentityKeyFromEvent(event);
  }

  buildViewCooldownKey(pointerKey, identityKey) {
    if (!this.watchHistoryTelemetry) {
      const normalizedPointerKey =
        typeof pointerKey === "string" && pointerKey.trim()
          ? pointerKey.trim()
          : "";
      if (!normalizedPointerKey) {
        return "";
      }

      const normalizedIdentity =
        typeof identityKey === "string" && identityKey.trim()
          ? identityKey.trim().toLowerCase()
          : "";

      return normalizedIdentity
        ? `${normalizedPointerKey}::${normalizedIdentity}`
        : normalizedPointerKey;
    }

    return this.watchHistoryTelemetry.buildViewCooldownKey(
      pointerKey,
      identityKey
    );
  }

  preparePlaybackLogging(videoEl) {
    if (!this.watchHistoryTelemetry) {
      this.cancelPendingViewLogging();
      return;
    }

    const pointer = this.currentVideoPointer;
    const pointerKey = this.currentVideoPointerKey || pointerArrayToKey(pointer);

    if (!pointer || !pointerKey) {
      this.watchHistoryTelemetry.cancelPlaybackLogging();
      return;
    }

    this.watchHistoryTelemetry.preparePlaybackLogging({
      videoElement: videoEl,
      pointer,
      pointerKey,
      video: this.currentVideo,
    });
  }

  teardownVideoElement(videoElement, { replaceNode = false } = {}) {
    if (!videoElement) {
      this.log(
        `[teardownVideoElement] No video provided (replaceNode=${replaceNode}); skipping.`
      );
      return videoElement;
    }

    const safe = (fn) => {
      try {
        fn();
      } catch (err) {
        devLogger.warn("[teardownVideoElement]", err);
      }
    };

    const describeSource = () => {
      try {
        return videoElement.currentSrc || videoElement.src || "<unset>";
      } catch (err) {
        return "<unavailable>";
      }
    };

    this.log(
      `[teardownVideoElement] Resetting video (replaceNode=${replaceNode}) readyState=${videoElement.readyState} networkState=${videoElement.networkState} src=${describeSource()}`
    );

    safe(() => videoElement.pause());

    safe(() => {
      videoElement.removeAttribute("src");
      videoElement.src = "";
    });

    safe(() => {
      videoElement.srcObject = null;
    });

    safe(() => {
      if ("crossOrigin" in videoElement) {
        videoElement.crossOrigin = null;
      }
      if (videoElement.hasAttribute("crossorigin")) {
        videoElement.removeAttribute("crossorigin");
      }
    });

    safe(() => {
      if (typeof videoElement.load === "function") {
        videoElement.load();
      }
    });

    if (!replaceNode || !videoElement.parentNode) {
      this.log(
        `[teardownVideoElement] Completed without node replacement (readyState=${videoElement.readyState}).`
      );
      return videoElement;
    }

    const parent = videoElement.parentNode;
    const clone = videoElement.cloneNode(false);

    if (clone.dataset && "autoplayBound" in clone.dataset) {
      delete clone.dataset.autoplayBound;
    }
    if (clone.hasAttribute("data-autoplay-bound")) {
      clone.removeAttribute("data-autoplay-bound");
    }

    safe(() => {
      clone.removeAttribute("src");
      clone.src = "";
    });

    safe(() => {
      clone.srcObject = null;
    });

    safe(() => {
      if ("crossOrigin" in clone) {
        clone.crossOrigin = null;
      }
      if (clone.hasAttribute("crossorigin")) {
        clone.removeAttribute("crossorigin");
      }
    });

    clone.autoplay = videoElement.autoplay;
    clone.controls = videoElement.controls;
    clone.loop = videoElement.loop;
    clone.muted = videoElement.muted;
    clone.defaultMuted = videoElement.defaultMuted;
    clone.preload = videoElement.preload;
    clone.playsInline = videoElement.playsInline;

    clone.poster = "";
    if (clone.hasAttribute("poster")) {
      clone.removeAttribute("poster");
    }

    let replaced = false;
    safe(() => {
      parent.replaceChild(clone, videoElement);
      replaced = true;
    });

    if (!replaced) {
      return videoElement;
    }

    safe(() => {
      if (typeof clone.load === "function") {
        clone.load();
      }
    });

    this.log(
      `[teardownVideoElement] Replaced modal video node (readyState=${clone.readyState} networkState=${clone.networkState}).`
    );

    return clone;
  }

  resetTorrentStats() {
    if (this.videoModal) {
      this.videoModal.resetStats();
    }
  }

  setCopyMagnetState(enabled) {
    if (this.videoModal) {
      this.videoModal.setCopyEnabled(enabled);
    }
  }

  setShareButtonState(enabled) {
    if (this.videoModal) {
      this.videoModal.setShareEnabled(enabled);
    }
  }

  getShareUrlBase() {
    try {
      const current = new URL(window.location.href);
      return `${current.origin}${current.pathname}`;
    } catch (err) {
      const origin = window.location?.origin || "";
      const pathname = window.location?.pathname || "";
      if (origin || pathname) {
        return `${origin}${pathname}`;
      }
      const href = window.location?.href || "";
      if (href) {
        const base = href.split(/[?#]/)[0];
        if (base) {
          return base;
        }
      }
      devLogger.warn("Unable to determine share URL base:", err);
      return "";
    }
  }

  shouldDeferModeratedPlayback(video) {
    if (!video || typeof video !== "object") {
      return false;
    }

    const moderation =
      video.moderation && typeof video.moderation === "object"
        ? video.moderation
        : null;

    if (!moderation) {
      return false;
    }

    if (moderation.viewerOverride?.showAnyway === true) {
      return false;
    }

    const blurActive = moderation.blurThumbnail === true;
    const hiddenActive = moderation.hidden === true;

    return blurActive || hiddenActive;
  }

  resumePendingModeratedPlayback(video) {
    const pending = this.pendingModeratedPlayback;
    if (!pending) {
      return;
    }

    const activeVideo = this.currentVideo || null;
    const targetVideo = video && typeof video === "object" ? video : activeVideo;
    if (!targetVideo) {
      return;
    }

    const pendingId =
      typeof pending.videoId === "string" && pending.videoId ? pending.videoId : "";
    const targetId =
      typeof targetVideo.id === "string" && targetVideo.id ? targetVideo.id : "";

    const matchesId = pendingId && targetId && pendingId === targetId;
    const matchesActive = !pendingId && !targetId && targetVideo === activeVideo;

    if (!matchesId && !matchesActive) {
      return;
    }

    this.pendingModeratedPlayback = null;

    if (typeof this.playVideoWithFallback !== "function") {
      return;
    }

    const playbackOptions = {
      url: pending.url || "",
      magnet: pending.magnet || "",
    };

    if (pending.triggerProvided) {
      playbackOptions.trigger = Object.prototype.hasOwnProperty.call(pending, "trigger")
        ? pending.trigger
        : this.lastModalTrigger || null;
    }

    const playbackPromise = this.playVideoWithFallback(playbackOptions);
    if (playbackPromise && typeof playbackPromise.catch === "function") {
      playbackPromise.catch((error) => {
        devLogger.error(
          "[Application] Failed to resume moderated playback:",
          error,
        );
      });
    }
  }

  buildShareUrlFromNevent(nevent) {
    if (!nevent) {
      return "";
    }
    const base = this.getShareUrlBase();
    if (!base) {
      return "";
    }
    return `${base}?v=${encodeURIComponent(nevent)}`;
  }

  buildShareUrlFromEventId(eventId) {
    if (!eventId) {
      return "";
    }

    try {
      const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
      return this.buildShareUrlFromNevent(nevent);
    } catch (err) {
      devLogger.error("Error generating nevent for share URL:", err);
      return "";
    }
  }

  dedupeVideosByRoot(videos) {
    if (!Array.isArray(videos) || videos.length === 0) {
      return [];
    }
    return dedupeToNewestByRoot(videos);
  }

  autoplayModalVideo() {
    if (this.currentVideo?.moderation?.blockAutoplay) {
      this.log(
        "[moderation] Skipping autoplay due to trusted reports or trusted mutes.",
      );
      return;
    }
    if (!this.modalVideo) return;
    this.modalVideo.play().catch((err) => {
      this.log("Autoplay failed:", err);
      if (!this.modalVideo.muted) {
        this.log("Falling back to muted autoplay.");
        this.modalVideo.muted = true;
        this.modalVideo.play().catch((err2) => {
          this.log("Muted autoplay also failed:", err2);
        });
      }
    });
  }

  startTorrentStatusMirrors(torrentInstance) {
    if (!torrentInstance) {
      return;
    }

    const updateInterval = setInterval(() => {
      if (!document.body.contains(this.modalVideo)) {
        clearInterval(updateInterval);
        return;
      }
      this.updateTorrentStatus(torrentInstance);
    }, 3000);
    this.activeIntervals.push(updateInterval);

    const mirrorInterval = setInterval(() => {
      if (!document.body.contains(this.modalVideo)) {
        clearInterval(mirrorInterval);
        return;
      }
      const status = document.getElementById("status");
      const progress = document.getElementById("progress");
      const peers = document.getElementById("peers");
      const speed = document.getElementById("speed");
      const downloaded = document.getElementById("downloaded");
      if (this.videoModal) {
        if (status) {
          this.videoModal.updateStatus(status.textContent);
        }
        if (progress) {
          const doc = progress.ownerDocument;
          const view = doc?.defaultView;
          let widthValue = "";
          if (view && typeof view.getComputedStyle === "function") {
            const computed = view.getComputedStyle(progress);
            widthValue =
              computed?.getPropertyValue("--progress-width")?.trim() ||
              computed?.getPropertyValue("width")?.trim() ||
              "";
          }
          this.videoModal.updateProgress(widthValue);
        }
        if (peers) {
          this.videoModal.updatePeers(peers.textContent);
        }
        if (speed) {
          this.videoModal.updateSpeed(speed.textContent);
        }
        if (downloaded) {
          this.videoModal.updateDownloaded(downloaded.textContent);
        }
      }
    }, 3000);
    this.activeIntervals.push(mirrorInterval);
  }

  /**
   * Hide the video modal.
   */
  async hideModal() {
    // 1) Clear timers/listeners immediately so playback stats stop updating
    this.cancelPendingViewLogging();
    this.clearActiveIntervals();
    this.teardownModalViewCountSubscription();
    this.teardownModalReactionSubscription();
    this.pendingModeratedPlayback = null;
    if (
      this.videoModal &&
      typeof this.videoModal.clearSimilarContent === "function"
    ) {
      try {
        this.videoModal.clearSimilarContent();
      } catch (error) {
        devLogger.warn("[hideModal] Failed to clear similar content:", error);
      }
    }

    // 2) Close the modal UI right away so the user gets instant feedback
    const modalVideoElement =
      (this.videoModal &&
        typeof this.videoModal.getVideoElement === "function" &&
        this.videoModal.getVideoElement()) ||
      this.modalVideo ||
      null;
    if (modalVideoElement) {
      try {
        modalVideoElement.pause();
        modalVideoElement.removeAttribute("src");
        modalVideoElement.load();
      } catch (error) {
        devLogger.warn("[hideModal] Failed to reset modal video element:", error);
      }
    }

    if (this.videoModal) {
      try {
        this.videoModal.close();
      } catch (error) {
        devLogger.warn("[hideModal] Failed to close video modal immediately:", error);
      }
    }

    this.lastModalTrigger = null;

    this.currentMagnetUri = null;

    // 3) Kick off heavy cleanup work asynchronously. We still await it so
    // callers that depend on teardown finishing behave the same, but the
    // user-visible UI is already closed.
    const performCleanup = async () => {
      try {
        await fetch("/webtorrent/cancel/", { mode: "no-cors" });
      } catch (err) {
        devLogger.warn("[hideModal] webtorrent cancel fetch failed:", err);
      }

      await this.cleanup({
        preserveSubscriptions: true,
        preserveObservers: true,
      });
    };

    // 4) Remove only `?v=` but **keep** the hash
    const url = new URL(window.location.href);
    url.searchParams.delete("v"); // remove ?v= param
    const newUrl = url.pathname + url.search + url.hash;
    window.history.replaceState({}, "", newUrl);

    try {
      await performCleanup();
    } catch (error) {
      devLogger.error("[hideModal] Cleanup failed:", error);
    }
  }

  /**
   * Register the default "recent" feed pipeline.
   */
  registerRecentFeed() {
    if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
      return null;
    }

    const existingDefinition =
      typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("recent")
        : null;
    if (existingDefinition) {
      return existingDefinition;
    }

    try {
      const app = this;
      const resolveThresholdFromApp = (key) => ({ runtimeValue, defaultValue }) => {
        if (
          Number.isFinite(runtimeValue) ||
          runtimeValue === Number.POSITIVE_INFINITY
        ) {
          return runtimeValue;
        }

        if (app && typeof app.getActiveModerationThresholds === "function") {
          const active = app.getActiveModerationThresholds();
          const candidate = active && typeof active === "object" ? active[key] : undefined;
          if (
            Number.isFinite(candidate) ||
            candidate === Number.POSITIVE_INFINITY
          ) {
            return candidate;
          }
        }

        return defaultValue;
      };
      return this.feedEngine.registerFeed("recent", {
        source: createActiveNostrSource({ service: this.nostrService }),
        stages: [
          // TODO(tag-preferences): introduce a dedicated stage here to filter by
          // viewer interests/disinterests once the runtime metadata is wired up
          // to filtering helpers.
          createBlacklistFilterStage({
            shouldIncludeVideo: (video, options) =>
              this.nostrService.shouldIncludeVideo(video, options),
          }),
          createDedupeByRootStage({
            dedupe: (videos) => this.dedupeVideosByRoot(videos),
          }),
          createModerationStage({
            getService: () => this.nostrService.getModerationService(),
            autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
            blurThreshold: resolveThresholdFromApp("blurThreshold"),
            trustedMuteHideThreshold: resolveThresholdFromApp("trustedMuteHideThreshold"),
            trustedReportHideThreshold: resolveThresholdFromApp("trustedSpamHideThreshold"),
          }),
          createResolvePostedAtStage(),
        ],
        sorter: createChronologicalSorter(),
        hooks: {
          timestamps: {
            getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
            resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
          },
        },
      });
    } catch (error) {
      devLogger.warn("[Application] Failed to register recent feed:", error);
      return null;
    }
  }

  registerSubscriptionsFeed() {
    if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
      return null;
    }

    const existingDefinition =
      typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("subscriptions")
        : null;
    if (existingDefinition) {
      return existingDefinition;
    }

    try {
      const app = this;
      const resolveThresholdFromApp = (key) => ({ runtimeValue, defaultValue }) => {
        if (
          Number.isFinite(runtimeValue) ||
          runtimeValue === Number.POSITIVE_INFINITY
        ) {
          return runtimeValue;
        }

        if (app && typeof app.getActiveModerationThresholds === "function") {
          const active = app.getActiveModerationThresholds();
          const candidate = active && typeof active === "object" ? active[key] : undefined;
          if (
            Number.isFinite(candidate) ||
            candidate === Number.POSITIVE_INFINITY
          ) {
            return candidate;
          }
        }

        return defaultValue;
      };
      return this.feedEngine.registerFeed("subscriptions", {
        source: createSubscriptionAuthorsSource({ service: this.nostrService }),
        stages: [
          // TODO(tag-preferences): introduce preference-aware filtering ahead of
          // the blacklist stage when tag-based ranking lands.
          createBlacklistFilterStage({
            shouldIncludeVideo: (video, options) =>
              this.nostrService.shouldIncludeVideo(video, options),
          }),
          createDedupeByRootStage({
            dedupe: (videos) => this.dedupeVideosByRoot(videos),
          }),
          createModerationStage({
            getService: () => this.nostrService.getModerationService(),
            autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
            blurThreshold: resolveThresholdFromApp("blurThreshold"),
            trustedMuteHideThreshold: resolveThresholdFromApp("trustedMuteHideThreshold"),
            trustedReportHideThreshold: resolveThresholdFromApp("trustedSpamHideThreshold"),
          }),
          createResolvePostedAtStage(),
        ],
        sorter: createChronologicalSorter(),
        hooks: {
          subscriptions: {
            resolveAuthors: () => subscriptions.getSubscribedAuthors(),
          },
          timestamps: {
            getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
            resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
          },
        },
      });
    } catch (error) {
      devLogger.warn("[Application] Failed to register subscriptions feed:", error);
      return null;
    }
  }

  registerWatchHistoryFeed() {
    if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
      return null;
    }

    const existingDefinition =
      typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("watch-history")
        : null;
    if (existingDefinition) {
      return existingDefinition;
    }

    try {
      return registerWatchHistoryFeed(this.feedEngine, {
        service: watchHistoryService,
        nostr: this.nostrService,
      });
    } catch (error) {
      devLogger.warn("[Application] Failed to register watch history feed:", error);
      return null;
    }
  }

  buildRecentFeedRuntime() {
    const blacklist =
      this.blacklistedEventIds instanceof Set
        ? new Set(this.blacklistedEventIds)
        : new Set();

    const preferenceSource =
      typeof this.getHashtagPreferences === "function"
        ? this.getHashtagPreferences()
        : {};
    const { interests = [], disinterests = [] } = preferenceSource || {};
    const moderationThresholds = this.getActiveModerationThresholds();

    return {
      blacklistedEventIds: blacklist,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      tagPreferences: {
        interests: Array.isArray(interests) ? [...interests] : [],
        disinterests: Array.isArray(disinterests) ? [...disinterests] : [],
      },
      moderationThresholds: moderationThresholds
        ? { ...moderationThresholds }
        : undefined,
    };
  }

  refreshRecentFeed({ reason, fallbackVideos } = {}) {
    const runtime = this.buildRecentFeedRuntime();
    const normalizedReason = typeof reason === "string" ? reason : undefined;
    const fallback = Array.isArray(fallbackVideos) ? fallbackVideos : [];

    if (!this.feedEngine || typeof this.feedEngine.run !== "function") {
      const metadata = {
        reason: normalizedReason,
        engine: "unavailable",
      };
      this.latestFeedMetadata = metadata;
      this.videosMap = this.nostrService.getVideosMap();
      if (this.videoListView) {
        this.videoListView.state.videosMap = this.videosMap;
      }
      this.renderVideoList({ videos: fallback, metadata });
      return Promise.resolve({ videos: fallback, metadata });
    }

    return this.feedEngine
      .run("recent", { runtime })
      .then((result) => {
        const videos = Array.isArray(result?.videos) ? result.videos : [];
        const metadata = {
          ...(result?.metadata || {}),
        };
        if (normalizedReason) {
          metadata.reason = normalizedReason;
        }

        this.latestFeedMetadata = metadata;
        this.videosMap = this.nostrService.getVideosMap();
        if (this.videoListView) {
          this.videoListView.state.videosMap = this.videosMap;
        }

        const payload = { videos, metadata };
        this.renderVideoList(payload);
        return payload;
      })
      .catch((error) => {
        devLogger.error("[Application] Failed to run recent feed:", error);
        const metadata = {
          reason: normalizedReason || "error:recent-feed",
          error: true,
        };
        this.latestFeedMetadata = metadata;
        this.videosMap = this.nostrService.getVideosMap();
        if (this.videoListView) {
          this.videoListView.state.videosMap = this.videosMap;
        }
        const payload = { videos: fallback, metadata };
        this.renderVideoList(payload);
        return payload;
      });
  }

  /**
   * Subscribe to videos (older + new) and render them as they come in.
   */
  async loadVideos(forceFetch = false) {
    devLogger.log("Starting loadVideos... (forceFetch =", forceFetch, ")");

    const container = this.mountVideoListView();
    if (this.videoListView && container) {
      this.videoListView.showLoading("Fetching recent videos…");
    } else if (container) {
      container.innerHTML = getSidebarLoadingMarkup("Fetching recent videos…");
    }

    let initialRefreshPromise = null;

    const videos = await this.nostrService.loadVideos({
      forceFetch,
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      onVideos: (payload, detail = {}) => {
        const promise = this.refreshRecentFeed({
          reason: detail?.reason,
          fallbackVideos: payload,
        });
        if (!initialRefreshPromise) {
          initialRefreshPromise = promise;
        }
      },
    });

    if (initialRefreshPromise) {
      await initialRefreshPromise;
    } else if (!Array.isArray(videos) || videos.length === 0) {
      await this.refreshRecentFeed({ reason: "initial", fallbackVideos: [] });
    }

    this.videoSubscription = this.nostrService.getVideoSubscription() || null;
    this.videosMap = this.nostrService.getVideosMap();
    if (this.videoListView) {
      this.videoListView.state.videosMap = this.videosMap;
    }
  }

  async loadOlderVideos(lastTimestamp) {
    const olderVideos = await this.nostrService.loadOlderVideos(lastTimestamp, {
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
    });

    if (!Array.isArray(olderVideos) || olderVideos.length === 0) {
      this.showSuccess("No more older videos found.");
      return;
    }

    await this.refreshRecentFeed({ reason: "older-fetch" });
  }

  /**
   * Returns true if there's at least one strictly older version
   * (same videoRootId, created_at < current) which is NOT deleted.
   */
  hasOlderVersion(video, allEvents) {
    if (!video || !video.videoRootId) return false;

    const rootId = video.videoRootId;
    const currentTs = video.created_at;

    // among ALL known events (including overshadowed), find older, not deleted
    const olderMatches = allEvents.filter(
      (v) => v.videoRootId === rootId && v.created_at < currentTs && !v.deleted
    );
    return olderMatches.length > 0;
  }

  /**
   * Centralised helper for other modules (channel profiles, subscriptions)
   * so they can re-use the exact same badge skeleton. Keeping the markup in
   * one place avoids subtle mismatches when we tweak copy or classes later.
   */
  getUrlHealthPlaceholderMarkup(options = {}) {
    const includeMargin = options?.includeMargin !== false;
    const classes = ["badge", "url-health-badge", "text-muted"];
    if (includeMargin) {
      classes.push("mt-sm");
    }

    return `
      <span
        class="${classes.join(" ")}"
        data-url-health-state="checking"
        data-variant="neutral"
        aria-live="polite"
        role="status"
      >
        ⏳ CDN
      </span>
    `;
  }

  getTorrentHealthBadgeMarkup(options = {}) {
    const includeMargin = options?.includeMargin !== false;
    const classes = ["badge", "torrent-health-badge"];
    if (includeMargin) {
      classes.push("mt-sm");
    }

    return `
      <span
        class="${classes.join(" ")}"
        data-stream-health-state="checking"
        data-variant="neutral"
        aria-live="polite"
        role="status"
      >
        ⏳ Torrent
      </span>
    `;
  }

  isMagnetUriSupported(magnet) {
    return isValidMagnetUri(magnet);
  }

  getCachedUrlHealth(eventId, url) {
    return readCachedUrlHealth(eventId, url);
  }

  storeUrlHealth(eventId, url, result, ttlMs) {
    return persistUrlHealth(eventId, url, result, ttlMs);
  }

  updateUrlHealthBadge(badgeEl, state, videoId) {
    if (!badgeEl) {
      return;
    }

    if (videoId && badgeEl.dataset.urlHealthFor && badgeEl.dataset.urlHealthFor !== videoId) {
      return;
    }

    if (!badgeEl.isConnected) {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          if (badgeEl.isConnected) {
            this.updateUrlHealthBadge(badgeEl, state, videoId);
          }
        });
      }
      return;
    }

    const status = state?.status || "checking";
    const fallbackMessages = {
      healthy: "✅ CDN",
      offline: "❌ CDN",
      unknown: "⚠️ CDN",
      timeout: "⚠️ CDN timed out",
      checking: "⏳ CDN",
    };
    const message =
      state?.message ||
      fallbackMessages[status] ||
      fallbackMessages.checking;

    const hadCompactMargin =
      badgeEl.classList.contains("mt-sm") || badgeEl.classList.contains("mt-3");
    badgeEl.dataset.urlHealthState = status;
    const cardEl = badgeEl.closest(".card[data-video-id]");
    if (cardEl) {
      cardEl.dataset.urlHealthState = status;
      updateVideoCardSourceVisibility(cardEl);
    }
    badgeEl.setAttribute("aria-live", "polite");
    badgeEl.setAttribute("role", status === "offline" ? "alert" : "status");
    badgeEl.textContent = message;

    const classes = ["badge", "url-health-badge"];
    if (hadCompactMargin) {
      classes.push("mt-sm");
    }
    badgeEl.className = classes.join(" ");

    const variantMap = {
      healthy: "success",
      offline: "critical",
      unknown: "neutral",
      timeout: "neutral",
      checking: "neutral",
    };
    const variant = variantMap[status];
    if (variant) {
      badgeEl.dataset.variant = variant;
    } else if (badgeEl.dataset.variant) {
      delete badgeEl.dataset.variant;
    }

    if (
      videoId &&
      this.videoListView &&
      typeof this.videoListView.cacheUrlHealth === "function"
    ) {
      this.videoListView.cacheUrlHealth(videoId, {
        status,
        message,
        lastCheckedAt: Number.isFinite(state?.lastCheckedAt)
          ? state.lastCheckedAt
          : undefined,
      });
    }
  }

  handleUrlHealthBadge({ video, url, badgeEl }) {
    if (!video?.id || !badgeEl || !url) {
      return;
    }

    const eventId = video.id;
    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    if (!trimmedUrl) {
      return;
    }

    badgeEl.dataset.urlHealthFor = eventId;

    const cached = this.getCachedUrlHealth(eventId, trimmedUrl);
    if (cached) {
      this.updateUrlHealthBadge(badgeEl, cached, eventId);
      return;
    }

    this.updateUrlHealthBadge(badgeEl, { status: "checking" }, eventId);

    const probeOptions = { confirmPlayable: true };
    const existingProbe = getInFlightUrlProbe(eventId, trimmedUrl, probeOptions);
    if (existingProbe) {
      existingProbe
        .then((entry) => {
          if (entry) {
            this.updateUrlHealthBadge(badgeEl, entry, eventId);
          }
        })
        .catch((err) => {
          devLogger.warn(
            `[urlHealth] cached probe promise rejected for ${trimmedUrl}:`,
            err
          );
        });
      return;
    }

    const probePromise = this.probeUrl(trimmedUrl, probeOptions)
      .then((result) => {
        const outcome = result?.outcome || "error";
        let entry;

        if (outcome === "ok") {
          entry = { status: "healthy", message: "✅ CDN" };
        } else if (outcome === "opaque" || outcome === "unknown") {
          entry = {
            status: "unknown",
            message: "⚠️ CDN",
          };
        } else if (outcome === "timeout") {
          entry = {
            status: "timeout",
            message: "⚠️ CDN timed out",
          };
        } else {
          entry = {
            status: "offline",
            message: "❌ CDN",
          };
        }

        const ttlOverride =
          entry.status === "timeout" || entry.status === "unknown"
            ? urlHealthConstants.URL_HEALTH_TIMEOUT_RETRY_MS
            : undefined;

        return this.storeUrlHealth(eventId, trimmedUrl, entry, ttlOverride);
      })
      .catch((err) => {
        devLogger.warn(`[urlHealth] probe failed for ${trimmedUrl}:`, err);
        const entry = {
          status: "offline",
          message: "❌ CDN",
        };
        return this.storeUrlHealth(eventId, trimmedUrl, entry);
      });

    setInFlightUrlProbe(eventId, trimmedUrl, probePromise, probeOptions);

    probePromise
      .then((entry) => {
        if (entry) {
          this.updateUrlHealthBadge(badgeEl, entry, eventId);
        }
      })
      .catch((err) => {
        devLogger.warn(
          `[urlHealth] probe promise rejected post-cache for ${trimmedUrl}:`,
          err
        );
      });
  }

  handleStreamHealthBadgeUpdate(detail) {
    if (!detail || typeof detail !== "object") {
      return;
    }

    const card = detail.card;
    if (!(card instanceof HTMLElement)) {
      return;
    }

    let videoId =
      (card.dataset && card.dataset.videoId) ||
      (typeof card.getAttribute === "function" ? card.getAttribute("data-video-id") : "") ||
      "";

    if (!videoId && typeof card.querySelector === "function") {
      const fallback = card.querySelector("[data-video-id]");
      if (fallback instanceof HTMLElement && fallback.dataset.videoId) {
        videoId = fallback.dataset.videoId;
      }
    }

    if (!videoId) {
      return;
    }

    if (this.videoListView && typeof this.videoListView.cacheStreamHealth === "function") {
      this.videoListView.cacheStreamHealth(videoId, {
        state: detail.state,
        peers: detail.peers,
        reason: detail.reason,
        checkedAt: detail.checkedAt,
        text: detail.text,
        tooltip: detail.tooltip,
        role: detail.role,
        ariaLive: detail.ariaLive,
      });
    }
  }

  async renderVideoList(payload) {
    if (!this.videoListView) {
      return;
    }

    const container = this.mountVideoListView();
    if (!container) {
      return;
    }

    let videos = [];
    let metadata = null;

    if (Array.isArray(payload)) {
      videos = payload;
    } else if (payload && typeof payload === "object") {
      if (Array.isArray(payload.videos)) {
        videos = payload.videos;
      }
    if (payload.metadata && typeof payload.metadata === "object") {
      metadata = { ...payload.metadata };
    }
    }

    this.latestFeedMetadata = metadata;
    if (this.videoListView) {
      this.videoListView.state.feedMetadata = metadata;
    }

    const decoratedVideos = Array.isArray(videos)
      ? videos.map((video) => this.decorateVideoModeration(video))
      : [];

    this.videoListView.render(decoratedVideos, metadata);
    this.updateModalSimilarContent();
  }

  refreshVideoDiscussionCounts(videos = [], options = {}) {
    if (!this.discussionCountService) {
      return;
    }

    const { videoListRoot = this.videoList || null } = options;

    this.discussionCountService.refreshCounts(videos, {
      videoListRoot,
      nostrClient,
    });
  }

  deriveModerationReportType(summary) {
    if (!summary || typeof summary !== "object") {
      return "";
    }

    const types = summary.types && typeof summary.types === "object" ? summary.types : null;
    if (!types) {
      return "";
    }

    let bestType = "";
    let bestScore = -1;
    for (const [type, stats] of Object.entries(types)) {
      if (!stats || typeof stats !== "object") {
        continue;
      }
      const trusted = Number.isFinite(stats.trusted) ? Math.floor(stats.trusted) : 0;
      if (trusted > bestScore) {
        bestScore = trusted;
        bestType = typeof type === "string" ? type : bestType;
      }
    }

    return typeof bestType === "string" ? bestType.toLowerCase() : "";
  }

  deriveModerationTrustedCount(summary, reportType) {
    if (!summary || typeof summary !== "object") {
      return 0;
    }

    const normalizedType = typeof reportType === "string" ? reportType.toLowerCase() : "";
    const types = summary.types && typeof summary.types === "object" ? summary.types : {};

    if (normalizedType && types[normalizedType]) {
      const entry = types[normalizedType];
      if (entry && Number.isFinite(entry.trusted)) {
        return Math.max(0, Math.floor(entry.trusted));
      }
    }

    if (Number.isFinite(summary.totalTrusted)) {
      return Math.max(0, Math.floor(summary.totalTrusted));
    }

    for (const stats of Object.values(types)) {
      if (stats && Number.isFinite(stats.trusted)) {
        return Math.max(0, Math.floor(stats.trusted));
      }
    }

    return 0;
  }

  getReporterDisplayName(pubkey) {
    if (typeof pubkey !== "string") {
      return "";
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return "";
    }

    const cachedProfile = this.getProfileCacheEntry(trimmed);
    const cachedName = cachedProfile?.profile?.name;
    if (typeof cachedName === "string" && cachedName.trim()) {
      return cachedName.trim();
    }

    try {
      if (typeof window !== "undefined" && window.NostrTools?.nip19?.npubEncode) {
        const encoded = window.NostrTools.nip19.npubEncode(trimmed);
        if (encoded && typeof encoded === "string") {
          return formatShortNpub(encoded);
        }
      }
    } catch (error) {
      userLogger.warn("[Application] Failed to encode reporter npub", error);
    }

    return formatShortNpub(trimmed);
  }

  normalizeModerationSettings(settings = null) {
    const defaults = this.defaultModerationSettings || getDefaultModerationSettings();
    const defaultBlur = Number.isFinite(defaults?.blurThreshold)
      ? Math.max(0, Math.floor(defaults.blurThreshold))
      : DEFAULT_BLUR_THRESHOLD;
    const defaultAutoplay = Number.isFinite(defaults?.autoplayBlockThreshold)
      ? Math.max(0, Math.floor(defaults.autoplayBlockThreshold))
      : DEFAULT_AUTOPLAY_BLOCK_THRESHOLD;

    const runtimeMuteSource = getTrustedMuteHideThreshold();
    const runtimeTrustedMute = Number.isFinite(runtimeMuteSource)
      ? Math.max(0, Math.floor(runtimeMuteSource))
      : DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD;
    const defaultTrustedMuteHide = Number.isFinite(
      defaults?.trustedMuteHideThreshold,
    )
      ? Math.max(0, Math.floor(defaults.trustedMuteHideThreshold))
      : runtimeTrustedMute;

    const runtimeSpamSource = getTrustedSpamHideThreshold();
    const runtimeTrustedSpam = Number.isFinite(runtimeSpamSource)
      ? Math.max(0, Math.floor(runtimeSpamSource))
      : DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD;
    const defaultTrustedSpamHide = Number.isFinite(
      defaults?.trustedSpamHideThreshold,
    )
      ? Math.max(0, Math.floor(defaults.trustedSpamHideThreshold))
      : runtimeTrustedSpam;

    const blurSource = Number.isFinite(settings?.blurThreshold)
      ? Math.max(0, Math.floor(settings.blurThreshold))
      : defaultBlur;
    const autoplaySource = Number.isFinite(settings?.autoplayBlockThreshold)
      ? Math.max(0, Math.floor(settings.autoplayBlockThreshold))
      : defaultAutoplay;
    const muteHideSource = Number.isFinite(settings?.trustedMuteHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedMuteHideThreshold))
      : defaultTrustedMuteHide;
    const spamHideSource = Number.isFinite(settings?.trustedSpamHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedSpamHideThreshold))
      : defaultTrustedSpamHide;

    return {
      blurThreshold: blurSource,
      autoplayBlockThreshold: autoplaySource,
      trustedMuteHideThreshold: muteHideSource,
      trustedSpamHideThreshold: spamHideSource,
    };
  }

  getActiveModerationThresholds() {
    this.moderationSettings = this.normalizeModerationSettings(this.moderationSettings);
    return { ...this.moderationSettings };
  }

  decorateVideoModeration(video) {
    if (!video || typeof video !== "object") {
      return video;
    }

    const existingModeration =
      video.moderation && typeof video.moderation === "object"
        ? { ...video.moderation }
        : {};

    const summary =
      existingModeration.summary && typeof existingModeration.summary === "object"
        ? existingModeration.summary
        : null;

    const rawReportType =
      typeof existingModeration.reportType === "string" &&
      existingModeration.reportType.trim()
        ? existingModeration.reportType.trim().toLowerCase()
        : "";

    const reportType = rawReportType || this.deriveModerationReportType(summary) || "";

    const sanitizedReporters = Array.isArray(existingModeration.trustedReporters)
      ? existingModeration.trustedReporters
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const pubkey =
              typeof entry.pubkey === "string" ? entry.pubkey.trim().toLowerCase() : "";
            if (!pubkey) {
              return null;
            }
            const latest = Number.isFinite(entry.latest)
              ? Math.floor(entry.latest)
              : 0;
            return { pubkey, latest };
          })
          .filter(Boolean)
      : [];

    const reporterPubkeys = sanitizedReporters.map((entry) => entry.pubkey);

    const rawTrustedMuters = Array.isArray(existingModeration.trustedMuters)
      ? existingModeration.trustedMuters
          .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
          .filter(Boolean)
      : [];

    const trustedMuteCount = Number.isFinite(existingModeration.trustedMuteCount)
      ? Math.max(0, Math.floor(existingModeration.trustedMuteCount))
      : rawTrustedMuters.length;

    const trustedMuted = existingModeration.trustedMuted === true || trustedMuteCount > 0;

    const reporterDisplayNames = [];
    const seenNames = new Set();
    for (const reporterPubkey of reporterPubkeys) {
      const name = this.getReporterDisplayName(reporterPubkey);
      if (!name) {
        continue;
      }
      const normalizedName = name.trim();
      if (!normalizedName) {
        continue;
      }
      const key = normalizedName.toLowerCase();
      if (seenNames.has(key)) {
        continue;
      }
      seenNames.add(key);
      reporterDisplayNames.push(normalizedName);
    }

    const trustedMuterDisplayNames = [];
    if (trustedMuted) {
      const seenMuteNames = new Set();
      for (const muterPubkey of rawTrustedMuters) {
        const name = this.getReporterDisplayName(muterPubkey);
        if (!name) {
          continue;
        }
        const normalizedName = name.trim();
        if (!normalizedName) {
          continue;
        }
        const key = normalizedName.toLowerCase();
        if (seenMuteNames.has(key)) {
          continue;
        }
        seenMuteNames.add(key);
        trustedMuterDisplayNames.push(normalizedName);
      }
    }

    const trustedCount = Number.isFinite(existingModeration.trustedCount)
      ? Math.max(0, Math.floor(existingModeration.trustedCount))
      : this.deriveModerationTrustedCount(summary, reportType);

    const viewerMuted = existingModeration.viewerMuted === true;
    const existingBlockAutoplay = existingModeration.blockAutoplay === true;
    const existingBlurThumbnail = existingModeration.blurThumbnail === true;
    const existingBlurReason =
      typeof existingModeration.blurReason === "string"
        ? existingModeration.blurReason.trim()
        : "";

    const thresholds = this.getActiveModerationThresholds();
    const computedBlockAutoplayBase =
      trustedCount >= thresholds.autoplayBlockThreshold || trustedMuted;
    const computedBlockAutoplay =
      computedBlockAutoplayBase || viewerMuted || existingBlockAutoplay;

    const blurFromReports = trustedCount >= thresholds.blurThreshold;
    let computedBlurThumbnail =
      blurFromReports || trustedMuted || viewerMuted || existingBlurThumbnail;
    let computedBlurReason = "";

    if (blurFromReports) {
      computedBlurReason = "trusted-report";
    } else if (trustedMuted) {
      computedBlurReason = "trusted-mute";
    } else if (viewerMuted) {
      computedBlurReason = "viewer-mute";
    } else if (existingBlurThumbnail && existingBlurReason) {
      computedBlurReason = existingBlurReason;
    }

    const muteHideThreshold = Number.isFinite(thresholds.trustedMuteHideThreshold)
      ? Math.max(0, Math.floor(thresholds.trustedMuteHideThreshold))
      : Number.POSITIVE_INFINITY;
    const reportHideThreshold = Number.isFinite(thresholds.trustedSpamHideThreshold)
      ? Math.max(0, Math.floor(thresholds.trustedSpamHideThreshold))
      : Number.POSITIVE_INFINITY;

    const existingHideReason =
      typeof existingModeration.hideReason === "string"
        ? existingModeration.hideReason.trim()
        : "";
    const existingHideBypass =
      typeof existingModeration.hideBypass === "string"
        ? existingModeration.hideBypass.trim()
        : "";
    const existingHideCounts =
      existingModeration.hideCounts && typeof existingModeration.hideCounts === "object"
        ? existingModeration.hideCounts
        : null;

    let hideReason = "";
    let hideTriggered = false;

    if (trustedMuted && trustedMuteCount >= muteHideThreshold) {
      hideReason = "trusted-mute-hide";
      hideTriggered = true;
    } else if (trustedCount >= reportHideThreshold) {
      hideReason = "trusted-report-hide";
      hideTriggered = true;
    } else if (existingHideReason && existingHideCounts) {
      hideReason = existingHideReason;
      hideTriggered = true;
    }

    if (!computedBlurThumbnail && (viewerMuted || trustedMuted || hideTriggered)) {
      computedBlurThumbnail = true;
      if (hideTriggered) {
        computedBlurReason = hideReason || "trusted-hide";
      } else if (viewerMuted) {
        computedBlurReason = "viewer-mute";
      } else if (trustedMuted) {
        computedBlurReason = "trusted-mute";
      }
    } else if (computedBlurThumbnail) {
      if (hideTriggered) {
        computedBlurReason = hideReason || "trusted-hide";
      } else if (viewerMuted && !blurFromReports && !trustedMuted) {
        computedBlurReason = "viewer-mute";
      } else if (trustedMuted && !blurFromReports) {
        computedBlurReason = "trusted-mute";
      } else if (!computedBlurReason && blurFromReports) {
        computedBlurReason = "trusted-report";
      }
    }

    if (computedBlurThumbnail && !computedBlurReason && existingBlurReason) {
      computedBlurReason = existingBlurReason;
    }

    const hideCounts = hideTriggered
      ? {
          trustedMuteCount,
          trustedReportCount: trustedCount,
        }
      : null;

    let hideBypass = hideTriggered ? existingHideBypass : "";
    const computedHidden = hideTriggered && !hideBypass;

    const overrideEntry = getModerationOverride(video.id);
    const overrideActive = overrideEntry?.showAnyway === true;
    const overrideUpdatedAt = Number.isFinite(overrideEntry?.updatedAt)
      ? Math.floor(overrideEntry.updatedAt)
      : Date.now();

    const originalHideCounts = hideCounts
      ? {
          trustedMuteCount: Math.max(0, Math.floor(hideCounts.trustedMuteCount)),
          trustedReportCount: Math.max(0, Math.floor(hideCounts.trustedReportCount)),
        }
      : null;

    const originalState = {
      blockAutoplay: computedBlockAutoplay,
      blurThumbnail: computedBlurThumbnail,
      hidden: computedHidden,
      hideReason: hideTriggered ? hideReason : "",
      hideCounts: originalHideCounts,
      hideBypass,
      hideTriggered,
      blurReason: computedBlurThumbnail ? computedBlurReason : "",
    };

    const decoratedModeration = {
      ...existingModeration,
      reportType,
      trustedCount,
      trustedReporters: sanitizedReporters,
      reporterPubkeys,
      reporterDisplayNames,
      trustedMuted,
      trustedMuters: rawTrustedMuters,
      trustedMuteCount,
      trustedMuterDisplayNames,
      blurReason: computedBlurThumbnail ? computedBlurReason : "",
      original: {
        blockAutoplay: originalState.blockAutoplay,
        blurThumbnail: originalState.blurThumbnail,
        hidden: originalState.hidden,
        hideReason: originalState.hideReason,
        hideCounts: originalState.hideCounts,
        hideBypass: originalState.hideBypass,
        hideTriggered: originalState.hideTriggered,
        blurReason: originalState.blurReason,
      },
    };

    if (!computedBlurThumbnail && decoratedModeration.blurReason) {
      delete decoratedModeration.blurReason;
    }

    if (overrideActive) {
      decoratedModeration.blockAutoplay = false;
      decoratedModeration.blurThumbnail = false;
      decoratedModeration.hidden = false;
      if (decoratedModeration.hideReason) {
        delete decoratedModeration.hideReason;
      }
      if (decoratedModeration.hideCounts) {
        delete decoratedModeration.hideCounts;
      }
      if (decoratedModeration.hideBypass) {
        delete decoratedModeration.hideBypass;
      }
      decoratedModeration.viewerOverride = {
        showAnyway: true,
        updatedAt: overrideUpdatedAt,
      };
    } else {
      decoratedModeration.blockAutoplay = originalState.blockAutoplay;
      decoratedModeration.blurThumbnail = originalState.blurThumbnail;
      decoratedModeration.hidden = originalState.hidden;
      if (originalState.hideReason) {
        decoratedModeration.hideReason = originalState.hideReason;
      } else if (decoratedModeration.hideReason) {
        delete decoratedModeration.hideReason;
      }
      if (originalState.hideCounts) {
        decoratedModeration.hideCounts = { ...originalState.hideCounts };
      } else if (decoratedModeration.hideCounts) {
        delete decoratedModeration.hideCounts;
      }
      if (originalState.hideBypass) {
        decoratedModeration.hideBypass = originalState.hideBypass;
      } else if (decoratedModeration.hideBypass) {
        delete decoratedModeration.hideBypass;
      }
      if (decoratedModeration.viewerOverride) {
        delete decoratedModeration.viewerOverride;
      }
    }

    video.moderation = decoratedModeration;
    return video;
  }

  handleModerationOverride({ video, card }) {
    if (!video || typeof video !== "object" || !video.id) {
      return false;
    }

    try {
      setModerationOverride(video.id, {
        showAnyway: true,
        updatedAt: Date.now(),
      });
    } catch (error) {
      devLogger.warn("[Application] Failed to persist moderation override:", error);
    }

    const storedVideo =
      this.videosMap instanceof Map && video.id ? this.videosMap.get(video.id) : null;
    const target = storedVideo || video;

    if (target) {
      if (target.moderation && typeof target.moderation === "object") {
        if (target.moderation.hidden) {
          delete target.moderation.hidden;
        }
        if (target.moderation.hideReason) {
          delete target.moderation.hideReason;
        }
        if (target.moderation.hideCounts) {
          delete target.moderation.hideCounts;
        }
        if (target.moderation.hideBypass) {
          delete target.moderation.hideBypass;
        }
      }
      this.decorateVideoModeration(target);
    }

    if (this.currentVideo && this.currentVideo.id === video.id) {
      if (this.currentVideo.moderation && typeof this.currentVideo.moderation === "object") {
        if (this.currentVideo.moderation.hidden) {
          delete this.currentVideo.moderation.hidden;
        }
        if (this.currentVideo.moderation.hideReason) {
          delete this.currentVideo.moderation.hideReason;
        }
        if (this.currentVideo.moderation.hideCounts) {
          delete this.currentVideo.moderation.hideCounts;
        }
        if (this.currentVideo.moderation.hideBypass) {
          delete this.currentVideo.moderation.hideBypass;
        }
      }
      this.decorateVideoModeration(this.currentVideo);
    }

    if (card && typeof card.refreshModerationUi === "function") {
      try {
        card.refreshModerationUi();
      } catch (error) {
        devLogger.warn("[Application] Failed to refresh moderation UI:", error);
      }
    }

    const doc =
      (this.videoModal && this.videoModal.document) ||
      (typeof document !== "undefined" ? document : null);
    if (doc && typeof doc.dispatchEvent === "function") {
      try {
        doc.dispatchEvent(
          new CustomEvent("video:moderation-override", {
            detail: { video: target },
          }),
        );
      } catch (eventError) {
        devLogger.warn(
          "[Application] Failed to dispatch moderation override event:",
          eventError,
        );
      }
    }

    this.resumePendingModeratedPlayback(target);

    return true;
  }

  async handleModerationBlock({ video, card }) {
    if (!video || typeof video !== "object" || !video.id) {
      return false;
    }

    if (!this.isUserLoggedIn()) {
      this.showStatus("Log in to block accounts.", { showSpinner: false });
      return false;
    }

    const viewerHex = this.normalizeHexPubkey(this.pubkey);
    if (!viewerHex) {
      this.showError("Select a profile before blocking accounts.");
      return false;
    }

    const targetHex = this.normalizeHexPubkey(video?.pubkey);
    if (!targetHex) {
      this.showError("Unable to determine which account to block.");
      return false;
    }

    if (viewerHex === targetHex) {
      this.showError("You cannot block yourself.");
      return false;
    }

    try {
      await userBlocks.ensureLoaded(viewerHex);
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to load block list before blocking:",
        error,
      );
      this.showError("Unable to load your block list. Please try again.");
      return false;
    }

    let alreadyBlocked =
      typeof userBlocks.isBlocked === "function" &&
      userBlocks.isBlocked(targetHex);
    let blockApplied = false;

    if (!alreadyBlocked) {
      try {
        const result = await userBlocks.addBlock(targetHex, viewerHex);
        alreadyBlocked = true;
        blockApplied = result?.already !== true;
      } catch (error) {
        const message =
          (typeof this.describeUserBlockActionError === "function"
            ? this.describeUserBlockActionError(error)
            : "") || "Failed to block this creator. Please try again.";
        this.showError(message);
        devLogger.warn("[Application] Failed to block creator:", error);
        return false;
      }
    }

    if (alreadyBlocked) {
      const statusMessage = blockApplied
        ? "Creator blocked. Their videos will disappear from your feed."
        : "Creator already blocked. Their videos will disappear from your feed.";
      this.showStatus(statusMessage, { showSpinner: false });
    }

    try {
      clearModerationOverride(video.id);
    } catch (error) {
      devLogger.warn("[Application] Failed to clear moderation override:", error);
    }

    const storedVideo =
      this.videosMap instanceof Map && video.id ? this.videosMap.get(video.id) : null;
    const target = storedVideo || video;

    const resetModerationState = (subject) => {
      if (!subject || typeof subject !== "object") {
        return;
      }
      const moderation =
        subject.moderation && typeof subject.moderation === "object"
          ? subject.moderation
          : null;
      if (!moderation) {
        return;
      }
      if (moderation.viewerOverride) {
        delete moderation.viewerOverride;
      }
      if (moderation.hideBypass) {
        delete moderation.hideBypass;
      }
    };

    if (target) {
      resetModerationState(target);
      this.decorateVideoModeration(target);
    }

    if (this.currentVideo && this.currentVideo.id === video.id) {
      resetModerationState(this.currentVideo);
      this.decorateVideoModeration(this.currentVideo);
    }

    if (card && typeof card.refreshModerationUi === "function") {
      try {
        card.refreshModerationUi();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh moderation UI after block:",
          error,
        );
      }
    }

    const doc =
      (this.videoModal && this.videoModal.document) ||
      (typeof document !== "undefined" ? document : null);
    if (doc && typeof doc.dispatchEvent === "function") {
      try {
        const detail = { video: target };
        doc.dispatchEvent(new CustomEvent("video:moderation-block", { detail }));
        doc.dispatchEvent(new CustomEvent("video:moderation-hide", { detail }));
      } catch (eventError) {
        devLogger.warn(
          "[Application] Failed to dispatch moderation block event:",
          eventError,
        );
      }
    }

    try {
      await this.onVideosShouldRefresh({ reason: "user-block-update" });
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to refresh videos after block:",
        error,
      );
    }

    return true;
  }

  handleModerationHide({ video, card }) {
    if (!video || typeof video !== "object" || !video.id) {
      return false;
    }

    try {
      clearModerationOverride(video.id);
    } catch (error) {
      devLogger.warn("[Application] Failed to clear moderation override:", error);
    }

    const storedVideo =
      this.videosMap instanceof Map && video.id
        ? this.videosMap.get(video.id)
        : null;
    const target = storedVideo || video;

    const resetOverrideState = (subject) => {
      if (!subject || typeof subject !== "object") {
        return;
      }
      const moderation =
        subject.moderation && typeof subject.moderation === "object"
          ? subject.moderation
          : null;
      if (!moderation) {
        return;
      }
      if (moderation.viewerOverride) {
        delete moderation.viewerOverride;
      }
    };

    if (target) {
      resetOverrideState(target);
      this.decorateVideoModeration(target);
    }

    if (this.currentVideo && this.currentVideo.id === video.id) {
      resetOverrideState(this.currentVideo);
      this.decorateVideoModeration(this.currentVideo);
    }

    if (card && typeof card.refreshModerationUi === "function") {
      try {
        card.refreshModerationUi();
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh moderation UI after hide:",
          error,
        );
      }
    }

    const doc =
      (this.videoModal && this.videoModal.document) ||
      (typeof document !== "undefined" ? document : null);
    if (doc && typeof doc.dispatchEvent === "function") {
      try {
        doc.dispatchEvent(
          new CustomEvent("video:moderation-hide", { detail: { video: target } }),
        );
      } catch (eventError) {
        devLogger.warn(
          "[Application] Failed to dispatch moderation hide event:",
          eventError,
        );
      }
    }

    return true;
  }

  getVideoAddressPointer(video) {
    if (
      this.discussionCountService &&
      typeof this.discussionCountService.getVideoAddressPointer === "function"
    ) {
      return this.discussionCountService.getVideoAddressPointer(video);
    }

    return buildVideoAddressPointer(video, { defaultKind: VIDEO_EVENT_KIND });
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
    this.closeTagPreferenceMenus({ restoreFocus: options?.restoreFocus !== false });
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

  ensureSettingsPopover(detail = {}) {
    const trigger = detail.trigger || null;
    if (!trigger) {
      return null;
    }

    let entry = this.videoSettingsPopovers.get(trigger);
    if (!entry) {
      entry = {
        trigger,
        context: {
          card: detail.card || null,
          video: detail.video || null,
          index: Number.isFinite(detail.index) ? Math.floor(detail.index) : 0,
          capabilities: detail.capabilities || {},
          restoreFocusOnClose: detail.restoreFocus !== false,
        },
        popover: null,
      };

      const render = ({ document: documentRef, close }) => {
        const panel = createVideoSettingsMenuPanel({
          document: documentRef,
          video: entry.context.video,
          index: entry.context.index,
          capabilities: entry.context.capabilities,
          designSystem: this.designSystemContext,
        });

        if (!panel) {
          return null;
        }

        const buttons = panel.querySelectorAll("button[data-action]");
        buttons.forEach((button) => {
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const action = button.dataset.action || "";
            const handled = entry.context.card?.handleSettingsMenuAction?.(
              action,
              { event },
            );

            if (!handled && this.isDevMode) {
              userLogger.warn(`[SettingsMenu] Unhandled action: ${action}`);
            }

            close();
          });
        });

        return panel;
      };

      const documentRef =
        trigger.ownerDocument ||
        (typeof document !== "undefined" ? document : null);

      const popover = createPopover(trigger, render, {
        document: documentRef,
        placement: "bottom-end",
      });

      const originalDestroy = popover.destroy?.bind(popover);
      if (typeof originalDestroy === "function") {
        popover.destroy = (...args) => {
          originalDestroy(...args);
          if (this.videoSettingsPopovers.get(trigger) === entry) {
            this.videoSettingsPopovers.delete(trigger);
          }
        };
      }

      entry.popover = popover;
      this.videoSettingsPopovers.set(trigger, entry);
    }

    entry.context = {
      ...entry.context,
      card: detail.card || entry.context.card,
      video: detail.video || entry.context.video,
      index: Number.isFinite(detail.index)
        ? Math.floor(detail.index)
        : entry.context.index,
      capabilities: detail.capabilities || entry.context.capabilities,
      restoreFocusOnClose: detail.restoreFocus !== false,
    };

    return entry;
  }

  requestVideoSettingsMenu(detail = {}) {
    const entry = this.ensureSettingsPopover(detail);
    if (!entry?.popover) {
      return;
    }

    if (typeof entry.popover.isOpen === "function" && entry.popover.isOpen()) {
      entry.popover.close({
        restoreFocus: entry.context.restoreFocusOnClose !== false,
      });
      return;
    }

    entry.popover
      .open()
      .catch((error) =>
        userLogger.error("[SettingsMenu] Failed to open popover:", error),
      );
  }

  closeVideoSettingsMenu(detail = {}) {
    const trigger = detail.trigger || null;
    const restoreFocus = detail.restoreFocus !== false;

    if (trigger) {
      const entry = this.videoSettingsPopovers.get(trigger);
      if (entry?.popover && typeof entry.popover.close === "function") {
        return entry.popover.close({ restoreFocus });
      }
      return false;
    }

    let closed = false;
    this.videoSettingsPopovers.forEach((entry) => {
      if (entry?.popover && typeof entry.popover.close === "function") {
        const result = entry.popover.close({ restoreFocus });
        closed = closed || result;
      }
    });
    return closed;
  }

  ensureTagPreferencePopover(detail = {}) {
    const triggerCandidate = detail?.trigger || null;
    const trigger =
      triggerCandidate && triggerCandidate.nodeType === 1 ? triggerCandidate : null;
    const rawTag = typeof detail?.tag === "string" ? detail.tag : "";
    const tag = rawTag.trim();

    if (!trigger || !tag) {
      return null;
    }

    let entry = this.tagPreferencePopovers.get(trigger);

    const render = ({ document: documentRef, close }) => {
      const menu = createTagPreferenceMenu({
        document: documentRef,
        tag: entry.tag,
        isLoggedIn: this.isUserLoggedIn(),
        membership: this.getTagPreferenceMembership(entry.tag),
        designSystem: this.designSystemContext,
        onAction: (action, actionDetail = {}) => {
          void this.handleTagPreferenceMenuAction(action, {
            tag: entry.tag,
            trigger,
            video: entry.video || null,
            closePopover: close,
            actionDetail,
          });
        },
      });

      if (!menu?.panel) {
        return null;
      }

      entry.panel = menu.panel;
      entry.buttons = menu.buttons;
      return menu.panel;
    };

    if (!entry) {
      entry = {
        trigger,
        tag,
        context: detail.context || "",
        video: detail.video || null,
        panel: null,
        buttons: null,
        popover: null,
      };

      const ownerDocument =
        trigger.ownerDocument || (typeof document !== "undefined" ? document : null);

      const popover = createPopover(trigger, render, {
        document: ownerDocument,
        placement: "bottom-start",
        restoreFocusOnClose: true,
      });

      if (!popover) {
        return null;
      }

      const originalDestroy = popover.destroy?.bind(popover);
      if (typeof originalDestroy === "function") {
        popover.destroy = (...args) => {
          originalDestroy(...args);
          if (this.tagPreferencePopovers.get(trigger) === entry) {
            this.tagPreferencePopovers.delete(trigger);
          }
        };
      }

      entry.popover = popover;
      this.tagPreferencePopovers.set(trigger, entry);
    } else {
      entry.tag = tag;
      entry.context = detail.context || entry.context || "";
      entry.video = detail.video || entry.video || null;
    }

    return entry;
  }

  requestTagPreferenceMenu(detail = {}) {
    const entry = this.ensureTagPreferencePopover(detail);
    if (!entry?.popover) {
      return;
    }

    const popover = entry.popover;
    const restoreFocus = detail.restoreFocus !== false;

    if (typeof popover.isOpen === "function" && popover.isOpen()) {
      popover.close({ restoreFocus });
      return;
    }

    this.closeTagPreferenceMenus({
      restoreFocus: false,
      skipTrigger: entry.trigger,
    });
    this.closeVideoSettingsMenu({ restoreFocus: false });
    this.closeAllMoreMenus({
      restoreFocus: false,
      skipTrigger: entry.trigger,
      skipView: true,
    });

    popover
      .open()
      .then(() => {
        this.refreshActiveTagPreferenceMenus();
      })
      .catch((error) =>
        userLogger.error("[TagPreferenceMenu] Failed to open popover:", error),
      );
  }

  closeTagPreferenceMenus(detail = {}) {
    const triggerCandidate = detail?.trigger || null;
    const trigger =
      triggerCandidate && triggerCandidate.nodeType === 1 ? triggerCandidate : null;
    const restoreFocus = detail?.restoreFocus !== false;
    const skipTrigger = detail?.skipTrigger || null;

    if (trigger) {
      const entry = this.tagPreferencePopovers.get(trigger);
      if (entry?.popover && typeof entry.popover.close === "function") {
        return entry.popover.close({ restoreFocus });
      }
      return false;
    }

    let closed = false;
    this.tagPreferencePopovers.forEach((entry, key) => {
      if (!entry?.popover || typeof entry.popover.close !== "function") {
        return;
      }
      if (skipTrigger && key === skipTrigger) {
        return;
      }
      const result = entry.popover.close({ restoreFocus });
      closed = closed || result;
    });
    return closed;
  }

  async persistHashtagPreferencesFromMenu() {
    const service = this.hashtagPreferences;
    const publish =
      service && typeof service.publish === "function" ? service.publish : null;

    if (!publish) {
      const message = this.describeHashtagPreferencesError(null, {
        fallbackMessage: "Hashtag preferences are unavailable right now.",
      });
      if (message) {
        this.showError(message);
      }
      const error = new Error(
        message || "Hashtag preferences are unavailable right now.",
      );
      error.code = "service-unavailable";
      throw error;
    }

    if (this.hashtagPreferencesPublishInFlight) {
      return this.hashtagPreferencesPublishPromise;
    }

    const normalizedPubkey = this.normalizeHexPubkey(this.pubkey);
    const payload = normalizedPubkey ? { pubkey: normalizedPubkey } : {};

    this.hashtagPreferencesPublishInFlight = true;

    const publishPromise = (async () => {
      try {
        return await publish.call(service, payload);
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error || ""));
        if (!failure.code) {
          failure.code = "hashtag-preferences-publish-failed";
        }
        const message = this.describeHashtagPreferencesError(failure, {
          operation: "update",
        });
        if (message) {
          this.showError(message);
        }
        throw failure;
      } finally {
        this.hashtagPreferencesPublishInFlight = false;
        this.hashtagPreferencesPublishPromise = null;
      }
    })();

    this.hashtagPreferencesPublishPromise = publishPromise;
    return publishPromise;
  }

  async handleTagPreferenceMenuAction(action, detail = {}) {
    const tag = typeof detail?.tag === "string" ? detail.tag : "";
    if (!tag) {
      return;
    }

    const service = this.hashtagPreferences;
    if (!service) {
      return;
    }

    let result = false;
    try {
      switch (action) {
        case TAG_PREFERENCE_ACTIONS.ADD_INTEREST:
          result = service.addInterest(tag);
          break;
        case TAG_PREFERENCE_ACTIONS.REMOVE_INTEREST:
          result = service.removeInterest(tag);
          break;
        case TAG_PREFERENCE_ACTIONS.ADD_DISINTEREST:
          result = service.addDisinterest(tag);
          break;
        case TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST:
          result = service.removeDisinterest(tag);
          break;
        default:
          userLogger.warn(`[TagPreferenceMenu] Unhandled action: ${action}`);
          return;
      }
    } catch (error) {
      devLogger.error(
        "[Application] Failed to mutate hashtag preference via menu:",
        error,
      );
      const message = this.describeHashtagPreferencesError(error, {
        operation: "update",
      });
      if (message) {
        this.showError(message);
      }
      return;
    }

    if (!result) {
      return;
    }

    this.updateCachedHashtagPreferences();
    this.refreshTagPreferenceUi();

    try {
      await this.persistHashtagPreferencesFromMenu();
    } catch (error) {
      return;
    }

    this.updateCachedHashtagPreferences();
    this.refreshTagPreferenceUi();

    if (typeof detail?.closePopover === "function") {
      detail.closePopover({ restoreFocus: false });
    }
  }

  handleTagPreferenceActivation(detail = {}) {
    const tag = typeof detail?.tag === "string" ? detail.tag : "";
    if (!tag) {
      return;
    }

    const triggerCandidate = detail?.trigger || null;
    const trigger =
      triggerCandidate && triggerCandidate.nodeType === 1 ? triggerCandidate : null;
    if (!trigger) {
      return;
    }

    if (detail?.event) {
      detail.event.preventDefault?.();
      detail.event.stopPropagation?.();
    }

    this.requestTagPreferenceMenu({
      trigger,
      tag,
      context: detail?.context || "",
      video: detail?.video || null,
    });
  }

  syncModalMoreMenuData() {
    if (this.moreMenuController) {
      this.moreMenuController.syncModalMoreMenuData();
    }
  }

  derivePointerFromDataset(dataset = {}, context = "") {
    const type =
      typeof dataset.pointerType === "string" ? dataset.pointerType.trim() : "";
    const value =
      typeof dataset.pointerValue === "string" ? dataset.pointerValue.trim() : "";
    const relay =
      typeof dataset.pointerRelay === "string" ? dataset.pointerRelay.trim() : "";

    if (type && value) {
      return relay ? [type, value, relay] : [type, value];
    }

    if (
      context === "modal" &&
      Array.isArray(this.currentVideoPointer) &&
      this.currentVideoPointer.length >= 2
    ) {
      return this.currentVideoPointer;
    }

    if (
      context === "modal" &&
      Array.isArray(this.currentVideo?.pointer) &&
      this.currentVideo.pointer.length >= 2
    ) {
      return this.currentVideo.pointer;
    }

    return null;
  }

  async handleMoreMenuAction(action, dataset = {}) {
    if (!this.moreMenuController) {
      return;
    }

    return this.moreMenuController.handleMoreMenuAction(action, dataset);
  }

  async handleRepostAction(dataset = {}) {
    const context = typeof dataset.context === "string" ? dataset.context : "";
    const explicitEventId =
      typeof dataset.eventId === "string" && dataset.eventId.trim()
        ? dataset.eventId.trim()
        : "";
    const fallbackEventId =
      context === "modal" && this.currentVideo?.id ? this.currentVideo.id : "";
    const targetEventId = explicitEventId || fallbackEventId;

    if (!targetEventId) {
      this.showError("No event is available to repost.");
      return;
    }

    const pointer = this.derivePointerFromDataset(dataset, context);

    let author = typeof dataset.author === "string" ? dataset.author.trim() : "";
    if (!author && context === "modal" && this.currentVideo?.pubkey) {
      author = this.currentVideo.pubkey;
    }

    const rawKindValue = (() => {
      if (typeof dataset.kind === "string" && dataset.kind.trim()) {
        const parsed = Number.parseInt(dataset.kind.trim(), 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (Number.isFinite(dataset.kind)) {
        return Number(dataset.kind);
      }
      if (Number.isFinite(this.currentVideo?.kind)) {
        return Number(this.currentVideo.kind);
      }
      return null;
    })();

    const options = {
      pointer,
      pointerType: dataset.pointerType,
      pointerValue: dataset.pointerValue,
      pointerRelay: dataset.pointerRelay,
      authorPubkey: author,
    };

    if (Number.isFinite(rawKindValue)) {
      options.kind = Math.floor(rawKindValue);
    }

    try {
      const result = await nostrClient.repostEvent(targetEventId, options);

      if (!result?.ok) {
        const code = result?.error || "repost-failed";
        switch (code) {
          case "invalid-event-id":
            this.showError("No event is available to repost.");
            break;
          case "missing-actor":
            this.showError(
              "Cannot sign the repost right now. Please refresh and try again.",
            );
            break;
          case "pool-unavailable":
            this.showError("Cannot reach relays right now. Please try again later.");
            break;
          case "publish-rejected":
            this.showError("No relay accepted the repost attempt.");
            break;
          case "signing-failed":
            this.showError("Failed to sign the repost. Please try again.");
            break;
          default:
            this.showError("Failed to repost the video. Please try again later.");
            break;
        }
        return;
      }

      const acceptedCount = Array.isArray(result.summary?.accepted)
        ? result.summary.accepted.length
        : 0;
      const relayCount =
        acceptedCount > 0
          ? acceptedCount
          : Array.isArray(result.relays)
          ? result.relays.length
          : acceptedCount;

      const fragments = [];
      if (relayCount > 0) {
        fragments.push(
          `Reposted to ${relayCount} relay${relayCount === 1 ? "" : "s"}.`,
        );
      } else {
        fragments.push("Reposted.");
      }

      if (result.sessionActor) {
        fragments.push("Boost as session user.");
      }

      this.showSuccess(fragments.join(" ").trim());
    } catch (error) {
      devLogger.warn("[app] Repost action failed:", error);
      this.showError("Failed to repost the video. Please try again later.");
    }
  }

  async handleMirrorAction(dataset = {}) {
    const context = typeof dataset.context === "string" ? dataset.context : "";
    const explicitEventId =
      typeof dataset.eventId === "string" && dataset.eventId.trim()
        ? dataset.eventId.trim()
        : "";
    const fallbackEventId =
      context === "modal" && this.currentVideo?.id ? this.currentVideo.id : "";
    const targetEventId = explicitEventId || fallbackEventId;

    if (!targetEventId) {
      this.showError("No event is available to mirror.");
      return;
    }

    const explicitUrl =
      typeof dataset.url === "string" && dataset.url.trim() ? dataset.url.trim() : "";
    const fallbackUrl =
      context === "modal" && typeof this.currentVideo?.url === "string"
        ? this.currentVideo.url.trim()
        : "";
    const targetUrl = explicitUrl || fallbackUrl;

    if (!targetUrl) {
      this.showError("This video does not expose a hosted URL to mirror.");
      return;
    }

    const rawMagnet =
      typeof dataset.magnet === "string" && dataset.magnet.trim()
        ? dataset.magnet.trim()
        : "";
    const fallbackMagnet =
      context === "modal"
        ? (this.currentVideo?.magnet || this.currentVideo?.originalMagnet || "")
        : "";
    const magnet = rawMagnet || fallbackMagnet;

    const thumbnail =
      typeof dataset.thumbnail === "string" && dataset.thumbnail.trim()
        ? dataset.thumbnail.trim()
        : context === "modal" && typeof this.currentVideo?.thumbnail === "string"
        ? this.currentVideo.thumbnail.trim()
        : "";

    const description =
      typeof dataset.description === "string" && dataset.description.trim()
        ? dataset.description.trim()
        : context === "modal" && typeof this.currentVideo?.description === "string"
        ? this.currentVideo.description.trim()
        : "";

    const title =
      typeof dataset.title === "string" && dataset.title.trim()
        ? dataset.title.trim()
        : context === "modal" && typeof this.currentVideo?.title === "string"
        ? this.currentVideo.title.trim()
        : "";

    const datasetPrivate =
      dataset.isPrivate === "true" || dataset.isPrivate === true ? true : false;
    const fallbackPrivate = context === "modal" && this.currentVideo?.isPrivate === true;
    const isPrivate = datasetPrivate || fallbackPrivate;

    if (isPrivate) {
      this.showError("Mirroring is unavailable for private videos.");
      return;
    }

    const options = {
      url: targetUrl,
      magnet,
      thumbnail,
      description,
      title,
      isPrivate,
    };

    try {
      const result = await nostrClient.mirrorVideoEvent(targetEventId, options);

      if (!result?.ok) {
        const code = result?.error || "mirror-failed";
        switch (code) {
          case "invalid-event-id":
            this.showError("No event is available to mirror.");
            break;
          case "missing-url":
            this.showError("This video does not expose a hosted URL to mirror.");
            break;
          case "missing-actor":
            this.showError(
              "Cannot sign the mirror right now. Please refresh and try again.",
            );
            break;
          case "pool-unavailable":
            this.showError("Cannot reach relays right now. Please try again later.");
            break;
          case "publish-rejected":
            this.showError("No relay accepted the mirror attempt.");
            break;
          case "signing-failed":
            this.showError("Failed to sign the mirror. Please try again.");
            break;
          default:
            this.showError("Failed to mirror the video. Please try again later.");
            break;
        }
        return;
      }

      const acceptedCount = Array.isArray(result.summary?.accepted)
        ? result.summary.accepted.length
        : 0;
      const relayCount =
        acceptedCount > 0
          ? acceptedCount
          : Array.isArray(result.relays)
          ? result.relays.length
          : acceptedCount;

      const fragments = [];
      if (relayCount > 0) {
        fragments.push(
          `Mirrored to ${relayCount} relay${relayCount === 1 ? "" : "s"}.`,
        );
      } else {
        fragments.push("Mirrored.");
      }

      if (result.sessionActor) {
        fragments.push("Boost as session user.");
      }

      this.showSuccess(fragments.join(" ").trim());
    } catch (error) {
      devLogger.warn("[app] Mirror action failed:", error);
      this.showError("Failed to mirror the video. Please try again later.");
    }
  }

  async handleEnsurePresenceAction(dataset = {}) {
    const context = typeof dataset.context === "string" ? dataset.context : "";
    const explicitEventId =
      typeof dataset.eventId === "string" && dataset.eventId.trim()
        ? dataset.eventId.trim()
        : "";
    const fallbackEventId =
      context === "modal" && this.currentVideo?.id ? this.currentVideo.id : "";
    const targetEventId = explicitEventId || fallbackEventId;

    if (!targetEventId) {
      this.showError("No event is available to rebroadcast.");
      return;
    }

    const explicitPubkey =
      typeof dataset.pubkey === "string" && dataset.pubkey.trim()
        ? dataset.pubkey.trim()
        : "";
    const datasetAuthor =
      typeof dataset.author === "string" && dataset.author.trim()
        ? dataset.author.trim()
        : "";
    const fallbackPubkey =
      context === "modal" && typeof this.currentVideo?.pubkey === "string"
        ? this.currentVideo.pubkey
        : datasetAuthor;
    const targetPubkey = explicitPubkey || fallbackPubkey || "";

    try {
      const result = await nostrClient.rebroadcastEvent(targetEventId, {
        pubkey: targetPubkey,
      });

      if (result?.throttled) {
        const remainingMs = Math.max(0, Number(result?.cooldown?.remainingMs) || 0);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        const message =
          remainingSeconds > 0
            ? `Rebroadcast is cooling down. Try again in ${remainingSeconds}s.`
            : "Rebroadcast is cooling down. Try again soon.";
        this.showStatus(message);
        if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
          window.setTimeout(() => {
            this.showStatus("");
          }, 5000);
        }
        return;
      }

      if (!result?.ok) {
        const code = result?.error || "rebroadcast-failed";
        switch (code) {
          case "event-not-found":
            this.showError("Original event payload is unavailable. Reload and try again.");
            break;
          case "publish-rejected":
            this.showError("No relay accepted the rebroadcast attempt.");
            break;
          case "pool-unavailable":
            this.showError("Cannot reach relays right now. Please try again later.");
            break;
          default:
            this.showError("Failed to rebroadcast. Please try again later.");
            break;
        }
        return;
      }

      if (result?.alreadyPresent) {
        this.showSuccess("Relays already have this revision.");
        return;
      }

      this.showSuccess("Rebroadcast requested across relays.");
    } catch (error) {
      devLogger.warn("[app] Rebroadcast action failed:", error);
      this.showError("Failed to rebroadcast. Please try again later.");
    }
  }

  /**
   * Updates the modal to reflect current torrent stats.
   * We remove the unused torrent.status references,
   * and do not re-trigger recursion here (no setTimeout).
   */
  updateTorrentStatus(torrent) {
    devLogger.log("[DEBUG] updateTorrentStatus called with torrent:", torrent);

    if (!torrent) {
      devLogger.log("[DEBUG] torrent is null/undefined!");
      return;
    }

    if (torrent.ready || (typeof torrent.progress === "number" && torrent.progress > 0)) {
      // Belt-and-suspenders: if WebTorrent reports progress but the DOM events
      // failed to fire we still rip off the loading GIF. This regression has
      // bitten us in past releases, so the extra clear is intentional.
      this.forceRemoveModalPoster(
        torrent.ready ? "torrent-ready-flag" : "torrent-progress"
      );
    }

    // Log only fields that actually exist on the torrent:
    devLogger.log("[DEBUG] torrent.progress =", torrent.progress);
    devLogger.log("[DEBUG] torrent.numPeers =", torrent.numPeers);
    devLogger.log("[DEBUG] torrent.downloadSpeed =", torrent.downloadSpeed);
    devLogger.log("[DEBUG] torrent.downloaded =", torrent.downloaded);
    devLogger.log("[DEBUG] torrent.length =", torrent.length);
    devLogger.log("[DEBUG] torrent.ready =", torrent.ready);

    // Use "Complete" vs. "Downloading" as the textual status.
    if (this.videoModal) {
      const fullyDownloaded = torrent.progress >= 1;
      this.videoModal.updateStatus(fullyDownloaded ? "Complete" : "Downloading");

      const percent = (torrent.progress * 100).toFixed(2);
      this.videoModal.updateProgress(`${percent}%`);
      this.videoModal.updatePeers(`Peers: ${torrent.numPeers}`);

      const kb = (torrent.downloadSpeed / 1024).toFixed(2);
      this.videoModal.updateSpeed(`${kb} KB/s`);

      const downloadedMb = (torrent.downloaded / (1024 * 1024)).toFixed(2);
      const lengthMb = (torrent.length / (1024 * 1024)).toFixed(2);
      this.videoModal.updateDownloaded(
        `${downloadedMb} MB / ${lengthMb} MB`
      );

      if (torrent.ready) {
        this.videoModal.updateStatus("Ready to play");
      }
    }
  }

  normalizeActionTarget(target) {
    const isElement = (value) =>
      typeof Element !== "undefined" && value instanceof Element;
    let triggerElement = null;
    if (target && typeof target === "object") {
      const eventId =
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
      if (isElement(target.triggerElement)) {
        triggerElement = target.triggerElement;
      } else if (isElement(target.trigger)) {
        triggerElement = target.trigger;
      }
      return { eventId, index, triggerElement };
    }

    if (typeof target === "string") {
      const trimmed = target.trim();
      if (!trimmed) {
        return { eventId: "", index: null, triggerElement };
      }
      if (/^-?\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        return {
          eventId: "",
          index: Number.isNaN(parsed) ? null : parsed,
          triggerElement,
        };
      }
      return { eventId: trimmed, index: null, triggerElement };
    }

    if (typeof target === "number" && Number.isInteger(target)) {
      return { eventId: "", index: target, triggerElement };
    }

    return { eventId: "", index: null, triggerElement };
  }

  async resolveVideoActionTarget({
    eventId = "",
    index = null,
    preloadedList,
  } = {}) {
    const trimmedEventId = typeof eventId === "string" ? eventId.trim() : "";
    const normalizedIndex =
      typeof index === "number" && Number.isInteger(index) && index >= 0
        ? index
        : null;

    const candidateLists = Array.isArray(preloadedList)
      ? [preloadedList]
      : [];

    for (const list of candidateLists) {
      if (trimmedEventId) {
        const match = list.find((video) => video?.id === trimmedEventId);
        if (match) {
          this.videosMap.set(match.id, match);
          return match;
        }
      }
      if (
        normalizedIndex !== null &&
        normalizedIndex >= 0 &&
        normalizedIndex < list.length
      ) {
        const match = list[normalizedIndex];
        if (match) {
          this.videosMap.set(match.id, match);
          return match;
        }
      }
    }

    if (trimmedEventId) {
      const fromMap = this.videosMap.get(trimmedEventId);
      if (fromMap) {
        return fromMap;
      }

      const activeVideos = nostrClient.getActiveVideos();
      const fromActive = activeVideos.find((video) => video.id === trimmedEventId);
      if (fromActive) {
        this.videosMap.set(fromActive.id, fromActive);
        return fromActive;
      }

      const fromAll = nostrClient.allEvents.get(trimmedEventId);
      if (fromAll) {
        this.videosMap.set(fromAll.id, fromAll);
        return fromAll;
      }

      const fetched = await nostrClient.getEventById(trimmedEventId);
      if (fetched) {
        this.videosMap.set(fetched.id, fetched);
        return fetched;
      }
    }

    if (normalizedIndex !== null) {
      const activeVideos = nostrClient.getActiveVideos();
      if (normalizedIndex >= 0 && normalizedIndex < activeVideos.length) {
        const candidate = activeVideos[normalizedIndex];
        if (candidate) {
          this.videosMap.set(candidate.id, candidate);
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Handle "Edit Video" from gear menu.
   */
  async handleEditModalSubmit(event) {
    const detail = event?.detail || {};
    const { originalEvent, updatedData } = detail;
    if (!originalEvent || !updatedData) {
      return;
    }

    if (!this.pubkey) {
      this.showError("Please login to edit videos.");
      if (this.editModal?.setSubmitState) {
        this.editModal.setSubmitState({ pending: false });
      }
      return;
    }

    try {
      await this.nostrService.handleEditVideoSubmit({
        originalEvent,
        updatedData,
        pubkey: this.pubkey,
      });
      await this.loadVideos();
      this.videosMap.clear();
      this.showSuccess("Video updated successfully!");
      if (this.editModal?.setSubmitState) {
        this.editModal.setSubmitState({ pending: false });
      }
      this.editModal.close();
      this.forceRefreshAllProfiles();
    } catch (error) {
      devLogger.error("Failed to edit video:", error);
      this.showError("Failed to edit video. Please try again.");
      if (this.editModal?.setSubmitState) {
        this.editModal.setSubmitState({ pending: false });
      }
    }
  }

  async handleEditVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
      const { triggerElement } = normalizedTarget;
      const latestVideos = await this.nostrService.fetchVideos({
        blacklistedEventIds: this.blacklistedEventIds,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      });
      const video = await this.resolveVideoActionTarget({
        ...normalizedTarget,
        preloadedList: latestVideos,
      });

      // 2) Basic ownership checks
      if (!this.pubkey) {
        this.showError("Please login to edit videos.");
        return;
      }
      const userPubkey = (this.pubkey || "").toLowerCase();
      const videoPubkey = (video?.pubkey || "").toLowerCase();
      if (!video || !videoPubkey || videoPubkey !== userPubkey) {
        this.showError("You do not own this video.");
        return;
      }

      try {
        await this.editModal.load();
      } catch (error) {
        devLogger.error("Failed to load edit modal:", error);
        this.showError(`Failed to initialize edit modal: ${error.message}`);
        return;
      }

      try {
        await this.editModal.open(video, { triggerElement });
      } catch (error) {
        devLogger.error("Failed to open edit modal:", error);
        this.showError("Edit modal is not available right now.");
      }
    } catch (err) {
      devLogger.error("Failed to edit video:", err);
      this.showError("Failed to edit video. Please try again.");
    }
  }

  async handleRevertVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
      const { triggerElement } = normalizedTarget;
      const activeVideos = await this.nostrService.fetchVideos({
        blacklistedEventIds: this.blacklistedEventIds,
        isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      });
      const video = await this.resolveVideoActionTarget({
        ...normalizedTarget,
        preloadedList: activeVideos,
      });

      if (!this.pubkey) {
        this.showError("Please login to revert.");
        return;
      }
      const userPubkey = (this.pubkey || "").toLowerCase();
      const videoPubkey = (video?.pubkey || "").toLowerCase();
      if (!video || !videoPubkey || videoPubkey !== userPubkey) {
        this.showError("You do not own this video.");
        return;
      }

      if (!this.revertModal) {
        this.showError("Revert modal is not available right now.");
        return;
      }

      const loaded = await this.revertModal.load();
      if (!loaded) {
        this.showError("Revert modal is not available right now.");
        return;
      }

      const history = await nostrClient.hydrateVideoHistory(video);

      this.revertModal.setHistory(video, history);
      this.revertModal.open({ video }, { triggerElement });
    } catch (err) {
      devLogger.error("Failed to revert video:", err);
      this.showError("Failed to load revision history. Please try again.");
    }
  }

  async handleRevertModalConfirm(event) {
    const detail = event?.detail || {};
    const target = detail.target;
    const entries = Array.isArray(detail.entries)
      ? detail.entries.slice()
      : [];

    if (!target || !entries.length) {
      return;
    }

    if (!this.pubkey) {
      this.showError("Please login to revert.");
      return;
    }

    if (!this.revertModal) {
      this.showError("Revert modal is not available right now.");
      return;
    }

    this.revertModal.setBusy(true, "Reverting…");

    try {
      for (const entry of entries) {
        await nostrClient.revertVideo(
          {
            id: entry.id,
            pubkey: entry.pubkey,
            tags: entry.tags,
          },
          this.pubkey
        );
      }

      await this.loadVideos();

      const timestampLabel = this.formatAbsoluteTimestamp(target.created_at);
      this.showSuccess(`Reverted to revision from ${timestampLabel}.`);
      this.revertModal.close();
      this.forceRefreshAllProfiles();
    } catch (err) {
      devLogger.error("Failed to revert video:", err);
      this.showError("Failed to revert video. Please try again.");
    } finally {
      this.revertModal.setBusy(false);
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
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const maybeNevent = urlParams.get("v");
    if (!maybeNevent) return; // no link param

    try {
      const decoded = window.NostrTools.nip19.decode(maybeNevent);
      if (decoded.type === "nevent" && decoded.data.id) {
        const eventId = decoded.data.id;
        // 1) check local map
        let localMatch = this.videosMap.get(eventId);
        if (localMatch) {
          this.playVideoByEventId(eventId);
        } else {
          // 2) fallback => getOldEventById
          this.getOldEventById(eventId)
            .then((video) => {
              if (video) {
                this.playVideoByEventId(eventId);
              } else {
                this.showError("No matching video found for that link.");
              }
            })
            .catch((err) => {
              devLogger.error("Error fetching older event by ID:", err);
              this.showError("Could not load videos for the share link.");
            });
        }
      }
    } catch (err) {
      devLogger.error("Error decoding nevent:", err);
      this.showError("Invalid share link.");
    }
  }

  async probeUrlWithVideoElement(url, timeoutMs = URL_PROBE_TIMEOUT_MS) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed || typeof document === "undefined") {
      return { outcome: "error" };
    }

    return new Promise((resolve) => {
      const video = document.createElement("video");
      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        video.removeEventListener("loadeddata", handleSuccess);
        video.removeEventListener("canplay", handleSuccess);
        video.removeEventListener("error", handleError);
        try {
          video.pause();
        } catch (err) {
          // ignore pause failures (e.g. if never played)
        }
        try {
          video.removeAttribute("src");
          video.load();
        } catch (err) {
          // ignore cleanup failures
        }
      };

      const settle = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      const handleSuccess = () => {
        settle({ outcome: "ok" });
      };

      const handleError = () => {
        settle({ outcome: "error" });
      };

      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          settle({ outcome: "timeout" });
        }, timeoutMs);
      }

      try {
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.addEventListener("loadeddata", handleSuccess, { once: true });
        video.addEventListener("canplay", handleSuccess, { once: true });
        video.addEventListener("error", handleError, { once: true });
        video.src = trimmed;
        video.load();
      } catch (err) {
        settle({ outcome: "error", error: err });
      }
    });
  }

  async probeUrl(url, options = {}) {
    const trimmed = typeof url === "string" ? url.trim() : "";
    if (!trimmed) {
      return { outcome: "invalid" };
    }

    const confirmPlayable = options?.confirmPlayable === true;

    const confirmWithVideoElement = async () => {
      if (!confirmPlayable) {
        return null;
      }

      const initialTimeout =
        Number.isFinite(options?.videoProbeTimeoutMs) &&
        options.videoProbeTimeoutMs > 0
          ? options.videoProbeTimeoutMs
          : URL_PROBE_TIMEOUT_MS;

      const attemptWithTimeout = async (timeoutMs) => {
        try {
          const result = await this.probeUrlWithVideoElement(trimmed, timeoutMs);
          if (result && result.outcome) {
            return result;
          }
        } catch (err) {
          devLogger.warn(
            `[probeUrl] Video element probe threw for ${trimmed}:`,
            err
          );
        }
        return null;
      };

      let result = await attemptWithTimeout(initialTimeout);

      if (
        result &&
        result.outcome === "timeout" &&
        Number.isFinite(urlHealthConstants.URL_PROBE_TIMEOUT_RETRY_MS) &&
        urlHealthConstants.URL_PROBE_TIMEOUT_RETRY_MS > initialTimeout
      ) {
        const retryResult = await attemptWithTimeout(
          urlHealthConstants.URL_PROBE_TIMEOUT_RETRY_MS
        );
        if (retryResult) {
          result = { ...retryResult, retriedAfterTimeout: true };
        }
      }

      return result;
    };

    const supportsAbort = typeof AbortController !== "undefined";
    const controller = supportsAbort ? new AbortController() : null;
    let timeoutId = null;

    const racers = [
      fetch(trimmed, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: controller ? controller.signal : undefined,
      }),
    ];

    if (Number.isFinite(URL_PROBE_TIMEOUT_MS) && URL_PROBE_TIMEOUT_MS > 0) {
      racers.push(
        new Promise((resolve) => {
          timeoutId = setTimeout(() => {
            if (controller) {
              try {
                controller.abort();
              } catch (err) {
                // ignore abort errors
              }
            }
            resolve({ outcome: "timeout" });
          }, URL_PROBE_TIMEOUT_MS);
        })
      );
    }

    let responseOrTimeout;
    try {
      responseOrTimeout = await Promise.race(racers);
    } catch (err) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      devLogger.warn(`[probeUrl] HEAD request failed for ${trimmed}:`, err);
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return confirmPlayable
        ? { outcome: "error", error: err }
        : { outcome: "unknown", error: err };
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (responseOrTimeout && responseOrTimeout.outcome === "timeout") {
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return confirmPlayable ? { outcome: "timeout" } : { outcome: "unknown" };
    }

    const response = responseOrTimeout;
    if (!response) {
      return { outcome: "error" };
    }

    if (response.type === "opaque") {
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return { outcome: confirmPlayable ? "opaque" : "unknown" };
    }

    if (!response.ok) {
      const fallback = await confirmWithVideoElement();
      if (fallback) {
        return fallback;
      }
      return {
        outcome: "bad",
        status: response.status,
      };
    }

    const playbackCheck = await confirmWithVideoElement();
    if (playbackCheck) {
      if (playbackCheck.outcome === "ok") {
        return {
          ...playbackCheck,
          status: response.status,
        };
      }
      return playbackCheck;
    }

    return {
      outcome: "ok",
      status: response.status,
    };
  }

  async playHttp(videoEl, url) {
    const target = videoEl || this.modalVideo;
    if (!target) {
      return false;
    }

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    if (!sanitizedUrl) {
      return false;
    }

    target.src = sanitizedUrl;

    try {
      await target.play();
      return true;
    } catch (err) {
      devLogger.warn("[playHttp] Direct URL playback failed:", err);
      return false;
    }
  }

  async playViaWebTorrent(
    magnet,
    { fallbackMagnet = "", urlList = [] } = {}
  ) {
    const sanitizedUrlList = Array.isArray(urlList)
      ? urlList
          .map((entry) =>
            typeof entry === "string" ? entry.trim() : ""
          )
          .filter((entry) => /^https?:\/\//i.test(entry))
      : [];

    const attemptStream = async (candidate) => {
      const trimmedCandidate =
        typeof candidate === "string" ? candidate.trim() : "";
      if (!trimmedCandidate) {
        throw new Error("No magnet URI provided for torrent playback.");
      }
      if (!isValidMagnetUri(trimmedCandidate)) {
        if (this.videoModal) {
          this.videoModal.updateStatus(UNSUPPORTED_BTITH_MESSAGE);
        }
        throw new Error(UNSUPPORTED_BTITH_MESSAGE);
      }
      if (!this.modalVideo) {
        throw new Error(
          "No modal video element available for torrent playback."
        );
      }

      const timestamp = Date.now().toString();
      const [magnetPrefix, magnetQuery = ""] = trimmedCandidate.split("?", 2);
      let normalizedMagnet = magnetPrefix;
      let queryParts = magnetQuery
        .split("&")
        .map((part) => part.trim())
        .filter((part) => part && !/^ts=\d+$/.test(part));

      if (queryParts.length) {
        normalizedMagnet = `${magnetPrefix}?${queryParts.join("&")}`;
      }

      const separator = normalizedMagnet.includes("?") ? "&" : "?";
      const cacheBustedMagnet = `${normalizedMagnet}${separator}ts=${timestamp}`;

      await torrentClient.cleanup();
      this.resetTorrentStats();

      if (this.videoModal) {
        this.videoModal.updateStatus("Streaming via WebTorrent");
        this.videoModal.setTorrentStatsVisibility?.(true);
      }

      const torrentInstance = await torrentClient.streamVideo(
        cacheBustedMagnet,
        this.modalVideo,
        { urlList: sanitizedUrlList }
      );

      if (torrentClient.isServiceWorkerUnavailable()) {
        const swError = torrentClient.getServiceWorkerInitError();
        const statusMessage = buildServiceWorkerFallbackStatus(swError);
        this.log(
          "[playViaWebTorrent] Service worker unavailable; streaming directly via WebTorrent.",
          swError
        );
        if (swError) {
          userLogger.warn(
            "[playViaWebTorrent] Service worker unavailable; direct streaming engaged.",
            swError
          );
        }
        if (this.videoModal) {
          this.videoModal.updateStatus(statusMessage);
        }
      }
      if (torrentInstance && torrentInstance.ready) {
        // Some browsers delay `playing` events for MediaSource-backed torrents.
        // Clearing the poster here prevents the historic "GIF stuck over the
        // video" regression when WebTorrent is already feeding data.
        this.forceRemoveModalPoster("webtorrent-ready");
      }
      this.startTorrentStatusMirrors(torrentInstance);
      return torrentInstance;
    };

    const primaryTrimmed =
      typeof magnet === "string" ? magnet.trim() : "";
    const fallbackTrimmed =
      typeof fallbackMagnet === "string" ? fallbackMagnet.trim() : "";
    const hasFallback =
      !!fallbackTrimmed && fallbackTrimmed !== primaryTrimmed;

    try {
      return await attemptStream(primaryTrimmed);
    } catch (primaryError) {
      if (!hasFallback) {
        throw primaryError;
      }
      this.log(
        `[playViaWebTorrent] Normalized magnet failed: ${primaryError.message}`
      );
      this.log(
        "[playViaWebTorrent] Primary magnet failed, retrying original string."
      );
      try {
        return await attemptStream(fallbackTrimmed);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  /**
   * Unified playback helper that prefers HTTP URL sources
   * and falls back to WebTorrent when needed.
   */
  async playVideoWithFallback(options = {}) {
    const { url = "", magnet = "", trigger } = options || {};
    const hasTrigger = Object.prototype.hasOwnProperty.call(
      options || {},
      "trigger"
    );
    if (hasTrigger) {
      this.setLastModalTrigger(trigger);
    }
    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const previousSource = this.playSource || null;
    const requestSignature = JSON.stringify({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
    });

    const modalVideoIsConnected = (() => {
      if (!this.modalVideo) {
        return false;
      }
      if (typeof this.modalVideo.isConnected === "boolean") {
        return this.modalVideo.isConnected;
      }
      const ownerDocument = this.modalVideo.ownerDocument ||
        (typeof document !== "undefined" ? document : null);
      if (ownerDocument?.contains) {
        try {
          return ownerDocument.contains(this.modalVideo);
        } catch (error) {
          devLogger.warn(
            "[playVideoWithFallback] Failed to determine modal video connection state",
            error,
          );
        }
      }
      return true;
    })();

    const shouldReuseActiveSession =
      modalVideoIsConnected &&
      this.activePlaybackSession &&
      typeof this.activePlaybackSession.matchesRequestSignature === "function" &&
      this.activePlaybackSession.matchesRequestSignature(requestSignature);

    if (shouldReuseActiveSession) {
      this.log(
        "[playVideoWithFallback] Duplicate playback request detected; reusing active session."
      );
      if (this.activePlaybackResultPromise) {
        return this.activePlaybackResultPromise;
      }
      if (typeof this.activePlaybackSession.getResult === "function") {
        return this.activePlaybackSession.getResult();
      }
      return { source: null };
    }

    await this.waitForCleanup();
    this.cancelPendingViewLogging();

    if (
      previousSource === "torrent" &&
      sanitizedUrl &&
      this.playbackService &&
      this.playbackService.torrentClient &&
      typeof this.playbackService.torrentClient.cleanup === "function"
    ) {
      try {
        this.log(
          "[playVideoWithFallback] Previous playback used WebTorrent; cleaning up before preparing hosted session.",
        );
        await this.playbackService.torrentClient.cleanup();
      } catch (error) {
        devLogger.warn(
          "[playVideoWithFallback] Pre-playback torrent cleanup threw:",
          error,
        );
      }
    }

    let modalVideoEl = this.modalVideo;
    const modalVideoFromController =
      this.videoModal && typeof this.videoModal.getVideoElement === "function"
        ? this.videoModal.getVideoElement()
        : null;
    if (modalVideoFromController && modalVideoFromController !== modalVideoEl) {
      modalVideoEl = modalVideoFromController;
      this.modalVideo = modalVideoEl;
    }
    const modalVideoConnected = Boolean(
      modalVideoEl && modalVideoEl.isConnected,
    );
    if (!modalVideoEl || !modalVideoConnected) {
      try {
        const { videoElement } = await this.ensureVideoModalReady({
          ensureVideoElement: true,
        });
        modalVideoEl = videoElement;
        this.modalVideo = modalVideoEl;
      } catch (error) {
        this.log(
          "[playVideoWithFallback] Failed to load video modal before playback:",
          error
        );
        this.showError("Could not prepare the video player. Please try again.");
        return { source: null, error };
      }
    }

    if (!modalVideoEl) {
      const error = new Error("Video element is not ready for playback.");
      this.log(
        "[playVideoWithFallback] Video element missing after modal load attempt."
      );
      this.showError("Video player is not ready yet. Please try again.");
      return { source: null, error };
    }

    if (
      this.videoModal &&
      typeof this.videoModal.clearPosterCleanup === "function"
    ) {
      try {
        this.videoModal.clearPosterCleanup();
      } catch (err) {
        devLogger.warn(
          "[playVideoWithFallback] video modal poster cleanup threw:",
          err
        );
      }
    }

    const refreshedModal = this.teardownVideoElement(modalVideoEl, {
      replaceNode: true,
    });
    if (refreshedModal) {
      if (
        this.videoModal &&
        typeof this.videoModal.setVideoElement === "function"
      ) {
        this.videoModal.setVideoElement(refreshedModal);
      }
      this.modalVideo = refreshedModal;
      modalVideoEl = this.modalVideo;
      this.applyModalLoadingPoster();
    } else {
      this.applyModalLoadingPoster();
    }

    const session = this.playbackService.createSession({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
      requestSignature,
      videoElement: this.modalVideo,
      waitForCleanup: () => this.waitForCleanup(),
      cancelPendingViewLogging: () => this.cancelPendingViewLogging(),
      clearActiveIntervals: () => this.clearActiveIntervals(),
      showModalWithPoster: () => this.showModalWithPoster(),
      teardownVideoElement: (videoEl, options) =>
        this.teardownVideoElement(videoEl, options),
      probeUrl: (candidateUrl) => this.probeUrl(candidateUrl),
      playViaWebTorrent: (magnetUri, options) =>
        this.playViaWebTorrent(magnetUri, options),
      autoplay: () => this.autoplayModalVideo(),
      unsupportedBtihMessage: UNSUPPORTED_BTITH_MESSAGE,
    });

    this.activePlaybackSession = session;
    this.activePlaybackResultPromise = null;

    this.resetTorrentStats();
    this.playSource = null;

    const playbackConfig = session.getPlaybackConfig();
    const magnetForPlayback = session.getMagnetForPlayback();
    const fallbackMagnet = session.getFallbackMagnet();
    const magnetProvided = session.getMagnetProvided();

    if (this.currentVideo) {
      this.currentVideo.magnet = magnetForPlayback;
      this.currentVideo.normalizedMagnet = magnetForPlayback;
      this.currentVideo.normalizedMagnetFallback = fallbackMagnet;
      if (playbackConfig?.infoHash && !this.currentVideo.legacyInfoHash) {
        this.currentVideo.legacyInfoHash = playbackConfig.infoHash;
      }
      this.currentVideo.torrentSupported = !!magnetForPlayback;
    }
    this.currentMagnetUri = magnetForPlayback || null;
    this.setCopyMagnetState(!!magnetForPlayback);

    const unsubscribers = [];
    const subscribe = (eventName, handler) => {
      const off = session.on(eventName, handler);
      unsubscribers.push(off);
    };

    subscribe("status", ({ message } = {}) => {
      if (this.videoModal) {
        this.videoModal.updateStatus(
          typeof message === "string" ? message : ""
        );
      }
    });

    subscribe("video-prepared", ({ videoElement } = {}) => {
      if (videoElement && videoElement !== this.modalVideo) {
        this.modalVideo = videoElement;
      }
    });

    subscribe("view-logging-request", ({ videoElement } = {}) => {
      if (videoElement) {
        this.preparePlaybackLogging(videoElement);
      }
    });

    subscribe("poster-remove", ({ reason } = {}) => {
      this.forceRemoveModalPoster(reason || "playback");
    });

    subscribe("sourcechange", ({ source } = {}) => {
      this.playSource = source || null;
      const usingTorrent = source === "torrent";
      if (this.videoModal) {
        this.videoModal.setTorrentStatsVisibility?.(usingTorrent);
      }
    });

    subscribe("error", ({ error, message } = {}) => {
      const displayMessage =
        typeof message === "string"
          ? message
          : error && error.message
          ? `Playback error: ${error.message}`
          : "Playback error";
      this.showError(displayMessage);
    });

    subscribe("finished", () => {
      if (this.activePlaybackSession === session) {
        this.activePlaybackSession = null;
        this.activePlaybackResultPromise = null;
      }
      while (unsubscribers.length) {
        const off = unsubscribers.pop();
        if (typeof off === "function") {
          try {
            off();
          } catch (err) {
            devLogger.warn(
              "[playVideoWithFallback] Listener cleanup error:",
              err
            );
          }
        }
      }
    });

    const startPromise = session.start();
    this.activePlaybackResultPromise = startPromise;
    const result = await startPromise;

    if (!result || result.error) {
      return result;
    }

    return result;
  }


  async playVideoByEventId(eventId, playbackHint = {}) {
    if (!eventId) {
      this.showError("No video identifier provided.");
      return;
    }

    const hint = playbackHint && typeof playbackHint === "object"
      ? playbackHint
      : {};
    const fallbackUrl =
      typeof hint.url === "string" ? hint.url.trim() : "";
    const fallbackTitle =
      typeof hint.title === "string" ? hint.title : "";
    const fallbackDescription =
      typeof hint.description === "string" ? hint.description : "";
    const fallbackMagnetRaw =
      typeof hint.magnet === "string" ? hint.magnet.trim() : "";
    let fallbackMagnetCandidate = "";
    if (fallbackMagnetRaw) {
      const decoded = safeDecodeMagnet(fallbackMagnetRaw);
      fallbackMagnetCandidate = decoded || fallbackMagnetRaw;
    }

    const hasTrigger = Object.prototype.hasOwnProperty.call(hint, "trigger");
    if (hasTrigger) {
      this.setLastModalTrigger(hint.trigger);
    } else {
      this.setLastModalTrigger(null);
    }

    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;
    this.pendingModeratedPlayback = null;

    if (this.blacklistedEventIds.has(eventId)) {
      this.showError("This content has been removed or is not allowed.");
      return;
    }

    let video = this.videosMap.get(eventId);
    if (!video) {
      video = await this.getOldEventById(eventId);
    }
    if (!video) {
      if (fallbackUrl || fallbackMagnetCandidate) {
        return this.playVideoWithoutEvent({
          url: fallbackUrl,
          magnet: fallbackMagnetCandidate,
          title: fallbackTitle || "Untitled",
          description: fallbackDescription || "",
          trigger: hasTrigger ? hint.trigger : null,
        });
      }
      this.showError("Video not found or has been removed.");
      return;
    }

    try {
      await accessControl.ensureReady();
    } catch (error) {
      devLogger.warn(
        "Failed to ensure admin lists were loaded before playback:",
        error
      );
    }
    const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
    if (!accessControl.canAccess(authorNpub)) {
      if (accessControl.isBlacklisted(authorNpub)) {
        this.showError("This content has been removed or is not allowed.");
      } else if (accessControl.whitelistMode()) {
        this.showError("This content is not from a whitelisted author.");
      } else {
        this.showError("This content has been removed or is not allowed.");
      }
      return;
    }

    this.decorateVideoModeration(video);

    let trimmedUrl = typeof video.url === "string" ? video.url.trim() : "";
    if (!trimmedUrl && fallbackUrl) {
      trimmedUrl = fallbackUrl;
    }
    const rawMagnet =
      typeof video.magnet === "string" ? video.magnet.trim() : "";
    let legacyInfoHash =
      typeof video.infoHash === "string" ? video.infoHash.trim().toLowerCase() : "";
    const fallbackMagnetForCandidate = fallbackMagnetCandidate || "";
    if (!legacyInfoHash && fallbackMagnetForCandidate) {
      const match = fallbackMagnetForCandidate.match(/xt=urn:btih:([0-9a-z]+)/i);
      if (match && match[1]) {
        legacyInfoHash = match[1].toLowerCase();
      }
    }

    let magnetCandidate = rawMagnet || legacyInfoHash || "";
    let decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
    let usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
    let magnetSupported = isValidMagnetUri(usableMagnetCandidate);

    if (!magnetSupported && fallbackMagnetForCandidate) {
      magnetCandidate = fallbackMagnetForCandidate;
      decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
      usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
      magnetSupported = isValidMagnetUri(usableMagnetCandidate);
    }

    const sanitizedMagnet = magnetSupported ? usableMagnetCandidate : "";

    const knownPostedAt = this.getKnownVideoPostedAt(video);
    const normalizedEditedAt = Number.isFinite(video.created_at)
      ? Math.floor(video.created_at)
      : null;

    this.currentVideo = {
      ...video,
      url: trimmedUrl,
      magnet: sanitizedMagnet,
      originalMagnet:
        magnetCandidate || fallbackMagnetForCandidate || legacyInfoHash || "",
      torrentSupported: magnetSupported,
      legacyInfoHash: video.legacyInfoHash || legacyInfoHash,
      lightningAddress: null,
      lastEditedAt: normalizedEditedAt,
    };

    this.decorateVideoModeration(this.currentVideo);

    const modalTags = collectVideoTags(this.currentVideo);
    this.currentVideo.displayTags = modalTags;
    this.updateModalSimilarContent({ activeVideo: this.currentVideo });

    if (Number.isFinite(knownPostedAt)) {
      this.cacheVideoRootCreatedAt(this.currentVideo, knownPostedAt);
    } else if (this.currentVideo.rootCreatedAt) {
      delete this.currentVideo.rootCreatedAt;
    }

    const dTagValue = (this.extractDTagValue(video.tags) || "").trim();
    const pointerInfo = resolveVideoPointer({
      kind: video.kind,
      pubkey: video.pubkey,
      videoRootId: video.videoRootId,
      dTag: dTagValue,
      fallbackEventId: video.id || eventId,
    });

    this.currentVideoPointer = pointerInfo?.pointer || null;
    this.currentVideoPointerKey = pointerInfo?.key || null;

    if (this.currentVideo) {
      this.currentVideo.pointer = this.currentVideoPointer;
      this.currentVideo.pointerKey = this.currentVideoPointerKey;
    }

    this.subscribeModalViewCount(
      this.currentVideoPointer,
      this.currentVideoPointerKey
    );
    this.subscribeModalReactions(
      this.currentVideoPointer,
      this.currentVideoPointerKey
    );
    this.subscribeModalComments(this.currentVideo);

    this.syncModalMoreMenuData();

    this.currentMagnetUri = sanitizedMagnet || null;

    this.setCopyMagnetState(!!sanitizedMagnet);
    this.setShareButtonState(true);

    const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
    const pushUrl =
      this.buildShareUrlFromNevent(nevent) ||
      `${this.getShareUrlBase() || window.location.pathname}?v=${encodeURIComponent(
        nevent
      )}`;
    window.history.pushState({}, "", pushUrl);

    this.zapController?.setVisibility(false);
    this.zapController?.resetState();

    const magnetInput =
      sanitizedMagnet ||
      decodedMagnetCandidate ||
      magnetCandidate ||
      fallbackMagnetForCandidate ||
      legacyInfoHash ||
      "";

    await this.showModalWithPoster(this.currentVideo);

    const playbackOptions = {
      url: trimmedUrl,
      magnet: magnetInput,
    };
    if (hasTrigger) {
      playbackOptions.trigger = this.lastModalTrigger;
    }

    let playbackPromise = null;
    if (this.shouldDeferModeratedPlayback(this.currentVideo)) {
      const pendingVideoId =
        (this.currentVideo && typeof this.currentVideo.id === "string" && this.currentVideo.id)
          ? this.currentVideo.id
          : eventId || null;
      this.pendingModeratedPlayback = {
        ...playbackOptions,
        triggerProvided: hasTrigger,
        videoId: pendingVideoId,
      };
    } else {
      playbackPromise = this.playVideoWithFallback(playbackOptions);
    }

    let lightningAddress = "";
    let creatorProfile = {
      name: "Unknown",
      picture: `https://robohash.org/${video.pubkey}`,
    };
    try {
      const userEvents = await nostrClient.pool.list(nostrClient.relays, [
        { kinds: [0], authors: [video.pubkey], limit: 1 },
      ]);
      if (userEvents.length > 0 && userEvents[0]?.content) {
        const data = JSON.parse(userEvents[0].content);
        lightningAddress = (data.lud16 || data.lud06 || "").trim();
        creatorProfile = {
          name: data.name || data.display_name || "Unknown",
          picture: data.picture || `https://robohash.org/${video.pubkey}`,
        };
      }
    } catch (error) {
      this.log("Error fetching creator profile:", error);
    }

    this.zapController?.setVisibility(!!lightningAddress);
    if (this.currentVideo) {
      this.currentVideo.lightningAddress = lightningAddress || null;
    }

    const creatorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
    if (this.videoModal) {
      const timestampPayload = this.buildModalTimestampPayload({
        postedAt: this.currentVideo?.rootCreatedAt ?? null,
        editedAt: normalizedEditedAt,
      });
      const displayNpub = formatShortNpub(creatorNpub);
      this.videoModal.updateMetadata({
        title: video.title || "Untitled",
        description: video.description || "No description available.",
        timestamps: timestampPayload,
        tags: modalTags,
        creator: {
          name: creatorProfile.name,
          avatarUrl: creatorProfile.picture,
          npub: displayNpub,
        },
      });
    }

    this.ensureModalPostedTimestamp(this.currentVideo);

    const playbackResult =
      playbackPromise && typeof playbackPromise.then === "function"
        ? await playbackPromise
        : playbackPromise;

    return playbackResult;
  }

  buildModalTimestampPayload({ postedAt = null, editedAt = null } = {}) {
    const normalizedPostedAt = Number.isFinite(postedAt)
      ? Math.floor(postedAt)
      : null;
    const normalizedEditedAt = Number.isFinite(editedAt)
      ? Math.floor(editedAt)
      : null;

    const payload = {
      posted: "",
      edited: "",
    };

    const effectivePostedAt =
      normalizedPostedAt !== null ? normalizedPostedAt : normalizedEditedAt;

    if (effectivePostedAt !== null) {
      payload.posted = `Posted ${this.formatTimeAgo(effectivePostedAt)}`;
    }

    const shouldShowEdited =
      normalizedEditedAt !== null &&
      (normalizedPostedAt === null || normalizedEditedAt - normalizedPostedAt >= 60);

    if (shouldShowEdited) {
      payload.edited = `Last edited ${this.formatTimeAgo(normalizedEditedAt)}`;
    }

    return payload;
  }

  getKnownVideoPostedAt(video) {
    if (!video || typeof video !== "object") {
      return null;
    }

    const directValue = Number.isFinite(video.rootCreatedAt)
      ? Math.floor(video.rootCreatedAt)
      : null;
    if (directValue !== null) {
      return directValue;
    }

    if (video.id && this.videosMap instanceof Map) {
      const stored = this.videosMap.get(video.id);
      const storedValue = Number.isFinite(stored?.rootCreatedAt)
        ? Math.floor(stored.rootCreatedAt)
        : null;
      if (storedValue !== null) {
        video.rootCreatedAt = storedValue;
        return storedValue;
      }
    }

    const nip71Created = Number.isFinite(video?.nip71Source?.created_at)
      ? Math.floor(video.nip71Source.created_at)
      : null;

    if (nip71Created !== null) {
      return nip71Created;
    }

    return null;
  }

  cacheVideoRootCreatedAt(video, timestamp) {
    if (!Number.isFinite(timestamp)) {
      return;
    }

    const normalized = Math.floor(timestamp);
    const rootId = getVideoRootIdentifier(video);

    if (video && typeof video === "object") {
      video.rootCreatedAt = normalized;
    }

    applyRootTimestampToVideosMap({
      videosMap: this.videosMap,
      video,
      rootId,
      timestamp: normalized,
    });

    syncActiveVideoRootTimestamp({
      activeVideo: this.currentVideo,
      rootId,
      timestamp: normalized,
      buildModalTimestampPayload: (payload) =>
        this.buildModalTimestampPayload(payload),
      videoModal: this.videoModal,
    });

    if (nostrClient && typeof nostrClient.applyRootCreatedAt === "function") {
      try {
        nostrClient.applyRootCreatedAt(video);
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to sync cached root timestamp with nostrClient:",
          error
        );
      }
    }
  }

  async resolveVideoPostedAt(video) {
    if (!video || typeof video !== "object") {
      return null;
    }

    const cached = this.getKnownVideoPostedAt(video);
    if (cached !== null) {
      return cached;
    }

    if (!nostrClient || typeof nostrClient.hydrateVideoHistory !== "function") {
      const fallback = Number.isFinite(video.created_at)
        ? Math.floor(video.created_at)
        : null;
      if (fallback !== null) {
        this.cacheVideoRootCreatedAt(video, fallback);
      }
      return fallback;
    }

    try {
      const history = await nostrClient.hydrateVideoHistory(video);
      if (Array.isArray(history) && history.length) {
        let earliest = null;
        for (const entry of history) {
          if (!entry || entry.deleted) {
            continue;
          }
          const created = Number.isFinite(entry.created_at)
            ? Math.floor(entry.created_at)
            : null;
          if (created === null) {
            continue;
          }
          if (earliest === null || created < earliest) {
            earliest = created;
          }
        }

        if (earliest === null) {
          const lastEntry = history[history.length - 1];
          if (Number.isFinite(lastEntry?.created_at)) {
            earliest = Math.floor(lastEntry.created_at);
          }
        }

        if (earliest !== null) {
          this.cacheVideoRootCreatedAt(video, earliest);
          return earliest;
        }
      }
    } catch (error) {
      devLogger.warn(
        "[Application] Failed to hydrate video history for timestamps:",
        error
      );
    }

    const fallback = Number.isFinite(video.created_at)
      ? Math.floor(video.created_at)
      : null;
    if (fallback !== null) {
      this.cacheVideoRootCreatedAt(video, fallback);
    }
    return fallback;
  }

  async ensureModalPostedTimestamp(video) {
    if (!video || !this.videoModal) {
      return;
    }

    const postedAt = await this.resolveVideoPostedAt(video);
    if (!this.videoModal || this.currentVideo !== video) {
      return;
    }

    const editedAt = Number.isFinite(video.lastEditedAt)
      ? Math.floor(video.lastEditedAt)
      : Number.isFinite(video.created_at)
        ? Math.floor(video.created_at)
        : null;

    const payload = this.buildModalTimestampPayload({
      postedAt,
      editedAt,
    });

    const modalTags = collectVideoTags(video);
    video.displayTags = modalTags;
    this.updateModalSimilarContent({ activeVideo: video });

    this.videoModal.updateMetadata({ timestamps: payload, tags: modalTags });
  }

  async playVideoWithoutEvent(options = {}) {
    const {
      url = "",
      magnet = "",
      title = "Untitled",
      description = "",
      trigger,
      tags: rawTags,
    } = options || {};
    const hasTrigger = Object.prototype.hasOwnProperty.call(
      options || {},
      "trigger"
    );
    if (hasTrigger) {
      this.setLastModalTrigger(trigger);
    } else {
      this.setLastModalTrigger(null);
    }
    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;
    this.subscribeModalViewCount(null, null);
    this.subscribeModalReactions(null, null);
    this.subscribeModalComments(null);
    this.pendingModeratedPlayback = null;

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const decodedMagnet = safeDecodeMagnet(trimmedMagnet);
    const usableMagnet = decodedMagnet || trimmedMagnet;
    const magnetSupported = isValidMagnetUri(usableMagnet);
    const sanitizedMagnet = magnetSupported ? usableMagnet : "";

    const modalTags = collectVideoTags({
      nip71: { hashtags: rawTags },
    });

    this.zapController?.setVisibility(false);
    this.zapController?.resetState();

    if (!sanitizedUrl && !sanitizedMagnet) {
      const message = trimmedMagnet && !magnetSupported
        ? UNSUPPORTED_BTITH_MESSAGE
        : "This video has no playable source.";
      this.showError(message);
      return;
    }

    this.currentVideo = {
      id: null,
      title,
      description,
      url: sanitizedUrl,
      magnet: sanitizedMagnet,
      originalMagnet: trimmedMagnet,
      torrentSupported: magnetSupported,
      lightningAddress: null,
      pointer: null,
      pointerKey: null,
      displayTags: modalTags,
    };

    this.decorateVideoModeration(this.currentVideo);
    this.updateModalSimilarContent({ activeVideo: this.currentVideo });

    this.syncModalMoreMenuData();

    this.currentMagnetUri = sanitizedMagnet || null;

    this.setCopyMagnetState(!!sanitizedMagnet);
    this.setShareButtonState(false);

    if (this.videoModal) {
      this.videoModal.updateMetadata({
        title: title || "Untitled",
        description: description || "No description available.",
        timestamp: "",
        tags: modalTags,
        creator: {
          name: "Unknown",
          avatarUrl: "assets/svg/default-profile.svg",
          npub: "",
        },
      });
    }

    await this.showModalWithPoster(this.currentVideo, hasTrigger ? { trigger } : {});

    const urlObj = new URL(window.location.href);
    urlObj.searchParams.delete("v");
    const cleaned = `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    window.history.replaceState({}, "", cleaned);

    return this.playVideoWithFallback({
      url: sanitizedUrl,
      magnet: usableMagnet,
      trigger: hasTrigger ? this.lastModalTrigger : null,
    });
  }

  /**
   * Simple helper to safely encode an npub.
   */
  safeEncodeNpub(pubkey) {
    if (typeof pubkey !== "string") {
      return null;
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith("npub1")) {
      return trimmed;
    }

    try {
      return window.NostrTools.nip19.npubEncode(trimmed);
    } catch (err) {
      return null;
    }
  }

  safeDecodeNpub(npub) {
    if (typeof npub !== "string") {
      return null;
    }

    const trimmed = npub.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const decoded = window.NostrTools.nip19.decode(trimmed);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (err) {
      return null;
    }

    return null;
  }

  normalizeReactionCount(value) {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.round(Number(value)));
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  normalizeHexPubkey(pubkey) {
    if (typeof pubkey !== "string") {
      return null;
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return null;
    }

    if (HEX64_REGEX.test(trimmed)) {
      return trimmed.toLowerCase();
    }

    if (trimmed.startsWith("npub1")) {
      const decoded = this.safeDecodeNpub(trimmed);
      if (decoded && HEX64_REGEX.test(decoded)) {
        return decoded.toLowerCase();
      }
    }

    return null;
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
    const portal = this.notificationPortal;
    const HTMLElementCtor =
      portal?.ownerDocument?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!portal || !HTMLElementCtor || !(portal instanceof HTMLElementCtor)) {
      return;
    }

    const containers = [
      this.errorContainer,
      this.statusContainer,
      this.successContainer,
    ];

    const hasVisibleBanner = containers.some((container) => {
      if (!container || !(container instanceof HTMLElementCtor)) {
        return false;
      }
      return !container.classList.contains("hidden");
    });

    portal.classList.toggle("notification-portal--active", hasVisibleBanner);
  }

  showError(msg) {
    const container = this.errorContainer;
    const HTMLElementCtor =
      container?.ownerDocument?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!container || !HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
      if (msg) {
        userLogger.error(msg);
      }
      return;
    }

    if (!msg) {
      // Remove any content, then hide
      container.textContent = "";
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
      return;
    }

    // If there's a message, show it
    container.textContent = msg;
    container.classList.remove("hidden");
    this.updateNotificationPortalVisibility();

    userLogger.error(msg);

    // Optional auto-hide after 5 seconds
    setTimeout(() => {
      if (container !== this.errorContainer) {
        return;
      }
      container.textContent = "";
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
    }, 5000);
  }

  showStatus(msg, options = {}) {
    const container = this.statusContainer;
    const messageTarget = this.statusMessage;
    const ownerDocument =
      container?.ownerDocument || (typeof document !== "undefined" ? document : null);
    const defaultView =
      ownerDocument?.defaultView || (typeof window !== "undefined" ? window : null);
    const clearScheduler =
      defaultView?.clearTimeout ||
      (typeof clearTimeout === "function" ? clearTimeout : null);
    const schedule =
      defaultView?.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);

    if (this.statusAutoHideHandle && typeof clearScheduler === "function") {
      clearScheduler(this.statusAutoHideHandle);
      this.statusAutoHideHandle = null;
    }

    const HTMLElementCtor =
      container?.ownerDocument?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!container || !HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
      return;
    }

    const { autoHideMs, showSpinner } =
      options && typeof options === "object" ? options : Object.create(null);

    const shouldShowSpinner = showSpinner !== false;
    const existingSpinner = container.querySelector(".status-spinner");

    if (shouldShowSpinner) {
      if (!(existingSpinner instanceof HTMLElementCtor)) {
        const spinner = ownerDocument?.createElement?.("span") || null;
        if (spinner) {
          spinner.className = "status-spinner";
          spinner.setAttribute("aria-hidden", "true");
          if (messageTarget && container.contains(messageTarget)) {
            container.insertBefore(spinner, messageTarget);
          } else {
            container.insertBefore(spinner, container.firstChild);
          }
        }
      }
    } else if (existingSpinner instanceof HTMLElementCtor) {
      existingSpinner.remove();
    }

    if (!msg) {
      if (messageTarget && messageTarget instanceof HTMLElementCtor) {
        messageTarget.textContent = "";
      }
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
      return;
    }

    if (messageTarget && messageTarget instanceof HTMLElementCtor) {
      messageTarget.textContent = msg;
    } else {
      container.textContent = msg;
    }
    container.classList.remove("hidden");
    this.updateNotificationPortalVisibility();

    if (
      Number.isFinite(autoHideMs) &&
      autoHideMs > 0 &&
      typeof schedule === "function"
    ) {
      const expectedText =
        messageTarget && messageTarget instanceof HTMLElementCtor
          ? messageTarget.textContent
          : container.textContent;
      this.statusAutoHideHandle = schedule(() => {
        this.statusAutoHideHandle = null;
        const activeContainer = this.statusContainer;
        if (activeContainer !== container) {
          return;
        }
        const activeMessageTarget =
          this.statusMessage && typeof this.statusMessage.textContent === "string"
            ? this.statusMessage
            : activeContainer;
        if (activeMessageTarget.textContent !== expectedText) {
          return;
        }
        if (activeMessageTarget === this.statusMessage) {
          this.statusMessage.textContent = "";
        } else {
          activeContainer.textContent = "";
        }
        activeContainer.classList.add("hidden");
        this.updateNotificationPortalVisibility();
      }, autoHideMs);
    }
  }

  showSuccess(msg) {
    const container = this.successContainer;
    const HTMLElementCtor =
      container?.ownerDocument?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!container || !HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
      return;
    }

    if (!msg) {
      container.textContent = "";
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
      return;
    }

    container.textContent = msg;
    container.classList.remove("hidden");
    this.updateNotificationPortalVisibility();

    setTimeout(() => {
      if (container !== this.successContainer) {
        return;
      }
      container.textContent = "";
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
    }, 5000);
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
    this.videoModalReadyPromise = null;

    if (this.statusAutoHideHandle) {
      const ownerDocument =
        this.statusContainer?.ownerDocument ||
        (typeof document !== "undefined" ? document : null);
      const defaultView =
        ownerDocument?.defaultView ||
        (typeof window !== "undefined" ? window : null);
      const clearScheduler =
        defaultView?.clearTimeout ||
        (typeof clearTimeout === "function" ? clearTimeout : null);
      if (typeof clearScheduler === "function") {
        clearScheduler(this.statusAutoHideHandle);
      }
      this.statusAutoHideHandle = null;
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

    if (this.uploadModal && this.boundUploadSubmitHandler) {
      this.uploadModal.removeEventListener(
        "upload:submit",
        this.boundUploadSubmitHandler
      );
      this.boundUploadSubmitHandler = null;
    }
    if (typeof this.uploadModal?.destroy === "function") {
      try {
        this.uploadModal.destroy();
      } catch (error) {
        devLogger.warn("[Application] Failed to destroy upload modal:", error);
      }
    }

    if (this.editModal) {
      if (this.boundEditModalSubmitHandler) {
        this.editModal.removeEventListener(
          "video:edit-submit",
          this.boundEditModalSubmitHandler
        );
        this.boundEditModalSubmitHandler = null;
      }
      if (this.boundEditModalCancelHandler) {
        this.editModal.removeEventListener(
          "video:edit-cancel",
          this.boundEditModalCancelHandler
        );
        this.boundEditModalCancelHandler = null;
      }
      if (typeof this.editModal.destroy === "function") {
        try {
          this.editModal.destroy();
        } catch (error) {
          devLogger.warn("[Application] Failed to destroy edit modal:", error);
        }
      }
    }

    if (this.revertModal && this.boundRevertConfirmHandler) {
      this.revertModal.removeEventListener(
        "video:revert-confirm",
        this.boundRevertConfirmHandler
      );
      this.boundRevertConfirmHandler = null;
    }
    if (typeof this.revertModal?.destroy === "function") {
      try {
        this.revertModal.destroy();
      } catch (error) {
        devLogger.warn("[Application] Failed to destroy revert modal:", error);
      }
    }

    if (this.deleteModal && this.boundDeleteConfirmHandler) {
      this.deleteModal.removeEventListener(
        "video:delete-confirm",
        this.boundDeleteConfirmHandler
      );
      this.boundDeleteConfirmHandler = null;
    }
    if (this.deleteModal && this.boundDeleteCancelHandler) {
      this.deleteModal.removeEventListener(
        "video:delete-cancel",
        this.boundDeleteCancelHandler
      );
      this.boundDeleteCancelHandler = null;
    }
    if (typeof this.deleteModal?.destroy === "function") {
      try {
        this.deleteModal.destroy();
      } catch (error) {
        devLogger.warn("[Application] Failed to destroy delete modal:", error);
      }
    }

    if (this.videoModal) {
      this.teardownModalCommentSubscription({ resetUi: false });
      if (this.boundVideoModalCloseHandler) {
        this.videoModal.removeEventListener(
          "modal:close",
          this.boundVideoModalCloseHandler
        );
        this.boundVideoModalCloseHandler = null;
      }
      if (this.boundVideoModalCopyHandler) {
        this.videoModal.removeEventListener(
          "video:copy-magnet",
          this.boundVideoModalCopyHandler
        );
        this.boundVideoModalCopyHandler = null;
      }
      if (this.boundVideoModalShareHandler) {
        this.videoModal.removeEventListener(
          "video:share",
          this.boundVideoModalShareHandler
        );
        this.boundVideoModalShareHandler = null;
      }
      if (this.boundVideoModalModerationOverrideHandler) {
        this.videoModal.removeEventListener(
          "video:moderation-override",
          this.boundVideoModalModerationOverrideHandler,
        );
        this.boundVideoModalModerationOverrideHandler = null;
      }
      if (this.boundVideoModalTagActivateHandler) {
        this.videoModal.removeEventListener(
          "tag:activate",
          this.boundVideoModalTagActivateHandler,
        );
        this.boundVideoModalTagActivateHandler = null;
      }
      if (this.boundVideoModalSimilarSelectHandler) {
        this.videoModal.removeEventListener(
          "similar:select",
          this.boundVideoModalSimilarSelectHandler
        );
        this.boundVideoModalSimilarSelectHandler = null;
      }
      if (this.boundVideoModalCreatorHandler) {
        this.videoModal.removeEventListener(
          "creator:navigate",
          this.boundVideoModalCreatorHandler
        );
        this.boundVideoModalCreatorHandler = null;
      }
      if (this.boundVideoModalZapHandler) {
        this.videoModal.removeEventListener(
          "video:zap",
          this.boundVideoModalZapHandler
        );
        this.boundVideoModalZapHandler = null;
      }
      if (this.boundVideoModalZapOpenHandler) {
        this.videoModal.removeEventListener(
          "zap:open",
          this.boundVideoModalZapOpenHandler
        );
        this.boundVideoModalZapOpenHandler = null;
      }
      if (this.boundVideoModalZapCloseHandler) {
        this.videoModal.removeEventListener(
          "zap:close",
          this.boundVideoModalZapCloseHandler
        );
        this.boundVideoModalZapCloseHandler = null;
      }
      if (this.boundVideoModalZapAmountHandler) {
        this.videoModal.removeEventListener(
          "zap:amount-change",
          this.boundVideoModalZapAmountHandler
        );
        this.boundVideoModalZapAmountHandler = null;
      }
      if (this.boundVideoModalZapCommentHandler) {
        this.videoModal.removeEventListener(
          "zap:comment-change",
          this.boundVideoModalZapCommentHandler
        );
        this.boundVideoModalZapCommentHandler = null;
      }
      if (this.boundVideoModalZapWalletHandler) {
        this.videoModal.removeEventListener(
          "zap:wallet-link",
          this.boundVideoModalZapWalletHandler
        );
        this.boundVideoModalZapWalletHandler = null;
      }
      if (this.boundVideoModalCommentSubmitHandler) {
        this.videoModal.removeEventListener(
          "comment:submit",
          this.boundVideoModalCommentSubmitHandler
        );
        this.boundVideoModalCommentSubmitHandler = null;
      }
      if (this.boundVideoModalCommentRetryHandler) {
        this.videoModal.removeEventListener(
          "comment:retry",
          this.boundVideoModalCommentRetryHandler
        );
        this.boundVideoModalCommentRetryHandler = null;
      }
      if (this.boundVideoModalCommentLoadMoreHandler) {
        this.videoModal.removeEventListener(
          "comment:load-more",
          this.boundVideoModalCommentLoadMoreHandler
        );
        this.boundVideoModalCommentLoadMoreHandler = null;
      }
      if (this.boundVideoModalCommentLoginHandler) {
        this.videoModal.removeEventListener(
          "comment:login-required",
          this.boundVideoModalCommentLoginHandler
        );
        this.boundVideoModalCommentLoginHandler = null;
      }
      if (this.boundVideoModalCommentMuteHandler) {
        this.videoModal.removeEventListener(
          "comment:mute-author",
          this.boundVideoModalCommentMuteHandler
        );
        this.boundVideoModalCommentMuteHandler = null;
      }
      if (typeof this.videoModal.destroy === "function") {
        try {
          this.videoModal.destroy();
        } catch (error) {
          devLogger.warn("[Application] Failed to destroy video modal:", error);
        }
      }
    }

    this.closeTagPreferenceMenus({ restoreFocus: false });
    if (this.tagPreferencePopovers) {
      this.tagPreferencePopovers.clear();
    }

    if (this.videoListView) {
      if (this.moreMenuController) {
        this.moreMenuController.detachVideoListView();
      }
    this.videoListView.setPlaybackHandler(null);
    this.videoListView.setEditHandler(null);
    this.videoListView.setRevertHandler(null);
    this.videoListView.setDeleteHandler(null);
    if (typeof this.videoListView.setTagPreferenceStateResolver === "function") {
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
