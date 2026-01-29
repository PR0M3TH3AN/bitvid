import createPopoverDefault from "./overlay/popoverEngine.js";
import { createVideoSettingsMenuPanel as createVideoSettingsMenuPanelDefault } from "./components/videoMenuRenderers.js";
import { userLogger } from "../utils/logger.js";
import { normalizeDesignSystemContext } from "../designSystem.js";

export default class VideoSettingsMenuController {
  constructor(options = {}) {
    const {
      designSystem = null,
      isDevMode = false,
      createPopover = createPopoverDefault,
      createVideoSettingsMenuPanel = createVideoSettingsMenuPanelDefault,
    } = options;

    this.createPopover = createPopover;
    this.createVideoSettingsMenuPanel = createVideoSettingsMenuPanel;
    this.designSystem = normalizeDesignSystemContext(designSystem);
    this.isDevMode = Boolean(isDevMode);
    this.popovers = new Map();
  }

  ensurePopover(detail = {}) {
    const trigger = detail.trigger || null;
    if (!trigger) {
      return null;
    }

    let entry = this.popovers.get(trigger);
    if (!entry) {
      entry = {
        trigger,
        context: {
          card: detail.card || null,
          video: detail.video || null,
          index: Number.isFinite(detail.index) ? Math.floor(detail.index) : 0,
          capabilities: detail.capabilities || {},
          restoreFocusOnClose: detail.restoreFocus !== false,
        },
        popover: null,
      };

      const render = ({ document: documentRef, close }) => {
        const panel = this.createVideoSettingsMenuPanel({
          document: documentRef,
          video: entry.context.video,
          index: entry.context.index,
          capabilities: entry.context.capabilities,
          designSystem: this.designSystem,
        });

        if (!panel) {
          return null;
        }

        const buttons = panel.querySelectorAll("button[data-action]");
        buttons.forEach((button) => {
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            const action = button.dataset.action || "";
            const handled = entry.context.card?.handleSettingsMenuAction?.(
              action,
              { event },
            );

            if (!handled && this.isDevMode) {
              userLogger.warn(`[SettingsMenu] Unhandled action: ${action}`);
            }

            close();
          });
        });

        return panel;
      };

      const documentRef =
        trigger.ownerDocument ||
        (typeof document !== "undefined" ? document : null);

      const popover = this.createPopover(trigger, render, {
        document: documentRef,
        placement: "bottom-end",
      });

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
    }

    entry.context = {
      ...entry.context,
      card: detail.card || entry.context.card,
      video: detail.video || entry.context.video,
      index: Number.isFinite(detail.index)
        ? Math.floor(detail.index)
        : entry.context.index,
      capabilities: detail.capabilities || entry.context.capabilities,
      restoreFocusOnClose: detail.restoreFocus !== false,
    };

    return entry;
  }

  requestMenu(detail = {}) {
    const entry = this.ensurePopover(detail);
    if (!entry?.popover) {
      return;
    }

    if (typeof entry.popover.isOpen === "function" && entry.popover.isOpen()) {
      entry.popover.close({
        restoreFocus: entry.context.restoreFocusOnClose !== false,
      });
      return;
    }

    entry.popover
      .open()
      .catch((error) =>
        userLogger.error("[SettingsMenu] Failed to open popover:", error),
      );
  }

  closeMenu(detail = {}) {
    const trigger = detail.trigger || null;
    const restoreFocus = detail.restoreFocus !== false;

    if (trigger) {
      const entry = this.popovers.get(trigger);
      if (entry?.popover && typeof entry.popover.close === "function") {
        return entry.popover.close({ restoreFocus });
      }
      return false;
    }

    return this.closeAll({ restoreFocus });
  }

  closeAll(options = {}) {
    let closed = false;
    const restoreFocus = options?.restoreFocus !== false;

    this.popovers.forEach((entry) => {
      if (entry?.popover && typeof entry.popover.close === "function") {
        const result = entry.popover.close({ restoreFocus });
        closed = closed || result;
      }
    });
    return closed;
  }

  destroy() {
    this.popovers.forEach((entry) => {
        if (entry?.popover && typeof entry.popover.destroy === "function") {
            entry.popover.destroy();
        }
    });
    this.popovers.clear();
  }
}
