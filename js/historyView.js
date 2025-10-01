// js/historyView.js

import { nostrClient } from "./nostr.js";
import { WATCH_HISTORY_BATCH_RESOLVE } from "./config.js";
import { subscriptions } from "./subscriptions.js";
import { accessControl } from "./accessControl.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";

const DEFAULT_BATCH_SIZE = 20;
const BATCH_SIZE = WATCH_HISTORY_BATCH_RESOLVE ? DEFAULT_BATCH_SIZE : 1;

export const WATCH_HISTORY_EMPTY_COPY =
  "Your watch history is empty. Watch some videos to populate this list.";

const WATCH_HISTORY_LOADING_STATUS = "Fetching watch history from relays…";
const WATCH_HISTORY_EMPTY_STATUS = "No watch history yet.";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getVideoAuthorIdentifiers(video) {
  if (!video || typeof video !== "object") {
    return { pubkey: "", npub: "" };
  }

  const extractString = (candidate) =>
    typeof candidate === "string" && candidate.trim() ? candidate.trim() : "";

  const candidateNpubs = [
    extractString(video.npub),
    extractString(video.authorNpub),
    extractString(video?.author?.npub),
    extractString(video?.watchHistory?.npub),
    extractString(video?.watchHistory?.npubEncoded),
    extractString(video?.watchHistory?.authorNpub),
    extractString(video?.watchHistory?.ownerNpub),
  ];

  let pubkey = extractString(video.pubkey);
  if (!pubkey && video?.author && typeof video.author === "object") {
    pubkey = extractString(video.author.pubkey);
  }

  let npub = candidateNpubs.find((value) => value) || "";

  if (!npub) {
    if (pubkey && pubkey.startsWith("npub")) {
      npub = pubkey;
    } else if (pubkey && window?.NostrTools?.nip19?.npubEncode) {
      try {
        npub = window.NostrTools.nip19.npubEncode(pubkey);
      } catch (error) {
        npub = "";
      }
    }
  }

  if (!pubkey && npub && window?.NostrTools?.nip19?.decode) {
    try {
      const decoded = window.NostrTools.nip19.decode(npub);
      if (decoded?.type === "npub") {
        if (typeof decoded?.data === "string" && decoded.data) {
          pubkey = decoded.data;
        } else if (
          decoded?.data &&
          typeof decoded.data === "object" &&
          typeof decoded.data.hex === "string"
        ) {
          pubkey = decoded.data.hex;
        }
      }
    } catch (error) {
      pubkey = "";
    }
  }

  return { pubkey, npub };
}

function isVideoBlocked(video) {
  const { pubkey, npub } = getVideoAuthorIdentifiers(video);

  if (pubkey && typeof window?.app?.isAuthorBlocked === "function") {
    try {
      if (window.app.isAuthorBlocked(pubkey)) {
        return true;
      }
    } catch (error) {
      console.warn("[historyView] Failed to check personal block list:", error);
    }
  }

  if (npub && typeof accessControl?.isBlacklisted === "function") {
    try {
      if (accessControl.isBlacklisted(npub)) {
        return true;
      }
    } catch (error) {
      console.warn("[historyView] Failed to check access blacklist:", error);
    }
  }

  return false;
}

function filterAccessibleVideos(videos) {
  if (!Array.isArray(videos)) {
    return [];
  }

  return videos.filter((video) => {
    if (!video || typeof video !== "object") {
      return false;
    }

    return !isVideoBlocked(video);
  });
}

function getWatchedAtScore(video) {
  if (!video || typeof video !== "object") {
    return Number.NEGATIVE_INFINITY;
  }

  const watchedAt = toNumber(video?.watchHistory?.watchedAt, Number.NaN);
  if (Number.isFinite(watchedAt)) {
    return watchedAt;
  }

  const createdAtSeconds = toNumber(video?.created_at, Number.NaN);
  if (Number.isFinite(createdAtSeconds)) {
    return createdAtSeconds * 1000;
  }

  return Number.NEGATIVE_INFINITY;
}

function getAbsoluteShareUrl(nevent) {
  if (!nevent) {
    return "";
  }

  if (window.app?.buildShareUrlFromNevent) {
    const candidate = window.app.buildShareUrlFromNevent(nevent);
    if (candidate) {
      return candidate;
    }
  }

  const origin = window.location?.origin || "";
  const pathname = window.location?.pathname || "";
  let base = origin || pathname ? `${origin}${pathname}` : "";
  if (!base) {
    const href = window.location?.href || "";
    base = href ? href.split(/[?#]/)[0] : "";
  }

  if (!base) {
    return `?v=${encodeURIComponent(nevent)}`;
  }

  return `${base}?v=${encodeURIComponent(nevent)}`;
}

function renderWatchHistoryGrid(videos, containerOrElement) {
  let container = null;
  if (typeof containerOrElement === "string") {
    container = document.getElementById(containerOrElement);
  } else if (containerOrElement instanceof Element) {
    container = containerOrElement;
  }

  if (!container) {
    return;
  }

  const safeVideos = Array.isArray(videos) ? videos : [];
  const dedupedVideos =
    window.app?.dedupeVideosByRoot?.(safeVideos) ??
    subscriptions.dedupeToNewestByRoot(safeVideos);

  const filteredVideos = filterAccessibleVideos(dedupedVideos);

  if (!filteredVideos.length) {
    container.innerHTML = `
      <p class="flex justify-center items-center h-full w-full text-center text-gray-500">
        No videos available yet.
      </p>`;
    return;
  }

  const fullAllEventsArray = Array.from(nostrClient.allEvents.values());
  const fragment = document.createDocumentFragment();
  const localAuthorSet = new Set();

  filteredVideos.forEach((video, index) => {
    if (!video.id || !video.title) {
      console.error("Missing ID or title:", video);
      return;
    }

    window.app?.videosMap?.set(video.id, video);

    localAuthorSet.add(video.pubkey);

    const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
    const shareUrl = getAbsoluteShareUrl(nevent);
    const canEdit = window.app?.pubkey === video.pubkey;

    const highlightClass =
      video.isPrivate && canEdit ? "watch-history-card--private" : "";

    const timeAgo = window.app?.formatTimeAgo
      ? window.app.formatTimeAgo(video.created_at)
      : new Date(video.created_at * 1000).toLocaleString();

    const watchedAtTimestamp = toNumber(
      video?.watchHistory?.watchedAt,
      null
    );
    let watchedAtLabel = "Watch date unavailable";
    if (Number.isFinite(watchedAtTimestamp) && watchedAtTimestamp > 0) {
      const watchedDate = new Date(watchedAtTimestamp);
      if (!Number.isNaN(watchedDate.getTime())) {
        try {
          watchedAtLabel = `Watched on ${watchedDate.toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}`;
        } catch (err) {
          watchedAtLabel = `Watched on ${watchedDate.toLocaleString()}`;
        }
      }
    }

    const safeTitle = window.app?.escapeHTML(video.title) || "Untitled";
    const safeThumb = window.app?.escapeHTML(video.thumbnail) || "";
    const playbackUrl = typeof video.url === "string" ? video.url : "";
    const trimmedUrl = playbackUrl ? playbackUrl.trim() : "";
    const trimmedMagnet =
      typeof video.magnet === "string" ? video.magnet.trim() : "";
    const legacyInfoHash =
      typeof video.infoHash === "string" ? video.infoHash.trim() : "";
    const magnetCandidate = trimmedMagnet || legacyInfoHash;
    const playbackMagnet = magnetCandidate;
    const magnetProvided = magnetCandidate.length > 0;
    const watchHistoryKey = video?.watchHistory?.key || "";
    const cardHtml = `
      <article
        class="watch-history-card ${highlightClass}"
        data-watch-history-key="${watchHistoryKey}"
      >
        <div class="watch-history-card__primary">
          <a
            href="${shareUrl}"
            data-video-id="${video.id}"
            data-play-url=""
            data-play-magnet=""
            class="watch-history-card__thumbnail"
          >
            <div class="watch-history-card__thumbnailInner ratio-16-9">
              <img
                src="assets/jpg/video-thumbnail-fallback.jpg"
                data-lazy="${safeThumb}"
                alt="${safeTitle}"
              />
            </div>
          </a>
          <div class="watch-history-card__details">
            <h3
              class="watch-history-card__title"
              data-video-id="${video.id}"
              data-play-url=""
              data-play-magnet=""
            >
              ${safeTitle}
            </h3>
            <p class="watch-history-card__created">${timeAgo}</p>
          </div>
        </div>
        <div class="watch-history-card__meta">
          <p class="watch-history-card__watched" data-watched-at="${
            watchedAtTimestamp || ""
          }">${watchedAtLabel}</p>
          <div class="watch-history-card__creator">
            <button
              type="button"
              class="watch-history-card__creatorAvatar"
              data-pubkey="${video.pubkey}"
              aria-label="View creator profile"
            >
              <img
                class="author-pic"
                data-pubkey="${video.pubkey}"
                src="assets/svg/default-profile.svg"
                alt="Creator avatar"
              />
            </button>
            <button
              type="button"
              class="watch-history-card__creatorName author-name"
              data-pubkey="${video.pubkey}"
            >
              Loading name...
            </button>
          </div>
          <div class="watch-history-card__actions">
            <a
              href="${shareUrl}"
              data-video-id="${video.id}"
              data-play-url=""
              data-play-magnet=""
              class="watch-history-card__action watch-history-card__action--primary"
            >
              View
            </a>
            <button
              type="button"
              class="watch-history-card__action"
              data-history-share="true"
              data-share-url="${shareUrl}"
              data-share-title="${safeTitle}"
              data-event-id="${video.id}"
            >
              Share
            </button>
            <button
              type="button"
              class="watch-history-card__action watch-history-card__action--danger"
              data-history-remove-key="${watchHistoryKey}"
              data-history-remove-event-id="${video.id}"
            >
              Remove
            </button>
          </div>
        </div>
      </article>
    `;

    const t = document.createElement("template");
    t.innerHTML = cardHtml.trim();
    const cardEl = t.content.firstElementChild;
    if (cardEl) {
      cardEl.dataset.ownerIsViewer = canEdit ? "true" : "false";
      if (typeof video.pubkey === "string" && video.pubkey) {
        cardEl.dataset.ownerPubkey = video.pubkey;
      } else if (cardEl.dataset.ownerPubkey) {
        delete cardEl.dataset.ownerPubkey;
      }

      const interactiveEls = cardEl.querySelectorAll("[data-video-id]");
      interactiveEls.forEach((el) => {
        if (!el.dataset) return;

        if (trimmedUrl) {
          el.dataset.playUrl = encodeURIComponent(trimmedUrl);
        } else {
          delete el.dataset.playUrl;
        }

        el.dataset.playMagnet = playbackMagnet || "";
      });

      if (magnetProvided) {
        cardEl.dataset.magnet = playbackMagnet;
      } else if (cardEl.dataset.magnet) {
        delete cardEl.dataset.magnet;
      }

    }
    fragment.appendChild(cardEl);
  });

  container.innerHTML = "";
  container.appendChild(fragment);

  window.app?.attachVideoListHandler?.();

  const lazyEls = container.querySelectorAll("[data-lazy]");
  lazyEls.forEach((el) => window.app?.mediaLoader.observe(el));

  const authorPics = container.querySelectorAll(".author-pic");
  const authorNames = container.querySelectorAll(".author-name");
  const creatorButtons = container.querySelectorAll(
    ".watch-history-card__creatorAvatar"
  );

  authorPics.forEach((pic) => {
    localAuthorSet.add(pic.getAttribute("data-pubkey"));
  });
  authorNames.forEach((nameEl) => {
    localAuthorSet.add(nameEl.getAttribute("data-pubkey"));
  });
  creatorButtons.forEach((btn) => {
    localAuthorSet.add(btn.getAttribute("data-pubkey"));
  });

  if (window.app?.batchFetchProfiles && localAuthorSet.size > 0) {
    window.app.batchFetchProfiles(localAuthorSet);
  }

  authorPics.forEach((pic) => {
    if (!pic.dataset.watchHistoryClickAttached) {
      pic.dataset.watchHistoryClickAttached = "true";
      pic.style.cursor = "pointer";
      pic.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pubkey = pic.getAttribute("data-pubkey");
        window.app?.goToProfile(pubkey);
      });
    }
  });

  creatorButtons.forEach((btn) => {
    if (!btn.dataset.watchHistoryClickAttached) {
      btn.dataset.watchHistoryClickAttached = "true";
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pubkey = btn.getAttribute("data-pubkey");
        window.app?.goToProfile(pubkey);
      });
    }
  });

  authorNames.forEach((nameEl) => {
    if (!nameEl.dataset.watchHistoryClickAttached) {
      nameEl.dataset.watchHistoryClickAttached = "true";
      nameEl.style.cursor = "pointer";
      nameEl.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pubkey = nameEl.getAttribute("data-pubkey");
        window.app?.goToProfile(pubkey);
      });
    }
  });
}

export function createWatchHistoryRenderer(config = {}) {
  const fallbackGetActor = async () => {
    const candidate =
      typeof window?.app?.pubkey === "string" && window.app.pubkey.trim()
        ? window.app.pubkey.trim()
        : "";
    return candidate || undefined;
  };

  const mergedConfig = {
    viewSelector: "#watchHistoryView",
    gridSelector: "#watchHistoryGrid",
    loadingSelector: "#watchHistoryLoading",
    statusSelector: "#watchHistoryStatus",
    emptySelector: "#watchHistoryEmpty",
    sentinelSelector: "#watchHistorySentinel",
    scrollContainerSelector: null,
    emptyCopy: WATCH_HISTORY_EMPTY_COPY,
    batchSize: BATCH_SIZE,
    getActor: fallbackGetActor,
    beforeInitialLoad: null,
    getSnapshotFingerprint: null,
    resolveBatch: (size) => nostrClient.resolveWatchHistory(size),
    renderGrid: null,
    ...config,
  };

  const {
    viewSelector,
    gridSelector,
    loadingSelector,
    statusSelector,
    emptySelector,
    sentinelSelector,
    scrollContainerSelector,
    emptyCopy,
    batchSize,
    getActor,
    resolveBatch,
    renderGrid,
  } = mergedConfig;

  const providedBeforeInitialLoad = mergedConfig.beforeInitialLoad;
  const providedGetSnapshotFingerprint = mergedConfig.getSnapshotFingerprint;

  let authChangeListener = null;
  let authRefreshPromise = null;
  let scheduleAuthRefresh = null;

  const normalizeActorHint = (actorHint) => {
    if (typeof actorHint === "string") {
      const trimmed = actorHint.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    return null;
  };

  const attachAuthChangeListener = () => {
    if (authChangeListener || typeof window === "undefined") {
      return;
    }

    authChangeListener = (event) => {
      const detail = event?.detail || {};
      const actorHint =
        typeof detail.pubkey === "string" ? detail.pubkey : null;
      try {
        scheduleAuthRefresh?.(actorHint ?? null);
      } catch (error) {
        console.warn("[historyView] Failed to schedule auth refresh:", error);
      }
    };

    window.addEventListener("bitvid:auth-changed", authChangeListener);
  };

  const detachAuthChangeListener = () => {
    if (!authChangeListener || typeof window === "undefined") {
      return;
    }

    window.removeEventListener("bitvid:auth-changed", authChangeListener);
    authChangeListener = null;
  };

  const selectors = {
    view: viewSelector,
    grid: gridSelector,
    loading: loadingSelector,
    status: statusSelector,
    empty: emptySelector,
    sentinel: sentinelSelector,
    scrollContainer: scrollContainerSelector,
  };

  const LOG_PREFIX = "[historyView]";

  const debugLog = (...args) => {
    if (typeof console !== "undefined") {
      if (typeof console.debug === "function") {
        console.debug(LOG_PREFIX, ...args);
        return;
      }
      if (typeof console.log === "function") {
        console.log(LOG_PREFIX, ...args);
      }
    }
  };

  const resolveActor = async (hint = null) => {
    if (typeof hint === "string" && hint.trim()) {
      return hint.trim();
    }

    if (typeof getActor === "function") {
      try {
        const candidate = await getActor();
        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      } catch (error) {
        debugLog("failed to resolve actor via getActor", error);
      }
    }

    return null;
  };

  const callBeforeInitialLoad = async (context = {}) => {
    let actor = await resolveActor(context.actor ?? null);
    const finalContext = { ...context, actor };

    if (typeof providedBeforeInitialLoad === "function") {
      return providedBeforeInitialLoad(finalContext);
    }

    const snapshot = await nostrClient.fetchWatchHistory(actor || undefined);

    if (!actor) {
      try {
        const ensured = await nostrClient.ensureSessionActor();
        if (typeof ensured === "string" && ensured.trim()) {
          actor = ensured.trim();
        }
      } catch (error) {
        debugLog("failed to ensure session actor while resolving history", error);
      }
    }

    return { actor: actor || null, snapshot };
  };

  const computeSnapshotFingerprint = async (context = {}) => {
    const actor = await resolveActor(context.actor ?? null);
    const finalContext = { ...context, actor };

    if (typeof providedGetSnapshotFingerprint === "function") {
      return providedGetSnapshotFingerprint(finalContext);
    }

    if (finalContext.refresh) {
      await nostrClient.fetchWatchHistory(actor || undefined);
    }

    return nostrClient.getWatchHistoryFingerprint(actor || undefined);
  };

  const state = {
    isLoading: false,
    hasMore: true,
    observer: null,
    scrollListener: null,
    resolvedVideos: [],
    initialized: false,
    emptyCopy,
    batchSize: Math.max(1, toNumber(batchSize, BATCH_SIZE)),
    actor: null,
    snapshotFingerprint: null,
    gridEventHandler: null,
  };

  const applyAccessFilters = () => {
    if (!Array.isArray(state.resolvedVideos)) {
      state.resolvedVideos = [];
      return state.resolvedVideos;
    }

    const beforeLength = state.resolvedVideos.length;
    const filtered = filterAccessibleVideos(state.resolvedVideos);

    if (filtered.length !== beforeLength) {
      debugLog("filtered resolved videos due to block settings", {
        before: beforeLength,
        after: filtered.length,
      });
    }

    state.resolvedVideos = filtered;
    return state.resolvedVideos;
  };

  const query = (selector) => {
    if (!selector) {
      return null;
    }
    try {
      return document.querySelector(selector);
    } catch (error) {
      console.warn("[historyView] Failed to query selector:", selector, error);
      return null;
    }
  };

  const getElements = () => ({
    view: query(selectors.view),
    grid: query(selectors.grid),
    loadingEl: query(selectors.loading),
    statusEl: query(selectors.status),
    emptyEl: query(selectors.empty),
    sentinel: query(selectors.sentinel),
    scrollContainer: query(selectors.scrollContainer),
  });

  const setStatusMessage = (message = "") => {
    const { statusEl } = getElements();
    if (!statusEl) {
      return;
    }

    const nextMessage = typeof message === "string" ? message.trim() : "";
    if (nextMessage) {
      const showSpinner = nextMessage === WATCH_HISTORY_LOADING_STATUS;
      statusEl.innerHTML = getSidebarLoadingMarkup(nextMessage, {
        showSpinner,
      });
      statusEl.classList.remove("hidden");
    } else {
      statusEl.textContent = "";
      statusEl.innerHTML = "";
      statusEl.classList.add("hidden");
    }
  };

  const clearStatusMessage = () => {
    setStatusMessage("");
  };

  const setLoadingVisible = (visible, { statusMessage } = {}) => {
    const { loadingEl } = getElements();
    if (loadingEl) {
      if (visible) {
        loadingEl.classList.remove("hidden");
      } else {
        loadingEl.classList.add("hidden");
      }
    }

    if (visible) {
      const message =
        typeof statusMessage === "string" && statusMessage.trim()
          ? statusMessage
          : WATCH_HISTORY_LOADING_STATUS;
      setStatusMessage(message);
      return;
    }

    if (typeof statusMessage === "string") {
      setStatusMessage(statusMessage);
    } else {
      clearStatusMessage();
    }
  };

  const resetUiState = () => {
    const { grid, emptyEl } = getElements();
    if (grid) {
      grid.innerHTML = "";
      grid.classList.add("hidden");
    }
    if (emptyEl) {
      emptyEl.textContent = state.emptyCopy;
      emptyEl.classList.add("hidden");
    }
    setLoadingVisible(true);
  };

  const cleanupObservers = () => {
    if (state.observer) {
      debugLog("disconnecting intersection observer");
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.scrollListener?.target && state.scrollListener?.handler) {
      debugLog("removing scroll listener");
      state.scrollListener.target.removeEventListener(
        "scroll",
        state.scrollListener.handler
      );
      state.scrollListener = null;
    }
  };

  const cleanupGridHandler = () => {
    if (!state.gridEventHandler) {
      return;
    }
    const { grid } = getElements();
    if (grid) {
      grid.removeEventListener("click", state.gridEventHandler);
    }
    state.gridEventHandler = null;
  };

  const showEmptyState = (message = state.emptyCopy) => {
    const { grid, emptyEl } = getElements();
    if (grid) {
      grid.innerHTML = "";
      grid.classList.add("hidden");
    }
    if (emptyEl) {
      emptyEl.textContent = message;
      emptyEl.classList.remove("hidden");
    }
    const shouldShowEmptyStatus = message === state.emptyCopy;
    const statusMessage = shouldShowEmptyStatus ? WATCH_HISTORY_EMPTY_STATUS : "";
    setLoadingVisible(false, { statusMessage });
    state.hasMore = false;
    cleanupObservers();
    debugLog("showing empty state", { message });
  };

  const mergeResolvedVideos = (nextVideos) => {
    const ingest = (map, video) => {
      if (!video || typeof video !== "object" || !video.id) {
        return;
      }

      const existing = map.get(video.id);
      if (!existing) {
        map.set(video.id, video);
        return;
      }

      const existingScore = getWatchedAtScore(existing);
      const nextScore = getWatchedAtScore(video);

      if (nextScore > existingScore) {
        map.set(video.id, video);
        return;
      }

      if (nextScore === existingScore) {
        const existingCreated = toNumber(
          existing?.created_at,
          Number.NEGATIVE_INFINITY
        );
        const nextCreated = toNumber(
          video?.created_at,
          Number.NEGATIVE_INFINITY
        );

        if (nextCreated > existingCreated) {
          map.set(video.id, video);
        }
      }
    };

    if (!Array.isArray(state.resolvedVideos)) {
      state.resolvedVideos = [];
    }

    if (!Array.isArray(nextVideos) || !nextVideos.length) {
      applyAccessFilters();
      return;
    }

    const dedupeMap = new Map();
    state.resolvedVideos.forEach((video) => ingest(dedupeMap, video));
    nextVideos.forEach((video) => ingest(dedupeMap, video));

    state.resolvedVideos = Array.from(dedupeMap.values());
    applyAccessFilters();
  };

  const ensureGridEventHandlers = () => {
    const { grid } = getElements();
    if (!grid || state.gridEventHandler) {
      return;
    }

    const showRemoveSpinner = (button) => {
      if (!button || !button.dataset) {
        return;
      }

      if (button.dataset.originalHtml === undefined) {
        button.dataset.originalHtml = button.innerHTML;
      }

      if (button.dataset.originalAriaLabel === undefined) {
        button.dataset.originalAriaLabel = button.getAttribute("aria-label") || "";
      }

      button.innerHTML =
        '<span class="status-spinner status-spinner--inline" aria-hidden="true"></span>';
      button.setAttribute("aria-label", "Removing from watch history");
    };

    const restoreRemoveButton = (button) => {
      if (!button || !button.dataset) {
        return;
      }

      const originalHtml = button.dataset.originalHtml;
      if (typeof originalHtml === "string") {
        button.innerHTML = originalHtml;
      }

      const originalAria = button.dataset.originalAriaLabel || "";
      if (originalAria) {
        button.setAttribute("aria-label", originalAria);
      } else {
        button.removeAttribute("aria-label");
      }

      delete button.dataset.originalHtml;
      delete button.dataset.originalAriaLabel;
    };

    const handler = async (event) => {
      const removeTrigger = event.target.closest(
        "[data-history-remove-key]"
      );
      if (removeTrigger) {
        event.preventDefault();
        event.stopPropagation();
        if (removeTrigger.disabled) {
          return;
        }

        const targetKey = removeTrigger
          .getAttribute("data-history-remove-key")
          ?.trim();
        const targetEventId = removeTrigger
          .getAttribute("data-history-remove-event-id")
          ?.trim();
        if (!targetKey) {
          window.app?.showError?.(
            "Unable to remove this video from watch history."
          );
          return;
        }

        removeTrigger.disabled = true;
        removeTrigger.setAttribute("aria-busy", "true");
        showRemoveSpinner(removeTrigger);

        try {
          const result = await nostrClient.removeWatchHistoryItem(targetKey);
          if (!result?.ok) {
            const errorMessage =
              typeof result?.error === "string" && result.error
                ? result.error
                : "remove-failed";
            throw new Error(errorMessage);
          }

          state.resolvedVideos = state.resolvedVideos.filter((video) => {
            const key = video?.watchHistory?.key || "";
            if (key) {
              return key !== targetKey;
            }
            if (targetEventId) {
              return video?.id !== targetEventId;
            }
            return true;
          });

          applyAccessFilters();

          setLoadingVisible(false);
          renderResolvedVideos();
          window.app?.showSuccess?.("Removed from watch history.");
        } catch (error) {
          console.error(
            "[historyView] Failed to remove watch history item:",
            error
          );
          removeTrigger.disabled = false;
          window.app?.showError?.(
            "Failed to remove this video from watch history."
          );
        } finally {
          if (removeTrigger.isConnected) {
            restoreRemoveButton(removeTrigger);
            removeTrigger.removeAttribute("aria-busy");
          }
        }

        return;
      }

      const shareTrigger = event.target.closest("[data-history-share]");
      if (shareTrigger) {
        event.preventDefault();
        event.stopPropagation();

        const shareUrl = shareTrigger.getAttribute("data-share-url") || "";
        const shareTitle = shareTrigger.getAttribute("data-share-title") || "";
        const eventId = shareTrigger.getAttribute("data-event-id") || "";

        const normalizedTitle = shareTitle || "Watch on Bitvid";

        try {
          if (shareUrl && navigator.share) {
            await navigator.share({ title: normalizedTitle, url: shareUrl });
            return;
          }

          if (window.app?.handleMoreMenuAction) {
            await window.app.handleMoreMenuAction("copy-link", { eventId });
            return;
          }

          if (shareUrl && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            window.app?.showSuccess?.("Video link copied to clipboard!");
            return;
          }

          if (shareUrl) {
            window.open(shareUrl, "_blank", "noopener,noreferrer");
            return;
          }

          window.app?.showError?.("Unable to share this video right now.");
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }
          console.error(
            "[historyView] Failed to share watch history item:",
            error
          );
          window.app?.showError?.("Unable to share this video right now.");
        }
      }
    };

    grid.addEventListener("click", handler);
    state.gridEventHandler = handler;
  };

  const renderResolvedVideos = () => {
    const { grid, emptyEl } = getElements();
    if (!grid) {
      return;
    }

    const accessibleVideos = applyAccessFilters();

    if (!accessibleVideos.length) {
      if (emptyEl) {
        emptyEl.textContent = state.emptyCopy;
        emptyEl.classList.remove("hidden");
      }
      grid.classList.add("hidden");
      return;
    }

    if (typeof renderGrid === "function") {
      renderGrid(accessibleVideos, grid);
    } else {
      renderWatchHistoryGrid(accessibleVideos, grid);
    }

    ensureGridEventHandlers();

    grid.classList.remove("hidden");
    if (emptyEl) {
      emptyEl.classList.add("hidden");
    }
  };

  const loadNextBatch = async ({ initial = false } = {}) => {
    if (state.isLoading || !state.hasMore) {
      debugLog("skipping loadNextBatch", {
        reason: state.isLoading ? "already loading" : "no more items",
        initial,
        resolvedCount: state.resolvedVideos.length,
      });
      if (initial && !state.isLoading && state.resolvedVideos.length === 0) {
        setLoadingVisible(false);
      }
      return;
    }

    setLoadingVisible(true);
    state.isLoading = true;
    debugLog("loading next batch", {
      initial,
      batchSize: state.batchSize,
      resolvedCount: state.resolvedVideos.length,
    });

    try {
      const videos = await resolveBatch(state.batchSize);
      debugLog("resolveBatch completed", {
        initial,
        received: Array.isArray(videos) ? videos.length : "non-array",
      });

      if (!Array.isArray(videos) || videos.length === 0) {
        if (initial && state.resolvedVideos.length === 0) {
          showEmptyState();
        } else {
          state.hasMore = false;
          cleanupObservers();
          setLoadingVisible(false);
          debugLog("no videos returned", {
            initial,
            resolvedCount: state.resolvedVideos.length,
          });
        }
        return;
      }

      mergeResolvedVideos(videos);
      renderResolvedVideos();
      setLoadingVisible(false);
      debugLog("rendered videos", {
        totalResolved: state.resolvedVideos.length,
        initial,
      });
    } catch (error) {
      console.error("[historyView] Failed to resolve watch history:", error);
      if (initial && state.resolvedVideos.length === 0) {
        showEmptyState(
          "We couldn't load your watch history. Please try again later."
        );
      }
    } finally {
      state.isLoading = false;
      debugLog("loadNextBatch finished", {
        initial,
        hasMore: state.hasMore,
        resolvedCount: state.resolvedVideos.length,
      });
    }
  };

  const attachObservers = () => {
    const { sentinel, scrollContainer } = getElements();
    if (!sentinel || !state.hasMore) {
      debugLog("skipping observer attachment", {
        hasSentinel: Boolean(sentinel),
        hasMore: state.hasMore,
      });
      return;
    }

    if ("IntersectionObserver" in window) {
      debugLog("attaching intersection observer", {
        useScrollContainer: Boolean(scrollContainer),
      });
      state.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              debugLog("sentinel intersected");
              loadNextBatch();
            }
          });
        },
        {
          root: scrollContainer || null,
          rootMargin: scrollContainer ? "200px 0px" : "300px 0px",
        }
      );
      state.observer.observe(sentinel);
      return;
    }

    const target = scrollContainer || window;
    const handler = () => {
      const rect = sentinel.getBoundingClientRect();
      const threshold = scrollContainer
        ? scrollContainer.clientHeight
        : window.innerHeight;
      if (rect.top <= threshold + 200) {
        debugLog("scroll threshold met");
        loadNextBatch();
      }
    };

    target.addEventListener("scroll", handler, { passive: true });
    state.scrollListener = { target, handler };
    handler();
    debugLog("attached scroll listener", {
      useScrollContainer: Boolean(scrollContainer),
    });
  };

  scheduleAuthRefresh = (actorHint) => {
    const normalizedActor = normalizeActorHint(actorHint);

    const perform = async () => {
      const nextActor = normalizedActor || null;

      try {
        const { view } = getElements();
        if (!view) {
          state.actor = nextActor;
          state.snapshotFingerprint = null;
          state.initialized = false;
          state.resolvedVideos = [];
          state.hasMore = true;
          state.isLoading = false;
          cleanupObservers();
          return;
        }

        await runInitialLoad({ actor: nextActor });
      } catch (error) {
        console.error(
          "[historyView] Failed to refresh watch history after auth change:",
          error
        );
      }
    };

    const pendingRefresh =
      authRefreshPromise !== null
        ? authRefreshPromise.then(perform, perform)
        : perform();

    let currentPromise;
    const finalize = () => {
      if (authRefreshPromise === currentPromise) {
        authRefreshPromise = null;
      }
    };

    currentPromise = pendingRefresh.finally(finalize);
    authRefreshPromise = currentPromise;
    return currentPromise;
  };

  const runInitialLoad = async (options = {}) => {
    const { actor: actorHint = null, prefetched = null, fingerprintOverride } =
      typeof options === "object" && options !== null ? options : {};

    const { view } = getElements();
    if (!view) {
      debugLog("runInitialLoad aborted: view not found");
      return;
    }

    const resolvedActor = await resolveActor(actorHint ?? state.actor);
    state.actor = resolvedActor || null;

    cleanupObservers();
    state.resolvedVideos = [];
    state.hasMore = true;
    state.isLoading = false;
    state.initialized = false;
    state.snapshotFingerprint = null;
    resetUiState();
    debugLog("starting initial load", { actor: state.actor });

    let beforeResult;
    const hasPrefetched =
      prefetched &&
      Object.prototype.hasOwnProperty.call(prefetched, "beforeResult");

    if (hasPrefetched) {
      beforeResult = prefetched.beforeResult;
    } else {
      try {
        beforeResult = await callBeforeInitialLoad({ actor: state.actor });
      } catch (error) {
        console.error("[historyView] Failed to fetch watch history list:", error);
        showEmptyState(
          "We couldn't load your watch history. Please try again later."
        );
        return;
      }
    }

    if (
      beforeResult &&
      typeof beforeResult === "object" &&
      typeof beforeResult.actor === "string" &&
      beforeResult.actor.trim()
    ) {
      state.actor = beforeResult.actor.trim();
    }

    if (state.actor) {
      nostrClient.resetWatchHistoryProgress(state.actor);
    }

    let fingerprint;
    if (typeof fingerprintOverride !== "undefined") {
      fingerprint = fingerprintOverride;
    } else {
      try {
        fingerprint = await computeSnapshotFingerprint({
          actor: state.actor,
          beforeResult,
          refresh: false,
        });
      } catch (error) {
        debugLog("failed to compute snapshot fingerprint", error);
      }
    }

    if (typeof fingerprint === "string") {
      state.snapshotFingerprint = fingerprint;
    } else {
      state.snapshotFingerprint = null;
    }

    try {
      await accessControl.ensureReady();
    } catch (error) {
      console.warn(
        "[historyView] Access control not ready, proceeding with cached lists:",
        error
      );
    }

    await loadNextBatch({ initial: true });

    if (state.hasMore) {
      attachObservers();
    }

    state.initialized = true;
    debugLog("initial load complete", {
      hasMore: state.hasMore,
      resolvedCount: state.resolvedVideos.length,
      actor: state.actor,
    });
  };

  attachAuthChangeListener();

  return {
    async init() {
      debugLog("init called");
      await runInitialLoad();
    },
    async ensureInitialLoad() {
      const { view } = getElements();
      if (!view) {
        debugLog("ensureInitialLoad aborted: view not found");
        return;
      }

      if (!state.initialized) {
        debugLog("ensureInitialLoad rerunning initial load (not initialized)");
        await runInitialLoad();
        return;
      }

      state.actor = (await resolveActor(state.actor)) || null;

      if (!state.isLoading) {
        try {
          const beforeResult = await callBeforeInitialLoad({
            actor: state.actor,
            reason: "ensureInitialLoad",
          });
          if (
            beforeResult &&
            typeof beforeResult === "object" &&
            typeof beforeResult.actor === "string" &&
            beforeResult.actor.trim()
          ) {
            state.actor = beforeResult.actor.trim();
          }
          const fingerprint = await computeSnapshotFingerprint({
            actor: state.actor,
            beforeResult,
            refresh: false,
          });

          if (typeof fingerprint === "string") {
            if (fingerprint !== state.snapshotFingerprint) {
              debugLog("ensureInitialLoad detected new snapshot", {
                previous: state.snapshotFingerprint,
                next: fingerprint,
                actor: state.actor,
              });
              await runInitialLoad({
                actor: state.actor,
                prefetched: { beforeResult },
                fingerprintOverride: fingerprint,
              });
              return;
            }
            state.snapshotFingerprint = fingerprint;
          }
        } catch (error) {
          console.warn(
            "[historyView] Failed to refresh watch history snapshot:",
            error
          );
        }
      } else {
        debugLog("ensureInitialLoad skipping snapshot refresh (still loading)", {
          actor: state.actor,
        });
      }

      if (!state.resolvedVideos.length && !state.isLoading) {
        if (!state.hasMore) {
          debugLog("ensureInitialLoad resetting hasMore before retry");
          state.hasMore = true;
        }
        debugLog("ensureInitialLoad requesting new batch", {
          hasMore: state.hasMore,
        });
        await loadNextBatch({ initial: true });

        if (state.hasMore && !state.observer && !state.scrollListener) {
          debugLog("ensureInitialLoad reattaching observers");
          attachObservers();
        }
      } else {
        debugLog("ensureInitialLoad no action", {
          resolvedCount: state.resolvedVideos.length,
          isLoading: state.isLoading,
          hasMore: state.hasMore,
        });
      }
    },
    async loadMore() {
      debugLog("loadMore called");
      await loadNextBatch();
    },
    resume() {
      cleanupObservers();
      if (state.hasMore) {
        debugLog("resume attaching observers");
        attachObservers();
      }
    },
    pause() {
      debugLog("pause called");
      cleanupObservers();
    },
    destroy() {
      debugLog("destroy called");
      cleanupObservers();
      cleanupGridHandler();
      detachAuthChangeListener();
      state.initialized = false;
      state.resolvedVideos = [];
      state.hasMore = true;
      state.isLoading = false;
      state.actor = null;
      state.snapshotFingerprint = null;
      resetUiState();
      setLoadingVisible(false);
    },
    async refresh(actorHint = null) {
      await scheduleAuthRefresh(actorHint);
    },
    render() {
      renderResolvedVideos();
    },
    getState() {
      return {
        ...state,
        resolvedVideos: state.resolvedVideos.slice(),
      };
    },
  };
}

export const watchHistoryRenderer = createWatchHistoryRenderer();

export async function initHistoryView() {
  await watchHistoryRenderer.init();
}

if (typeof window !== "undefined") {
  if (!window.bitvid) {
    window.bitvid = {};
  }
  window.bitvid.initHistoryView = initHistoryView;
  window.bitvid.watchHistoryRenderer = watchHistoryRenderer;
}
