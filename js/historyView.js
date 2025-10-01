// js/historyView.js

import { nostrClient } from "./nostr.js";
import { WATCH_HISTORY_BATCH_RESOLVE } from "./config.js";
import { subscriptions } from "./subscriptions.js";

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

  const filteredVideos = dedupedVideos.filter((video) => {
    if (!video || typeof video !== "object") {
      return false;
    }

    if (window.app?.isAuthorBlocked && window.app.isAuthorBlocked(video.pubkey)) {
      return false;
    }

    return true;
  });

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

    let hasOlder = false;
    if (canEdit && video.videoRootId && window.app?.hasOlderVersion) {
      hasOlder = window.app.hasOlderVersion(video, fullAllEventsArray);
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

    const moreMenu = `
      <div class="relative inline-block ml-1 overflow-visible" data-more-menu-wrapper="true">
        <button
          type="button"
          class="inline-flex items-center justify-center w-10 h-10 p-2 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-more-dropdown="${index}"
          aria-haspopup="true"
          aria-expanded="false"
          aria-label="More options"
        >
          <img src="assets/svg/ellipsis.svg" alt="More" class="w-5 h-5 object-contain" />
        </button>
        <div
          id="moreDropdown-${index}"
          class="hidden absolute right-0 bottom-full mb-2 w-40 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
          role="menu"
          data-more-menu="true"
        >
          <div class="py-1">
            <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700" data-action="open-channel" data-author="${video.pubkey || ""}">
              Open channel
            </button>
            <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700" data-action="copy-link" data-event-id="${video.id || ""}">
              Copy link
            </button>
            <button class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white" data-action="block-author" data-author="${video.pubkey || ""}">
              Block creator
            </button>
            <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700" data-action="report" data-event-id="${video.id || ""}">
              Report
            </button>
          </div>
        </div>
      </div>
    `;

    const cardControls = `
      <div class="watch-history-card__menus">
        ${moreMenu}${gearMenu}
      </div>
    `;

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
            ${cardControls}
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

  window.app?.attachMoreMenuHandlers?.(container);

  const gearButtons = container.querySelectorAll("[data-settings-dropdown]");
  gearButtons.forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idx = btn.getAttribute("data-settings-dropdown");
      const dropdown = document.getElementById(`settingsDropdown-${idx}`);
      if (dropdown) dropdown.classList.toggle("hidden");
    });
  });

  const editButtons = container.querySelectorAll("[data-edit-index]");
  editButtons.forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idxAttr = btn.getAttribute("data-edit-index");
      const idx = Number.parseInt(idxAttr, 10);
      const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
      if (dropdown) dropdown.classList.add("hidden");
      const eventId = btn.getAttribute("data-edit-event-id") || "";
      window.app?.handleEditVideo({
        eventId,
        index: Number.isNaN(idx) ? null : idx,
      });
    });
  });

  const revertButtons = container.querySelectorAll("[data-revert-index]");
  revertButtons.forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idxAttr = btn.getAttribute("data-revert-index");
      const idx = Number.parseInt(idxAttr, 10);
      const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
      if (dropdown) dropdown.classList.add("hidden");
      const eventId = btn.getAttribute("data-revert-event-id") || "";
      window.app?.handleRevertVideo({
        eventId,
        index: Number.isNaN(idx) ? null : idx,
      });
    });
  });

  const deleteAllButtons = container.querySelectorAll("[data-delete-all-index]");
  deleteAllButtons.forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const idxAttr = btn.getAttribute("data-delete-all-index");
      const idx = Number.parseInt(idxAttr, 10);
      const dd = document.getElementById(`settingsDropdown-${idxAttr}`);
      if (dd) dd.classList.add("hidden");
      const eventId = btn.getAttribute("data-delete-all-event-id") || "";
      window.app?.handleFullDeleteVideo({
        eventId,
        index: Number.isNaN(idx) ? null : idx,
      });
    });
  });

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
      statusEl.textContent = nextMessage;
      statusEl.classList.remove("hidden");
    } else {
      statusEl.textContent = "";
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
    if (!Array.isArray(nextVideos) || !nextVideos.length) {
      return;
    }

    const dedupeMap = new Map();
    state.resolvedVideos.forEach((video) => {
      if (video && video.id) {
        dedupeMap.set(video.id, video);
      }
    });
    nextVideos.forEach((video) => {
      if (video && video.id) {
        dedupeMap.set(video.id, video);
      }
    });
    state.resolvedVideos = Array.from(dedupeMap.values());
  };

  const ensureGridEventHandlers = () => {
    const { grid } = getElements();
    if (!grid || state.gridEventHandler) {
      return;
    }

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
          removeTrigger.removeAttribute("aria-busy");
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

    if (!state.resolvedVideos.length) {
      if (emptyEl) {
        emptyEl.textContent = state.emptyCopy;
        emptyEl.classList.remove("hidden");
      }
      grid.classList.add("hidden");
      return;
    }

    if (typeof renderGrid === "function") {
      renderGrid(state.resolvedVideos, grid);
    } else {
      renderWatchHistoryGrid(state.resolvedVideos, grid);
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
      state.initialized = false;
      state.resolvedVideos = [];
      state.hasMore = true;
      state.isLoading = false;
      state.actor = null;
      state.snapshotFingerprint = null;
      resetUiState();
      setLoadingVisible(false);
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

if (!window.bitvid) {
  window.bitvid = {};
}
window.bitvid.initHistoryView = initHistoryView;
