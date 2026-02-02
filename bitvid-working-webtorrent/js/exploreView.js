import { attachFeedInfoPopover } from "./ui/components/FeedInfoPopover.js";

const VIDEO_CARD_SELECTOR = "[data-component=\"video-card\"]";
const EMPTY_STATE_SELECTOR = "[data-explore-empty-state]";
const LOADING_SELECTOR = ".sidebar-loading-wrapper";

class ExploreView {
  constructor({ document: doc = document } = {}) {
    this.document = doc;
    this.container = null;
    this.observer = null;
    this.handleMutation = this.handleMutation.bind(this);
  }

  init() {
    this.container = this.document?.getElementById("videoList") || null;
    if (!this.container) {
      return;
    }

    this.observeContainer();
    this.updateEmptyState();

    const infoTrigger = this.document.getElementById("exploreInfoTrigger");
    if (infoTrigger) {
      attachFeedInfoPopover(
        infoTrigger,
        "Explore scores videos using freshness, engagement, and diversity signals to surface a balanced mix."
      );
    }
  }

  observeContainer() {
    if (!this.container || typeof MutationObserver === "undefined") {
      return;
    }

    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver(this.handleMutation);
    this.observer.observe(this.container, {
      childList: true,
      subtree: true,
    });
  }

  handleMutation() {
    this.updateEmptyState();
  }

  updateEmptyState() {
    if (!this.container) {
      return;
    }

    const hasVideos = Boolean(this.container.querySelector(VIDEO_CARD_SELECTOR));
    const isLoading = Boolean(this.container.querySelector(LOADING_SELECTOR));
    const existingEmptyState = this.container.querySelector(EMPTY_STATE_SELECTOR);

    if (isLoading) {
      if (existingEmptyState) {
        existingEmptyState.remove();
      }
      return;
    }

    if (hasVideos) {
      if (existingEmptyState) {
        existingEmptyState.remove();
      }
      return;
    }

    if (existingEmptyState) {
      return;
    }

    const emptyState = this.buildEmptyState();
    if (emptyState) {
      this.container.innerHTML = "";
      this.container.appendChild(emptyState);
    }
  }

  buildEmptyState() {
    if (!this.document) {
      return null;
    }

    const wrapper = this.document.createElement("div");
    wrapper.className = "col-span-full";
    wrapper.dataset.exploreEmptyState = "true";

    const card = this.document.createElement("div");
    card.className = "card p-lg text-center";

    const title = this.document.createElement("h3");
    title.className = "text-lg font-semibold text-text";
    title.textContent = "Explore is empty right now";

    const copy = this.document.createElement("p");
    copy.className = "mt-2 text-sm text-muted";
    copy.textContent =
      "Check back soon for a fresh mix of videos across the network.";

    card.appendChild(title);
    card.appendChild(copy);
    wrapper.appendChild(card);

    return wrapper;
  }
}

export function initExploreView() {
  const view = new ExploreView();
  view.init();
  return view;
}
