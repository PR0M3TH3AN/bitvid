import { devLogger as defaultLogger } from "../utils/logger.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./components/staticModalAccessibility.js";

const DEFAULT_LOGOUT_ERROR_MESSAGE = "Failed to logout. Please try again.";

export default class AppChromeController {
  constructor({
    elements = {},
    callbacks = {},
    utilities = {},
    environment = {},
    logger,
  } = {}) {
    this.elements = {
      logoutButton: this.normalizeElement(elements.logoutButton),
      profileButton: this.normalizeElement(elements.profileButton),
      uploadButton: this.normalizeElement(elements.uploadButton),
      loginButton: this.normalizeElement(elements.loginButton),
      closeLoginModalButton: this.normalizeElement(
        elements.closeLoginModalButton,
      ),
    };

    this.callbacks = {
      requestLogout: callbacks.requestLogout || null,
      showError: callbacks.showError || null,
      showProfileModal: callbacks.showProfileModal || null,
      openUploadModal: callbacks.openUploadModal || null,
      onLoginModalOpened: callbacks.onLoginModalOpened || null,
      onLoginModalClosed: callbacks.onLoginModalClosed || null,
      flushWatchHistory: callbacks.flushWatchHistory || null,
      cleanup: callbacks.cleanup || null,
      hideModal: callbacks.hideModal || null,
    };

    this.utilities = {
      prepareLoginModal:
        typeof utilities.prepareLoginModal === "function"
          ? utilities.prepareLoginModal
          : () => prepareStaticModal({ id: "loginModal" }) || document.getElementById("loginModal"),
      prepareApplicationModal:
        typeof utilities.prepareApplicationModal === "function"
          ? utilities.prepareApplicationModal
          : () => prepareStaticModal({ id: "nostrFormModal" }) || document.getElementById("nostrFormModal"),
      openModal:
        typeof utilities.openModal === "function"
          ? utilities.openModal
          : (modal, options) => openStaticModal(modal, options),
      closeModal:
        typeof utilities.closeModal === "function"
          ? utilities.closeModal
          : (modalId) => closeStaticModal(modalId),
    };

    this.document = environment.document || (typeof document !== "undefined" ? document : null);
    this.window = environment.window || (typeof window !== "undefined" ? window : null);
    this.logger = logger || defaultLogger;

    this.isInitialized = false;
    this.hasBoundGlobalEvents = false;

    this.boundElements = {
      logoutButton: null,
      profileButton: null,
      uploadButton: null,
      loginButton: null,
      closeLoginModalButton: null,
    };

    this.handleLogoutClick = async () => {
      try {
        if (typeof this.callbacks.requestLogout === "function") {
          await this.callbacks.requestLogout();
        }
      } catch (error) {
        if (this.logger?.error) {
          this.logger.error("Logout failed:", error);
        }
        if (typeof this.callbacks.showError === "function") {
          this.callbacks.showError(DEFAULT_LOGOUT_ERROR_MESSAGE);
        }
      }
    };

    this.handleProfileClick = () => {
      if (typeof this.callbacks.showProfileModal !== "function") {
        return;
      }

      Promise.resolve()
        .then(() => this.callbacks.showProfileModal())
        .catch((error) => {
          if (this.logger?.error) {
            this.logger.error("Failed to open profile modal:", error);
          }
        });
    };

    this.handleUploadClick = (event) => {
      if (typeof this.callbacks.openUploadModal !== "function") {
        return;
      }

      const triggerElement = this.getTriggerFromEvent(event);
      try {
        this.callbacks.openUploadModal({ triggerElement });
      } catch (error) {
        if (this.logger?.error) {
          this.logger.error("Failed to open upload modal:", error);
        }
      }
    };

    this.handleLoginClick = (event) => {
      if (this.logger?.log) {
        this.logger.log("Login button clicked!");
      }

      const triggerElement = this.getTriggerFromEvent(event);
      const loginModal =
        (typeof this.utilities.prepareLoginModal === "function"
          ? this.utilities.prepareLoginModal()
          : null) || null;

      if (
        loginModal &&
        typeof this.utilities.openModal === "function" &&
        this.utilities.openModal(loginModal, { triggerElement })
      ) {
        if (typeof this.callbacks.onLoginModalOpened === "function") {
          this.callbacks.onLoginModalOpened();
        }
      }
    };

    this.handleCloseLoginClick = () => {
      if (this.logger?.log) {
        this.logger.log("[app.js] closeLoginModal button clicked!");
      }

      if (typeof this.utilities.closeModal === "function") {
        const wasClosed = this.utilities.closeModal("loginModal");
        if (wasClosed && typeof this.callbacks.onLoginModalClosed === "function") {
          this.callbacks.onLoginModalClosed();
        }
      }
    };

    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handlePopstate = this.handlePopstate.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
  }

  initialize() {
    this.bindLogoutButton();
    this.bindProfileButton();
    this.bindUploadButton();
    this.bindLoginButton();
    this.bindCloseLoginButton();

    if (!this.hasBoundGlobalEvents) {
      this.bindGlobalEvents();
      this.hasBoundGlobalEvents = true;
    }

    this.isInitialized = true;
  }

  getTriggerFromEvent(event) {
    if (!event) {
      return null;
    }
    return event.currentTarget || event.target || null;
  }

  bindLogoutButton() {
    const button = this.normalizeElement(this.elements.logoutButton);
    if (this.boundElements.logoutButton === button) {
      return;
    }

    this.detachBoundElement("logoutButton", this.handleLogoutClick);

    if (button) {
      button.addEventListener("click", this.handleLogoutClick);
      this.boundElements.logoutButton = button;
    }
  }

  bindProfileButton() {
    const button = this.normalizeElement(this.elements.profileButton);
    if (this.boundElements.profileButton === button) {
      return;
    }

    this.detachBoundElement("profileButton", this.handleProfileClick);

    if (button) {
      button.addEventListener("click", this.handleProfileClick);
      this.boundElements.profileButton = button;
    }
  }

  bindUploadButton() {
    const button = this.normalizeElement(this.elements.uploadButton);
    if (this.boundElements.uploadButton === button) {
      return;
    }

    this.detachBoundElement("uploadButton", this.handleUploadClick);

    if (button) {
      button.addEventListener("click", this.handleUploadClick);
      this.boundElements.uploadButton = button;
    }
  }

  bindLoginButton() {
    const button = this.normalizeElement(this.elements.loginButton);
    if (this.boundElements.loginButton === button) {
      return;
    }

    this.detachBoundElement("loginButton", this.handleLoginClick);

    if (button) {
      button.addEventListener("click", this.handleLoginClick);
      this.boundElements.loginButton = button;
    }
  }

  bindCloseLoginButton() {
    const button = this.normalizeElement(this.elements.closeLoginModalButton);
    if (this.boundElements.closeLoginModalButton === button) {
      return;
    }

    this.detachBoundElement("closeLoginModalButton", this.handleCloseLoginClick);

    if (button) {
      button.addEventListener("click", this.handleCloseLoginClick);
      this.boundElements.closeLoginModalButton = button;
    }
  }

  setElements(nextElements = {}) {
    if (!nextElements || typeof nextElements !== "object") {
      return;
    }

    const keys = [
      "logoutButton",
      "profileButton",
      "uploadButton",
      "loginButton",
      "closeLoginModalButton",
    ];

    let shouldRebind = false;

    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(nextElements, key)) {
        const normalized = this.normalizeElement(nextElements[key]);
        if (this.elements[key] !== normalized) {
          this.elements[key] = normalized;
          shouldRebind = true;
        }
      }
    }

    if (shouldRebind) {
      this.initialize();
    }
  }

  detachBoundElement(key, handler) {
    const previous = this.boundElements[key];
    if (previous && typeof previous.removeEventListener === "function") {
      previous.removeEventListener("click", handler);
    }
    this.boundElements[key] = null;
  }

  normalizeElement(element) {
    if (!element || typeof element.addEventListener !== "function") {
      return null;
    }
    return element;
  }

  bindGlobalEvents() {
    if (this.window && typeof this.window.addEventListener === "function") {
      this.window.addEventListener("beforeunload", this.handleBeforeUnload);
      this.window.addEventListener("popstate", this.handlePopstate);
    }

    if (this.document && typeof this.document.addEventListener === "function") {
      this.document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.document.addEventListener("click", this.handleDocumentClick);
    }
  }

  handleBeforeUnload() {
    if (typeof this.callbacks.flushWatchHistory === "function") {
      Promise.resolve()
        .then(() => this.callbacks.flushWatchHistory("session-end", "beforeunload"))
        .catch((error) => {
          if (this.logger?.warn) {
            this.logger.warn("[beforeunload] Watch history flush failed:", error);
          }
        });
    }

    if (typeof this.callbacks.cleanup === "function") {
      Promise.resolve()
        .then(() => this.callbacks.cleanup())
        .catch((error) => {
          if (this.logger?.error) {
            this.logger.error("Cleanup before unload failed:", error);
          }
        });
    }
  }

  handleVisibilityChange() {
    if (!this.document || this.document.visibilityState !== "hidden") {
      return;
    }

    if (typeof this.callbacks.flushWatchHistory !== "function") {
      return;
    }

    Promise.resolve()
      .then(() => this.callbacks.flushWatchHistory("session-end", "visibilitychange"))
      .catch((error) => {
        if (this.logger?.warn) {
          this.logger.warn("[visibilitychange] Watch history flush failed:", error);
        }
      });
  }

  async handlePopstate() {
    if (this.logger?.log) {
      this.logger.log("[popstate] user navigated back/forward; cleaning modal...");
    }

    if (typeof this.callbacks.hideModal !== "function") {
      return;
    }

    try {
      await this.callbacks.hideModal();
    } catch (error) {
      if (this.logger?.warn) {
        this.logger.warn("[popstate] Failed to hide modal:", error);
      }
    }
  }

  handleDocumentClick(event) {
    if (!event?.target || event.target.id !== "openApplicationModal") {
      return;
    }

    if (typeof this.utilities.closeModal === "function") {
      const closed = this.utilities.closeModal("loginModal");
      if (closed && typeof this.callbacks.onLoginModalClosed === "function") {
        this.callbacks.onLoginModalClosed();
      }
    }

    if (typeof this.utilities.prepareApplicationModal !== "function") {
      return;
    }

    const applicationModal = this.utilities.prepareApplicationModal();
    if (
      applicationModal &&
      typeof this.utilities.openModal === "function"
    ) {
      this.utilities.openModal(applicationModal, {
        triggerElement: event.target,
      });
    }
  }
}
