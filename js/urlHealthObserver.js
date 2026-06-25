import { createCardObserver } from "./dom/cardObserver.js";
import { safeDecodeURIComponent } from "./utils/safeDecode.js";
import { userLogger } from "./utils/logger.js";
import { getLivenessProbePrefetchMargin } from "./constants.js";
import { cardNeedsEagerLivenessProbe } from "./utils/cardSourceVisibility.js";

// Prefetch margin lets cards just below the fold start probing before they scroll
// into view, so they're verified by the time the user reaches them.
const ROOT_MARGIN = getLivenessProbePrefetchMargin();
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
  // Hide-until-verified cards start `display:none`, so the IntersectionObserver
  // never fires for them — kick the URL probe eagerly on register so they can be
  // verified and revealed (the alternative is they stay hidden forever).
  onCardRegister: ({ card, state }) => {
    if (cardNeedsEagerLivenessProbe(card)) {
      // attachUrlHealthBadges sets state.onCheck right AFTER observe() returns, so
      // defer one microtask to let that wiring land before we probe.
      queueMicrotask(() => triggerUrlCheck(card, state));
    }
  },
  onCardVisible: ({ card, state }) => {
    triggerUrlCheck(card, state);
  },
});

function triggerUrlCheck(card, state) {
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
}

export function attachUrlHealthBadges(container, onCheck) {
  if (!(container instanceof HTMLElement)) {
    return;
  }

  const state = urlCardObserver.observe(container);
  if (state && typeof onCheck === "function") {
    state.onCheck = onCheck;
  }
}

