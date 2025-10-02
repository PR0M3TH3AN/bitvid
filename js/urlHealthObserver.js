import { createCardObserver } from "./dom/cardObserver.js";

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

const urlCardObserver = createCardObserver({
  rootMargin: ROOT_MARGIN,
  threshold: THRESHOLD,
  isCardVisible: (entry) => {
    if (!entry) {
      return false;
    }
    const isIntersecting = Boolean(entry.isIntersecting);
    const ratio = typeof entry.intersectionRatio === "number" ? entry.intersectionRatio : 0;
    return isIntersecting && ratio > 0;
  },
  createState: () => ({ onCheck: null }),
  onCardVisible: ({ card, state }) => {
    if (!state || typeof state.onCheck !== "function") {
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
  },
});

export function attachUrlHealthBadges(container, onCheck) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const state = urlCardObserver.observe(container);
  if (state && typeof onCheck === "function") {
    state.onCheck = onCheck;
  }
}

export function refreshUrlHealthBadges(container) {
  urlCardObserver.refresh(container);
}
