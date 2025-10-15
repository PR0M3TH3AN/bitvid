import { userLogger } from "../utils/logger.js";
const DEFAULT_CARD_SELECTOR = ".card[data-video-id]";

function defaultIsCardVisible(entry) {
  if (!entry) {
    return false;
  }
  const isIntersecting = Boolean(entry.isIntersecting);
  const ratio = typeof entry.intersectionRatio === "number" ? entry.intersectionRatio : 0;
  return isIntersecting && ratio > 0;
}

function normalizeState(value) {
  if (value && typeof value === "object") {
    return value;
  }
  return {};
}

export function createCardObserver(options = {}) {
  const {
    rootMargin = "0px",
    threshold = 0,
    cardSelector = DEFAULT_CARD_SELECTOR,
    isCardVisible = defaultIsCardVisible,
    prepareEntries,
    onCardVisible,
    onCardRegister,
    createState,
  } = options;

  const containerState = new WeakMap();

  function ensureState(container) {
    let state = containerState.get(container);
    if (state) {
      return state;
    }

    const observedCards = new WeakSet();
    const customState = normalizeState(
      typeof createState === "function" ? createState(container) : {}
    );

    const stateWrapper = {
      container,
      observedCards,
      customState,
      observer: null,
    };

    const observer = new IntersectionObserver(
      (entries) => {
        handleEntries(entries, stateWrapper);
      },
      { root: null, rootMargin, threshold }
    );

    stateWrapper.observer = observer;
    containerState.set(container, stateWrapper);
    return stateWrapper;
  }

  function mapEntries(entries, state) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const context = {
      container: state.container,
      observer: state.observer,
      state: state.customState,
    };

    if (typeof prepareEntries === "function") {
      try {
        const prepared = prepareEntries(entries, context);
        if (Array.isArray(prepared)) {
          return prepared;
        }
      } catch (err) {
        userLogger.warn("[cardObserver] prepareEntries failed", err);
      }
    }

    return entries;
  }

  function handleEntries(entries, state) {
    const mapped = mapEntries(entries, state);
    if (!mapped.length) {
      return;
    }

    mapped.forEach((item) => {
      let entry = item;
      let card;
      let meta;

      if (item && typeof item === "object" && "entry" in item) {
        entry = item.entry;
        card = item.card instanceof HTMLElement ? item.card : entry?.target;
        if ("meta" in item) {
          meta = item.meta;
        } else if ("data" in item) {
          meta = item.data;
        } else if (typeof item.priority !== "undefined") {
          meta = { priority: item.priority };
        }
      } else if (entry && entry.target instanceof HTMLElement) {
        card = entry.target;
      }

      if (!(card instanceof HTMLElement) || !entry) {
        return;
      }

      let visible = false;
      try {
        visible = Boolean(isCardVisible(entry, card, {
          container: state.container,
          observer: state.observer,
          state: state.customState,
        }));
      } catch (err) {
        userLogger.warn("[cardObserver] isCardVisible failed", err);
        visible = false;
      }

      if (!visible || typeof onCardVisible !== "function") {
        return;
      }

      try {
        onCardVisible({
          card,
          entry,
          meta,
          state: state.customState,
          context: {
            container: state.container,
            observer: state.observer,
          },
        });
      } catch (err) {
        userLogger.warn("[cardObserver] onCardVisible failed", err);
      }
    });
  }

  function observe(container) {
    if (!(container instanceof HTMLElement)) {
      return null;
    }

    const state = ensureState(container);
    const cards = container.querySelectorAll(cardSelector);
    cards.forEach((card) => {
      if (!(card instanceof HTMLElement)) {
        return;
      }
      if (state.observedCards.has(card)) {
        return;
      }
      state.observedCards.add(card);
      if (typeof onCardRegister === "function") {
        try {
          onCardRegister({
            card,
            state: state.customState,
            context: { container },
          });
        } catch (err) {
          userLogger.warn("[cardObserver] onCardRegister failed", err);
        }
      }
      state.observer.observe(card);
    });

    const records = state.observer.takeRecords();
    if (records.length) {
      handleEntries(records, state);
    }

    return state.customState;
  }

  function refresh(container) {
    const state = containerState.get(container);
    if (!state) {
      return;
    }
    const records = state.observer.takeRecords();
    if (records.length) {
      handleEntries(records, state);
    }
  }

  function getState(container) {
    const state = containerState.get(container);
    return state ? state.customState : null;
  }

  return {
    observe,
    refresh,
    getState,
  };
}