// js/historyView.js

import watchHistoryService from "./watchHistoryService.js";
import {
  pointerKey,
  normalizePointerInput,
  nostrClient,
  updateWatchHistoryList,
} from "./nostr.js";
import {
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE,
} from "./config.js";

export const WATCH_HISTORY_EMPTY_COPY =
  "Your watch history is empty. Watch some videos to populate this list.";

export const WATCH_HISTORY_DISABLED_COPY =
  "Encrypted watch history sync is disabled by this server. Local history stays on this device only.";

const WATCH_HISTORY_METADATA_PREF_KEY =
  "bitvid:watch-history:metadata-preference";
const WATCH_HISTORY_PRIVACY_DISMISSED_KEY =
  "bitvid:watch-history:privacy-banner-dismissed";
const DEFAULT_WATCH_HISTORY_BATCH_SIZE = 12;
const WATCH_HISTORY_BATCH_SIZE = (() => {
  const raw = Number(WATCH_HISTORY_BATCH_PAGE_SIZE);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_WATCH_HISTORY_BATCH_SIZE;
  }
  return Math.floor(raw);
})();
const FALLBACK_THUMBNAIL = "assets/svg/default-thumbnail.svg";
const FALLBACK_AVATAR = "assets/svg/default-profile.svg";
const isDevEnv =
  typeof process !== "undefined" &&
  process?.env?.NODE_ENV !== "production";

function escapeSelector(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function resolveElement(selector) {
  if (!selector || typeof selector !== "string") {
    return null;
  }
  try {
    return document.querySelector(selector);
  } catch (error) {
    console.warn("[historyView] Failed to query selector:", selector, error);
    return null;
  }
}

function setHidden(element, hidden) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.classList.toggle("hidden", hidden);
  if (hidden) {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.removeAttribute("aria-hidden");
  }
}

function setTextContent(element, text) {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  element.textContent = text;
}

function getAppInstance() {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.app) {
    return window.app;
  }
  if (window.bitvid && window.bitvid.app) {
    return window.bitvid.app;
  }
  return null;
}

function safeLocaleDate(date) {
  try {
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  } catch (error) {
    return date.toDateString();
  }
}

function formatDayLabel(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds)) {
    return "Unknown day";
  }
  const eventDate = new Date(timestampSeconds * 1000);
  if (Number.isNaN(eventDate.getTime())) {
    return "Unknown day";
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const targetDay = eventDate.toDateString();
  if (targetDay === today.toDateString()) {
    return "Today";
  }
  if (targetDay === yesterday.toDateString()) {
    return "Yesterday";
  }
  return safeLocaleDate(eventDate);
}

function formatRelativeTime(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return "Unknown time";
  }
  const app = getAppInstance();
  if (app && typeof app.formatTimeAgo === "function") {
    return app.formatTimeAgo(timestampSeconds);
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const delta = Math.max(0, nowSeconds - Math.floor(timestampSeconds));
  const units = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "week", seconds: 604800 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
  ];
  for (const unit of units) {
    const count = Math.floor(delta / unit.seconds);
    if (count >= 1) {
      return `${count} ${unit.label}${count > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}

function computeFingerprint(items) {
  if (!Array.isArray(items) || !items.length) {
    return "";
  }
  const pieces = [];
  for (const entry of items) {
    const pointer = normalizePointerInput(entry);
    if (!pointer) {
      continue;
    }
    const key = pointerKey(pointer);
    if (!key) {
      continue;
    }
    const watchedAt = Number.isFinite(entry?.watchedAt) ? entry.watchedAt : 0;
    pieces.push(`${key}:${watchedAt}`);
  }
  return pieces.join("|");
}

function normalizeHistoryItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }
  const normalized = [];
  for (const candidate of rawItems) {
    const pointer = normalizePointerInput(candidate);
    if (!pointer) {
      continue;
    }
    const key = pointerKey(pointer);
    if (!key) {
      continue;
    }
    const watchedAtRaw = Number.isFinite(candidate?.watchedAt)
      ? candidate.watchedAt
      : Number.isFinite(candidate?.timestamp)
      ? candidate.timestamp
      : null;
    const watchedAt =
      watchedAtRaw !== null ? Math.max(0, Math.floor(watchedAtRaw)) : 0;
    normalized.push({
      pointer,
      pointerKey: key,
      watchedAt,
      raw: candidate,
    });
  }
  normalized.sort((a, b) => {
    if (a.watchedAt !== b.watchedAt) {
      return b.watchedAt - a.watchedAt;
    }
    return a.pointerKey.localeCompare(b.pointerKey);
  });
  return normalized;
}

async function defaultRemoveHandler({
  actor,
  items,
  snapshot,
  reason = "remove-item",
} = {}) {
  const sanitized = Array.isArray(items)
    ? items
        .map((entry) => {
          const pointer = normalizePointerInput(entry?.pointer || entry);
          if (!pointer) {
            return null;
          }
          if (Number.isFinite(entry?.watchedAt)) {
            pointer.watchedAt = entry.watchedAt;
          }
          if (entry?.pointer?.session === true || entry?.session === true) {
            pointer.session = true;
          }
          return pointer;
        })
        .filter(Boolean)
    : [];
  if (typeof snapshot === "function") {
    await snapshot(sanitized, { actor, reason });
  }
  try {
    if (typeof updateWatchHistoryList === "function") {
      await updateWatchHistoryList(sanitized, {
        actorPubkey: actor,
        replace: true,
        source: reason,
      });
    }
  } catch (error) {
    if (isDevEnv) {
      console.warn("[historyView] Failed to update watch history list:", error);
    }
    throw error;
  }
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function readPreference(key, fallback) {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }
  try {
    const stored = storage.getItem(key);
    return stored === null ? fallback : stored;
  } catch (error) {
    return fallback;
  }
}

function writePreference(key, value) {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    if (value === null || typeof value === "undefined") {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, value);
  } catch (error) {
    if (isDevEnv) {
      console.warn("[historyView] Failed to persist preference:", error);
    }
  }
}

function removeEmptyDayContainers(grid) {
  if (!(grid instanceof HTMLElement)) {
    return;
  }
  const daySections = grid.querySelectorAll("[data-history-day]");
  daySections.forEach((section) => {
    if (!(section instanceof HTMLElement)) {
      return;
    }
    const list = section.querySelector("[data-history-day-list]");
    if (list instanceof HTMLElement && list.childElementCount === 0) {
      section.remove();
    }
  });
}

function getPointerVideoId(video, pointer) {
  if (video && typeof video.id === "string" && video.id) {
    return video.id;
  }
  if (pointer?.type === "e" && typeof pointer.value === "string") {
    return pointer.value;
  }
  return "";
}

async function resolveVideoFromPointer(pointer, caches) {
  if (!pointer) {
    return null;
  }
  const app = getAppInstance();
  const type = pointer.type === "a" ? "a" : "e";
  const value = typeof pointer.value === "string" ? pointer.value.trim() : "";
  if (!value) {
    return null;
  }

  const normalizeVideo = (video) => {
    if (!video || typeof video !== "object") {
      return null;
    }
    if (video.deleted) {
      return null;
    }
    return video;
  };

  if (type === "e") {
    const fromCache = app?.videosMap?.get(value);
    if (fromCache) {
      const normalized = normalizeVideo(fromCache);
      if (normalized) {
        return normalized;
      }
    }
    if (nostrClient?.allEvents instanceof Map) {
      const event = nostrClient.allEvents.get(value);
      if (event) {
        const normalized = normalizeVideo(event);
        if (normalized) {
          return normalized;
        }
      }
    }
    if (typeof app?.getOldEventById === "function") {
      try {
        const fetched = await app.getOldEventById(value);
        if (fetched) {
          const normalized = normalizeVideo(fetched);
          if (normalized) {
            return normalized;
          }
        }
      } catch (error) {
        if (isDevEnv) {
          console.warn("[historyView] Failed to load video via app cache:", error);
        }
      }
    }
    if (typeof nostrClient?.getEventById === "function") {
      try {
        const fetched = await nostrClient.getEventById(value);
        const normalized = normalizeVideo(fetched);
        if (normalized) {
          return normalized;
        }
      } catch (error) {
        if (isDevEnv) {
          console.warn("[historyView] Failed to fetch event by id:", error);
        }
      }
    }
    return null;
  }

  const compareAddress = (video) => {
    if (!video || typeof video !== "object") {
      return false;
    }
    if (typeof app?.getVideoAddressPointer !== "function") {
      return false;
    }
    const address = app.getVideoAddressPointer(video);
    return typeof address === "string" && address.trim() === value;
  };

  if (app?.videosMap instanceof Map) {
    for (const cached of app.videosMap.values()) {
      if (compareAddress(cached)) {
        const normalized = normalizeVideo(cached);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  const activeVideos = Array.isArray(caches?.activeVideos)
    ? caches.activeVideos
    : typeof nostrClient?.getActiveVideos === "function"
    ? nostrClient.getActiveVideos()
    : [];
  for (const candidate of activeVideos) {
    if (compareAddress(candidate)) {
      const normalized = normalizeVideo(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  if (!caches?.catalogPromise && typeof nostrClient?.fetchVideos === "function") {
    caches.catalogPromise = nostrClient.fetchVideos().catch((error) => {
      if (isDevEnv) {
        console.warn("[historyView] Failed to fetch video catalog:", error);
      }
      return [];
    });
  }
  if (caches?.catalogPromise) {
    try {
      const catalog = await caches.catalogPromise;
      if (Array.isArray(catalog)) {
        for (const candidate of catalog) {
          if (compareAddress(candidate)) {
            const normalized = normalizeVideo(candidate);
            if (normalized) {
              return normalized;
            }
          }
        }
      }
    } catch (error) {
      if (isDevEnv) {
        console.warn("[historyView] Failed to search catalog for pointer:", error);
      }
    }
  }

  return null;
}

function resolveProfileForPubkey(pubkey) {
  if (typeof pubkey !== "string" || !pubkey.trim()) {
    return null;
  }
  const app = getAppInstance();
  if (!app) {
    return null;
  }
  try {
    const cacheEntry = app.getProfileCacheEntry
      ? app.getProfileCacheEntry(pubkey)
      : null;
    if (cacheEntry && typeof cacheEntry === "object") {
      return cacheEntry.profile || null;
    }
  } catch (error) {
    if (isDevEnv) {
      console.warn("[historyView] Failed to read profile cache:", error);
    }
  }
  return null;
}

function buildHistoryCard({
  item,
  video,
  profile,
  metadataPreference,
}) {
  const article = document.createElement("article");
  article.className = "watch-history-card";
  article.dataset.pointerKey = item.pointerKey;
  if (video?.isPrivate) {
    article.classList.add("watch-history-card--private");
  }

  const primary = document.createElement("div");
  primary.className = "watch-history-card__primary";

  const playbackData = (() => {
    if (!video) {
      return { url: "", magnet: "" };
    }
    const url = typeof video.url === "string" ? video.url.trim() : "";
    const magnetRaw =
      typeof video.magnet === "string"
        ? video.magnet.trim()
        : typeof video.infoHash === "string"
        ? video.infoHash.trim()
        : "";
    return { url, magnet: magnetRaw };
  })();

  const pointerVideoId = getPointerVideoId(video, item.pointer);

  const thumbnailLink = document.createElement("a");
  thumbnailLink.className = "watch-history-card__thumbnail";
  thumbnailLink.href = "#";
  thumbnailLink.dataset.historyAction = "play";
  thumbnailLink.dataset.pointerKey = item.pointerKey;
  if (pointerVideoId) {
    thumbnailLink.dataset.videoId = pointerVideoId;
  }
  if (playbackData.url) {
    thumbnailLink.dataset.playUrl = encodeURIComponent(playbackData.url);
  }
  if (playbackData.magnet) {
    thumbnailLink.dataset.playMagnet = playbackData.magnet;
  }

  const thumbnailInner = document.createElement("div");
  thumbnailInner.className = "watch-history-card__thumbnailInner";
  const thumbnailImg = document.createElement("img");
  thumbnailImg.alt = video?.title || "Video thumbnail";
  const thumbnailSrc =
    (video && typeof video.thumbnail === "string" && video.thumbnail.trim())
      ? video.thumbnail.trim()
      : FALLBACK_THUMBNAIL;
  thumbnailImg.src = thumbnailSrc;
  thumbnailImg.loading = "lazy";
  thumbnailImg.decoding = "async";
  thumbnailInner.appendChild(thumbnailImg);
  thumbnailLink.appendChild(thumbnailInner);

  const details = document.createElement("div");
  details.className = "watch-history-card__details";

  const titleLink = document.createElement("a");
  titleLink.className = "watch-history-card__title";
  titleLink.href = "#";
  titleLink.dataset.historyAction = "play";
  titleLink.dataset.pointerKey = item.pointerKey;
  if (pointerVideoId) {
    titleLink.dataset.videoId = pointerVideoId;
  }
  if (playbackData.url) {
    titleLink.dataset.playUrl = encodeURIComponent(playbackData.url);
  }
  if (playbackData.magnet) {
    titleLink.dataset.playMagnet = playbackData.magnet;
  }
  titleLink.textContent = video?.title || "Untitled video";

  const created = document.createElement("p");
  created.className = "watch-history-card__created";
  const createdAt = Number.isFinite(video?.created_at) ? video.created_at : null;
  created.textContent = createdAt
    ? `Published ${formatRelativeTime(createdAt)}`
    : "Published date unavailable";

  details.appendChild(titleLink);
  details.appendChild(created);

  primary.appendChild(thumbnailLink);
  primary.appendChild(details);

  const meta = document.createElement("div");
  meta.className = "watch-history-card__meta";

  const watched = document.createElement("p");
  watched.className = "watch-history-card__watched";
  watched.textContent = item.watchedAt
    ? `Watched ${formatRelativeTime(item.watchedAt)}`
    : "Watched time unavailable";
  meta.appendChild(watched);

  const creator = document.createElement("div");
  creator.className = "watch-history-card__creator";

  const creatorAvatarButton = document.createElement("button");
  creatorAvatarButton.type = "button";
  creatorAvatarButton.className = "watch-history-card__creatorAvatar";
  creatorAvatarButton.dataset.historyAction = "channel";
  creatorAvatarButton.dataset.pointerKey = item.pointerKey;
  if (video?.pubkey) {
    creatorAvatarButton.dataset.author = video.pubkey;
  }
  const avatarImg = document.createElement("img");
  const avatarSrc =
    (profile && typeof profile.picture === "string" && profile.picture.trim())
      ? profile.picture.trim()
      : FALLBACK_AVATAR;
  avatarImg.src = avatarSrc;
  avatarImg.alt = profile?.name || profile?.display_name || "Creator avatar";
  creatorAvatarButton.appendChild(avatarImg);

  const creatorNameButton = document.createElement("button");
  creatorNameButton.type = "button";
  creatorNameButton.className = "watch-history-card__creatorName";
  creatorNameButton.dataset.historyAction = "channel";
  creatorNameButton.dataset.pointerKey = item.pointerKey;
  if (video?.pubkey) {
    creatorNameButton.dataset.author = video.pubkey;
  }
  const app = getAppInstance();
  let creatorLabel =
    profile?.display_name || profile?.name || profile?.username || "Unknown";
  if ((!creatorLabel || creatorLabel === "Unknown") && video?.pubkey) {
    const encoded = app?.safeEncodeNpub?.(video.pubkey) || "";
    creatorLabel = encoded || video.pubkey.slice(0, 8).concat("…");
  }
  creatorNameButton.textContent = creatorLabel;

  creator.appendChild(creatorAvatarButton);
  creator.appendChild(creatorNameButton);
  meta.appendChild(creator);

  const actions = document.createElement("div");
  actions.className = "watch-history-card__actions";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className =
    "watch-history-card__action watch-history-card__action--primary";
  playButton.dataset.historyAction = "play";
  playButton.dataset.pointerKey = item.pointerKey;
  if (pointerVideoId) {
    playButton.dataset.videoId = pointerVideoId;
  }
  if (playbackData.url) {
    playButton.dataset.playUrl = encodeURIComponent(playbackData.url);
  }
  if (playbackData.magnet) {
    playButton.dataset.playMagnet = playbackData.magnet;
  }
  playButton.textContent = "Play";

  const channelButton = document.createElement("button");
  channelButton.type = "button";
  channelButton.className = "watch-history-card__action";
  channelButton.dataset.historyAction = "channel";
  channelButton.dataset.pointerKey = item.pointerKey;
  if (video?.pubkey) {
    channelButton.dataset.author = video.pubkey;
  }
  channelButton.textContent = "Open channel";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className =
    "watch-history-card__action watch-history-card__action--danger";
  removeButton.dataset.historyAction = "remove";
  removeButton.dataset.pointerKey = item.pointerKey;
  removeButton.textContent = "Remove from history";
  if (item.pointer?.type) {
    removeButton.dataset.pointerType = item.pointer.type;
  }
  if (item.pointer?.value) {
    removeButton.dataset.pointerValue = item.pointer.value;
  }
  if (item.pointer?.relay) {
    removeButton.dataset.pointerRelay = item.pointer.relay;
  }
  if (Number.isFinite(item.watchedAt)) {
    removeButton.dataset.pointerWatchedAt = String(item.watchedAt);
  }
  if (item.pointer?.session === true) {
    removeButton.dataset.pointerSession = "true";
  }
  removeButton.setAttribute(
    "aria-label",
    "Remove this encrypted history entry (sync may take a moment).",
  );
  removeButton.title =
    "Removes this entry from encrypted history. Relay sync may take a moment.";

  actions.appendChild(playButton);
  actions.appendChild(channelButton);
  actions.appendChild(removeButton);

  meta.appendChild(actions);

  if (metadataPreference === "relay-opt-in") {
    const hint = document.createElement("p");
    hint.className = "text-xs text-blue-200";
    hint.textContent = "Metadata is shared with relays for this entry.";
    meta.appendChild(hint);
  }

  article.appendChild(primary);
  article.appendChild(meta);

  return article;
}

export function createWatchHistoryRenderer(config = {}) {
  const {
    fetchHistory = watchHistoryService.loadLatest.bind(watchHistoryService),
    snapshot = watchHistoryService.snapshot.bind(watchHistoryService),
    remove,
    getActor,
    viewSelector = "#watchHistoryView",
    gridSelector = "#watchHistoryGrid",
    loadingSelector = "#watchHistoryLoading",
    statusSelector = "#watchHistoryStatus",
    emptySelector = "#watchHistoryEmpty",
    sentinelSelector = "#watchHistorySentinel",
    loadMoreSelector = "#watchHistoryLoadMore",
    clearButtonSelector = "[data-history-action=\"clear-cache\"]",
    republishButtonSelector = "[data-history-action=\"republish\"]",
    privacyBannerSelector = "#watchHistoryPrivacyBanner",
    privacyMessageSelector = "#watchHistoryPrivacyMessage",
    privacyToggleSelector = "#watchHistoryPrivacyToggle",
    privacyDismissSelector = "#watchHistoryPrivacyDismiss",
    infoSelector = "#watchHistoryInfo",
    errorBannerSelector = "#watchHistoryError",
    scrollContainerSelector = null,
    featureBannerSelector = "#profileHistoryFeatureBanner",
    toastRegionSelector = "#profileHistoryToastRegion",
    sessionWarningSelector = "#profileHistorySessionWarning",
    metadataToggleSelector = "#profileHistoryMetadataToggle",
    metadataThumbSelector = "#profileHistoryMetadataThumb",
    metadataLabelSelector = "#profileHistoryMetadataLabel",
    metadataDescriptionSelector = "#profileHistoryMetadataDescription",
    emptyCopy = WATCH_HISTORY_EMPTY_COPY,
    disabledCopy = WATCH_HISTORY_DISABLED_COPY,
    batchSize = WATCH_HISTORY_BATCH_SIZE,
    remove = (payload) => {
      const app = getAppInstance();
      if (app?.handleWatchHistoryRemoval) {
        return app.handleWatchHistoryRemoval(payload);
      }
      return defaultRemoveHandler(payload);
    },
  } = config;

  const state = {
    initialized: false,
    actor: null,
    items: [],
    fingerprint: "",
    cursor: 0,
    hasMore: false,
    isLoading: false,
    isRendering: false,
    lastError: null,
    observer: null,
    observerAttached: false,
    metadataPreference: "encrypted-only",
    privacyDismissed: false,
    metadataCache: new Map(),
    catalogCaches: {
      activeVideos: null,
      catalogPromise: null,
    },
    metadataStorageEnabled:
      typeof watchHistoryService.shouldStoreMetadata === "function"
        ? watchHistoryService.shouldStoreMetadata() !== false
        : true,
    sessionFallbackActive: false,
    featureEnabled: watchHistoryService.isEnabled?.() === true,
  };

  let elements = {
    view: null,
    grid: null,
    loading: null,
    status: null,
    empty: null,
    sentinel: null,
    loadMore: null,
    clearButton: null,
    republishButton: null,
    privacyBanner: null,
    privacyMessage: null,
    privacyToggle: null,
    privacyDismiss: null,
    info: null,
    errorBanner: null,
    scrollContainer: null,
    featureBanner: null,
    toastRegion: null,
    sessionWarning: null,
    metadataToggle: null,
    metadataThumb: null,
    metadataLabel: null,
    metadataDescription: null,
  };

  let boundGridClickHandler = null;
  let boundLoadMoreHandler = null;
  let boundClearHandler = null;
  let boundRepublishHandler = null;
  let boundPrivacyToggleHandler = null;
  let boundPrivacyDismissHandler = null;
  let boundMetadataToggleHandler = null;

  const subscriptions = new Set();
  const toastTimers = new Set();

  function refreshElements() {
    elements = {
      view: resolveElement(viewSelector),
      grid: resolveElement(gridSelector),
      loading: resolveElement(loadingSelector),
      status: resolveElement(statusSelector),
      empty: resolveElement(emptySelector),
      sentinel: resolveElement(sentinelSelector),
      loadMore: resolveElement(loadMoreSelector),
      clearButton: resolveElement(clearButtonSelector),
      republishButton: resolveElement(republishButtonSelector),
      privacyBanner: resolveElement(privacyBannerSelector),
      privacyMessage: resolveElement(privacyMessageSelector),
      privacyToggle: resolveElement(privacyToggleSelector),
      privacyDismiss: resolveElement(privacyDismissSelector),
      info: resolveElement(infoSelector),
      errorBanner: resolveElement(errorBannerSelector),
      scrollContainer: resolveElement(scrollContainerSelector),
      featureBanner: resolveElement(featureBannerSelector),
      toastRegion: resolveElement(toastRegionSelector),
      sessionWarning: resolveElement(sessionWarningSelector),
      metadataToggle: resolveElement(metadataToggleSelector),
      metadataThumb: resolveElement(metadataThumbSelector),
      metadataLabel: resolveElement(metadataLabelSelector),
      metadataDescription: resolveElement(metadataDescriptionSelector),
    };
  }

  function clearSubscriptions() {
    for (const unsubscribe of subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        if (isDevEnv) {
          console.warn(
            "[historyView] Failed to unsubscribe from watch history event:",
            error,
          );
        }
      }
    }
    subscriptions.clear();
  }

  function clearToasts() {
    for (const timer of toastTimers) {
      clearTimeout(timer);
    }
    toastTimers.clear();
    if (elements.toastRegion instanceof HTMLElement) {
      elements.toastRegion.innerHTML = "";
    }
  }

  function pushToast({ message, variant = "info", duration = 8000 }) {
    if (!(elements.toastRegion instanceof HTMLElement)) {
      return;
    }
    const text = typeof message === "string" ? message.trim() : "";
    if (!text) {
      return;
    }
    const variantClass = {
      info: "border-blue-500/40 bg-blue-500/10 text-blue-100",
      warning: "border-amber-500/40 bg-amber-500/10 text-amber-100",
      error: "border-red-500/40 bg-red-500/10 text-red-100",
    }[variant] || "border-gray-600 bg-gray-800/70 text-gray-100";

    if (elements.toastRegion.childElementCount >= 3) {
      const firstChild = elements.toastRegion.firstElementChild;
      if (firstChild instanceof HTMLElement) {
        firstChild.remove();
      }
    }

    const toast = document.createElement("div");
    toast.className = `rounded-md border px-4 py-2 text-sm ${variantClass}`;
    toast.setAttribute("role", "status");
    toast.textContent = text;
    elements.toastRegion.appendChild(toast);

    const timeout = Number.isFinite(duration) ? Math.max(0, duration) : 8000;
    if (timeout > 0) {
      const timer = setTimeout(() => {
        toast.remove();
        toastTimers.delete(timer);
      }, timeout);
      toastTimers.add(timer);
    }
  }

  function updateFeatureBanner() {
    const enabled = watchHistoryService.isEnabled?.() === true;
    state.featureEnabled = enabled;
    if (!(elements.featureBanner instanceof HTMLElement)) {
      return;
    }
    if (enabled) {
      elements.featureBanner.textContent = "";
      setHidden(elements.featureBanner, true);
      return;
    }
    elements.featureBanner.textContent =
      "Watch history sync is disabled on this server. Local history only.";
    setHidden(elements.featureBanner, false);
  }

  function updateMetadataToggle() {
    if (!(elements.metadataToggle instanceof HTMLElement)) {
      return;
    }
    const enabled = state.metadataStorageEnabled;
    elements.metadataToggle.setAttribute("aria-checked", enabled ? "true" : "false");
    elements.metadataToggle.classList.toggle("bg-blue-600", enabled);
    elements.metadataToggle.classList.toggle("border-blue-500", enabled);
    elements.metadataToggle.classList.toggle("bg-gray-700", !enabled);
    elements.metadataToggle.classList.toggle("border-gray-600", !enabled);
    if (elements.metadataThumb instanceof HTMLElement) {
      elements.metadataThumb.classList.toggle("translate-x-5", enabled);
      elements.metadataThumb.classList.toggle("translate-x-1", !enabled);
    }
  }

  function updateSessionFallbackWarning() {
    if (!(elements.sessionWarning instanceof HTMLElement)) {
      return;
    }
    const nip07Pubkey =
      typeof nostrClient?.pubkey === "string" ? nostrClient.pubkey : "";
    const sessionPubkey =
      typeof nostrClient?.sessionActor?.pubkey === "string"
        ? nostrClient.sessionActor.pubkey
        : "";
    const activeActor = typeof state.actor === "string" ? state.actor : "";
    const fallbackActive = !nip07Pubkey && sessionPubkey && sessionPubkey === activeActor;
    state.sessionFallbackActive = Boolean(fallbackActive);
    setHidden(elements.sessionWarning, !fallbackActive);
  }

  function subscribeToMetadataPreference() {
    if (typeof watchHistoryService.subscribe !== "function") {
      return;
    }
    const unsubscribe = watchHistoryService.subscribe(
      "metadata-preference",
      (payload) => {
        const enabled = payload?.enabled !== false;
        state.metadataStorageEnabled = enabled;
        updateMetadataToggle();
      }
    );
    if (typeof unsubscribe === "function") {
      subscriptions.add(unsubscribe);
    }
  }

  function subscribeToRepublishEvents() {
    if (typeof watchHistoryService.subscribe !== "function") {
      return;
    }
    const unsubscribe = watchHistoryService.subscribe(
      "republish-scheduled",
      (payload) => {
        if (!payload) {
          return;
        }
        if (
          payload.actor &&
          state.actor &&
          payload.actor !== state.actor
        ) {
          return;
        }
        let message = "Republish retry scheduled.";
        const delayMs = Number.isFinite(payload.delayMs)
          ? Math.max(0, Math.floor(payload.delayMs))
          : null;
        if (delayMs != null) {
          const seconds = Math.max(1, Math.round(delayMs / 1000));
          const suffix = seconds === 1 ? "" : "s";
          message = `Republish retry scheduled in about ${seconds} second${suffix}.`;
        }
        pushToast({ message, variant: "warning" });
      }
    );
    if (typeof unsubscribe === "function") {
      subscriptions.add(unsubscribe);
    }
  }

  function setLoadingState(loading) {
    state.isLoading = loading;
    if (elements.loading) {
      setHidden(elements.loading, !loading);
    }
    if (elements.status) {
      setHidden(elements.status, !loading);
    }
  }

  function showErrorBanner(message) {
    if (!(elements.errorBanner instanceof HTMLElement)) {
      return;
    }
    elements.errorBanner.textContent = message;
    setHidden(elements.errorBanner, false);
  }

  function hideErrorBanner() {
    if (!(elements.errorBanner instanceof HTMLElement)) {
      return;
    }
    elements.errorBanner.textContent = "";
    setHidden(elements.errorBanner, true);
  }

  function showEmptyState() {
    if (elements.grid) {
      elements.grid.innerHTML = "";
      setHidden(elements.grid, true);
    }
    if (elements.empty) {
      setTextContent(elements.empty, emptyCopy);
      setHidden(elements.empty, false);
    }
    setHidden(elements.loadMore, true);
    if (elements.sentinel) {
      setHidden(elements.sentinel, true);
    }
  }

  function showFeatureDisabledState() {
    hideErrorBanner();
    if (elements.loading) {
      setHidden(elements.loading, true);
    }
    if (elements.status) {
      setHidden(elements.status, true);
    }
    detachObserver();
    if (elements.grid) {
      elements.grid.innerHTML = "";
      setHidden(elements.grid, true);
    }
    if (elements.empty) {
      setTextContent(elements.empty, disabledCopy || emptyCopy);
      setHidden(elements.empty, false);
    }
    if (elements.loadMore) {
      setHidden(elements.loadMore, true);
    }
    if (elements.sentinel) {
      setHidden(elements.sentinel, true);
    }
  }

  function ensureObserver() {
    if (!elements.sentinel || !WATCH_HISTORY_BATCH_RESOLVE) {
      return;
    }
    if (state.observer) {
      return;
    }
    if (typeof IntersectionObserver !== "function") {
      return;
    }
    state.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void renderer.loadMore();
          }
        }
      },
      {
        root: elements.scrollContainer || null,
        rootMargin: "0px 0px 320px 0px",
        threshold: 0.1,
      }
    );
  }

  function attachObserver() {
    if (!state.observer || !elements.sentinel) {
      return;
    }
    if (!state.hasMore) {
      return;
    }
    if (!state.observerAttached) {
      state.observer.observe(elements.sentinel);
      state.observerAttached = true;
      setHidden(elements.sentinel, false);
    }
  }

  function detachObserver() {
    if (state.observer && state.observerAttached && elements.sentinel) {
      state.observer.unobserve(elements.sentinel);
      state.observerAttached = false;
      setHidden(elements.sentinel, true);
    }
  }

  function updateLoadMoreVisibility() {
    if (WATCH_HISTORY_BATCH_RESOLVE) {
      if (state.hasMore) {
        attachObserver();
      } else {
        detachObserver();
      }
      if (elements.loadMore) {
        setHidden(elements.loadMore, true);
      }
      return;
    }
    detachObserver();
    if (elements.loadMore) {
      setHidden(elements.loadMore, !state.hasMore);
      elements.loadMore.disabled = !state.hasMore;
    }
  }

  function updatePrivacyBanner() {
    if (!(elements.privacyBanner instanceof HTMLElement)) {
      return;
    }
    const preference = state.metadataPreference;
    const dismissed = state.privacyDismissed;
    if (dismissed && preference !== "relay-opt-in") {
      setHidden(elements.privacyBanner, true);
      return;
    }
    let message =
      "Your history stays encrypted. Share metadata with relays to sync thumbnails across devices?";
    let toggleLabel = "Share metadata";
    if (preference === "relay-opt-in") {
      message =
        "You are sharing metadata with relays so your thumbnails and titles stay in sync.";
      toggleLabel = "Keep encrypted only";
    }
    if (elements.privacyMessage) {
      elements.privacyMessage.textContent = message;
    }
    if (elements.privacyToggle) {
      elements.privacyToggle.textContent = toggleLabel;
    }
    setHidden(elements.privacyBanner, false);
  }

  function updateInfoCallout() {
    if (!(elements.info instanceof HTMLElement)) {
      return;
    }
    const message =
      "Thumbnails and titles are hydrated locally from your device caches. Nothing is published unless you opt in.";
    elements.info.textContent = message;
  }

  async function resolveActorKey() {
    if (typeof getActor === "function") {
      try {
        const result = await getActor();
        if (typeof result === "string" && result.trim()) {
          return result.trim();
        }
      } catch (error) {
        console.warn("[historyView] Failed to resolve actor via getActor:", error);
      }
    }
    if (watchHistoryService?.publishView) {
      const pubkey = nostrClient?.pubkey || window?.app?.pubkey || "";
      if (typeof pubkey === "string" && pubkey.trim()) {
        return pubkey.trim();
      }
    }
    return undefined;
  }

  async function hydrateBatch(batch) {
    const hydrated = [];
    const caches = state.catalogCaches;
    if (!caches.activeVideos && typeof nostrClient?.getActiveVideos === "function") {
      caches.activeVideos = nostrClient.getActiveVideos();
    }
    for (const item of batch) {
      if (!item) {
        continue;
      }
      if (state.metadataCache.has(item.pointerKey)) {
        hydrated.push({ ...item, metadata: state.metadataCache.get(item.pointerKey) });
        continue;
      }
      const pointerKeyValue = item.pointerKey;
      let video = null;
      let profile = null;
      if (
        pointerKeyValue &&
        typeof watchHistoryService.getLocalMetadata === "function"
      ) {
        try {
          const stored = watchHistoryService.getLocalMetadata(pointerKeyValue);
          if (stored) {
            video = stored.video || null;
            profile = stored.profile || null;
          }
        } catch (error) {
          if (isDevEnv) {
            console.warn(
              "[historyView] Failed to read stored metadata for pointer:",
              pointerKeyValue,
              error,
            );
          }
        }
      }
      try {
        const resolvedVideo = await resolveVideoFromPointer(item.pointer, caches);
        if (resolvedVideo) {
          video = resolvedVideo;
        }
      } catch (error) {
        if (isDevEnv) {
          console.warn(
            "[historyView] Failed to resolve video for pointer:",
            error,
          );
        }
      }
      if (video?.pubkey) {
        profile = resolveProfileForPubkey(video.pubkey) || profile;
      }
      const metadata = { video: video || null, profile: profile || null };
      state.metadataCache.set(pointerKeyValue, metadata);
      if (pointerKeyValue) {
        if (state.metadataStorageEnabled) {
          try {
            watchHistoryService.setLocalMetadata?.(pointerKeyValue, metadata);
          } catch (error) {
            if (isDevEnv) {
              console.warn(
                "[historyView] Failed to persist metadata for pointer:",
                pointerKeyValue,
                error,
              );
            }
          }
        } else {
          try {
            watchHistoryService.removeLocalMetadata?.(pointerKeyValue);
          } catch (error) {
            if (isDevEnv) {
              console.warn(
                "[historyView] Failed to remove cached metadata for pointer:",
                pointerKeyValue,
                error,
              );
            }
          }
        }
      }
      hydrated.push({ ...item, metadata });
    }
    return hydrated;
  }

  async function renderNextBatch() {
    if (!Array.isArray(state.items) || !state.items.length) {
      showEmptyState();
      return;
    }
    if (!(elements.grid instanceof HTMLElement)) {
      return;
    }
    if (state.cursor >= state.items.length) {
      state.hasMore = false;
      updateLoadMoreVisibility();
      return;
    }
    if (state.isRendering) {
      return;
    }
    state.isRendering = true;
    const start = state.cursor;
    const end = Math.min(state.items.length, start + Math.max(1, batchSize));
    const slice = state.items.slice(start, end);
    let hydrated;
    try {
      hydrated = await hydrateBatch(slice);
    } catch (error) {
      state.isRendering = false;
      if (isDevEnv) {
        console.warn("[historyView] Failed to hydrate batch:", error);
      }
      return;
    }

    const fragment = document.createDocumentFragment();
    const dayContainers = new Map();

    const ensureDayContainer = (dayKey, label) => {
      if (dayContainers.has(dayKey)) {
        return dayContainers.get(dayKey);
      }
      let section = elements.grid.querySelector(
        `[data-history-day="${escapeSelector(dayKey)}"]`
      );
      if (!(section instanceof HTMLElement)) {
        section = document.createElement("section");
        section.dataset.historyDay = dayKey;
        section.className = "space-y-4";
        const header = document.createElement("h3");
        header.className = "text-sm font-semibold uppercase tracking-wide text-gray-300";
        header.textContent = label;
        const list = document.createElement("div");
        list.dataset.historyDayList = "true";
        list.className = "space-y-4";
        section.appendChild(header);
        section.appendChild(list);
        fragment.appendChild(section);
      }
      const list = section.querySelector("[data-history-day-list]");
      const record = { section, list };
      dayContainers.set(dayKey, record);
      return record;
    };

    hydrated.forEach((entry) => {
      if (!entry) {
        return;
      }
      const dayLabel = formatDayLabel(entry.watchedAt);
      const dayKey = `${dayLabel}`;
      const container = ensureDayContainer(dayKey, dayLabel);
      if (!(container?.list instanceof HTMLElement)) {
        return;
      }
      const card = buildHistoryCard({
        item: entry,
        video: entry.metadata?.video || null,
        profile: entry.metadata?.profile || null,
        metadataPreference: state.metadataPreference,
      });
      container.list.appendChild(card);
    });

    elements.grid.appendChild(fragment);
    setHidden(elements.grid, false);
    setHidden(elements.empty, true);

    state.cursor = end;
    state.hasMore = state.cursor < state.items.length;
    updateLoadMoreVisibility();
    state.isRendering = false;
  }

  function bindGridEvents() {
    if (!(elements.grid instanceof HTMLElement)) {
      return;
    }
    if (boundGridClickHandler) {
      elements.grid.removeEventListener("click", boundGridClickHandler);
    }
    boundGridClickHandler = async (event) => {
      const trigger = event.target instanceof HTMLElement
        ? event.target.closest("[data-history-action]")
        : null;
      if (!(trigger instanceof HTMLElement)) {
        return;
      }
      const action = trigger.dataset.historyAction || "";
      const pointerKeyAttr = trigger.dataset.pointerKey || (trigger.closest("[data-pointer-key]")?.dataset.pointerKey ?? "");
      if (!action) {
        return;
      }
      switch (action) {
        case "play": {
          event.preventDefault();
          const videoId = trigger.dataset.videoId || pointerKeyAttr;
          const app = getAppInstance();
          if (videoId && app?.playVideoByEventId) {
            app.playVideoByEventId(videoId);
            return;
          }
          const urlAttr = trigger.dataset.playUrl || "";
          const magnetAttr = trigger.dataset.playMagnet || "";
          if (app?.playVideoWithFallback) {
            app.playVideoWithFallback({
              url: urlAttr ? decodeURIComponent(urlAttr) : "",
              magnet: magnetAttr,
            });
          }
          break;
        }
        case "channel": {
          event.preventDefault();
          const author = trigger.dataset.author || "";
          const app = getAppInstance();
          if (author && app?.goToProfile) {
            app.goToProfile(author);
          } else if (app?.showError) {
            app.showError("No creator info available.");
          }
          break;
        }
        case "remove": {
          event.preventDefault();
          if (pointerKeyAttr) {
            await renderer.handleRemove(pointerKeyAttr);
          }
          break;
        }
        default:
          break;
      }
    };
    elements.grid.addEventListener("click", boundGridClickHandler);
  }

  function bindLoadMore() {
    if (!(elements.loadMore instanceof HTMLElement)) {
      return;
    }
    if (boundLoadMoreHandler) {
      elements.loadMore.removeEventListener("click", boundLoadMoreHandler);
    }
    boundLoadMoreHandler = (event) => {
      event.preventDefault();
      void renderer.loadMore();
    };
    elements.loadMore.addEventListener("click", boundLoadMoreHandler);
  }

  function bindActions() {
    if (elements.clearButton) {
      if (boundClearHandler) {
        elements.clearButton.removeEventListener("click", boundClearHandler);
      }
      boundClearHandler = async (event) => {
        event.preventDefault();
        const actor = await resolveActorKey();
        try {
          await watchHistoryService.resetProgress(actor);
          state.items = [];
          state.cursor = 0;
          state.hasMore = false;
          state.metadataCache.clear();
          try {
            watchHistoryService.clearLocalMetadata?.();
          } catch (error) {
            if (isDevEnv) {
              console.warn(
                "[historyView] Failed to clear stored metadata while resetting progress:",
                error,
              );
            }
          }
          showEmptyState();
          const app = getAppInstance();
          app?.showSuccess?.("Local watch history cache cleared.");
        } catch (error) {
          const message =
            error && typeof error.message === "string"
              ? error.message
              : "Failed to clear local watch history cache.";
          const app = getAppInstance();
          app?.showError?.(message);
        }
      };
      elements.clearButton.addEventListener("click", boundClearHandler);
    }

    if (elements.republishButton) {
      if (boundRepublishHandler) {
        elements.republishButton.removeEventListener("click", boundRepublishHandler);
      }
      boundRepublishHandler = async (event) => {
        event.preventDefault();
        const actor = await resolveActorKey();
        try {
          const payload = state.items.map((entry) => ({
            ...entry.pointer,
            watchedAt: entry.watchedAt,
          }));
          await snapshot(payload, { actor, reason: "manual-republish" });
          const app = getAppInstance();
          app?.showSuccess?.("Watch history snapshot queued for publish.");
        } catch (error) {
          const app = getAppInstance();
          app?.showError?.("Failed to publish watch history. Try again later.");
          if (isDevEnv) {
            console.warn("[historyView] Republish failed:", error);
          }
        }
      };
      elements.republishButton.addEventListener("click", boundRepublishHandler);
    }
  }

  function bindPrivacyControls() {
    if (elements.privacyToggle) {
      if (boundPrivacyToggleHandler) {
        elements.privacyToggle.removeEventListener(
          "click",
          boundPrivacyToggleHandler
        );
      }
      boundPrivacyToggleHandler = (event) => {
        event.preventDefault();
        if (state.metadataPreference === "relay-opt-in") {
          state.metadataPreference = "encrypted-only";
        } else {
          state.metadataPreference = "relay-opt-in";
          state.privacyDismissed = false;
        }
        writePreference(
          WATCH_HISTORY_METADATA_PREF_KEY,
          state.metadataPreference
        );
        updatePrivacyBanner();
        renderer.render();
      };
      elements.privacyToggle.addEventListener("click", boundPrivacyToggleHandler);
    }

    if (elements.privacyDismiss) {
      if (boundPrivacyDismissHandler) {
        elements.privacyDismiss.removeEventListener(
          "click",
          boundPrivacyDismissHandler
        );
      }
      boundPrivacyDismissHandler = (event) => {
        event.preventDefault();
        state.privacyDismissed = true;
        writePreference(WATCH_HISTORY_PRIVACY_DISMISSED_KEY, "true");
        updatePrivacyBanner();
      };
      elements.privacyDismiss.addEventListener("click", boundPrivacyDismissHandler);
    }
  }

  function bindMetadataToggle() {
    if (!(elements.metadataToggle instanceof HTMLElement)) {
      return;
    }
    if (boundMetadataToggleHandler) {
      elements.metadataToggle.removeEventListener(
        "click",
        boundMetadataToggleHandler
      );
    }
    boundMetadataToggleHandler = (event) => {
      event.preventDefault();
      const nextValue = !state.metadataStorageEnabled;
      try {
        if (typeof watchHistoryService.setMetadataPreference === "function") {
          watchHistoryService.setMetadataPreference(nextValue);
        }
      } catch (error) {
        if (isDevEnv) {
          console.warn("[historyView] Failed to set metadata preference:", error);
        }
      }
      state.metadataStorageEnabled =
        typeof watchHistoryService.shouldStoreMetadata === "function"
          ? watchHistoryService.shouldStoreMetadata() !== false
          : nextValue;
      updateMetadataToggle();
      if (!state.metadataStorageEnabled) {
        try {
          watchHistoryService.clearLocalMetadata?.();
        } catch (error) {
          if (isDevEnv) {
            console.warn(
              "[historyView] Failed to clear stored metadata after disabling preference:",
              error,
            );
          }
        }
        state.metadataCache.clear();
        void renderer.render();
      }
    };
    elements.metadataToggle.addEventListener("click", boundMetadataToggleHandler);
  }

  async function loadHistory({ force = false, actorOverride } = {}) {
    if (state.isLoading) {
      return false;
    }
    if (!state.featureEnabled) {
      state.actor = null;
      updateSessionFallbackWarning();
      state.items = [];
      state.fingerprint = "";
      state.cursor = 0;
      state.hasMore = false;
      state.lastError = null;
      showFeatureDisabledState();
      return false;
    }
    setLoadingState(true);
    const actor =
      typeof actorOverride === "string" && actorOverride.trim()
        ? actorOverride.trim()
        : await resolveActorKey();
    state.actor = actor;
    updateSessionFallbackWarning();
    let items = [];
    try {
      items = await fetchHistory(actor);
      state.lastError = null;
      hideErrorBanner();
    } catch (error) {
      state.lastError = error;
      const message =
        error && typeof error.message === "string"
          ? error.message
          : "Failed to load watch history from relays.";
      showErrorBanner(message);
      items = [];
    }
    setLoadingState(false);
    const normalized = normalizeHistoryItems(items);
    const fingerprint = computeFingerprint(normalized);
    if (!force && fingerprint && fingerprint === state.fingerprint) {
      return false;
    }
    state.items = normalized;
    state.fingerprint = fingerprint;
    state.cursor = 0;
    state.hasMore = state.items.length > 0;
    state.metadataCache.clear();
    state.catalogCaches.catalogPromise = null;
    state.catalogCaches.activeVideos = null;
    return true;
  }

  async function renderInitial() {
    if (!(elements.grid instanceof HTMLElement)) {
      return;
    }
    state.cursor = 0;
    state.hasMore = state.items.length > 0;
    elements.grid.innerHTML = "";
    removeEmptyDayContainers(elements.grid);
    if (!state.items.length) {
      showEmptyState();
      return;
    }
    setHidden(elements.empty, true);
    setHidden(elements.grid, false);
    await renderNextBatch();
  }

  const renderer = {
    async init(options = {}) {
      if (typeof document === "undefined") {
        return;
      }
      clearSubscriptions();
      clearToasts();
      refreshElements();
      updateFeatureBanner();
      ensureObserver();
      bindGridEvents();
      bindLoadMore();
      bindActions();
      bindPrivacyControls();
      bindMetadataToggle();
      subscribeToMetadataPreference();
      subscribeToRepublishEvents();
      updateInfoCallout();
      state.metadataStorageEnabled =
        typeof watchHistoryService.shouldStoreMetadata === "function"
          ? watchHistoryService.shouldStoreMetadata() !== false
          : true;
      updateMetadataToggle();
      const storedPreference = readPreference(
        WATCH_HISTORY_METADATA_PREF_KEY,
        "encrypted-only"
      );
      state.metadataPreference =
        storedPreference === "relay-opt-in" ? "relay-opt-in" : "encrypted-only";
      state.privacyDismissed = readPreference(
        WATCH_HISTORY_PRIVACY_DISMISSED_KEY,
        "false"
      ) === "true";
      updatePrivacyBanner();
      state.initialized = true;
      if (!state.featureEnabled) {
        state.items = [];
        state.fingerprint = "";
        state.cursor = 0;
        state.hasMore = false;
        state.lastError = null;
        showFeatureDisabledState();
        return;
      }
      await this.refresh({ ...options, force: true });
    },
    async ensureInitialLoad(options = {}) {
      if (!state.initialized) {
        await this.init(options);
        return;
      }
      refreshElements();
      updateFeatureBanner();
      if (!state.featureEnabled) {
        state.items = [];
        state.fingerprint = "";
        state.cursor = 0;
        state.hasMore = false;
        state.lastError = null;
        showFeatureDisabledState();
        return;
      }
      bindMetadataToggle();
      state.metadataStorageEnabled =
        typeof watchHistoryService.shouldStoreMetadata === "function"
          ? watchHistoryService.shouldStoreMetadata() !== false
          : true;
      updateMetadataToggle();
    },
    async refresh(options = {}) {
      updateFeatureBanner();
      if (!state.featureEnabled) {
        state.items = [];
        state.fingerprint = "";
        state.cursor = 0;
        state.hasMore = false;
        state.lastError = null;
        showFeatureDisabledState();
        return;
      }
      const { actor, force = true } = options;
      const changed = await loadHistory({
        force,
        actorOverride: actor,
      });
      if (!changed && state.items.length) {
        updateLoadMoreVisibility();
        return;
      }
      await renderInitial();
    },
    async loadMore() {
      if (!state.featureEnabled) {
        return [];
      }
      if (!state.items.length) {
        return [];
      }
      await renderNextBatch();
      return state.items.slice(0, state.cursor);
    },
    resume() {
      updateLoadMoreVisibility();
    },
    pause() {
      detachObserver();
    },
    destroy() {
      detachObserver();
      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }
      if (elements.grid && boundGridClickHandler) {
        elements.grid.removeEventListener("click", boundGridClickHandler);
        boundGridClickHandler = null;
      }
      if (elements.loadMore && boundLoadMoreHandler) {
        elements.loadMore.removeEventListener("click", boundLoadMoreHandler);
        boundLoadMoreHandler = null;
      }
      if (elements.clearButton && boundClearHandler) {
        elements.clearButton.removeEventListener("click", boundClearHandler);
        boundClearHandler = null;
      }
      if (elements.republishButton && boundRepublishHandler) {
        elements.republishButton.removeEventListener("click", boundRepublishHandler);
        boundRepublishHandler = null;
      }
      if (elements.privacyToggle && boundPrivacyToggleHandler) {
        elements.privacyToggle.removeEventListener(
          "click",
          boundPrivacyToggleHandler
        );
        boundPrivacyToggleHandler = null;
      }
      if (elements.privacyDismiss && boundPrivacyDismissHandler) {
        elements.privacyDismiss.removeEventListener(
          "click",
          boundPrivacyDismissHandler
        );
        boundPrivacyDismissHandler = null;
      }
      if (elements.metadataToggle && boundMetadataToggleHandler) {
        elements.metadataToggle.removeEventListener(
          "click",
          boundMetadataToggleHandler
        );
        boundMetadataToggleHandler = null;
      }
      clearSubscriptions();
      clearToasts();
      if (elements.grid) {
        elements.grid.innerHTML = "";
      }
      state.initialized = false;
      state.items = [];
      state.cursor = 0;
      state.hasMore = false;
      state.metadataCache.clear();
    },
    async handleRemove(pointerKeyValue) {
      if (!pointerKeyValue) {
        return;
      }
      const index = state.items.findIndex(
        (entry) => entry.pointerKey === pointerKeyValue
      );
      if (index === -1) {
        return;
      }
      const [removed] = state.items.splice(index, 1);
      state.fingerprint = computeFingerprint(state.items);
      state.cursor = Math.min(state.cursor, state.items.length);
      state.hasMore = state.cursor < state.items.length;
      const card = elements.grid?.querySelector(
        `[data-pointer-key="${escapeSelector(pointerKeyValue)}"]`
      );
      const parentDay = card?.closest("[data-history-day]");
      if (card) {
        card.remove();
      }
      state.metadataCache.delete(pointerKeyValue);
      try {
        watchHistoryService.removeLocalMetadata?.(pointerKeyValue);
      } catch (error) {
        if (isDevEnv) {
          console.warn(
            "[historyView] Failed to drop cached metadata for pointer:",
            pointerKeyValue,
            error,
          );
        }
      }
      removeEmptyDayContainers(elements.grid);
      if (!state.items.length) {
        showEmptyState();
      } else {
        updateLoadMoreVisibility();
      }
      const remainingItems = state.items.slice();
      const actor = await resolveActorKey();
      try {
        const handler =
          typeof remove === "function"
            ? remove
            : (payload) => defaultRemoveHandler(payload);
        const result = await handler({
          actor,
          items: remainingItems,
          removed,
          pointerKey: pointerKeyValue,
          snapshot,
          reason: "remove-item",
        });
        const app = getAppInstance();
        if (!result?.handledToasts) {
          app?.showSuccess?.("Removed from watch history.");
        }
      } catch (error) {
        const app = getAppInstance();
        if (!error?.handled) {
          app?.showError?.("Failed to remove from history. Reloading list.");
        }
        if (isDevEnv) {
          console.warn("[historyView] Removal failed:", error);
        }
        await this.refresh();
      } finally {
        if (parentDay instanceof HTMLElement) {
          removeEmptyDayContainers(elements.grid);
        }
      }
    },
    async render() {
      await renderInitial();
    },
    getState() {
      return {
        ...state,
        items: state.items.slice(),
      };
    },
  };

  return renderer;
}

export const watchHistoryRenderer = createWatchHistoryRenderer();

export async function initHistoryView() {
  await watchHistoryRenderer.init();
}

if (typeof window !== "undefined") {
  window.bitvid = window.bitvid || {};
  window.bitvid.initHistoryView = initHistoryView;
  window.bitvid.watchHistoryRenderer = watchHistoryRenderer;
}
