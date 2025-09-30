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
