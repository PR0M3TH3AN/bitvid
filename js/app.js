// js/app.js

import { loadView } from "./viewManager.js";
import {
  nostrClient,
  normalizePointerInput,
  pointerKey as derivePointerKey,
} from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode, ADMIN_SUPER_NPUB } from "./config.js";
import { accessControl, normalizeNpub } from "./accessControl.js";
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
import watchHistoryService from "./watchHistoryService.js";
import r2Service from "./services/r2Service.js";
import PlaybackService from "./services/playbackService.js";
import AuthService from "./services/authService.js";
import nostrService from "./services/nostrService.js";
import { initQuickR2Upload } from "./r2-quick.js";
import { createWatchHistoryRenderer } from "./historyView.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import {
  initViewCounter,
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  formatViewCount,
  ingestLocalViewEvent,
} from "./viewCounter.js";
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

function pointerArrayToKey(pointer) {
  if (!Array.isArray(pointer) || pointer.length < 2) {
    return "";
  }

  const type = pointer[0] === "a" ? "a" : pointer[0] === "e" ? "e" : "";
  if (!type) {
    return "";
  }

  const value =
    typeof pointer[1] === "string" ? pointer[1].trim().toLowerCase() : "";
  if (!value) {
    return "";
  }

  const relay =
    pointer.length > 2 && typeof pointer[2] === "string"
      ? pointer[2].trim()
      : "";

  return relay ? `${type}:${value}:${relay}` : `${type}:${value}`;
}

/**
 * Simple "decryption" placeholder for private videos.
 */
function fakeDecrypt(str) {
  return str.split("").reverse().join("");
}

const UNSUPPORTED_BTITH_MESSAGE =
  "This magnet link is missing a compatible BitTorrent v1 info hash.";

const FALLBACK_THUMBNAIL_SRC = "assets/jpg/video-thumbnail-fallback.jpg";
const ADMIN_DM_IMAGE_URL =
  "https://beta.bitvid.network/assets/jpg/video-thumbnail-fallback.jpg";
const BITVID_WEBSITE_URL = "https://bitvid.network/";
const MAX_DISCUSSION_COUNT_VIDEOS = 24;
const VIDEO_EVENT_KIND = 30078;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;
/**
 * Basic validation for BitTorrent magnet URIs.
 *
 * Returns `true` only when the value looks like a magnet link that WebTorrent
 * understands (`magnet:` scheme with at least one `xt=urn:btih:<info-hash>`
 * entry, where `<info-hash>` is either a 40-character hex digest or a
 * 32-character base32 digest). Magnets that only contain BitTorrent v2 hashes
 * (e.g. `btmh`) are treated as unsupported.
 */
function isValidMagnetUri(magnet) {
  const trimmed = typeof magnet === "string" ? magnet.trim() : "";
  if (!trimmed) {
    return false;
  }

  const decoded = safeDecodeMagnet(trimmed);
  const candidate = decoded || trimmed;

  if (/^[0-9a-f]{40}$/i.test(candidate)) {
    return true;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol.toLowerCase() !== "magnet:") {
      return false;
    }

    const xtValues = parsed.searchParams.getAll("xt");
    if (!xtValues.length) {
      return false;
    }

    const hexPattern = /^[0-9a-f]{40}$/i;
    const base32Pattern = /^[A-Z2-7]{32}$/;

    return xtValues.some((value) => {
      if (typeof value !== "string") return false;
      const match = value.trim().match(/^urn:btih:([a-z0-9]+)$/i);
      if (!match) return false;

      const infoHash = match[1];
      if (hexPattern.test(infoHash)) {
        return true;
      }

      const upperHash = infoHash.toUpperCase();
      return infoHash.length === 32 && base32Pattern.test(upperHash);
    });
  } catch (err) {
    return false;
  }
}

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
class MediaLoader {
  constructor(rootMargin = "50px") {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target;
            const lazySrc =
              typeof el.dataset.lazy === "string"
                ? el.dataset.lazy.trim()
                : "";

            if (lazySrc) {
              const fallbackSrc =
                (typeof el.dataset.fallbackSrc === "string"
                  ? el.dataset.fallbackSrc.trim()
                  : "") ||
                el.getAttribute("data-fallback-src") ||
                "";

              const applyFallback = () => {
                const resolvedFallback =
                  fallbackSrc && fallbackSrc.trim()
                    ? fallbackSrc.trim()
                    : FALLBACK_THUMBNAIL_SRC;

                if (!resolvedFallback) {
                  return;
                }

                if (el.src !== resolvedFallback) {
                  el.src = resolvedFallback;
                }

                if (!el.dataset.fallbackSrc) {
                  el.dataset.fallbackSrc = resolvedFallback;
                }

                if (!el.getAttribute("data-fallback-src")) {
                  el.setAttribute("data-fallback-src", resolvedFallback);
                }

                el.dataset.thumbnailFailed = "true";
              };

              const cleanupListeners = () => {
                el.removeEventListener("error", handleError);
                el.removeEventListener("load", handleLoad);
              };

              const handleError = () => {
                cleanupListeners();
                applyFallback();
              };

              const handleLoad = () => {
                cleanupListeners();
                if (
                  (el.naturalWidth === 0 && el.naturalHeight === 0) ||
                  !el.currentSrc
                ) {
                  applyFallback();
                } else {
                  delete el.dataset.thumbnailFailed;
                }
              };

              el.addEventListener("error", handleError);
              el.addEventListener("load", handleLoad);

              if (fallbackSrc && lazySrc === fallbackSrc) {
                cleanupListeners();
                delete el.dataset.thumbnailFailed;
              } else {
                el.src = lazySrc;

                if (el.complete) {
                  // Handle cached results synchronously
                  if (el.naturalWidth === 0 && el.naturalHeight === 0) {
                    handleError();
                  } else {
                    handleLoad();
                  }
                }
              }
            }

            delete el.dataset.lazy;
            // Stop observing once loaded
            this.observer.unobserve(el);
          }
        }
      },
      { rootMargin }
    );
  }

  observe(el) {
    if (!el || typeof el.dataset === "undefined") {
      return;
    }

    if (!el.dataset.fallbackSrc) {
      const fallbackAttr =
        el.getAttribute("data-fallback-src") || el.getAttribute("src") || "";
      if (fallbackAttr) {
        el.dataset.fallbackSrc = fallbackAttr;
      } else if (el.tagName === "IMG") {
        el.dataset.fallbackSrc = FALLBACK_THUMBNAIL_SRC;
        el.setAttribute("data-fallback-src", FALLBACK_THUMBNAIL_SRC);
      }
    }

    if (
      el.tagName === "IMG" &&
      typeof HTMLImageElement !== "undefined" &&
      "loading" in HTMLImageElement.prototype
    ) {
      el.loading = el.loading || "lazy";
      if ("decoding" in HTMLImageElement.prototype) {
        el.decoding = el.decoding || "async";
      }
    }

    const lazySrc =
      typeof el.dataset.lazy === "string" ? el.dataset.lazy.trim() : "";
    if (lazySrc) {
      this.observer.observe(el);
    }
  }

  disconnect() {
    this.observer.disconnect();
  }
}

class bitvidApp {
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

  constructor() {
    // Basic auth/display elements
    this.loginButton = document.getElementById("loginButton") || null;
    this.logoutButton = document.getElementById("logoutButton") || null;
    this.userStatus = document.getElementById("userStatus") || null;
    this.userPubKey = document.getElementById("userPubKey") || null;

    // Lazy-loading helper for images
    this.mediaLoader = new MediaLoader();
    this.loadedThumbnails = new Map();
    this.videoDiscussionCountCache = new Map();
    this.inFlightDiscussionCounts = new Map();
    this.activeIntervals = [];
    this.watchHistoryMetadataEnabled = null;
    this.watchHistoryPreferenceUnsubscribe = null;

    this.playbackService = new PlaybackService({
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
    this.activePlaybackSession = null;

    this.authService = new AuthService({
      nostrClient,
      userBlocks,
      relayManager,
      logger: (message, ...args) => this.log(message, ...args),
    });
    this.authService.on("auth:login", (detail) => this.handleAuthLogin(detail));
    this.authService.on("auth:logout", (detail) => this.handleAuthLogout(detail));
    this.authService.on("profile:updated", (detail) =>
      this.handleProfileUpdated(detail)
    );

    // Optional: a "profile" button or avatar (if used)
    this.profileButton = document.getElementById("profileButton") || null;
    this.profileAvatar = document.getElementById("profileAvatar") || null;

    // Profile modal references (if used in profile-modal.html)
    this.profileModal = null;
    this.closeProfileModal = null;
    this.profileLogoutBtn = null;
    this.profileModalAvatar = null;
    this.profileModalName = null;
    this.profileModalNpub = null;
    this.profileChannelLink = null;
    this.profileNavButtons = {
      account: null,
      relays: null,
      blocked: null,
      history: null,
      admin: null,
    };
    this.profilePaneElements = {
      account: null,
      relays: null,
      blocked: null,
      history: null,
      admin: null,
    };
    this.profileRelayList = null;
    this.profileBlockedList = null;
    this.profileBlockedEmpty = null;
    this.profileBlockedInput = null;
    this.profileAddBlockedBtn = null;
    this.profileRelayInput = null;
    this.profileAddRelayBtn = null;
    this.profileRestoreRelaysBtn = null;
    this.profileHistoryRenderer = null;
    this.activeProfilePane = null;
    this.adminModeratorInput = null;
    this.adminAddModeratorBtn = null;
    this.adminModeratorList = null;
    this.adminModeratorsEmpty = null;
    this.adminModeratorsSection = null;
    this.adminWhitelistInput = null;
    this.adminAddWhitelistBtn = null;
    this.adminWhitelistList = null;
    this.adminWhitelistEmpty = null;
    this.adminWhitelistSection = null;
    this.adminBlacklistInput = null;
    this.adminAddBlacklistBtn = null;
    this.adminBlacklistList = null;
    this.adminBlacklistEmpty = null;
    this.adminBlacklistSection = null;
    this.lastFocusedBeforeProfileModal = null;
    this.boundProfileModalKeydown = null;
    this.boundProfileModalFocusIn = null;
    this.boundProfileHistoryVisibility = null;
    this.profileModalFocusables = [];
    this.profileSwitcherList = null;
    this.profileAddAccountBtn = null;
    this.profileSwitcherSelectionPubkey = null;
    this.currentUserNpub = null;

    // Upload modal component
    this.uploadButton = document.getElementById("uploadButton") || null;
    this.r2Service = r2Service;
    const uploadModalEvents = new EventTarget();
    this.uploadModal = new UploadModal({
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
    this.uploadModal.addEventListener("upload:submit", (event) => {
      this.handleUploadSubmitEvent(event);
    });

    const editModalEvents = new EventTarget();
    this.editModal = new EditModal({
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

    this.editModal.addEventListener("video:edit-submit", async (event) => {
      const detail = event?.detail || {};
      const { originalEvent, updatedData } = detail;
      if (!originalEvent || !updatedData) {
        return;
      }

      if (!this.pubkey) {
        this.showError("Please login to edit videos.");
        return;
      }

      try {
        await nostrService.handleEditVideoSubmit({
          originalEvent,
          updatedData,
          pubkey: this.pubkey,
        });
        await this.loadVideos();
        this.videosMap.clear();
        this.showSuccess("Video updated successfully!");
        this.editModal.close();
        this.forceRefreshAllProfiles();
      } catch (error) {
        console.error("Failed to edit video:", error);
        this.showError("Failed to edit video. Please try again.");
      }
    });

    this.editModal.addEventListener("video:edit-cancel", () => {
      this.showError("");
    });

    this.revertModal = new RevertModal({
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

    this.revertModal.addEventListener("video:revert-confirm", (event) => {
      this.handleRevertModalConfirm(event);
    });


    // Optional small inline player stats
    this.status = document.getElementById("status") || null;
    this.progressBar = document.getElementById("progress") || null;
    this.peers = document.getElementById("peers") || null;
    this.speed = document.getElementById("speed") || null;
    this.downloaded = document.getElementById("downloaded") || null;

    this.cleanupPromise = null;

    this.videoModal = new VideoModal({
      removeTrackingScripts,
      setGlobalModalState,
      document,
      logger: {
        log: (message, ...args) => this.log(message, ...args),
      },
    });
    this.videoModal.addEventListener("modal:close", () => {
      this.hideModal();
    });
    this.videoModal.addEventListener("video:copy-magnet", () => {
      this.handleCopyMagnet();
    });
    this.videoModal.addEventListener("video:share", () => {
      this.shareActiveVideo();
    });
    this.videoModal.addEventListener("creator:navigate", () => {
      this.openCreatorChannel();
    });
    this.videoModal.addEventListener("video:zap", () => {
      window.alert("Zaps coming soon.");
    });

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
    this.videoSubscription = nostrService.getVideoSubscription() || null;
    this.videoList = null;
    this.modalViewCountUnsub = null;

    // Videos stored as a Map (key=event.id)
    this.videosMap = nostrService.getVideosMap();
    nostrService.on("subscription:changed", ({ subscription }) => {
      this.videoSubscription = subscription || null;
    });
    this.moreMenuGlobalHandlerBound = false;
    this.boundMoreMenuDocumentClick = null;
    this.boundMoreMenuDocumentKeydown = null;
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

    this.videoListView = new VideoListView({
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
    });

    this.videoListView.setPlaybackHandler(({ videoId, url, magnet }) => {
      if (videoId) {
        Promise.resolve(this.playVideoByEventId(videoId)).catch((error) => {
          console.error("[VideoListView] Failed to play by event id:", error);
        });
        return;
      }
      Promise.resolve(this.playVideoWithFallback({ url, magnet })).catch(
        (error) => {
          console.error("[VideoListView] Failed to start playback:", error);
        }
      );
    });

    this.videoListView.setEditHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      this.handleEditVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
      });
    });

    this.videoListView.setRevertHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      this.handleRevertVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
      });
    });

    this.videoListView.setDeleteHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      this.handleFullDeleteVideo({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
      });
    });

    this.videoListView.setBlacklistHandler(({ video, dataset }) => {
      const detail = {
        ...(dataset || {}),
        author: dataset?.author || video?.pubkey || "",
      };
      this.handleMoreMenuAction("blacklist-author", detail);
    });

    this.videoListView.addEventListener("video:share", (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.eventId || detail.dataset?.eventId || detail.video?.id || "",
        context: detail.dataset?.context || "card",
      };
      this.handleMoreMenuAction(detail.action || "copy-link", dataset);
    });

    this.videoListView.addEventListener("video:context-action", (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.dataset?.eventId || detail.video?.id || "",
      };
      this.handleMoreMenuAction(detail.action, dataset);
    });

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
          "[bitvidApp] Invalid nevent in blacklist:",
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

  async init() {
    try {
      // Force update of any registered service workers to ensure latest code is used.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => registration.update());
        });
      }

      this.authService.hydrateFromStorage();
      this.renderSavedProfiles();

      // 1. Initialize the video modal (components/video-modal.html)
      await this.videoModal.load();
      const modalRoot = this.videoModal.getRoot();
      if (modalRoot) {
        this.attachMoreMenuHandlers(modalRoot);
      }

      // 2. Initialize the upload modal (components/upload-modal.html)
      try {
        await this.uploadModal.load();
      } catch (error) {
        console.error("initUploadModal failed:", error);
        this.showError(`Failed to initialize upload modal: ${error.message}`);
      }
      initQuickR2Upload(this);

      // 2.5 Initialize the edit modal (components/edit-video-modal.html)
      try {
        await this.editModal.load();
      } catch (error) {
        console.error("Failed to load edit modal:", error);
        this.showError(`Failed to initialize edit modal: ${error.message}`);
      }

      // 3. (Optional) Initialize the profile modal (components/profile-modal.html)
      await this.initProfileModal();

      // 4. Connect to Nostr
      await nostrClient.init();

      try {
        initViewCounter({ nostrClient });
      } catch (error) {
        console.warn("Failed to initialize view counter:", error);
      }

      try {
        await accessControl.refresh();
        console.assert(
          !accessControl.lastError ||
            accessControl.lastError?.code !== "nostr-unavailable",
          "[app.init()] Access control refresh should not run before nostrClient.init()",
          accessControl.lastError
        );
      } catch (error) {
        console.warn("Failed to refresh admin lists after connecting to Nostr:", error);
      }

      try {
        await this.refreshAdminPaneState();
      } catch (error) {
        console.warn(
          "Failed to update admin pane after connecting to Nostr:",
          error
        );
      }

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

      await this.initWatchHistoryMetadataSync();

      // 6) Load the default view ONLY if there's no #view= already
      if (!window.location.hash || !window.location.hash.startsWith("#view=")) {
        console.log(
          "[app.init()] No #view= in the URL, loading default home view"
        );
        await loadView("views/most-recent-videos.html");
      } else {
        console.log(
          "[app.init()] Found hash:",
          window.location.hash,
          "so skipping default load"
        );
      }

      // 7. Once loaded, get a reference to #videoList
      this.videoList = document.getElementById("videoList");
      if (this.videoListView) {
        this.videoListView.setContainer(this.videoList);
      }

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
  showModalWithPoster(video = this.currentVideo) {
    if (!this.videoModal) {
      return;
    }
    this.videoModal.open(video || this.currentVideo);
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
    const normalizedPubkey =
      typeof video.pubkey === "string" ? video.pubkey.trim() : "";
    const kind =
      typeof video.kind === "number" && Number.isFinite(video.kind)
        ? video.kind
        : VIDEO_EVENT_KIND;

    if (dTagValue && normalizedPubkey) {
      const pointer = ["a", `${kind}:${normalizedPubkey}:${dTagValue}`];
      const key = pointerArrayToKey(pointer);
      if (key) {
        return { pointer, key };
      }
    }

    const fallbackId =
      typeof video.id === "string" && video.id.trim()
        ? video.id.trim()
        : "";
    if (fallbackId) {
      const pointer = ["e", fallbackId];
      const key = pointerArrayToKey(pointer);
      if (key) {
        return { pointer, key };
      }
    }

    return null;
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

  renderSavedProfiles() {
    const fallbackAvatar = "assets/svg/default-profile.svg";
    const normalizedActive = this.normalizeHexPubkey(
      this.activeProfilePubkey
    );
    const entriesNeedingFetch = new Set();

    const resolveMeta = (entry) => {
      if (!entry || typeof entry !== "object") {
        return {
          name: "",
          picture: fallbackAvatar,
          npub: null,
        };
      }

      const normalizedPubkey = this.normalizeHexPubkey(entry.pubkey);
      let cacheEntry = null;
      if (normalizedPubkey) {
        cacheEntry = this.getProfileCacheEntry(normalizedPubkey);
      }
      const cachedProfile = cacheEntry?.profile || {};

      const hasStoredName =
        typeof entry.name === "string" && entry.name.trim().length > 0;
      const hasStoredPicture =
        typeof entry.picture === "string" && entry.picture.trim().length > 0;

      if (
        !cacheEntry &&
        normalizedPubkey &&
        (!hasStoredName || !hasStoredPicture)
      ) {
        entriesNeedingFetch.add(normalizedPubkey);
      }

      let resolvedNpub =
        typeof entry.npub === "string" && entry.npub.trim()
          ? entry.npub.trim()
          : null;
      if (!resolvedNpub && entry.pubkey) {
        resolvedNpub = this.safeEncodeNpub(entry.pubkey);
      }

      return {
        name: cachedProfile.name || entry.name || "",
        picture: cachedProfile.picture || entry.picture || fallbackAvatar,
        npub: resolvedNpub,
      };
    };

    const savedEntries = Array.isArray(this.savedProfiles)
      ? this.savedProfiles.filter((entry) => entry && entry.pubkey)
      : [];

    let activeEntry = null;
    if (normalizedActive) {
      activeEntry = savedEntries.find(
        (entry) => this.normalizeHexPubkey(entry.pubkey) === normalizedActive
      );
    }
    if (!activeEntry && savedEntries.length) {
      activeEntry = savedEntries[0];
    }

    const activeMeta = activeEntry ? resolveMeta(activeEntry) : null;
    const hasActiveProfile = Boolean(activeEntry && activeMeta);
    const activeNameFallback = activeMeta?.npub
      ? truncateMiddle(activeMeta.npub, 32)
      : "Saved profile";
    const activeDisplayName = hasActiveProfile
      ? activeMeta.name?.trim() || activeNameFallback
      : "No active profile";
    const activeAvatarSrc = hasActiveProfile
      ? activeMeta.picture || fallbackAvatar
      : fallbackAvatar;

    if (this.profileModalName) {
      this.profileModalName.textContent = activeDisplayName;
    }

    if (this.profileModalAvatar instanceof HTMLImageElement) {
      if (this.profileModalAvatar.src !== activeAvatarSrc) {
        this.profileModalAvatar.src = activeAvatarSrc;
      }
      this.profileModalAvatar.alt = hasActiveProfile
        ? `${activeDisplayName} avatar`
        : "Default profile avatar";
    } else if (this.profileModalAvatar) {
      this.profileModalAvatar.setAttribute("data-avatar-src", activeAvatarSrc);
    }

    if (this.profileModalNpub) {
      if (hasActiveProfile && activeMeta?.npub) {
        this.profileModalNpub.textContent = truncateMiddle(activeMeta.npub, 48);
      } else if (hasActiveProfile) {
        this.profileModalNpub.textContent = "npub unavailable";
      } else {
        this.profileModalNpub.textContent = "Link a profile to get started";
      }
    }

    if (this.profileChannelLink) {
      if (hasActiveProfile && activeMeta?.npub) {
        const encodedNpub = activeMeta.npub;
        this.profileChannelLink.href = `#view=channel-profile&npub=${encodeURIComponent(
          encodedNpub
        )}`;
        this.profileChannelLink.dataset.targetNpub = encodedNpub;
        this.profileChannelLink.classList.remove("hidden");
        this.profileChannelLink.setAttribute("aria-hidden", "false");
      } else {
        this.profileChannelLink.classList.add("hidden");
        this.profileChannelLink.removeAttribute("href");
        delete this.profileChannelLink.dataset.targetNpub;
        this.profileChannelLink.setAttribute("aria-hidden", "true");
      }
    }

    if (this.profileAvatar instanceof HTMLImageElement) {
      if (this.profileAvatar.src !== activeAvatarSrc) {
        this.profileAvatar.src = activeAvatarSrc;
      }
      this.profileAvatar.alt = hasActiveProfile
        ? `${activeDisplayName} avatar`
        : this.profileAvatar.alt || "Profile avatar";
    }

    const listEl = this.profileSwitcherList;
    if (listEl instanceof HTMLElement) {
      listEl.innerHTML = "";
      let normalizedSelection = this.normalizeHexPubkey(
        this.profileSwitcherSelectionPubkey
      );
      if (normalizedSelection && normalizedSelection === normalizedActive) {
        normalizedSelection = null;
        this.profileSwitcherSelectionPubkey = null;
      }
      const entriesToRender = savedEntries.filter((entry) => {
        const normalized = this.normalizeHexPubkey(entry.pubkey);
        return normalized && normalized !== normalizedActive;
      });

      if (!entriesToRender.length) {
        listEl.setAttribute("data-profile-switcher-empty", "true");
        const helper = document.createElement("p");
        helper.className = "profile-switcher__empty text-sm text-gray-400";
        helper.textContent = "No other profiles saved yet.";
        helper.setAttribute("role", "note");
        listEl.appendChild(helper);
      } else {
        listEl.removeAttribute("data-profile-switcher-empty");

        entriesToRender.forEach((entry) => {
          const meta = resolveMeta(entry);
          const button = document.createElement("button");
          button.type = "button";
          button.classList.add("profile-card");
          button.dataset.pubkey = entry.pubkey;
          if (meta.npub) {
            button.dataset.npub = meta.npub;
          }
          if (entry.authType) {
            button.dataset.authType = entry.authType;
          }

          const normalizedPubkey = this.normalizeHexPubkey(entry.pubkey);
          const isSelected =
            normalizedSelection && normalizedPubkey === normalizedSelection;
          if (isSelected) {
            button.classList.add("profile-card--active");
            button.setAttribute("aria-pressed", "true");
          } else {
            button.setAttribute("aria-pressed", "false");
          }

          const avatarSpan = document.createElement("span");
          avatarSpan.className = "profile-card__avatar";
          const avatarImg = document.createElement("img");
          avatarImg.src = meta.picture || fallbackAvatar;
          const cardDisplayName =
            meta.name?.trim() ||
            (meta.npub ? truncateMiddle(meta.npub, 32) : "Saved profile");
          avatarImg.alt = `${cardDisplayName} avatar`;
          avatarSpan.appendChild(avatarImg);

          const metaSpan = document.createElement("span");
          metaSpan.className = "profile-card__meta";

          const topLine = document.createElement("span");
          topLine.className = "profile-card__topline";

          const label = document.createElement("span");
          label.className = "profile-card__label";
          label.textContent =
            entry.authType === "nsec" ? "Direct key" : "Saved profile";

          const action = document.createElement("span");
          action.className = "profile-card__action";
          action.setAttribute("aria-hidden", "true");
          action.textContent = isSelected ? "Selected" : "Switch";

          topLine.append(label, action);

          const nameSpan = document.createElement("span");
          nameSpan.className = "profile-card__name";
          nameSpan.textContent = cardDisplayName;

          const npubSpan = document.createElement("span");
          npubSpan.className = "profile-card__npub";
          npubSpan.textContent = meta.npub
            ? truncateMiddle(meta.npub, 48)
            : "npub unavailable";

          metaSpan.append(topLine, nameSpan, npubSpan);
          button.append(avatarSpan, metaSpan);

          const ariaLabel = isSelected
            ? `${cardDisplayName} selected`
            : `Switch to ${cardDisplayName}`;
          button.setAttribute("aria-label", ariaLabel);

          const activateProfile = async (event) => {
            if (event) {
              event.preventDefault();
              event.stopPropagation();
            }

            if (button.dataset.loading === "true") {
              return;
            }

            button.dataset.loading = "true";
            button.setAttribute("aria-busy", "true");

            try {
              await this.switchProfile(entry.pubkey);
            } catch (error) {
              console.error("Failed to switch profile:", error);
            } finally {
              button.dataset.loading = "false";
              button.setAttribute("aria-busy", "false");
            }
          };

          button.addEventListener("click", activateProfile);
          button.addEventListener("keydown", (event) => {
            const key = event?.key;
            if (key === "Enter" || key === " " || key === "Spacebar") {
              activateProfile(event);
            }
          });

          listEl.appendChild(button);
        });
      }

      this.updateProfileModalFocusables();
    } else {
      this.updateProfileModalFocusables();
    }

    if (entriesNeedingFetch.size) {
      this.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  /**
   * (Optional) Initialize a separate profile modal (profile-modal.html).
   */
  async initProfileModal() {
    try {
      console.log("Starting profile modal initialization...");
      const resp = await fetch("components/profile-modal.html");
      if (!resp.ok) {
        // If you don't have a profile modal, comment this entire method out.
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      removeTrackingScripts(wrapper);
      modalContainer.appendChild(wrapper);

      // Now references
      this.profileModal = document.getElementById("profileModal") || null;
      this.closeProfileModal =
        document.getElementById("closeProfileModal") || null;
      this.profileLogoutBtn =
        document.getElementById("profileLogoutBtn") || null;
      this.profileModalAvatar =
        document.getElementById("profileModalAvatar") || null;
      this.profileModalName =
        document.getElementById("profileModalName") || null;
      this.profileModalNpub =
        document.getElementById("profileModalNpub") || null;
      this.profileChannelLink =
        document.getElementById("profileChannelLink") || null;
      this.profileSwitcherList =
        document.getElementById("profileSwitcherList") || null;
      this.profileAddAccountBtn =
        document.getElementById("profileAddAccountBtn") || null;
      const topLevelProfileAvatar =
        document.getElementById("profileAvatar") || null;
      if (topLevelProfileAvatar) {
        this.profileAvatar = topLevelProfileAvatar;
      }
      this.profileNavButtons.account =
        document.getElementById("profileNavAccount") || null;
      this.profileNavButtons.relays =
        document.getElementById("profileNavRelays") || null;
      this.profileNavButtons.blocked =
        document.getElementById("profileNavBlocked") || null;
      this.profileNavButtons.history =
        document.getElementById("profileNavHistory") || null;
      this.profileNavButtons.admin =
        document.getElementById("profileNavAdmin") || null;
      this.profilePaneElements.account =
        document.getElementById("profilePaneAccount") || null;
      this.profilePaneElements.relays =
        document.getElementById("profilePaneRelays") || null;
      this.profilePaneElements.blocked =
        document.getElementById("profilePaneBlocked") || null;
      this.profilePaneElements.history =
        document.getElementById("profilePaneHistory") || null;
      this.profilePaneElements.admin =
        document.getElementById("profilePaneAdmin") || null;
      this.profileRelayList = document.getElementById("relayList") || null;
      this.profileBlockedList = document.getElementById("blockedList") || null;
      this.profileBlockedEmpty =
        document.getElementById("blockedEmpty") || null;
      this.profileBlockedInput =
        document.getElementById("blockedInput") || null;
      this.profileAddBlockedBtn =
        document.getElementById("addBlockedBtn") || null;
      this.profileRelayInput = document.getElementById("relayInput") || null;
      this.profileAddRelayBtn = document.getElementById("addRelayBtn") || null;
      this.profileRestoreRelaysBtn =
        document.getElementById("restoreRelaysBtn") || null;
      if (!this.profileHistoryRenderer) {
        this.profileHistoryRenderer = createWatchHistoryRenderer({
          viewSelector: "#profilePaneHistory",
          gridSelector: "#profileHistoryGrid",
          loadingSelector: "#profileHistoryLoading",
          statusSelector: "#profileHistoryStatus",
          emptySelector: "#profileHistoryEmpty",
          sentinelSelector: "#profileHistorySentinel",
          scrollContainerSelector: "#profileHistoryScroll",
          errorBannerSelector: "#profileHistoryError",
          clearButtonSelector: "#profileHistoryClear",
          republishButtonSelector: "#profileHistoryRepublish",
          featureBannerSelector: "#profileHistoryFeatureBanner",
          toastRegionSelector: "#profileHistoryToastRegion",
          sessionWarningSelector: "#profileHistorySessionWarning",
          metadataToggleSelector: "#profileHistoryMetadataToggle",
          metadataThumbSelector: "#profileHistoryMetadataThumb",
          metadataLabelSelector: "#profileHistoryMetadataLabel",
          metadataDescriptionSelector: "#profileHistoryMetadataDescription",
          emptyCopy: "You haven’t watched any videos yet.",
          remove: (payload) => this.handleWatchHistoryRemoval(payload),
          getActor: async () => {
            if (this.pubkey) {
              return this.pubkey;
            }
            if (
              typeof nostrClient?.sessionActor?.pubkey === "string" &&
              nostrClient.sessionActor.pubkey
            ) {
              return nostrClient.sessionActor.pubkey;
            }
            return window.app?.pubkey || undefined;
          },
        });
      }
      this.adminModeratorsSection =
        document.getElementById("adminModeratorsSection") || null;
      this.adminModeratorsEmpty =
        document.getElementById("adminModeratorsEmpty") || null;
      this.adminModeratorList =
        document.getElementById("adminModeratorList") || null;
      this.adminModeratorInput =
        document.getElementById("adminModeratorInput") || null;
      this.adminAddModeratorBtn =
        document.getElementById("adminAddModeratorBtn") || null;
      this.adminWhitelistSection =
        document.getElementById("adminWhitelistSection") || null;
      this.adminWhitelistEmpty =
        document.getElementById("adminWhitelistEmpty") || null;
      this.adminWhitelistList =
        document.getElementById("adminWhitelistList") || null;
      this.adminWhitelistInput =
        document.getElementById("adminWhitelistInput") || null;
      this.adminAddWhitelistBtn =
        document.getElementById("adminAddWhitelistBtn") || null;
      this.adminBlacklistSection =
        document.getElementById("adminBlacklistSection") || null;
      this.adminBlacklistEmpty =
        document.getElementById("adminBlacklistEmpty") || null;
      this.adminBlacklistList =
        document.getElementById("adminBlacklistList") || null;
      this.adminBlacklistInput =
        document.getElementById("adminBlacklistInput") || null;
      this.adminAddBlacklistBtn =
        document.getElementById("adminAddBlacklistBtn") || null;

      // Wire up
      if (this.closeProfileModal && !this.closeProfileModal.dataset.bound) {
        this.closeProfileModal.dataset.bound = "true";
        this.closeProfileModal.addEventListener("click", () => {
          this.hideProfileModal();
        });
      }
      if (this.profileLogoutBtn && !this.profileLogoutBtn.dataset.bound) {
        this.profileLogoutBtn.dataset.bound = "true";
        this.profileLogoutBtn.addEventListener("click", async () => {
          try {
            await this.authService.logout();
          } catch (error) {
            console.error("Logout failed:", error);
            this.showError("Failed to logout. Please try again.");
          }
          this.hideProfileModal();
        });
      }

      if (this.profileChannelLink && !this.profileChannelLink.dataset.bound) {
        this.profileChannelLink.dataset.bound = "true";
        this.profileChannelLink.addEventListener("click", (event) => {
          event.preventDefault();
          const targetNpub = this.profileChannelLink?.dataset?.targetNpub;
          if (!targetNpub) {
            return;
          }
          this.hideProfileModal();
          window.location.hash = `#view=channel-profile&npub=${targetNpub}`;
        });
      }

      if (
        this.profileAddAccountBtn &&
        this.profileAddAccountBtn.dataset.bound !== "true"
      ) {
        this.profileAddAccountBtn.dataset.bound = "true";
        this.profileAddAccountBtn.addEventListener("click", () => {
          this.handleAddProfile();
        });
      }

      Object.entries(this.profileNavButtons).forEach(([name, button]) => {
        if (!button || button.dataset.navBound === "true") {
          return;
        }
        button.dataset.navBound = "true";
        button.addEventListener("click", () => {
          this.selectProfilePane(name);
        });
      });

      if (this.profileAddRelayBtn && !this.profileAddRelayBtn.dataset.bound) {
        this.profileAddRelayBtn.dataset.bound = "true";
        this.profileAddRelayBtn.addEventListener("click", () => {
          this.handleAddRelay();
        });
      }
      if (
        this.profileRestoreRelaysBtn &&
        this.profileRestoreRelaysBtn.dataset.bound !== "true"
      ) {
        this.profileRestoreRelaysBtn.dataset.bound = "true";
        this.profileRestoreRelaysBtn.addEventListener("click", () => {
          this.handleRestoreRelays();
        });
      }
      if (
        this.profileRelayInput &&
        this.profileRelayInput.dataset.bound !== "true"
      ) {
        this.profileRelayInput.dataset.bound = "true";
        this.profileRelayInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.handleAddRelay();
          }
        });
      }

      if (
        this.profileAddBlockedBtn &&
        this.profileAddBlockedBtn.dataset.bound !== "true"
      ) {
        this.profileAddBlockedBtn.dataset.bound = "true";
        this.profileAddBlockedBtn.addEventListener("click", () => {
          this.handleAddBlockedCreator();
        });
      }
      if (
        this.profileBlockedInput &&
        this.profileBlockedInput.dataset.bound !== "true"
      ) {
        this.profileBlockedInput.dataset.bound = "true";
        this.profileBlockedInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.handleAddBlockedCreator();
          }
        });
      }

      if (
        this.adminAddModeratorBtn &&
        this.adminAddModeratorBtn.dataset.bound !== "true"
      ) {
        this.adminAddModeratorBtn.dataset.bound = "true";
        this.adminAddModeratorBtn.addEventListener("click", () => {
          this.handleAddModerator();
        });
      }
      if (
        this.adminModeratorInput &&
        this.adminModeratorInput.dataset.bound !== "true"
      ) {
        this.adminModeratorInput.dataset.bound = "true";
        this.adminModeratorInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.handleAddModerator();
          }
        });
      }

      if (
        this.adminAddWhitelistBtn &&
        this.adminAddWhitelistBtn.dataset.bound !== "true"
      ) {
        this.adminAddWhitelistBtn.dataset.bound = "true";
        this.adminAddWhitelistBtn.addEventListener("click", () => {
          this.handleAdminListMutation("whitelist", "add");
        });
      }
      if (
        this.adminWhitelistInput &&
        this.adminWhitelistInput.dataset.bound !== "true"
      ) {
        this.adminWhitelistInput.dataset.bound = "true";
        this.adminWhitelistInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.handleAdminListMutation("whitelist", "add");
          }
        });
      }

      if (
        this.adminAddBlacklistBtn &&
        this.adminAddBlacklistBtn.dataset.bound !== "true"
      ) {
        this.adminAddBlacklistBtn.dataset.bound = "true";
        this.adminAddBlacklistBtn.addEventListener("click", () => {
          this.handleAdminListMutation("blacklist", "add");
        });
      }
      if (
        this.adminBlacklistInput &&
        this.adminBlacklistInput.dataset.bound !== "true"
      ) {
        this.adminBlacklistInput.dataset.bound = "true";
        this.adminBlacklistInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.handleAdminListMutation("blacklist", "add");
          }
        });
      }

      this.selectProfilePane("account");
      this.populateProfileRelays();
      this.populateBlockedList();
      await this.refreshAdminPaneState();

      this.renderSavedProfiles();

      console.log("Profile modal initialization successful");
      return true;
    } catch (error) {
      console.error("initProfileModal failed:", error);
      // Not critical if missing
      return false;
    }
  }

  selectProfilePane(name = "account") {
    const normalized = typeof name === "string" ? name.toLowerCase() : "account";
    const previous = this.activeProfilePane;
    const availableKeys = Object.keys(this.profilePaneElements).filter((key) => {
      const pane = this.profilePaneElements[key];
      if (!(pane instanceof HTMLElement)) {
        return false;
      }
      const button = this.profileNavButtons[key];
      if (button instanceof HTMLElement && button.classList.contains("hidden")) {
        return false;
      }
      return true;
    });

    const fallbackTarget = availableKeys.includes("account")
      ? "account"
      : availableKeys[0] || "account";
    const target = availableKeys.includes(normalized)
      ? normalized
      : fallbackTarget;

    if (previous === "history" && target !== "history") {
      try {
        this.profileHistoryRenderer?.pause();
      } catch (error) {
        console.warn("[profileModal] Failed to pause history renderer:", error);
      }
    }

    Object.entries(this.profilePaneElements).forEach(([key, pane]) => {
      if (!(pane instanceof HTMLElement)) {
        return;
      }
      const isActive = key === target;
      pane.classList.toggle("hidden", !isActive);
      pane.setAttribute("aria-hidden", (!isActive).toString());
    });

    Object.entries(this.profileNavButtons).forEach(([key, button]) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const isActive = key === target;
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.classList.toggle("bg-gray-800", isActive);
      button.classList.toggle("text-white", isActive);
      button.classList.toggle("text-gray-400", !isActive);
    });

    this.updateProfileModalFocusables();
    this.activeProfilePane = target;

    if (target === "history") {
      void this.populateProfileWatchHistory();
    }
  }

  updateProfileModalFocusables() {
    if (!this.profileModal) {
      this.profileModalFocusables = [];
      return;
    }

    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const candidates = Array.from(
      this.profileModal.querySelectorAll(focusableSelectors)
    );

    this.profileModalFocusables = candidates.filter((el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      if (el.hasAttribute("disabled")) {
        return false;
      }
      if (el.getAttribute("aria-hidden") === "true") {
        return false;
      }
      if (el.offsetParent === null && el !== document.activeElement) {
        return false;
      }
      return true;
    });
  }

  async openProfileModal() {
    if (!this.profileModal) {
      return;
    }

    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      console.error("Failed to refresh admin pane while opening profile modal:", error);
    }

    this.activeProfilePane = null;
    this.selectProfilePane("account");
    this.populateProfileRelays();
    try {
      await userBlocks.ensureLoaded(this.pubkey);
    } catch (error) {
      console.warn("Failed to refresh user block list while opening profile modal:", error);
    }
    this.populateBlockedList();

    this.profileModal.classList.remove("hidden");
    this.profileModal.setAttribute("aria-hidden", "false");
    setGlobalModalState("profile", true);

    this.lastFocusedBeforeProfileModal =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    this.updateProfileModalFocusables();

    const initialTarget =
      this.profileNavButtons.account instanceof HTMLElement
        ? this.profileNavButtons.account
        : this.profileModal;

    window.requestAnimationFrame(() => {
      if (initialTarget && typeof initialTarget.focus === "function") {
        initialTarget.focus();
      }
    });

    if (!this.boundProfileModalKeydown) {
      this.boundProfileModalKeydown = (event) => {
        if (!this.profileModal || this.profileModal.classList.contains("hidden")) {
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          this.hideProfileModal();
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        this.updateProfileModalFocusables();
        if (!this.profileModalFocusables.length) {
          event.preventDefault();
          if (typeof this.profileModal.focus === "function") {
            this.profileModal.focus();
          }
          return;
        }

        const first = this.profileModalFocusables[0];
        const last = this.profileModalFocusables[this.profileModalFocusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !this.profileModal.contains(active)) {
            event.preventDefault();
            if (last && typeof last.focus === "function") {
              last.focus();
            }
          }
          return;
        }

        if (active === last) {
          event.preventDefault();
          if (first && typeof first.focus === "function") {
            first.focus();
          }
        }
      };
    }

    if (!this.boundProfileModalFocusIn) {
      this.boundProfileModalFocusIn = (event) => {
        if (
          !this.profileModal ||
          this.profileModal.classList.contains("hidden") ||
          this.profileModal.contains(event.target)
        ) {
          return;
        }

        this.updateProfileModalFocusables();
        const fallback = this.profileModalFocusables[0] || this.profileModal;
        if (fallback && typeof fallback.focus === "function") {
          fallback.focus();
        }
      };
    }

    this.profileModal.addEventListener("keydown", this.boundProfileModalKeydown);
    document.addEventListener("focusin", this.boundProfileModalFocusIn);
  }

  hideProfileModal() {
    if (!this.profileModal) {
      return;
    }

    if (!this.profileModal.classList.contains("hidden")) {
      this.profileModal.classList.add("hidden");
    }
    this.profileModal.setAttribute("aria-hidden", "true");
    setGlobalModalState("profile", false);

    if (this.boundProfileModalKeydown) {
      this.profileModal.removeEventListener(
        "keydown",
        this.boundProfileModalKeydown
      );
    }
    if (this.boundProfileModalFocusIn) {
      document.removeEventListener("focusin", this.boundProfileModalFocusIn);
    }
    if (this.boundProfileHistoryVisibility) {
      document.removeEventListener(
        "visibilitychange",
        this.boundProfileHistoryVisibility
      );
      this.boundProfileHistoryVisibility = null;
    }

    this.closeAllMoreMenus();

    try {
      this.profileHistoryRenderer?.destroy();
    } catch (error) {
      console.warn(
        "[profileModal] Failed to reset watch history renderer on close:",
        error
      );
    }

    this.activeProfilePane = null;

    if (
      this.lastFocusedBeforeProfileModal &&
      typeof this.lastFocusedBeforeProfileModal.focus === "function"
    ) {
      this.lastFocusedBeforeProfileModal.focus();
    }
    this.lastFocusedBeforeProfileModal = null;
  }

  populateProfileRelays(relayEntries = null) {
    if (!this.profileRelayList) {
      return;
    }

    const sourceEntries = Array.isArray(relayEntries)
      ? relayEntries
      : relayManager.getEntries();

    const relays = sourceEntries
      .map((entry) => {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed ? { url: trimmed, mode: "both" } : null;
        }
        if (entry && typeof entry === "object") {
          const url =
            typeof entry.url === "string" ? entry.url.trim() : "";
          if (!url) {
            return null;
          }
          const mode = typeof entry.mode === "string" ? entry.mode : "both";
          const normalizedMode =
            mode === "read" || mode === "write" ? mode : "both";
          return {
            url,
            mode: normalizedMode,
            read: entry.read !== false,
            write: entry.write !== false,
          };
        }
        return null;
      })
      .filter((entry) => entry && typeof entry.url === "string");

    this.profileRelayList.innerHTML = "";

    if (!relays.length) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "rounded-lg border border-dashed border-gray-700 p-4 text-center text-sm text-gray-400";
      emptyState.textContent = "No relays configured.";
      this.profileRelayList.appendChild(emptyState);
      return;
    }

    relays.forEach((entry) => {
      const item = document.createElement("li");
      item.className =
        "flex items-start justify-between gap-4 rounded-lg bg-gray-800 px-4 py-3";

      const info = document.createElement("div");
      info.className = "flex-1 min-w-0";

      const urlEl = document.createElement("p");
      urlEl.className = "text-sm font-medium text-gray-100 break-all";
      urlEl.textContent = entry.url;

      const statusEl = document.createElement("p");
      statusEl.className = "mt-1 text-xs text-gray-400";
      let modeLabel = "Read & write";
      if (entry.mode === "read") {
        modeLabel = "Read only";
      } else if (entry.mode === "write") {
        modeLabel = "Write only";
      }
      statusEl.textContent = modeLabel;

      info.appendChild(urlEl);
      info.appendChild(statusEl);

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-2";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className =
        "px-3 py-1 rounded-md bg-gray-700 text-xs font-medium text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900";
      editBtn.textContent = "Change mode";
      editBtn.title = "Cycle between read-only, write-only, or read/write modes.";
      editBtn.addEventListener("click", () => {
        this.handleRelayModeToggle(entry.url);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className =
        "px-3 py-1 rounded-md bg-gray-700 text-xs font-medium text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        this.handleRemoveRelay(entry.url);
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(info);
      item.appendChild(actions);

      this.profileRelayList.appendChild(item);
    });
  }

  async handleRelayOperation(operation, {
    successMessage = "Relay preferences updated.",
    skipPublishIfUnchanged = true,
    unchangedMessage = null,
  } = {}) {
    if (!this.pubkey) {
      this.showError("Please login to manage your relays.");
      return;
    }

    if (typeof operation !== "function") {
      return;
    }

    const previous = relayManager.snapshot();
    let result;
    try {
      result = operation();
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to update relay preferences.";
      this.showError(message);
      return;
    }

    const changed = !!result?.changed;
    if (!changed && skipPublishIfUnchanged) {
      if (result?.reason === "duplicate") {
        this.showSuccess("Relay is already configured.");
      } else if (typeof unchangedMessage === "string" && unchangedMessage) {
        this.showSuccess(unchangedMessage);
      }
      this.populateProfileRelays();
      return;
    }

    this.populateProfileRelays();

    try {
      const publishResult = await relayManager.publishRelayList(this.pubkey);
      if (!publishResult?.ok) {
        throw new Error("No relays accepted the update.");
      }
      if (successMessage) {
        this.showSuccess(successMessage);
      }
    } catch (error) {
      relayManager.setEntries(previous, { allowEmpty: false });
      this.populateProfileRelays();
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to publish relay configuration. Please try again.";
      this.showError(message);
    }
  }

  async handleAddRelay() {
    if (!this.pubkey) {
      this.showError("Please login to manage your relays.");
      return;
    }

    const rawValue =
      typeof this.profileRelayInput?.value === "string"
        ? this.profileRelayInput.value
        : "";
    const trimmed = rawValue.trim();
    if (!trimmed) {
      this.showError("Enter a relay URL to add.");
      return;
    }

    await this.handleRelayOperation(
      () => relayManager.addRelay(trimmed),
      {
        successMessage: "Relay saved.",
        unchangedMessage: "Relay is already configured.",
      }
    );

    if (this.profileRelayInput) {
      this.profileRelayInput.value = "";
    }
  }

  async handleRestoreRelays() {
    if (!this.pubkey) {
      this.showError("Please login to manage your relays.");
      return;
    }

    const confirmed = window.confirm(
      "Restore the recommended relay defaults?"
    );
    if (!confirmed) {
      return;
    }

    await this.handleRelayOperation(
      () => relayManager.restoreDefaults(),
      {
        successMessage: "Relay defaults restored.",
        unchangedMessage: "Relay defaults are already in use.",
      }
    );
  }

  async handleRelayModeToggle(url) {
    if (!url) {
      return;
    }
    await this.handleRelayOperation(
      () => relayManager.cycleRelayMode(url),
      { successMessage: "Relay mode updated." }
    );
  }

  async handleRemoveRelay(url) {
    if (!url) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${url} from your relay list?`
    );
    if (!confirmed) {
      return;
    }

    await this.handleRelayOperation(
      () => relayManager.removeRelay(url),
      { successMessage: "Relay removed." }
    );
  }

  populateBlockedList(blocked = null) {
    if (!this.profileBlockedList || !this.profileBlockedEmpty) {
      return;
    }

    const sourceEntries =
      Array.isArray(blocked) && blocked.length
        ? blocked
        : userBlocks.getBlockedPubkeys();

    const normalizedEntries = [];
    const pushEntry = (hex, label) => {
      if (!hex || !label) {
        return;
      }
      normalizedEntries.push({ hex, label });
    };

    sourceEntries.forEach((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (!trimmed) {
          return;
        }

        if (trimmed.startsWith("npub1")) {
          const decoded = this.safeDecodeNpub(trimmed);
          if (!decoded) {
            return;
          }
          const label = this.safeEncodeNpub(decoded) || trimmed;
          pushEntry(decoded, label);
          return;
        }

        if (/^[0-9a-f]{64}$/i.test(trimmed)) {
          const hex = trimmed.toLowerCase();
          const label = this.safeEncodeNpub(hex) || hex;
          pushEntry(hex, label);
        }
        return;
      }

      if (entry && typeof entry === "object") {
        const candidateNpub =
          typeof entry.npub === "string" ? entry.npub.trim() : "";
        const candidateHex =
          typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";

        if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
          const normalizedHex = candidateHex.toLowerCase();
          const label =
            candidateNpub && candidateNpub.startsWith("npub1")
              ? candidateNpub
              : this.safeEncodeNpub(normalizedHex) || normalizedHex;
          pushEntry(normalizedHex, label);
          return;
        }

        if (candidateNpub && candidateNpub.startsWith("npub1")) {
          const decoded = this.safeDecodeNpub(candidateNpub);
          if (!decoded) {
            return;
          }
          const label = this.safeEncodeNpub(decoded) || candidateNpub;
          pushEntry(decoded, label);
        }
      }
    });

    const deduped = [];
    const seenHex = new Set();
    normalizedEntries.forEach((entry) => {
      if (!seenHex.has(entry.hex)) {
        seenHex.add(entry.hex);
        deduped.push(entry);
      }
    });

    this.profileBlockedList.innerHTML = "";

    if (!deduped.length) {
      this.profileBlockedEmpty.classList.remove("hidden");
      this.profileBlockedList.classList.add("hidden");
      return;
    }

    this.profileBlockedEmpty.classList.add("hidden");
    this.profileBlockedList.classList.remove("hidden");

    deduped.forEach(({ hex, label }) => {
      const item = document.createElement("li");
      item.className =
        "flex items-center justify-between gap-4 rounded-lg bg-gray-800 px-4 py-3";

      const info = document.createElement("div");
      info.className = "min-w-0";

      const title = document.createElement("p");
      title.className = "text-sm font-medium text-gray-100 break-all";
      title.textContent = label;

      info.appendChild(title);

      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className =
        "px-3 py-1 rounded-md bg-gray-700 text-xs font-medium text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900";
      actionBtn.textContent = "Remove";
      actionBtn.dataset.blockedHex = hex;
      actionBtn.addEventListener("click", () => {
        this.handleRemoveBlockedCreator(hex);
      });

      item.appendChild(info);
      item.appendChild(actionBtn);

      this.profileBlockedList.appendChild(item);
    });
  }

  async populateProfileWatchHistory() {
    if (!this.profileHistoryRenderer) {
      return;
    }

    let primaryActor =
      typeof this.pubkey === "string" && this.pubkey ? this.pubkey : undefined;
    if (
      !primaryActor &&
      typeof nostrClient?.sessionActor?.pubkey === "string" &&
      nostrClient.sessionActor.pubkey
    ) {
      primaryActor = nostrClient.sessionActor.pubkey;
    }

    try {
      await this.profileHistoryRenderer.ensureInitialLoad({ actor: primaryActor });
      await this.profileHistoryRenderer.refresh({ actor: primaryActor, force: true });
      if (!this.boundProfileHistoryVisibility) {
        this.boundProfileHistoryVisibility = () => {
          if (!this.profileHistoryRenderer) {
            return;
          }
          if (document.visibilityState === "visible") {
            this.profileHistoryRenderer.resume();
          } else {
            this.profileHistoryRenderer.pause();
          }
        };
        document.addEventListener(
          "visibilitychange",
          this.boundProfileHistoryVisibility
        );
      }
      if (document.visibilityState === "hidden") {
        this.profileHistoryRenderer.pause();
      } else {
        this.profileHistoryRenderer.resume();
      }
    } catch (error) {
      console.error(
        "[profileModal] Failed to populate watch history pane:",
        error
      );
    }
  }

  async handleAddProfile() {
    if (!this.profileAddAccountBtn) {
      return;
    }

    const button = this.profileAddAccountBtn;
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
          "Connecting to your Nostr extension"
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
          "Received an invalid public key from the Nostr extension."
        );
      }

      const alreadySaved = this.savedProfiles.some(
        (entry) =>
          this.normalizeHexPubkey(entry.pubkey) === normalizedPubkey
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

  async handleAddBlockedCreator() {
    if (!this.profileBlockedInput) {
      return;
    }

    const rawValue = this.profileBlockedInput.value;
    const trimmed = typeof rawValue === "string" ? rawValue.trim() : "";

    if (!trimmed) {
      this.showError("Enter an npub to block.");
      return;
    }

    if (!this.pubkey) {
      this.showError("Please login to manage your block list.");
      return;
    }

    const actorHex = this.pubkey;
    let targetHex = "";

    if (trimmed.startsWith("npub1")) {
      targetHex = this.safeDecodeNpub(trimmed) || "";
      if (!targetHex) {
        this.showError("Invalid npub. Please double-check and try again.");
        return;
      }
    } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      targetHex = trimmed.toLowerCase();
    } else {
      this.showError("Enter a valid npub or hex pubkey.");
      return;
    }

    if (targetHex === actorHex) {
      this.showError("You cannot block yourself.");
      return;
    }

    try {
      await userBlocks.ensureLoaded(actorHex);

      if (userBlocks.isBlocked(targetHex)) {
        this.showSuccess("You already blocked this creator.");
      } else {
        await userBlocks.addBlock(targetHex, actorHex);
        this.showSuccess(
          "Creator blocked. You won't see their videos anymore."
        );
      }

      this.profileBlockedInput.value = "";
      this.populateBlockedList();
      await this.loadVideos();
    } catch (error) {
      console.error("Failed to add creator to personal block list:", error);
      const message =
        error?.code === "nip04-missing"
          ? "Your Nostr extension must support NIP-04 to manage private lists."
          : "Failed to update your block list. Please try again.";
      this.showError(message);
    }
  }

  async handleRemoveBlockedCreator(candidate) {
    if (!this.pubkey) {
      this.showError("Please login to manage your block list.");
      return;
    }

    let targetHex = "";
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return;
      }

      if (trimmed.startsWith("npub1")) {
        targetHex = this.safeDecodeNpub(trimmed) || "";
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        targetHex = trimmed.toLowerCase();
      }
    }

    if (!targetHex) {
      console.warn("No valid pubkey to remove from block list:", candidate);
      return;
    }

    try {
      await userBlocks.ensureLoaded(this.pubkey);

      if (!userBlocks.isBlocked(targetHex)) {
        this.showSuccess("Creator already removed from your block list.");
      } else {
        await userBlocks.removeBlock(targetHex, this.pubkey);
        this.showSuccess("Creator removed from your block list.");
      }

      this.populateBlockedList();
      await this.loadVideos();
    } catch (error) {
      console.error(
        "Failed to remove creator from personal block list:",
        error
      );
      const message =
        error?.code === "nip04-missing"
          ? "Your Nostr extension must support NIP-04 to manage private lists."
          : "Failed to update your block list. Please try again.";
      this.showError(message);
    }
  }

  isAuthorBlocked(pubkey) {
    return userBlocks.isBlocked(pubkey);
  }

  async refreshAdminPaneState() {
    const adminNav = this.profileNavButtons.admin;
    const adminPane = this.profilePaneElements.admin;

    let loadError = null;
    this.setAdminLoading(true);
    this.showStatus("Fetching moderation filters…");
    try {
      await accessControl.ensureReady();
    } catch (error) {
      loadError = error;
    }

    const actorNpub = this.getCurrentUserNpub();
    const canEdit = !!actorNpub && accessControl.canEditAdminLists(actorNpub);
    const isSuperAdmin = !!actorNpub && accessControl.isSuperAdmin(actorNpub);

    if (adminNav instanceof HTMLElement) {
      adminNav.classList.toggle("hidden", !canEdit);
      if (!canEdit) {
        adminNav.setAttribute("aria-selected", "false");
      }
    }

    if (adminPane instanceof HTMLElement) {
      adminPane.classList.toggle("hidden", !canEdit);
      adminPane.setAttribute("aria-hidden", (!canEdit).toString());
    }

    if (loadError) {
      if (loadError?.code === "nostr-unavailable") {
        console.info("Moderation lists are still syncing with relays.");
        return;
      }

      console.error("Failed to load admin lists:", loadError);
      this.showStatus(null);
      this.showError("Unable to load moderation lists. Please try again.");
      this.clearAdminLists();
      this.setAdminLoading(false);
      return;
    }

    if (!canEdit) {
      this.clearAdminLists();
      if (typeof actorNpub !== "string" || !actorNpub) {
        this.currentUserNpub = null;
      }
      if (adminNav instanceof HTMLElement && adminNav.classList.contains("bg-gray-800")) {
        this.selectProfilePane("account");
      }
      this.showStatus(null);
      this.setAdminLoading(false);
      return;
    }

    if (this.adminModeratorsSection instanceof HTMLElement) {
      this.adminModeratorsSection.classList.toggle("hidden", !isSuperAdmin);
      this.adminModeratorsSection.setAttribute("aria-hidden", (!isSuperAdmin).toString());
    }
    this.populateAdminLists();
    this.showStatus(null);
    this.setAdminLoading(false);
  }

  storeAdminEmptyMessages() {
    const capture = (element) => {
      if (element instanceof HTMLElement && !element.dataset.defaultMessage) {
        element.dataset.defaultMessage = element.textContent || "";
      }
    };

    capture(this.adminModeratorsEmpty);
    capture(this.adminWhitelistEmpty);
    capture(this.adminBlacklistEmpty);
  }

  setAdminLoading(isLoading) {
    this.storeAdminEmptyMessages();
    if (this.profilePaneElements.admin instanceof HTMLElement) {
      this.profilePaneElements.admin.setAttribute(
        "aria-busy",
        isLoading ? "true" : "false"
      );
    }

    const toggleMessage = (element, message) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (isLoading) {
        element.textContent = message;
        element.classList.remove("hidden");
      } else {
        element.textContent = element.dataset.defaultMessage || element.textContent;
      }
    };

    toggleMessage(this.adminModeratorsEmpty, "Loading moderators…");
    toggleMessage(this.adminWhitelistEmpty, "Loading whitelist…");
    toggleMessage(this.adminBlacklistEmpty, "Loading blacklist…");
  }

  clearAdminLists() {
    this.storeAdminEmptyMessages();
    if (this.adminModeratorList) {
      this.adminModeratorList.innerHTML = "";
    }
    if (this.adminWhitelistList) {
      this.adminWhitelistList.innerHTML = "";
    }
    if (this.adminBlacklistList) {
      this.adminBlacklistList.innerHTML = "";
    }
    if (this.adminModeratorsEmpty instanceof HTMLElement) {
      this.adminModeratorsEmpty.textContent =
        this.adminModeratorsEmpty.dataset.defaultMessage ||
        this.adminModeratorsEmpty.textContent;
      this.adminModeratorsEmpty.classList.remove("hidden");
    }
    if (this.adminWhitelistEmpty instanceof HTMLElement) {
      this.adminWhitelistEmpty.textContent =
        this.adminWhitelistEmpty.dataset.defaultMessage ||
        this.adminWhitelistEmpty.textContent;
      this.adminWhitelistEmpty.classList.remove("hidden");
    }
    if (this.adminBlacklistEmpty instanceof HTMLElement) {
      this.adminBlacklistEmpty.textContent =
        this.adminBlacklistEmpty.dataset.defaultMessage ||
        this.adminBlacklistEmpty.textContent;
      this.adminBlacklistEmpty.classList.remove("hidden");
    }
  }

  renderAdminList(listEl, emptyEl, entries, options = {}) {
    if (!(listEl instanceof HTMLElement) || !(emptyEl instanceof HTMLElement)) {
      return;
    }

    const { onRemove, removeLabel = "Remove", confirmMessage, removable = true } =
      options;

    listEl.innerHTML = "";
    const values = Array.isArray(entries) ? [...entries] : [];
    values.sort((a, b) => a.localeCompare(b));

    if (!values.length) {
      emptyEl.classList.remove("hidden");
      listEl.classList.add("hidden");
      return;
    }

    emptyEl.classList.add("hidden");
    listEl.classList.remove("hidden");

    values.forEach((npub) => {
      const item = document.createElement("li");
      item.className =
        "flex flex-col gap-2 rounded-lg bg-gray-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between";

      const label = document.createElement("p");
      label.className = "text-sm font-medium text-gray-100 break-all";
      label.textContent = npub;
      item.appendChild(label);

      if (removable && typeof onRemove === "function") {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className =
          "self-start rounded-md bg-gray-700 px-3 py-1 text-xs font-medium text-gray-100 transition hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900";
        removeBtn.textContent = removeLabel;
        removeBtn.addEventListener("click", () => {
          if (confirmMessage) {
            const message = confirmMessage.replace("{npub}", npub);
            if (!window.confirm(message)) {
              return;
            }
          }
          removeBtn.disabled = true;
          removeBtn.setAttribute("aria-busy", "true");
          onRemove(npub, removeBtn);
        });
        item.appendChild(removeBtn);
      }

      listEl.appendChild(item);
    });
  }

  populateAdminLists() {
    const actorNpub = this.getCurrentUserNpub();
    if (!actorNpub || !accessControl.canEditAdminLists(actorNpub)) {
      this.clearAdminLists();
      return;
    }

    const isSuperAdmin = accessControl.isSuperAdmin(actorNpub);
    const editors = accessControl
      .getEditors()
      .filter((npub) => npub && npub !== ADMIN_SUPER_NPUB);
    const whitelist = accessControl.getWhitelist();
    const blacklist = accessControl.getBlacklist();

    this.renderAdminList(this.adminModeratorList, this.adminModeratorsEmpty, editors, {
      onRemove: (npub, button) => this.handleRemoveModerator(npub, button),
      removeLabel: "Remove",
      confirmMessage:
        "Remove moderator {npub}? They will immediately lose access to the admin panel.",
      removable: isSuperAdmin,
    });

    this.renderAdminList(this.adminWhitelistList, this.adminWhitelistEmpty, whitelist, {
      onRemove: (npub, button) =>
        this.handleAdminListMutation("whitelist", "remove", npub, button),
      removeLabel: "Remove",
      confirmMessage: "Remove {npub} from the whitelist?",
      removable: true,
    });

    this.renderAdminList(this.adminBlacklistList, this.adminBlacklistEmpty, blacklist, {
      onRemove: (npub, button) =>
        this.handleAdminListMutation("blacklist", "remove", npub, button),
      removeLabel: "Unblock",
      confirmMessage: "Remove {npub} from the blacklist?",
      removable: true,
    });
  }

  getCurrentUserNpub() {
    if (typeof this.currentUserNpub === "string" && this.currentUserNpub) {
      return this.currentUserNpub;
    }

    if (!this.pubkey) {
      return null;
    }

    const encoded = this.safeEncodeNpub(this.pubkey);
    if (encoded) {
      this.currentUserNpub = encoded;
    }
    return this.currentUserNpub;
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

  ensureAdminActor(requireSuperAdmin = false) {
    const actorNpub = this.getCurrentUserNpub();
    if (!actorNpub) {
      this.showError("Please login with a Nostr account to manage admin settings.");
      return null;
    }
    if (!accessControl.canEditAdminLists(actorNpub)) {
      this.showError("You do not have permission to manage BitVid moderation lists.");
      return null;
    }
    if (requireSuperAdmin && !accessControl.isSuperAdmin(actorNpub)) {
      this.showError("Only the Super Admin can manage moderators or whitelist mode.");
      return null;
    }
    return actorNpub;
  }

  async handleAddModerator() {
    let preloadError = null;
    try {
      await accessControl.ensureReady();
    } catch (error) {
      preloadError = error;
      console.error("Failed to load admin lists before adding moderator:", error);
    }

    if (preloadError) {
      this.showError(this.describeAdminError(preloadError.code || "storage-error"));
      return;
    }

    const actorNpub = this.ensureAdminActor(true);
    if (!actorNpub || !this.adminModeratorInput) {
      return;
    }

    const value = this.adminModeratorInput.value.trim();
    if (!value) {
      this.showError("Enter an npub to add as a moderator.");
      return;
    }

    if (this.adminAddModeratorBtn) {
      this.adminAddModeratorBtn.disabled = true;
      this.adminAddModeratorBtn.setAttribute("aria-busy", "true");
    }

    try {
      const result = await accessControl.addModerator(actorNpub, value);
      if (!result.ok) {
        this.showError(this.describeAdminError(result.error));
        return;
      }

      this.adminModeratorInput.value = "";
      this.showSuccess("Moderator added successfully.");
      await this.onAccessControlUpdated();
    } finally {
      if (this.adminAddModeratorBtn) {
        this.adminAddModeratorBtn.disabled = false;
        this.adminAddModeratorBtn.removeAttribute("aria-busy");
      }
    }
  }

  async handleRemoveModerator(npub, button) {
    let preloadError = null;
    try {
      await accessControl.ensureReady();
    } catch (error) {
      preloadError = error;
      console.error("Failed to load admin lists before removing moderator:", error);
    }

    if (preloadError) {
      this.showError(this.describeAdminError(preloadError.code || "storage-error"));
      if (button instanceof HTMLElement) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    const actorNpub = this.ensureAdminActor(true);
    if (!actorNpub) {
      if (button instanceof HTMLElement) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    const result = await accessControl.removeModerator(actorNpub, npub);
    if (!result.ok) {
      this.showError(this.describeAdminError(result.error));
      if (button instanceof HTMLElement) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      return;
    }

    this.showSuccess("Moderator removed.");
    await this.onAccessControlUpdated();
  }

  async handleAdminListMutation(listType, action, explicitNpub = null, sourceButton = null) {
    let preloadError = null;
    try {
      await accessControl.ensureReady();
    } catch (error) {
      preloadError = error;
      console.error("Failed to load admin lists before updating entries:", error);
    }

    if (preloadError) {
      this.showError(this.describeAdminError(preloadError.code || "storage-error"));
      if (sourceButton instanceof HTMLElement) {
        sourceButton.disabled = false;
        sourceButton.removeAttribute("aria-busy");
      }
      return;
    }

    const actorNpub = this.ensureAdminActor(false);
    if (!actorNpub) {
      if (sourceButton instanceof HTMLElement) {
        sourceButton.disabled = false;
        sourceButton.removeAttribute("aria-busy");
      }
      return;
    }

    const isWhitelist = listType === "whitelist";
    const input = isWhitelist ? this.adminWhitelistInput : this.adminBlacklistInput;
    const addButton = isWhitelist ? this.adminAddWhitelistBtn : this.adminAddBlacklistBtn;
    const isAdd = action === "add";

    let target = typeof explicitNpub === "string" ? explicitNpub.trim() : "";
    if (!target && input instanceof HTMLInputElement) {
      target = input.value.trim();
    }

    if (isAdd && !target) {
      this.showError("Enter an npub before adding it to the list.");
      if (sourceButton instanceof HTMLElement) {
        sourceButton.disabled = false;
        sourceButton.removeAttribute("aria-busy");
      }
      return;
    }

    const buttonToToggle = sourceButton || (isAdd ? addButton : null);
    if (buttonToToggle instanceof HTMLElement) {
      buttonToToggle.disabled = true;
      buttonToToggle.setAttribute("aria-busy", "true");
    }

    let result;
    if (isWhitelist) {
      result = isAdd
        ? await accessControl.addToWhitelist(actorNpub, target)
        : await accessControl.removeFromWhitelist(actorNpub, target);
    } else {
      result = isAdd
        ? await accessControl.addToBlacklist(actorNpub, target)
        : await accessControl.removeFromBlacklist(actorNpub, target);
    }

    if (!result.ok) {
      this.showError(this.describeAdminError(result.error));
      if (buttonToToggle instanceof HTMLElement) {
        buttonToToggle.disabled = false;
        buttonToToggle.removeAttribute("aria-busy");
      }
      return;
    }

    if (isAdd && input instanceof HTMLInputElement) {
      input.value = "";
    }

    const successMessage = isWhitelist
      ? isAdd
        ? "Added to the whitelist."
        : "Removed from the whitelist."
      : isAdd
      ? "Added to the blacklist."
      : "Removed from the blacklist.";
    this.showSuccess(successMessage);
    await this.onAccessControlUpdated();

    if (buttonToToggle instanceof HTMLElement) {
      buttonToToggle.disabled = false;
      buttonToToggle.removeAttribute("aria-busy");
    }

    if (isAdd) {
      try {
        const notifyResult = await this.sendAdminListNotification({
          listType,
          actorNpub,
          targetNpub: target,
        });
        if (!notifyResult?.ok) {
          const errorMessage = this.describeNotificationError(
            notifyResult?.error
          );
          if (errorMessage) {
            this.showError(errorMessage);
          }
          if (isDevMode && notifyResult?.error) {
            console.warn(
              "[admin] Failed to send list notification DM:",
              notifyResult
            );
          }
        }
      } catch (error) {
        console.error("Failed to send list notification DM:", error);
        if (isDevMode) {
          console.warn(
            "List update succeeded, but DM notification threw an unexpected error.",
            error
          );
        }
      }
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

  async sendAdminListNotification({ listType, actorNpub, targetNpub }) {
    const normalizedTarget = normalizeNpub(targetNpub);
    if (!normalizedTarget) {
      return { ok: false, error: "invalid-target" };
    }

    if (!this.pubkey) {
      return { ok: false, error: "missing-actor-pubkey" };
    }

    const actorHex = this.pubkey;
    const fallbackActor = this.safeEncodeNpub(actorHex) || "a BitVid moderator";
    const actorDisplay = normalizeNpub(actorNpub) || fallbackActor;
    const isWhitelist = listType === "whitelist";

    const introLine = isWhitelist
      ? `Great news—your npub ${normalizedTarget} has been added to the BitVid whitelist by ${actorDisplay}.`
      : `We wanted to let you know that your npub ${normalizedTarget} has been placed on the BitVid blacklist by ${actorDisplay}.`;

    const statusLine = isWhitelist
      ? `You now have full creator access across BitVid (${BITVID_WEBSITE_URL}).`
      : `This hides your channel and prevents uploads across BitVid (${BITVID_WEBSITE_URL}) for now.`;

    const followUpLine = isWhitelist
      ? "Please take a moment to review our community guidelines (https://bitvid.network/#view=community-guidelines), and reply to this DM if you have any questions."
      : "Please review our community guidelines (https://bitvid.network/#view=community-guidelines). If you believe this was a mistake, you can submit an appeal at https://bitvid.network/?modal=appeals to request reinstatement, or reply to this DM with any questions.";

    const messageBody = [
      "Hi there,",
      "",
      introLine,
      "",
      statusLine,
      "",
      followUpLine,
      "",
      "— The BitVid Team",
    ].join("\n");

    const message = `![BitVid status update](${ADMIN_DM_IMAGE_URL})\n\n${messageBody}`;

    return nostrClient.sendDirectMessage(
      normalizedTarget,
      message,
      actorHex
    );
  }

  async onAccessControlUpdated() {
    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      console.error("Failed to refresh admin pane after update:", error);
    }

    this.loadVideos(true).catch((error) => {
      console.error("Failed to refresh videos after admin update:", error);
    });
    window.dispatchEvent(new CustomEvent("bitvid:access-control-updated"));
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
        this.openProfileModal().catch((error) => {
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
          const { pubkey } = await this.authService.requestLogin();
          console.log("[NIP-07] login returned pubkey:", pubkey);

          if (pubkey) {
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

  attachVideoListHandler() {
    if (!this.videoListView) {
      return;
    }
    if (!this.videoList) {
      this.videoList = document.getElementById("videoList");
    }
    this.videoListView.setContainer(this.videoList || null);
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

    const title = (payload?.title || "").trim();
    const url = (payload?.url || "").trim();
    const magnet = (payload?.magnet || "").trim();
    const thumbnail = (payload?.thumbnail || "").trim();
    const description = (payload?.description || "").trim();
    const ws = (payload?.ws || "").trim();
    const xs = (payload?.xs || "").trim();
    const enableComments =
      payload?.enableComments === false
        ? false
        : payload?.enableComments === true
          ? true
          : true;

    const formData = {
      version: 3,
      title,
      url,
      magnet,
      thumbnail,
      description,
      mode: isDevMode ? "dev" : "live",
      enableComments,
    };

    if (!formData.title || (!formData.url && !formData.magnet)) {
      this.showError("Title and at least one of URL or Magnet is required.");
      return false;
    }

    if (formData.url && !/^https:\/\//i.test(formData.url)) {
      this.showError("Hosted video URLs must use HTTPS.");
      return false;
    }

    if (formData.magnet) {
      const normalizedMagnet = normalizeAndAugmentMagnet(formData.magnet, {
        ws,
        xs,
      });
      formData.magnet = normalizedMagnet;
      const hints = extractMagnetHints(normalizedMagnet);
      formData.ws = hints.ws;
      formData.xs = hints.xs;
    } else {
      formData.ws = "";
      formData.xs = "";
    }

    try {
      await nostrService.publishVideoNote(formData, this.pubkey);
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

  /**
   * Removes a saved profile entry and clears the active pointer when it matches
   * the removed pubkey. Intended for the profile-switcher UI to prune old
   * accounts without touching cached avatars.
   */
  removeSavedProfile(pubkey) {
    const { removed } = this.authService.removeSavedProfile(pubkey);
    if (removed) {
      this.renderSavedProfiles();
    }
  }

  async switchProfile(pubkey) {
    try {
      const result = await this.authService.switchProfile(pubkey);
      if (!result?.switched) {
        this.hideProfileModal();
        return;
      }
    } catch (error) {
      console.error("Failed to switch profiles:", error);
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to switch profiles. Please try again.";
      this.showError(message);
      return;
    }

    this.profileSwitcherSelectionPubkey = null;
    this.renderSavedProfiles();
    this.hideProfileModal();
  }

  updateActiveProfileUI(pubkey, profile = {}) {
    const displayName = profile.name || "User";
    const picture = profile.picture || "assets/svg/default-profile.svg";

    if (this.profileAvatar) {
      this.profileAvatar.src = picture;
    }
    if (this.profileModalName) {
      this.profileModalName.textContent = displayName;
    }
    if (this.profileModalAvatar) {
      this.profileModalAvatar.src = picture;
    }
    if (this.profileModalNpub) {
      const encoded = this.safeEncodeNpub(pubkey);
      this.profileModalNpub.textContent = encoded
        ? truncateMiddle(encoded, 48)
        : "Not signed in";
    }

    if (this.profileChannelLink) {
      const targetNpub = this.safeEncodeNpub(pubkey);
      if (targetNpub) {
        this.profileChannelLink.href = `#view=channel-profile&npub=${targetNpub}`;
        this.profileChannelLink.dataset.targetNpub = targetNpub;
        this.profileChannelLink.classList.remove("hidden");
      } else {
        this.profileChannelLink.removeAttribute("href");
        delete this.profileChannelLink.dataset.targetNpub;
        this.profileChannelLink.classList.add("hidden");
      }
    }
  }

  async handleAuthLogin(detail = {}) {
    if (detail?.identityChanged) {
      this.resetViewLoggingState();
    }

    this.renderSavedProfiles();

    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      console.warn("Failed to refresh admin pane after login:", error);
    }

    this.populateBlockedList();
    this.populateProfileRelays();

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

    await this.loadVideos();
    this.forceRefreshAllProfiles();
    if (this.uploadModal?.refreshCloudflareBucketPreview) {
      await this.uploadModal.refreshCloudflareBucketPreview();
    }
  }

  async handleAuthLogout(detail = {}) {
    this.resetViewLoggingState();

    this.renderSavedProfiles();

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

    if (this.profileChannelLink) {
      this.profileChannelLink.classList.add("hidden");
      this.profileChannelLink.removeAttribute("href");
      delete this.profileChannelLink.dataset.targetNpub;
    }

    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.add("hidden");
    }

    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      console.warn("Failed to refresh admin pane after logout:", error);
    }

    this.populateBlockedList();
    this.populateProfileRelays();

    await this.loadVideos();
    this.forceRefreshAllProfiles();
    if (this.uploadModal?.refreshCloudflareBucketPreview) {
      await this.uploadModal.refreshCloudflareBucketPreview();
    }
  }

  handleProfileUpdated(detail = {}) {
    if (Array.isArray(detail?.savedProfiles)) {
      this.renderSavedProfiles();
    }

    const normalizedPubkey = detail?.pubkey
      ? this.normalizeHexPubkey(detail.pubkey)
      : null;
    const profile = detail?.profile;

    if (normalizedPubkey && profile) {
      this.updateProfileInDOM(normalizedPubkey, profile);
      if (this.normalizeHexPubkey(this.pubkey) === normalizedPubkey) {
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
          nostrService.clearVideoSubscription();
          this.videoSubscription = nostrService.getVideoSubscription() || null;
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

  buildPointerFromDataset(dataset = {}) {
    if (!dataset || typeof dataset !== "object") {
      return null;
    }

    const typeValue = typeof dataset.pointerType === "string" ? dataset.pointerType : "";
    const normalizedType = typeValue === "a" ? "a" : typeValue === "e" ? "e" : "";
    const value =
      typeof dataset.pointerValue === "string" && dataset.pointerValue.trim()
        ? dataset.pointerValue.trim()
        : "";

    if (!normalizedType || !value) {
      return null;
    }

    const pointer = { type: normalizedType, value };

    if (typeof dataset.pointerRelay === "string" && dataset.pointerRelay.trim()) {
      pointer.relay = dataset.pointerRelay.trim();
    }

    if (typeof dataset.pointerWatchedAt === "string" && dataset.pointerWatchedAt) {
      const parsed = Number.parseInt(dataset.pointerWatchedAt, 10);
      if (Number.isFinite(parsed)) {
        pointer.watchedAt = parsed;
      }
    }

    if (dataset.pointerSession === "true") {
      pointer.session = true;
    }

    return pointer;
  }

  async handleRemoveHistoryAction(dataset = {}, { trigger } = {}) {
    const pointer = this.buildPointerFromDataset(dataset);
    const pointerKeyValue =
      typeof dataset.pointerKey === "string" && dataset.pointerKey.trim()
        ? dataset.pointerKey.trim()
        : pointer
        ? derivePointerKey(normalizePointerInput(pointer)) || ""
        : "";

    if (!pointerKeyValue) {
      this.showError("Unable to determine which history entry to remove.");
      return;
    }

    const payload = {
      removed: {
        pointer,
        pointerKey: pointerKeyValue,
      },
      reason: dataset.reason || "remove-item",
    };

    let card = null;
    if (trigger instanceof HTMLElement) {
      card = trigger.closest(".video-card");
      if (card instanceof HTMLElement) {
        card.dataset.historyRemovalPending = "true";
        card.classList.add("opacity-60");
        card.classList.add("pointer-events-none");
      }
    }

    try {
      await this.handleWatchHistoryRemoval(payload);
    } catch (error) {
      if (card instanceof HTMLElement) {
        delete card.dataset.historyRemovalPending;
        card.classList.remove("opacity-60", "pointer-events-none");
      }
      if (!error?.handled) {
        this.showError("Failed to remove from history. Please try again.");
      }
      return;
    }

    if (card instanceof HTMLElement) {
      delete card.dataset.historyRemovalPending;
      card.classList.remove("opacity-60", "pointer-events-none");
      if (dataset.removeCard === "true") {
        card.remove();
      }
    }
  }

  async handleWatchHistoryRemoval(payload = {}) {
    if (!watchHistoryService?.isEnabled?.()) {
      const error = new Error("watch-history-disabled");
      error.handled = true;
      this.showError("Watch history sync is not available right now.");
      throw error;
    }

    const reason =
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim()
        : "remove-item";

    const actorCandidate =
      typeof payload.actor === "string" && payload.actor.trim()
        ? payload.actor.trim()
        : typeof this.pubkey === "string" && this.pubkey.trim()
        ? this.pubkey.trim()
        : typeof nostrClient?.sessionActor?.pubkey === "string" &&
          nostrClient.sessionActor.pubkey
        ? nostrClient.sessionActor.pubkey
        : "";

    const removedPointerRaw =
      payload?.removed?.pointer || payload?.removed?.raw || payload?.removed || null;
    const removedPointerNormalized = normalizePointerInput(removedPointerRaw);
    let removedPointerKey =
      typeof payload?.removed?.pointerKey === "string"
        ? payload.removed.pointerKey
        : "";
    if (!removedPointerKey && removedPointerNormalized) {
      removedPointerKey = derivePointerKey(removedPointerNormalized) || "";
    }

    if (removedPointerKey) {
      this.dropWatchHistoryMetadata(removedPointerKey);
    }

    const normalizeEntry = (entry) => {
      if (!entry) {
        return null;
      }
      const pointer = normalizePointerInput(entry.pointer || entry);
      if (!pointer) {
        return null;
      }
      if (Number.isFinite(entry.watchedAt)) {
        pointer.watchedAt = Math.floor(entry.watchedAt);
      } else if (Number.isFinite(entry.pointer?.watchedAt)) {
        pointer.watchedAt = Math.floor(entry.pointer.watchedAt);
      }
      if (entry.pointer?.session === true || entry.session === true) {
        pointer.session = true;
      }
      return pointer;
    };

    let normalizedItems = null;

    if (Array.isArray(payload.items) && payload.items.length) {
      normalizedItems = payload.items.map(normalizeEntry).filter(Boolean);
    }

    if (!normalizedItems) {
      try {
        const latest = await watchHistoryService.loadLatest(actorCandidate);
        normalizedItems = Array.isArray(latest)
          ? latest.map(normalizeEntry).filter(Boolean)
          : [];
      } catch (error) {
        this.showError("Failed to load watch history. Please try again.");
        if (error && typeof error === "object") {
          error.handled = true;
        }
        throw error;
      }
    }

    if (removedPointerKey) {
      normalizedItems = normalizedItems.filter((entry) => {
        try {
          return derivePointerKey(entry) !== removedPointerKey;
        } catch (error) {
          return true;
        }
      });
    }

    this.showSuccess("Removing from history…");

    try {
      const snapshotResult = await watchHistoryService.snapshot(normalizedItems, {
        actor: actorCandidate || undefined,
        reason,
      });

      try {
        await nostrClient.updateWatchHistoryList(normalizedItems, {
          actorPubkey: actorCandidate || undefined,
          replace: true,
          source: reason,
        });
      } catch (updateError) {
        if (isDevMode) {
          console.warn(
            "[watchHistory] Failed to update local watch history list:",
            updateError,
          );
        }
      }

      this.showSuccess(
        "Removed from encrypted history. Relay sync may take a moment.",
      );

      return { handledToasts: true, snapshot: snapshotResult };
    } catch (error) {
      let message = "Failed to remove from history. Please try again.";
      if (error?.result?.retryable) {
        message =
          "Removal will retry once encrypted history is accepted by your relays.";
      }
      this.showError(message);
      if (error && typeof error === "object") {
        error.handled = true;
      }
      throw error;
    }
  }

  flushWatchHistory(reason = "session-end", context = "watch-history") {
    if (!watchHistoryService?.isEnabled?.()) {
      return Promise.resolve();
    }
    try {
      const result = watchHistoryService.snapshot(undefined, { reason });
      return Promise.resolve(result).catch((error) => {
        if (isDevMode) {
          console.warn(`[${context}] Watch history flush failed:`, error);
        }
        throw error;
      });
    } catch (error) {
      if (isDevMode) {
        console.warn(`[${context}] Failed to queue watch history flush:`, error);
      }
      return Promise.reject(error);
    }
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

  setModalZapVisibility(visible) {
    if (this.videoModal) {
      this.videoModal.setZapVisibility(visible);
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
    // 1) Clear intervals, cleanup, etc. (unchanged)
    this.cancelPendingViewLogging();
    this.clearActiveIntervals();
    this.teardownModalViewCountSubscription();

    try {
      await fetch("/webtorrent/cancel/", { mode: "no-cors" });
    } catch (err) {
      // ignore
    }
    await this.cleanup({
      preserveSubscriptions: true,
      preserveObservers: true,
    });

    if (this.videoModal) {
      this.videoModal.close();
    }
    this.currentMagnetUri = null;

    // 3) Remove only `?v=` but **keep** the hash
    const url = new URL(window.location.href);
    url.searchParams.delete("v"); // remove ?v= param
    const newUrl = url.pathname + url.search + url.hash;
    window.history.replaceState({}, "", newUrl);
  }

  /**
   * Subscribe to videos (older + new) and render them as they come in.
   */
  async loadVideos(forceFetch = false) {
    console.log("Starting loadVideos... (forceFetch =", forceFetch, ")");

    if (this.videoList) {
      this.videoList.innerHTML = getSidebarLoadingMarkup(
        "Fetching recent videos…"
      );
    }

    const videos = await nostrService.loadVideos({
      forceFetch,
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
      onVideos: (payload) => this.renderVideoList(payload),
    });

    if (!Array.isArray(videos) || videos.length === 0) {
      this.renderVideoList([]);
    }

    this.videoSubscription = nostrService.getVideoSubscription() || null;
    this.videosMap = nostrService.getVideosMap();
    if (this.videoListView) {
      this.videoListView.state.videosMap = this.videosMap;
    }
  }

  async loadOlderVideos(lastTimestamp) {
    const olderVideos = await nostrService.loadOlderVideos(lastTimestamp, {
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
    });

    if (!Array.isArray(olderVideos) || olderVideos.length === 0) {
      this.showSuccess("No more older videos found.");
      return;
    }

    const all = nostrService.getFilteredActiveVideos({
      blacklistedEventIds: this.blacklistedEventIds,
      isAuthorBlocked: (pubkey) => this.isAuthorBlocked(pubkey),
    });
    this.renderVideoList(all);
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

  async renderVideoList(videos) {
    if (!this.videoListView) {
      return;
    }

    if (!this.videoList) {
      this.videoList = document.getElementById("videoList");
      this.videoListView.setContainer(this.videoList || null);
    }

    this.videoListView.render(videos);
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

          this.populateBlockedList();
          await this.loadVideos();
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
  async handleEditVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
      const latestVideos = await nostrService.fetchVideos({
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
      const activeVideos = await nostrService.fetchVideos({
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
      const all = nostrService.getFilteredActiveVideos({
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

      await nostrService.handleFullDeleteVideo({
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
    await this.waitForCleanup();
    this.cancelPendingViewLogging();

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";

    if (!this.modalVideo) {
      throw new Error("Video element is not ready for playback.");
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

    const modalVideoEl = this.modalVideo;
    const refreshedModal = this.teardownVideoElement(modalVideoEl, {
      replaceNode: true,
    });
    if (refreshedModal) {
      this.modalVideo = refreshedModal;
    }

    const session = this.playbackService.createSession({
      url: sanitizedUrl,
      magnet: trimmedMagnet,
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

    const result = await session.start();

    if (!result || result.error) {
      return result;
    }

    return result;
  }


  async playVideoByEventId(eventId) {
    if (!eventId) {
      this.showError("No video identifier provided.");
      return;
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
      this.showError("Video not found or has been removed.");
      return;
    }

    try {
      await accessControl.ensureReady();
    } catch (error) {
      console.warn("Failed to ensure admin lists were loaded before playback:", error);
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

    if (
      video.isPrivate &&
      video.pubkey === this.pubkey &&
      !video.alreadyDecrypted
    ) {
      video.magnet = fakeDecrypt(video.magnet);
      video.alreadyDecrypted = true;
    }

    const trimmedUrl = typeof video.url === "string" ? video.url.trim() : "";
    const rawMagnet =
      typeof video.magnet === "string" ? video.magnet.trim() : "";
    const legacyInfoHash =
      typeof video.infoHash === "string" ? video.infoHash.trim().toLowerCase() : "";
    const magnetCandidate = rawMagnet || legacyInfoHash;
    const decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
    const usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
    const magnetSupported = isValidMagnetUri(usableMagnetCandidate);
    const sanitizedMagnet = magnetSupported ? usableMagnetCandidate : "";

    trackVideoView({
      videoId: video.id || eventId,
      title: video.title || "Untitled",
      source: "event",
      hasMagnet: !!sanitizedMagnet,
      hasUrl: !!trimmedUrl,
    });

    this.currentVideo = {
      ...video,
      url: trimmedUrl,
      magnet: sanitizedMagnet,
      originalMagnet: magnetCandidate,
      torrentSupported: magnetSupported,
      legacyInfoHash: video.legacyInfoHash || legacyInfoHash,
      lightningAddress: null,
    };

    const dTagValue = (this.extractDTagValue(video.tags) || "").trim();
    const normalizedPubkey =
      typeof video.pubkey === "string" ? video.pubkey.trim() : "";
    const primaryPointer =
      dTagValue && normalizedPubkey
        ? [
            "a",
            `${
              typeof video.kind === "number" && Number.isFinite(video.kind)
                ? video.kind
                : 30078
            }:${normalizedPubkey}:${dTagValue}`,
          ]
        : null;
    const fallbackId =
      typeof (video.id || eventId) === "string"
        ? (video.id || eventId).trim()
        : "";
    const fallbackPointer = fallbackId ? ["e", fallbackId] : null;

    let resolvedPointer = null;
    let resolvedPointerKey = "";
    const pointerCandidates = [];
    if (primaryPointer) {
      pointerCandidates.push(primaryPointer);
    }
    if (fallbackPointer) {
      pointerCandidates.push(fallbackPointer);
    }

    for (const candidate of pointerCandidates) {
      const key = pointerArrayToKey(candidate);
      if (key) {
        resolvedPointer = candidate;
        resolvedPointerKey = key;
        break;
      }
    }

    this.currentVideoPointer = resolvedPointer && resolvedPointerKey
      ? resolvedPointer
      : null;
    this.currentVideoPointerKey = this.currentVideoPointer
      ? resolvedPointerKey
      : null;

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

    this.setModalZapVisibility(false);
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

    this.setModalZapVisibility(!!lightningAddress);
    if (this.currentVideo) {
      this.currentVideo.lightningAddress = lightningAddress || null;
    }

    const creatorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
    if (this.videoModal) {
      const formattedTimestamp = this.formatTimeAgo(video.created_at);
      const displayNpub = `${creatorNpub.slice(0, 8)}...${creatorNpub.slice(-4)}`;
      this.videoModal.updateMetadata({
        title: video.title || "Untitled",
        description: video.description || "No description available.",
        timestamp: formattedTimestamp,
        creator: {
          name: creatorProfile.name,
          avatarUrl: creatorProfile.picture,
          npub: displayNpub,
        },
      });
    }

    await this.playVideoWithFallback({
      url: trimmedUrl,
      magnet: usableMagnetCandidate,
    });
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

    this.setModalZapVisibility(false);

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

    const urlObj = new URL(window.location.href);
    urlObj.searchParams.delete("v");
    const cleaned = `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    window.history.replaceState({}, "", cleaned);

    await this.playVideoWithFallback({
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
    return nostrService.getOldEventById(eventId);
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
function dedupeToNewestByRoot(videos) {
  const map = new Map(); // key = rootId, value = newest video for that root

  for (const vid of videos) {
    // If there's no videoRootId, fall back to vid.id (treat it as its own "root")
    const rootId = vid.videoRootId || vid.id;

    const existing = map.get(rootId);
    if (!existing || vid.created_at > existing.created_at) {
      map.set(rootId, vid);
    }
  }

  // Return just the newest from each group
  return Array.from(map.values());
}

export const app = new bitvidApp();
export const appReady = app.init();

if (typeof window !== "undefined") {
  window.app = app;
  window.appReady = appReady;
  window.bitvid = window.bitvid || {};
  window.bitvid.app = app;
  window.bitvid.appReady = appReady;
}
