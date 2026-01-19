import { devLogger as defaultLogger } from "../utils/logger.js";

export default class VideoListViewController {
  constructor({ getSidebarLoadingMarkup, environment = {}, logger } = {}) {
    this.getSidebarLoadingMarkup =
      typeof getSidebarLoadingMarkup === "function"
        ? getSidebarLoadingMarkup
        : () => "";

    this.document = environment.document || (typeof document !== "undefined" ? document : null);
    this.logger = logger || defaultLogger;
  }

  isElement(value) {
    return (
      typeof HTMLElement !== "undefined" && value instanceof HTMLElement
    );
  }

  mount({ container = null, view, currentVideoList = null, includeTags = true } = {}) {
    if (!view) {
      return { videoList: currentVideoList || null, popularTags: null };
    }

    const target = container || this.getElementById("videoList");
    let popularTags = null;
    if (includeTags) {
      popularTags = this.getElementById("recentVideoTags");
    }

    if (typeof view.setPopularTagsContainer === "function") {
      view.setPopularTagsContainer(popularTags || null);
    }

    view.mount(target || null);

    return {
      videoList: target || null,
      popularTags: popularTags || null,
    };
  }

  reinitialize({
    view,
    reason,
    postLoginResult,
    currentVideoList = null,
  } = {}) {
    if (!view) {
      return {
        videoList: currentVideoList || null,
        popularTags: null,
      };
    }

    const container =
      this.isElement(currentVideoList) && currentVideoList
        ? currentVideoList
        : this.getElementById("videoList");

    try {
      view.destroy();
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn(
          "[VideoListViewController] Failed to destroy VideoListView during reinitialization:",
          error,
        );
      }
    }

    const messageContext =
      reason === "login" && postLoginResult?.blocksLoaded !== false
        ? "Applying your filters…"
        : "Refreshing videos…";

    const tagsRoot = this.getElementById("recentVideoTags");
    if (typeof view.setPopularTagsContainer === "function") {
      view.setPopularTagsContainer(this.isElement(tagsRoot) ? tagsRoot : null);
    }

    if (this.isElement(container)) {
      container.innerHTML = this.getSidebarLoadingMarkup(messageContext);
    }

    return {
      videoList: this.isElement(container) ? container : null,
      popularTags: this.isElement(tagsRoot) ? tagsRoot : null,
    };
  }

  getElementById(id) {
    if (!this.document || typeof this.document.getElementById !== "function") {
      return null;
    }
    return this.document.getElementById(id) || null;
  }
}
