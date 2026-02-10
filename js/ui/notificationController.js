export default class NotificationController {
  constructor({
    portal,
    errorContainer,
    successContainer,
    statusContainer,
    loggers = {},
    documentRef = typeof document !== "undefined" ? document : null,
    windowRef = typeof window !== "undefined" ? window : null,
  } = {}) {
    this.portal = portal;
    this.errorContainer = errorContainer;
    this.successContainer = successContainer;
    this.statusContainer = statusContainer;
    this.statusMessage =
      this.statusContainer?.querySelector("[data-status-message]") || null;

    // Fallback loggers if not provided
    this.userLogger = loggers.userLogger || { error: console.error, warn: console.warn, log: console.log, info: console.info };
    this.devLogger = loggers.devLogger || { error: console.error, warn: console.warn, log: console.log, info: console.info };

    this.document = documentRef;
    this.window = windowRef;

    this.statusAutoHideHandle = null;
    this.errorAutoHideHandle = null;
    this.successAutoHideHandle = null;
  }

  updateNotificationPortalVisibility() {
    const portal = this.portal;
    const HTMLElementCtor =
      this.window?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!portal || !HTMLElementCtor || !(portal instanceof HTMLElementCtor)) {
      return;
    }

    const containers = [
      this.errorContainer,
      this.statusContainer,
      this.successContainer,
    ];

    const hasVisibleBanner = containers.some((container) => {
      if (!container || !(container instanceof HTMLElementCtor)) {
        return false;
      }
      return !container.classList.contains("hidden");
    });

    portal.classList.toggle("notification-portal--active", hasVisibleBanner);
  }

  showError(msg) {
    const container = this.errorContainer;
    const HTMLElementCtor =
      this.window?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!container || !HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
      if (msg) {
        this.userLogger.error(msg);
      }
      return;
    }

    if (this.errorAutoHideHandle) {
      this.window.clearTimeout(this.errorAutoHideHandle);
      this.errorAutoHideHandle = null;
    }

    if (!msg) {
      // Remove any content, then hide
      container.textContent = "";
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
      return;
    }

    // If there's a message, show it
    container.textContent = msg;
    container.classList.remove("hidden");
    this.updateNotificationPortalVisibility();

    this.userLogger.error(msg);

    // Optional auto-hide after 5 seconds
    if (this.window && typeof this.window.setTimeout === "function") {
      this.errorAutoHideHandle = this.window.setTimeout(() => {
        this.errorAutoHideHandle = null;
        if (container !== this.errorContainer) {
          return;
        }
        container.textContent = "";
        container.classList.add("hidden");
        this.updateNotificationPortalVisibility();
      }, 5000);
    }
  }

  showStatus(msg, options = {}) {
    const container = this.statusContainer;
    const messageTarget = this.statusMessage;
    const ownerDocument =
      this.document || (typeof document !== "undefined" ? document : null);
    const defaultView =
      this.window || (typeof window !== "undefined" ? window : null);
    const clearScheduler =
      defaultView?.clearTimeout ||
      (typeof clearTimeout === "function" ? clearTimeout : null);
    const schedule =
      defaultView?.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);

    if (this.statusAutoHideHandle && typeof clearScheduler === "function") {
      clearScheduler(this.statusAutoHideHandle);
      this.statusAutoHideHandle = null;
    }

    const HTMLElementCtor =
      defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!container || !HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
      return;
    }

    const { autoHideMs, showSpinner } =
      options && typeof options === "object" ? options : Object.create(null);

    const shouldShowSpinner = showSpinner !== false;
    const existingSpinner = container.querySelector(".status-spinner");

    if (shouldShowSpinner) {
      if (!(existingSpinner instanceof HTMLElementCtor)) {
        const spinner = ownerDocument?.createElement?.("span") || null;
        if (spinner) {
          spinner.className = "status-spinner";
          spinner.setAttribute("aria-hidden", "true");
          if (messageTarget && container.contains(messageTarget)) {
            container.insertBefore(spinner, messageTarget);
          } else {
            container.insertBefore(spinner, container.firstChild);
          }
        }
      }
    } else if (existingSpinner instanceof HTMLElementCtor) {
      existingSpinner.remove();
    }

    if (!msg) {
      if (messageTarget && messageTarget instanceof HTMLElementCtor) {
        messageTarget.textContent = "";
      }
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
      return;
    }

    if (messageTarget && messageTarget instanceof HTMLElementCtor) {
      messageTarget.textContent = msg;
    } else {
      container.textContent = msg;
    }
    container.classList.remove("hidden");
    this.updateNotificationPortalVisibility();

    if (
      Number.isFinite(autoHideMs) &&
      autoHideMs > 0 &&
      typeof schedule === "function"
    ) {
      const expectedText =
        messageTarget && messageTarget instanceof HTMLElementCtor
          ? messageTarget.textContent
          : container.textContent;
      this.statusAutoHideHandle = schedule(() => {
        this.statusAutoHideHandle = null;
        const activeContainer = this.statusContainer;
        if (activeContainer !== container) {
          return;
        }
        const activeMessageTarget =
          this.statusMessage && typeof this.statusMessage.textContent === "string"
            ? this.statusMessage
            : activeContainer;
        if (activeMessageTarget.textContent !== expectedText) {
          return;
        }
        if (activeMessageTarget === this.statusMessage) {
          this.statusMessage.textContent = "";
        } else {
          activeContainer.textContent = "";
        }
        activeContainer.classList.add("hidden");
        this.updateNotificationPortalVisibility();
      }, autoHideMs);
    }
  }

  showSuccess(msg) {
    const container = this.successContainer;
    const HTMLElementCtor =
      this.window?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    if (!container || !HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
      return;
    }

    if (this.successAutoHideHandle) {
      this.window.clearTimeout(this.successAutoHideHandle);
      this.successAutoHideHandle = null;
    }

    if (!msg) {
      container.textContent = "";
      container.classList.add("hidden");
      this.updateNotificationPortalVisibility();
      return;
    }

    container.textContent = msg;
    container.classList.remove("hidden");
    this.updateNotificationPortalVisibility();

    if (this.window && typeof this.window.setTimeout === "function") {
      this.successAutoHideHandle = this.window.setTimeout(() => {
        this.successAutoHideHandle = null;
        if (container !== this.successContainer) {
          return;
        }
        container.textContent = "";
        container.classList.add("hidden");
        this.updateNotificationPortalVisibility();
      }, 5000);
    }
  }

  destroy() {
    if (this.window && typeof this.window.clearTimeout === "function") {
      if (this.statusAutoHideHandle) {
        this.window.clearTimeout(this.statusAutoHideHandle);
        this.statusAutoHideHandle = null;
      }
      if (this.errorAutoHideHandle) {
        this.window.clearTimeout(this.errorAutoHideHandle);
        this.errorAutoHideHandle = null;
      }
      if (this.successAutoHideHandle) {
        this.window.clearTimeout(this.successAutoHideHandle);
        this.successAutoHideHandle = null;
      }
    }

    this.portal = null;
    this.errorContainer = null;
    this.successContainer = null;
    this.statusContainer = null;
    this.statusMessage = null;
  }
}
