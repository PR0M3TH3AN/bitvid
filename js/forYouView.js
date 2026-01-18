import { getApplication } from "./applicationContext.js";
import { devLogger } from "./utils/logger.js";

const VIDEO_CARD_SELECTOR = "[data-component=\"video-card\"]";
const EMPTY_STATE_SELECTOR = "[data-for-you-empty-state]";
const LOADING_SELECTOR = ".sidebar-loading-wrapper";

class ForYouView {
  constructor({ document: doc = document } = {}) {
    this.document = doc;
    this.container = null;
    this.observer = null;
    this.handleContainerClick = this.handleContainerClick.bind(this);
    this.handleMutation = this.handleMutation.bind(this);
  }

  init() {
    this.container = this.document?.getElementById("videoList") || null;
    if (!this.container) {
      return;
    }

    this.container.addEventListener("click", this.handleContainerClick);
    this.observeContainer();
    this.updateEmptyState();
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

  handleContainerClick(event) {
    const target = event?.target instanceof HTMLElement ? event.target : null;
    const actionButton = target?.closest?.("[data-action=\"open-hashtag-preferences\"]");
    if (!(actionButton instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    this.openHashtagPreferences();
  }

  openHashtagPreferences() {
    const app = getApplication();
    if (app?.profileController && typeof app.profileController.show === "function") {
      app.profileController.show("hashtags");
      return;
    }

    devLogger.warn("[ForYouView] Profile modal controller unavailable.");
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
    wrapper.dataset.forYouEmptyState = "true";

    const card = this.document.createElement("div");
    card.className = "card p-lg text-center";

    const title = this.document.createElement("h3");
    title.className = "text-lg font-semibold text-text";
    title.textContent = "Your For You feed is empty";

    const copy = this.document.createElement("p");
    copy.className = "mt-2 text-sm text-muted";
    copy.textContent =
      "Add some interests to personalize your recommendations and start discovering videos.";

    const button = this.document.createElement("button");
    button.type = "button";
    button.className = "btn focus-ring mt-4";
    button.dataset.action = "open-hashtag-preferences";
    button.textContent = "Add interests";

    card.appendChild(title);
    card.appendChild(copy);
    card.appendChild(button);
    wrapper.appendChild(card);

    return wrapper;
  }
}

export function initForYouView() {
  const view = new ForYouView();
  view.init();
  return view;
}
