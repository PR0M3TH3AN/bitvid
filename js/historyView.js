// js/historyView.js

import { nostrClient } from "./nostr.js";
import { WATCH_HISTORY_BATCH_RESOLVE } from "./config.js";
import { subscriptions } from "./subscriptions.js";

const DEFAULT_BATCH_SIZE = 20;
const BATCH_SIZE = WATCH_HISTORY_BATCH_RESOLVE ? DEFAULT_BATCH_SIZE : 1;

export const WATCH_HISTORY_EMPTY_COPY =
  "Your watch history is empty. Watch some videos to populate this list.";

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createWatchHistoryRenderer(config = {}) {
  const {
    viewSelector = "#watchHistoryView",
    gridSelector = "#watchHistoryGrid",
    loadingSelector = "#watchHistoryLoading",
    emptySelector = "#watchHistoryEmpty",
    sentinelSelector = "#watchHistorySentinel",
    scrollContainerSelector = null,
    emptyCopy = WATCH_HISTORY_EMPTY_COPY,
    beforeInitialLoad = async () => {
      const actor = window.app?.pubkey || undefined;
      await nostrClient.fetchWatchHistory(actor);
    },
    resolveBatch = (size) => nostrClient.resolveWatchHistory(size),
    renderGrid = null,
    batchSize = BATCH_SIZE,
  } = config;

  const selectors = {
    view: viewSelector,
    grid: gridSelector,
    loading: loadingSelector,
    empty: emptySelector,
    sentinel: sentinelSelector,
    scrollContainer: scrollContainerSelector,
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
    emptyEl: query(selectors.empty),
    sentinel: query(selectors.sentinel),
    scrollContainer: query(selectors.scrollContainer),
  });

  const setLoadingVisible = (visible) => {
    const { loadingEl } = getElements();
    if (!loadingEl) {
      return;
    }
    if (visible) {
      loadingEl.classList.remove("hidden");
    } else {
      loadingEl.classList.add("hidden");
    }
  };

  const resetUiState = () => {
    const { grid, loadingEl, emptyEl } = getElements();
    if (grid) {
      grid.innerHTML = "";
      grid.classList.add("hidden");
    }
    if (loadingEl) {
      loadingEl.classList.remove("hidden");
    }
    if (emptyEl) {
      emptyEl.textContent = state.emptyCopy;
      emptyEl.classList.add("hidden");
    }
  };

  const cleanupObservers = () => {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.scrollListener?.target && state.scrollListener?.handler) {
      state.scrollListener.target.removeEventListener(
        "scroll",
        state.scrollListener.handler
      );
      state.scrollListener = null;
    }
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
    setLoadingVisible(false);
    state.hasMore = false;
    cleanupObservers();
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
    } else if (grid.id) {
      subscriptions.renderSameGridStyle(state.resolvedVideos, grid.id);
    } else {
      subscriptions.renderSameGridStyle(state.resolvedVideos, "watchHistoryGrid");
    }

    grid.classList.remove("hidden");
    if (emptyEl) {
      emptyEl.classList.add("hidden");
    }
  };

  const loadNextBatch = async ({ initial = false } = {}) => {
    if (state.isLoading || !state.hasMore) {
      if (initial && !state.isLoading && state.resolvedVideos.length === 0) {
        setLoadingVisible(false);
      }
      return;
    }

    state.isLoading = true;

    try {
      const videos = await resolveBatch(state.batchSize);

      if (!Array.isArray(videos) || videos.length === 0) {
        if (initial && state.resolvedVideos.length === 0) {
          showEmptyState();
        } else {
          state.hasMore = false;
          cleanupObservers();
          setLoadingVisible(false);
        }
        return;
      }

      mergeResolvedVideos(videos);
      renderResolvedVideos();
      setLoadingVisible(false);
    } catch (error) {
      console.error("[historyView] Failed to resolve watch history:", error);
      if (initial && state.resolvedVideos.length === 0) {
        showEmptyState(
          "We couldn't load your watch history. Please try again later."
        );
      }
    } finally {
      state.isLoading = false;
    }
  };

  const attachObservers = () => {
    const { sentinel, scrollContainer } = getElements();
    if (!sentinel || !state.hasMore) {
      return;
    }

    if ("IntersectionObserver" in window) {
      state.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
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
        loadNextBatch();
      }
    };

    target.addEventListener("scroll", handler, { passive: true });
    state.scrollListener = { target, handler };
    handler();
  };

  const runInitialLoad = async () => {
    const { view } = getElements();
    if (!view) {
      return;
    }

    cleanupObservers();
    state.resolvedVideos = [];
    state.hasMore = true;
    state.isLoading = false;
    state.initialized = false;
    resetUiState();

    try {
      await beforeInitialLoad?.();
    } catch (error) {
      console.error("[historyView] Failed to fetch watch history list:", error);
      showEmptyState(
        "We couldn't load your watch history. Please try again later."
      );
      return;
    }

    await loadNextBatch({ initial: true });

    if (state.hasMore) {
      attachObservers();
    }

    state.initialized = true;
  };

  return {
    async init() {
      await runInitialLoad();
    },
    async ensureInitialLoad() {
      const { view } = getElements();
      if (!view) {
        return;
      }

      if (!state.initialized) {
        await runInitialLoad();
        return;
      }

      if (!state.resolvedVideos.length && !state.isLoading) {
        if (!state.hasMore) {
          state.hasMore = true;
        }
        await loadNextBatch({ initial: true });

        if (state.hasMore && !state.observer && !state.scrollListener) {
          attachObservers();
        }
      }
    },
    async loadMore() {
      await loadNextBatch();
    },
    resume() {
      cleanupObservers();
      if (state.hasMore) {
        attachObservers();
      }
    },
    pause() {
      cleanupObservers();
    },
    destroy() {
      cleanupObservers();
      state.initialized = false;
      state.resolvedVideos = [];
      state.hasMore = true;
      state.isLoading = false;
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
