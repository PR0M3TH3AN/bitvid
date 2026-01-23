import { userLogger } from "../../utils/logger.js";
import { collectVideoTags } from "../../utils/videoTags.js";
import {
  applyTagPreferenceState,
  renderTagPillStrip,
  trimTagPillStripToFit,
} from "./tagPillList.js";

export class HashtagStripHelper {
  constructor({
    document: doc = null,
    window: win = null,
    logger,
    context = "",
    scrollable = false,
  } = {}) {
    this.document = doc || (typeof document !== "undefined" ? document : null);
    this.window = win || this.document?.defaultView ||
      (typeof window !== "undefined" ? window : null);
    this.logger = logger || userLogger;
    this.context = typeof context === "string" ? context : "";
    this.scrollable = scrollable === true;

    this.container = null;
    this._tagStrip = null;
    this._sortedTags = [];
    this._resizeObserver = null;
    this._resizeHandler = null;
    this._resizeCancel = null;
    this._resizeScheduled = false;
    this._isApplyingTrim = false;

    this.tagStateResolver = null;
    this.activateHandler = null;

    this._handleResize = () => {
      if (this._isApplyingTrim) {
        return;
      }
      this.render();
    };
  }

  mount(container) {
    if (this.container === container) {
      return this.container;
    }

    this._teardownResizeObserver();

    if (this.container && this.container !== container) {
      this.container.textContent = "";
      this.container.hidden = true;
    }

    this.container = container || null;
    this._tagStrip = null;

    if (this.container) {
      this.container.textContent = "";
      this.container.hidden = true;
      if (this._sortedTags.length) {
        this.render();
        this._ensureResizeObserver();
      }
    }

    return this.container;
  }

  update(videos) {
    const root = this.container;
    if (!root) {
      return;
    }

    if (!Array.isArray(videos) || videos.length === 0) {
      this._sortedTags = [];
      this.render();
      this._teardownResizeObserver();
      return;
    }

    const counts = new Map();
    const displayNames = new Map();

    videos.forEach((video) => {
      const tags = collectVideoTags(video);
      tags.forEach((tag) => {
        if (typeof tag !== "string" || !tag) {
          return;
        }
        const lower = tag.toLowerCase();
        counts.set(lower, (counts.get(lower) || 0) + 1);
        if (!displayNames.has(lower)) {
          displayNames.set(lower, tag);
        }
      });
    });

    if (!counts.size) {
      this._sortedTags = [];
      this.render();
      this._teardownResizeObserver();
      return;
    }

    const tagEntries = Array.from(counts.entries()).map(([lower, count]) => ({
      count,
      tag: displayNames.get(lower) || lower,
    }));

    tagEntries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      const lowerA = a.tag.toLowerCase();
      const lowerB = b.tag.toLowerCase();
      if (lowerA === lowerB) {
        return a.tag.localeCompare(b.tag);
      }
      return lowerA.localeCompare(lowerB);
    });

    this._sortedTags = tagEntries.map((entry) => entry.tag);
    this.render();
    if (this._sortedTags.length) {
      this._ensureResizeObserver();
    } else {
      this._teardownResizeObserver();
    }
  }

  setTagStateResolver(resolver) {
    this.tagStateResolver = typeof resolver === "function" ? resolver : null;
    this.refreshTagStates();
  }

  setActivateHandler(handler) {
    this.activateHandler = typeof handler === "function" ? handler : null;
  }

  setContext(context) {
    this.context = typeof context === "string" ? context : "";
  }

  refreshTagPreferenceStates() {
    this.refreshTagStates();
  }

  refreshTagStates() {
    if (!this._tagStrip) {
      return;
    }

    const buttons = this._tagStrip.querySelectorAll("button[data-tag]");
    buttons.forEach((button) => {
      const tag = button.dataset.tag || "";
      const state = this._resolveTagState(tag);
      applyTagPreferenceState(button, state);
    });
  }

  render() {
    const root = this.container;
    if (!root) {
      return;
    }

    const tags = Array.isArray(this._sortedTags) ? [...this._sortedTags] : [];

    this._isApplyingTrim = true;

    try {
      root.textContent = "";
      this._tagStrip = null;

      if (!tags.length) {
        root.hidden = true;
        return;
      }

      const doc = this.document || root.ownerDocument || null;
      if (!doc) {
        root.hidden = true;
        this._teardownResizeObserver();
        return;
      }

      const { root: strip } = renderTagPillStrip({
        document: doc,
        tags,
        onTagActivate: (tag, detail = {}) =>
          this._handleTagActivate(tag, detail),
        getTagState: (tag) => this._resolveTagState(tag),
        scrollable: this.scrollable,
      });

      root.appendChild(strip);
      this._tagStrip = strip;
      if (!this.scrollable) {
        trimTagPillStripToFit({ strip, container: root });
      }
      root.hidden = strip.childElementCount === 0;
    } finally {
      this._isApplyingTrim = false;
    }
  }

  destroy() {
    this._teardownResizeObserver();
    if (this.container) {
      this.container.textContent = "";
      this.container.hidden = true;
    }
    this.container = null;
    this._tagStrip = null;
    this._sortedTags = [];
    this.tagStateResolver = null;
    this.activateHandler = null;
  }

  _resolveTagState(tag) {
    const resolver = this.tagStateResolver;
    if (typeof resolver !== "function") {
      return "neutral";
    }

    try {
      return resolver(tag);
    } catch (error) {
      this.logger?.warn?.(
        "[HashtagStripHelper] Failed to resolve tag preference state:",
        error,
      );
      return "neutral";
    }
  }

  _handleTagActivate(tag, detail) {
    if (typeof this.activateHandler !== "function") {
      return;
    }

    try {
      this.activateHandler({
        tag,
        trigger: detail?.button || null,
        context: this.context,
      });
    } catch (error) {
      this.logger?.warn?.(
        "[HashtagStripHelper] Tag activation handler threw an error:",
        error,
      );
    }
  }

  _ensureResizeObserver() {
    const root = this.container;
    if (!root || this._resizeObserver || this._resizeHandler) {
      return;
    }

    const resizeObserverCtor =
      (this.window && this.window.ResizeObserver) ||
      (typeof globalThis !== "undefined" ? globalThis.ResizeObserver : null);

    if (typeof resizeObserverCtor === "function") {
      this._resizeObserver = new resizeObserverCtor(() => {
        this._handleResize();
      });
      this._resizeObserver.observe(root);
      return;
    }

    if (!this.window) {
      return;
    }

    const schedule = (callback) => {
      if (this._resizeScheduled) {
        return;
      }
      this._resizeScheduled = true;

      if (typeof this.window.requestAnimationFrame === "function") {
        const frameId = this.window.requestAnimationFrame(() => {
          this._resizeScheduled = false;
          this._resizeCancel = null;
          callback();
        });
        this._resizeCancel = () => {
          this.window.cancelAnimationFrame(frameId);
          this._resizeCancel = null;
          this._resizeScheduled = false;
        };
      } else {
        const timeoutId = this.window.setTimeout(() => {
          this._resizeScheduled = false;
          this._resizeCancel = null;
          callback();
        }, 50);
        this._resizeCancel = () => {
          this.window.clearTimeout(timeoutId);
          this._resizeCancel = null;
          this._resizeScheduled = false;
        };
      }
    };

    const handler = () => {
      schedule(() => {
        if (!this.container) {
          return;
        }
        this._handleResize();
      });
    };

    this.window.addEventListener("resize", handler);
    this._resizeHandler = handler;
  }

  _teardownResizeObserver() {
    if (this._resizeObserver) {
      try {
        this._resizeObserver.disconnect();
      } catch (error) {
        // Ignore disconnect errors.
      }
    }
    this._resizeObserver = null;

    if (this._resizeHandler && this.window) {
      this.window.removeEventListener("resize", this._resizeHandler);
    }
    this._resizeHandler = null;

    if (typeof this._resizeCancel === "function") {
      try {
        this._resizeCancel();
      } catch (error) {
        // Ignore cancellation errors.
      }
    }
    this._resizeCancel = null;
    this._resizeScheduled = false;
  }
}
