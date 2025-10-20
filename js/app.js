// js/app.js

import { nostrClient } from "./nostr.js";
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
import { URL_FIRST_ENABLED } from "./constants.js";
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import { updateVideoCardSourceVisibility } from "./utils/cardSourceVisibility.js";
import { ADMIN_INITIAL_EVENT_BLACKLIST } from "./lists.js";
import { userBlocks } from "./userBlocks.js";
import { relayManager } from "./relayManager.js";
import {
  createFeedEngine,
  createActiveNostrSource,
  createBlacklistFilterStage,
  createDedupeByRootStage,
  createModerationStage,
  createChronologicalSorter,
  createSubscriptionAuthorsSource,
  registerWatchHistoryFeed,
} from "./feedEngine/index.js";
import watchHistoryService from "./watchHistoryService.js";
import r2Service from "./services/r2Service.js";
import PlaybackService from "./services/playbackService.js";
import AuthService from "./services/authService.js";
import NwcSettingsService from "./services/nwcSettingsService.js";
import nostrService from "./services/nostrService.js";
import DiscussionCountService from "./services/discussionCountService.js";
import { initQuickR2Upload } from "./r2-quick.js";
import { createWatchHistoryRenderer } from "./historyView.js";
import WatchHistoryController from "./ui/watchHistoryController.js";
import WatchHistoryTelemetry from "./services/watchHistoryTelemetry.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import { subscriptions } from "./subscriptions.js";
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
import {
  escapeHTML as escapeHtml,
  removeTrackingScripts,
} from "./utils/domUtils.js";
import { VideoModal } from "./ui/components/VideoModal.js";
import { UploadModal } from "./ui/components/UploadModal.js";
import { EditModal } from "./ui/components/EditModal.js";
import { RevertModal } from "./ui/components/RevertModal.js";
import { DeleteModal } from "./ui/components/DeleteModal.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./ui/components/staticModalAccessibility.js";
import { VideoListView } from "./ui/views/VideoListView.js";
import MoreMenuController from "./ui/moreMenuController.js";
import ProfileModalController from "./ui/profileModalController.js";
import ZapController from "./ui/zapController.js";
import { MediaLoader } from "./utils/mediaLoader.js";
import { pointerArrayToKey } from "./utils/pointer.js";
import { resolveVideoPointer } from "./utils/videoPointer.js";
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
  loadModerationOverridesFromStorage,
  URL_PROBE_TIMEOUT_MS,
  urlHealthConstants,
} from "./state/cache.js";

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
    this.pendingModalZapOpen = false;
    this.videoListViewPlaybackHandler = null;
    this.videoListViewEditHandler = null;
    this.videoListViewRevertHandler = null;
    this.videoListViewDeleteHandler = null;
    this.deleteModal = null;
    this.moreMenuController = null;
    this.latestFeedMetadata = null;
    this.lastModalTrigger = null;

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
        formatShortNpub: (value) => formatShortNpub(value),
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

    const deleteModalEvents = new EventTarget();
    this.deleteModal =
      (typeof ui.deleteModal === "function"
        ? ui.deleteModal({ app: this, eventTarget: deleteModalEvents })
        : ui.deleteModal) ||
      new DeleteModal({
        removeTrackingScripts,
        setGlobalModalState,
        truncateMiddle,
        container: document.getElementById("modalContainer") || null,
        eventTarget: deleteModalEvents,
      });

    this.boundDeleteConfirmHandler = (event) => {
      this.handleDeleteModalConfirm(event);
    };
    this.deleteModal.addEventListener(
      "video:delete-confirm",
      this.boundDeleteConfirmHandler
    );

    this.boundDeleteCancelHandler = () => {
      this.showError("");
    };
    this.deleteModal.addEventListener(
      "video:delete-cancel",
      this.boundDeleteCancelHandler
    );

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
          accessControl,
          getCurrentUserNpub: () => this.getCurrentUserNpub(),
          nwcSettings: this.nwcSettingsService,
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
          closeAllMoreMenus: (options) => this.closeAllMoreMenus(options),
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
      });
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

    // Auth state
    this.pubkey = null;
    this.currentMagnetUri = null;
    this.currentVideo = null;
    this.currentVideoPointer = null;
    this.currentVideoPointerKey = null;
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

  async handleAddProfile(controller) {
    const button =
      (controller && controller.addAccountButton) ||
      this.profileController?.addAccountButton ||
      null;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    if (button.dataset.state === "loading") {
      return;
    }

    const titleEl = button.querySelector('[data-profile-add-title]');
    const hintEl = button.querySelector('[data-profile-add-hint]');
    const originalTitle = titleEl ? titleEl.textContent : "";
    const originalHint = hintEl ? hintEl.textContent : "";
    const originalAriaLabel = button.getAttribute("aria-label");
    const originalDisabled = button.disabled;

    const setLoadingState = (isLoading) => {
      button.disabled = isLoading ? true : originalDisabled;
      if (isLoading) {
        button.dataset.state = "loading";
      } else {
        delete button.dataset.state;
      }
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
      devLogger.error("Failed to add profile via NIP-07:", error);
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

  async onAccessControlUpdated() {
    if (this.profileController) {
      try {
        await this.profileController.refreshAdminPaneState();
      } catch (error) {
        devLogger.error("Failed to refresh admin pane after update:", error);
      }
    }

    this.loadVideos(true).catch((error) => {
      devLogger.error("Failed to refresh videos after admin update:", error);
    });
    window.dispatchEvent(new CustomEvent("bitvid:access-control-updated"));
  }

  async onVideosShouldRefresh({ reason } = {}) {
    try {
      if (typeof moderationService?.awaitUserBlockRefresh === "function") {
        try {
          await moderationService.awaitUserBlockRefresh();
        } catch (error) {
          devLogger.warn(
            "Failed to sync moderation summaries before refreshing videos:",
            error,
          );
        }
      }

      await this.loadVideos(true);
    } catch (error) {
      const context = reason ? ` after ${reason}` : "";
      devLogger.error(`Failed to refresh videos${context}:`, error);
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

    // 6) NIP-07 button inside the login modal => call the extension & login
    const nip07Button = document.getElementById("loginNIP07");
    if (nip07Button) {
      const originalLabel = nip07Button.textContent;
      let slowExtensionTimer = null;
      const slowExtensionDelayMs = 8_000;

      const clearSlowExtensionTimer = () => {
        if (slowExtensionTimer) {
          clearTimeout(slowExtensionTimer);
          slowExtensionTimer = null;
        }
      };

      const setLoadingState = (isLoading) => {
        if (isLoading) {
          nip07Button.disabled = true;
          nip07Button.dataset.state = "loading";
          nip07Button.setAttribute("aria-busy", "true");
          nip07Button.textContent = "Connecting to NIP-07 extension...";

          clearSlowExtensionTimer();
          slowExtensionTimer = window.setTimeout(() => {
            if (nip07Button.dataset.state === "loading") {
              nip07Button.textContent = "Waiting for the extension prompt…";
            }
          }, slowExtensionDelayMs);
        } else {
          nip07Button.disabled = false;
          delete nip07Button.dataset.state;
          nip07Button.setAttribute("aria-busy", "false");
          clearSlowExtensionTimer();
          nip07Button.textContent = originalLabel;
        }
      };

      nip07Button.addEventListener("click", async () => {
        if (nip07Button.dataset.state === "loading") {
          return;
        }

        setLoadingState(true);
        devLogger.log(
          "[app.js] loginNIP07 clicked! Attempting extension login..."
        );
        try {
          const { pubkey, detail } = await this.authService.requestLogin();
          devLogger.log("[NIP-07] login returned pubkey:", pubkey);

          if (pubkey) {
            if (
              detail &&
              typeof detail === "object" &&
              detail.__handled !== true
            ) {
              try {
                await this.handleAuthLogin(detail);
              } catch (error) {
                devLogger.error(
                  "[NIP-07] handleAuthLogin fallback failed:",
                  error,
                );
              }
            }

            if (closeStaticModal("loginModal")) {
              setGlobalModalState("login", false);
            }
          }
        } catch (err) {
          devLogger.error("[NIP-07 login error]", err);
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

    // 8) Handle back/forward navigation => hide video modal
    window.addEventListener("popstate", async () => {
      devLogger.log("[popstate] user navigated back/forward; cleaning modal...");
      await this.hideModal();
    });

    // 9) Event delegation for the “Application Form” button inside the login modal
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
      mode: isDevMode ? "dev" : "live",
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
        devLogger.error("Failed to refresh videos after switching profiles:", error);
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

    const loginContext = {
      pubkey: detail?.pubkey || this.pubkey,
      previousPubkey: detail?.previousPubkey,
      identityChanged: Boolean(detail?.identityChanged),
    };

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

    try {
      this.reinitializeVideoListView({ reason: "login", postLoginResult });
    } catch (error) {
      devLogger.warn("Failed to reinitialize video list view after login:", error);
    }

    try {
      await this.loadVideos(true);
    } catch (error) {
      devLogger.error("Failed to refresh videos after login:", error);
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
      this.log("[moderation] Skipping autoplay due to trusted reports.");
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
          createModerationStage({
            getService: () => this.nostrService.getModerationService(),
          }),
        ],
        sorter: createChronologicalSorter(),
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
          createModerationStage({
            getService: () => this.nostrService.getModerationService(),
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

    const overrideEntry = getModerationOverride(video.id);
    const overrideActive = overrideEntry?.showAnyway === true;
    const overrideUpdatedAt = Number.isFinite(overrideEntry?.updatedAt)
      ? Math.floor(overrideEntry.updatedAt)
      : Date.now();

    const originalState =
      existingModeration.original && typeof existingModeration.original === "object"
        ? {
            blockAutoplay: existingModeration.original.blockAutoplay === true,
            blurThumbnail: existingModeration.original.blurThumbnail === true,
          }
        : {
            blockAutoplay: existingModeration.blockAutoplay === true,
            blurThumbnail: existingModeration.blurThumbnail === true,
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
      original: {
        blockAutoplay: originalState.blockAutoplay,
        blurThumbnail: originalState.blurThumbnail,
      },
    };

    if (overrideActive) {
      decoratedModeration.blockAutoplay = false;
      decoratedModeration.blurThumbnail = false;
      decoratedModeration.viewerOverride = {
        showAnyway: true,
        updatedAt: overrideUpdatedAt,
      };
    } else {
      decoratedModeration.blockAutoplay = originalState.blockAutoplay;
      decoratedModeration.blurThumbnail = originalState.blurThumbnail;
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
      this.decorateVideoModeration(target);
    }

    if (this.currentVideo && this.currentVideo.id === video.id) {
      this.decorateVideoModeration(this.currentVideo);
    }

    if (card && typeof card.refreshModerationUi === "function") {
      try {
        card.refreshModerationUi();
      } catch (error) {
        devLogger.warn("[Application] Failed to refresh moderation UI:", error);
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

    try {
      this.deleteModal.setBusy(true, "Deleting…");
      await this.nostrService.handleFullDeleteVideo({
        videoRootId: rootId,
        video: targetVideo,
        pubkey: this.pubkey,
        confirm: false,
      });

      await this.loadVideos();
      this.showSuccess("All versions deleted successfully!");
      this.deleteModal.setBusy(false);
      this.deleteModal.close();
      this.forceRefreshAllProfiles();
    } catch (err) {
      devLogger.error("Failed to delete all versions:", err);
      this.showError("Failed to delete all versions. Please try again.");
      this.deleteModal.setBusy(false);
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
      trigger: hasTrigger ? this.lastModalTrigger : null,
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
      const displayNpub = formatShortNpub(creatorNpub);
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

    this.videoModal.updateMetadata({ timestamps: payload });
  }

  async playVideoWithoutEvent(options = {}) {
    const {
      url = "",
      magnet = "",
      title = "Untitled",
      description = "",
      trigger,
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

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const decodedMagnet = safeDecodeMagnet(trimmedMagnet);
    const usableMagnet = decodedMagnet || trimmedMagnet;
    const magnetSupported = isValidMagnetUri(usableMagnet);
    const sanitizedMagnet = magnetSupported ? usableMagnet : "";

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
    };

    this.decorateVideoModeration(this.currentVideo);

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
          devLogger.warn("[Application] Failed to destroy video modal:", error);
        }
      }
    }

    if (this.videoListView) {
      if (this.moreMenuController) {
        this.moreMenuController.detachVideoListView();
      }
      this.videoListView.setPlaybackHandler(null);
      this.videoListView.setEditHandler(null);
      this.videoListView.setRevertHandler(null);
      this.videoListView.setDeleteHandler(null);
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
      devLogger.error("Failed to copy magnet link:", err);
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
