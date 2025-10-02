// js/historyView.js

export const WATCH_HISTORY_EMPTY_COPY =
  "Your watch history is empty. Watch some videos to populate this list.";

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

export function createWatchHistoryRenderer(config = {}) {
  const {
    viewSelector = "#watchHistoryView",
    gridSelector = "#watchHistoryGrid",
    loadingSelector = "#watchHistoryLoading",
    statusSelector = "#watchHistoryStatus",
    emptySelector = "#watchHistoryEmpty",
    emptyCopy = WATCH_HISTORY_EMPTY_COPY,
  } = config;

  const state = {
    initialized: false,
    resolvedVideos: [],
    hasMore: false,
    isLoading: false,
    actor: null,
  };

  let elements = {
    view: null,
    grid: null,
    loading: null,
    status: null,
    empty: null,
  };

  const refreshElements = () => {
    elements = {
      view: resolveElement(viewSelector),
      grid: resolveElement(gridSelector),
      loading: resolveElement(loadingSelector),
      status: resolveElement(statusSelector),
      empty: resolveElement(emptySelector),
    };
  };

  const hideLoading = () => {
    setHidden(elements.loading, true);
    if (elements.status) {
      setHidden(elements.status, true);
    }
  };

  const showEmpty = () => {
    if (elements.grid) {
      elements.grid.innerHTML = "";
      setHidden(elements.grid, true);
    }
    if (elements.empty) {
      setTextContent(elements.empty, emptyCopy);
      setHidden(elements.empty, false);
    }
  };

  const resetUi = () => {
    refreshElements();
    hideLoading();
    showEmpty();
  };

  return {
    async init() {
      resetUi();
      state.initialized = true;
      state.resolvedVideos = [];
      state.hasMore = false;
      state.isLoading = false;
    },
    async ensureInitialLoad() {
      if (!state.initialized) {
        await this.init();
        return;
      }
      resetUi();
    },
    async loadMore() {
      return [];
    },
    resume() {},
    pause() {},
    destroy() {
      state.initialized = false;
      state.resolvedVideos = [];
      state.hasMore = false;
      state.isLoading = false;
      hideLoading();
      showEmpty();
    },
    async refresh() {
      await this.ensureInitialLoad();
    },
    render() {
      resetUi();
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
