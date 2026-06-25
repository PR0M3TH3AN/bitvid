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
  if (policy === "hide-all") {
    return true;
  }
  if (policy === "hide-foreign") {
    return card.dataset.foreign === "true";
  }
  return false;
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

  const shouldHide = hideUntilVerified
    ? // Hidden until at least one source proves playable (covers the pending
      // window too, so a dead foreign stranger never flashes in).
      !cdnHealthy && !streamHealthy
    : // Default: only hide once every source has come back dead.
      !cdnHealthy && !streamHealthy && !cdnPending && !streamPending;

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
