import { createCardObserver } from "./dom/cardObserver.js";
import { userLogger } from "./utils/logger.js";
import { safeDecodeURIComponent } from "./utils/safeDecode.js";

const ROOT_MARGIN = "0px";
const THRESHOLD = 0.25;

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

    const url = safeDecodeURIComponent(encodedUrl);
    if (!url) {
      return;
    }

    try {
      state.onCheck({ card, badgeEl, url, eventId });
    } catch (err) {
      userLogger.warn("[urlHealthObserver] onCheck handler failed", err);
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
