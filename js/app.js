// js/app.js

import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import {
  isDevMode,
  ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL,
  MAX_WALLET_DEFAULT_ZAP,
} from "./config.js";
import { accessControl } from "./accessControl.js";
import { safeDecodeMagnet } from "./magnetUtils.js";
import { extractMagnetHints, normalizeAndAugmentMagnet } from "./magnet.js";
import { deriveTorrentPlaybackConfig } from "./playbackUtils.js";
import { URL_FIRST_ENABLED } from "./constants.js";
import { trackVideoView } from "./analytics.js";
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import { ADMIN_INITIAL_EVENT_BLACKLIST } from "./lists.js";
import { userBlocks } from "./userBlocks.js";
import { relayManager } from "./relayManager.js";
import {
  createFeedEngine,
  createActiveNostrSource,
  createBlacklistFilterStage,
  createDedupeByRootStage,
  createChronologicalSorter,
  createSubscriptionAuthorsSource,
  registerWatchHistoryFeed,
} from "./feedEngine/index.js";
import watchHistoryService from "./watchHistoryService.js";
import r2Service from "./services/r2Service.js";
import PlaybackService from "./services/playbackService.js";
import AuthService from "./services/authService.js";
import nostrService from "./services/nostrService.js";
import { initQuickR2Upload } from "./r2-quick.js";
import { createWatchHistoryRenderer } from "./historyView.js";
import WatchHistoryController from "./ui/watchHistoryController.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import { subscriptions } from "./subscriptions.js";
import {
  initViewCounter,
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
  ingestLocalViewEvent,
} from "./viewCounter.js";
import {
  loadNwcSettings,
  saveNwcSettings,
  clearNwcSettings,
  createDefaultNwcSettings,
} from "./nwcSettings.js";
import { splitAndZap as splitAndZapDefault } from "./payments/zapSplit.js";
import {
  formatAbsoluteTimestamp as formatAbsoluteTimestampUtil,
  formatTimeAgo as formatTimeAgoUtil,
  truncateMiddle,
} from "./utils/formatters.js";
import {
  escapeHTML as escapeHtml,
  removeTrackingScripts,
} from "./utils/domUtils.js";
import { VideoModal } from "./ui/components/VideoModal.js";
import { UploadModal } from "./ui/components/UploadModal.js";
import { EditModal } from "./ui/components/EditModal.js";
import { RevertModal } from "./ui/components/RevertModal.js";
import { VideoListView } from "./ui/views/VideoListView.js";
import ProfileModalController from "./ui/profileModalController.js";
import ZapController from "./ui/zapController.js";
import { MediaLoader } from "./utils/mediaLoader.js";
import { pointerArrayToKey } from "./utils/pointer.js";
import { resolveVideoPointer } from "./utils/videoPointer.js";
import { isValidMagnetUri } from "./utils/magnetValidators.js";
import { dedupeToNewestByRoot } from "./utils/videoDeduper.js";
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
  URL_PROBE_TIMEOUT_MS,
  urlHealthConstants,
} from "./state/cache.js";

const UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

const FALLBACK_THUMBNAIL_SRC = "assets/jpg/video-thumbnail-fallback.jpg";
const MAX_DISCUSSION_COUNT_VIDEOS = 24;
const VIDEO_EVENT_KIND = 30078;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const NWC_URI_SCHEME = "nostr+walletconnect://";
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
    this.relayManager = relayManager;
    this.videoDiscussionCountCache = new Map();
    this.inFlightDiscussionCounts = new Map();
    this.activeIntervals = [];
    this.watchHistoryMetadataEnabled = null;
    this.watchHistoryPreferenceUnsubscribe = null;
    this.authEventUnsubscribes = [];
    this.unsubscribeFromNostrService = null;
    this.videoModalReadyPromise = null;
    this.boundUploadSubmitHandler = null;
    this.boundEditModalSubmitHandler = null;
    this.boundEditModalCancelHandler = null;
    this.boundRevertConfirmHandler = null;
    this.boundVideoModalCloseHandler = null;
    this.boundVideoModalCopyHandler = null;
    this.boundVideoModalShareHandler = null;
    this.boundVideoModalCreatorHandler = null;
    this.boundVideoModalZapHandler = null;
    this.boundVideoModalZapWalletHandler = null;
    this.videoListViewPlaybackHandler = null;
    this.videoListViewEditHandler = null;
    this.videoListViewRevertHandler = null;
    this.videoListViewDeleteHandler = null;
    this.videoListViewBlacklistHandler = null;
    this.boundVideoListShareListener = null;
    this.boundVideoListContextListener = null;
    this.latestFeedMetadata = null;

    this.nostrService = services.nostrService || nostrService;
    this.r2Service = services.r2Service || r2Service;
    this.feedEngine = services.feedEngine || createFeedEngine();
    this.payments = services.payments || null;
    this.splitAndZap =
      (services.payments && services.payments.splitAndZap) ||
      splitAndZapDefault;
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
    });

    this.playbackService =
      services.playbackService ||
      new PlaybackService({
        logger: (message, ...args) => this.log(message, ...args),
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
        logger: (message, ...args) => this.log(message, ...args),
      });
    this.authEventUnsubscribes.push(
      this.authService.on("auth:login", (detail) => this.handleAuthLogin(detail))
    );
    this.authEventUnsubscribes.push(
      this.authService.on("auth:logout", (detail) =>
        this.handleAuthLogout(detail)
      )
    );
    this.authEventUnsubscribes.push(
      this.authService.on("profile:updated", (detail) =>
        this.handleProfileUpdated(detail)
      )
    );

    // Optional: a "profile" button or avatar (if used)
    this.profileButton = document.getElementById("profileButton") || null;
    this.profileAvatar = document.getElementById("profileAvatar") || null;

    // Profile modal controller state
    this.profileController = null;
    this.currentUserNpub = null;

    // Upload modal component
    this.uploadButton = document.getElementById("uploadButton") || null;
    const uploadModalEvents = new EventTarget();
    this.uploadModal =
      (typeof ui.uploadModal === "function"
        ? ui.uploadModal({ app: this, eventTarget: uploadModalEvents })
        : ui.uploadModal) ||
      new UploadModal({
        authService: this.authService,
        r2Service: this.r2Service,
        publishVideoNote: (payload, options) =>
          this.publishVideoNote(payload, options),
        removeTrackingScripts,
        setGlobalModalState,
        showError: (message) => this.showError(message),
        showSuccess: (message) => this.showSuccess(message),
        getCurrentPubkey: () => this.pubkey,
        safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
        eventTarget: uploadModalEvents,
        container: document.getElementById("modalContainer") || null,
      });
    this.boundUploadSubmitHandler = (event) => {
      this.handleUploadSubmitEvent(event);
    };
    this.uploadModal.addEventListener(
      "upload:submit",
      this.boundUploadSubmitHandler
    );

    const editModalEvents = new EventTarget();
    this.editModal =
      (typeof ui.editModal === "function"
        ? ui.editModal({ app: this, eventTarget: editModalEvents })
        : ui.editModal) ||
      new EditModal({
        removeTrackingScripts,
        setGlobalModalState,
        showError: (message) => this.showError(message),
        getMode: () => (isDevMode ? "dev" : "live"),
        sanitizers: {
          text: (value) => (typeof value === "string" ? value.trim() : ""),
          url: (value) => (typeof value === "string" ? value.trim() : ""),
          magnet: (value) => (typeof value === "string" ? value.trim() : ""),
          checkbox: (value) => !!value,
        },
        escapeHtml: (value) => escapeHtml(value),
        eventTarget: editModalEvents,
        container: document.getElementById("modalContainer") || null,
      });

    this.boundEditModalSubmitHandler = (event) => {
      this.handleEditModalSubmit(event);
    };
    this.editModal.addEventListener(
      "video:edit-submit",
      this.boundEditModalSubmitHandler
    );

    this.boundEditModalCancelHandler = () => {
      this.showError("");
    };
    this.editModal.addEventListener(
      "video:edit-cancel",
      this.boundEditModalCancelHandler
    );

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
        fallbackThumbnailSrc: FALLBACK_THUMBNAIL_SRC,
        container: document.getElementById("modalContainer") || null,
      });

    this.boundRevertConfirmHandler = (event) => {
      this.handleRevertModalConfirm(event);
    };
    this.revertModal.addEventListener(
      "video:revert-confirm",
      this.boundRevertConfirmHandler
    );

    try {
      const profileModalContainer = document.getElementById("modalContainer") || null;
      if (profileModalContainer) {
        const profileModalServices = {
          normalizeHexPubkey: (value) => this.normalizeHexPubkey(value),
          safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
          safeDecodeNpub: (npub) => this.safeDecodeNpub(npub),
          truncateMiddle: (value, maxLength) => truncateMiddle(value, maxLength),
          getProfileCacheEntry: (pubkey) => this.getProfileCacheEntry(pubkey),
          batchFetchProfiles: (authorSet) => this.batchFetchProfiles(authorSet),
          switchProfile: (pubkey) => this.authService.switchProfile(pubkey),
          removeSavedProfile: (pubkey) =>
            this.authService.removeSavedProfile(pubkey),
          relayManager,
          userBlocks,
          nostrClient,
          accessControl,
          getCurrentUserNpub: () => this.getCurrentUserNpub(),
          getActiveNwcSettings: () => this.getActiveNwcSettings(),
          updateActiveNwcSettings: (partial) =>
            this.updateActiveNwcSettings(partial),
          hydrateNwcSettingsForPubkey: (pubkey) =>
            this.hydrateNwcSettingsForPubkey(pubkey),
          createDefaultNwcSettings: () => createDefaultNwcSettings(),
          ensureWallet: (options) => this.ensureWallet(options),
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
          log: (...args) => this.log(...args),
          closeAllMoreMenus: () => this.closeAllMoreMenus(),
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
          onLogout: async () => this.authService.logout(),
          onChannelLink: (element) => this.handleProfileChannelLink(element),
          onAddAccount: (controller) => this.handleAddProfile(controller),
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
        });
      } else {
        console.warn(
          "[Application] Profile modal controller disabled: modal container not found.",
        );
      }
    } catch (error) {
      console.error("Failed to initialize profile modal controller:", error);
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
      });
    this.zapController = new ZapController({
      videoModal: this.videoModal,
      getCurrentVideo: () => this.currentVideo,
      getActiveNwcSettings: () => this.getActiveNwcSettings(),
      isUserLoggedIn: () => this.isUserLoggedIn(),
      hasActiveWalletConnection: () => this.hasActiveWalletConnection(),
      splitAndZap: (...args) => this.splitAndZap(...args),
      payments: this.payments,
      callbacks: {
        onSuccess: (message) => this.showSuccess(message),
        onError: (message) => this.showError(message),
      },
      requestWalletPane: () =>
        this.profileController?.showWalletPane?.(),
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
    this.boundVideoModalZapOpenHandler = () => {
      this.zapController?.open();
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

    // Hide/Show Subscriptions Link
    this.subscriptionsLink = null;

    // Notification containers
    this.errorContainer = document.getElementById("errorContainer") || null;
    this.successContainer = document.getElementById("successContainer") || null;
    this.statusContainer = document.getElementById("statusContainer") || null;
    this.statusMessage =
      this.statusContainer?.querySelector("[data-status-message]") || null;

    // Auth state
    this.pubkey = null;
    this.currentMagnetUri = null;
    this.currentVideo = null;
    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;
    this.playbackTelemetryState = null;
    this.loggedViewPointerKeys = new Set();
    this.videoSubscription = this.nostrService.getVideoSubscription() || null;
    this.videoList = null;
    this.modalViewCountUnsub = null;

    // Videos stored as a Map (key=event.id)
    this.videosMap = this.nostrService.getVideosMap();
    this.unsubscribeFromNostrService = this.nostrService.on(
      "subscription:changed",
      ({ subscription }) => {
        this.videoSubscription = subscription || null;
      }
    );
    this.moreMenuGlobalHandlerBound = false;
    this.boundMoreMenuDocumentClick = null;
    this.boundMoreMenuDocumentKeydown = null;
    this.nwcSettings = new Map();
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
      badgeHelpers: { attachHealthBadges, attachUrlHealthBadges },
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
        canManageBlacklist: () => this.canCurrentUserManageBlacklist(),
        canEditVideo: (video) => video?.pubkey === this.pubkey,
        canDeleteVideo: (video) => video?.pubkey === this.pubkey,
        batchFetchProfiles: (authorSet) => this.batchFetchProfiles(authorSet),
        bindThumbnailFallbacks: (container) => this.bindThumbnailFallbacks(container),
        handleUrlHealthBadge: (payload) => this.handleUrlHealthBadge(payload),
        refreshDiscussionCounts: (videos) => this.refreshVideoDiscussionCounts(videos),
        ensureGlobalMoreMenuHandlers: () => this.ensureGlobalMoreMenuHandlers(),
        closeAllMenus: () => this.closeAllMoreMenus(),
      },
      renderers: {
        getLoadingMarkup: (message) => getSidebarLoadingMarkup(message),
      },
    };
    this.videoListView =
      (typeof ui.videoListView === "function"
        ? ui.videoListView({ app: this, config: videoListViewConfig })
        : ui.videoListView) ||
      new VideoListView(videoListViewConfig);

    this.videoListViewPlaybackHandler = ({ videoId, url, magnet }) => {
      if (videoId) {
        Promise.resolve(
          this.playVideoByEventId(videoId, { url, magnet })
        ).catch((error) => {
          console.error("[VideoListView] Failed to play by event id:", error);
        });
        return;
      }
      Promise.resolve(this.playVideoWithFallback({ url, magnet })).catch(
        (error) => {
          console.error("[VideoListView] Failed to start playback:", error);
        }
      );
    };
    this.videoListView.setPlaybackHandler(this.videoListViewPlaybackHandler);

    this.videoListViewEditHandler = ({ video, index }) => {
      if (!video?.id) {
        return;
      }
      this.handleEditVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
      });
    };
    this.videoListView.setEditHandler(this.videoListViewEditHandler);

    this.videoListViewRevertHandler = ({ video, index }) => {
      if (!video?.id) {
        return;
      }
      this.handleRevertVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
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

    this.videoListViewBlacklistHandler = ({ video, dataset }) => {
      const detail = {
        ...(dataset || {}),
        author: dataset?.author || video?.pubkey || "",
      };
      this.handleMoreMenuAction("blacklist-author", detail);
    };
    this.videoListView.setBlacklistHandler(this.videoListViewBlacklistHandler);

    this.boundVideoListShareListener = (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.eventId || detail.dataset?.eventId || detail.video?.id || "",
        context: detail.dataset?.context || "card",
      };
      this.handleMoreMenuAction(detail.action || "copy-link", dataset);
    };
    this.videoListView.addEventListener(
      "video:share",
      this.boundVideoListShareListener
    );

    this.boundVideoListContextListener = (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.dataset?.eventId || detail.video?.id || "",
      };
      this.handleMoreMenuAction(detail.action, dataset);
    };
    this.videoListView.addEventListener(
      "video:context-action",
      this.boundVideoListContextListener
    );

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
        console.error(
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
    if (this.videoListView) {
      this.videoListView.destroy();
    }

    this.videoList = null;

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
      console.warn("[Application] Failed to evaluate block status:", error);
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

      const videoModalPromise = this.videoModal.load().then(() => {
        const modalRoot = this.videoModal.getRoot();
        if (modalRoot) {
          this.attachMoreMenuHandlers(modalRoot);
        }
      });

      const uploadModalPromise = this.uploadModal
        .load()
        .catch((error) => {
          console.error("initUploadModal failed:", error);
          this.showError(`Failed to initialize upload modal: ${error.message}`);
        })
        .finally(() => {
          initQuickR2Upload(this);
        });

      const editModalPromise = this.editModal.load().catch((error) => {
        console.error("Failed to load edit modal:", error);
        this.showError(`Failed to initialize edit modal: ${error.message}`);
      });

      const profileModalPromise = this.profileController
        ? this.profileController
            .load()
            .then(() => {
              try {
                this.renderSavedProfiles();
              } catch (error) {
                console.warn(
                  "[profileModal] Failed to render saved profiles after load:",
                  error,
                );
              }

              try {
                this.profileController.refreshWalletPaneState();
              } catch (error) {
                console.warn(
                  "[profileModal] Failed to refresh wallet pane after load:",
                  error,
                );
              }
              return true;
            })
            .catch((error) => {
              console.error("Failed to load profile modal:", error);
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
        console.warn("Failed to initialize view counter:", error);
      }

      const accessControlPromise = accessControl
        .refresh()
        .then(() => {
          console.assert(
            !accessControl.lastError ||
              accessControl.lastError?.code !== "nostr-unavailable",
            "[app.init()] Access control refresh should not run before nostrClient.init()",
            accessControl.lastError
          );
        })
        .catch((error) => {
          console.warn(
            "Failed to refresh admin lists after connecting to Nostr:",
            error
          );
        });

      const adminPanePromise = this.profileController
        ? Promise.resolve()
            .then(() => this.profileController.refreshAdminPaneState())
            .catch((error) => {
              console.warn(
                "Failed to update admin pane after connecting to Nostr:",
                error,
              );
            })
        : Promise.resolve(null);

      await Promise.all([accessControlPromise, adminPanePromise]);

      // Grab the "Subscriptions" link by its id in the sidebar
      this.subscriptionsLink = document.getElementById("subscriptionsLink");

      const savedPubKey = this.activeProfilePubkey;
      if (savedPubKey) {
        // Auto-login if a pubkey was saved
        try {
          await this.authService.login(savedPubKey, { persistActive: false });
        } catch (error) {
          console.error("Auto-login failed:", error);
        }

        // If the user was already logged in, show the Subscriptions link
        if (this.subscriptionsLink) {
          this.subscriptionsLink.classList.remove("hidden");
        }
      }

      // 5. Setup general event listeners
      this.setupEventListeners();

      const watchHistoryInitPromise = this.initWatchHistoryMetadataSync().catch(
        (error) => {
          if (isDevMode) {
            console.warn(
              "[app.init()] Failed to initialize watch history metadata sync:",
              error
            );
          }
        }
      );

      // 6) Load the default view ONLY if there's no #view= already
      if (!window.location.hash || !window.location.hash.startsWith("#view=")) {
        console.log(
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
        console.log(
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
      console.error("Init failed:", error);
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
      console.error("Failed to go to channel:", err);
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
      console.error("Failed to open creator channel:", err);
      this.showError("Could not open channel.");
    }
  }

  /**
   * Show the modal and set the "Please stand by" poster on the video.
   */
  async showModalWithPoster(video = this.currentVideo) {
    if (!this.videoModal) {
      return null;
    }

    const targetVideo = video || this.currentVideo;

    try {
      const { root } = await this.ensureVideoModalReady({
        ensureVideoElement: true,
      });

      if (!this.videoModal) {
        return root || null;
      }

      this.videoModal.open(targetVideo);
      this.applyModalLoadingPoster();

      return (
        root ||
        (typeof this.videoModal.getRoot === "function"
          ? this.videoModal.getRoot()
          : null)
      );
    } catch (error) {
      console.error(
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

    if (existingRoot && existingRoot.isConnected) {
      if (ensureVideoElement && !existingVideoElement) {
        throw new Error("Video modal video element is not ready.");
      }
      if (existingVideoElement) {
        this.modalVideo = existingVideoElement;
      }
      return {
        root: existingRoot,
        videoElement: existingVideoElement,
      };
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

    if (ensureVideoElement && !readyVideoElement) {
      throw new Error("Video modal video element is missing after load().");
    }

    if (readyVideoElement) {
      this.modalVideo = readyVideoElement;
    }

    return {
      root: readyRoot,
      videoElement: readyVideoElement,
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
        console.warn("[viewCount] Failed to tear down modal subscription:", error);
      }
    }
    this.modalViewCountUnsub = null;
    if (this.videoModal) {
      this.videoModal.updateViewCountLabel("– views");
      this.videoModal.setViewCountPointer(null);
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
          console.warn(
            "[viewCount] Failed to unsubscribe modal view counter:",
            error
          );
        } finally {
          this.modalViewCountUnsub = null;
        }
      };
    } catch (error) {
      console.warn("[viewCount] Failed to subscribe modal view counter:", error);
      if (this.videoModal) {
        this.videoModal.updateViewCountLabel("– views");
        this.videoModal.setViewCountPointer(null);
      }
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
        console.warn(
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
        console.warn(
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
      console.warn(
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

  async handleAddProfile(controller) {
    const button =
      (controller && controller.addAccountButton) ||
      this.profileController?.addAccountButton ||
      null;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    if (button.dataset.loading === "true") {
      return;
    }

    const titleEl = button.querySelector(".profile-switcher__addTitle");
    const hintEl = button.querySelector(".profile-switcher__addHint");
    const originalTitle = titleEl ? titleEl.textContent : "";
    const originalHint = hintEl ? hintEl.textContent : "";
    const originalAriaLabel = button.getAttribute("aria-label");
    const originalDisabled = button.disabled;

    const setLoadingState = (isLoading) => {
      button.disabled = isLoading ? true : originalDisabled;
      button.dataset.loading = isLoading ? "true" : "false";
      button.setAttribute("aria-busy", isLoading ? "true" : "false");
      if (isLoading) {
        button.setAttribute("aria-disabled", "true");
      } else if (originalDisabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }
      if (isLoading) {
        if (titleEl) {
          titleEl.textContent = "Connecting...";
        }
        if (hintEl) {
          hintEl.textContent = "Check your extension";
        }
        button.setAttribute(
          "aria-label",
          "Connecting to your Nostr extension",
        );
      } else {
        if (titleEl) {
          titleEl.textContent = originalTitle;
        }
        if (hintEl) {
          hintEl.textContent = originalHint;
        }
        if (originalAriaLabel === null) {
          button.removeAttribute("aria-label");
        } else {
          button.setAttribute("aria-label", originalAriaLabel);
        }
      }
    };

    setLoadingState(true);

    try {
      const { pubkey } = await this.authService.requestLogin({
        allowAccountSelection: true,
        autoApply: false,
      });

      const normalizedPubkey = this.normalizeHexPubkey(pubkey);
      if (!normalizedPubkey) {
        throw new Error(
          "Received an invalid public key from the Nostr extension.",
        );
      }

      const alreadySaved = this.savedProfiles.some(
        (entry) =>
          this.normalizeHexPubkey(entry.pubkey) === normalizedPubkey,
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
        authType: "nip07",
      });

      persistSavedProfiles({ persistActive: false });
      this.renderSavedProfiles();

      this.showSuccess("Profile added. Select it when you're ready to switch.");
    } catch (error) {
      console.error("Failed to add profile via NIP-07:", error);
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Couldn't add that profile. Please try again.";
      this.showError(message);
    } finally {
      setLoadingState(false);
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
      console.warn("Unable to verify blacklist permissions:", error);
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

  async onAccessControlUpdated() {
    if (this.profileController) {
      try {
        await this.profileController.refreshAdminPaneState();
      } catch (error) {
        console.error("Failed to refresh admin pane after update:", error);
      }
    }

    this.loadVideos(true).catch((error) => {
      console.error("Failed to refresh videos after admin update:", error);
    });
    window.dispatchEvent(new CustomEvent("bitvid:access-control-updated"));
  }

  async onVideosShouldRefresh({ reason } = {}) {
    try {
      await this.loadVideos(true);
    } catch (error) {
      const context = reason ? ` after ${reason}` : "";
      console.error(`Failed to refresh videos${context}:`, error);
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
          await this.authService.logout();
        } catch (error) {
          console.error("Logout failed:", error);
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
            console.error("Failed to open profile modal:", error);
          });
      });
    }

    // 3) Upload button => show upload modal
    if (this.uploadButton) {
      this.uploadButton.addEventListener("click", () => {
        if (this.uploadModal) {
          this.uploadModal.open();
        }
      });
    }

    // 4) Login button => show the login modal
    if (this.loginButton) {
      this.loginButton.addEventListener("click", () => {
        console.log("Login button clicked!");
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.remove("hidden");
          setGlobalModalState("login", true);
        }
      });
    }

    // 5) Close login modal button => hide modal
    if (this.closeLoginModalBtn) {
      this.closeLoginModalBtn.addEventListener("click", () => {
        console.log("[app.js] closeLoginModal button clicked!");
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.add("hidden");
          setGlobalModalState("login", false);
        }
      });
    }

    // 6) NIP-07 button inside the login modal => call the extension & login
    const nip07Button = document.getElementById("loginNIP07");
    if (nip07Button) {
      const originalLabel = nip07Button.textContent;
      const setLoadingState = (isLoading) => {
        nip07Button.disabled = isLoading;
        nip07Button.dataset.loading = isLoading ? "true" : "false";
        nip07Button.setAttribute("aria-busy", isLoading ? "true" : "false");
        nip07Button.textContent = isLoading
          ? "Connecting to NIP-07 extension..."
          : originalLabel;
      };

      nip07Button.addEventListener("click", async () => {
        if (nip07Button.dataset.loading === "true") {
          return;
        }

        setLoadingState(true);
        console.log(
          "[app.js] loginNIP07 clicked! Attempting extension login..."
        );
        try {
          const { pubkey, detail } = await this.authService.requestLogin();
          console.log("[NIP-07] login returned pubkey:", pubkey);

          if (pubkey) {
            if (
              detail &&
              typeof detail === "object" &&
              detail.__handled !== true
            ) {
              try {
                await this.handleAuthLogin(detail);
              } catch (error) {
                console.error(
                  "[NIP-07] handleAuthLogin fallback failed:",
                  error,
                );
              }
            }

            const loginModal = document.getElementById("loginModal");
            if (loginModal) {
              loginModal.classList.add("hidden");
              setGlobalModalState("login", false);
            }
          }
        } catch (err) {
          console.error("[NIP-07 login error]", err);
          const message =
            err && typeof err.message === "string" && err.message.trim()
              ? err.message.trim()
              : "Failed to login with NIP-07. Please try again.";
          this.showError(message);
        } finally {
          setLoadingState(false);
        }
      });
    }

    // 7) Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      this.flushWatchHistory("session-end", "beforeunload").catch((error) => {
        if (isDevMode) {
          console.warn("[beforeunload] Watch history flush failed:", error);
        }
      });
      this.cleanup().catch((err) => {
        console.error("Cleanup before unload failed:", err);
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.flushWatchHistory("session-end", "visibilitychange").catch(
          (error) => {
            if (isDevMode) {
              console.warn(
                "[visibilitychange] Watch history flush failed:",
                error
              );
            }
          }
        );
      }
    });

    // 8) Handle back/forward navigation => hide video modal
    window.addEventListener("popstate", async () => {
      console.log("[popstate] user navigated back/forward; cleaning modal...");
      await this.hideModal();
    });

    // 9) Event delegation for the “Application Form” button inside the login modal
    document.addEventListener("click", (event) => {
      if (event.target && event.target.id === "openApplicationModal") {
        // Hide the login modal
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.add("hidden");
          setGlobalModalState("login", false);
        }
        // Show the application modal
        const appModal = document.getElementById("nostrFormModal");
        if (appModal) {
          appModal.classList.remove("hidden");
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
    this.videoListView.mount(this.videoList || null);
    return this.videoList;
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
    const pubkeys = Array.from(authorSet);
    if (!pubkeys.length) return;

    const toFetch = [];

    pubkeys.forEach((pubkey) => {
      const cacheEntry = this.getProfileCacheEntry(pubkey);
      if (cacheEntry) {
        this.updateProfileInDOM(pubkey, cacheEntry.profile);
      } else {
        toFetch.push(pubkey);
      }
    });

    if (!toFetch.length) {
      return;
    }

    const filter = {
      kinds: [0],
      authors: toFetch,
      limit: toFetch.length,
    };

    try {
      // Query each relay
      const results = await Promise.all(
        nostrClient.relays.map((relayUrl) =>
          nostrClient.pool.list([relayUrl], [filter])
        )
      );
      const allProfileEvents = results.flat();

      // Keep only the newest per author
      const newestEvents = new Map();
      for (const evt of allProfileEvents) {
        if (
          !newestEvents.has(evt.pubkey) ||
          evt.created_at > newestEvents.get(evt.pubkey).created_at
        ) {
          newestEvents.set(evt.pubkey, evt);
        }
      }

      // Update the cache & DOM
      for (const [pubkey, evt] of newestEvents.entries()) {
        try {
          const data = JSON.parse(evt.content);
          const profile = {
            name: data.name || data.display_name || "Unknown",
            picture: data.picture || "assets/svg/default-profile.svg",
          };
          this.setProfileCacheEntry(pubkey, profile);
          this.updateProfileInDOM(pubkey, profile);
        } catch (err) {
          console.error("Profile parse error:", err);
        }
      }
    } catch (err) {
      console.error("Batch profile fetch error:", err);
    }
  }

  updateProfileInDOM(pubkey, profile) {
    // For any .author-pic[data-pubkey=...]
    const picEls = document.querySelectorAll(
      `.author-pic[data-pubkey="${pubkey}"]`
    );
    picEls.forEach((el) => {
      el.src = profile.picture;
    });
    // For any .author-name[data-pubkey=...]
    const nameEls = document.querySelectorAll(
      `.author-name[data-pubkey="${pubkey}"]`
    );
    nameEls.forEach((el) => {
      el.textContent = profile.name;
    });
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
    const enableComments =
      legacyPayload?.enableComments === false
        ? false
        : legacyPayload?.enableComments === true
          ? true
          : true;

    const legacyFormData = {
      version: 3,
      title,
      url,
      magnet,
      thumbnail,
      description,
      mode: isDevMode ? "dev" : "live",
      enableComments,
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
      if (typeof onSuccess === "function") {
        await onSuccess();
      }
      if (suppressModalClose !== true && this.uploadModal) {
        this.uploadModal.close();
      }
      await this.loadVideos();
      this.showSuccess("Video shared successfully!");
      return true;
    } catch (err) {
      console.error("Failed to publish video:", err);
      this.showError("Failed to share video. Please try again later.");
      return false;
    }
  }

  /**
   * Actually handle the upload form submission.
   */
  async handleUploadSubmitEvent(event) {
    const payload = event?.detail?.payload || {};

    try {
      await this.authService.handleUploadSubmit(payload, {
        publish: (data) =>
          this.publishVideoNote(data, {
            onSuccess: () => {
              if (this.uploadModal?.resetCustomForm) {
                this.uploadModal.resetCustomForm();
              }
            },
          }),
      });
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Login required to publish videos.";
      this.showError(message);
    }
  }

  async handleProfileSwitchRequest({ pubkey } = {}) {
    if (!pubkey) {
      throw new Error("Missing pubkey for profile switch request.");
    }

    const result = await this.authService.switchProfile(pubkey);

    if (result?.switched) {
      try {
        await this.loadVideos(true);
      } catch (error) {
        console.error("Failed to refresh videos after switching profiles:", error);
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
        if (isDevMode) {
          console.warn(
            "[Profile] Failed to refresh videos after relay update:",
            refreshError,
          );
        }
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
        if (isDevMode) {
          console.warn(
            "[Profile] Failed to restore relay preferences after publish error:",
            restoreError,
          );
        }
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
          console.error(
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

  async handleProfileWalletPersist({
    nwcUri,
    defaultZap,
    lastChecked,
  } = {}) {
    const partial = {};
    if (nwcUri !== undefined) {
      partial.nwcUri = nwcUri;
    }
    if (defaultZap !== undefined) {
      partial.defaultZap = defaultZap;
    }
    if (lastChecked !== undefined) {
      partial.lastChecked = lastChecked;
    }

    if (!Object.keys(partial).length) {
      return this.getActiveNwcSettings();
    }

    return this.updateActiveNwcSettings(partial);
  }

  async handleProfileWalletTest({ nwcUri, defaultZap } = {}) {
    return this.ensureWallet({ nwcUri, defaultZap });
  }

  async handleProfileWalletDisconnect() {
    return this.updateActiveNwcSettings(createDefaultNwcSettings());
  }

  handleProfileAdminNotifyError({ error } = {}) {
    if (!error) {
      return;
    }
    console.warn("[admin] Notification dispatch issue:", error);
  }

  handleProfileHistoryEvent() {
    return null;
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
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return createDefaultNwcSettings();
    }

    try {
      const settings = await loadNwcSettings(normalized);
      const record =
        settings && typeof settings === "object"
          ? { ...settings }
          : createDefaultNwcSettings();
      this.nwcSettings.set(normalized, record);
      return { ...record };
    } catch (error) {
      console.warn(
        `[nwcSettings] Failed to load settings for ${normalized}:`,
        error
      );
      const fallback = createDefaultNwcSettings();
      this.nwcSettings.set(normalized, fallback);
      return { ...fallback };
    }
  }

  getActiveNwcSettings() {
    const normalized = this.normalizeHexPubkey(this.pubkey);
    if (!normalized) {
      return createDefaultNwcSettings();
    }
    const cached = this.nwcSettings.get(normalized);
    return cached ? { ...cached } : createDefaultNwcSettings();
  }

  hasActiveWalletConnection() {
    const settings = this.getActiveNwcSettings();
    const candidate =
      typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
    return candidate.length > 0;
  }

  validateWalletUri(uri, { requireValue = false } = {}) {
    const value = typeof uri === "string" ? uri.trim() : "";

    if (!value) {
      if (requireValue) {
        return {
          valid: false,
          sanitized: "",
          message: "Enter a wallet connect URI before continuing.",
        };
      }
      return { valid: true, sanitized: "" };
    }

    if (!value.toLowerCase().startsWith(NWC_URI_SCHEME)) {
      return {
        valid: false,
        sanitized: value,
        message: `Wallet URI must start with ${NWC_URI_SCHEME}.`,
      };
    }

    return { valid: true, sanitized: value };
  }

  isUserLoggedIn() {
    return Boolean(this.normalizeHexPubkey(this.pubkey));
  }

  async updateActiveNwcSettings(partial = {}) {
    const normalized = this.normalizeHexPubkey(this.pubkey);
    if (!normalized) {
      console.warn(
        "[nwcSettings] Cannot update settings without an active pubkey."
      );
      return createDefaultNwcSettings();
    }

    try {
      const updated = await saveNwcSettings(normalized, partial);
      const record =
        updated && typeof updated === "object"
          ? { ...updated }
          : createDefaultNwcSettings();
      this.nwcSettings.set(normalized, record);
      return { ...record };
    } catch (error) {
      console.warn(
        `[nwcSettings] Failed to save settings for ${normalized}:`,
        error
      );
      return this.getActiveNwcSettings();
    }
  }

  async ensureWallet({ nwcUri, defaultZap } = {}) {
    const activeSettings = this.getActiveNwcSettings();
    const candidateUri =
      typeof nwcUri === "string" && nwcUri.trim()
        ? nwcUri.trim()
        : activeSettings.nwcUri || "";
    const { valid, sanitized, message } = this.validateWalletUri(candidateUri, {
      requireValue: true,
    });
    if (!valid) {
      throw new Error(message || "Invalid wallet URI provided.");
    }

    const merged = {
      ...activeSettings,
      nwcUri: sanitized,
    };

    if (typeof defaultZap === "number" && Number.isFinite(defaultZap)) {
      const rounded = Math.max(0, Math.round(defaultZap));
      merged.defaultZap = Math.min(MAX_WALLET_DEFAULT_ZAP, rounded);
    } else if (defaultZap === null) {
      merged.defaultZap = null;
    }

    if (this.payments && typeof this.payments.ensureWallet === "function") {
      return this.payments.ensureWallet({ settings: merged });
    }

    console.warn(
      "[wallet] Falling back to stub ensureWallet implementation. Returning settings without performing a connection test."
    );
    return merged;
  }

  async clearStoredNwcSettings(pubkey, { silent = false } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return false;
    }

    try {
      await clearNwcSettings(normalized);
    } catch (error) {
      console.warn(
        `[nwcSettings] Failed to clear settings for ${normalized}:`,
        error
      );
      if (!silent) {
        this.showError("Failed to clear wallet settings for this account.");
      }
      try {
        await saveNwcSettings(normalized, createDefaultNwcSettings());
      } catch (persistError) {
        console.warn(
          `[nwcSettings] Failed to overwrite settings for ${normalized}:`,
          persistError
        );
      }
      this.nwcSettings.delete(normalized);
      return false;
    }

    this.nwcSettings.delete(normalized);
    return true;
  }

  async handleAuthLogin(detail = {}) {
    if (detail && typeof detail === "object") {
      try {
        detail.__handled = true;
      } catch (error) {
        // Ignore attempts to mutate read-only descriptors.
      }
    }

    const normalizedActive = this.normalizeHexPubkey(
      detail?.pubkey || this.pubkey
    );
    const normalizedPrevious = this.normalizeHexPubkey(detail?.previousPubkey);

    if (detail?.identityChanged) {
      this.resetViewLoggingState();
      this.nwcSettings.clear();
    }

    if (
      normalizedPrevious &&
      (!normalizedActive || normalizedPrevious !== normalizedActive)
    ) {
      await this.clearStoredNwcSettings(normalizedPrevious, { silent: true });
    }

    if (normalizedActive) {
      await this.hydrateNwcSettingsForPubkey(normalizedActive);
    }

    if (this.profileController) {
      try {
        await this.profileController.handleAuthLogin(detail);
      } catch (error) {
        console.error(
          "Failed to process login within the profile controller:",
          error,
        );
      }
    } else {
      this.renderSavedProfiles();
    }

    if (this.loginButton) {
      this.loginButton.classList.add("hidden");
      this.loginButton.setAttribute("hidden", "");
      this.loginButton.style.display = "none";
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
      this.uploadButton.style.display = "inline-flex";
    }

    if (this.profileButton) {
      this.profileButton.classList.remove("hidden");
      this.profileButton.removeAttribute("hidden");
      this.profileButton.style.display = "inline-flex";
    }

    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.remove("hidden");
    }

    const activePubkey = detail?.pubkey || this.pubkey;
    if (activePubkey && detail?.postLogin?.profile) {
      this.updateActiveProfileUI(activePubkey, detail.postLogin.profile);
    }

    try {
      await this.loadVideos(true);
    } catch (error) {
      console.error("Failed to refresh videos after login:", error);
    }
    this.forceRefreshAllProfiles();
    if (this.uploadModal?.refreshCloudflareBucketPreview) {
      await this.uploadModal.refreshCloudflareBucketPreview();
    }
  }

  async handleAuthLogout(detail = {}) {
    this.resetViewLoggingState();

    const normalizedPrevious = this.normalizeHexPubkey(
      detail?.previousPubkey || detail?.pubkey || this.pubkey
    );
    if (normalizedPrevious) {
      await this.clearStoredNwcSettings(normalizedPrevious, { silent: false });
    }
    this.nwcSettings.clear();

    if (this.profileController) {
      try {
        await this.profileController.handleAuthLogout(detail);
      } catch (error) {
        console.error(
          "Failed to process logout within the profile controller:",
          error,
        );
      }
    } else {
      this.renderSavedProfiles();
    }

    if (this.loginButton) {
      this.loginButton.classList.remove("hidden");
      this.loginButton.removeAttribute("hidden");
      this.loginButton.style.display = "";
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
      this.uploadButton.style.display = "none";
    }

    if (this.profileButton) {
      this.profileButton.classList.add("hidden");
      this.profileButton.setAttribute("hidden", "");
      this.profileButton.style.display = "none";
    }

    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.add("hidden");
    }

    try {
      await this.loadVideos(true);
    } catch (error) {
      console.error("Failed to refresh videos after logout:", error);
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
        console.warn("Previous cleanup rejected:", err);
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
            console.warn("[cleanup] video modal poster cleanup threw:", err);
          }
        }

        const modalVideoEl = this.modalVideo;
        if (modalVideoEl) {
          const refreshedModal = this.teardownVideoElement(modalVideoEl, {
            replaceNode: true,
          });
          if (refreshedModal) {
            this.modalVideo = refreshedModal;
          }
        }
        // Tell webtorrent to cleanup
        await torrentClient.cleanup();
        this.log("[cleanup] WebTorrent cleanup resolved.");
      } catch (err) {
        console.error("Cleanup error:", err);
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
      console.warn("waitForCleanup observed a rejected cleanup:", err);
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
    const state = this.playbackTelemetryState;
    if (!state) {
      return;
    }

    if (state.viewTimerId) {
      clearTimeout(state.viewTimerId);
    }

    if (Array.isArray(state.handlers) && state.videoEl) {
      for (const { eventName, handler } of state.handlers) {
        try {
          state.videoEl.removeEventListener(eventName, handler);
        } catch (err) {
          if (isDevMode) {
            console.warn(
              `[cancelPendingViewLogging] Failed to detach ${eventName} listener:`,
              err
            );
          }
        }
      }
    }

    this.playbackTelemetryState = null;

    this.flushWatchHistory("session-end", "cancelPendingViewLogging").catch(
      (error) => {
        const message =
          error && typeof error.message === "string"
            ? error.message
            : String(error ?? "unknown error");
        this.log(
          `[cancelPendingViewLogging] Watch history flush failed: ${message}`
        );
      }
    );
  }

  resetViewLoggingState() {
    this.cancelPendingViewLogging();
    if (this.loggedViewPointerKeys.size > 0) {
      this.loggedViewPointerKeys.clear();
    }
  }

  refreshWatchHistoryMetadataSettings() {
    if (!watchHistoryService?.isEnabled?.()) {
      this.watchHistoryMetadataEnabled = false;
      return this.watchHistoryMetadataEnabled;
    }

    const previous = this.watchHistoryMetadataEnabled;
    let enabled = true;

    try {
      if (typeof watchHistoryService.getSettings === "function") {
        const settings = watchHistoryService.getSettings();
        enabled = settings?.metadata?.storeLocally !== false;
      } else if (typeof watchHistoryService.shouldStoreMetadata === "function") {
        enabled = watchHistoryService.shouldStoreMetadata() !== false;
      }
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[watchHistory] Failed to read metadata settings:",
          error,
        );
      }
      enabled = true;
    }

    this.watchHistoryMetadataEnabled = enabled;

    if (enabled === false && previous !== false) {
      try {
        watchHistoryService?.clearLocalMetadata?.();
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[watchHistory] Failed to purge metadata cache while preference disabled:",
            error,
          );
        }
      }
    }

    return this.watchHistoryMetadataEnabled;
  }

  async initWatchHistoryMetadataSync() {
    if (!watchHistoryService?.isEnabled?.()) {
      this.watchHistoryMetadataEnabled = false;
      return;
    }

    this.refreshWatchHistoryMetadataSettings();

    if (
      typeof watchHistoryService.subscribe === "function" &&
      !this.watchHistoryPreferenceUnsubscribe
    ) {
      try {
        const unsubscribe = watchHistoryService.subscribe(
          "metadata-preference",
          (payload) => {
            const previous = this.watchHistoryMetadataEnabled;
            const enabled = payload?.enabled !== false;
            this.watchHistoryMetadataEnabled = enabled;
            if (previous === true && enabled === false) {
              try {
                watchHistoryService?.clearLocalMetadata?.();
              } catch (error) {
                if (isDevMode) {
                  console.warn(
                    "[watchHistory] Failed to clear cached metadata after toggle off:",
                    error,
                  );
                }
              }
            }
          },
        );
        if (typeof unsubscribe === "function") {
          this.watchHistoryPreferenceUnsubscribe = unsubscribe;
        }
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[watchHistory] Failed to subscribe to metadata preference changes:",
            error,
          );
        }
      }
    }
  }

  persistWatchHistoryMetadataForVideo(video, pointerInfo) {
    if (
      !this.watchHistoryMetadataEnabled ||
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
      if (isDevMode) {
        console.warn(
          "[watchHistory] Failed to persist local metadata for pointer:",
          pointerInfo.key,
          error,
        );
      }
    }
  }

  dropWatchHistoryMetadata(pointerKey) {
    if (!pointerKey || typeof pointerKey !== "string") {
      return;
    }
    if (typeof watchHistoryService?.removeLocalMetadata !== "function") {
      return;
    }
    try {
      watchHistoryService.removeLocalMetadata(pointerKey);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[watchHistory] Failed to remove cached metadata for pointer:",
          pointerKey,
          error,
        );
      }
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
    if (!this.watchHistoryController) {
      this.showError("Watch history sync is not available right now.");
      const error = new Error("watch-history-disabled");
      error.handled = true;
      throw error;
    }
    return this.watchHistoryController.handleWatchHistoryRemoval(payload);
  }

  flushWatchHistory(reason = "session-end", context = "watch-history") {
    if (!this.watchHistoryController) {
      return Promise.resolve();
    }
    return this.watchHistoryController.flush(reason, context);
  }

  getActiveViewIdentityKey() {
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

  deriveViewIdentityKeyFromEvent(event) {
    if (!event || typeof event !== "object") {
      return "";
    }

    const normalizedPubkey = this.normalizeHexPubkey(event.pubkey);
    if (!normalizedPubkey) {
      return "";
    }

    return `actor:${normalizedPubkey}`;
  }

  buildViewCooldownKey(pointerKey, identityKey) {
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

  preparePlaybackViewLogging(videoEl) {
    this.cancelPendingViewLogging();

    if (!videoEl || typeof videoEl.addEventListener !== "function") {
      return;
    }

    const pointer = this.currentVideoPointer;
    const pointerKey = this.currentVideoPointerKey || pointerArrayToKey(pointer);
    if (!pointer || !pointerKey) {
      return;
    }

    const viewerIdentityKey = this.getActiveViewIdentityKey();
    const cooldownKey = this.buildViewCooldownKey(pointerKey, viewerIdentityKey);

    if (cooldownKey && this.loggedViewPointerKeys.has(cooldownKey)) {
      return;
    }

    const VIEW_THRESHOLD_SECONDS = 12;
    const state = {
      videoEl,
      pointer,
      pointerKey,
      viewerIdentityKey,
      handlers: [],
      viewTimerId: null,
      viewFired: false,
    };

    const clearTimer = (timerKey) => {
      const property = `${timerKey}TimerId`;
      if (state[property]) {
        clearTimeout(state[property]);
        state[property] = null;
      }
    };

    const finalizeView = () => {
      if (state.viewFired) {
        return;
      }
      state.viewFired = true;
      clearTimer("view");
      this.cancelPendingViewLogging();

      const { pointer: thresholdPointer, pointerKey: thresholdPointerKey } =
        state;

      (async () => {
        let viewResult;
        try {
          const canUseWatchHistoryService =
            typeof watchHistoryService?.publishView === "function";
          const resolveWatchActor = () => {
            const normalizedUser = this.normalizeHexPubkey(this.pubkey);
            if (normalizedUser) {
              return normalizedUser;
            }

            const normalizedClient = this.normalizeHexPubkey(
              nostrClient?.pubkey
            );
            if (normalizedClient) {
              return normalizedClient;
            }

            const normalizedSession = this.normalizeHexPubkey(
              nostrClient?.sessionActor?.pubkey
            );
            if (normalizedSession) {
              return normalizedSession;
            }

            if (
              typeof nostrClient?.pubkey === "string" &&
              nostrClient.pubkey.trim()
            ) {
              return nostrClient.pubkey.trim().toLowerCase();
            }

            if (
              typeof nostrClient?.sessionActor?.pubkey === "string" &&
              nostrClient.sessionActor.pubkey.trim()
            ) {
              return nostrClient.sessionActor.pubkey.trim().toLowerCase();
            }

            return "";
          };

          const activeWatchActor = resolveWatchActor();
          const watchMetadata = activeWatchActor ? { actor: activeWatchActor } : undefined;

          if (canUseWatchHistoryService) {
            viewResult = await watchHistoryService.publishView(
              thresholdPointer,
              undefined,
              watchMetadata
            );
          } else if (typeof nostrClient?.recordVideoView === "function") {
            viewResult = await nostrClient.recordVideoView(thresholdPointer);
          } else {
            viewResult = { ok: false, error: "view-logging-unavailable" };
          }
        } catch (error) {
          if (isDevMode) {
            console.warn(
              "[playVideoWithFallback] Exception while recording video view:",
              error
            );
          }
        }

        const viewOk = !!viewResult?.ok;
        if (viewOk) {
          const eventIdentityKey =
            this.deriveViewIdentityKeyFromEvent(viewResult?.event) ||
            state.viewerIdentityKey ||
            this.getActiveViewIdentityKey();
          const keyToPersist = this.buildViewCooldownKey(
            thresholdPointerKey,
            eventIdentityKey
          );
          if (keyToPersist) {
            this.loggedViewPointerKeys.add(keyToPersist);
          }
          if (viewResult?.event) {
            ingestLocalViewEvent({
              event: viewResult.event,
              pointer: thresholdPointer,
            });
          }
        } else if (isDevMode && viewResult) {
          console.warn(
            "[playVideoWithFallback] View event rejected by relays:",
            viewResult
          );
        }
      })().catch((error) => {
        if (isDevMode) {
          console.warn(
            "[playVideoWithFallback] Unexpected error while recording video view:",
            error
          );
        }
      });
    };

    const scheduleTimer = (timerKey, thresholdSeconds, callback) => {
      const firedKey = `${timerKey}Fired`;
      const idKey = `${timerKey}TimerId`;
      if (state[firedKey] || state[idKey]) {
        return;
      }
      const currentSeconds = Number.isFinite(videoEl.currentTime)
        ? videoEl.currentTime
        : 0;
      const remainingMs = Math.max(
        0,
        Math.ceil((thresholdSeconds - currentSeconds) * 1000)
      );
      if (remainingMs <= 0) {
        callback();
        return;
      }
      state[idKey] = window.setTimeout(callback, remainingMs);
    };

    const registerHandler = (eventName, handler) => {
      videoEl.addEventListener(eventName, handler);
      state.handlers.push({ eventName, handler });
    };

    registerHandler("timeupdate", () => {
      if (!state.viewFired && videoEl.currentTime >= VIEW_THRESHOLD_SECONDS) {
        finalizeView();
      }
    });

    const cancelOnPause = () => {
      if (!state.viewFired) {
        clearTimer("view");
      }
    };

    ["pause", "waiting", "stalled", "ended", "emptied"].forEach((event) =>
      registerHandler(event, cancelOnPause)
    );

    const resumeIfNeeded = () => {
      if (state.viewFired) {
        return;
      }
      scheduleTimer("view", VIEW_THRESHOLD_SECONDS, finalizeView);
    };

    ["play", "playing"].forEach((event) =>
      registerHandler(event, resumeIfNeeded)
    );

    this.playbackTelemetryState = state;

    if (!videoEl.paused && videoEl.currentTime > 0) {
      resumeIfNeeded();
    }
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
        console.warn("[teardownVideoElement]", err);
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
      console.warn("Unable to determine share URL base:", err);
      return "";
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
      console.error("Error generating nevent for share URL:", err);
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
          this.videoModal.updateProgress(progress.style.width);
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
        if (isDevMode) {
          console.warn("[hideModal] Failed to reset modal video element:", error);
        }
      }
    }

    if (this.videoModal) {
      try {
        this.videoModal.close();
      } catch (error) {
        console.warn("[hideModal] Failed to close video modal immediately:", error);
      }
    }

    this.currentMagnetUri = null;

    // 3) Kick off heavy cleanup work asynchronously. We still await it so
    // callers that depend on teardown finishing behave the same, but the
    // user-visible UI is already closed.
    const performCleanup = async () => {
      try {
        await fetch("/webtorrent/cancel/", { mode: "no-cors" });
      } catch (err) {
        if (isDevMode) {
          console.warn("[hideModal] webtorrent cancel fetch failed:", err);
        }
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
      console.error("[hideModal] Cleanup failed:", error);
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
      return this.feedEngine.registerFeed("recent", {
        source: createActiveNostrSource({ service: this.nostrService }),
        stages: [
          createBlacklistFilterStage({
            shouldIncludeVideo: (video, options) =>
              this.nostrService.shouldIncludeVideo(video, options),
          }),
          createDedupeByRootStage({
            dedupe: (videos) => this.dedupeVideosByRoot(videos),
          }),
        ],
        sorter: createChronologicalSorter(),
      });
    } catch (error) {
      console.warn("[Application] Failed to register recent feed:", error);
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
      return this.feedEngine.registerFeed("subscriptions", {
        source: createSubscriptionAuthorsSource({ service: this.nostrService }),
        stages: [
          createBlacklistFilterStage({
            shouldIncludeVideo: (video, options) =>
              this.nostrService.shouldIncludeVideo(video, options),
          }),
          createDedupeByRootStage({
            dedupe: (videos) => this.dedupeVideosByRoot(videos),
          }),
        ],
        sorter: createChronologicalSorter(),
        hooks: {
          subscriptions: {
            resolveAuthors: () => subscriptions.getSubscribedAuthors(),
          },
        },
      });
    } catch (error) {
      console.warn("[Application] Failed to register subscriptions feed:", error);
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
      console.warn("[Application] Failed to register watch history feed:", error);
      return null;
    }
  }

  buildRecentFeedRuntime() {
    const blacklist =
      this.blacklistedEventIds instanceof Set
        ? new Set(this.blacklistedEventIds)
        : new Set();

    return {
      blacklistedEventIds: blacklist,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
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
        console.error("[Application] Failed to run recent feed:", error);
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
    console.log("Starting loadVideos... (forceFetch =", forceFetch, ")");

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
    const classes = [
      "url-health-badge",
      "text-xs",
      "font-semibold",
      "px-2",
      "py-1",
      "rounded",
      "inline-flex",
      "items-center",
      "gap-1",
      "bg-gray-800",
      "text-gray-300",
    ];
    if (includeMargin) {
      classes.splice(1, 0, "mt-3");
    }

    return `
      <div
        class="${classes.join(" ")}"
        data-url-health-state="checking"
        aria-live="polite"
        role="status"
      >
        Checking hosted URL…
      </div>
    `;
  }

  getTorrentHealthBadgeMarkup(options = {}) {
    const includeMargin = options?.includeMargin !== false;
    const classes = [
      "torrent-health-badge",
      "text-xs",
      "font-semibold",
      "px-2",
      "py-1",
      "rounded",
      "inline-flex",
      "items-center",
      "gap-1",
      "bg-gray-800",
      "text-gray-300",
      "transition-colors",
      "duration-200",
    ];
    if (includeMargin) {
      classes.unshift("mt-3");
    }

    return `
      <div
        class="${classes.join(" ")}"
        data-stream-health-state="checking"
        aria-live="polite"
        role="status"
      >
        ⏳ Torrent
      </div>
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
    const message =
      state?.message ||
      (status === "healthy"
        ? "✅ CDN"
        : status === "offline"
        ? "❌ CDN"
        : status === "unknown"
        ? "⚠️ CDN"
        : status === "timeout"
        ? "⚠️ CDN timed out"
        : "Checking hosted URL…");

    const hadMargin = badgeEl.classList.contains("mt-3");

    badgeEl.dataset.urlHealthState = status;
    const cardEl = badgeEl.closest(".video-card");
    if (cardEl) {
      cardEl.dataset.urlHealthState = status;
    }
    badgeEl.setAttribute("aria-live", "polite");
    badgeEl.setAttribute("role", status === "offline" ? "alert" : "status");
    badgeEl.textContent = message;

    const baseClasses = [
      "url-health-badge",
      "text-xs",
      "font-semibold",
      "px-2",
      "py-1",
      "rounded",
      "transition-colors",
      "duration-200",
    ];
    if (hadMargin) {
      baseClasses.unshift("mt-3");
    }
    badgeEl.className = baseClasses.join(" ");

    if (status === "healthy") {
      badgeEl.classList.add(
        "inline-flex",
        "items-center",
        "gap-1",
        "bg-green-900",
        "text-green-200"
      );
    } else if (status === "offline") {
      badgeEl.classList.add(
        "inline-flex",
        "items-center",
        "gap-1",
        "bg-red-900",
        "text-red-200"
      );
    } else if (status === "unknown" || status === "timeout") {
      badgeEl.classList.add(
        "inline-flex",
        "items-center",
        "gap-1",
        "bg-amber-900",
        "text-amber-200"
      );
    } else {
      badgeEl.classList.add(
        "inline-flex",
        "items-center",
        "gap-1",
        "bg-gray-800",
        "text-gray-300"
      );
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
          console.warn(
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
        console.warn(`[urlHealth] probe failed for ${trimmedUrl}:`, err);
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
        console.warn(
          `[urlHealth] probe promise rejected post-cache for ${trimmedUrl}:`,
          err
        );
      });
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

    this.videoListView.render(videos, metadata);
  }

  refreshVideoDiscussionCounts(videos = []) {
    if (
      !Array.isArray(videos) ||
      !videos.length ||
      !this.videoList ||
      !nostrClient?.pool
    ) {
      return;
    }

    const eligible = videos
      .filter(
        (video) =>
          video &&
          typeof video.id === "string" &&
          video.id &&
          video.enableComments !== false
      )
      .slice(0, MAX_DISCUSSION_COUNT_VIDEOS);

    eligible.forEach((video) => {
      const container = this.videoList.querySelector(
        `[data-discussion-count="${video.id}"]`
      );
      if (!container) {
        return;
      }

      const cached = this.videoDiscussionCountCache.get(video.id);
      if (typeof cached === "number") {
        this.updateDiscussionCountElement(container, cached);
        return;
      }

      const filters = this.buildDiscussionCountFilters(video);
      if (!filters.length) {
        this.markDiscussionCountError(container, { unsupported: true });
        return;
      }

      const existingPromise = this.inFlightDiscussionCounts.get(video.id);
      if (existingPromise) {
        this.setDiscussionCountPending(container);
        return;
      }

      this.setDiscussionCountPending(container);

      const request = nostrClient
        .countEventsAcrossRelays(filters)
        .then((result) => {
          const perRelay = Array.isArray(result?.perRelay)
            ? result.perRelay.filter((entry) => entry && entry.ok)
            : [];

          if (!perRelay.length) {
            this.markDiscussionCountError(container, { unsupported: true });
            return result;
          }

          const total = Number(result?.total);
          const normalized =
            Number.isFinite(total) && total >= 0 ? total : 0;
          this.videoDiscussionCountCache.set(video.id, normalized);
          this.updateDiscussionCountElement(container, normalized);
          return result;
        })
        .catch((error) => {
          if (isDevMode) {
            console.warn(
              `[counts] Failed to fetch discussion count for ${video.id}:`,
              error
            );
          }
          this.markDiscussionCountError(container);
          throw error;
        })
        .finally(() => {
          this.inFlightDiscussionCounts.delete(video.id);
        });

      this.inFlightDiscussionCounts.set(video.id, request);
    });
  }

  buildDiscussionCountFilters(video) {
    if (!video || typeof video !== "object") {
      return [];
    }

    const filters = [];
    const eventId =
      typeof video.id === "string" ? video.id.trim() : "";
    if (eventId) {
      filters.push({ kinds: [1], "#e": [eventId] });
    }

    const address = this.getVideoAddressPointer(video);
    if (address) {
      filters.push({ kinds: [1], "#a": [address] });
    }

    return filters;
  }

  getVideoAddressPointer(video) {
    if (!video || typeof video !== "object") {
      return "";
    }

    const tags = Array.isArray(video.tags) ? video.tags : [];
    const dTag = tags.find(
      (tag) =>
        Array.isArray(tag) &&
        tag.length >= 2 &&
        tag[0] === "d" &&
        typeof tag[1] === "string" &&
        tag[1].trim()
    );

    if (!dTag) {
      return "";
    }

    const pubkey =
      typeof video.pubkey === "string" ? video.pubkey.trim() : "";
    if (!pubkey) {
      return "";
    }

    const identifier = dTag[1].trim();
    if (!identifier) {
      return "";
    }

    const kind =
      Number.isFinite(video.kind) && video.kind > 0
        ? Math.floor(video.kind)
        : VIDEO_EVENT_KIND;

    return `${kind}:${pubkey}:${identifier}`;
  }

  setDiscussionCountPending(element) {
    if (!element) {
      return;
    }
    element.dataset.countState = "pending";
    const valueEl = element.querySelector("[data-discussion-count-value]");
    if (valueEl) {
      valueEl.textContent = "…";
    }
    element.removeAttribute("title");
  }

  updateDiscussionCountElement(element, count) {
    if (!element) {
      return;
    }
    const valueEl = element.querySelector("[data-discussion-count-value]");
    if (!valueEl) {
      return;
    }
    const numeric = Number(count);
    const safeValue =
      Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
    element.dataset.countState = "ready";
    valueEl.textContent = safeValue.toLocaleString();
    element.removeAttribute("title");
  }

  markDiscussionCountError(element, { unsupported = false } = {}) {
    if (!element) {
      return;
    }
    const valueEl = element.querySelector("[data-discussion-count-value]");
    if (valueEl) {
      valueEl.textContent = "—";
    }
    element.dataset.countState = unsupported ? "unsupported" : "error";
    if (unsupported) {
      element.title = "Relay does not support NIP-45 COUNT queries.";
    } else {
      element.removeAttribute("title");
    }
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
    if (this.moreMenuGlobalHandlerBound) {
      return;
    }

    this.moreMenuGlobalHandlerBound = true;

    this.boundMoreMenuDocumentClick = (event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("[data-more-menu-wrapper]") ||
          target.closest("[data-more-menu]"))
      ) {
        return;
      }
      this.closeAllMoreMenus();
    };

    this.boundMoreMenuDocumentKeydown = (event) => {
      if (event.key === "Escape") {
        this.closeAllMoreMenus();
      }
    };

    document.addEventListener("click", this.boundMoreMenuDocumentClick);
    document.addEventListener("keydown", this.boundMoreMenuDocumentKeydown);
  }

  closeAllMoreMenus() {
    if (this.videoListView) {
      this.videoListView.closeAllMenus();
    }

    const menus = document.querySelectorAll("[data-more-menu]");
    menus.forEach((menu) => {
      if (menu instanceof HTMLElement) {
        menu.classList.add("hidden");
      }
    });

    const buttons = document.querySelectorAll("[data-more-dropdown]");
    buttons.forEach((btn) => {
      if (btn instanceof HTMLElement) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  attachMoreMenuHandlers(container) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return;
    }

    const buttons = container.querySelectorAll("[data-more-dropdown]");
    if (!buttons.length) {
      return;
    }

    this.ensureGlobalMoreMenuHandlers();

    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (button.dataset.moreMenuToggleBound === "true") {
        return;
      }
      button.dataset.moreMenuToggleBound = "true";
      button.setAttribute("aria-expanded", "false");

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const key = button.getAttribute("data-more-dropdown") || "";
        const dropdown = document.getElementById(`moreDropdown-${key}`);
        if (!(dropdown instanceof HTMLElement)) {
          return;
        }

        const willOpen = dropdown.classList.contains("hidden");
        this.closeAllMoreMenus();

        if (willOpen) {
          dropdown.classList.remove("hidden");
          button.setAttribute("aria-expanded", "true");
        }
      });
    });

    const actionButtons = container.querySelectorAll(
      "[data-more-menu] button[data-action]"
    );
    actionButtons.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (button.dataset.moreMenuActionBound === "true") {
        return;
      }
      button.dataset.moreMenuActionBound = "true";

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { action } = button.dataset;
        this.handleMoreMenuAction(action, button.dataset);
        this.closeAllMoreMenus();
      });
    });
  }

  syncModalMoreMenuData() {
    if (!this.videoModal) {
      return;
    }

    this.videoModal.syncMoreMenuData({
      currentVideo: this.currentVideo,
      canManageBlacklist: this.canCurrentUserManageBlacklist(),
    });
  }

  async handleMoreMenuAction(action, dataset = {}) {
    const normalized = typeof action === "string" ? action.trim() : "";
    const context = dataset.context || "";

    switch (normalized) {
      case "open-channel": {
        if (context === "modal") {
          this.openCreatorChannel();
          break;
        }

        const author =
          dataset.author || (this.currentVideo ? this.currentVideo.pubkey : "");
        if (author) {
          this.goToProfile(author);
        } else {
          this.showError("No creator info available.");
        }
        break;
      }
      case "copy-link": {
        const eventId =
          dataset.eventId ||
          (context === "modal" && this.currentVideo ? this.currentVideo.id : "");
        if (!eventId) {
          this.showError("Could not generate link.");
          break;
        }
        const shareUrl = this.buildShareUrlFromEventId(eventId);
        if (!shareUrl) {
          this.showError("Could not generate link.");
          break;
        }
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => this.showSuccess("Video link copied to clipboard!"))
          .catch(() => this.showError("Failed to copy the link."));
        break;
      }
      case "remove-history": {
        await this.handleRemoveHistoryAction(dataset);
        break;
      }
      case "copy-npub": {
        const explicitNpub =
          typeof dataset.npub === "string" && dataset.npub.trim()
            ? dataset.npub.trim()
            : "";
        const authorCandidate = dataset.author || "";
        const fallbackNpub = this.safeEncodeNpub(authorCandidate);
        const valueToCopy = explicitNpub || fallbackNpub;

        if (!valueToCopy) {
          this.showError("No npub available to copy.");
          break;
        }

        try {
          await navigator.clipboard.writeText(valueToCopy);
          this.showSuccess("Channel npub copied to clipboard!");
        } catch (error) {
          console.error("Failed to copy npub:", error);
          this.showError("Failed to copy the npub.");
        }
        break;
      }
      case "blacklist-author": {
        const actorNpub = this.getCurrentUserNpub();
        if (!actorNpub) {
          this.showError("Please login as a moderator to manage the blacklist.");
          break;
        }

        try {
          await accessControl.ensureReady();
        } catch (error) {
          console.warn("Failed to refresh moderation state before blacklisting:", error);
        }

        if (!accessControl.canEditAdminLists(actorNpub)) {
          this.showError("Only moderators can manage the blacklist.");
          break;
        }

        let author = dataset.author || "";
        if (!author && context === "modal" && this.currentVideo?.pubkey) {
          author = this.currentVideo.pubkey;
        }
        if (!author && this.currentVideo?.pubkey) {
          author = this.currentVideo.pubkey;
        }

        const explicitNpub =
          typeof dataset.npub === "string" && dataset.npub.trim()
            ? dataset.npub.trim()
            : "";
        const targetNpub = explicitNpub || this.safeEncodeNpub(author);

        if (!targetNpub) {
          this.showError("Unable to determine the creator npub.");
          break;
        }

        try {
          const result = await accessControl.addToBlacklist(
            actorNpub,
            targetNpub
          );

          if (result?.ok) {
            this.showSuccess("Creator added to the blacklist.");
            subscriptions
              .refreshActiveFeed({ reason: "admin-blacklist-update" })
              .catch((error) => {
                if (isDevMode) {
                  console.warn(
                    "[Subscriptions] Failed to refresh after blacklist update:",
                    error
                  );
                }
              });
          } else {
            const code = result?.error || "unknown";
            switch (code) {
              case "self":
                this.showError("You cannot blacklist yourself.");
                break;
              case "immutable":
                this.showError(
                  "Moderators cannot blacklist the super admin or fellow moderators."
                );
                break;
              case "invalid npub":
                this.showError("Unable to blacklist this creator.");
                break;
              case "forbidden":
                this.showError("Only moderators can manage the blacklist.");
                break;
              default:
                this.showError(
                  "Failed to update the blacklist. Please try again."
                );
                break;
            }
          }
        } catch (error) {
          console.error("Failed to add creator to blacklist:", error);
          this.showError("Failed to update the blacklist. Please try again.");
        }
        break;
      }
      case "block-author": {
        if (!this.pubkey) {
          this.showError("Please login to manage your block list.");
          break;
        }

        const authorCandidate =
          dataset.author ||
          (this.currentVideo && this.currentVideo.pubkey) ||
          "";

        const trimmed =
          typeof authorCandidate === "string" ? authorCandidate.trim() : "";
        if (!trimmed) {
          this.showError("Unable to determine the creator to block.");
          break;
        }

        let normalizedHex = "";
        if (trimmed.startsWith("npub1")) {
          normalizedHex = this.safeDecodeNpub(trimmed) || "";
        } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
          normalizedHex = trimmed.toLowerCase();
        }

        if (!normalizedHex) {
          this.showError("Unable to determine the creator to block.");
          break;
        }

        if (normalizedHex === this.pubkey) {
          this.showError("You cannot block yourself.");
          break;
        }

        try {
          await userBlocks.ensureLoaded(this.pubkey);

          if (userBlocks.isBlocked(normalizedHex)) {
            this.showSuccess("You already blocked this creator.");
          } else {
            await userBlocks.addBlock(normalizedHex, this.pubkey);
            this.showSuccess(
              "Creator blocked. You won't see their videos anymore."
            );
          }

          if (this.profileController) {
            try {
              this.profileController.populateBlockedList();
            } catch (error) {
              console.warn(
                "[profileModal] Failed to refresh blocked list after update:",
                error,
              );
            }
          }
          await this.loadVideos();
          subscriptions
            .refreshActiveFeed({ reason: "user-block-update" })
            .catch((error) => {
              if (isDevMode) {
                console.warn(
                  "[Subscriptions] Failed to refresh after user block update:",
                  error
                );
              }
            });
        } catch (error) {
          console.error("Failed to update personal block list:", error);
          const message =
            error?.code === "nip04-missing"
              ? "Your Nostr extension must support NIP-04 to manage private lists."
              : "Failed to update your block list. Please try again.";
          this.showError(message);
        }
        break;
      }
      case "report": {
        this.showSuccess("Reporting coming soon.");
        break;
      }
      default:
        break;
    }
  }

  /**
   * Updates the modal to reflect current torrent stats.
   * We remove the unused torrent.status references,
   * and do not re-trigger recursion here (no setTimeout).
   */
  updateTorrentStatus(torrent) {
    console.log("[DEBUG] updateTorrentStatus called with torrent:", torrent);

    if (!torrent) {
      console.log("[DEBUG] torrent is null/undefined!");
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
    console.log("[DEBUG] torrent.progress =", torrent.progress);
    console.log("[DEBUG] torrent.numPeers =", torrent.numPeers);
    console.log("[DEBUG] torrent.downloadSpeed =", torrent.downloadSpeed);
    console.log("[DEBUG] torrent.downloaded =", torrent.downloaded);
    console.log("[DEBUG] torrent.length =", torrent.length);
    console.log("[DEBUG] torrent.ready =", torrent.ready);

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
      return { eventId, index };
    }

    if (typeof target === "string") {
      const trimmed = target.trim();
      if (!trimmed) {
        return { eventId: "", index: null };
      }
      if (/^-?\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        return { eventId: "", index: Number.isNaN(parsed) ? null : parsed };
      }
      return { eventId: trimmed, index: null };
    }

    if (typeof target === "number" && Number.isInteger(target)) {
      return { eventId: "", index: target };
    }

    return { eventId: "", index: null };
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
      console.error("Failed to edit video:", error);
      this.showError("Failed to edit video. Please try again.");
      if (this.editModal?.setSubmitState) {
        this.editModal.setSubmitState({ pending: false });
      }
    }
  }

  async handleEditVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
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
        console.error("Failed to load edit modal:", error);
        this.showError(`Failed to initialize edit modal: ${error.message}`);
        return;
      }

      try {
        await this.editModal.open(video);
      } catch (error) {
        console.error("Failed to open edit modal:", error);
        this.showError("Edit modal is not available right now.");
      }
    } catch (err) {
      console.error("Failed to edit video:", err);
      this.showError("Failed to edit video. Please try again.");
    }
  }

  async handleRevertVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
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
      this.revertModal.open({ video });
    } catch (err) {
      console.error("Failed to revert video:", err);
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
      console.error("Failed to revert video:", err);
      this.showError("Failed to revert video. Please try again.");
    } finally {
      this.revertModal.setBusy(false);
    }
  }

  /**
   * Handle "Delete Video" from gear menu.
   */
  async handleFullDeleteVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
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
      // Make sure the user is absolutely sure:
      if (
        !confirm(
          `Delete ALL versions of "${video.title}"? This action is permanent.`
        )
      ) {
        return;
      }

      // We assume video.videoRootId is not empty, or fallback to video.id if needed
      const rootId = video.videoRootId || video.id;

      await this.nostrService.handleFullDeleteVideo({
        videoRootId: rootId,
        pubkey: this.pubkey,
        confirm: false,
      });

      // Reload
      await this.loadVideos();
      this.showSuccess("All versions deleted successfully!");
      this.forceRefreshAllProfiles();
    } catch (err) {
      console.error("Failed to delete all versions:", err);
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
              console.error("Error fetching older event by ID:", err);
              this.showError("Could not load videos for the share link.");
            });
        }
      }
    } catch (err) {
      console.error("Error decoding nevent:", err);
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
          console.warn(
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
      console.warn(`[probeUrl] HEAD request failed for ${trimmed}:`, err);
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
      console.warn("[playHttp] Direct URL playback failed:", err);
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
      }

      const torrentInstance = await torrentClient.streamVideo(
        cacheBustedMagnet,
        this.modalVideo,
        { urlList: sanitizedUrlList }
      );
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
  async playVideoWithFallback({ url = "", magnet = "" } = {}) {
    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const requestSignature = JSON.stringify({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
    });

    if (
      this.activePlaybackSession &&
      typeof this.activePlaybackSession.matchesRequestSignature === "function" &&
      this.activePlaybackSession.matchesRequestSignature(requestSignature)
    ) {
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

    let modalVideoEl = this.modalVideo;
    if (!modalVideoEl) {
      try {
        const { videoElement } = await this.ensureVideoModalReady({
          ensureVideoElement: true,
        });
        modalVideoEl = videoElement;
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
        console.warn(
          "[playVideoWithFallback] video modal poster cleanup threw:",
          err
        );
      }
    }

    const refreshedModal = this.teardownVideoElement(modalVideoEl, {
      replaceNode: true,
    });
    if (refreshedModal) {
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
        this.preparePlaybackViewLogging(videoElement);
      }
    });

    subscribe("poster-remove", ({ reason } = {}) => {
      this.forceRemoveModalPoster(reason || "playback");
    });

    subscribe("sourcechange", ({ source } = {}) => {
      this.playSource = source || null;
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
            console.warn(
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

    const fallbackUrl =
      typeof playbackHint?.url === "string" ? playbackHint.url.trim() : "";
    const fallbackTitle =
      typeof playbackHint?.title === "string" ? playbackHint.title : "";
    const fallbackDescription =
      typeof playbackHint?.description === "string"
        ? playbackHint.description
        : "";
    const fallbackMagnetRaw =
      typeof playbackHint?.magnet === "string"
        ? playbackHint.magnet.trim()
        : "";
    let fallbackMagnetCandidate = "";
    if (fallbackMagnetRaw) {
      const decoded = safeDecodeMagnet(fallbackMagnetRaw);
      fallbackMagnetCandidate = decoded || fallbackMagnetRaw;
    }

    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;

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
        });
      }
      this.showError("Video not found or has been removed.");
      return;
    }

    try {
      await accessControl.ensureReady();
    } catch (error) {
      console.warn(
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

    trackVideoView({
      videoId: video.id || eventId,
      title: video.title || "Untitled",
      source: "event",
      hasMagnet: !!sanitizedMagnet,
      hasUrl: !!trimmedUrl,
    });

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

    const playbackPromise = this.playVideoWithFallback({
      url: trimmedUrl,
      magnet: magnetInput,
    });

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
      const displayNpub = `${creatorNpub.slice(0, 8)}...${creatorNpub.slice(-4)}`;
      this.videoModal.updateMetadata({
        title: video.title || "Untitled",
        description: video.description || "No description available.",
        timestamps: timestampPayload,
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

    if (video && typeof video === "object") {
      video.rootCreatedAt = normalized;
    }

    if (video?.id && this.videosMap instanceof Map) {
      const existing = this.videosMap.get(video.id);
      if (existing && typeof existing === "object") {
        existing.rootCreatedAt = normalized;
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
      if (isDevMode) {
        console.warn(
          "[Application] Failed to hydrate video history for timestamps:",
          error
        );
      }
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

    this.videoModal.updateMetadata({ timestamps: payload });
  }

  async playVideoWithoutEvent({
    url = "",
    magnet = "",
    title = "Untitled",
    description = "",
  } = {}) {
    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;
    this.subscribeModalViewCount(null, null);

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const decodedMagnet = safeDecodeMagnet(trimmedMagnet);
    const usableMagnet = decodedMagnet || trimmedMagnet;
    const magnetSupported = isValidMagnetUri(usableMagnet);
    const sanitizedMagnet = magnetSupported ? usableMagnet : "";

    this.zapController?.setVisibility(false);
    this.zapController?.resetState();

    trackVideoView({
      videoId:
        typeof title === "string" && title.trim().length > 0
          ? `direct:${title.trim()}`
          : "direct-playback",
      title,
      source: "direct",
      hasMagnet: !!sanitizedMagnet,
      hasUrl: !!sanitizedUrl,
    });

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
    };

    this.syncModalMoreMenuData();

    this.currentMagnetUri = sanitizedMagnet || null;

    this.setCopyMagnetState(!!sanitizedMagnet);
    this.setShareButtonState(false);

    if (this.videoModal) {
      this.videoModal.updateMetadata({
        title: title || "Untitled",
        description: description || "No description available.",
        timestamp: "",
        creator: {
          name: "Unknown",
          avatarUrl: "assets/svg/default-profile.svg",
          npub: "",
        },
      });
    }

    await this.showModalWithPoster(this.currentVideo);

    const urlObj = new URL(window.location.href);
    urlObj.searchParams.delete("v");
    const cleaned = `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    window.history.replaceState({}, "", cleaned);

    return this.playVideoWithFallback({
      url: sanitizedUrl,
      magnet: usableMagnet,
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

  showError(msg) {
    if (!msg) {
      // Remove any content, then hide
      this.errorContainer.textContent = "";
      this.errorContainer.classList.add("hidden");
      return;
    }

    // If there's a message, show it
    this.errorContainer.textContent = msg;
    this.errorContainer.classList.remove("hidden");

    // Optional auto-hide after 5 seconds
    setTimeout(() => {
      this.errorContainer.textContent = "";
      this.errorContainer.classList.add("hidden");
    }, 5000);
  }

  showStatus(msg) {
    if (!(this.statusContainer instanceof HTMLElement)) {
      return;
    }

    if (!msg) {
      if (this.statusMessage instanceof HTMLElement) {
        this.statusMessage.textContent = "";
      }
      this.statusContainer.classList.add("hidden");
      return;
    }

    if (this.statusMessage instanceof HTMLElement) {
      this.statusMessage.textContent = msg;
    } else {
      this.statusContainer.textContent = msg;
    }
    this.statusContainer.classList.remove("hidden");
  }

  showSuccess(msg) {
    if (!msg) {
      this.successContainer.textContent = "";
      this.successContainer.classList.add("hidden");
      return;
    }

    this.successContainer.textContent = msg;
    this.successContainer.classList.remove("hidden");

    setTimeout(() => {
      this.successContainer.textContent = "";
      this.successContainer.classList.add("hidden");
    }, 5000);
  }

  log(msg) {
    console.log(msg);
  }

  destroy() {
    this.clearActiveIntervals();
    this.teardownModalViewCountSubscription();
    this.videoModalReadyPromise = null;

    if (typeof this.unsubscribeFromPubkeyState === "function") {
      try {
        this.unsubscribeFromPubkeyState();
      } catch (error) {
        console.warn("[Application] Failed to unsubscribe pubkey state:", error);
      }
      this.unsubscribeFromPubkeyState = null;
    }

    if (typeof this.unsubscribeFromCurrentUserState === "function") {
      try {
        this.unsubscribeFromCurrentUserState();
      } catch (error) {
        console.warn(
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

    if (this.nwcSettings instanceof Map) {
      this.nwcSettings.clear();
    }

    if (typeof this.watchHistoryPreferenceUnsubscribe === "function") {
      try {
        this.watchHistoryPreferenceUnsubscribe();
      } catch (error) {
        console.warn(
          "[Application] Failed to unsubscribe watch history preference:",
          error
        );
      }
      this.watchHistoryPreferenceUnsubscribe = null;
    }

    this.authEventUnsubscribes.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          console.warn("[Application] Auth listener unsubscribe failed:", error);
        }
      }
    });
    this.authEventUnsubscribes = [];

    if (typeof this.unsubscribeFromNostrService === "function") {
      try {
        this.unsubscribeFromNostrService();
      } catch (error) {
        console.warn("[Application] Failed to unsubscribe nostr service:", error);
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
        console.warn("[Application] Failed to destroy upload modal:", error);
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
          console.warn("[Application] Failed to destroy edit modal:", error);
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
        console.warn("[Application] Failed to destroy revert modal:", error);
      }
    }

    if (this.videoModal) {
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
      if (typeof this.videoModal.destroy === "function") {
        try {
          this.videoModal.destroy();
        } catch (error) {
          console.warn("[Application] Failed to destroy video modal:", error);
        }
      }
    }

    if (this.videoListView) {
      if (this.boundVideoListShareListener) {
        this.videoListView.removeEventListener(
          "video:share",
          this.boundVideoListShareListener
        );
        this.boundVideoListShareListener = null;
      }
      if (this.boundVideoListContextListener) {
        this.videoListView.removeEventListener(
          "video:context-action",
          this.boundVideoListContextListener
        );
        this.boundVideoListContextListener = null;
      }
      this.videoListView.setPlaybackHandler(null);
      this.videoListView.setEditHandler(null);
      this.videoListView.setRevertHandler(null);
      this.videoListView.setDeleteHandler(null);
      this.videoListView.setBlacklistHandler(null);
      this.videoListViewPlaybackHandler = null;
      this.videoListViewEditHandler = null;
      this.videoListViewRevertHandler = null;
      this.videoListViewDeleteHandler = null;
      this.videoListViewBlacklistHandler = null;
      try {
        this.videoListView.destroy();
      } catch (error) {
        console.warn("[Application] Failed to destroy VideoListView:", error);
      }
    }

    if (this.profileController) {
      if (typeof this.profileController.destroy === "function") {
        try {
          this.profileController.destroy();
        } catch (error) {
          console.warn(
            "[Application] Failed to destroy profile controller:",
            error,
          );
        }
      }
      this.profileController = null;
    }

    this.videoList = null;
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
      console.error("Failed to copy magnet link:", err);
      this.showError("Could not copy magnet link. Please copy it manually.");
    }
  }
}

/**
 * Given an array of video objects,
 * return only the newest (by created_at) for each videoRootId.
 * If no videoRootId is present, treat the video’s own ID as its root.
 */
export { Application };
export default Application;
