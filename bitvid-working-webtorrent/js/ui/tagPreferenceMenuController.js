import { TAG_PREFERENCE_ACTIONS, applyTagPreferenceMenuState, createTagPreferenceMenu } from "./components/tagPreferenceMenu.js";
import { devLogger, userLogger } from "../utils/logger.js";

export default class TagPreferenceMenuController {
  constructor({ services = {}, callbacks = {}, helpers = {} } = {}) {
    this.services = services;
    this.callbacks = callbacks;
    this.helpers = helpers;

    this.popovers = new Map();
    this.publishInFlight = false;
    this.publishPromise = null;
  }

  ensurePopover(detail = {}) {
    const triggerCandidate = detail?.trigger || null;
    const trigger =
      triggerCandidate && triggerCandidate.nodeType === 1 ? triggerCandidate : null;
    const rawTag = typeof detail?.tag === "string" ? detail.tag : "";
    const tag = rawTag.trim();

    if (!trigger || !tag) {
      return null;
    }

    let entry = this.popovers.get(trigger);

    const render = ({ document: documentRef, close }) => {
      const menu = createTagPreferenceMenu({
        document: documentRef,
        tag: entry.tag,
        isLoggedIn: this.callbacks.isLoggedIn(),
        membership: this.callbacks.getMembership(entry.tag),
        designSystem: this.helpers.getDesignSystem
          ? this.helpers.getDesignSystem()
          : null,
        onAction: (action, actionDetail = {}) => {
          void this.handleMenuAction(action, {
            tag: entry.tag,
            trigger,
            video: entry.video || null,
            closePopover: close,
            actionDetail,
          });
        },
      });

      if (!menu?.panel) {
        return null;
      }

      entry.panel = menu.panel;
      entry.buttons = menu.buttons;
      return menu.panel;
    };

    if (!entry) {
      entry = {
        trigger,
        tag,
        context: detail.context || "",
        video: detail.video || null,
        panel: null,
        buttons: null,
        popover: null,
      };

      const ownerDocument =
        trigger.ownerDocument || (typeof document !== "undefined" ? document : null);

      const popover = this.helpers.createPopover(trigger, render, {
        document: ownerDocument,
        placement: "bottom-start",
        restoreFocusOnClose: true,
      });

      if (!popover) {
        return null;
      }

      const originalDestroy = popover.destroy?.bind(popover);
      if (typeof originalDestroy === "function") {
        popover.destroy = (...args) => {
          originalDestroy(...args);
          if (this.popovers.get(trigger) === entry) {
            this.popovers.delete(trigger);
          }
        };
      }

      entry.popover = popover;
      this.popovers.set(trigger, entry);
    } else {
      entry.tag = tag;
      entry.context = detail.context || entry.context || "";
      entry.video = detail.video || entry.video || null;
    }

    return entry;
  }

  requestMenu(detail = {}) {
    const entry = this.ensurePopover(detail);
    if (!entry?.popover) {
      return;
    }

    const popover = entry.popover;
    const restoreFocus = detail.restoreFocus !== false;

    if (typeof popover.isOpen === "function" && popover.isOpen()) {
      popover.close({ restoreFocus });
      return;
    }

    this.closeMenus({
      restoreFocus: false,
      skipTrigger: entry.trigger,
    });

    // Notify app to close other menus
    if (this.callbacks.onMenuOpen) {
      this.callbacks.onMenuOpen(entry.trigger);
    }

    popover
      .open()
      .then(() => {
        this.refreshActiveMenus();
      })
      .catch((error) =>
        userLogger.error("[TagPreferenceMenu] Failed to open popover:", error),
      );
  }

  closeMenus(detail = {}) {
    const triggerCandidate = detail?.trigger || null;
    const trigger =
      triggerCandidate && triggerCandidate.nodeType === 1 ? triggerCandidate : null;
    const restoreFocus = detail?.restoreFocus !== false;
    const skipTrigger = detail?.skipTrigger || null;

    if (trigger) {
      const entry = this.popovers.get(trigger);
      if (entry?.popover && typeof entry.popover.close === "function") {
        return entry.popover.close({ restoreFocus });
      }
      return false;
    }

    let closed = false;
    this.popovers.forEach((entry, key) => {
      if (!entry?.popover || typeof entry.popover.close !== "function") {
        return;
      }
      if (skipTrigger && key === skipTrigger) {
        return;
      }
      const result = entry.popover.close({ restoreFocus });
      closed = closed || result;
    });
    return closed;
  }

  persistPreferencesFromMenu() {
    const service = this.services.hashtagPreferences;
    const publish =
      service && typeof service.publish === "function" ? service.publish : null;

    const describe = this.callbacks.describeError;

    if (!publish) {
      const message =
        typeof describe === "function"
          ? describe(null, {
              fallbackMessage: "Hashtag preferences are unavailable right now.",
            })
          : "Hashtag preferences are unavailable right now.";

      if (this.callbacks.showError) {
        this.callbacks.showError(message);
      }
      const error = new Error(message);
      error.code = "service-unavailable";
      return Promise.reject(error);
    }

    if (this.publishInFlight) {
      return this.publishPromise;
    }

    const pubkey = this.callbacks.getPubkey ? this.callbacks.getPubkey() : null;
    const payload = pubkey ? { pubkey } : {};

    this.publishInFlight = true;

    const publishPromise = (async () => {
      try {
        return await publish.call(service, payload);
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error || ""));
        if (!failure.code) {
          failure.code = "hashtag-preferences-publish-failed";
        }

        if (this.callbacks.showError) {
          const message =
            typeof describe === "function"
              ? describe(failure, { operation: "update" })
              : failure.message || "Failed to update preferences.";
          this.callbacks.showError(message);
        }
        throw failure;
      } finally {
        this.publishInFlight = false;
        this.publishPromise = null;
      }
    })();

    this.publishPromise = publishPromise;
    return publishPromise;
  }

  async handleMenuAction(action, detail = {}) {
    const tag = typeof detail?.tag === "string" ? detail.tag : "";
    if (!tag) {
      return;
    }

    const service = this.services.hashtagPreferences;
    if (!service) {
      return;
    }

    let result = false;
    try {
      switch (action) {
        case TAG_PREFERENCE_ACTIONS.ADD_INTEREST:
          result = await service.addInterest(tag);
          break;
        case TAG_PREFERENCE_ACTIONS.REMOVE_INTEREST:
          result = await service.removeInterest(tag);
          break;
        case TAG_PREFERENCE_ACTIONS.ADD_DISINTEREST:
          result = await service.addDisinterest(tag);
          break;
        case TAG_PREFERENCE_ACTIONS.REMOVE_DISINTEREST:
          result = await service.removeDisinterest(tag);
          break;
        default:
          userLogger.warn(`[TagPreferenceMenu] Unhandled action: ${action}`);
          return;
      }
    } catch (error) {
      devLogger.error(
        "[TagPreferenceMenuController] Failed to mutate hashtag preference via menu:",
        error,
      );
      if (this.callbacks.showError) {
        const describe = this.callbacks.describeError;
        const message =
          typeof describe === "function"
            ? describe(error, { operation: "update" })
            : "Failed to update hashtag preferences.";
        this.callbacks.showError(message);
      }
      return;
    }

    if (!result) {
      return;
    }

    if (this.callbacks.onPreferenceUpdate) {
      this.callbacks.onPreferenceUpdate();
    }

    try {
      await this.persistPreferencesFromMenu();
    } catch (error) {
      return;
    }

    if (this.callbacks.onPreferenceUpdate) {
      this.callbacks.onPreferenceUpdate();
    }

    if (typeof detail?.closePopover === "function") {
      detail.closePopover({ restoreFocus: false });
    }
  }

  handleActivation(detail = {}) {
    const tag = typeof detail?.tag === "string" ? detail.tag : "";
    if (!tag) {
      return;
    }

    const triggerCandidate = detail?.trigger || null;
    const trigger =
      triggerCandidate && triggerCandidate.nodeType === 1 ? triggerCandidate : null;
    if (!trigger) {
      return;
    }

    if (detail?.event) {
      detail.event.preventDefault?.();
      detail.event.stopPropagation?.();
    }

    this.requestMenu({
      trigger,
      tag,
      context: detail?.context || "",
      video: detail?.video || null,
    });
  }

  refreshActiveMenus() {
    if (!this.popovers) {
      return;
    }

    const isLoggedIn = this.callbacks.isLoggedIn();
    this.popovers.forEach((entry) => {
      if (!entry) {
        return;
      }

      const buttons = entry.buttons || {};
      if (!buttons || Object.keys(buttons).length === 0) {
        return;
      }

      try {
        applyTagPreferenceMenuState({
          buttons,
          membership: this.callbacks.getMembership(entry.tag),
          isLoggedIn,
        });
      } catch (error) {
        devLogger.warn(
          "[TagPreferenceMenuController] Failed to refresh tag preference menu state:",
          error,
        );
      }
    });
  }

  clear() {
    this.closeMenus({ restoreFocus: false });
    if (this.popovers) {
      this.popovers.clear();
    }
  }
}
