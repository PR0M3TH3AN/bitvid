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
  MAX_WALLET_DEFAULT_ZAP,
  ALLOW_NSFW_CONTENT,
} from "./config.js";
import { accessControl } from "./accessControl.js";
import { safeDecodeMagnet } from "./magnetUtils.js";
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
import { normalizeHashtag } from "./utils/hashtagNormalization.js";
import { sanitizeProfileMediaUrl } from "./utils/profileMedia.js";
import { ADMIN_INITIAL_EVENT_BLACKLIST } from "./lists.js";
import { userBlocks } from "./userBlocks.js";
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
  createChronologicalSorter,
  createSubscriptionAuthorsSource,
  registerWatchHistoryFeed,
} from "./feedEngine/index.js";
import watchHistoryService from "./watchHistoryService.js";
import r2Service from "./services/r2Service.js";
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
import { initQuickR2Upload } from "./r2-quick.js";
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
import { DEFAULT_NIP07_PERMISSION_METHODS } from "./nostr/nip07Permissions.js";
import {
  initViewCounter,
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
  ingestLocalViewEvent,
} from "./viewCounter.js";
import { splitAndZap as splitAndZapDefault } from "./payments/zapSplit.js";
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
import TagPreferenceMenuController from "./ui/tagPreferenceMenuController.js";
import ReactionController from "./ui/reactionController.js";
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
import { getHashViewName, setHashView } from "./hashView.js";
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
  loadDmPrivacySettingsFromStorage,
  URL_PROBE_TIMEOUT_MS,
  urlHealthConstants,
} from "./state/cache.js";
import ApplicationBootstrap from "./ui/applicationBootstrap.js";
import EngagementController from "./ui/engagementController.js";
import SimilarContentController from "./ui/similarContentController.js";
import UrlHealthController from "./ui/urlHealthController.js";
import VideoModalCommentController from "./ui/videoModalCommentController.js";
import TorrentStatusController from "./ui/torrentStatusController.js";
import ModerationActionController from "./services/moderationActionController.js";
import ModerationDecorator from "./services/moderationDecorator.js";
import { bootstrapTrustedSeeds } from "./services/trustBootstrap.js";

const recordVideoViewApi = (...args) => recordVideoView(nostrClient, ...args);

const UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

const FALLBACK_THUMBNAIL_SRC = "/assets/jpg/video-thumbnail-fallback.jpg";
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

    this.modalCreatorProfileRequestToken = null;
    this.dmRecipientPubkey = null;
    this.dmRelayHints = new Map();

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

    this.initializeModerationActionController();
    this.initializeSimilarContentController();

    this.handleShareNostrSignerChange = () => {
      this.updateShareNostrAuthState({ reason: "signer-change" });
    };
    onActiveSignerChanged(this.handleShareNostrSignerChange);
    this.updateShareNostrAuthState({ reason: "init" });
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
        if (userBlocks.isBlocked(pubkey)) {
          return true;
        }
      }

      if (!this.isUserLoggedIn()) {
        const normalized = this.normalizeHexPubkey(pubkey);
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
      loadDmPrivacySettingsFromStorage();
      this.moderationSettings = this.normalizeModerationSettings(
        getModerationSettings(),
      );

      const videoModalPromise = this.videoModal.load().then(() => {
        const modalRoot = this.videoModal.getRoot();
        if (modalRoot) {
          this.attachMoreMenuHandlers(modalRoot);
        }
        if (
          this.videoModal &&
          typeof this.videoModal.addEventListener === "function"
        ) {
          this.videoModal.addEventListener("video:share-nostr", (event) => {
            this.openShareNostrModal({
              video: event?.detail?.video || null,
              triggerElement: event?.detail?.trigger || null,
            });
          });

          this.videoModal.addEventListener("video:copy-cdn", (event) => {
            const video = event?.detail?.video || this.currentVideo;
            const url = video?.url || "";
            if (!url) {
              this.showError("No CDN link available to copy.");
              return;
            }
            navigator.clipboard
              .writeText(url)
              .then(() => this.showSuccess("CDN link copied to clipboard!"))
              .catch(() => this.showError("Failed to copy CDN link."));
          });

          this.videoModal.addEventListener("video:copy-magnet", () => {
            this.handleCopyMagnet();
          });

          this.videoModal.addEventListener("playback:switch-source", (event) => {
            const detail = event?.detail || {};
            const { source } = detail;
            if (!source) {
              return;
            }
            const modalVideo = detail?.video || null;
            const fallbackVideo = this.currentVideo || null;
            const video = {
              ...(fallbackVideo || {}),
              ...(modalVideo || {}),
            };
            const urlCandidate =
              typeof video.url === "string" ? video.url.trim() : "";
            const magnetCandidate =
              typeof video.magnet === "string" ? video.magnet.trim() : "";

            if (!modalVideo && !fallbackVideo) {
              devLogger.warn("[app] Playback source switch missing video data.");
              return;
            }

            const magnetAvailable = Boolean(magnetCandidate);
            const cachedStreamHealth =
              video?.id && this.streamHealthSnapshots instanceof Map
                ? this.streamHealthSnapshots.get(video.id)
                : null;
            const cachedPeers = Number.isFinite(cachedStreamHealth?.peers)
              ? cachedStreamHealth.peers
              : null;
            const hasActivePeers =
              cachedPeers === null ? null : cachedPeers > 0;
            const cachedUrlHealth =
              video?.id && urlCandidate
                ? this.getCachedUrlHealth(video.id, urlCandidate)
                : null;
            const cdnUnavailable =
              !urlCandidate ||
              ["offline", "timeout"].includes(cachedUrlHealth?.status);

            if (source === "torrent" && !magnetAvailable) {
              userLogger.warn(
                "[app] Unable to switch to torrent playback: missing magnet.",
              );
              this.showError(
                "Torrent playback is unavailable for this video. No magnet was provided.",
              );
              return;
            }

            if (source === "torrent" && hasActivePeers === false) {
              userLogger.warn(
                "[app] Switching to torrent playback despite 0 active peers detected.",
              );
              this.showStatus(
                "Warning: No peers detected. Playback may fail or stall.",
                { autoHideMs: 5000 }
              );
              // Proceed anyway
            }

            if (source === "url" && cdnUnavailable) {
              userLogger.warn(
                "[app] Unable to switch to CDN playback: URL unavailable.",
              );
              this.showError(
                "CDN playback is unavailable right now, staying on the torrent stream.",
              );
              return;
            }

            if (this.playSource && source === this.playSource) {
              return;
            }

            this.playVideoWithFallback({
              url: urlCandidate,
              magnet: magnetCandidate,
              forcedSource: source,
            }).catch((error) => {
              devLogger.warn(
                "[app] Failed to switch playback source:",
                error,
              );
            });
          });
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

      // Initialize the pool early to unblock bootstrapTrustedSeeds,
      // but do NOT await the full connection process here.
      try {
        await nostrClient.ensurePool();
      } catch (poolError) {
        devLogger.warn("[app.init()] Pool ensure failed:", poolError);
      }

      // Kick off relay connection in the background.
      const nostrInitPromise = nostrClient.init().catch((err) => {
        devLogger.warn("[app.init()] Background nostrClient.init failed:", err);
      });

      await modalBootstrapPromise;

      try {
        await bootstrapTrustedSeeds();
      } catch (error) {
        devLogger.warn("[app.init()] Trusted seed bootstrap failed:", error);
      }

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

      // await Promise.all([accessControlPromise, adminPanePromise]);

      const syncSessionActorBlacklist = async (trigger) => {
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
      };

      const handleSessionActorReady = async ({ pubkey, reason } = {}) => {
        if (this.pubkey) {
          return;
        }

        const normalizedPubkey = this.normalizeHexPubkey(pubkey);
        if (!normalizedPubkey) {
          return;
        }

        const triggerLabel = reason ? `session-actor-${reason}` : "session-actor";
        await syncSessionActorBlacklist(triggerLabel);

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
      };

      if (typeof nostrClient.onSessionActorChange === "function") {
        nostrClient.onSessionActorChange((detail) => {
          handleSessionActorReady(detail).catch((error) => {
            devLogger.warn(
              "[app.init()] Failed to process session actor change:",
              error,
            );
          });
        });
      }

      await syncSessionActorBlacklist("post-refresh");

      if (typeof accessControl.onBlacklistChange === "function") {
        accessControl.onBlacklistChange(() => {
          syncSessionActorBlacklist("blacklist-change");
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

      await watchHistoryInitPromise;

      // 9. Check URL ?v= param
      this.checkUrlParams();

    } catch (error) {
      devLogger.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  goToProfile(pubkey) {
    if (typeof pubkey !== "string") {
      this.showError("No creator info available.");
      return;
    }

    let candidate = pubkey.trim();
    if (!candidate) {
      this.showError("No creator info available.");
      return;
    }

    if (candidate.startsWith("nostr:")) {
      candidate = candidate.slice("nostr:".length);
    }

    const normalizedHex = this.normalizeHexPubkey(candidate);
    const npub = normalizedHex ? this.safeEncodeNpub(normalizedHex) : null;

    if (!npub) {
      devLogger.warn(
        "[Application] Invalid pubkey for profile navigation:",
        candidate,
      );
      this.showError("Invalid creator profile.");
      return;
    }

    window.location.hash = `#view=channel-profile&npub=${npub}`;
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

    this.tagPreferenceMenuController.refreshActiveMenus();
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
      reason === "login" && postLoginResult?.blocksLoaded !== false
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

    if (signer.type === "extension" && nostrClient.ensureExtensionPermissions) {
      const permissionResult = await nostrClient.ensureExtensionPermissions();
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

    if (enabled && !relayHints.length) {
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

      try {
        await this.handleModerationSettingsChange({
          settings: getModerationSettings(),
          skipRefresh: true,
        });
      } catch (error) {
        devLogger.warn(
          "Failed to sync moderation settings after profile switch:",
          error,
        );
      }

      const refreshCompleted = await this.waitForIdentityRefresh({
        reason: "profile-switch",
      });

      if (!refreshCompleted) {
        devLogger.warn(
          "[Application] Fallback identity refresh was required after switching profiles.",
        );
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

  async waitForIdentityRefresh({
    reason = "identity-refresh",
    attempts = 6,
  } = {}) {
    const maxAttempts = Number.isFinite(attempts)
      ? Math.max(1, Math.floor(attempts))
      : 6;
    const waitForTick = () =>
      new Promise((resolve) => {
        if (typeof queueMicrotask === "function") {
          queueMicrotask(resolve);
        } else if (typeof setTimeout === "function") {
          setTimeout(resolve, 0);
        } else {
          resolve();
        }
      });

    let promise = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = this.lastIdentityRefreshPromise;
      if (candidate && typeof candidate.then === "function") {
        promise = candidate;
        break;
      }
      // Yield to allow the auth login flow to schedule the refresh promise.
      // eslint-disable-next-line no-await-in-loop
      await waitForTick();
    }

    if (promise && typeof promise.then === "function") {
      try {
        await promise;
        return true;
      } catch (error) {
        devLogger.error(
          "[Application] Identity refresh promise rejected:",
          error,
        );
      }
    }

    try {
      await this.refreshAllVideoGrids({
        reason,
        forceMainReload: true,
      });
    } catch (error) {
      devLogger.error(
        "[Application] Failed to refresh video grids after waiting for identity refresh:",
        error,
      );
    }

    return false;
  }

  async handleProfileLogoutRequest({ pubkey, entry } = {}) {
    const candidatePubkey =
      typeof pubkey === "string" && pubkey.trim()
        ? pubkey.trim()
        : typeof entry?.pubkey === "string" && entry.pubkey.trim()
          ? entry.pubkey.trim()
          : "";

    if (!candidatePubkey) {
      return { loggedOut: false, reason: "invalid-pubkey" };
    }

    const normalizedTarget =
      this.normalizeHexPubkey(candidatePubkey) || candidatePubkey;
    if (!normalizedTarget) {
      return { loggedOut: false, reason: "invalid-pubkey" };
    }

    const activeNormalized = this.normalizeHexPubkey(getActiveProfilePubkey());
    if (activeNormalized && activeNormalized === normalizedTarget) {
      const detail = await this.requestLogout();
      return {
        loggedOut: true,
        reason: "active-profile",
        active: true,
        detail,
      };
    }

    let removalResult;
    try {
      removalResult = this.authService.removeSavedProfile(candidatePubkey);
    } catch (error) {
      devLogger.error(
        "[Application] Failed to remove saved profile during logout request:",
        error,
      );
      return { loggedOut: false, reason: "remove-failed", error };
    }

    if (!removalResult?.removed) {
      if (removalResult?.error) {
        devLogger.warn(
          "[Application] removeSavedProfile returned an error during logout request:",
          removalResult.error,
        );
      }
      return { loggedOut: false, reason: "not-found" };
    }

    if (
      this.nwcSettingsService &&
      typeof this.nwcSettingsService.clearStoredNwcSettings === "function"
    ) {
      try {
        await this.nwcSettingsService.clearStoredNwcSettings(normalizedTarget, {
          silent: true,
        });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to clear wallet settings for logged-out profile:",
          error,
        );
      }
    }

    this.renderSavedProfiles();

    return { loggedOut: true, removed: true };
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
          await accessControl.waitForReady();
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

  async handleModerationSettingsChange({ settings, skipRefresh = false } = {}) {
    const normalized = this.normalizeModerationSettings(settings);
    this.moderationSettings = normalized;
    const feedContext = {
      feedName: this.feedName || "",
      feedVariant: this.feedVariant || "",
    };

    if (this.videosMap instanceof Map) {
      for (const video of this.videosMap.values()) {
        if (video && typeof video === "object") {
          this.decorateVideoModeration(video, feedContext);
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
          this.decorateVideoModeration(card.video, feedContext);
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
          this.decorateVideoModeration(video, feedContext);
        }
      }
    }

    if (this.currentVideo && typeof this.currentVideo === "object") {
      this.decorateVideoModeration(this.currentVideo, feedContext);
    }

    this.moderationDecorator.updateSettings(normalized);

    if (!skipRefresh) {
      try {
        await this.onVideosShouldRefresh({ reason: "moderation-settings-change" });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh videos after moderation settings change:",
          error,
        );
      }
    }

    return normalized;
  }

  refreshVisibleModerationUi({ reason } = {}) {
    const context = reason ? ` after ${reason}` : "";
    const feedContext = {
      feedName: this.feedName || "",
      feedVariant: this.feedVariant || "",
    };

    const redecorateVideo = (video) => {
      if (!video || typeof video !== "object") {
        return;
      }

      try {
        this.decorateVideoModeration(video, feedContext);
      } catch (error) {
        devLogger.warn(
          `[Application] Failed to decorate video moderation${context}:`,
          error,
        );
      }
    };

    if (this.videosMap instanceof Map) {
      for (const video of this.videosMap.values()) {
        redecorateVideo(video);
      }
    }

    if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
      for (const video of this.videoListView.currentVideos) {
        redecorateVideo(video);
      }
    }

    if (this.videoListView && Array.isArray(this.videoListView.videoCardInstances)) {
      for (const card of this.videoListView.videoCardInstances) {
        if (!card || typeof card !== "object") {
          continue;
        }

        if (card.video && typeof card.video === "object") {
          redecorateVideo(card.video);
        }

        if (typeof card.refreshModerationUi === "function") {
          try {
            card.refreshModerationUi();
          } catch (error) {
            devLogger.warn(
              `[Application] Failed to refresh moderation UI on card${context}:`,
              error,
            );
          }
        }
      }
    }

    if (this.currentVideo && typeof this.currentVideo === "object") {
      redecorateVideo(this.currentVideo);

      try {
        this.videoModal?.refreshActiveVideoModeration?.({ video: this.currentVideo });
      } catch (error) {
        devLogger.warn(
          `[Application] Failed to refresh video modal moderation UI${context}:`,
          error,
        );
      }
    }
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

    const subscriptionsLink = this.resolveSubscriptionsLink();
    if (subscriptionsLink) {
      subscriptionsLink.classList.remove("hidden");
    }

    const forYouLink = this.resolveForYouLink();
    if (forYouLink) {
      forYouLink.classList.remove("hidden");
    }

    const exploreLink = this.resolveExploreLink();
    if (exploreLink) {
      exploreLink.classList.remove("hidden");
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

    const subscriptionsLink = this.resolveSubscriptionsLink();
    if (subscriptionsLink) {
      subscriptionsLink.classList.add("hidden");
    }

    const forYouLink = this.resolveForYouLink();
    if (forYouLink) {
      forYouLink.classList.add("hidden");
    }

    const exploreLink = this.resolveExploreLink();
    if (exploreLink) {
      exploreLink.classList.add("hidden");
    }
  }

  syncAuthUiState() {
    if (this.isUserLoggedIn()) {
      this.applyAuthenticatedUiState();
    } else {
      this.applyLoggedOutUiState();
    }
  }

  refreshChromeElements() {
    const doc = typeof document !== "undefined" ? document : null;
    const findElement = (id) => {
      if (!doc || typeof doc.getElementById !== "function") {
        return null;
      }
      const element = doc.getElementById(id);
      if (!element || typeof element.addEventListener !== "function") {
        return null;
      }
      return element;
    };

    this.loginButton = findElement("loginButton");
    this.logoutButton = findElement("logoutButton");
    this.uploadButton = findElement("uploadButton");
    this.profileButton = findElement("profileButton");
    this.closeLoginModalBtn = findElement("closeLoginModal");

    return {
      loginButton: this.loginButton,
      logoutButton: this.logoutButton,
      uploadButton: this.uploadButton,
      profileButton: this.profileButton,
      closeLoginModalButton: this.closeLoginModalBtn,
    };
  }

  resolveSubscriptionsLink() {
    if (
      this.subscriptionsLink instanceof HTMLElement &&
      this.subscriptionsLink.isConnected
    ) {
      return this.subscriptionsLink;
    }

    const linkCandidate = document.getElementById("subscriptionsLink");
    if (linkCandidate instanceof HTMLElement) {
      this.subscriptionsLink = linkCandidate;
      return this.subscriptionsLink;
    }

    this.subscriptionsLink = null;
    return null;
  }

  resolveForYouLink() {
    if (this.forYouLink instanceof HTMLElement && this.forYouLink.isConnected) {
      return this.forYouLink;
    }

    const linkCandidate = document.getElementById("forYouLink");
    if (linkCandidate instanceof HTMLElement) {
      this.forYouLink = linkCandidate;
      return this.forYouLink;
    }

    this.forYouLink = null;
    return null;
  }

  resolveExploreLink() {
    if (
      this.exploreLink instanceof HTMLElement &&
      this.exploreLink.isConnected
    ) {
      return this.exploreLink;
    }

    const linkCandidate = document.getElementById("exploreLink");
    if (linkCandidate instanceof HTMLElement) {
      this.exploreLink = linkCandidate;
      return this.exploreLink;
    }

    this.exploreLink = null;
    return null;
  }

  hydrateSidebarNavigation() {
    const chromeElements = this.refreshChromeElements();
    this.resolveSubscriptionsLink();
    this.resolveForYouLink();
    this.resolveExploreLink();

    if (this.appChromeController) {
      if (typeof this.appChromeController.setElements === "function") {
        this.appChromeController.setElements(chromeElements);
      } else {
        if (this.appChromeController.elements) {
          Object.assign(this.appChromeController.elements, chromeElements);
        }
        this.appChromeController.initialize();
      }
    }

    this.syncAuthUiState();
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
    this.commentController?.refreshAuthState?.();
    this.updateShareNostrAuthState({ reason: "auth-login" });
    if (typeof this.refreshUnreadDmIndicator === "function") {
      void this.refreshUnreadDmIndicator({ reason: "auth-login" });
    }

    const currentView = getHashViewName();
    const normalizedView =
      typeof currentView === "string" ? currentView.toLowerCase() : "";
    const urlParams = new URLSearchParams(window.location.search);
    const hasVideoParam = urlParams.has("v");

    if (!normalizedView || normalizedView === "most-recent-videos") {
      setHashView("for-you", { preserveVideoParam: hasVideoParam });
    }

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

    try {
      await this.handleModerationSettingsChange({
        settings: getModerationSettings(),
        skipRefresh: true,
      });
    } catch (error) {
      devLogger.warn(
        "Failed to sync moderation settings after login:",
        error,
      );
    }

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
    this.updateShareNostrAuthState({ reason: "auth-logout" });
    if (typeof this.refreshUnreadDmIndicator === "function") {
      void this.refreshUnreadDmIndicator({ reason: "auth-logout" });
    } else if (this.appChromeController?.setUnreadDmIndicator) {
      this.appChromeController.setUnreadDmIndicator(false);
    }

    const logoutView = getHashViewName();
    if (
      typeof logoutView === "string" &&
      logoutView.trim().toLowerCase() === "for-you"
    ) {
      setHashView("most-recent-videos");
    }

    const activeModalVideo =
      typeof this.videoModal?.getCurrentVideo === "function"
        ? this.videoModal.getCurrentVideo()
        : this.commentController?.currentVideo || null;

    if (this.commentController && activeModalVideo) {
      // Regression guard: ensure logout refreshes the modal thread so comments stay visible without reopening.
      this.commentController.load(activeModalVideo);
    } else {
      this.commentController?.refreshAuthState?.();
    }

    try {
      await this.handleModerationSettingsChange({
        settings: getModerationSettings(),
        skipRefresh: true,
      });
    } catch (error) {
      devLogger.warn(
        "Failed to reset moderation settings after logout:",
        error,
      );
    }

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
   *
   * When `preserveModals` is true the modal infrastructure is kept alive so the
   * next playback session can reuse the existing controllers without
   * reinitializing DOM bindings.
   */
  async cleanup({
    preserveSubscriptions = false,
    preserveObservers = false,
    preserveModals = false,
  } = {}) {
    this.log(
      `[cleanup] Requested (preserveSubscriptions=${preserveSubscriptions}, preserveObservers=${preserveObservers}, preserveModals=${preserveModals})`
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
        `[cleanup] Begin (preserveSubscriptions=${preserveSubscriptions}, preserveObservers=${preserveObservers}, preserveModals=${preserveModals})`
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
        if (this.reactionController) {
          this.reactionController.unsubscribe();
        }

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

        this.commentController?.dispose({ resetUi: false });

        if (!preserveModals) {
          if (this.modalManager) {
            try {
              this.modalManager.teardown();
            } catch (error) {
              devLogger.warn("[cleanup] Modal teardown failed:", error);
            }
            this.modalManager = null;
          }

          if (this.bootstrapper) {
            try {
              this.bootstrapper.teardown();
            } catch (error) {
              devLogger.warn("[cleanup] Bootstrap teardown failed:", error);
            }
          }
        }


        // Tell webtorrent to cleanup
        await torrentClient.cleanup();
        this.log("[cleanup] WebTorrent cleanup resolved.");

        try {
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            await fetch("/webtorrent/cancel/", { mode: "no-cors" });
          }
        } catch (err) {
          // Ignore errors when cancelling the service worker stream; it may not be active.
        }
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
    try {
      if (this.videoModal && typeof this.videoModal.resetStats === "function") {
        this.videoModal.resetStats();
      } else {
        devLogger.info(
          "[Application] resetTorrentStats: videoModal.resetStats not available — skipping."
        );
      }
    } catch (err) {
      devLogger.warn("[Application] resetTorrentStats failed", err);
    }
  }


  setShareButtonState(enabled) {
    if (this.videoModal) {
      this.videoModal.setShareEnabled(enabled);
    }
  }

  getShareUrlBase() {
    if (typeof BITVID_WEBSITE_URL === "string" && BITVID_WEBSITE_URL) {
      // Ensure no trailing slash for consistency if desired, though buildShareUrlFromNevent
      // appends ?v=... so trailing slash is fine if URL ctor handles it.
      // BITVID_WEBSITE_URL usually has a trailing slash in config, but let's be safe.
      return BITVID_WEBSITE_URL.replace(/\/$/, "");
    }

    try {
      const current = new URL(window.location.href);
      // If we are in the embed, we want to strip that filename.
      if (current.pathname.endsWith("/embed.html")) {
        return `${current.origin}${current.pathname.replace(/\/embed\.html$/, "")}`;
      }
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
    if (this.reactionController) {
      this.reactionController.unsubscribe();
    }
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
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          await fetch("/webtorrent/cancel/", { mode: "no-cors" });
        }
      } catch (err) {
        devLogger.warn("[hideModal] webtorrent cancel fetch failed:", err);
      }

      await this.cleanup({
        preserveSubscriptions: true,
        preserveObservers: true,
        preserveModals: true,
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

  /**
   * Register the "for-you" feed pipeline.
   */
  registerForYouFeed() {
    if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
      return null;
    }

    const existingDefinition =
      typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("for-you")
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
      return this.feedEngine.registerFeed("for-you", {
        source: createActiveNostrSource({ service: this.nostrService }),
        stages: [
          // Note: Tag-preference filtering is consolidated in createTagPreferenceFilterStage
          // so each feed has a single source of truth for interest-based inclusion/ranking.
          createTagPreferenceFilterStage(),
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
      devLogger.warn("[Application] Failed to register for-you feed:", error);
      return null;
    }
  }

  /**
   * Register the "kids" feed pipeline.
   */
  registerKidsFeed() {
    if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
      return null;
    }

    const existingDefinition =
      typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("kids")
        : null;
    if (existingDefinition) {
      return existingDefinition;
    }

    try {
      const app = this;
      const resolveThresholdFromApp = (key, kidsDefault) => ({
        runtimeValue,
        defaultValue,
      }) => {
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

        if (
          Number.isFinite(kidsDefault) ||
          kidsDefault === Number.POSITIVE_INFINITY
        ) {
          return kidsDefault;
        }

        return defaultValue;
      };

      const kidsDefaults = {
        blurThreshold: 1,
        trustedReportHideThreshold: 1,
        trustedMuteHideThreshold: 1,
      };

      const disallowedWarnings = [
        "nudity",
        "sexual",
        "graphic-violence",
        "self-harm",
        "drugs",
      ];

      const moderationStages = ["nudity", "violence", "self-harm"].map(
        (reportType) =>
          createModerationStage({
            stageName: `kids-moderation-${reportType}`,
            reportType,
            getService: () => this.nostrService.getModerationService(),
            autoplayThreshold: resolveThresholdFromApp("autoplayBlockThreshold"),
            blurThreshold: resolveThresholdFromApp(
              "blurThreshold",
              kidsDefaults.blurThreshold,
            ),
            trustedMuteHideThreshold: resolveThresholdFromApp(
              "trustedMuteHideThreshold",
              kidsDefaults.trustedMuteHideThreshold,
            ),
            trustedReportHideThreshold: resolveThresholdFromApp(
              "trustedSpamHideThreshold",
              kidsDefaults.trustedReportHideThreshold,
            ),
          }),
      );

      return this.feedEngine.registerFeed("kids", {
        source: createActiveNostrSource({ service: this.nostrService }),
        stages: [
          createBlacklistFilterStage({
            shouldIncludeVideo: (video, options) =>
              this.nostrService.shouldIncludeVideo(video, options),
          }),
          createKidsAudienceFilterStage({
            disallowedWarnings,
          }),
          ...moderationStages,
          createResolvePostedAtStage(),
          createDedupeByRootStage({
            dedupe: (videos) => this.dedupeVideosByRoot(videos),
          }),
          createKidsScorerStage(),
        ],
        sorter: createKidsScoreSorter(),
        defaultConfig: {
          ageGroup: "preschool",
          educationalTags: [],
          disallowedWarnings,
        },
        configSchema: {
          ageGroup: {
            type: "enum",
            values: ["toddler", "preschool", "early", "older"],
            description: "Target age group used for kids scoring defaults.",
            default: "preschool",
          },
          educationalTags: {
            type: "string[]",
            description: "Optional educational tag overrides for kids scoring.",
            default: [],
          },
          disallowedWarnings: {
            type: "string[]",
            description:
              "Content warnings that should exclude videos from the kids feed.",
            default: disallowedWarnings,
          },
        },
        hooks: {
          timestamps: {
            getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
            resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
          },
        },
      });
    } catch (error) {
      devLogger.warn("[Application] Failed to register kids feed:", error);
      return null;
    }
  }

  /**
   * Register the "explore" feed pipeline.
   */
  registerExploreFeed() {
    if (!this.feedEngine || typeof this.feedEngine.registerFeed !== "function") {
      return null;
    }

    const existingDefinition =
      typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("explore")
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
      return this.feedEngine.registerFeed("explore", {
        source: createActiveNostrSource({ service: this.nostrService }),
        stages: [
          createDisinterestFilterStage(),
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
          createExploreScorerStage(),
        ],
        sorter: createExploreDiversitySorter(),
        hooks: {
          timestamps: {
            getKnownVideoPostedAt: (video) => this.getKnownVideoPostedAt(video),
            resolveVideoPostedAt: (video) => this.resolveVideoPostedAt(video),
          },
        },
      });
    } catch (error) {
      devLogger.warn("[Application] Failed to register explore feed:", error);
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
          // Note: Tag-preference filtering is consolidated in createTagPreferenceFilterStage
          // so each feed has a single source of truth for interest-based inclusion/ranking.
          createTagPreferenceFilterStage(),
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

  buildForYouFeedRuntime() {
    const blacklist =
      this.blacklistedEventIds instanceof Set
        ? new Set(this.blacklistedEventIds)
        : new Set();

    const preferenceSource =
      this.hashtagPreferencesSnapshot &&
      typeof this.hashtagPreferencesSnapshot === "object"
        ? this.hashtagPreferencesSnapshot
        : typeof this.createHashtagPreferencesSnapshot === "function"
        ? this.createHashtagPreferencesSnapshot()
        : typeof this.getHashtagPreferences === "function"
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

  buildExploreFeedRuntime() {
    const exploreDataService =
      this.exploreDataService && typeof this.exploreDataService === "object"
        ? this.exploreDataService
        : null;
    const blacklist =
      this.blacklistedEventIds instanceof Set
        ? new Set(this.blacklistedEventIds)
        : new Set();

    const preferenceSource =
      this.hashtagPreferencesSnapshot &&
      typeof this.hashtagPreferencesSnapshot === "object"
        ? this.hashtagPreferencesSnapshot
        : typeof this.createHashtagPreferencesSnapshot === "function"
        ? this.createHashtagPreferencesSnapshot()
        : typeof this.getHashtagPreferences === "function"
        ? this.getHashtagPreferences()
        : {};
    const { interests = [], disinterests = [] } = preferenceSource || {};
    const moderationThresholds = this.getActiveModerationThresholds();

    const watchHistorySource =
      exploreDataService && typeof exploreDataService.getWatchHistoryTagCounts === "function"
        ? exploreDataService.getWatchHistoryTagCounts()
        : this.watchHistoryTagCounts;
    const watchHistoryTagCounts =
      watchHistorySource instanceof Map
        ? new Map(watchHistorySource)
        : watchHistorySource && typeof watchHistorySource === "object"
        ? { ...watchHistorySource }
        : undefined;

    const exploreTagSource =
      exploreDataService && typeof exploreDataService.getTagIdf === "function"
        ? exploreDataService.getTagIdf()
        : this.exploreTagIdf;
    const exploreTagIdf =
      exploreTagSource instanceof Map
        ? new Map(exploreTagSource)
        : exploreTagSource && typeof exploreTagSource === "object"
        ? { ...exploreTagSource }
        : undefined;

    return {
      blacklistedEventIds: blacklist,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      tagPreferences: {
        interests: Array.isArray(interests) ? [...interests] : [],
        disinterests: Array.isArray(disinterests) ? [...disinterests] : [],
      },
      watchHistoryTagCounts,
      exploreTagIdf,
      moderationThresholds: moderationThresholds
        ? { ...moderationThresholds }
        : undefined,
    };
  }

  buildRecentFeedRuntime() {
    const blacklist =
      this.blacklistedEventIds instanceof Set
        ? new Set(this.blacklistedEventIds)
        : new Set();

    const moderationThresholds = this.getActiveModerationThresholds();

    return {
      blacklistedEventIds: blacklist,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      moderationThresholds: moderationThresholds
        ? { ...moderationThresholds }
        : undefined,
    };
  }

  buildKidsFeedRuntime() {
    const blacklist =
      this.blacklistedEventIds instanceof Set
        ? new Set(this.blacklistedEventIds)
        : new Set();

    const feedDefinition =
      this.feedEngine && typeof this.feedEngine.getFeedDefinition === "function"
        ? this.feedEngine.getFeedDefinition("kids")
        : null;
    const configDefaults =
      feedDefinition && typeof feedDefinition.configDefaults === "object"
        ? feedDefinition.configDefaults
        : {};

    const runtimeOverrides =
      this.kidsFeedRuntime && typeof this.kidsFeedRuntime === "object"
        ? this.kidsFeedRuntime
        : {};
    const runtimeConfig =
      this.kidsFeedConfig && typeof this.kidsFeedConfig === "object"
        ? this.kidsFeedConfig
        : {};

    const resolveStringArray = (...candidates) => {
      for (const candidate of candidates) {
        if (!Array.isArray(candidate)) {
          continue;
        }
        return candidate
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean);
      }
      return [];
    };

    const disallowedWarnings = resolveStringArray(
      runtimeOverrides.disallowedWarnings,
      runtimeConfig.disallowedWarnings,
      configDefaults.disallowedWarnings,
    );
    const kidsEducationalTags = resolveStringArray(
      runtimeOverrides.kidsEducationalTags,
      runtimeOverrides.educationalTags,
      runtimeConfig.kidsEducationalTags,
      runtimeConfig.educationalTags,
      configDefaults.educationalTags,
    );
    const trustedAuthors = resolveStringArray(
      runtimeOverrides.trustedAuthors,
      runtimeConfig.trustedAuthors,
    );

    const ageGroupCandidates = [
      runtimeOverrides.ageGroup,
      runtimeConfig.ageGroup,
      configDefaults.ageGroup,
    ];
    let ageGroup = "";
    for (const candidate of ageGroupCandidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        ageGroup = trimmed;
        break;
      }
    }

    const runtimeModerationOverrides =
      runtimeOverrides.moderationThresholds &&
      typeof runtimeOverrides.moderationThresholds === "object"
        ? runtimeOverrides.moderationThresholds
        : null;
    const configModerationOverrides =
      runtimeConfig.moderationThresholds &&
      typeof runtimeConfig.moderationThresholds === "object"
        ? runtimeConfig.moderationThresholds
        : null;
    const kidsThresholdOverrides =
      runtimeModerationOverrides || configModerationOverrides
        ? {
            ...(configModerationOverrides || {}),
            ...(runtimeModerationOverrides || {}),
          }
        : null;

    const moderationThresholds = this.getActiveModerationThresholds();
    const resolvedModerationThresholds =
      moderationThresholds || kidsThresholdOverrides
        ? {
            ...(moderationThresholds || {}),
            ...(kidsThresholdOverrides || {}),
          }
        : undefined;

    const parentalAllowlist = resolveStringArray(
      runtimeOverrides.parentalAllowlist,
      runtimeOverrides.allowlist,
      runtimeConfig.parentalAllowlist,
      runtimeConfig.allowlist,
    );
    const parentalBlocklist = resolveStringArray(
      runtimeOverrides.parentalBlocklist,
      runtimeOverrides.blocklist,
      runtimeConfig.parentalBlocklist,
      runtimeConfig.blocklist,
    );

    return {
      blacklistedEventIds: blacklist,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      disallowedWarnings,
      kidsEducationalTags,
      educationalTags: kidsEducationalTags,
      trustedAuthors,
      ageGroup: ageGroup || undefined,
      moderationThresholds: resolvedModerationThresholds,
      parentalAllowlist,
      parentalBlocklist,
    };
  }

  refreshForYouFeed({ reason, fallbackVideos } = {}) {
    const runtime = this.buildForYouFeedRuntime();
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
      this.updateForYouTelemetryMetadata([], metadata);
      this.renderVideoList({ videos: fallback, metadata });
      return Promise.resolve({ videos: fallback, metadata });
    }

    return this.feedEngine
      .run("for-you", { runtime })
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

        const items = Array.isArray(result?.items) ? result.items : [];
        this.updateForYouTelemetryMetadata(items, metadata);

        const payload = { videos, metadata };
        this.renderVideoList(payload);
        return payload;
      })
      .catch((error) => {
        devLogger.error("[Application] Failed to run for-you feed:", error);
        const metadata = {
          reason: normalizedReason || "error:for-you-feed",
          error: true,
        };
        this.latestFeedMetadata = metadata;
        this.videosMap = this.nostrService.getVideosMap();
        if (this.videoListView) {
          this.videoListView.state.videosMap = this.videosMap;
        }
        this.updateForYouTelemetryMetadata([], metadata);
        const payload = { videos: fallback, metadata };
        this.renderVideoList(payload);
        return payload;
      });
  }

  refreshKidsFeed({ reason, fallbackVideos } = {}) {
    const runtime = this.buildKidsFeedRuntime();
    const normalizedReason = typeof reason === "string" ? reason : undefined;
    const fallback = Array.isArray(fallbackVideos) ? fallbackVideos : [];

    if (!this.feedEngine || typeof this.feedEngine.run !== "function") {
      const metadata = {
        reason: normalizedReason,
        engine: "unavailable",
      };
      if (runtime?.ageGroup && !metadata.ageGroup) {
        metadata.ageGroup = runtime.ageGroup;
      }
      this.latestFeedMetadata = metadata;
      this.videosMap = this.nostrService.getVideosMap();
      if (this.videoListView) {
        this.videoListView.state.videosMap = this.videosMap;
      }
      this.updateFeedTelemetryMetadata("kids", [], metadata);
      this.renderVideoList({ videos: fallback, metadata });
      return Promise.resolve({ videos: fallback, metadata });
    }

    return this.feedEngine
      .run("kids", { runtime })
      .then((result) => {
        const videos = Array.isArray(result?.videos) ? result.videos : [];
        const metadata = {
          ...(result?.metadata || {}),
        };
        if (normalizedReason) {
          metadata.reason = normalizedReason;
        }
        if (runtime?.ageGroup && !metadata.ageGroup) {
          metadata.ageGroup = runtime.ageGroup;
        }

        this.latestFeedMetadata = metadata;
        this.videosMap = this.nostrService.getVideosMap();
        if (this.videoListView) {
          this.videoListView.state.videosMap = this.videosMap;
        }

        const items = Array.isArray(result?.items) ? result.items : [];
        this.updateFeedTelemetryMetadata("kids", items, metadata);

        const payload = { videos, metadata };
        this.renderVideoList(payload);
        return payload;
      })
      .catch((error) => {
        devLogger.error("[Application] Failed to run kids feed:", error);
        const metadata = {
          reason: normalizedReason || "error:kids-feed",
          error: true,
        };
        if (runtime?.ageGroup && !metadata.ageGroup) {
          metadata.ageGroup = runtime.ageGroup;
        }
        this.latestFeedMetadata = metadata;
        this.videosMap = this.nostrService.getVideosMap();
        if (this.videoListView) {
          this.videoListView.state.videosMap = this.videosMap;
        }
        this.updateFeedTelemetryMetadata("kids", [], metadata);
        const payload = { videos: fallback, metadata };
        this.renderVideoList(payload);
        return payload;
      });
  }

  refreshExploreFeed({ reason, fallbackVideos } = {}) {
    const runtime = this.buildExploreFeedRuntime();
    const normalizedReason = typeof reason === "string" ? reason : undefined;
    const fallback = Array.isArray(fallbackVideos) ? fallbackVideos : [];
    const applyExploreOrderingMetadata = (source) => {
      const next = source && typeof source === "object" ? { ...source } : {};
      if (!next.sortOrder) {
        next.sortOrder = "explore";
      }
      next.preserveOrder = true;
      return next;
    };

    if (!this.feedEngine || typeof this.feedEngine.run !== "function") {
      const metadata = applyExploreOrderingMetadata({
        reason: normalizedReason,
        engine: "unavailable",
      });
      this.latestFeedMetadata = metadata;
      this.videosMap = this.nostrService.getVideosMap();
      if (this.videoListView) {
        this.videoListView.state.videosMap = this.videosMap;
      }
      this.renderVideoList({ videos: fallback, metadata });
      return Promise.resolve({ videos: fallback, metadata });
    }

    return this.feedEngine
      .run("explore", { runtime })
      .then((result) => {
        const videos = Array.isArray(result?.videos) ? result.videos : [];
        const metadata = applyExploreOrderingMetadata({
          ...(result?.metadata || {}),
          ...(normalizedReason ? { reason: normalizedReason } : {}),
        });

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
        devLogger.error("[Application] Failed to run explore feed:", error);
        const metadata = applyExploreOrderingMetadata({
          reason: normalizedReason || "error:explore-feed",
          error: true,
        });
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
    this.setFeedTelemetryContext("recent");

    const container = this.mountVideoListView();
    const hasCachedVideos =
      this.nostrService &&
      Array.isArray(this.nostrService.getFilteredActiveVideos()) &&
      this.nostrService.getFilteredActiveVideos().length > 0;

    if (!hasCachedVideos) {
      if (this.videoListView && container) {
        this.videoListView.showLoading("Fetching recent videos…");
      } else if (container) {
        container.innerHTML = getSidebarLoadingMarkup("Fetching recent videos…");
      }
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

  async loadForYouVideos(forceFetch = false) {
    devLogger.log("Starting loadForYouVideos... (forceFetch =", forceFetch, ")");
    this.setFeedTelemetryContext("for-you");

    const container = this.mountVideoListView({ includeTags: false });
    const hasCachedVideos =
      this.nostrService &&
      Array.isArray(this.nostrService.getFilteredActiveVideos()) &&
      this.nostrService.getFilteredActiveVideos().length > 0;

    if (!hasCachedVideos) {
      if (this.videoListView && container) {
        this.videoListView.showLoading("Fetching for-you videos…");
      } else if (container) {
        container.innerHTML = getSidebarLoadingMarkup("Fetching for-you videos…");
      }
    }

    let initialRefreshPromise = null;

    const videos = await this.nostrService.loadVideos({
      forceFetch,
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      onVideos: (payload, detail = {}) => {
        const promise = this.refreshForYouFeed({
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
      await this.refreshForYouFeed({ reason: "initial", fallbackVideos: [] });
    }

    this.videoSubscription = this.nostrService.getVideoSubscription() || null;
    this.videosMap = this.nostrService.getVideosMap();
    if (this.videoListView) {
      this.videoListView.state.videosMap = this.videosMap;
    }
  }

  async loadKidsVideos(forceFetch = false) {
    devLogger.log("Starting loadKidsVideos... (forceFetch =", forceFetch, ")");
    this.setFeedTelemetryContext("kids");

    const container = this.mountVideoListView({ includeTags: true });
    const hasCachedVideos =
      this.nostrService &&
      Array.isArray(this.nostrService.getFilteredActiveVideos()) &&
      this.nostrService.getFilteredActiveVideos().length > 0;

    if (!hasCachedVideos) {
      if (this.videoListView && container) {
        this.videoListView.showLoading("Fetching kids videos…");
      } else if (container) {
        container.innerHTML = getSidebarLoadingMarkup("Fetching kids videos…");
      }
    }

    let initialRefreshPromise = null;

    const videos = await this.nostrService.loadVideos({
      forceFetch,
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      onVideos: (payload, detail = {}) => {
        const promise = this.refreshKidsFeed({
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
      await this.refreshKidsFeed({ reason: "initial", fallbackVideos: [] });
    }

    this.videoSubscription = this.nostrService.getVideoSubscription() || null;
    this.videosMap = this.nostrService.getVideosMap();
    if (this.videoListView) {
      this.videoListView.state.videosMap = this.videosMap;
    }
  }

  async loadExploreVideos(forceFetch = false) {
    devLogger.log("Starting loadExploreVideos... (forceFetch =", forceFetch, ")");
    this.setFeedTelemetryContext("explore");

    const container = this.mountVideoListView({ includeTags: false });
    const hasCachedVideos =
      this.nostrService &&
      Array.isArray(this.nostrService.getFilteredActiveVideos()) &&
      this.nostrService.getFilteredActiveVideos().length > 0;

    if (!hasCachedVideos) {
      if (this.videoListView && container) {
        this.videoListView.showLoading("Fetching explore videos…");
      } else if (container) {
        container.innerHTML = getSidebarLoadingMarkup("Fetching explore videos…");
      }
    }

    let initialRefreshPromise = null;

    const videos = await this.nostrService.loadVideos({
      forceFetch,
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      onVideos: (payload, detail = {}) => {
        const promise = this.refreshExploreFeed({
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
      await this.refreshExploreFeed({ reason: "initial", fallbackVideos: [] });
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
    return this.urlHealthController.getUrlHealthPlaceholderMarkup(options);
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
    return this.urlHealthController.updateUrlHealthBadge(badgeEl, state, videoId);
  }

  handleUrlHealthBadge(payload) {
    return this.urlHealthController.handleUrlHealthBadge(payload);
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

  getFeedTelemetryState(feedName = "") {
    if (!this.feedTelemetryState || typeof this.feedTelemetryState !== "object") {
      this.feedTelemetryState = {
        activeFeed: "",
        feeds: new Map(),
      };
    }

    if (!(this.feedTelemetryState.feeds instanceof Map)) {
      this.feedTelemetryState.feeds = new Map();
    }

    const normalized =
      typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
    if (!normalized) {
      return null;
    }

    if (this.feedTelemetryState.feeds.has(normalized)) {
      return this.feedTelemetryState.feeds.get(normalized);
    }

    const state = {
      matchedTagsById: new Map(),
      matchReasonsById: new Map(),
      kidsScoreById: new Map(),
      moderationById: new Map(),
      ageGroup: "",
      lastImpressionSignature: "",
      activePlayback: null,
    };
    this.feedTelemetryState.feeds.set(normalized, state);
    return state;
  }

  setFeedTelemetryContext(feedName = "") {
    const normalized =
      typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
    const previousFeed = this.feedTelemetryState?.activeFeed || "";
    if (previousFeed && previousFeed !== normalized) {
      const previousState = this.getFeedTelemetryState(previousFeed);
      if (previousState) {
        previousState.lastImpressionSignature = "";
        previousState.activePlayback = null;
      }
    }

    const nextState = this.getFeedTelemetryState(normalized);
    if (previousFeed !== normalized && nextState) {
      nextState.lastImpressionSignature = "";
      nextState.activePlayback = null;
    }

    this.feedTelemetryState.activeFeed = normalized;
  }

  isFeedActive(feedName = "") {
    const normalized =
      typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
    return Boolean(normalized && this.feedTelemetryState?.activeFeed === normalized);
  }

  isForYouFeedActive() {
    return this.feedTelemetryState?.activeFeed === "for-you";
  }

  updateFeedTelemetryMetadata(feedName = "", items = [], metadata = {}) {
    if (!this.isFeedActive(feedName)) {
      return;
    }

    const feedState = this.getFeedTelemetryState(feedName);
    if (!feedState) {
      return;
    }

    const matchedTagsById = new Map();
    const matchReasonsById = new Map();
    const kidsScoreById = new Map();
    const moderationById = new Map();

    if (Array.isArray(items)) {
      items.forEach((item) => {
        const videoId =
          typeof item?.video?.id === "string" ? item.video.id : "";
        if (!videoId) {
          return;
        }
        const matched =
          Array.isArray(item?.metadata?.matchedInterests)
            ? item.metadata.matchedInterests
            : [];
        matchedTagsById.set(videoId, matched);

        const kidsScoreRaw = Number(item?.metadata?.kidsScore);
        if (Number.isFinite(kidsScoreRaw)) {
          kidsScoreById.set(videoId, kidsScoreRaw);
        }

        const moderationPayload = this.buildModerationTelemetry(item?.video);
        if (moderationPayload) {
          moderationById.set(videoId, moderationPayload);
        }
      });
    }

    const whyEntries = Array.isArray(metadata?.why) ? metadata.why : [];
    whyEntries.forEach((entry) => {
      if (!entry || entry.reason !== "matched-interests") {
        return;
      }
      const videoId = typeof entry.videoId === "string" ? entry.videoId : "";
      if (!videoId) {
        return;
      }
      const reasons = matchReasonsById.get(videoId) || [];
      reasons.push({
        stage: typeof entry.stage === "string" ? entry.stage : "",
        reason: entry.reason,
      });
      matchReasonsById.set(videoId, reasons);
    });

    const ageGroup =
      typeof metadata?.ageGroup === "string" ? metadata.ageGroup.trim() : "";

    feedState.matchedTagsById = matchedTagsById;
    feedState.matchReasonsById = matchReasonsById;
    feedState.kidsScoreById = kidsScoreById;
    feedState.moderationById = moderationById;
    feedState.ageGroup = ageGroup;
  }

  updateForYouTelemetryMetadata(items = [], metadata = {}) {
    this.updateFeedTelemetryMetadata("for-you", items, metadata);
  }

  resolveVideoForTelemetry(videoId) {
    if (typeof videoId !== "string" || !videoId) {
      return null;
    }

    if (this.videosMap instanceof Map && this.videosMap.has(videoId)) {
      return this.videosMap.get(videoId) || null;
    }

    if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
      return this.videoListView.currentVideos.find((video) => video?.id === videoId) || null;
    }

    return null;
  }

  resolveVideoIndex(videoId) {
    if (!this.videoListView || !Array.isArray(this.videoListView.currentVideos)) {
      return null;
    }

    const index = this.videoListView.currentVideos.findIndex(
      (video) => video?.id === videoId,
    );
    return index >= 0 ? index : null;
  }

  buildModerationTelemetry(video) {
    if (!video || typeof video !== "object") {
      return null;
    }

    const moderation =
      video.moderation && typeof video.moderation === "object"
        ? video.moderation
        : null;
    if (!moderation) {
      return null;
    }

    const payload = {
      hidden: moderation.hidden === true,
      blurThumbnail: moderation.blurThumbnail === true,
      blockAutoplay: moderation.blockAutoplay === true,
      viewerOverride: moderation.viewerOverride?.showAnyway === true,
      trustedMuted: moderation.trustedMuted === true,
    };

    const reportType =
      typeof moderation.reportType === "string" ? moderation.reportType : "";
    if (reportType) {
      payload.reportType = reportType;
    }

    return payload;
  }

  buildFeedTelemetryPayload(feedName = "", { video, videoId, position } = {}) {
    if (!this.isFeedActive(feedName)) {
      return null;
    }

    const feedState = this.getFeedTelemetryState(feedName);
    if (!feedState) {
      return null;
    }

    const eventId =
      typeof videoId === "string" && videoId
        ? videoId
        : typeof video?.id === "string"
          ? video.id
          : "";
    if (!eventId) {
      return null;
    }

    const payload = {
      feed: feedName,
      eventId,
      videoId: eventId,
    };

    if (feedName === "for-you") {
      const matchedTagsRaw = feedState.matchedTagsById?.get(eventId) || [];
      const matchedTags = Array.isArray(matchedTagsRaw)
        ? Array.from(
            new Set(
              matchedTagsRaw
                .filter((tag) => typeof tag === "string")
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
          )
        : [];

      const whyRaw = feedState.matchReasonsById?.get(eventId) || [];
      const why = Array.isArray(whyRaw)
        ? whyRaw.map((entry) => ({
            stage: typeof entry.stage === "string" ? entry.stage : "",
            reason: typeof entry.reason === "string" ? entry.reason : "",
          }))
        : [];

      payload.matchedTags = matchedTags;
      payload.why = why;
    }

    const ageGroup =
      typeof feedState.ageGroup === "string" ? feedState.ageGroup : "";
    if (ageGroup) {
      payload.ageGroup = ageGroup;
    }

    const kidsScore = feedState.kidsScoreById?.get(eventId);
    if (Number.isFinite(kidsScore)) {
      payload.kidsScore = kidsScore;
    }

    const moderationPayload =
      this.buildModerationTelemetry(video) || feedState.moderationById?.get(eventId);
    if (moderationPayload) {
      payload.moderation = moderationPayload;
    }

    const videoRootId =
      typeof video?.videoRootId === "string" ? video.videoRootId : "";
    if (videoRootId) {
      payload.videoRootId = videoRootId;
    }

    const pubkey = typeof video?.pubkey === "string" ? video.pubkey : "";
    if (pubkey) {
      payload.pubkey = pubkey;
    }

    if (Number.isFinite(position)) {
      payload.position = Math.max(0, Math.floor(position));
    }

    return payload;
  }

  buildForYouTelemetryPayload({ video, videoId, position } = {}) {
    return this.buildFeedTelemetryPayload("for-you", {
      video,
      videoId,
      position,
    });
  }

  emitTelemetryEvent(eventName, payload) {
    if (!eventName || !payload) {
      return false;
    }

    const doc =
      (this.videoModal && this.videoModal.document) ||
      (typeof document !== "undefined" ? document : null);

    if (!doc || typeof doc.dispatchEvent !== "function") {
      return false;
    }

    try {
      doc.dispatchEvent(
        new CustomEvent("bitvid:telemetry", {
          detail: { event: eventName, payload },
        }),
      );
      return true;
    } catch (error) {
      userLogger.warn("[Application] Failed to emit telemetry event:", error);
      return false;
    }
  }

  resolveFeedTelemetryEventName(feedName = "", suffix = "") {
    const normalized =
      typeof feedName === "string" ? feedName.trim().toLowerCase() : "";
    if (!normalized || !suffix) {
      return "";
    }

    const prefixMap = new Map([
      ["for-you", "for_you"],
      ["kids", "kids_feed"],
    ]);

    const prefix = prefixMap.get(normalized);
    if (!prefix) {
      return "";
    }

    return `${prefix}_${suffix}`;
  }

  emitFeedTelemetryEvent(
    feedName = "",
    eventName = "",
    { video, videoId, position } = {},
  ) {
    const payload = this.buildFeedTelemetryPayload(feedName, {
      video,
      videoId,
      position,
    });
    if (!payload) {
      return false;
    }

    return this.emitTelemetryEvent(eventName, payload);
  }

  emitForYouTelemetryEvent(eventName, { video, videoId, position } = {}) {
    const payload = this.buildForYouTelemetryPayload({
      video,
      videoId,
      position,
    });
    if (!payload) {
      return false;
    }

    return this.emitTelemetryEvent(eventName, payload);
  }

  emitFeedImpressions(videos = [], { feedName } = {}) {
    const normalized =
      typeof feedName === "string"
        ? feedName.trim().toLowerCase()
        : this.feedTelemetryState?.activeFeed || "";
    if (!normalized || !Array.isArray(videos)) {
      return;
    }

    const feedState = this.getFeedTelemetryState(normalized);
    if (!feedState) {
      return;
    }

    const signature = videos
      .map((video) => (typeof video?.id === "string" ? video.id : ""))
      .filter(Boolean)
      .join("|");

    if (signature && signature === feedState.lastImpressionSignature) {
      return;
    }

    feedState.lastImpressionSignature = signature;

    const eventName = this.resolveFeedTelemetryEventName(normalized, "impression");
    if (!eventName) {
      return;
    }

    videos.forEach((video, index) => {
      this.emitFeedTelemetryEvent(normalized, eventName, {
        video,
        videoId: video?.id,
        position: index,
      });
    });
  }

  emitForYouImpressions(videos = []) {
    this.emitFeedImpressions(videos, { feedName: "for-you" });
  }

  recordFeedClick(videoId, { feedName } = {}) {
    const normalized =
      typeof feedName === "string"
        ? feedName.trim().toLowerCase()
        : this.feedTelemetryState?.activeFeed || "";
    if (!normalized || !videoId) {
      return;
    }

    const feedState = this.getFeedTelemetryState(normalized);
    if (!feedState) {
      return;
    }

    const eventName = this.resolveFeedTelemetryEventName(normalized, "click");
    if (!eventName) {
      return;
    }

    const video = this.resolveVideoForTelemetry(videoId);
    const position = this.resolveVideoIndex(videoId);

    feedState.activePlayback = {
      feed: normalized,
      videoId,
    };

    this.emitFeedTelemetryEvent(normalized, eventName, {
      video,
      videoId,
      position,
    });
  }

  recordForYouClick(videoId) {
    this.recordFeedClick(videoId, { feedName: "for-you" });
  }

  handleFeedViewTelemetry(detail = {}) {
    const activeFeed = this.feedTelemetryState?.activeFeed || "";
    if (!activeFeed) {
      return;
    }

    const feedState = this.getFeedTelemetryState(activeFeed);
    if (!feedState) {
      return;
    }

    const activePlayback = feedState.activePlayback;
    if (!activePlayback || activePlayback.feed !== activeFeed) {
      return;
    }

    const currentVideoId =
      typeof this.currentVideo?.id === "string"
        ? this.currentVideo.id
        : activePlayback.videoId;
    if (!currentVideoId || currentVideoId !== activePlayback.videoId) {
      return;
    }

    const pointerKey =
      typeof detail?.pointerKey === "string" ? detail.pointerKey : "";
    if (activePlayback.pointerKey && pointerKey) {
      if (activePlayback.pointerKey !== pointerKey) {
        return;
      }
    }

    const video = this.resolveVideoForTelemetry(currentVideoId);
    const payload = this.buildFeedTelemetryPayload(activeFeed, {
      video,
      videoId: currentVideoId,
    });
    if (!payload) {
      return;
    }

    if (pointerKey) {
      payload.pointerKey = pointerKey;
    }

    const eventName = this.resolveFeedTelemetryEventName(activeFeed, "watch");
    if (!eventName) {
      return;
    }

    this.emitTelemetryEvent(eventName, payload);
    feedState.activePlayback = null;
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
      ? videos.map((video) => {
          const moderated = this.decorateVideoModeration(video);
          const targetVideo =
            moderated && typeof moderated === "object" ? moderated : video;
          const withIdentity = this.decorateVideoCreatorIdentity(targetVideo);
          return withIdentity && typeof withIdentity === "object"
            ? withIdentity
            : targetVideo;
        })
      : [];

    this.videoListView.render(decoratedVideos, metadata);
    this.emitFeedImpressions(decoratedVideos);

    if (typeof this.refreshVisibleModerationUi === "function") {
      const renderReason =
        metadata && typeof metadata.reason === "string" && metadata.reason
          ? `render-${metadata.reason}`
          : "render-video-list";
      try {
        this.refreshVisibleModerationUi({ reason: renderReason });
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to refresh moderation UI after rendering video list:",
          error,
        );
      }
    }
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
    return this.moderationDecorator.deriveModerationReportType(summary);
  }

  deriveModerationTrustedCount(summary, reportType) {
    return this.moderationDecorator.deriveModerationTrustedCount(summary, reportType);
  }

  getReporterDisplayName(pubkey) {
    return this.moderationDecorator.getReporterDisplayName(pubkey);
  }

  normalizeModerationSettings(settings = null) {
    return this.moderationDecorator.normalizeModerationSettings(settings);
  }

  getActiveModerationThresholds() {
    this.moderationSettings = this.moderationDecorator.normalizeModerationSettings(this.moderationSettings);
    return { ...this.moderationSettings };
  }

  decorateVideoModeration(video, feedContext = {}) {
    const decorated = this.moderationDecorator.decorateVideo(video, feedContext);
    if (
      video &&
      video.pubkey &&
      this.isAuthorBlocked(video.pubkey) &&
      decorated &&
      decorated.moderation
    ) {
      decorated.moderation.viewerMuted = true;
      decorated.moderation.hidden = true;
      decorated.moderation.hideReason = "viewer-block";
    }
    return decorated;
  }

  initializeModerationActionController() {
    if (this.moderationActionController) {
      return this.moderationActionController;
    }

    this.moderationActionController = new ModerationActionController({
      services: {
        setModerationOverride,
        clearModerationOverride,
        userBlocks,
      },
      selectors: {
        getVideoById: (id) =>
          this.videosMap instanceof Map && id ? this.videosMap.get(id) : null,
        getCurrentVideo: () => this.currentVideo,
      },
      actions: {
        decorateVideoModeration: (video) => this.decorateVideoModeration(video),
        resumePlayback: (video) => this.resumePendingModeratedPlayback(video),
        refreshVideos: (payload) => this.onVideosShouldRefresh(payload),
        showStatus: (message, options) => this.showStatus(message, options),
        showError: (message) => this.showError(message),
        describeBlockError: (error) => this.describeUserBlockActionError(error),
      },
      auth: {
        isLoggedIn: () => this.isUserLoggedIn(),
        getViewerPubkey: () => this.pubkey,
        normalizePubkey: (value) => this.normalizeHexPubkey(value),
      },
      ui: {
        refreshCardModerationUi: (card, options) =>
          this.refreshCardModerationUi(card, options),
        dispatchModerationEvent: (eventName, detail) =>
          this.dispatchModerationEvent(eventName, detail),
      },
    });

    return this.moderationActionController;
  }

  refreshCardModerationUi(card, { reason } = {}) {
    if (!card || typeof card.refreshModerationUi !== "function") {
      return false;
    }

    try {
      card.refreshModerationUi();
      return true;
    } catch (error) {
      const suffix = reason ? ` ${reason}` : "";
      devLogger.warn(
        `[Application] Failed to refresh moderation UI${suffix}:`,
        error,
      );
      return false;
    }
  }

  dispatchModerationEvent(eventName, detail = {}) {
    const doc =
      (this.videoModal && this.videoModal.document) ||
      (typeof document !== "undefined" ? document : null);

    if (!doc || typeof doc.dispatchEvent !== "function") {
      return false;
    }

    try {
      doc.dispatchEvent(new CustomEvent(eventName, { detail }));
      return true;
    } catch (error) {
      const eventLabels = {
        "video:moderation-override": "moderation override event",
        "video:moderation-block": "moderation block event",
        "video:moderation-hide": "moderation hide event",
      };
      const label = eventLabels[eventName] || eventName;
      devLogger.warn(`[Application] Failed to dispatch ${label}:`, error);
      return false;
    }
  }

  handleModerationOverride(payload = {}) {
    const controller = this.initializeModerationActionController();
    if (!controller) {
      return false;
    }

    return controller.handleOverride(payload);
  }

  async handleModerationBlock(payload = {}) {
    const controller = this.initializeModerationActionController();
    if (!controller) {
      return false;
    }

    return controller.handleBlock(payload);
  }

  handleModerationHide(payload = {}) {
    const controller = this.initializeModerationActionController();
    if (!controller) {
      return false;
    }

    return controller.handleHide(payload);
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
        const relay =
          Array.isArray(decoded.data.relays) && decoded.data.relays.length
            ? decoded.data.relays[0]
            : null;
        // 1) check local map
        let localMatch = this.videosMap.get(eventId);
        if (localMatch) {
          this.playVideoByEventId(eventId, { relay });
        } else {
          // 2) fallback => getOldEventById
          this.getOldEventById(eventId)
            .then((video) => {
              if (video) {
                this.playVideoByEventId(eventId, { relay });
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

  async probeUrlWithVideoElement(url, timeoutMs) {
    return this.urlHealthController.probeUrlWithVideoElement(url, timeoutMs);
  }

  async probeUrl(url, options = {}) {
    return this.urlHealthController.probeUrl(url, options);
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
    const { url = "", magnet = "", trigger, forcedSource } = options || {};

    emit("playback-decision", {
      method: forcedSource || (magnet ? "webtorrent" : "url"), // heuristic
      details: {
        url: Boolean(url),
        magnet: Boolean(magnet),
        forcedSource,
      },
    });

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
      forcedSource,
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
      forcedSource,
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
    // this.setCopyMagnetState(!!magnetForPlayback); // Removed

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

    emit("playback-started", {
      method: result.source,
      details: { startedAt: Date.now() },
    });

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
      await accessControl.waitForReady();
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

    const normalizedCreatorPubkey =
      this.normalizeHexPubkey(video.pubkey) || video.pubkey;
    const cachedCreatorProfileEntry =
      normalizedCreatorPubkey && typeof this.getProfileCacheEntry === "function"
        ? this.getProfileCacheEntry(normalizedCreatorPubkey)
        : null;
    const cachedCreatorProfile =
      cachedCreatorProfileEntry &&
      typeof cachedCreatorProfileEntry === "object"
        ? cachedCreatorProfileEntry.profile || null
        : null;
    const initialLightningAddress =
      typeof video.lightningAddress === "string"
        ? video.lightningAddress.trim()
        : "";

    this.currentVideo = {
      ...video,
      url: trimmedUrl,
      magnet: sanitizedMagnet,
      originalMagnet:
        magnetCandidate || fallbackMagnetForCandidate || legacyInfoHash || "",
      torrentSupported: magnetSupported,
      legacyInfoHash: video.legacyInfoHash || legacyInfoHash,
      lightningAddress: initialLightningAddress || null,
      lastEditedAt: normalizedEditedAt,
    };

    this.decorateVideoModeration(this.currentVideo);

    const modalTags = collectVideoTags(this.currentVideo);
    this.currentVideo.displayTags = modalTags;
    const creatorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
    const displayNpub = formatShortNpub(creatorNpub) || creatorNpub;
    const initialCreatorProfile = this.resolveModalCreatorProfile({
      video: this.currentVideo,
      pubkey: normalizedCreatorPubkey,
      cachedProfile: cachedCreatorProfile,
    });
    this.currentVideo.creatorName = initialCreatorProfile.name;
    this.currentVideo.creatorPicture = initialCreatorProfile.picture;
    this.currentVideo.creatorNpub = displayNpub;
    if (this.currentVideo.creator && typeof this.currentVideo.creator === "object") {
      this.currentVideo.creator = {
        ...this.currentVideo.creator,
        name: initialCreatorProfile.name,
        picture: initialCreatorProfile.picture,
        pubkey: normalizedCreatorPubkey,
      };
    } else {
      this.currentVideo.creator = {
        name: initialCreatorProfile.name,
        picture: initialCreatorProfile.picture,
        pubkey: normalizedCreatorPubkey,
      };
    }
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
      relay: hint.relay || video.relay,
    });

    this.currentVideoPointer = pointerInfo?.pointer || null;
    this.currentVideoPointerKey = pointerInfo?.key || null;

    if (this.currentVideo) {
      this.currentVideo.pointer = this.currentVideoPointer;
      this.currentVideo.pointerKey = this.currentVideoPointerKey;
    }

    const forYouState = this.getFeedTelemetryState("for-you");
    if (
      forYouState?.activePlayback?.feed === "for-you" &&
      forYouState.activePlayback.videoId === eventId
    ) {
      forYouState.activePlayback.pointerKey = this.currentVideoPointerKey || null;
    }

    this.subscribeModalViewCount(
      this.currentVideoPointer,
      this.currentVideoPointerKey
    );
    this.reactionController.subscribe(
      this.currentVideoPointer,
      this.currentVideoPointerKey
    );
    this.syncModalMoreMenuData();

    this.currentMagnetUri = sanitizedMagnet || null;

    // this.setCopyMagnetState(!!sanitizedMagnet); // Removed
    // this.setShareButtonState(true); // Moved to after showModalWithPoster

    const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
    const pushUrl =
      this.buildShareUrlFromNevent(nevent) ||
      `${this.getShareUrlBase() || window.location.pathname}?v=${encodeURIComponent(
        nevent
      )}`;
    window.history.pushState({}, "", pushUrl);

    this.zapController?.resetState();
    this.zapController?.setVisibility(Boolean(this.currentVideo.lightningAddress));

    const magnetInput =
      sanitizedMagnet ||
      decodedMagnetCandidate ||
      magnetCandidate ||
      fallbackMagnetForCandidate ||
      legacyInfoHash ||
      "";

    await this.showModalWithPoster(this.currentVideo);

    this.setShareButtonState(true);

    this.commentController?.load(this.currentVideo);

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

    if (this.videoModal) {
      const timestampPayload = this.buildModalTimestampPayload({
        postedAt: this.currentVideo?.rootCreatedAt ?? null,
        editedAt: normalizedEditedAt,
      });
      this.videoModal.updateMetadata({
        title: video.title || "Untitled",
        description: video.description || "No description available.",
        timestamps: timestampPayload,
        tags: modalTags,
        creator: {
          name: initialCreatorProfile.name,
          avatarUrl: initialCreatorProfile.picture,
          npub: displayNpub,
        },
      });
    }

    const profileRequestToken = Symbol("modal-profile-request");
    this.modalCreatorProfileRequestToken = profileRequestToken;
    this.fetchModalCreatorProfile({
      pubkey: normalizedCreatorPubkey,
      displayNpub,
      cachedProfile: cachedCreatorProfile,
      requestToken: profileRequestToken,
    }).catch((error) => {
      devLogger.error(
        "[Application] Failed to fetch creator profile for modal:",
        error,
      );
    });

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
      const abs = formatAbsoluteDateWithOrdinalUtil(normalizedEditedAt);
      const rel = this.formatTimeAgo(normalizedEditedAt);
      payload.edited = `Last edited: ${abs} (${rel})`;
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

    // Prioritize NIP-71 published_at metadata if available
    const rawNip71PublishedAt =
      video?.nip71?.publishedAt ||
      video?.nip71?.published_at ||
      video?.nip71?.["published-at"];
    const parsedNip71PublishedAt = Number(rawNip71PublishedAt);
    const nip71PublishedAt = Number.isFinite(parsedNip71PublishedAt)
      ? Math.floor(parsedNip71PublishedAt)
      : null;

    if (nip71PublishedAt !== null) {
      this.cacheVideoRootCreatedAt(video, nip71PublishedAt);
      return nip71PublishedAt;
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
    this.reactionController.subscribe(null, null);
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

    // this.setCopyMagnetState(!!sanitizedMagnet);
    // this.setShareButtonState(false);

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

    this.setShareButtonState(false);

    this.commentController?.load(null);

    const shareUrl = this.buildShareUrlFromEventId(this.currentVideo.id);
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

  selectPreferredCreatorName(candidates = []) {
    for (const candidate of candidates) {
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
      return trimmed;
    }
    return "";
  }

  selectPreferredCreatorPicture(candidates = []) {
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const sanitized = sanitizeProfileMediaUrl(candidate);
      if (sanitized) {
        return sanitized;
      }
    }
    return "";
  }

  resolveCreatorProfileFromSources({
    video,
    pubkey,
    cachedProfile = null,
    fetchedProfile = null,
    fallbackAvatar,
  } = {}) {
    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    const fallbackAvatarCandidate =
      typeof fallbackAvatar === "string" && fallbackAvatar.trim()
        ? fallbackAvatar.trim()
        : normalizedPubkey
          ? `https://robohash.org/${normalizedPubkey}`
          : "assets/svg/default-profile.svg";
    const defaultAvatar =
      sanitizeProfileMediaUrl(fallbackAvatarCandidate) ||
      fallbackAvatarCandidate ||
      "assets/svg/default-profile.svg";

    const nameCandidates = [];
    const pictureCandidates = [];

    const collectFromSource = (source) => {
      if (!source || typeof source !== "object") {
        return;
      }
      const names = [
        source.display_name,
        source.displayName,
        source.name,
        source.username,
      ];
      names.forEach((value) => {
        if (typeof value === "string") {
          nameCandidates.push(value);
        }
      });
      const pictures = [source.picture, source.image, source.photo];
      pictures.forEach((value) => {
        if (typeof value === "string") {
          pictureCandidates.push(value);
        }
      });
    };

    collectFromSource(fetchedProfile);
    collectFromSource(cachedProfile);

    if (video && typeof video === "object") {
      collectFromSource(video.creator);
      if (typeof video.creatorName === "string") {
        nameCandidates.push(video.creatorName);
      }
      if (typeof video.creatorPicture === "string") {
        pictureCandidates.push(video.creatorPicture);
      }
      collectFromSource(video.author);
      if (typeof video.authorName === "string") {
        nameCandidates.push(video.authorName);
      }
      if (typeof video.authorPicture === "string") {
        pictureCandidates.push(video.authorPicture);
      }
      collectFromSource(video.profile);
      const extraNames = [
        video.shortNpub,
        video.creatorNpub,
        video.npub,
        video.authorNpub,
      ];
      extraNames.forEach((value) => {
        if (typeof value === "string") {
          nameCandidates.push(value);
        }
      });
    }

    const resolvedName =
      this.selectPreferredCreatorName(nameCandidates) || "Unknown";
    const resolvedPicture =
      this.selectPreferredCreatorPicture(pictureCandidates) || defaultAvatar;

    return { name: resolvedName, picture: resolvedPicture };
  }

  resolveModalCreatorProfile({
    video,
    pubkey,
    cachedProfile = null,
    fetchedProfile = null,
  } = {}) {
    return this.resolveCreatorProfileFromSources({
      video,
      pubkey,
      cachedProfile,
      fetchedProfile,
    });
  }

  decorateVideoCreatorIdentity(video) {
    if (!video || typeof video !== "object") {
      return video;
    }

    const normalizedPubkey =
      this.normalizeHexPubkey(video.pubkey) ||
      (typeof video.pubkey === "string" ? video.pubkey.trim() : "");
    if (!normalizedPubkey) {
      return video;
    }

    let cachedProfile = null;
    if (typeof this.getProfileCacheEntry === "function") {
      const cacheEntry = this.getProfileCacheEntry(normalizedPubkey);
      if (cacheEntry && typeof cacheEntry === "object") {
        cachedProfile = cacheEntry.profile || null;
      }
    }

    const resolvedProfile = this.resolveCreatorProfileFromSources({
      video,
      pubkey: normalizedPubkey,
      cachedProfile,
    });

    if (!video.creator || typeof video.creator !== "object") {
      video.creator = {};
    }

    if (!video.creator.pubkey) {
      video.creator.pubkey = normalizedPubkey;
    }

    if (resolvedProfile.name) {
      video.creator.name = resolvedProfile.name;
      if (
        typeof video.creatorName !== "string" ||
        !video.creatorName.trim() ||
        video.creatorName === "Unknown"
      ) {
        video.creatorName = resolvedProfile.name;
      }
      if (
        typeof video.authorName !== "string" ||
        !video.authorName.trim() ||
        video.authorName === "Unknown"
      ) {
        video.authorName = resolvedProfile.name;
      }
    }

    if (resolvedProfile.picture) {
      video.creator.picture = resolvedProfile.picture;
      video.creatorPicture = resolvedProfile.picture;
      if (
        typeof video.authorPicture !== "string" ||
        !video.authorPicture.trim()
      ) {
        video.authorPicture = resolvedProfile.picture;
      }
    }

    const encodedNpub = this.safeEncodeNpub(normalizedPubkey);
    if (encodedNpub) {
      const shortNpub = formatShortNpub(encodedNpub) || encodedNpub;
      if (typeof video.npub !== "string" || !video.npub.trim()) {
        video.npub = encodedNpub;
      }
      if (typeof video.shortNpub !== "string" || !video.shortNpub.trim()) {
        video.shortNpub = shortNpub;
      }
      if (
        typeof video.creatorNpub !== "string" ||
        !video.creatorNpub.trim()
      ) {
        video.creatorNpub = shortNpub;
      }
    }

    return video;
  }

  async fetchModalCreatorProfile({
    pubkey,
    displayNpub = "",
    cachedProfile = null,
    requestToken = null,
  } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return;
    }

    const relayList =
      Array.isArray(nostrClient?.relays) && nostrClient.relays.length
        ? nostrClient.relays
        : null;
    if (!relayList || !nostrClient?.pool || typeof nostrClient.pool.list !== "function") {
      return;
    }

    const events = await nostrClient.pool.list(relayList, [
      { kinds: [0], authors: [normalized], limit: 1 },
    ]);

    if (this.modalCreatorProfileRequestToken !== requestToken) {
      return;
    }

    const newest = Array.isArray(events)
      ? events.reduce((latest, event) => {
          if (!event || typeof event !== "object") {
            return latest;
          }
          const eventPubkey = this.normalizeHexPubkey(event.pubkey);
          if (eventPubkey && eventPubkey !== normalized) {
            return latest;
          }
          const createdAt = Number.isFinite(event.created_at) ? event.created_at : 0;
          if (!latest || createdAt > latest.createdAt) {
            return { createdAt, event };
          }
          return latest;
        }, null)
      : null;

    if (!newest || !newest.event) {
      if (this.modalCreatorProfileRequestToken === requestToken) {
        this.modalCreatorProfileRequestToken = null;
      }
      return;
    }

    let parsed = null;
    try {
      parsed = newest.event.content ? JSON.parse(newest.event.content) : null;
    } catch (error) {
      devLogger.warn(
        `[Application] Failed to parse creator profile content for ${normalized}:`,
        error,
      );
      if (this.modalCreatorProfileRequestToken === requestToken) {
        this.modalCreatorProfileRequestToken = null;
      }
      return;
    }

    if (this.modalCreatorProfileRequestToken !== requestToken) {
      return;
    }

    const parsedLud16 =
      typeof parsed?.lud16 === "string" ? parsed.lud16.trim() : "";
    const parsedLud06 =
      typeof parsed?.lud06 === "string" ? parsed.lud06.trim() : "";
    const lightningAddressCandidate = (() => {
      const fields = [parsedLud16, parsedLud06];
      for (const field of fields) {
        if (typeof field !== "string") {
          continue;
        }
        const trimmed = field.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return "";
    })();

    const fetchedProfile = {
      display_name: parsed?.display_name,
      name: parsed?.name,
      username: parsed?.username,
      picture: parsed?.picture,
      image: parsed?.image,
      photo: parsed?.photo,
    };

    const resolvedProfile = this.resolveModalCreatorProfile({
      video: this.currentVideo,
      pubkey: normalized,
      cachedProfile,
      fetchedProfile,
    });

    if (this.modalCreatorProfileRequestToken !== requestToken) {
      return;
    }

    const activeVideoPubkey = this.normalizeHexPubkey(this.currentVideo?.pubkey);
    if (activeVideoPubkey && activeVideoPubkey !== normalized) {
      return;
    }

    const nextLightning = lightningAddressCandidate || "";
    const previousLightning =
      typeof this.currentVideo?.lightningAddress === "string"
        ? this.currentVideo.lightningAddress
        : "";

    if (this.currentVideo) {
      this.currentVideo.lightningAddress = nextLightning ? nextLightning : null;
      this.currentVideo.creatorName = resolvedProfile.name;
      this.currentVideo.creatorPicture = resolvedProfile.picture;
      this.currentVideo.creatorNpub = displayNpub;
      if (this.currentVideo.creator && typeof this.currentVideo.creator === "object") {
        this.currentVideo.creator = {
          ...this.currentVideo.creator,
          name: resolvedProfile.name,
          picture: resolvedProfile.picture,
          pubkey: normalized,
          lightningAddress: nextLightning ? nextLightning : null,
        };
      } else {
        this.currentVideo.creator = {
          name: resolvedProfile.name,
          picture: resolvedProfile.picture,
          pubkey: normalized,
          lightningAddress: nextLightning ? nextLightning : null,
        };
      }
    }

    if (this.videoModal) {
      this.videoModal.updateMetadata({
        creator: {
          name: resolvedProfile.name,
          avatarUrl: resolvedProfile.picture,
          npub: displayNpub,
        },
      });
    }

    this.zapController?.setVisibility(Boolean(this.currentVideo?.lightningAddress));

    const sanitizedFetchedPicture = sanitizeProfileMediaUrl(
      parsed?.picture || parsed?.image || parsed?.photo || "",
    );
    const fetchedNameCandidate = this.selectPreferredCreatorName([
      parsed?.display_name,
      parsed?.name,
      parsed?.username,
    ]);

    const cachedLightning =
      typeof cachedProfile?.lightningAddress === "string"
        ? cachedProfile.lightningAddress.trim()
        : "";
    const shouldUpdateCache =
      Boolean(fetchedNameCandidate) ||
      Boolean(sanitizedFetchedPicture) ||
      cachedLightning !== nextLightning ||
      previousLightning !== nextLightning;

    if (shouldUpdateCache) {
      try {
        const profileForCache = {
          name: fetchedNameCandidate || resolvedProfile.name,
          picture: sanitizedFetchedPicture || resolvedProfile.picture,
        };

        if (parsedLud16) {
          profileForCache.lud16 = parsedLud16;
        }

        if (parsedLud06) {
          profileForCache.lud06 = parsedLud06;
        }

        if (nextLightning) {
          profileForCache.lightningAddress = nextLightning;
        }

        this.setProfileCacheEntry(
          normalized,
          profileForCache,
          { persist: false, reason: "modal-profile-fetch" },
        );
      } catch (error) {
        devLogger.warn(
          `[Application] Failed to update profile cache for ${normalized}:`,
          error,
        );
      }
    }

    if (this.modalCreatorProfileRequestToken === requestToken) {
      this.modalCreatorProfileRequestToken = null;
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
    const video = payload?.video || null;
    const videoId = typeof video?.id === "string" ? video.id.trim() : "";
    const videoTitle =
      typeof video?.title === "string" ? video.title.trim() : "";
    const videoPubkey =
      typeof video?.pubkey === "string" ? video.pubkey.trim() : "";

    if (!videoId || !videoTitle) {
      userLogger.warn("[Application] Share post missing video details.");
      this.showError("Missing video details for sharing.");
      throw new Error("share-missing-video-details");
    }

    const signer = getActiveSigner();
    if (!signer || typeof signer.signEvent !== "function") {
      userLogger.warn("[Application] No active signer available for share.");
      this.showError("Connect a Nostr signer to share.");
      throw new Error("share-missing-signer");
    }

    const activePubkey = this.normalizeHexPubkey(this.pubkey);
    const signerPubkey = this.normalizeHexPubkey(signer.pubkey);
    const eventPubkey = activePubkey || signerPubkey;

    if (!eventPubkey) {
      userLogger.warn("[Application] Share post missing active pubkey.");
      this.showError("Please log in to share on Nostr.");
      throw new Error("share-missing-pubkey");
    }

    if (activePubkey && signerPubkey && activePubkey !== signerPubkey) {
      userLogger.error(
        "[Application] Active signer does not match current account for share.",
      );
      this.showError("Active signer does not match your account.");
      throw new Error("share-signer-mismatch");
    }

    if (!nostrClient?.pool) {
      userLogger.error("[Application] Share publish failed: relays not ready.");
      this.showError("Nostr relays are not ready yet. Please try again.");
      throw new Error("share-relays-unavailable");
    }

    const relayEntries = Array.isArray(payload?.relays) ? payload.relays : [];
    const relayUrls = relayEntries
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (Array.isArray(entry) && entry.length) {
          if (entry[0] === "r") {
            return typeof entry[1] === "string" ? entry[1] : "";
          }
          return typeof entry[0] === "string" ? entry[0] : "";
        }
        if (entry && typeof entry === "object") {
          if (typeof entry.url === "string") {
            return entry.url;
          }
          if (typeof entry.relay === "string") {
            return entry.relay;
          }
        }
        return "";
      })
      .filter(Boolean);
    const relayTargets = sanitizeRelayList(relayUrls);

    if (!relayTargets.length) {
      userLogger.warn("[Application] Share post missing relay targets.");
      this.showError("Please choose at least one relay to share to.");
      throw new Error("share-missing-relays");
    }

    if (signer.type === "extension" && nostrClient.ensureExtensionPermissions) {
      const permissionResult = await nostrClient.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
      if (!permissionResult?.ok) {
        userLogger.warn(
          "[Application] Share publish blocked by signer permissions.",
          permissionResult?.error,
        );
        this.showError("Signer permissions are required to post.");
        throw new Error("share-permission-denied");
      }
    }

    const event = buildShareEvent({
      pubkey: eventPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: typeof payload?.content === "string" ? payload.content : "",
      video: { id: videoId, pubkey: videoPubkey },
      relays: relayEntries,
    });

    let signedEvent;
    try {
      signedEvent = await queueSignEvent(signer, event);
    } catch (error) {
      userLogger.error("[Application] Failed to sign share event.", error);
      this.showError("Unable to sign the share event.");
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
        context: "share note",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[Application] Relay ${url} rejected share note: ${reason}`,
              relayError || reason,
            );
          },
        );
      }
      this.showError("Failed to share on Nostr. Please try again.");
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
          `[Application] Relay ${url} did not accept share note: ${reason}`,
          relayError,
        );
      });
    }

    userLogger.info(
      "[Application] Share note published.",
      publishSummary.accepted.map(({ url }) => url),
    );
    this.showSuccess("Shared to Nostr!");

    return {
      ok: true,
      event: signedEvent,
      accepted: publishSummary.accepted.map(({ url }) => url),
      failed: publishSummary.failed.map(({ url }) => url),
    };
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
    const targetVideo =
      video && typeof video === "object" ? video : this.currentVideo || null;
    if (!targetVideo) {
      this.showError("No video is available to share.");
      return;
    }

    if (!this.shareNostrModal) {
      devLogger.warn("[Application] Share Nostr modal is unavailable.");
      this.showError("Share modal is not ready yet.");
      return;
    }

    const shareUrl =
      typeof targetVideo.shareUrl === "string" && targetVideo.shareUrl.trim()
        ? targetVideo.shareUrl.trim()
        : this.buildShareUrlFromEventId(targetVideo.id);
    const payload = {
      id: targetVideo.id,
      title: targetVideo.title,
      pubkey: targetVideo.pubkey,
      authorName: targetVideo.creatorName || targetVideo.authorName || "",
      thumbnail: targetVideo.thumbnail,
      shareUrl,
    };

    try {
      await this.shareNostrModal.open({
        video: payload,
        triggerElement,
      });
    } catch (error) {
      devLogger.error("[Application] Failed to open Share Nostr modal:", error);
      this.showError("Unable to open the share modal.");
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
