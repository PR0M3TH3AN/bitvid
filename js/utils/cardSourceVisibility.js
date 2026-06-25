import { getCardLivenessPolicy } from "../constants.js";

/**
 * Whether a card is governed by a hide-until-verified policy (so it starts hidden
 * and must be PROBED to ever appear). Such cards can't rely on the viewport
 * IntersectionObserver — a `display:none` card never intersects, so the probe
 * must be kicked eagerly on register. Owner's own cards are always visible and
 * never gated.
 */
export function cardNeedsEagerLivenessProbe(cardLike) {
  const card = resolveCardElement(cardLike);
  if (!card || card.dataset.ownerIsViewer === "true") {
    return false;
  }
  const policy = getCardLivenessPolicy();
  const gated =
    policy === "hide-all" ||
    (policy === "hide-foreign" && card.dataset.foreign === "true");
  if (!gated) {
    return false;
  }
  // Only cards backed by a fast CDN probe are hidden-until-verified (so they need
  // eager probing while hidden). P2P-only cards fall back to show-pending — they
  // start visible and are probed normally on scroll, so no eager kick is needed.
  return Boolean(card.dataset.urlHealthUrl);
}

function resolveCardElement(cardLike) {
  if (!cardLike) {
    return null;
  }

  const isElement =
    typeof cardLike === "object" && cardLike !== null && cardLike.nodeType === 1;

  if (isElement) {
    const element = cardLike;
    if (typeof element.closest === "function") {
      if (element.classList?.contains("card")) {
        return element;
      }
      return element.closest(".card");
    }
    return element.classList?.contains("card") ? element : null;
  }

  if (
    typeof HTMLElement !== "undefined" &&
    cardLike instanceof HTMLElement &&
    typeof cardLike.closest === "function"
  ) {
    if (cardLike.classList.contains("card")) {
      return cardLike;
    }
    return cardLike.closest(".card");
  }

  if (typeof cardLike === "object" && cardLike !== null) {
    if (typeof cardLike.card === "object" && cardLike.card?.nodeType === 1) {
      return resolveCardElement(cardLike.card);
    }
    if (typeof cardLike.root === "object" && cardLike.root?.nodeType === 1) {
      return resolveCardElement(cardLike.root);
    }
  }

  return null;
}

export function updateVideoCardSourceVisibility(cardLike) {
  const card = resolveCardElement(cardLike);
  if (!card) {
    return;
  }

  if (card.dataset.ownerIsViewer === "true") {
    if (card.hidden) {
      card.hidden = false;
    }
    if (card.dataset.sourceVisibility !== "visible") {
      card.dataset.sourceVisibility = "visible";
    }
    return;
  }

  const cdnState = (card.dataset.urlHealthState || "").toLowerCase();
  const streamState = (card.dataset.streamHealthState || "").toLowerCase();

  const cdnPending = !cdnState || cdnState === "checking";
  const streamPending = !streamState || streamState === "checking";

  const cdnHealthy = cdnState === "healthy";
  const streamHealthy = streamState === "healthy";

  // Liveness visibility policy (config/instance-config.js → CARD_LIVENESS_POLICY):
  //   show-pending : show now, hide only once every source is confirmed dead.
  //   hide-foreign : foreign/ingested cards stay hidden until a source is proven
  //                  playable; native cards keep show-pending.
  //   hide-all     : every non-owner card stays hidden until proven playable.
  const policy = getCardLivenessPolicy();
  const isForeign = card.dataset.foreign === "true";
  const hideUntilVerified =
    policy === "hide-all" || (policy === "hide-foreign" && isForeign);

  // Default policy: hide only once every source has come back dead.
  const confirmedDead =
    !cdnHealthy && !streamHealthy && !cdnPending && !streamPending;

  let shouldHide;
  if (!hideUntilVerified) {
    shouldHide = confirmedDead;
  } else if (cdnHealthy || streamHealthy) {
    shouldHide = false; // proven playable → show
  } else if (cdnPending) {
    // Still waiting on the FAST, reliable CDN probe (~4s) — keep it hidden so a
    // dead foreign card never flashes in.
    shouldHide = true;
  } else {
    // CDN is resolved dead (or absent) and the only remaining signal is the slow,
    // unreliable WebTorrent swarm probe (20s + 5min cache). Do NOT bury the card
    // behind it — a live-but-slow P2P video is indistinguishable from a dead one
    // until that probe finishes, and burying live content is worse than a brief
    // flash. Fall back to show-pending for the stream: show while it's checked,
    // hide only once it too is confirmed dead.
    shouldHide = !streamHealthy && !streamPending;
  }

  if (shouldHide) {
    if (!card.hidden) {
      card.hidden = true;
    }
    if (card.dataset.sourceVisibility !== "hidden") {
      card.dataset.sourceVisibility = "hidden";
    }
    return;
  }

  if (card.hidden) {
    card.hidden = false;
  }
  if (card.dataset.sourceVisibility !== "visible") {
    card.dataset.sourceVisibility = "visible";
  }
}
