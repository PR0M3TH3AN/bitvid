const containerState = new WeakMap();
const ROOT_MARGIN = "0px";
const THRESHOLD = 0.25;

function decodeUrl(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

function ensureState(container) {
  let state = containerState.get(container);
  if (state) {
    return state;
  }

  const observedCards = new WeakSet();
  const observer = new IntersectionObserver(
    (entries) => {
      processEntries(entries, state);
    },
    { root: null, rootMargin: ROOT_MARGIN, threshold: THRESHOLD }
  );

  state = {
    observer,
    observedCards,
    onCheck: null,
  };
  containerState.set(container, state);
  return state;
}

function processEntries(entries, state) {
  if (!state?.onCheck || !Array.isArray(entries) || !entries.length) {
    return;
  }

  entries.forEach((entry) => {
    if (!entry.isIntersecting || entry.intersectionRatio <= 0) {
      return;
    }

    const card = entry.target;
    if (!(card instanceof HTMLElement)) {
      return;
    }

    const badgeEl = card.querySelector("[data-url-health-state]");
    if (!(badgeEl instanceof HTMLElement)) {
      return;
    }

    const encodedUrl =
      card.dataset.urlHealthUrl || badgeEl.dataset.urlHealthUrl || "";
    const eventId =
      card.dataset.urlHealthEventId || badgeEl.dataset.urlHealthEventId || "";

    if (!encodedUrl || !eventId) {
      return;
    }

    const currentState =
      card.dataset.urlHealthState || badgeEl.dataset.urlHealthState;
    if (currentState && currentState !== "checking") {
      return;
    }

    const url = decodeUrl(encodedUrl);
    if (!url) {
      return;
    }

    try {
      state.onCheck({ card, badgeEl, url, eventId });
    } catch (err) {
      console.warn("[urlHealthObserver] onCheck handler failed", err);
    }
  });
}

export function attachUrlHealthBadges(container, onCheck) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const state = ensureState(container);
  if (typeof onCheck === "function") {
    state.onCheck = onCheck;
  }

  const cards = container.querySelectorAll(".video-card");
  cards.forEach((card) => {
    if (!(card instanceof HTMLElement)) {
      return;
    }
    if (state.observedCards.has(card)) {
      return;
    }
    state.observedCards.add(card);
    state.observer.observe(card);
  });

  const records = state.observer.takeRecords();
  if (records.length) {
    processEntries(records, state);
  }
}

export function refreshUrlHealthBadges(container) {
  const state = containerState.get(container);
  if (!state) {
    return;
  }
  const records = state.observer.takeRecords();
  if (records.length) {
    processEntries(records, state);
  }
}
