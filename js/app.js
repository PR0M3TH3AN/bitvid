// js/app.js

import { loadView } from "./viewManager.js";
import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode } from "./config.js";
import { isWhitelistEnabled } from "./config.js";
import { safeDecodeMagnet } from "./magnetUtils.js";
import { normalizeAndAugmentMagnet } from "./magnet.js";
import { deriveTorrentPlaybackConfig } from "./playbackUtils.js";
import { URL_FIRST_ENABLED } from "./constants.js";
import { trackVideoView } from "./analytics.js";
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import {
  initialWhitelist,
  initialBlacklist,
  initialEventBlacklist,
} from "./lists.js";
import {
  loadR2Settings,
  saveR2Settings,
  clearR2Settings,
  buildR2Key,
  buildPublicUrl,
  mergeBucketEntry,
  sanitizeBaseDomain,
} from "./r2.js";
import {
  sanitizeBucketName,
  ensureBucket,
  putCors,
  attachCustomDomainAndWait,
  setManagedDomain,
  deriveShortSubdomain,
} from "./storage/r2-mgmt.js";
import {
  makeR2Client,
  multipartUpload,
  ensureBucketCors,
} from "./storage/r2-s3.js";
import { initQuickR2Upload } from "./r2-quick.js";

function truncateMiddle(text, maxLength = 72) {
  if (!text || typeof text !== "string") {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  const ellipsis = "…";
  const charsToShow = maxLength - ellipsis.length;
  const front = Math.ceil(charsToShow / 2);
  const back = Math.floor(charsToShow / 2);
  return `${text.slice(0, front)}${ellipsis}${text.slice(text.length - back)}`;
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
const TRACKING_SCRIPT_PATTERN = /(?:^|\/)tracking\.js(?:$|\?)/;
const EMPTY_VIDEO_LIST_SIGNATURE = "__EMPTY__";
const PROFILE_CACHE_STORAGE_KEY = "bitvid:profileCache:v1";
const PROFILE_CACHE_VERSION = 1;
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// We probe hosted URLs often enough that a naive implementation would spam
// remote CDNs. A medium-lived cache (roughly 45 minutes) keeps us from
// hammering dead hosts while still giving the UI timely updates when a CDN
// recovers. Results are stored both in-memory and in localStorage so other
// views can reuse them without re-probing.
const URL_HEALTH_TTL_MS = 45 * 60 * 1000; // 45 minutes
const URL_HEALTH_TIMEOUT_RETRY_MS = 5 * 60 * 1000; // 5 minutes
const URL_PROBE_TIMEOUT_MS = 8 * 1000; // 8 seconds
const URL_PROBE_TIMEOUT_RETRY_MS = 15 * 1000; // 15 seconds
const URL_HEALTH_STORAGE_PREFIX = "bitvid:urlHealth:";
const urlHealthCache = new Map();
const urlHealthInFlight = new Map();

function removeTrackingScripts(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }

  root.querySelectorAll("script[src]").forEach((script) => {
    const src = script.getAttribute("src") || "";
    if (TRACKING_SCRIPT_PATTERN.test(src)) {
      script.remove();
    }
  });
}

function getUrlHealthStorageKey(eventId) {
  return `${URL_HEALTH_STORAGE_PREFIX}${eventId}`;
}

function readUrlHealthFromStorage(eventId) {
  if (!eventId || typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(getUrlHealthStorageKey(eventId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (err) {
    console.warn(`Failed to parse stored URL health for ${eventId}:`, err);
  }

  removeUrlHealthFromStorage(eventId);
  return null;
}

function writeUrlHealthToStorage(eventId, entry) {
  if (!eventId || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      getUrlHealthStorageKey(eventId),
      JSON.stringify(entry)
    );
  } catch (err) {
    console.warn(`Failed to persist URL health for ${eventId}:`, err);
  }
}

function removeUrlHealthFromStorage(eventId) {
  if (!eventId || typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getUrlHealthStorageKey(eventId));
  } catch (err) {
    console.warn(`Failed to remove URL health for ${eventId}:`, err);
  }
}

function isUrlHealthEntryFresh(entry, url) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const now = Date.now();
  if (typeof entry.expiresAt !== "number" || entry.expiresAt <= now) {
    return false;
  }

  if (url && entry.url && entry.url !== url) {
    return false;
  }

  return true;
}

/**
 * Returns the cached health result for a given event ID when the entry is
 * still "fresh". Entries are evicted eagerly once their TTL expires or when
 * the associated URL changes (e.g. a user edits the post to point elsewhere).
 */
function readUrlHealthFromCache(eventId, url) {
  if (!eventId) {
    return null;
  }

  const entry = urlHealthCache.get(eventId);
  if (isUrlHealthEntryFresh(entry, url)) {
    return entry;
  }

  if (entry) {
    urlHealthCache.delete(eventId);
  }

  const stored = readUrlHealthFromStorage(eventId);
  if (!isUrlHealthEntryFresh(stored, url)) {
    if (stored) {
      removeUrlHealthFromStorage(eventId);
    }
    return null;
  }

  urlHealthCache.set(eventId, stored);
  return stored;
}

/**
 * Stores a health result and calculates the expiry moment. The TTL lasts for
 * roughly three quarters of an hour so we recover quickly when a CDN returns
 * while still avoiding redundant probes during render thrash.
*/
function writeUrlHealthToCache(eventId, url, result, ttlMs = URL_HEALTH_TTL_MS) {
  if (!eventId) {
    return null;
  }

  const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : URL_HEALTH_TTL_MS;
  const now = Date.now();
  const entry = {
    status: result?.status || "checking",
    message: result?.message || "Checking hosted URL…",
    url: url || result?.url || "",
    expiresAt: now + ttl,
    lastCheckedAt: now,
  };
  urlHealthCache.set(eventId, entry);
  writeUrlHealthToStorage(eventId, entry);
  return entry;
}

/**
 * Tracks in-flight probe promises so that multiple cards rendering the same
 * event simultaneously do not all fire off duplicate requests. The stored
 * metadata includes the URL so edits invalidate the old request immediately.
 */
function buildUrlProbeKey(url, options = {}) {
  const trimmed = typeof url === "string" ? url : "";
  const mode = options?.confirmPlayable ? "playable" : "basic";
  return `${trimmed}::${mode}`;
}

function setInFlightUrlProbe(eventId, url, promise, options = {}) {
  if (!eventId || !promise) {
    return;
  }

  const key = buildUrlProbeKey(url, options);
  urlHealthInFlight.set(eventId, { promise, key });
  promise.finally(() => {
    const current = urlHealthInFlight.get(eventId);
    if (current && current.promise === promise) {
      urlHealthInFlight.delete(eventId);
    }
  });
}

function getInFlightUrlProbe(eventId, url, options = {}) {
  if (!eventId) {
    return null;
  }

  const entry = urlHealthInFlight.get(eventId);
  if (!entry) {
    return null;
  }

  const key = buildUrlProbeKey(url, options);
  if (entry.key && entry.key !== key) {
    return null;
  }

  return entry.promise;
}
// NOTE: The modal uses a "please stand by" animated poster while the torrent
// or direct URL boots up. We've regressed multiple times by forgetting to clear
// that poster once playback starts, which leaves the loading GIF covering the
// video even though audio is playing. Centralising the cleanup logic makes it
// easier to spot those regressions; see forceRemoveModalPoster() below.
const MODAL_LOADING_POSTER = "assets/gif/please-stand-by.gif";

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
  constructor() {
    // Basic auth/display elements
    this.loginButton = document.getElementById("loginButton") || null;
    this.logoutButton = document.getElementById("logoutButton") || null;
    this.userStatus = document.getElementById("userStatus") || null;
    this.userPubKey = document.getElementById("userPubKey") || null;

    // Lazy-loading helper for images
    this.mediaLoader = new MediaLoader();
    this.loadedThumbnails = new Map();
    this.activeIntervals = [];
    this.urlPlaybackWatchdogCleanup = null;

    // Optional: a "profile" button or avatar (if used)
    this.profileButton = document.getElementById("profileButton") || null;
    this.profileAvatar = document.getElementById("profileAvatar") || null;

    // Profile modal references (if used in profile-modal.html)
    this.profileModal = null;
    this.closeProfileModal = null;
    this.profileLogoutBtn = null;
    this.profileModalAvatar = null;
    this.profileModalName = null;

    // Upload modal elements
    this.uploadButton = document.getElementById("uploadButton") || null;
    this.uploadModal = document.getElementById("uploadModal") || null;
    this.closeUploadModalBtn =
      document.getElementById("closeUploadModal") || null;
    this.uploadForm = document.getElementById("uploadForm") || null;
    this.uploadModeToggleButtons = [];
    this.customUploadSection = null;
    this.cloudflareUploadSection = null;
    this.activeUploadMode = "custom";
    this.cloudflareSettings = null;
    this.cloudflareSettingsForm = null;
    this.cloudflareClearSettingsButton = null;
    this.cloudflareSettingsStatus = null;
    this.cloudflareBucketPreview = null;
    this.cloudflareUploadForm = null;
    this.cloudflareFileInput = null;
    this.cloudflareUploadButton = null;
    this.cloudflareUploadStatus = null;
    this.cloudflareProgressBar = null;
    this.cloudflareProgressFill = null;
    this.cloudflareTitleInput = null;
    this.cloudflareDescriptionInput = null;
    this.cloudflareThumbnailInput = null;
    this.cloudflareMagnetInput = null;
    this.cloudflareWsInput = null;
    this.cloudflareXsInput = null;
    this.cloudflareAdvancedToggle = null;
    this.cloudflareAdvancedToggleLabel = null;
    this.cloudflareAdvancedToggleIcon = null;
    this.cloudflareAdvancedFields = null;
    this.cloudflareAdvancedVisible = false;
    this.r2AccountIdInput = null;
    this.r2AccessKeyIdInput = null;
    this.r2SecretAccessKeyInput = null;
    this.r2ApiTokenInput = null;
    this.r2ZoneIdInput = null;
    this.r2BaseDomainInput = null;

    // Optional small inline player stats
    this.status = document.getElementById("status") || null;
    this.progressBar = document.getElementById("progress") || null;
    this.peers = document.getElementById("peers") || null;
    this.speed = document.getElementById("speed") || null;
    this.downloaded = document.getElementById("downloaded") || null;

    // Video player modal references (loaded via video-modal.html)
    this.playerModal = null;
    this.modalVideo = null;
    this.modalStatus = null;
    this.modalProgress = null;
    this.modalPeers = null;
    this.modalSpeed = null;
    this.modalDownloaded = null;
    this.closePlayerBtn = null;
    this.videoTitle = null;
    this.videoDescription = null;
    this.videoTimestamp = null;
    this.creatorAvatar = null;
    this.creatorName = null;
    this.creatorNpub = null;
    this.copyMagnetBtn = null;
    this.shareBtn = null;
    this.modalZapBtn = null;
    this.modalPosterCleanup = null;
    this.cleanupPromise = null;

    // Hide/Show Subscriptions Link
    this.subscriptionsLink = null;

    // Notification containers
    this.errorContainer = document.getElementById("errorContainer") || null;
    this.successContainer = document.getElementById("successContainer") || null;

    // Auth state
    this.pubkey = null;
    this.currentMagnetUri = null;
    this.currentVideo = null;
    this.videoSubscription = null;
    this.videoList = null;
    this._videoListElement = null;
    this._videoListClickHandler = null;

    // Videos stored as a Map (key=event.id)
    this.videosMap = new Map();
    // Simple cache for user profiles
    this.profileCache = new Map();
    this.lastRenderedVideoSignature = null;
    this._lastRenderedVideoListElement = null;
    this.renderedVideoIds = new Set();

    // NEW: reference to the login modal's close button
    this.closeLoginModalBtn =
      document.getElementById("closeLoginModal") || null;

    // Build a set of blacklisted event IDs (hex) from nevent strings, skipping empties
    this.blacklistedEventIds = new Set();
    for (const neventStr of initialEventBlacklist) {
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
  }

  loadProfileCacheFromStorage() {
    if (typeof localStorage === "undefined") {
      return;
    }

    const now = Date.now();
    const raw = localStorage.getItem(PROFILE_CACHE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return;
      }

      if (parsed.version !== PROFILE_CACHE_VERSION) {
        return;
      }

      const entries = parsed.entries;
      if (!entries || typeof entries !== "object") {
        return;
      }

      for (const [pubkey, entry] of Object.entries(entries)) {
        if (!pubkey || !entry || typeof entry !== "object") {
          continue;
        }

        const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
        if (!timestamp || now - timestamp > PROFILE_CACHE_TTL_MS) {
          continue;
        }

        const profile = entry.profile;
        if (!profile || typeof profile !== "object") {
          continue;
        }

        const normalized = {
          name: profile.name || profile.display_name || "Unknown",
          picture: profile.picture || "assets/svg/default-profile.svg",
        };

        this.profileCache.set(pubkey, {
          profile: normalized,
          timestamp,
        });
      }
    } catch (err) {
      console.warn("Failed to parse stored profile cache:", err);
    }
  }

  persistProfileCacheToStorage() {
    if (typeof localStorage === "undefined") {
      return;
    }

    const now = Date.now();
    const entries = {};

    for (const [pubkey, entry] of this.profileCache.entries()) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
      if (!timestamp || now - timestamp > PROFILE_CACHE_TTL_MS) {
        this.profileCache.delete(pubkey);
        continue;
      }

      entries[pubkey] = {
        profile: entry.profile,
        timestamp,
      };
    }

    const payload = {
      version: PROFILE_CACHE_VERSION,
      savedAt: now,
      entries,
    };

    if (Object.keys(entries).length === 0) {
      try {
        localStorage.removeItem(PROFILE_CACHE_STORAGE_KEY);
      } catch (err) {
        console.warn("Failed to clear profile cache storage:", err);
      }
      return;
    }

    try {
      localStorage.setItem(PROFILE_CACHE_STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to persist profile cache:", err);
    }
  }

  getProfileCacheEntry(pubkey) {
    if (!pubkey) {
      return null;
    }

    const entry = this.profileCache.get(pubkey);
    if (!entry) {
      return null;
    }

    const timestamp = typeof entry.timestamp === "number" ? entry.timestamp : 0;
    if (!timestamp || Date.now() - timestamp > PROFILE_CACHE_TTL_MS) {
      this.profileCache.delete(pubkey);
      this.persistProfileCacheToStorage();
      return null;
    }

    return entry;
  }

  setProfileCacheEntry(pubkey, profile) {
    if (!pubkey || !profile) {
      return;
    }

    const normalized = {
      name: profile.name || profile.display_name || "Unknown",
      picture: profile.picture || "assets/svg/default-profile.svg",
    };

    const entry = {
      profile: normalized,
      timestamp: Date.now(),
    };

    this.profileCache.set(pubkey, entry);
    this.persistProfileCacheToStorage();
    return entry;
  }

  forceRefreshAllProfiles() {
    // 1) Grab the newest set of videos from nostrClient
    const activeVideos = nostrClient.getActiveVideos();

    // 2) Build a unique set of pubkeys
    const uniqueAuthors = new Set(activeVideos.map((v) => v.pubkey));

    // 3) For each author, fetchAndRenderProfile with forceRefresh = true
    for (const authorPubkey of uniqueAuthors) {
      this.fetchAndRenderProfile(authorPubkey, true);
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

      this.loadProfileCacheFromStorage();

      // 1. Initialize the video modal (components/video-modal.html)
      await this.initModal();
      this.updateModalElements();

      // 2. Initialize the upload modal (components/upload-modal.html)
      await this.initUploadModal();
      initQuickR2Upload(this);

      // 3. (Optional) Initialize the profile modal (components/profile-modal.html)
      await this.initProfileModal();

      // 4. Connect to Nostr
      await nostrClient.init();

      // Grab the "Subscriptions" link by its id in the sidebar
      this.subscriptionsLink = document.getElementById("subscriptionsLink");

      const savedPubKey = localStorage.getItem("userPubKey");
      if (savedPubKey) {
        // Auto-login if a pubkey was saved
        this.login(savedPubKey, false);

        // If the user was already logged in, show the Subscriptions link
        if (this.subscriptionsLink) {
          this.subscriptionsLink.classList.remove("hidden");
        }
      }

      // 5. Setup general event listeners
      this.setupEventListeners();

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
      this.attachVideoListHandler();

      // 8. Subscribe or fetch videos
      await this.loadVideos();

      // 9. Check URL ?v= param
      this.checkUrlParams();

    } catch (error) {
      console.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  /**
   * Initialize the main video modal (video-modal.html).
   */
  async initModal() {
    try {
      const existingModal = document.getElementById("playerModal");
      if (existingModal) {
        this.playerModal = existingModal;
        return true;
      }

      const resp = await fetch("components/video-modal.html");
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }

      // Instead of overwriting, we append a new DIV with the fetched HTML
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html; // set the markup
      removeTrackingScripts(wrapper);
      modalContainer.appendChild(wrapper); // append the markup

      // Now we can safely find elements inside:
      const closeButton = document.getElementById("closeModal");
      if (!closeButton) {
        throw new Error("Close button not found in video-modal!");
      }
      closeButton.addEventListener("click", () => {
        this.hideModal();
      });

      // Setup scroll-based nav hide
      const modalNav = document.getElementById("modalNav");
      const playerModal = document.getElementById("playerModal");
      if (!modalNav || !playerModal) {
        throw new Error("Modal nav (#modalNav) or #playerModal not found!");
      }
      let lastScrollY = 0;
      playerModal.addEventListener("scroll", (e) => {
        const currentScrollY = e.target.scrollTop;
        const shouldShowNav =
          currentScrollY <= lastScrollY || currentScrollY < 50;
        modalNav.style.transform = shouldShowNav
          ? "translateY(0)"
          : "translateY(-100%)";
        lastScrollY = currentScrollY;
      });

      console.log("Video modal initialization successful");
      return true;
    } catch (error) {
      console.error("initModal failed:", error);
      this.showError(`Failed to initialize video modal: ${error.message}`);
      return false;
    }
  }

  updateModalElements() {
    // Existing references
    this.playerModal = document.getElementById("playerModal") || null;
    this.modalVideo = document.getElementById("modalVideo") || null;
    this.modalStatus = document.getElementById("modalStatus") || null;
    this.modalProgress = document.getElementById("modalProgress") || null;
    this.modalPeers = document.getElementById("modalPeers") || null;
    this.modalSpeed = document.getElementById("modalSpeed") || null;
    this.modalDownloaded = document.getElementById("modalDownloaded") || null;
    this.closePlayerBtn = document.getElementById("closeModal") || null;

    this.videoTitle = document.getElementById("videoTitle") || null;
    this.videoDescription = document.getElementById("videoDescription") || null;
    this.videoTimestamp = document.getElementById("videoTimestamp") || null;

    // The two elements we want to make clickable
    this.creatorAvatar = document.getElementById("creatorAvatar") || null;
    this.creatorName = document.getElementById("creatorName") || null;
    this.creatorNpub = document.getElementById("creatorNpub") || null;

    // Copy/Share buttons
    this.copyMagnetBtn = document.getElementById("copyMagnetBtn") || null;
    this.shareBtn = document.getElementById("shareBtn") || null;
    this.modalZapBtn = document.getElementById("modalZapBtn") || null;
    this.setModalZapVisibility(false);

    // Attach existing event listeners for copy/share
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", () => {
        this.handleCopyMagnet();
      });
    }
    if (this.shareBtn) {
      this.shareBtn.addEventListener("click", () => {
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
      });
    }
    if (this.modalZapBtn) {
      this.modalZapBtn.addEventListener("click", () => {
        window.alert("Zaps coming soon.");
      });
    }

    // Add click handlers for avatar and name => channel profile
    if (this.creatorAvatar) {
      this.creatorAvatar.style.cursor = "pointer";
      this.creatorAvatar.addEventListener("click", () => {
        this.openCreatorChannel();
      });
    }
    if (this.creatorName) {
      this.creatorName.style.cursor = "pointer";
      this.creatorName.addEventListener("click", () => {
        this.openCreatorChannel();
      });
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
  showModalWithPoster() {
    if (this.playerModal) {
      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");
    }
    this.applyModalLoadingPoster();
  }

  applyModalLoadingPoster() {
    if (!this.modalVideo) {
      return;
    }

    if (typeof this.modalPosterCleanup === "function") {
      this.modalPosterCleanup();
      this.modalPosterCleanup = null;
    }

    const videoEl = this.modalVideo;

    const clearPoster = () => {
      // Delegate to the shared helper so every code path clears the GIF in the
      // same way. If we ever change how the poster works we only need to update
      // forceRemoveModalPoster().
      this.forceRemoveModalPoster("playback-event");
    };

    videoEl.addEventListener("loadeddata", clearPoster);
    videoEl.addEventListener("playing", clearPoster);

    videoEl.poster = MODAL_LOADING_POSTER;

    this.modalPosterCleanup = () => {
      videoEl.removeEventListener("loadeddata", clearPoster);
      videoEl.removeEventListener("playing", clearPoster);
    };
  }

  /**
   * Forcefully strip the modal's loading poster.
   *
   * The video modal shows an animated "please stand by" GIF while we wait for a
   * `loadeddata` or `playing` event. Historically, small refactors would remove
   * the matching cleanup path which left the GIF covering real playback. By
   * routing every caller through this helper we can add defensive clears (for
   * example when WebTorrent reports progress) without duplicating poster logic
   * all over the file.
   *
   * @param {string} reason A debugging hint that documents why the poster was
   * cleared.
   * @returns {boolean} `true` if a poster attribute/value was removed.
   */
  forceRemoveModalPoster(reason = "manual-clear") {
    if (!this.modalVideo) {
      return false;
    }

    const videoEl = this.modalVideo;

    if (typeof this.modalPosterCleanup === "function") {
      this.modalPosterCleanup();
      this.modalPosterCleanup = null;
    }

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

    console.debug(
      `[bitvidApp] Cleared modal loading poster (${reason}).`
    );

    return true;
  }

  /**
   * Initialize the upload modal (upload-modal.html).
   */
  async initUploadModal() {
    try {
      const resp = await fetch("components/upload-modal.html");
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }
      // Append the upload modal markup
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      removeTrackingScripts(wrapper);
      modalContainer.appendChild(wrapper);

      // Grab references
      this.uploadModal = document.getElementById("uploadModal") || null;
      this.closeUploadModalBtn =
        document.getElementById("closeUploadModal") || null;
      this.uploadForm = document.getElementById("uploadForm") || null;
      this.uploadModeToggleButtons = Array.from(
        document.querySelectorAll(".upload-mode-toggle[data-upload-mode]")
      );
      this.customUploadSection =
        document.getElementById("customUploadSection") || null;
      this.cloudflareUploadSection =
        document.getElementById("cloudflareUploadSection") || null;
      this.cloudflareSettingsForm =
        document.getElementById("cloudflareSettingsForm") || null;
      this.cloudflareClearSettingsButton =
        document.getElementById("cloudflareClearSettings") || null;
      this.cloudflareSettingsStatus =
        document.getElementById("cloudflareSettingsStatus") || null;
      this.cloudflareBucketPreview =
        document.getElementById("cloudflareBucketPreview") || null;
      this.cloudflareUploadForm =
        document.getElementById("cloudflareUploadForm") || null;
      this.cloudflareFileInput =
        document.getElementById("cloudflareFile") || null;
      this.cloudflareUploadButton =
        document.getElementById("cloudflareUploadButton") || null;
      this.cloudflareUploadStatus =
        document.getElementById("cloudflareUploadStatus") || null;
      this.cloudflareProgressBar =
        document.getElementById("cloudflareProgressBar") || null;
      this.cloudflareProgressFill =
        document.getElementById("cloudflareProgressFill") || null;
      this.cloudflareTitleInput =
        document.getElementById("cloudflareTitle") || null;
      this.cloudflareDescriptionInput =
        document.getElementById("cloudflareDescription") || null;
      this.cloudflareThumbnailInput =
        document.getElementById("cloudflareThumbnail") || null;
      this.cloudflareMagnetInput =
        document.getElementById("cloudflareMagnet") || null;
      this.cloudflareWsInput =
        document.getElementById("cloudflareWs") || null;
      this.cloudflareXsInput =
        document.getElementById("cloudflareXs") || null;
      this.cloudflareAdvancedToggle =
        document.getElementById("cloudflareAdvancedToggle") || null;
      this.cloudflareAdvancedToggleLabel =
        document.getElementById("cloudflareAdvancedToggleLabel") || null;
      this.cloudflareAdvancedToggleIcon =
        document.getElementById("cloudflareAdvancedToggleIcon") || null;
      this.cloudflareAdvancedFields =
        document.getElementById("cloudflareAdvancedFields") || null;
      this.r2AccountIdInput =
        document.getElementById("r2AccountId") || null;
      this.r2AccessKeyIdInput =
        document.getElementById("r2AccessKeyId") || null;
      this.r2SecretAccessKeyInput =
        document.getElementById("r2SecretAccessKey") || null;
      this.r2ApiTokenInput =
        document.getElementById("r2ApiToken") || null;
      this.r2ZoneIdInput = document.getElementById("r2ZoneId") || null;
      this.r2BaseDomainInput =
        document.getElementById("r2BaseDomain") || null;

      // Optional: if close button found, wire up
      if (this.closeUploadModalBtn) {
        this.closeUploadModalBtn.addEventListener("click", () => {
          if (this.uploadModal) {
            this.uploadModal.classList.add("hidden");
          }
        });
      }
      // If the form is found, wire up
      if (this.uploadForm) {
        this.uploadForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleUploadSubmit();
        });
      }

      if (this.cloudflareSettingsForm) {
        this.cloudflareSettingsForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleCloudflareSettingsSubmit();
        });
      }

      if (this.cloudflareClearSettingsButton) {
        this.cloudflareClearSettingsButton.addEventListener("click", () => {
          this.handleCloudflareClearSettings();
        });
      }

      if (this.cloudflareUploadForm) {
        this.cloudflareUploadForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleCloudflareUploadSubmit();
        });
      }

      if (this.uploadModeToggleButtons.length > 0) {
        this.uploadModeToggleButtons.forEach((btn) => {
          btn.addEventListener("click", () => {
            const mode = btn.dataset.uploadMode || "custom";
            this.setUploadMode(mode);
          });
        });
      }

      if (this.cloudflareAdvancedToggle) {
        this.cloudflareAdvancedToggle.addEventListener("click", () => {
          this.setCloudflareAdvancedVisibility(
            !this.cloudflareAdvancedVisible
          );
        });
      }

      this.setCloudflareAdvancedVisibility(this.cloudflareAdvancedVisible);

      await this.loadCloudflareSettingsFromStorage();
      await this.updateCloudflareBucketPreview();

      this.setUploadMode(this.activeUploadMode);

      console.log("Upload modal initialization successful");
      return true;
    } catch (error) {
      console.error("initUploadModal failed:", error);
      this.showError(`Failed to initialize upload modal: ${error.message}`);
      return false;
    }
  }

  setUploadMode(mode) {
    const normalized = mode === "cloudflare" ? "cloudflare" : "custom";
    this.activeUploadMode = normalized;

    if (this.customUploadSection) {
      if (normalized === "custom") {
        this.customUploadSection.classList.remove("hidden");
      } else {
        this.customUploadSection.classList.add("hidden");
      }
    }

    if (this.cloudflareUploadSection) {
      if (normalized === "cloudflare") {
        this.cloudflareUploadSection.classList.remove("hidden");
      } else {
        this.cloudflareUploadSection.classList.add("hidden");
      }
    }

    if (Array.isArray(this.uploadModeToggleButtons)) {
      this.uploadModeToggleButtons.forEach((btn) => {
        if (!btn || !btn.dataset) {
          return;
        }

        const isActive = btn.dataset.uploadMode === normalized;
        btn.classList.toggle("bg-blue-500", isActive);
        btn.classList.toggle("text-white", isActive);
        btn.classList.toggle("shadow", isActive);
        btn.classList.toggle("text-gray-300", !isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    if (normalized === "cloudflare") {
      this.updateCloudflareBucketPreview();
    }
  }

  setCloudflareAdvancedVisibility(visible) {
    const isVisible = Boolean(visible);
    this.cloudflareAdvancedVisible = isVisible;

    if (this.cloudflareAdvancedFields) {
      if (isVisible) {
        this.cloudflareAdvancedFields.classList.remove("hidden");
      } else {
        this.cloudflareAdvancedFields.classList.add("hidden");
      }
    }

    if (this.cloudflareAdvancedToggle) {
      this.cloudflareAdvancedToggle.setAttribute(
        "aria-expanded",
        isVisible ? "true" : "false"
      );
    }

    if (this.cloudflareAdvancedToggleLabel) {
      this.cloudflareAdvancedToggleLabel.textContent = isVisible
        ? "Hide advanced options"
        : "Show advanced options";
    }

    if (this.cloudflareAdvancedToggleIcon) {
      this.cloudflareAdvancedToggleIcon.classList.toggle("rotate-90", isVisible);
    }
  }

  setCloudflareSettingsStatus(message = "", variant = "info") {
    if (!this.cloudflareSettingsStatus) {
      return;
    }

    const el = this.cloudflareSettingsStatus;
    el.textContent = message || "";
    el.classList.remove(
      "text-green-400",
      "text-red-400",
      "text-yellow-400",
      "text-gray-400"
    );
    if (!message) {
      el.classList.add("text-gray-400");
      return;
    }

    let cls = "text-gray-400";
    if (variant === "success") {
      cls = "text-green-400";
    } else if (variant === "error") {
      cls = "text-red-400";
    } else if (variant === "warning") {
      cls = "text-yellow-400";
    }
    el.classList.add(cls);
  }

  setCloudflareUploadStatus(message = "", variant = "info") {
    if (!this.cloudflareUploadStatus) {
      return;
    }

    const el = this.cloudflareUploadStatus;
    el.textContent = message || "";
    el.classList.remove(
      "text-green-400",
      "text-red-400",
      "text-yellow-400",
      "text-gray-400"
    );
    if (!message) {
      el.classList.add("text-gray-400");
      return;
    }

    let cls = "text-gray-400";
    if (variant === "success") {
      cls = "text-green-400";
    } else if (variant === "error") {
      cls = "text-red-400";
    } else if (variant === "warning") {
      cls = "text-yellow-400";
    }
    el.classList.add(cls);
  }

  setCloudflareUploading(isUploading) {
    if (this.cloudflareUploadButton) {
      this.cloudflareUploadButton.disabled = Boolean(isUploading);
      this.cloudflareUploadButton.textContent = isUploading
        ? "Uploading…"
        : "Upload to R2 & publish";
    }

    if (this.cloudflareFileInput) {
      this.cloudflareFileInput.disabled = Boolean(isUploading);
    }
  }

  updateCloudflareProgress(fraction) {
    if (!this.cloudflareProgressBar || !this.cloudflareProgressFill) {
      return;
    }

    if (typeof fraction !== "number" || Number.isNaN(fraction)) {
      this.cloudflareProgressBar.classList.add("hidden");
      this.cloudflareProgressFill.style.width = "0%";
      return;
    }

    const clamped = Math.max(0, Math.min(1, fraction));
    this.cloudflareProgressBar.classList.remove("hidden");
    this.cloudflareProgressFill.style.width = `${(clamped * 100).toFixed(1)}%`;
  }

  resetCloudflareUploadForm() {
    if (this.cloudflareTitleInput) this.cloudflareTitleInput.value = "";
    if (this.cloudflareDescriptionInput)
      this.cloudflareDescriptionInput.value = "";
    if (this.cloudflareThumbnailInput)
      this.cloudflareThumbnailInput.value = "";
    if (this.cloudflareMagnetInput) this.cloudflareMagnetInput.value = "";
    if (this.cloudflareWsInput) this.cloudflareWsInput.value = "";
    if (this.cloudflareXsInput) this.cloudflareXsInput.value = "";
    if (this.cloudflareFileInput) this.cloudflareFileInput.value = "";
    this.updateCloudflareProgress(Number.NaN);
  }

  async loadCloudflareSettingsFromStorage() {
    try {
      const settings = await loadR2Settings();
      this.cloudflareSettings = settings;
      this.populateCloudflareSettingsInputs(settings);
    } catch (err) {
      console.error("Failed to load Cloudflare settings:", err);
      this.setCloudflareSettingsStatus(
        "Failed to load saved settings.",
        "error"
      );
      this.cloudflareSettings = {
        accountId: "",
        accessKeyId: "",
        secretAccessKey: "",
        apiToken: "",
        zoneId: "",
        baseDomain: "",
        buckets: {},
      };
      this.populateCloudflareSettingsInputs(this.cloudflareSettings);
    }
  }

  populateCloudflareSettingsInputs(settings) {
    const data =
      settings || {
        accountId: "",
        accessKeyId: "",
        secretAccessKey: "",
        apiToken: "",
        zoneId: "",
        baseDomain: "",
      };

    if (this.r2AccountIdInput) {
      this.r2AccountIdInput.value = data.accountId || "";
    }
    if (this.r2AccessKeyIdInput) {
      this.r2AccessKeyIdInput.value = data.accessKeyId || "";
    }
    if (this.r2SecretAccessKeyInput) {
      this.r2SecretAccessKeyInput.value = data.secretAccessKey || "";
    }
    if (this.r2ApiTokenInput) {
      this.r2ApiTokenInput.value = data.apiToken || "";
    }
    if (this.r2ZoneIdInput) {
      this.r2ZoneIdInput.value = data.zoneId || "";
    }
    if (this.r2BaseDomainInput) {
      this.r2BaseDomainInput.value = data.baseDomain || "";
    }

    const hasAdvancedValues = Boolean(
      (data.apiToken && data.apiToken.length > 0) ||
        (data.zoneId && data.zoneId.length > 0) ||
        (data.baseDomain && data.baseDomain.length > 0)
    );
    if (hasAdvancedValues) {
      this.setCloudflareAdvancedVisibility(true);
    } else if (!this.cloudflareAdvancedVisible) {
      this.setCloudflareAdvancedVisibility(false);
    }

    this.setCloudflareSettingsStatus("");
  }

  async handleCloudflareSettingsSubmit({ quiet = false } = {}) {
    const accountId = (this.r2AccountIdInput?.value || "").trim();
    const accessKeyId = (this.r2AccessKeyIdInput?.value || "").trim();
    const secretAccessKey = (this.r2SecretAccessKeyInput?.value || "").trim();
    const apiToken = (this.r2ApiTokenInput?.value || "").trim();
    const zoneId = (this.r2ZoneIdInput?.value || "").trim();
    const baseDomain = sanitizeBaseDomain(
      this.r2BaseDomainInput?.value || ""
    );

    if (!accountId || !accessKeyId || !secretAccessKey) {
      if (!quiet) {
        this.setCloudflareSettingsStatus(
          "Account ID, Access Key ID, and Secret are required.",
          "error"
        );
      }
      return false;
    }

    let buckets = { ...(this.cloudflareSettings?.buckets || {}) };
    const previousAccount = this.cloudflareSettings?.accountId || "";
    const previousBaseDomain = this.cloudflareSettings?.baseDomain || "";
    const previousZoneId = this.cloudflareSettings?.zoneId || "";
    if (
      previousAccount !== accountId ||
      previousBaseDomain !== baseDomain ||
      previousZoneId !== zoneId
    ) {
      buckets = {};
    }

    const updatedSettings = {
      accountId,
      accessKeyId,
      secretAccessKey,
      apiToken,
      zoneId,
      baseDomain,
      buckets,
    };

    try {
      this.cloudflareSettings = await saveR2Settings(updatedSettings);
      this.populateCloudflareSettingsInputs(this.cloudflareSettings);
      if (!quiet) {
        this.setCloudflareSettingsStatus("Settings saved locally.", "success");
      }
      await this.updateCloudflareBucketPreview();
      return true;
    } catch (err) {
      console.error("Failed to save Cloudflare settings:", err);
      if (!quiet) {
        this.setCloudflareSettingsStatus(
          "Failed to save settings. Check console for details.",
          "error"
        );
      }
    }

    return false;
  }

  async handleCloudflareClearSettings() {
    try {
      await clearR2Settings();
      this.cloudflareSettings = await loadR2Settings();
      this.populateCloudflareSettingsInputs(this.cloudflareSettings);
      this.setCloudflareAdvancedVisibility(false);
      this.setCloudflareSettingsStatus("Settings cleared.", "success");
      await this.updateCloudflareBucketPreview();
    } catch (err) {
      console.error("Failed to clear Cloudflare settings:", err);
      this.setCloudflareSettingsStatus(
        "Failed to clear settings.",
        "error"
      );
    }
  }

  getCorsOrigins() {
    const origins = new Set();
    if (typeof window !== "undefined" && window.location) {
      const origin = window.location.origin;
      if (origin && origin !== "null") {
        origins.add(origin);
      }
      if (origin && origin.startsWith("http://localhost")) {
        origins.add(origin.replace("http://", "https://"));
      }
    }
    return Array.from(origins);
  }

  deriveSubdomainForNpub(npub) {
    try {
      return deriveShortSubdomain(npub);
    } catch (err) {
      console.warn("Failed to derive short subdomain, falling back:", err);
    }

    const base = String(npub || "user")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|[-]+$/g, "");
    return base.slice(0, 32) || "user";
  }

  async ensureBucketConfigForNpub(npub) {
    if (!npub || !this.cloudflareSettings) {
      return null;
    }

    const accountId = (this.cloudflareSettings.accountId || "").trim();
    const apiToken = (this.cloudflareSettings.apiToken || "").trim();
    const zoneId = (this.cloudflareSettings.zoneId || "").trim();
    const accessKeyId = (this.cloudflareSettings.accessKeyId || "").trim();
    const secretAccessKey =
      (this.cloudflareSettings.secretAccessKey || "").trim();
    const corsOrigins = this.getCorsOrigins();
    const baseDomain = this.cloudflareSettings.baseDomain || "";

    if (!accountId) {
      throw new Error("Cloudflare account ID is missing.");
    }

    let entry = this.cloudflareSettings.buckets?.[npub] || null;

    if (entry && entry.publicBaseUrl) {
      if (apiToken) {
        try {
          await ensureBucket({
            accountId,
            bucket: entry.bucket,
            token: apiToken,
          });
          await putCors({
            accountId,
            bucket: entry.bucket,
            token: apiToken,
            origins: corsOrigins,
          });
        } catch (err) {
          console.warn("Failed to refresh bucket configuration:", err);
        }
      } else if (
        accessKeyId &&
        secretAccessKey &&
        corsOrigins.length > 0
      ) {
        try {
          const s3 = makeR2Client({
            accountId,
            accessKeyId,
            secretAccessKey,
          });
          await ensureBucketCors({
            s3,
            bucket: entry.bucket,
            origins: corsOrigins,
          });
        } catch (err) {
          console.warn(
            "Failed to refresh bucket CORS via access keys:",
            err
          );
        }
      }
      return {
        entry,
        usedManagedFallback: entry.domainType !== "custom",
        customDomainStatus: entry.domainType === "custom" ? "active" : "skipped",
      };
    }

    if (!apiToken) {
      const bucketName = entry?.bucket || sanitizeBucketName(npub);
      const manualCustomDomain = baseDomain
        ? `https://${this.deriveSubdomainForNpub(npub)}.${baseDomain}`
        : "";

      let publicBaseUrl = entry?.publicBaseUrl || manualCustomDomain;
      if (!publicBaseUrl) {
        publicBaseUrl = `https://${bucketName}.${accountId}.r2.dev`;
      }

      if (!publicBaseUrl) {
        throw new Error(
          "No public bucket domain configured. Add an API token or configure the domain manually."
        );
      }

      const manualEntry = {
        bucket: bucketName,
        publicBaseUrl,
        domainType: publicBaseUrl.includes(".r2.dev") ? "managed" : "custom",
        lastUpdated: Date.now(),
      };

      if (accessKeyId && secretAccessKey && corsOrigins.length > 0) {
        try {
          const s3 = makeR2Client({
            accountId,
            accessKeyId,
            secretAccessKey,
          });
          await ensureBucketCors({
            s3,
            bucket: bucketName,
            origins: corsOrigins,
          });
        } catch (corsErr) {
          console.warn(
            "Failed to ensure R2 CORS rules via access keys. Configure the bucket's CORS policy manually if uploads continue to fail.",
            corsErr
          );
        }
      }

      let savedEntry = entry;
      if (
        !entry ||
        entry.bucket !== manualEntry.bucket ||
        entry.publicBaseUrl !== manualEntry.publicBaseUrl ||
        entry.domainType !== manualEntry.domainType
      ) {
        const updatedSettings = await saveR2Settings(
          mergeBucketEntry(this.cloudflareSettings, npub, manualEntry)
        );
        this.cloudflareSettings = updatedSettings;
        savedEntry = updatedSettings.buckets?.[npub] || manualEntry;
      }

      return {
        entry: savedEntry,
        usedManagedFallback: manualEntry.domainType !== "custom",
        customDomainStatus:
          manualEntry.domainType === "custom" ? "manual" : "managed",
      };
    }

    const bucketName = entry?.bucket || sanitizeBucketName(npub);

    await ensureBucket({ accountId, bucket: bucketName, token: apiToken });

    try {
      await putCors({
        accountId,
        bucket: bucketName,
        token: apiToken,
        origins: corsOrigins,
      });
    } catch (err) {
      console.warn("Failed to apply R2 CORS rules:", err);
    }

    let publicBaseUrl = entry?.publicBaseUrl || "";
    let domainType = entry?.domainType || "managed";
    let usedManagedFallback = false;
    let customDomainStatus = "skipped";

    if (baseDomain && zoneId) {
      const domain = `${this.deriveSubdomainForNpub(npub)}.${baseDomain}`;
      try {
        const custom = await attachCustomDomainAndWait({
          accountId,
          bucket: bucketName,
          token: apiToken,
          zoneId,
          domain,
          pollInterval: 2500,
          timeoutMs: 120000,
        });
        customDomainStatus = custom?.status || "unknown";
        if (custom?.active && custom?.url) {
          publicBaseUrl = custom.url;
          domainType = "custom";
          try {
            await setManagedDomain({
              accountId,
              bucket: bucketName,
              token: apiToken,
              enabled: false,
            });
          } catch (disableErr) {
            console.warn("Failed to disable managed domain:", disableErr);
          }
        } else {
          usedManagedFallback = true;
        }
      } catch (err) {
        if (/already exists/i.test(err.message || "")) {
          publicBaseUrl = `https://${domain}`;
          domainType = "custom";
          customDomainStatus = "active";
          try {
            await setManagedDomain({
              accountId,
              bucket: bucketName,
              token: apiToken,
              enabled: false,
            });
          } catch (disableErr) {
            console.warn("Failed to disable managed domain:", disableErr);
          }
        } else {
          console.warn("Failed to attach custom domain, falling back:", err);
          usedManagedFallback = true;
          customDomainStatus = "error";
        }
      }
    }

    if (!publicBaseUrl) {
      const managed = await setManagedDomain({
        accountId,
        bucket: bucketName,
        token: apiToken,
        enabled: true,
      });
      publicBaseUrl = managed?.url || `https://${bucketName}.${accountId}.r2.dev`;
      domainType = "managed";
      usedManagedFallback = true;
      customDomainStatus = customDomainStatus === "skipped" ? "managed" : customDomainStatus;
    }

    const mergedEntry = {
      bucket: bucketName,
      publicBaseUrl,
      domainType,
      lastUpdated: Date.now(),
    };
    const updatedSettings = await saveR2Settings(
      mergeBucketEntry(this.cloudflareSettings, npub, mergedEntry)
    );
    this.cloudflareSettings = updatedSettings;
    return { entry: mergedEntry, usedManagedFallback, customDomainStatus };
  }

  async updateCloudflareBucketPreview() {
    if (!this.cloudflareBucketPreview) {
      return;
    }

    const el = this.cloudflareBucketPreview;
    if (!this.cloudflareSettings) {
      el.textContent = "Save your credentials to configure R2.";
      return;
    }

    if (!this.pubkey) {
      el.textContent = "Login to preview your R2 bucket.";
      return;
    }

    const npub = this.safeEncodeNpub(this.pubkey);
    if (!npub) {
      el.textContent = "Unable to encode npub.";
      return;
    }

    const entry = this.cloudflareSettings.buckets?.[npub];
    if (!entry || !entry.publicBaseUrl) {
      el.textContent = "Bucket will be auto-created on your next upload.";
      return;
    }

    const sampleKey = buildR2Key(npub, { name: "sample.mp4" });
    const publicUrl = buildPublicUrl(entry.publicBaseUrl, sampleKey);
    const fullPreview = `${entry.bucket} • ${publicUrl}`;

    let displayHostAndPath = truncateMiddle(publicUrl, 72);
    try {
      const parsed = new URL(publicUrl);
      const cleanPath = parsed.pathname.replace(/^\//, "");
      const truncatedPath = truncateMiddle(cleanPath || sampleKey, 32);
      displayHostAndPath = `${truncateMiddle(parsed.host, 32)}/${truncatedPath}`;
    } catch (err) {
      // ignore URL parse issues and fall back to the raw string
    }

    const truncatedBucket = truncateMiddle(entry.bucket, 28);
    el.textContent = `${truncatedBucket} • ${displayHostAndPath}`;
    el.setAttribute("title", fullPreview);
  }

  async handleCloudflareUploadSubmit() {
    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return;
    }

    const saved = await this.handleCloudflareSettingsSubmit({ quiet: true });
    if (!saved) {
      this.setCloudflareUploadStatus(
        "Fix your R2 settings before uploading.",
        "error"
      );
      return;
    }

    const title = (this.cloudflareTitleInput?.value || "").trim();
    if (!title) {
      this.setCloudflareUploadStatus("Title is required.", "error");
      return;
    }

    const file = this.cloudflareFileInput?.files?.[0] || null;
    if (!file) {
      this.setCloudflareUploadStatus(
        "Select a video or HLS file to upload.",
        "error"
      );
      return;
    }

    const description = (this.cloudflareDescriptionInput?.value || "").trim();
    const thumbnail = (this.cloudflareThumbnailInput?.value || "").trim();
    const magnet = (this.cloudflareMagnetInput?.value || "").trim();
    const ws = (this.cloudflareWsInput?.value || "").trim();
    const xs = (this.cloudflareXsInput?.value || "").trim();

    const accountId = (this.cloudflareSettings?.accountId || "").trim();
    const accessKeyId = (this.cloudflareSettings?.accessKeyId || "").trim();
    const secretAccessKey = (
      this.cloudflareSettings?.secretAccessKey || ""
    ).trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      this.setCloudflareUploadStatus(
        "Missing R2 credentials. Save them before uploading.",
        "error"
      );
      return;
    }

    const npub = this.safeEncodeNpub(this.pubkey);
    if (!npub) {
      this.setCloudflareUploadStatus("Unable to encode npub.", "error");
      return;
    }

    this.setCloudflareUploadStatus("Preparing Cloudflare R2…", "info");
    this.updateCloudflareProgress(0);
    this.setCloudflareUploading(true);

    let bucketResult = null;
    try {
      bucketResult = await this.ensureBucketConfigForNpub(npub);
    } catch (err) {
      console.error("Failed to prepare R2 bucket:", err);
      this.setCloudflareUploadStatus(
        err?.message ? `Bucket setup failed: ${err.message}` : "Bucket setup failed.",
        "error"
      );
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      return;
    }

    const bucketEntry =
      bucketResult?.entry || this.cloudflareSettings?.buckets?.[npub];

    if (!bucketEntry || !bucketEntry.publicBaseUrl) {
      this.setCloudflareUploadStatus(
        "Bucket is missing a public domain. Check your Cloudflare settings.",
        "error"
      );
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      return;
    }

    let statusMessage = `Uploading to ${bucketEntry.bucket}…`;
    if (bucketResult?.usedManagedFallback) {
      const baseDomain = this.cloudflareSettings?.baseDomain || "";
      if (baseDomain) {
        const customStatus = bucketResult?.customDomainStatus
          ? ` (custom domain status: ${bucketResult.customDomainStatus})`
          : "";
        statusMessage = `Using managed r2.dev domain for ${bucketEntry.bucket}. Verify your Cloudflare zone${customStatus}. Uploading…`;
      } else {
        statusMessage = `Using managed r2.dev domain for ${bucketEntry.bucket}. Uploading…`;
      }
    }

    this.setCloudflareUploadStatus(
      statusMessage,
      bucketResult?.usedManagedFallback ? "warning" : "info"
    );

    const key = buildR2Key(npub, file);
    const publicUrl = buildPublicUrl(bucketEntry.publicBaseUrl, key);

    try {
      const s3 = makeR2Client({ accountId, accessKeyId, secretAccessKey });

      await multipartUpload({
        s3,
        bucket: bucketEntry.bucket,
        key,
        file,
        contentType: file.type,
        onProgress: (fraction) => {
          this.updateCloudflareProgress(fraction);
        },
      });

      const payload = {
        title,
        url: publicUrl,
        magnet,
        thumbnail,
        description,
        ws,
        xs,
      };

      const published = await this.publishVideoNote(payload, {
        onSuccess: () => {
          this.resetCloudflareUploadForm();
        },
      });

      if (published) {
        this.setCloudflareUploadStatus(
          `Published ${publicUrl}`,
          "success"
        );
      }
    } catch (err) {
      console.error("Cloudflare upload failed:", err);
      this.setCloudflareUploadStatus(
        err?.message ? `Upload failed: ${err.message}` : "Upload failed.",
        "error"
      );
    } finally {
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      await this.updateCloudflareBucketPreview();
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

      // Wire up
      if (this.closeProfileModal) {
        this.closeProfileModal.addEventListener("click", () => {
          this.profileModal.classList.add("hidden");
        });
      }
      if (this.profileLogoutBtn) {
        this.profileLogoutBtn.addEventListener("click", () => {
          // On "Logout" inside the profile modal
          this.logout();
          this.profileModal.classList.add("hidden");
        });
      }

      console.log("Profile modal initialization successful");
      return true;
    } catch (error) {
      console.error("initProfileModal failed:", error);
      // Not critical if missing
      return false;
    }
  }

  /**
   * Setup general event listeners for logout, modals, etc.
   */
  setupEventListeners() {
    // 1) Logout button
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => {
        this.logout();
      });
    }

    // 2) Profile button
    if (this.profileButton) {
      this.profileButton.addEventListener("click", () => {
        if (this.profileModal) {
          this.profileModal.classList.remove("hidden");
        }
      });
    }

    // 3) Upload button => show upload modal
    if (this.uploadButton) {
      this.uploadButton.addEventListener("click", () => {
        if (this.uploadModal) {
          this.uploadModal.classList.remove("hidden");
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
        }
      });
    }

    // 6) NIP-07 button inside the login modal => call the extension & login
    const nip07Button = document.getElementById("loginNIP07");
    if (nip07Button) {
      nip07Button.addEventListener("click", async () => {
        console.log(
          "[app.js] loginNIP07 clicked! Attempting extension login..."
        );
        try {
          const pubkey = await nostrClient.login(); // call the extension
          console.log("[NIP-07] login returned pubkey:", pubkey);
          this.login(pubkey, true);

          // Hide the login modal
          const loginModal = document.getElementById("loginModal");
          if (loginModal) {
            loginModal.classList.add("hidden");
          }
        } catch (err) {
          console.error("[NIP-07 login error]", err);
          this.showError("Failed to login with NIP-07. Please try again.");
        }
      });
    }

    // 7) Cleanup on page unload
    window.addEventListener("beforeunload", () => {
      this.cleanup().catch((err) => {
        console.error("Cleanup before unload failed:", err);
      });
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
    if (this._videoListElement && this._videoListClickHandler) {
      this._videoListElement.removeEventListener(
        "click",
        this._videoListClickHandler
      );
      this._videoListElement = null;
      this._videoListClickHandler = null;
    }

    if (!this.videoList) {
      return;
    }

    const handler = async (event) => {
      const trigger = event.target.closest(
        "[data-play-magnet],[data-play-url]"
      );
      if (!trigger) {
        return;
      }

      if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();

        const rawUrlValue =
          (trigger.dataset && typeof trigger.dataset.playUrl === "string"
            ? trigger.dataset.playUrl
            : null) ?? trigger.getAttribute("data-play-url") ?? "";
        const rawMagnetValue =
          (trigger.dataset && typeof trigger.dataset.playMagnet === "string"
            ? trigger.dataset.playMagnet
            : null) ?? trigger.getAttribute("data-play-magnet") ?? "";

        let url = "";
        if (rawUrlValue) {
          try {
            url = decodeURIComponent(rawUrlValue);
          } catch (err) {
            console.warn("Failed to decode data-play-url attribute:", err);
            url = rawUrlValue;
          }
        }

        const magnet = typeof rawMagnetValue === "string" ? rawMagnetValue : "";
        const eventId = trigger.getAttribute("data-video-id");

        if (eventId) {
          await this.playVideoByEventId(eventId);
        } else {
          await this.playVideoWithFallback({ url, magnet });
        }
      }
    };

    this._videoListElement = this.videoList;
    this._videoListClickHandler = handler;
    this.videoList.addEventListener("click", handler);
  }

  /**
   * Attempt to load the user's own profile from Nostr (kind:0).
   */
  async loadOwnProfile(pubkey) {
    try {
      const events = await nostrClient.pool.list(nostrClient.relays, [
        { kinds: [0], authors: [pubkey], limit: 1 },
      ]);
      let displayName = "User";
      let picture = "assets/svg/default-profile.svg";

      if (events.length && events[0].content) {
        const data = JSON.parse(events[0].content);
        displayName = data.name || data.display_name || "User";
        picture = data.picture || "assets/svg/default-profile.svg";
      }

      this.setProfileCacheEntry(pubkey, {
        name: displayName,
        picture,
      });

      // If you have a top-bar avatar (profileAvatar)
      if (this.profileAvatar) {
        this.profileAvatar.src = picture;
      }
      // If you want to show name somewhere
      if (this.profileModalName) {
        this.profileModalName.textContent = displayName;
      }
      if (this.profileModalAvatar) {
        this.profileModalAvatar.src = picture;
      }
    } catch (error) {
      console.error("loadOwnProfile error:", error);
    }
  }

  async fetchAndRenderProfile(pubkey, forceRefresh = false) {
    const cacheEntry = this.getProfileCacheEntry(pubkey);
    if (cacheEntry) {
      this.updateProfileInDOM(pubkey, cacheEntry.profile);
      if (!forceRefresh) {
        return;
      }
    }

    // 2) Otherwise, fetch from Nostr
    try {
      const userEvents = await nostrClient.pool.list(nostrClient.relays, [
        { kinds: [0], authors: [pubkey], limit: 1 },
      ]);
      if (userEvents.length > 0 && userEvents[0].content) {
        const data = JSON.parse(userEvents[0].content);
        const profile = {
          name: data.name || data.display_name || "Unknown",
          picture: data.picture || "assets/svg/default-profile.svg",
        };

        // Cache it
        this.setProfileCacheEntry(pubkey, profile);
        // Update DOM
        this.updateProfileInDOM(pubkey, profile);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
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

    const formData = {
      version: 3,
      title,
      url,
      magnet,
      thumbnail,
      description,
      mode: isDevMode ? "dev" : "live",
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
      formData.magnet = normalizeAndAugmentMagnet(formData.magnet, {
        ws,
        xs,
      });
    }

    try {
      await nostrClient.publishVideo(formData, this.pubkey);
      if (typeof onSuccess === "function") {
        await onSuccess();
      }
      if (suppressModalClose !== true && this.uploadModal) {
        this.uploadModal.classList.add("hidden");
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
  async handleUploadSubmit() {
    const titleEl = document.getElementById("uploadTitle");
    const urlEl = document.getElementById("uploadUrl");
    const magnetEl = document.getElementById("uploadMagnet");
    const wsEl = document.getElementById("uploadWs");
    const xsEl = document.getElementById("uploadXs");
    const thumbEl = document.getElementById("uploadThumbnail");
    const descEl = document.getElementById("uploadDescription");
    const privEl = document.getElementById("uploadIsPrivate");

    const title = titleEl?.value.trim() || "";
    const url = urlEl?.value.trim() || "";
    const magnet = magnetEl?.value.trim() || "";
    const ws = wsEl?.value.trim() || "";
    const xs = xsEl?.value.trim() || "";
    const thumbnail = thumbEl?.value.trim() || "";
    const description = descEl?.value.trim() || "";

    const payload = {
      title,
      url,
      magnet,
      thumbnail,
      description,
      ws,
      xs,
    };

    await this.publishVideoNote(payload, {
      onSuccess: () => {
        if (titleEl) titleEl.value = "";
        if (urlEl) urlEl.value = "";
        if (magnetEl) magnetEl.value = "";
        if (wsEl) wsEl.value = "";
        if (xsEl) xsEl.value = "";
        if (thumbEl) thumbEl.value = "";
        if (descEl) descEl.value = "";
        if (privEl) privEl.checked = false;
      },
    });
  }

  /**
   * Called upon successful login.
   */
  async login(pubkey, saveToStorage = true) {
    console.log("[app.js] login() called with pubkey =", pubkey);

    this.pubkey = pubkey;

    // Hide login button if present
    if (this.loginButton) {
      this.loginButton.classList.add("hidden");
    }
    // Optionally hide logout or userStatus
    if (this.logoutButton) {
      this.logoutButton.classList.remove("hidden");
    }
    if (this.userStatus) {
      this.userStatus.classList.add("hidden");
    }

    // Show the upload button, profile button, etc.
    if (this.uploadButton) {
      this.uploadButton.classList.remove("hidden");
    }
    if (this.profileButton) {
      this.profileButton.classList.remove("hidden");
    }

    // Show the "Subscriptions" link if it exists
    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.remove("hidden");
    }

    // (Optional) load the user's own Nostr profile
    this.loadOwnProfile(pubkey);

    // Save pubkey locally if requested
    if (saveToStorage) {
      localStorage.setItem("userPubKey", pubkey);
    }

    // Refresh the video list so the user sees any private videos, etc.
    await this.loadVideos();

    // Force a fresh fetch of all profile pictures/names
    this.forceRefreshAllProfiles();

    await this.updateCloudflareBucketPreview();
  }

  /**
   * Logout logic
   */
  async logout() {
    nostrClient.logout();
    this.pubkey = null;

    // Show the login button again
    if (this.loginButton) {
      this.loginButton.classList.remove("hidden");
    }

    // Hide logout or userStatus
    if (this.logoutButton) {
      this.logoutButton.classList.add("hidden");
    }
    if (this.userStatus) {
      this.userStatus.classList.add("hidden");
    }
    if (this.userPubKey) {
      this.userPubKey.textContent = "";
    }

    // Hide upload & profile
    if (this.uploadButton) {
      this.uploadButton.classList.add("hidden");
    }
    if (this.profileButton) {
      this.profileButton.classList.add("hidden");
    }

    // Hide the Subscriptions link
    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.add("hidden");
    }

    // Clear localStorage
    localStorage.removeItem("userPubKey");

    // Refresh the video list so user sees only public videos again
    await this.loadVideos();

    // Force a fresh fetch of all profile pictures/names (public ones in this case)
    this.forceRefreshAllProfiles();

    await this.updateCloudflareBucketPreview();
  }

  /**
   * Cleanup resources on unload or modal close.
   */
  async cleanup({ preserveSubscriptions = false, preserveObservers = false } = {}) {
    // Serialise teardown so overlapping calls (e.g. close button spam) don't
    // race each other and clobber a fresh playback setup.
    if (this.cleanupPromise) {
      try {
        await this.cleanupPromise;
      } catch (err) {
        console.warn("Previous cleanup rejected:", err);
      }
    }

    const runCleanup = async () => {
      try {
        this.clearActiveIntervals();
        this.cleanupUrlPlaybackWatchdog();

        if (!preserveObservers && this.mediaLoader) {
          this.mediaLoader.disconnect();
        }

        if (!preserveSubscriptions && this.videoSubscription) {
          try {
            if (typeof this.videoSubscription.unsub === "function") {
              this.videoSubscription.unsub();
            }
          } catch (err) {
            console.error("Failed to unsubscribe from video feed:", err);
          } finally {
            this.videoSubscription = null;
          }
        }

        // If there's a small inline player
        if (this.videoElement) {
          this.videoElement.pause();
          this.videoElement.src = "";
          // When WebTorrent (or other MediaSource based flows) mount a stream they
          // set `srcObject` behind the scenes. Forgetting to clear it leaves the
          // detached MediaSource hanging around which breaks the next playback
          // attempt. Always null it out alongside the normal `src` reset.
          this.videoElement.srcObject = null;
          this.videoElement.load();
        }
        // If there's a modal video
        if (this.modalVideo) {
          this.modalVideo.pause();
          this.modalVideo.src = "";
          // See comment above—keep the `srcObject` reset paired with the `src`
          // wipe so magnet-only replays do not regress into the grey screen bug.
          this.modalVideo.srcObject = null;
          this.modalVideo.load();
        }
        // Tell webtorrent to cleanup
        await torrentClient.cleanup();
      } catch (err) {
        console.error("Cleanup error:", err);
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
      await this.cleanupPromise;
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

  cleanupUrlPlaybackWatchdog() {
    if (typeof this.urlPlaybackWatchdogCleanup === "function") {
      try {
        this.urlPlaybackWatchdogCleanup();
      } catch (err) {
        console.warn("[cleanupUrlPlaybackWatchdog]", err);
      } finally {
        this.urlPlaybackWatchdogCleanup = null;
      }
    }
  }

  registerUrlPlaybackWatchdogs(
    videoElement,
    { stallMs = 8000, onSuccess, onFallback } = {}
  ) {
    this.cleanupUrlPlaybackWatchdog();

    if (!videoElement || typeof onFallback !== "function") {
      return () => {};
    }

    const normalizedStallMs = Number.isFinite(stallMs) && stallMs > 0 ? stallMs : 0;
    let active = true;
    let stallTimerId = null;

    const listeners = [];

    const cleanup = () => {
      if (!active) {
        return;
      }
      active = false;
      if (stallTimerId) {
        clearTimeout(stallTimerId);
        stallTimerId = null;
      }
      for (const [eventName, handler] of listeners) {
        videoElement.removeEventListener(eventName, handler);
      }
      this.urlPlaybackWatchdogCleanup = null;
    };

    const triggerFallback = (reason) => {
      if (!active) {
        return;
      }
      cleanup();
      onFallback(reason);
    };

    const handleSuccess = () => {
      if (!active) {
        return;
      }
      cleanup();
      if (typeof onSuccess === "function") {
        onSuccess();
      }
    };

    const resetTimer = () => {
      if (!active || !normalizedStallMs) {
        return;
      }
      if (stallTimerId) {
        clearTimeout(stallTimerId);
      }
      stallTimerId = setTimeout(() => triggerFallback("stall"), normalizedStallMs);
    };

    const addListener = (eventName, handler) => {
      videoElement.addEventListener(eventName, handler);
      listeners.push([eventName, handler]);
    };

    addListener("error", () => triggerFallback("error"));
    addListener("abort", () => triggerFallback("abort"));
    addListener("stalled", () => triggerFallback("stalled"));
    addListener("emptied", () => triggerFallback("emptied"));
    addListener("playing", handleSuccess);
    addListener("ended", handleSuccess);

    const timerEvents = [
      "timeupdate",
      "progress",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "suspend",
      "waiting",
    ];
    for (const eventName of timerEvents) {
      addListener(eventName, resetTimer);
    }

    if (normalizedStallMs) {
      resetTimer();
    }

    this.urlPlaybackWatchdogCleanup = () => {
      cleanup();
    };

    return this.urlPlaybackWatchdogCleanup;
  }

  resetTorrentStats() {
    if (this.modalPeers) {
      this.modalPeers.textContent = "";
    }
    if (this.modalSpeed) {
      this.modalSpeed.textContent = "";
    }
    if (this.modalDownloaded) {
      this.modalDownloaded.textContent = "";
    }
    if (this.modalProgress) {
      this.modalProgress.style.width = "0%";
    }
  }

  setCopyMagnetState(enabled) {
    if (!this.copyMagnetBtn) {
      return;
    }
    this.copyMagnetBtn.disabled = !enabled;
    this.copyMagnetBtn.setAttribute("aria-disabled", (!enabled).toString());
    this.copyMagnetBtn.classList.toggle("opacity-50", !enabled);
    this.copyMagnetBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  setShareButtonState(enabled) {
    if (!this.shareBtn) {
      return;
    }
    this.shareBtn.disabled = !enabled;
    this.shareBtn.setAttribute("aria-disabled", (!enabled).toString());
    this.shareBtn.classList.toggle("opacity-50", !enabled);
    this.shareBtn.classList.toggle("cursor-not-allowed", !enabled);
  }

  setModalZapVisibility(visible) {
    if (!this.modalZapBtn) {
      return;
    }
    const shouldShow = !!visible;
    this.modalZapBtn.classList.toggle("hidden", !shouldShow);
    this.modalZapBtn.disabled = !shouldShow;
    this.modalZapBtn.setAttribute("aria-disabled", (!shouldShow).toString());
    this.modalZapBtn.setAttribute("aria-hidden", (!shouldShow).toString());
    if (shouldShow) {
      this.modalZapBtn.removeAttribute("tabindex");
    } else {
      this.modalZapBtn.setAttribute("tabindex", "-1");
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

  prepareModalVideoForPlayback() {
    if (!this.modalVideo) {
      return;
    }

    const storedUnmuted = localStorage.getItem("unmutedAutoplay");
    const userWantsUnmuted = storedUnmuted === "true";
    this.modalVideo.muted = !userWantsUnmuted;

    if (!this.modalVideo.dataset.autoplayBound) {
      this.modalVideo.addEventListener("volumechange", () => {
        localStorage.setItem(
          "unmutedAutoplay",
          (!this.modalVideo.muted).toString()
        );
      });
      this.modalVideo.dataset.autoplayBound = "true";
    }
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
      if (status && this.modalStatus) {
        this.modalStatus.textContent = status.textContent;
      }
      if (progress && this.modalProgress) {
        this.modalProgress.style.width = progress.style.width;
      }
      if (peers && this.modalPeers) {
        this.modalPeers.textContent = peers.textContent;
      }
      if (speed && this.modalSpeed) {
        this.modalSpeed.textContent = speed.textContent;
      }
      if (downloaded && this.modalDownloaded) {
        this.modalDownloaded.textContent = downloaded.textContent;
      }
    }, 3000);
    this.activeIntervals.push(mirrorInterval);
  }

  /**
   * Hide the video modal.
   */
  async hideModal() {
    // 1) Clear intervals, cleanup, etc. (unchanged)
    this.clearActiveIntervals();

    try {
      await fetch("/webtorrent/cancel/", { mode: "no-cors" });
    } catch (err) {
      // ignore
    }
    await this.cleanup({
      preserveSubscriptions: true,
      preserveObservers: true,
    });

    // 2) Hide the modal
    if (this.playerModal) {
      this.playerModal.style.display = "none";
      this.playerModal.classList.add("hidden");
    }
    if (typeof this.modalPosterCleanup === "function") {
      this.modalPosterCleanup();
      this.modalPosterCleanup = null;
    }
    if (this.modalVideo) {
      this.modalVideo.poster = "";
      this.modalVideo.removeAttribute("poster");
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

    const shouldIncludeVideo = (video) => {
      if (!video || typeof video !== "object") {
        return false;
      }

      if (this.blacklistedEventIds.has(video.id)) {
        return false;
      }

      const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (initialBlacklist.includes(authorNpub)) {
        return false;
      }

      if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
        return false;
      }

      return true;
    };

    // If forceFetch is true, unsubscribe from the old subscription to start fresh
    if (forceFetch && this.videoSubscription) {
      // Call unsubscribe on the subscription object directly.
      this.videoSubscription.unsub();
      this.videoSubscription = null;
    }

    // The rest of your existing logic:
    if (!this.videoSubscription) {
      if (this.videoList) {
        this.lastRenderedVideoSignature = null;
        this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          Loading videos as they arrive...
        </p>`;
      }

      // Create a new subscription
      this.videoSubscription = nostrClient.subscribeVideos(() => {
        const updatedAll = nostrClient.getActiveVideos();

        // Filter out blacklisted authors & blacklisted event IDs
        const filteredVideos = updatedAll.filter(shouldIncludeVideo);

        this.renderVideoList(filteredVideos);
      });

      const cachedActiveVideos = nostrClient.getActiveVideos();
      const cachedFiltered = cachedActiveVideos.filter(shouldIncludeVideo);
      if (cachedFiltered.length) {
        this.renderVideoList(cachedFiltered);
      }

      if (this.videoSubscription) {
        console.log(
          "[loadVideos] subscription remains open to get live updates."
        );
      }
    } else {
      // Already subscribed: just show what's cached
      const allCached = nostrClient.getActiveVideos();

      const filteredCached = allCached.filter(shouldIncludeVideo);

      this.renderVideoList(filteredCached);
    }
  }

  async loadOlderVideos(lastTimestamp) {
    // 1) Use nostrClient to fetch older slices
    const olderVideos = await nostrClient.fetchOlderVideos(lastTimestamp);

    if (!olderVideos || olderVideos.length === 0) {
      this.showSuccess("No more older videos found.");
      return;
    }

    // 2) Merge them into the client’s allEvents / activeMap
    for (const v of olderVideos) {
      nostrClient.allEvents.set(v.id, v);
      // If it’s the newest version for its root, update activeMap
      const rootKey = v.videoRootId || v.id;
      // You can call getActiveKey(v) if you want to match your code’s approach.
      // Then re-check if this one is newer than what’s stored, etc.
    }

    // 3) Re-render
    const all = nostrClient.getActiveVideos();
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
    return readUrlHealthFromCache(eventId, url);
  }

  storeUrlHealth(eventId, url, result, ttlMs) {
    return writeUrlHealthToCache(eventId, url, result, ttlMs);
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
            ? URL_HEALTH_TIMEOUT_RETRY_MS
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
    if (!this.videoList) return;

    if (this._lastRenderedVideoListElement !== this.videoList) {
      this.lastRenderedVideoSignature = null;
      this._lastRenderedVideoListElement = this.videoList;
    }

    const dedupedVideos = this.dedupeVideosByRoot(videos);

    if (this.loadedThumbnails && this.loadedThumbnails.size) {
      const activeIds = new Set();
      dedupedVideos.forEach((video) => {
        if (video && typeof video.id === "string" && video.id) {
          activeIds.add(video.id);
        }
      });
      Array.from(this.loadedThumbnails.keys()).forEach((videoId) => {
        if (!activeIds.has(videoId)) {
          this.loadedThumbnails.delete(videoId);
        }
      });
    }

    // 1) If no videos
    if (!dedupedVideos.length) {
      this.renderedVideoIds.clear();
      if (this.lastRenderedVideoSignature === EMPTY_VIDEO_LIST_SIGNATURE) {
        return;
      }
      this.lastRenderedVideoSignature = EMPTY_VIDEO_LIST_SIGNATURE;
      this.videoList.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-gray-500">
          No public videos available yet. Be the first to upload one!
        </p>`;
      return;
    }

    // 2) Sort newest first
    dedupedVideos.sort((a, b) => b.created_at - a.created_at);

    const signaturePayload = dedupedVideos.map((video) => ({
      id: typeof video.id === "string" ? video.id : "",
      createdAt: Number.isFinite(video.created_at)
        ? video.created_at
        : Number(video.created_at) || 0,
      deleted: Boolean(video.deleted),
      isPrivate: Boolean(video.isPrivate),
      thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
      url: typeof video.url === "string" ? video.url : "",
      magnet: typeof video.magnet === "string" ? video.magnet : "",
    }));
    const signature = JSON.stringify(signaturePayload);

    if (signature === this.lastRenderedVideoSignature) {
      return;
    }
    this.lastRenderedVideoSignature = signature;

    const previouslyRenderedIds = new Set(this.renderedVideoIds);
    this.renderedVideoIds.clear();

    const fullAllEventsArray = Array.from(nostrClient.allEvents.values());
    const fragment = document.createDocumentFragment();
    const authorSet = new Set();
    const defaultShareBase =
      this.getShareUrlBase() ||
      `${window.location?.origin || ""}${window.location?.pathname || ""}` ||
      (window.location?.href ? window.location.href.split(/[?#]/)[0] : "");

    // 3) Build each card
    dedupedVideos.forEach((video, index) => {
      if (!video.id || !video.title) {
        console.error("Video missing ID/title:", video);
        return;
      }

      authorSet.add(video.pubkey);

      const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
      const shareUrl =
        this.buildShareUrlFromNevent(nevent) ||
        `${defaultShareBase}?v=${encodeURIComponent(nevent)}`;
      const canEdit = video.pubkey === this.pubkey;
      const highlightClass =
        video.isPrivate && canEdit
          ? "border-2 border-yellow-500"
          : "border-none";
      const isNewlyRendered = !previouslyRenderedIds.has(video.id);
      const animationClass = isNewlyRendered ? "video-card--enter" : "";
      const timeAgo = this.formatTimeAgo(video.created_at);

      // Check if there's an older version
      let hasOlder = false;
      if (canEdit && video.videoRootId) {
        hasOlder = this.hasOlderVersion(video, fullAllEventsArray);
      }

      const revertButton = hasOlder
        ? `
          <button
            class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
            data-revert-index="${index}"
            data-revert-event-id="${video.id}"
          >
            Revert
          </button>
        `
        : "";

      const gearMenu = canEdit
        ? `
          <div class="relative inline-block ml-3 overflow-visible">
            <button
              type="button"
              class="inline-flex items-center p-2 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-settings-dropdown="${index}"
            >
              <img
                src="assets/svg/video-settings-gear.svg"
                alt="Settings"
                class="w-5 h-5"
              />
            </button>
            <div
              id="settingsDropdown-${index}"
              class="hidden absolute right-0 bottom-full mb-2 w-32 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
            >
              <div class="py-1">
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700"
                  data-edit-index="${index}"
                  data-edit-event-id="${video.id}"
                >
                  Edit
                </button>
                ${revertButton}
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
                  data-delete-all-index="${index}"
                  data-delete-all-event-id="${video.id}"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        `
        : "";

      const trimmedUrl = typeof video.url === "string" ? video.url.trim() : "";
      const trimmedMagnet =
        typeof video.magnet === "string" ? video.magnet.trim() : "";
      const legacyInfoHash =
        typeof video.infoHash === "string" ? video.infoHash.trim() : "";
      const magnetCandidate = trimmedMagnet || legacyInfoHash;
      const magnetSupported = isValidMagnetUri(magnetCandidate);
      const magnetProvided = magnetCandidate.length > 0;
      const playbackUrl = trimmedUrl;
      const playbackMagnet = magnetCandidate;
      const showUnsupportedTorrentBadge =
        !trimmedUrl && magnetProvided && !magnetSupported;
      const torrentWarningHtml = showUnsupportedTorrentBadge
        ? `
          <p
            class="mt-3 text-xs text-amber-300"
            data-torrent-status="unsupported"
            title="${UNSUPPORTED_BTITH_MESSAGE}"
          >
            WebTorrent fallback unavailable (magnet missing btih info hash)
          </p>
        `
        : "";

      const urlBadgeHtml = trimmedUrl
        ? this.getUrlHealthPlaceholderMarkup({ includeMargin: false })
        : "";
      const torrentHealthBadgeHtml =
        magnetSupported && magnetProvided
          ? this.getTorrentHealthBadgeMarkup({ includeMargin: false })
          : "";
      const connectionBadgesHtml =
        urlBadgeHtml || torrentHealthBadgeHtml
          ? `
            <div class="mt-3 flex flex-wrap items-center gap-2">
              ${urlBadgeHtml}${torrentHealthBadgeHtml}
            </div>
          `
          : "";

      const rawThumbnail =
        typeof video.thumbnail === "string" ? video.thumbnail.trim() : "";
      const escapedThumbnail = rawThumbnail
        ? this.escapeHTML(rawThumbnail)
        : "";
      const previouslyLoadedThumbnail =
        this.loadedThumbnails.get(video.id) || "";
      const shouldLazyLoadThumbnail =
        escapedThumbnail && previouslyLoadedThumbnail !== escapedThumbnail;
      const shouldAnimateThumbnail =
        !!escapedThumbnail && previouslyLoadedThumbnail !== escapedThumbnail;
      const thumbnailAttrLines = ["data-video-thumbnail=\"true\""];
      if (shouldLazyLoadThumbnail) {
        thumbnailAttrLines.push(
          `src=\"${FALLBACK_THUMBNAIL_SRC}\"`,
          `data-fallback-src=\"${FALLBACK_THUMBNAIL_SRC}\"`,
          `data-lazy=\"${escapedThumbnail}\"`,
          'loading="lazy"',
          'decoding="async"'
        );
      } else {
        thumbnailAttrLines.push(
          `src=\"${escapedThumbnail || FALLBACK_THUMBNAIL_SRC}\"`,
          `data-fallback-src=\"${FALLBACK_THUMBNAIL_SRC}\"`,
          'loading="lazy"',
          'decoding="async"'
        );
      }
      thumbnailAttrLines.push(
        `alt=\"${this.escapeHTML(video.title)}\"`
      );

      const cardHtml = `
        <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass} ${animationClass}">
          <!-- The clickable link to play video -->
          <a
            href="${shareUrl}"
            data-video-id="${video.id}"
            data-play-url=""
            data-play-magnet=""
            data-torrent-supported="${magnetSupported ? "true" : "false"}"
            class="block cursor-pointer relative group"
          >
            <div class="ratio-16-9">
              <img
                ${thumbnailAttrLines.join("\n                ")}
              />
            </div>
          </a>
          <div class="p-4">
            <!-- Title triggers the video modal as well -->
            <h3
              class="text-lg font-bold text-white line-clamp-2 hover:text-blue-400 cursor-pointer mb-3"
              data-video-id="${video.id}"
              data-play-url=""
              data-play-magnet=""
              data-torrent-supported="${magnetSupported ? "true" : "false"}"
            >
              ${this.escapeHTML(video.title)}
            </h3>
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                  <img
                    class="author-pic"
                    data-pubkey="${video.pubkey}"
                    src="assets/svg/default-profile.svg"
                    alt="Placeholder"
                  />
                </div>
                <div class="min-w-0">
                  <p
                    class="text-sm text-gray-400 author-name"
                    data-pubkey="${video.pubkey}"
                  >
                    Loading name...
                  </p>
                  <div class="flex items-center text-xs text-gray-500 mt-1">
                    <span>${timeAgo}</span>
                    <!-- We removed the 'Channel' button here -->
                  </div>
                </div>
              </div>
              ${gearMenu}
            </div>
            ${connectionBadgesHtml}
            ${torrentWarningHtml}
          </div>
        </div>
      `;

      const template = document.createElement("template");
      template.innerHTML = cardHtml.trim();
      const cardEl = template.content.firstElementChild;
      if (cardEl) {
        cardEl.dataset.ownerIsViewer = canEdit ? "true" : "false";
        if (typeof video.pubkey === "string" && video.pubkey) {
          cardEl.dataset.ownerPubkey = video.pubkey;
        } else if (cardEl.dataset.ownerPubkey) {
          delete cardEl.dataset.ownerPubkey;
        }

        if (trimmedUrl) {
          cardEl.dataset.urlHealthState = "checking";
          if (cardEl.dataset.urlHealthReason) {
            delete cardEl.dataset.urlHealthReason;
          }
          cardEl.dataset.urlHealthEventId = video.id || "";
          cardEl.dataset.urlHealthUrl = encodeURIComponent(trimmedUrl);
        } else {
          cardEl.dataset.urlHealthState = "offline";
          cardEl.dataset.urlHealthReason = "missing-source";
          if (cardEl.dataset.urlHealthEventId) {
            delete cardEl.dataset.urlHealthEventId;
          }
          if (cardEl.dataset.urlHealthUrl) {
            delete cardEl.dataset.urlHealthUrl;
          }
        }
        if (magnetProvided && magnetSupported) {
          cardEl.dataset.streamHealthState = "checking";
          if (cardEl.dataset.streamHealthReason) {
            delete cardEl.dataset.streamHealthReason;
          }
        } else {
          cardEl.dataset.streamHealthState = "unhealthy";
          cardEl.dataset.streamHealthReason = magnetProvided
            ? "unsupported"
            : "missing-source";
        }

        const thumbnailEl = cardEl.querySelector("[data-video-thumbnail]");
        if (thumbnailEl) {
          const markThumbnailAsLoaded = () => {
            if (!escapedThumbnail) {
              return;
            }

            if (shouldAnimateThumbnail) {
              // Flag the element so CSS runs a one-time fade. js/index.js scrubs
              // this attribute in the `animationend` handler so reusing the same
              // DOM node later will not re-trigger the animation and flash.
              if (thumbnailEl.dataset.thumbnailLoaded !== "true") {
                thumbnailEl.dataset.thumbnailLoaded = "true";
              }
            } else if (thumbnailEl.dataset.thumbnailLoaded) {
              delete thumbnailEl.dataset.thumbnailLoaded;
            }

            this.loadedThumbnails.set(video.id, escapedThumbnail);
          };

          const handleThumbnailLoad = () => {
            if (thumbnailEl.dataset.thumbnailLoaded === "true") {
              return;
            }

            const hasPendingLazySrc =
              typeof thumbnailEl.dataset.lazy === "string" &&
              thumbnailEl.dataset.lazy.trim().length > 0;

            if (hasPendingLazySrc) {
              return;
            }

            if (thumbnailEl.dataset.thumbnailFailed || !escapedThumbnail) {
              return;
            }

            const fallbackAttr =
              (typeof thumbnailEl.dataset.fallbackSrc === "string"
                ? thumbnailEl.dataset.fallbackSrc.trim()
                : "") ||
              thumbnailEl.getAttribute("data-fallback-src") ||
              "";

            const currentSrc = thumbnailEl.currentSrc || thumbnailEl.src || "";
            const isFallbackSrc =
              !!fallbackAttr &&
              !!currentSrc &&
              (currentSrc === fallbackAttr || currentSrc.endsWith(fallbackAttr));

            if (isFallbackSrc) {
              return;
            }

            if (
              (thumbnailEl.naturalWidth === 0 &&
                thumbnailEl.naturalHeight === 0) ||
              !currentSrc
            ) {
              return;
            }

            markThumbnailAsLoaded();

            thumbnailEl.removeEventListener("load", handleThumbnailLoad);
          };
          const handleThumbnailError = () => {
            if (
              escapedThumbnail &&
              this.loadedThumbnails.get(video.id) === escapedThumbnail
            ) {
              this.loadedThumbnails.delete(video.id);
            }

            if (thumbnailEl.dataset.thumbnailLoaded) {
              delete thumbnailEl.dataset.thumbnailLoaded;
            }

            thumbnailEl.removeEventListener("load", handleThumbnailLoad);
          };

          thumbnailEl.addEventListener("load", handleThumbnailLoad);
          thumbnailEl.addEventListener("error", handleThumbnailError, {
            once: true,
          });

          if (thumbnailEl.complete) {
            handleThumbnailLoad();
          }
        }

        if (showUnsupportedTorrentBadge) {
          cardEl.dataset.torrentSupported = "false";
        } else if (magnetProvided && magnetSupported) {
          cardEl.dataset.torrentSupported = "true";
        }

        if (magnetProvided) {
          cardEl.dataset.magnet = playbackMagnet;
        } else if (cardEl.dataset.magnet) {
          delete cardEl.dataset.magnet;
        }
        const interactiveEls = cardEl.querySelectorAll("[data-video-id]");
        // We intentionally leave the data-play-* attributes blank in cardHtml and
        // assign them after template parsing so the raw URL/magnet strings avoid
        // HTML entity escaping in the literal markup and keep any sensitive
        // magnet payloads out of the static DOM text.
        // The play URL is stored URL-encoded to keep spaces and query params
        // intact inside data-* attributes; attachVideoListHandler() decodes it
        // before playback.
        interactiveEls.forEach((el) => {
          if (!el.dataset) return;
          el.dataset.playUrl = encodeURIComponent(playbackUrl || "");
          el.dataset.playMagnet = playbackMagnet || "";
          if (magnetProvided) {
            el.dataset.torrentSupported = magnetSupported ? "true" : "false";
          }
        });

        if (trimmedUrl) {
          const badgeEl = cardEl.querySelector("[data-url-health-state]");
          if (badgeEl) {
            badgeEl.dataset.urlHealthEventId = video.id || "";
            badgeEl.dataset.urlHealthUrl = encodeURIComponent(trimmedUrl);
          }
        } else {
          const badgeEl = cardEl.querySelector("[data-url-health-state]");
          if (badgeEl) {
            if (badgeEl.dataset.urlHealthEventId) {
              delete badgeEl.dataset.urlHealthEventId;
            }
            if (badgeEl.dataset.urlHealthUrl) {
              delete badgeEl.dataset.urlHealthUrl;
            }
          }
        }
      }
      if (video && video.id) {
        this.videosMap.set(video.id, video);
      }

      fragment.appendChild(cardEl);
      this.renderedVideoIds.add(video.id);
    });

    // Clear old content, add new
    this.videoList.innerHTML = "";
    this.videoList.appendChild(fragment);
    attachHealthBadges(this.videoList);
    attachUrlHealthBadges(this.videoList, ({ badgeEl, url, eventId }) => {
      const video = this.videosMap.get(eventId) || { id: eventId };
      this.handleUrlHealthBadge({ video, url, badgeEl });
    });

    // Ensure every thumbnail can recover with a fallback image if the primary
    // source fails to load or returns a zero-sized response (some CDNs error
    // with HTTP 200 + empty body). We set up the listeners before kicking off
    // any lazy-loading observers so cached failures are covered as well.
    this.bindThumbnailFallbacks(this.videoList);

    // Lazy-load images
    const lazyEls = this.videoList.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => this.mediaLoader.observe(el));

    // GEAR MENU / button event listeners...
    const gearButtons = this.videoList.querySelectorAll(
      "[data-settings-dropdown]"
    );
    gearButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = button.getAttribute("data-settings-dropdown");
        const dropdown = document.getElementById(`settingsDropdown-${index}`);
        if (dropdown) {
          dropdown.classList.toggle("hidden");
        }
      });
    });

    // Edit button
    const editButtons = this.videoList.querySelectorAll("[data-edit-index]");
    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const indexAttr = button.getAttribute("data-edit-index");
        const eventId = button.getAttribute("data-edit-event-id") || "";
        const index = Number.parseInt(indexAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${indexAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        this.handleEditVideo({
          eventId,
          index: Number.isNaN(index) ? null : index,
        });
      });
    });

    // Revert button
    const revertButtons = this.videoList.querySelectorAll(
      "[data-revert-index]"
    );
    revertButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const indexAttr = button.getAttribute("data-revert-index");
        const eventId = button.getAttribute("data-revert-event-id") || "";
        const index = Number.parseInt(indexAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${indexAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        this.handleRevertVideo({
          eventId,
          index: Number.isNaN(index) ? null : index,
        });
      });
    });

    // Delete All button
    const deleteAllButtons = this.videoList.querySelectorAll(
      "[data-delete-all-index]"
    );
    deleteAllButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const indexAttr = button.getAttribute("data-delete-all-index");
        const eventId = button.getAttribute("data-delete-all-event-id") || "";
        const index = Number.parseInt(indexAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${indexAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        this.handleFullDeleteVideo({
          eventId,
          index: Number.isNaN(index) ? null : index,
        });
      });
    });

    // 2) After building cards, do one batch profile fetch
    this.batchFetchProfiles(authorSet);

    // === NEW: attach click listeners to .author-pic and .author-name
    const authorPics = this.videoList.querySelectorAll(".author-pic");
    authorPics.forEach((pic) => {
      pic.style.cursor = "pointer";
      pic.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation(); // avoids playing the video
        const pubkey = pic.getAttribute("data-pubkey");
        this.goToProfile(pubkey);
      });
    });

    const authorNames = this.videoList.querySelectorAll(".author-name");
    authorNames.forEach((nameEl) => {
      nameEl.style.cursor = "pointer";
      nameEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation(); // avoids playing the video
        const pubkey = nameEl.getAttribute("data-pubkey");
        this.goToProfile(pubkey);
      });
    });
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
    if (this.modalStatus) {
      const fullyDownloaded = torrent.progress >= 1;
      this.modalStatus.textContent = fullyDownloaded
        ? "Complete"
        : "Downloading";
    }

    // Update the progress bar
    if (this.modalProgress) {
      const percent = (torrent.progress * 100).toFixed(2);
      this.modalProgress.style.width = `${percent}%`;
    }

    // Update peers count
    if (this.modalPeers) {
      this.modalPeers.textContent = `Peers: ${torrent.numPeers}`;
    }

    // Update speed in KB/s
    if (this.modalSpeed) {
      const kb = (torrent.downloadSpeed / 1024).toFixed(2);
      this.modalSpeed.textContent = `${kb} KB/s`;
    }

    // Update downloaded / total
    if (this.modalDownloaded) {
      const downloadedMb = (torrent.downloaded / (1024 * 1024)).toFixed(2);
      const lengthMb = (torrent.length / (1024 * 1024)).toFixed(2);
      this.modalDownloaded.textContent = `${downloadedMb} MB / ${lengthMb} MB`;
    }

    // If you want to show a different text at 100% or if "ready"
    // you can do it here:
    if (torrent.ready && this.modalStatus) {
      this.modalStatus.textContent = "Ready to play";
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
      const latestVideos = await nostrClient.fetchVideos();
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

      // 3) Prompt the user for updated fields
      const newTitle = prompt("New Title? (blank=keep existing)", video.title);
      if (newTitle === null) {
        return;
      }

      const newMagnet = prompt(
        "New Magnet? (blank=keep existing)",
        video.magnet
      );
      if (newMagnet === null) {
        return;
      }

      const newUrl = prompt(
        "New URL? (blank=keep existing)",
        video.url || ""
      );
      if (newUrl === null) {
        return;
      }

      const newThumb = prompt(
        "New Thumbnail? (blank=keep existing)",
        video.thumbnail
      );
      if (newThumb === null) {
        return;
      }

      const newDesc = prompt(
        "New Description? (blank=keep existing)",
        video.description
      );
      if (newDesc === null) {
        return;
      }
      // const wantPrivate = confirm("Make this video private? OK=Yes, Cancel=No");

      // 4) Build final updated fields (or fallback to existing)
      const title =
        !newTitle || !newTitle.trim() ? video.title : newTitle.trim();
      const magnet =
        !newMagnet || !newMagnet.trim() ? video.magnet : newMagnet.trim();
      const url = !newUrl || !newUrl.trim() ? video.url : newUrl.trim();
      const thumbnail =
        !newThumb || !newThumb.trim() ? video.thumbnail : newThumb.trim();
      const description =
        !newDesc || !newDesc.trim() ? video.description : newDesc.trim();

      // 5) Create an object with the new data
      const updatedData = {
        version: video.version || 2,
        // isPrivate: wantPrivate,
        title,
        magnet,
        url,
        thumbnail,
        description,
        mode: isDevMode ? "dev" : "live",
      };

      // 6) Build the originalEvent stub, now including videoRootId to avoid extra fetch
      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        videoRootId: video.videoRootId, // <-- pass this if it exists
      };

      // 7) Call the editVideo method
      await nostrClient.editVideo(originalEvent, updatedData, this.pubkey);

      // 8) Refresh local UI
      await this.loadVideos();

      // 8.1) Purge the outdated cache
      this.videosMap.clear();

      this.showSuccess("Video updated successfully!");

      // 9) Also refresh all profile caches so any new name/pic changes are reflected
      this.forceRefreshAllProfiles();
    } catch (err) {
      console.error("Failed to edit video:", err);
      this.showError("Failed to edit video. Please try again.");
    }
  }

  async handleRevertVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
      const activeVideos = await nostrClient.fetchVideos();
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

      // 2) Grab all known events so older overshadowed ones are included
      const allEvents = Array.from(nostrClient.allEvents.values());

      // 3) Check for older versions among *all* events, not just the active ones
      if (!this.hasOlderVersion(video, allEvents)) {
        this.showError("No older version exists to revert to.");
        return;
      }

      if (!confirm(`Revert current version of "${video.title}"?`)) {
        return;
      }

      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        tags: video.tags,
      };

      await nostrClient.revertVideo(originalEvent, this.pubkey);

      await this.loadVideos();
      this.showSuccess("Current version reverted successfully!");
      this.forceRefreshAllProfiles();
    } catch (err) {
      console.error("Failed to revert video:", err);
      this.showError("Failed to revert video. Please try again.");
    }
  }

  /**
   * Handle "Delete Video" from gear menu.
   */
  async handleFullDeleteVideo(target) {
    try {
      const normalizedTarget = this.normalizeActionTarget(target);
      const all = await nostrClient.fetchVideos();
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

      await nostrClient.deleteAllVersions(rootId, this.pubkey);

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
        Number.isFinite(URL_PROBE_TIMEOUT_RETRY_MS) &&
        URL_PROBE_TIMEOUT_RETRY_MS > initialTimeout
      ) {
        const retryResult = await attemptWithTimeout(URL_PROBE_TIMEOUT_RETRY_MS);
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
        if (this.modalStatus) {
          this.modalStatus.textContent = UNSUPPORTED_BTITH_MESSAGE;
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

      if (this.modalStatus) {
        this.modalStatus.textContent = "Streaming via WebTorrent";
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
    // When the modal closes we run an asynchronous cleanup that tears down the
    // previous MediaSource attachment. If the user immediately selects another
    // video we must wait for that teardown to finish or the stale cleanup will
    // wipe the freshly attached `src`/`srcObject`, leaving playback stuck on a
    // blank frame. Guard every playback entry point with waitForCleanup() so the
    // race never reappears.
    await this.waitForCleanup();

    const sanitizedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";

    const playbackConfig = deriveTorrentPlaybackConfig({
      magnet: trimmedMagnet,
      url: sanitizedUrl,
      logger: (message) => this.log(message),
    });

    const magnetIsUsable = isValidMagnetUri(playbackConfig.magnet);
    const magnetForPlayback = magnetIsUsable ? playbackConfig.magnet : "";
    const fallbackMagnet = magnetIsUsable
      ? playbackConfig.fallbackMagnet
      : "";
    const magnetProvided = playbackConfig.provided;

    if (this.currentVideo) {
      this.currentVideo.magnet = magnetForPlayback;
      this.currentVideo.normalizedMagnet = magnetForPlayback;
      this.currentVideo.normalizedMagnetFallback = fallbackMagnet;
      if (playbackConfig.infoHash && !this.currentVideo.legacyInfoHash) {
        this.currentVideo.legacyInfoHash = playbackConfig.infoHash;
      }
      this.currentVideo.torrentSupported = !!magnetForPlayback;
    }
    this.currentMagnetUri = magnetForPlayback || null;
    this.setCopyMagnetState(!!magnetForPlayback);

    try {
      if (!this.modalVideo) {
        throw new Error("Video element is not ready for playback.");
      }

      this.showModalWithPoster();
      const videoEl = this.modalVideo;
      const HOSTED_URL_SUCCESS_MESSAGE = "✅ Streaming from hosted URL";

      if (this.modalStatus) {
        this.modalStatus.textContent = "Preparing video...";
      }

      this.clearActiveIntervals();
      this.prepareModalVideoForPlayback();

      await torrentClient.cleanup();

      videoEl.pause();
      // Clearing the WebTorrent attachment requires wiping both `src` and
      // `srcObject`. Multiple regressions have shipped where we only blanked
      // `src`, leaving the old MediaSource wired up and the next magnet would
      // stall on a grey frame. Always clear both before calling `load()`.
      videoEl.src = "";
      videoEl.removeAttribute("src");
      videoEl.srcObject = null;
      videoEl.load();

      this.resetTorrentStats();
      this.playSource = null;
      this.cleanupUrlPlaybackWatchdog();

      if (magnetForPlayback) {
        const label = playbackConfig.didMutate
          ? "[playVideoWithFallback] Using normalized magnet URI:"
          : "[playVideoWithFallback] Using magnet URI:";
        this.log(`${label} ${magnetForPlayback}`);
      }

      const httpsUrl =
        sanitizedUrl && /^https:\/\//i.test(sanitizedUrl) ? sanitizedUrl : "";
      const webSeedCandidates = httpsUrl ? [httpsUrl] : [];
      let cleanupHostedUrlStatusListeners = () => {};

      let fallbackStarted = false;
      const startTorrentFallback = async (reason) => {
        if (fallbackStarted) {
          this.log(
            `[playVideoWithFallback] Duplicate fallback request ignored (${reason}).`
          );
          return null;
        }
        fallbackStarted = true;
        this.cleanupUrlPlaybackWatchdog();
        cleanupHostedUrlStatusListeners();

        if (videoEl) {
          try {
            videoEl.pause();
          } catch (err) {
            this.log(
              "[playVideoWithFallback] Ignoring pause error before torrent fallback:",
              err
            );
          }
          try {
            videoEl.removeAttribute("src");
          } catch (err) {
            // removeAttribute throws in old browsers when the attribute does not exist
          }
          videoEl.src = "";
          videoEl.srcObject = null;
          try {
            videoEl.load();
          } catch (err) {
            this.log(
              "[playVideoWithFallback] Ignoring load error before torrent fallback:",
              err
            );
          }
        }
        if (!magnetForPlayback) {
          const message =
            "Hosted playback failed and no magnet fallback is available.";
          if (this.modalStatus) {
            this.modalStatus.textContent = message;
          }
          this.playSource = null;
          throw new Error(message);
        }

        if (this.modalStatus) {
          this.modalStatus.textContent = "Switching to WebTorrent...";
        }
        this.log(
          `[playVideoWithFallback] Falling back to WebTorrent (${reason}).`
        );
        console.debug("[WT] add magnet =", magnetForPlayback);
        const torrentInstance = await this.playViaWebTorrent(
          magnetForPlayback,
          {
            fallbackMagnet,
            urlList: webSeedCandidates,
          }
        );
        this.playSource = "torrent";
        this.autoplayModalVideo();
        return torrentInstance;
      };

      if (URL_FIRST_ENABLED && httpsUrl) {
        if (this.modalStatus) {
          this.modalStatus.textContent = "Checking hosted URL...";
        }
        let hostedStatusResolved = false;
        const hostedStatusHandlers = [];
        const addHostedStatusListener = (eventName, handler, options) => {
          if (!videoEl) {
            return;
          }
          videoEl.addEventListener(eventName, handler, options);
          hostedStatusHandlers.push([eventName, handler, options]);
        };
        const markHostedUrlAsLive = () => {
          if (hostedStatusResolved) {
            return;
          }
          hostedStatusResolved = true;
          if (this.modalStatus) {
            this.modalStatus.textContent = HOSTED_URL_SUCCESS_MESSAGE;
          }
          cleanupHostedUrlStatusListeners();
        };
        const maybeMarkHostedUrl = () => {
          if (
            hostedStatusResolved ||
            !videoEl ||
            videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            return;
          }
          if (videoEl.currentTime > 0 || !videoEl.paused) {
            markHostedUrlAsLive();
          }
        };
        cleanupHostedUrlStatusListeners = () => {
          if (!hostedStatusHandlers.length || !videoEl) {
            hostedStatusHandlers.length = 0;
            cleanupHostedUrlStatusListeners = () => {};
            return;
          }
          for (const [eventName, handler, options] of hostedStatusHandlers) {
            videoEl.removeEventListener(eventName, handler, options);
          }
          hostedStatusHandlers.length = 0;
          cleanupHostedUrlStatusListeners = () => {};
        };
        addHostedStatusListener("playing", markHostedUrlAsLive, { once: true });
        addHostedStatusListener("loadeddata", maybeMarkHostedUrl);
        addHostedStatusListener("canplay", maybeMarkHostedUrl);
        addHostedStatusListener("error", () => {
          cleanupHostedUrlStatusListeners();
        }, { once: true });
        const probeResult = await this.probeUrl(httpsUrl);
        const probeOutcome = probeResult?.outcome || "error";
        const shouldAttemptHosted =
          probeOutcome !== "bad" && probeOutcome !== "error";

        if (shouldAttemptHosted) {
          let outcomeResolved = false;
          let outcomeResolver = () => {};
          let autoplayBlocked = false;

          const playbackOutcomePromise = new Promise((resolve) => {
            outcomeResolver = (value) => {
              if (outcomeResolved) {
                return;
              }
              outcomeResolved = true;
              resolve(value);
            };
          });

          const attachWatchdogs = ({ stallMs = 8000 } = {}) => {
            this.registerUrlPlaybackWatchdogs(videoEl, {
              stallMs,
              onSuccess: () => outcomeResolver({ status: "success" }),
              onFallback: (reason) => {
                if (autoplayBlocked && reason === "stall") {
                  this.log(
                    "[playVideoWithFallback] Autoplay blocked; waiting for user gesture before falling back."
                  );
                  if (this.modalStatus) {
                    this.modalStatus.textContent =
                      "Press play to start the hosted video.";
                  }
                  attachWatchdogs({ stallMs: 0 });
                  return;
                }

                outcomeResolver({ status: "fallback", reason });
              },
            });
          };

          attachWatchdogs({ stallMs: 8000 });

          const handleFatalPlaybackError = (err) => {
            this.log(
              "[playVideoWithFallback] Direct URL playback threw:",
              err
            );
            outcomeResolver({ status: "fallback", reason: "play-error" });
          };

          try {
            videoEl.src = httpsUrl;
            const playPromise = videoEl.play();
            if (playPromise && typeof playPromise.catch === "function") {
              playPromise.catch((err) => {
                if (err?.name === "NotAllowedError") {
                  autoplayBlocked = true;
                  this.log(
                    "[playVideoWithFallback] Autoplay blocked by browser; awaiting user interaction.",
                    err
                  );
                  if (this.modalStatus) {
                    this.modalStatus.textContent =
                      "Press play to start the hosted video.";
                  }
                  this.cleanupUrlPlaybackWatchdog();
                  attachWatchdogs({ stallMs: 0 });
                  const restoreOnPlay = () => {
                    videoEl.removeEventListener("play", restoreOnPlay);
                    this.cleanupUrlPlaybackWatchdog();
                    autoplayBlocked = false;
                    attachWatchdogs({ stallMs: 8000 });
                  };
                  videoEl.addEventListener("play", restoreOnPlay, {
                    once: true,
                  });
                  return;
                }
                handleFatalPlaybackError(err);
              });
            }
          } catch (err) {
            handleFatalPlaybackError(err);
          }

          const playbackOutcome = await playbackOutcomePromise;
          if (playbackOutcome?.status === "success") {
            this.forceRemoveModalPoster("http-success");
            this.playSource = "url";
            if (this.modalStatus) {
              this.modalStatus.textContent = HOSTED_URL_SUCCESS_MESSAGE;
            }
            cleanupHostedUrlStatusListeners();
            return;
          }

          const fallbackReason = playbackOutcome?.reason || "watchdog-triggered";
          await startTorrentFallback(fallbackReason);
          return;
        }

        this.log(
          `[playVideoWithFallback] Hosted URL probe reported "${probeOutcome}"; deferring to WebTorrent.`
        );
        cleanupHostedUrlStatusListeners();
      }

      if (magnetForPlayback) {
        await startTorrentFallback("magnet-primary");
        return;
      }

      const message = magnetProvided && !magnetForPlayback
        ? UNSUPPORTED_BTITH_MESSAGE
        : "No playable source found.";
      if (this.modalStatus) {
        this.modalStatus.textContent = message;
      }
      this.playSource = null;
      this.showError(message);
    } catch (error) {
      this.log("Error in playVideoWithFallback:", error);
      this.showError(`Playback error: ${error.message}`);
    }
  }

  async playVideoByEventId(eventId) {
    if (!eventId) {
      this.showError("No video identifier provided.");
      return;
    }

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

    const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
    if (initialBlacklist.includes(authorNpub)) {
      this.showError("This content has been removed or is not allowed.");
      return;
    }

    if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
      this.showError("This content is not from a whitelisted author.");
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
    if (this.videoTitle) {
      this.videoTitle.textContent = video.title || "Untitled";
    }
    if (this.videoDescription) {
      this.videoDescription.textContent =
        video.description || "No description available.";
    }
    if (this.videoTimestamp) {
      this.videoTimestamp.textContent = this.formatTimeAgo(video.created_at);
    }
    if (this.creatorName) {
      this.creatorName.textContent = creatorProfile.name;
    }
    if (this.creatorNpub) {
      this.creatorNpub.textContent = `${creatorNpub.slice(0, 8)}...${creatorNpub.slice(
        -4
      )}`;
    }
    if (this.creatorAvatar) {
      this.creatorAvatar.src = creatorProfile.picture;
      this.creatorAvatar.alt = creatorProfile.name;
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
    };

    this.currentMagnetUri = sanitizedMagnet || null;

    this.setCopyMagnetState(!!sanitizedMagnet);
    this.setShareButtonState(false);

    if (this.videoTitle) {
      this.videoTitle.textContent = title || "Untitled";
    }
    if (this.videoDescription) {
      this.videoDescription.textContent =
        description || "No description available.";
    }
    if (this.videoTimestamp) {
      this.videoTimestamp.textContent = "";
    }
    if (this.creatorName) {
      this.creatorName.textContent = "Unknown";
    }
    if (this.creatorNpub) {
      this.creatorNpub.textContent = "";
    }
    if (this.creatorAvatar) {
      this.creatorAvatar.src = "assets/svg/default-profile.svg";
      this.creatorAvatar.alt = "Unknown";
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
    try {
      return window.NostrTools.nip19.npubEncode(pubkey);
    } catch (err) {
      return null;
    }
  }

  /**
   * Attempts to fetch an older event by its ID if we can't find it in
   * this.videosMap or from a bulk fetch. Uses nostrClient.getEventById.
   */
  async getOldEventById(eventId) {
    // 1) Already in our local videosMap?
    let video = this.videosMap.get(eventId);
    if (video) {
      return video;
    }

    // 2) Already in nostrClient.allEvents?
    //    (assuming nostrClient.allEvents is a Map of id => video)
    const fromAll = nostrClient.allEvents.get(eventId);
    if (fromAll && !fromAll.deleted) {
      this.videosMap.set(eventId, fromAll);
      return fromAll;
    }

    // 3) Direct single-event fetch (fewer resources than full fetchVideos)
    const single = await nostrClient.getEventById(eventId);
    if (single && !single.deleted) {
      this.videosMap.set(single.id, single);
      return single;
    }

    // 4) If you wanted a final fallback, you could do it here:
    //    But it's typically better to avoid repeated full fetches
    // console.log("Falling back to full fetchVideos...");
    // const allFetched = await nostrClient.fetchVideos();
    // video = allFetched.find(v => v.id === eventId && !v.deleted);
    // if (video) {
    //   this.videosMap.set(video.id, video);
    //   return video;
    // }

    // Not found or was deleted
    return null;
  }

  /**
   * Format "time ago" for a given timestamp (in seconds).
   */
  formatTimeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };
    for (const [unit, secInUnit] of Object.entries(intervals)) {
      const int = Math.floor(seconds / secInUnit);
      if (int >= 1) {
        return `${int} ${unit}${int > 1 ? "s" : ""} ago`;
      }
    }
    return "just now";
  }

  escapeHTML(unsafe) {
    if (unsafe === null || typeof unsafe === "undefined") {
      return "";
    }

    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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
app.init();
window.app = app;
