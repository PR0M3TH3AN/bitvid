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

  const shouldHide =
    !cdnHealthy &&
    !streamHealthy &&
    !cdnPending &&
    !streamPending;

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
