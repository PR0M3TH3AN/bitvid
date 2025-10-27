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
      logoutButton: elements.logoutButton || null,
      profileButton: elements.profileButton || null,
      uploadButton: elements.uploadButton || null,
      loginButton: elements.loginButton || null,
      closeLoginModalButton: elements.closeLoginModalButton || null,
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

    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handlePopstate = this.handlePopstate.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
  }

  initialize() {
    if (this.isInitialized) {
      return;
    }

    this.bindLogoutButton();
    this.bindProfileButton();
    this.bindUploadButton();
    this.bindLoginButton();
    this.bindCloseLoginButton();
    this.bindGlobalEvents();

    this.isInitialized = true;
  }

  getTriggerFromEvent(event) {
    if (!event) {
      return null;
    }
    return event.currentTarget || event.target || null;
  }

  bindLogoutButton() {
    const { logoutButton } = this.elements;
    if (!logoutButton || typeof logoutButton.addEventListener !== "function") {
      return;
    }

    logoutButton.addEventListener("click", async () => {
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
    });
  }

  bindProfileButton() {
    const { profileButton } = this.elements;
    if (!profileButton || typeof profileButton.addEventListener !== "function") {
      return;
    }

    profileButton.addEventListener("click", () => {
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
    });
  }

  bindUploadButton() {
    const { uploadButton } = this.elements;
    if (!uploadButton || typeof uploadButton.addEventListener !== "function") {
      return;
    }

    uploadButton.addEventListener("click", (event) => {
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
    });
  }

  bindLoginButton() {
    const { loginButton } = this.elements;
    if (!loginButton || typeof loginButton.addEventListener !== "function") {
      return;
    }

    loginButton.addEventListener("click", (event) => {
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
    });
  }

  bindCloseLoginButton() {
    const { closeLoginModalButton } = this.elements;
    if (
      !closeLoginModalButton ||
      typeof closeLoginModalButton.addEventListener !== "function"
    ) {
      return;
    }

    closeLoginModalButton.addEventListener("click", () => {
      if (this.logger?.log) {
        this.logger.log("[app.js] closeLoginModal button clicked!");
      }

      if (typeof this.utilities.closeModal === "function") {
        const wasClosed = this.utilities.closeModal("loginModal");
        if (wasClosed && typeof this.callbacks.onLoginModalClosed === "function") {
          this.callbacks.onLoginModalClosed();
        }
      }
    });
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
