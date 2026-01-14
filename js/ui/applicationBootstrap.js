import { devLogger } from "../utils/logger.js";
import { MediaLoader } from "../utils/mediaLoader.js";
import { attachHealthBadges } from "../gridHealth.js";
import { attachUrlHealthBadges } from "../urlHealthObserver.js";
import { createWatchHistoryRenderer } from "../historyView.js";
import WatchHistoryController from "./watchHistoryController.js";
import WatchHistoryTelemetry from "../services/watchHistoryTelemetry.js";
import PlaybackService from "../services/playbackService.js";
import AuthService from "../services/authService.js";
import DiscussionCountService from "../services/discussionCountService.js";
import CommentThreadService from "../services/commentThreadService.js";
import hashtagPreferences, {
  HASHTAG_PREFERENCES_EVENTS,
} from "../services/hashtagPreferencesService.js";
import NwcSettingsService from "../services/nwcSettingsService.js";
import nostrService from "../services/nostrService.js";
import watchHistoryService from "../watchHistoryService.js";
import r2Service from "../services/r2Service.js";
import { createFeedEngine } from "../feedEngine/index.js";
import { URL_FIRST_ENABLED } from "../constants.js";
import { ALLOW_NSFW_CONTENT } from "../config.js";
import { relayManager } from "../relayManager.js";
import { userBlocks } from "../userBlocks.js";
import { subscriptions } from "../subscriptions.js";
import { accessControl } from "../accessControl.js";
import moderationService from "../services/moderationService.js";
import ProfileIdentityController from "./profileIdentityController.js";
import VideoListViewController from "./videoListViewController.js";
import ProfileModalController from "./profileModalController.js";
import LoginModalController from "./loginModalController.js";
import { VideoListView } from "./views/VideoListView.js";
import MoreMenuController from "./moreMenuController.js";
import AppChromeController from "./appChromeController.js";
import { getSidebarLoadingMarkup } from "../sidebarLoading.js";
import { isWatchHistoryDebugEnabled } from "../watchHistoryDebug.js";
import { splitAndZap as splitAndZapDefault } from "../payments/zapSplit.js";
import {
  getDefaultModerationSettings,
  getModerationSettings,
  setModerationSettings,
  resetModerationSettings,
  persistSavedProfiles,
  getSavedProfiles,
  getActiveProfilePubkey,
  setActiveProfilePubkey as setStoredActiveProfilePubkey,
  getProfileCacheMap,
  setSavedProfiles,
} from "../state/cache.js";
import { nostrClient } from "../nostrClientFacade.js";
import { ingestLocalViewEvent } from "../viewCounter.js";
import { setModalState as setGlobalModalState } from "../state/appState.js";
import { truncateMiddle, formatShortNpub } from "../utils/formatters.js";
import { escapeHTML as escapeHtml, removeTrackingScripts } from "../utils/domUtils.js";
import { deriveTorrentPlaybackConfig } from "../playbackUtils.js";
import { isValidMagnetUri } from "../utils/magnetValidators.js";
import { torrentClient } from "../webtorrent.js";
import getAuthProvider, {
  providers as authProviders,
} from "../services/authProviders/index.js";
import {
  MAX_WALLET_DEFAULT_ZAP,
  ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL,
  isDevMode,
} from "../config.js";
import { ADMIN_INITIAL_EVENT_BLACKLIST } from "../lists.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./components/staticModalAccessibility.js";
import ModalManager from "./ModalManager.js";

export default class ApplicationBootstrap {
  constructor({
    app,
    services = {},
    ui = {},
    helpers = {},
    documentRef = typeof document !== "undefined" ? document : null,
    windowRef = typeof window !== "undefined" ? window : null,
    assets = {},
  } = {}) {
    this.app = app;
    this.services = services;
    this.ui = ui;
    this.helpers = helpers;
    this.document = documentRef;
    this.window = windowRef;
    this.assets = assets;

    this.modalManager = null;
    this.boundNwcSettingsToastHandler = null;
  }

  initialize() {
    const app = this.app;
    const doc = this.document;

    app.loginButton = doc?.getElementById("loginButton") || null;
    app.logoutButton = doc?.getElementById("logoutButton") || null;
    app.userStatus = doc?.getElementById("userStatus") || null;
    app.userPubKey = doc?.getElementById("userPubKey") || null;
    app.uploadButton = doc?.getElementById("uploadButton") || null;

    const mediaLoaderFactory =
      typeof this.helpers.mediaLoaderFactory === "function"
        ? this.helpers.mediaLoaderFactory
        : () => new MediaLoader();
    app.mediaLoader =
      this.helpers.mediaLoader instanceof MediaLoader
        ? this.helpers.mediaLoader
        : mediaLoaderFactory();
    app.loadedThumbnails = new Map();
    app.urlHealthSnapshots = new Map();
    app.streamHealthSnapshots = new Map();
    app.boundStreamHealthBadgeHandler = (detail) =>
      app.handleStreamHealthBadgeUpdate(detail);
    app.attachHealthBadgesWithCache = (container) => {
      attachHealthBadges(container, {
        onUpdate: app.boundStreamHealthBadgeHandler,
      });
    };
    app.defaultModerationSettings = getDefaultModerationSettings();
    app.moderationSettings = { ...app.defaultModerationSettings };
    app.relayManager = relayManager;
    app.activeIntervals = [];
    app.watchHistoryTelemetry = null;
    app.authEventUnsubscribes = [];
    app.unsubscribeFromNostrService = null;
    app.designSystemContext = {
      getMode: () => "new",
      isNew: () => true,
    };
    app.videoModalReadyPromise = null;

    app.pendingModalZapOpen = false;
    app.videoListViewPlaybackHandler = null;
    app.videoListViewEditHandler = null;
    app.videoListViewRevertHandler = null;
    app.videoListViewDeleteHandler = null;
    app.deleteModal = null;
    app.moreMenuController = null;
    app.latestFeedMetadata = null;
    app.lastModalTrigger = null;
    app.modalCommentState = {
      videoEventId: null,
      videoDefinitionAddress: null,
      parentCommentId: null,
    };
    app.modalCommentProfiles = new Map();
    app.modalCommentLimit = 40;
    app.modalCommentLoadPromise = null;
    app.modalCommentPublishPromise = null;
    app.uploadSubmitPromise = null;
    app.pendingModeratedPlayback = null;
    app.lastIdentityRefreshPromise = null;

    app.profileIdentityController = new ProfileIdentityController({
      callbacks: {
        safeEncodeNpub: (pubkey) => app.safeEncodeNpub(pubkey),
        formatShortNpub: (value) => formatShortNpub(value),
      },
      logger: devLogger,
    });
    app.videoListViewController = new VideoListViewController({
      getSidebarLoadingMarkup,
      logger: devLogger,
    });
    app.appChromeController = null;

    app.nostrService = this.services.nostrService || nostrService;
    app.r2Service = this.services.r2Service || r2Service;

    app.feedEngine =
      this.services.feedEngine ||
      createFeedEngine({
        logger: (...args) => {
          if (!isWatchHistoryDebugEnabled()) {
            return;
          }
          devLogger.info(...args);
        },
      });
    app.payments = this.services.payments || null;
    app.splitAndZap =
      (this.services.payments && this.services.payments.splitAndZap) ||
      splitAndZapDefault;

    app.discussionCountService =
      this.services.discussionCountService || new DiscussionCountService();

    app.nwcSettingsService =
      this.services.nwcSettingsService ||
      new NwcSettingsService({
        normalizeHexPubkey: (value) => app.normalizeHexPubkey(value),
        getActivePubkey: () => app.pubkey,
        payments: app.payments,
        logger: {
          warn: (...args) => devLogger.warn(...args),
        },
        notifyError: (message) => app.showError(message),
        maxWalletDefaultZap: MAX_WALLET_DEFAULT_ZAP,
      });
    app.hashtagPreferences = this.services.hashtagPreferences || hashtagPreferences;
    app.hashtagPreferencesSnapshot = app.createHashtagPreferencesSnapshot();
    app.hashtagPreferencesSnapshotSignature =
      app.computeHashtagPreferencesSignature(app.hashtagPreferencesSnapshot);
    app.hashtagPreferencesPublishInFlight = false;
    app.hashtagPreferencesPublishPromise = null;
    app.boundHashtagPreferencesChangeHandler = null;
    app.unsubscribeFromHashtagPreferencesChange = null;
    if (
      app.hashtagPreferences &&
      typeof app.hashtagPreferences.on === "function"
    ) {
      app.boundHashtagPreferencesChangeHandler = (detail) =>
        app.handleHashtagPreferencesChange(detail);
      try {
        app.unsubscribeFromHashtagPreferencesChange =
          app.hashtagPreferences.on(
            HASHTAG_PREFERENCES_EVENTS.CHANGE,
            app.boundHashtagPreferencesChangeHandler,
          );
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to subscribe to hashtag preferences changes:",
          error,
        );
      }
    }
    if (
      app.nwcSettingsService &&
      typeof app.nwcSettingsService.setActivePubkeyGetter === "function"
    ) {
      app.nwcSettingsService.setActivePubkeyGetter(() => app.pubkey);
    }
    if (
      app.nwcSettingsService &&
      typeof app.nwcSettingsService.setPayments === "function"
    ) {
      app.nwcSettingsService.setPayments(app.payments);
    }
    if (
      app.feedEngine &&
      typeof app.feedEngine.run !== "function" &&
      typeof app.feedEngine.runFeed === "function"
    ) {
      app.feedEngine.run = (...args) => app.feedEngine.runFeed(...args);
    }
    app.registerRecentFeed();
    app.registerSubscriptionsFeed();
    app.registerWatchHistoryFeed();

    app.watchHistoryController = new WatchHistoryController({
      watchHistoryService,
      nostrClient,
      showError: (message) => app.showError(message),
      showSuccess: (message) => app.showSuccess(message),
      dropWatchHistoryMetadata: (pointerKey) =>
        app.dropWatchHistoryMetadata(pointerKey),
      getActivePubkey: () =>
        typeof app.pubkey === "string" && app.pubkey ? app.pubkey : "",
      designSystem: app.designSystemContext,
    });

    app.watchHistoryTelemetry = new WatchHistoryTelemetry({
      watchHistoryService,
      watchHistoryController: app.watchHistoryController,
      nostrClient,
      log: (message, ...args) => app.log(message, ...args),
      normalizeHexPubkey: (value) => app.normalizeHexPubkey(value),
      getActiveUserPubkey: () => app.pubkey,
      ingestLocalViewEvent,
    });

    const playbackDependencies = {
      torrentClient: this.services.torrentClient || torrentClient,
      deriveTorrentPlaybackConfig:
        this.services.deriveTorrentPlaybackConfig || deriveTorrentPlaybackConfig,
      isValidMagnetUri:
        this.services.isValidMagnetUri || isValidMagnetUri,
    };

    app.playbackService =
      this.services.playbackService ||
      new PlaybackService({
        logger: devLogger,
        torrentClient: playbackDependencies.torrentClient,
        deriveTorrentPlaybackConfig: playbackDependencies.deriveTorrentPlaybackConfig,
        isValidMagnetUri: playbackDependencies.isValidMagnetUri,
        urlFirstEnabled: URL_FIRST_ENABLED,
        analyticsCallbacks: {
          "session-start": (detail) => {
            const urlProvided = detail?.urlProvided ? "true" : "false";
            const magnetProvided = detail?.magnetProvided ? "true" : "false";
            const magnetUsable = detail?.magnetUsable ? "true" : "false";
            app.log(
              `[playVideoWithFallback] Session start urlProvided=${urlProvided} magnetProvided=${magnetProvided} magnetUsable=${magnetUsable}`,
            );
          },
          fallback: (detail) => {
            if (detail?.reason) {
              app.log(
                `[playVideoWithFallback] Falling back to WebTorrent (${detail.reason}).`,
              );
            }
          },
          error: (detail) => {
            if (detail?.error) {
              app.log("[playVideoWithFallback] Playback error observed", detail.error);
            }
          },
        },
      });
    app.activePlaybackResultPromise = null;
    app.activePlaybackSession = null;

    app.authService =
      this.services.authService ||
      new AuthService({
        nostrClient,
        userBlocks,
        relayManager,
        logger: devLogger,
        accessControl,
        authProviders: this.services.authProviders || authProviders,
        getAuthProvider: this.services.getAuthProvider || getAuthProvider,
      });
    app.authEventUnsubscribes.push(
      app.authService.on("auth:login", (detail) => {
        const maybePromise = app.handleAuthLogin(detail);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((error) => {
            devLogger.error("Failed to process auth login event:", error);
          });
        }
      }),
    );
    app.authEventUnsubscribes.push(
      app.authService.on("auth:logout", (detail) => {
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

        const maybePromise = app.handleAuthLogout(detail);
        if (maybePromise && typeof maybePromise.then === "function") {
          maybePromise.catch((error) => {
            devLogger.error("Failed to process auth logout event:", error);
          });
        }
      }),
    );
    app.authEventUnsubscribes.push(
      app.authService.on("profile:updated", (detail) => {
        try {
          app.handleProfileUpdated(detail);
        } catch (error) {
          devLogger.warn(
            "Failed to process profile update event:",
            error,
          );
        }
      }),
    );

    app.commentThreadService =
      this.services.commentThreadService ||
      new CommentThreadService({
        fetchVideoComments: (target, options) =>
          nostrClient?.fetchVideoComments?.(target, options),
        subscribeVideoComments: (target, options) =>
          nostrClient?.subscribeVideoComments?.(target, options),
        getProfileCacheEntry: (pubkey) => app.getProfileCacheEntry(pubkey),
        batchFetchProfiles: (pubkeys) => app.batchFetchProfiles(pubkeys),
        logger: {
          warn: (...args) => devLogger.warn(...args),
        },
      });
    app.profileController = null;
    app.loginModalController = null;
    app.currentUserNpub = null;

    app.initializeLoginModalController({ logIfMissing: true });

    app.profileButton = doc?.getElementById("profileButton") || null;
    app.profileAvatar = doc?.getElementById("profileAvatar") || null;

    const modalManager = new ModalManager({
      app,
      ui: this.ui,
      documentRef: doc,
      assets: {
        fallbackThumbnailSrc: this.assets.fallbackThumbnailSrc,
      },
    });
    modalManager.initialize();
    this.modalManager = modalManager;

    const modalContainer = doc?.getElementById("modalContainer") || null;
    try {
      if (modalContainer) {
        const profileModalServices = {
          normalizeHexPubkey: (value) => app.normalizeHexPubkey(value),
          safeEncodeNpub: (pubkey) => app.safeEncodeNpub(pubkey),
          safeDecodeNpub: (npub) => app.safeDecodeNpub(npub),
          truncateMiddle: (value, maxLength) => truncateMiddle(value, maxLength),
          formatShortNpub: (value) => formatShortNpub(value),
          getProfileCacheEntry: (pubkey) => app.getProfileCacheEntry(pubkey),
          batchFetchProfiles: (authorSet) => app.batchFetchProfiles(authorSet),
          switchProfile: (pubkey) => app.authService.switchProfile(pubkey),
          removeSavedProfile: (pubkey) =>
            app.authService.removeSavedProfile(pubkey),
          relayManager,
          userBlocks,
          nostrClient,
          nostrService: app.nostrService,
          subscriptions,
          accessControl,
          moderation: moderationService,
          getCurrentUserNpub: () => app.getCurrentUserNpub(),
          nwcSettings: app.nwcSettingsService,
          moderationSettings: {
            getDefaultModerationSettings: () => getDefaultModerationSettings(),
            getActiveModerationSettings: () => getModerationSettings(),
            updateModerationSettings: (partial = {}) =>
              setModerationSettings(partial),
            resetModerationSettings: () => resetModerationSettings(),
          },
          loadVideos: (forceFetch, context) =>
            app.loadVideos(forceFetch, context),
          onVideosShouldRefresh: (context) =>
            app.onVideosShouldRefresh(context),
          describeAdminError: (code) => app.describeAdminError(code),
          describeNotificationError: (code) =>
            app.describeNotificationError(code),
          onAccessControlUpdated: () => app.onAccessControlUpdated(),
          persistSavedProfiles: (options) => persistSavedProfiles(options),
          watchHistoryService,
          authService: app.authService,
          requestAddProfileLogin: (options) =>
            app.requestProfileAdditionLogin(options),
          describeLoginError: (error, fallbackMessage) =>
            app.describeLoginError(error, fallbackMessage),
          hashtagPreferences: app.hashtagPreferences,
          getHashtagPreferences: () => app.getHashtagPreferences(),
          describeHashtagPreferencesError: (error, fallbackMessage) =>
            app.describeHashtagPreferencesError(error, {
              fallbackMessage,
            }),
          log: (...args) => app.log(...args),
          closeAllMoreMenus: (options) => app.closeAllMoreMenus(options),
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
          onClose: () => app.handleProfileModalClosed(),
          onLogout: async () => app.requestLogout(),
          onChannelLink: (element) => app.handleProfileChannelLink(element),
          onAddAccount: (payload) => app.handleAddProfile(payload),
          onRequestLogoutProfile: (payload) =>
            app.handleProfileLogoutRequest(payload),
          onRequestSwitchProfile: (payload) =>
            app.handleProfileSwitchRequest(payload),
          onRelayOperation: (payload) =>
            app.handleProfileRelayOperation(payload),
          onRelayModeToggle: (payload) =>
            app.handleProfileRelayModeToggle(payload),
          onRelayRestore: (payload) =>
            app.handleProfileRelayRestore(payload),
          onBlocklistMutation: (payload) =>
            app.handleProfileBlocklistMutation(payload),
          onWalletPersist: (payload) =>
            app.handleProfileWalletPersist(payload),
          onWalletTestRequest: (payload) =>
            app.handleProfileWalletTest(payload),
          onWalletDisconnectRequest: (payload) =>
            app.handleProfileWalletDisconnect(payload),
          onAdminMutation: (payload) =>
            app.handleProfileAdminMutation(payload),
          onAdminNotifyError: (payload) =>
            app.handleProfileAdminNotifyError(payload),
          onHistoryReady: (payload) =>
            app.handleProfileHistoryEvent(payload),
          onModerationSettingsChange: (payload) =>
            app.handleModerationSettingsChange(payload),
        };

        app.profileController = new ProfileModalController({
          modalContainer,
          removeTrackingScripts,
          createWatchHistoryRenderer,
          setGlobalModalState,
          showError: (message) => app.showError(message),
          showSuccess: (message) => app.showSuccess(message),
          showStatus: (message) => app.showStatus(message),
          constants: {
            MAX_WALLET_DEFAULT_ZAP,
            ADMIN_SUPER_NPUB,
            ADMIN_DM_IMAGE_URL,
            BITVID_WEBSITE_URL,
          },
          services: profileModalServices,
          state: profileModalState,
          callbacks: profileModalCallbacks,
          designSystem: app.designSystemContext,
        });
      } else {
        devLogger.warn(
          "[Application] Profile modal controller disabled: modal container not found.",
        );
      }
    } catch (error) {
      devLogger.error("Failed to initialize profile modal controller:", error);
    }

    app.status = doc?.getElementById("status") || null;
    app.progressBar = doc?.getElementById("progress") || null;
    app.peers = doc?.getElementById("peers") || null;
    app.speed = doc?.getElementById("speed") || null;
    app.downloaded = doc?.getElementById("downloaded") || null;

    app.cleanupPromise = null;

    app.moreMenuController = new MoreMenuController({
      document: doc,
      accessControl,
      userBlocks,
      subscriptions,
      clipboard:
        typeof navigator !== "undefined" && navigator?.clipboard
          ? navigator.clipboard
          : null,
      isDevMode,
      designSystem: app.designSystemContext,
      callbacks: {
        getCurrentVideo: () => app.currentVideo,
        getCurrentUserNpub: () => app.getCurrentUserNpub(),
        getCurrentUserPubkey: () => app.pubkey,
        canCurrentUserManageBlacklist: () =>
          app.canCurrentUserManageBlacklist(),
        openCreatorChannel: () => app.openCreatorChannel(),
        goToProfile: (author) => app.goToProfile(author),
        showError: (message) => app.showError(message),
        showSuccess: (message) => app.showSuccess(message),
        safeEncodeNpub: (pubkey) => app.safeEncodeNpub(pubkey),
        safeDecodeNpub: (npub) => app.safeDecodeNpub(npub),
        buildShareUrlFromEventId: (eventId) =>
          app.buildShareUrlFromEventId(eventId),
        handleRemoveHistoryAction: (payload) =>
          app.handleRemoveHistoryAction(payload),
        handleRepostAction: (payload) => app.handleRepostAction(payload),
        handleMirrorAction: (payload) => app.handleMirrorAction(payload),
        handleEnsurePresenceAction: (payload) =>
          app.handleEnsurePresenceAction(payload),
        handleEventDetailsAction: (payload) => {
          if (app.modalManager && app.modalManager.eventDetailsModal && payload?.video) {
            app.modalManager.eventDetailsModal.open(payload.video);
          }
          return Promise.resolve();
        },
        loadVideos: () => app.loadVideos(),
        refreshAllVideoGrids: (options) => app.refreshAllVideoGrids(options),
        onUserBlocksUpdated: () => {
          if (app.profileController) {
            try {
              app.profileController.populateBlockedList();
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
    app.moreMenuController.setVideoModal(app.videoModal);
    app.videoSettingsPopovers = new Map();
    app.tagPreferencePopovers = new Map();

    app.subscriptionsLink = null;

    app.notificationPortal = doc?.getElementById("notificationPortal") || null;
    app.errorContainer = doc?.getElementById("errorContainer") || null;
    app.successContainer = doc?.getElementById("successContainer") || null;
    app.statusContainer = doc?.getElementById("statusContainer") || null;
    app.statusMessage =
      app.statusContainer?.querySelector("[data-status-message]") || null;
    app.statusAutoHideHandle = null;
    app.lastExperimentalWarningKey = null;
    app.lastExperimentalWarningAt = 0;

    app.pubkey = null;
    app.currentMagnetUri = null;
    app.currentVideo = null;
    app.currentVideoPointer = null;
    app.currentVideoPointerKey = null;
    app.videoSubscription = app.nostrService.getVideoSubscription() || null;
    app.videoList = null;
    app.videoListPopularTags = null;
    app.modalViewCountUnsub = null;
    app.modalReactionUnsub = null;
    app.modalReactionPointerKey = null;
    app.modalReactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };

    app.videosMap = app.nostrService.getVideosMap();
    app.unsubscribeFromNostrService = app.nostrService.on(
      "subscription:changed",
      ({ subscription }) => {
        app.videoSubscription = subscription || null;
      },
    );
    app.boundNwcSettingsToastHandler = null;
    Object.defineProperty(app, "savedProfiles", {
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

    Object.defineProperty(app, "activeProfilePubkey", {
      configurable: false,
      enumerable: false,
      get() {
        return getActiveProfilePubkey();
      },
      set(value) {
        setStoredActiveProfilePubkey(value, { persist: false });
      },
    });

    Object.defineProperty(app, "profileCache", {
      configurable: false,
      enumerable: false,
      get() {
        return getProfileCacheMap();
      },
    });

    if (
      this.window &&
      typeof this.window.addEventListener === "function"
    ) {
      this.boundNwcSettingsToastHandler = (event) => {
        const detail = event?.detail || {};
        if (detail.source !== "nwc-settings") {
          return;
        }
        const rawMessage =
          typeof detail.message === "string" ? detail.message.trim() : "";
        const message = rawMessage || "Wallet settings storage issue detected.";
        app.log(`[nwcSettings] ${message}`);
        if (detail.variant === "warning") {
          app.showStatus(message);
          if (this.window && typeof this.window.setTimeout === "function") {
            this.window.setTimeout(() => {
              app.showStatus("");
            }, 5000);
          }
        } else {
          app.showError(message);
        }
      };
      this.window.addEventListener("bitvid:toast", this.boundNwcSettingsToastHandler);
    }

    const magnetValidator = playbackDependencies.isValidMagnetUri;

    const videoListViewConfig = {
      document: doc,
      mediaLoader: app.mediaLoader,
      badgeHelpers: {
        attachHealthBadges: app.attachHealthBadgesWithCache,
        attachUrlHealthBadges: (container, onCheck) =>
          attachUrlHealthBadges(container, onCheck),
      },
      formatters: {
        formatTimeAgo: (timestamp) => app.formatTimeAgo(timestamp),
        formatViewCountLabel: (total) => app.formatViewCountLabel(total),
      },
      helpers: {
        escapeHtml: (value) => app.escapeHTML(value),
        isMagnetSupported: (magnet) => magnetValidator(magnet),
        toLocaleString: (value) =>
          typeof value === "number" ? value.toLocaleString() : value,
      },
      assets: {
        fallbackThumbnailSrc: this.assets.fallbackThumbnailSrc,
        unsupportedBtihMessage: this.assets.unsupportedBtihMessage,
      },
      state: {
        loadedThumbnails: app.loadedThumbnails,
        videosMap: app.videosMap,
        urlHealthByVideoId: app.urlHealthSnapshots,
        streamHealthByVideoId: app.streamHealthSnapshots,
      },
      utils: {
        dedupeVideos: (videos) => app.dedupeVideosByRoot(videos),
        getAllEvents: () => Array.from(nostrClient.allEvents.values()),
        hasOlderVersion: (video, events) => app.hasOlderVersion(video, events),
        derivePointerInfo: (video) => app.deriveVideoPointerInfo(video),
        persistWatchHistoryMetadata: (video, pointerInfo) =>
          app.persistWatchHistoryMetadataForVideo(video, pointerInfo),
        getShareUrlBase: () => app.getShareUrlBase(),
        buildShareUrlFromNevent: (nevent) => app.buildShareUrlFromNevent(nevent),
        buildShareUrlFromEventId: (eventId) => app.buildShareUrlFromEventId(eventId),
        getKnownVideoPostedAt: (video) => app.getKnownVideoPostedAt(video),
        resolveVideoPostedAt: (video) => app.resolveVideoPostedAt(video),
        canManageBlacklist: () => app.canCurrentUserManageBlacklist(),
        canEditVideo: (video) => video?.pubkey === app.pubkey,
        canDeleteVideo: (video) => video?.pubkey === app.pubkey,
        batchFetchProfiles: (authorSet) => app.batchFetchProfiles(authorSet),
        bindThumbnailFallbacks: (container) => app.bindThumbnailFallbacks(container),
        handleUrlHealthBadge: (payload) => app.handleUrlHealthBadge(payload),
        refreshDiscussionCounts: (videos, { container } = {}) =>
          app.refreshVideoDiscussionCounts(videos, {
            videoListRoot: container || app.videoList || null,
          }),
        ensureGlobalMoreMenuHandlers: () => app.ensureGlobalMoreMenuHandlers(),
        requestMoreMenu: (detail = {}) => app.requestMoreMenu(detail),
        closeMoreMenu: (detail = {}) => app.closeMoreMenu(detail),
        requestSettingsMenu: (detail = {}) =>
          app.requestVideoSettingsMenu(detail),
        closeSettingsMenu: (detail = {}) =>
          app.closeVideoSettingsMenu(detail),
        closeAllMenus: (options) => app.closeAllMoreMenus(options),
      },
      renderers: {
        getLoadingMarkup: (message) => getSidebarLoadingMarkup(message),
      },
      allowNsfw: ALLOW_NSFW_CONTENT === true,
      designSystem: app.designSystemContext,
    };
    app.videoListView =
      (typeof this.ui.videoListView === "function"
        ? this.ui.videoListView({ app, config: videoListViewConfig })
        : this.ui.videoListView) ||
      new VideoListView(videoListViewConfig);

    if (
      app.videoListView &&
      typeof app.videoListView.setTagPreferenceStateResolver === "function"
    ) {
      app.videoListView.setTagPreferenceStateResolver((tag) =>
        app.getTagPreferenceState(tag),
      );
    }

    if (
      app.videoListView &&
      typeof app.videoListView.setTagActivationHandler === "function"
    ) {
      app.videoListView.setTagActivationHandler((detail = {}) =>
        app.handleTagPreferenceActivation(detail),
      );
    }

    app.videoListViewPlaybackHandler = ({
      videoId,
      url,
      magnet,
      trigger,
    }) => {
      if (videoId) {
        Promise.resolve(
          app.playVideoByEventId(videoId, { url, magnet, trigger }),
        ).catch((error) => {
          devLogger.error("[VideoListView] Failed to play by event id:", error);
        });
        return;
      }
      Promise.resolve(
        app.playVideoWithFallback({ url, magnet, trigger }),
      ).catch((error) => {
        devLogger.error("[VideoListView] Failed to start playback:", error);
      });
    };
    app.videoListView.setPlaybackHandler(app.videoListViewPlaybackHandler);

    app.videoListViewEditHandler = ({ video, index, trigger }) => {
      if (!video?.id) {
        return;
      }
      app.handleEditVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        triggerElement: trigger,
        video,
      });
    };
    app.videoListView.setEditHandler(app.videoListViewEditHandler);

    app.videoListViewRevertHandler = ({ video, index, trigger }) => {
      if (!video?.id) {
        return;
      }
      app.handleRevertVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        triggerElement: trigger,
        video,
      });
    };
    app.videoListView.setRevertHandler(app.videoListViewRevertHandler);

    app.videoListViewDeleteHandler = ({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app.handleFullDeleteVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        video,
      });
    };
    app.videoListView.setDeleteHandler(app.videoListViewDeleteHandler);

    app.videoListView.setModerationOverrideHandler((detail = {}) =>
      app.handleModerationOverride(detail),
    );
    app.videoListView.setModerationBlockHandler((detail = {}) =>
      app.handleModerationBlock(detail),
    );
    app.videoListView.setModerationHideHandler((detail = {}) =>
      app.handleModerationHide(detail),
    );

    if (app.moreMenuController) {
      app.moreMenuController.attachVideoListView(app.videoListView);
    }

    app.closeLoginModalBtn = doc?.getElementById("closeLoginModal") || null;

    app.appChromeController = new AppChromeController({
      elements: {
        logoutButton: app.logoutButton,
        profileButton: app.profileButton,
        uploadButton: app.uploadButton,
        loginButton: app.loginButton,
        closeLoginModalButton: app.closeLoginModalBtn,
      },
      callbacks: {
        requestLogout: () => app.requestLogout(),
        showError: (message) => app.showError(message),
        showProfileModal: () =>
          app.profileController &&
          typeof app.profileController.show === "function"
            ? app.profileController.show()
            : null,
        openUploadModal: ({ triggerElement }) => {
          if (app.uploadModal) {
            app.uploadModal.open({ triggerElement });
          }
        },
        onLoginModalOpened: () => setGlobalModalState("login", true),
        onLoginModalClosed: () => setGlobalModalState("login", false),
        flushWatchHistory: (reason, context) =>
          app.flushWatchHistory(reason, context),
        cleanup: () => app.cleanup(),
        hideModal: () => app.hideModal(),
      },
      utilities: {
        prepareLoginModal: () =>
          prepareStaticModal({ id: "loginModal" }) ||
          doc?.getElementById("loginModal"),
        prepareApplicationModal: () =>
          prepareStaticModal({ id: "nostrFormModal" }) ||
          doc?.getElementById("nostrFormModal"),
        openModal: (modal, options) => openStaticModal(modal, options),
        closeModal: (modalId) => closeStaticModal(modalId),
      },
      environment: {
        document: doc,
        window: this.window,
      },
      logger: devLogger,
    });

    app.blacklistedEventIds = new Set();
    if (this.window?.NostrTools?.nip19?.decode) {
      for (const neventStr of ADMIN_INITIAL_EVENT_BLACKLIST) {
        if (!neventStr || neventStr.trim().length < 8) {
          continue;
        }
        try {
          const decoded = this.window.NostrTools.nip19.decode(neventStr);
          if (decoded?.type === "nevent" && decoded.data?.id) {
            app.blacklistedEventIds.add(decoded.data.id);
          }
        } catch (err) {
          devLogger.error(
            "[Application] Invalid nevent in blacklist:",
            neventStr,
            err,
          );
        }
      }
    }

    app.unsubscribeFromPubkeyState = null;
    app.unsubscribeFromCurrentUserState = null;

    return { modalManager };
  }

  teardown() {
    if (
      this.window &&
      this.boundNwcSettingsToastHandler &&
      typeof this.window.removeEventListener === "function"
    ) {
      this.window.removeEventListener(
        "bitvid:toast",
        this.boundNwcSettingsToastHandler,
      );
    }
    this.boundNwcSettingsToastHandler = null;
  }
}
