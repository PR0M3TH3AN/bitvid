// js/historyView.js

import { nostrClient } from "./nostr.js";
import { WATCH_HISTORY_BATCH_RESOLVE } from "./config.js";
import { subscriptions } from "./subscriptions.js";

const DEFAULT_BATCH_SIZE = 20;
const BATCH_SIZE = WATCH_HISTORY_BATCH_RESOLVE ? DEFAULT_BATCH_SIZE : 1;
const EMPTY_COPY =
  "Your watch history is empty. Watch some videos to populate this list.";

let isLoading = false;
let hasMore = true;
let observer = null;
let scrollHandler = null;
let resolvedVideos = [];

function getElements() {
  return {
    view: document.getElementById("watchHistoryView"),
    grid: document.getElementById("watchHistoryGrid"),
    loadingEl: document.getElementById("watchHistoryLoading"),
    emptyEl: document.getElementById("watchHistoryEmpty"),
    sentinel: document.getElementById("watchHistorySentinel"),
  };
}

function resetUiState() {
  const { grid, loadingEl, emptyEl } = getElements();
  if (grid) {
    grid.innerHTML = "";
    grid.classList.add("hidden");
  }
  if (loadingEl) {
    loadingEl.classList.remove("hidden");
  }
  if (emptyEl) {
    emptyEl.textContent = EMPTY_COPY;
    emptyEl.classList.add("hidden");
  }
}

function cleanupObservers() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (scrollHandler) {
    window.removeEventListener("scroll", scrollHandler);
    scrollHandler = null;
  }
}

function setLoadingVisible(visible) {
  const { loadingEl } = getElements();
  if (!loadingEl) {
    return;
  }
  if (visible) {
    loadingEl.classList.remove("hidden");
  } else {
    loadingEl.classList.add("hidden");
  }
}

function showEmptyState(message = EMPTY_COPY) {
  const { grid, emptyEl } = getElements();
  if (grid) {
    grid.innerHTML = "";
    grid.classList.add("hidden");
  }
  if (emptyEl) {
    emptyEl.textContent = message;
    emptyEl.classList.remove("hidden");
  }
  setLoadingVisible(false);
  hasMore = false;
  cleanupObservers();
}

function mergeResolvedVideos(nextVideos) {
  if (!Array.isArray(nextVideos) || !nextVideos.length) {
    return;
  }
  const dedupeMap = new Map();
  resolvedVideos.forEach((video) => {
    if (video && video.id) {
      dedupeMap.set(video.id, video);
    }
  });
  nextVideos.forEach((video) => {
    if (video && video.id) {
      dedupeMap.set(video.id, video);
    }
  });
  resolvedVideos = Array.from(dedupeMap.values());
}

function renderResolvedVideos() {
  const { grid, emptyEl } = getElements();
  if (!grid) {
    return;
  }

  if (!resolvedVideos.length) {
    if (emptyEl) {
      emptyEl.textContent = EMPTY_COPY;
      emptyEl.classList.remove("hidden");
    }
    grid.classList.add("hidden");
    return;
  }

  subscriptions.renderSameGridStyle(resolvedVideos, "watchHistoryGrid");
  grid.classList.remove("hidden");
  if (emptyEl) {
    emptyEl.classList.add("hidden");
  }
}

async function loadNextBatch({ initial = false } = {}) {
  if (isLoading || !hasMore) {
    if (initial && !isLoading && resolvedVideos.length === 0) {
      setLoadingVisible(false);
    }
    return;
  }

  isLoading = true;

  try {
    const videos = await nostrClient.resolveWatchHistory(BATCH_SIZE);

    if (videos.length === 0) {
      if (initial && resolvedVideos.length === 0) {
        showEmptyState();
      } else {
        hasMore = false;
        cleanupObservers();
      }
      return;
    }

    mergeResolvedVideos(videos);
    renderResolvedVideos();
    setLoadingVisible(false);
  } catch (error) {
    console.error("[historyView] Failed to resolve watch history:", error);
    if (initial && resolvedVideos.length === 0) {
      showEmptyState("We couldn't load your watch history. Please try again later.");
    }
  } finally {
    isLoading = false;
  }
}

function attachObservers() {
  const { sentinel } = getElements();
  if (!sentinel || !hasMore) {
    return;
  }

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadNextBatch();
          }
        });
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(sentinel);
    return;
  }

  scrollHandler = () => {
    const rect = sentinel.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 200) {
      loadNextBatch();
    }
  };
  window.addEventListener("scroll", scrollHandler, { passive: true });
  scrollHandler();
}

export async function initHistoryView() {
  const { view } = getElements();
  if (!view) {
    return;
  }

  cleanupObservers();
  resolvedVideos = [];
  hasMore = true;
  isLoading = false;
  resetUiState();

  try {
    const actor = window.app?.pubkey || undefined;
    await nostrClient.fetchWatchHistory(actor);
  } catch (error) {
    console.error("[historyView] Failed to fetch watch history list:", error);
    showEmptyState("We couldn't load your watch history. Please try again later.");
    return;
  }

  await loadNextBatch({ initial: true });

  if (hasMore) {
    attachObservers();
  }
}

// Expose init on window for debugging/manual triggers if needed.
if (!window.bitvid) {
  window.bitvid = {};
}
window.bitvid.initHistoryView = initHistoryView;
