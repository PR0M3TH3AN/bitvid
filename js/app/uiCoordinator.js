// js/app/uiCoordinator.js

/**
 * UI State and Chrome management.
 *
 * All module-level dependencies are injected from the Application
 * composition root rather than imported at module scope.
 *
 * Methods use `this` which is bound to the Application instance.
 */
import { SHORT_TIMEOUT_MS, DEBOUNCE_DELAY_MS } from "../constants.js";

export function createUiCoordinator(deps) {
  const {
    devLogger,
  } = deps;

  return {
    dispatchAuthLoadingState(detail = {}) {
      if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
        return false;
      }

      try {
        const payload = { ...(typeof detail === "object" && detail ? detail : {}) };
        window.dispatchEvent(new CustomEvent("bitvid:auth-loading-state", { detail: payload }));
        return true;
      } catch (error) {
        devLogger.warn("[Application] Failed to dispatch auth loading state:", error);
        return false;
      }
    },

    updateAuthLoadingState(partial = {}) {
      const baseState =
        this.authLoadingState && typeof this.authLoadingState === "object"
          ? this.authLoadingState
          : { profile: "idle", lists: "idle", dms: "idle" };
      const nextState = {
        ...baseState,
        ...(partial && typeof partial === "object" ? partial : {}),
      };
      this.authLoadingState = nextState;

      const root = typeof document !== "undefined" ? document.documentElement : null;
      if (root) {
        root.dataset.authProfileLoading = nextState.profile || "idle";
        root.dataset.authListsLoading = nextState.lists || "idle";
        root.dataset.authDmsLoading = nextState.dms || "idle";
      }

      this.dispatchAuthLoadingState(nextState);
      return nextState;
    },

    updateActiveProfileUI(pubkey, profile = {}) {
      if (this.profileController) {
        this.profileController.handleProfileUpdated({
          pubkey,
          profile,
        });
        return;
      }

      const picture = profile.picture || "assets/svg/default-profile.svg";

      if (this.profileAvatar) {
        this.profileAvatar.src = picture;
      }

      const channelLink = document.getElementById("profileChannelLink");
      if (channelLink instanceof HTMLElement) {
        const targetNpub = this.safeEncodeNpub(pubkey);
        if (targetNpub) {
          channelLink.href = `#view=channel-profile&npub=${targetNpub}`;
          channelLink.dataset.targetNpub = targetNpub;
          channelLink.classList.remove("hidden");
        } else {
          channelLink.removeAttribute("href");
          if (channelLink.dataset) {
            delete channelLink.dataset.targetNpub;
          }
          channelLink.classList.add("hidden");
        }
      }
    },

    applyAuthenticatedUiState() {
      const loginButton = this.loginButton || document.getElementById("loginButton");
      if (loginButton) {
        loginButton.classList.add("hidden");
        loginButton.setAttribute("hidden", "");
      }

      const logoutButton = this.logoutButton || document.getElementById("logoutButton");
      if (logoutButton) {
        logoutButton.classList.remove("hidden");
        logoutButton.style.display = "";
      }

      const userStatus = this.userStatus || document.getElementById("userStatus");
      if (userStatus) {
        userStatus.classList.add("hidden");
      }

      const uploadButton = this.uploadButton || document.getElementById("uploadButton");
      if (uploadButton) {
        uploadButton.classList.remove("hidden");
        uploadButton.removeAttribute("hidden");
        uploadButton.style.display = "";
      }

      const profileButton = this.profileButton || document.getElementById("profileButton");
      if (profileButton) {
        profileButton.classList.remove("hidden");
        profileButton.removeAttribute("hidden");
        profileButton.style.display = "";
      }

      const subscriptionsLink = this.resolveSubscriptionsLink();
      if (subscriptionsLink) {
        subscriptionsLink.classList.remove("hidden");
      }

      const forYouLink = this.resolveForYouLink();
      if (forYouLink) {
        forYouLink.classList.remove("hidden");
      }

      const exploreLink = this.resolveExploreLink();
      if (exploreLink) {
        exploreLink.classList.remove("hidden");
      }
    },

    applyLoggedOutUiState() {
      const loginButton = this.loginButton || document.getElementById("loginButton");
      if (loginButton) {
        loginButton.classList.remove("hidden");
        loginButton.removeAttribute("hidden");
      }

      const logoutButton = this.logoutButton || document.getElementById("logoutButton");
      if (logoutButton) {
        logoutButton.classList.add("hidden");
      }

      const userStatus = this.userStatus || document.getElementById("userStatus");
      if (userStatus) {
        userStatus.classList.add("hidden");
      }

      const userPubKey = this.userPubKey || document.getElementById("userPubKey");
      if (userPubKey) {
        userPubKey.textContent = "";
      }

      const uploadButton = this.uploadButton || document.getElementById("uploadButton");
      if (uploadButton) {
        uploadButton.classList.add("hidden");
        uploadButton.setAttribute("hidden", "");
        uploadButton.style.display = "none";
      }

      const profileButton = this.profileButton || document.getElementById("profileButton");
      if (profileButton) {
        profileButton.classList.add("hidden");
        profileButton.setAttribute("hidden", "");
        profileButton.style.display = "none";
      }

      const subscriptionsLink = this.resolveSubscriptionsLink();
      if (subscriptionsLink) {
        subscriptionsLink.classList.add("hidden");
      }

      const forYouLink = this.resolveForYouLink();
      if (forYouLink) {
        forYouLink.classList.add("hidden");
      }

      const exploreLink = this.resolveExploreLink();
      if (exploreLink) {
        exploreLink.classList.add("hidden");
      }
    },

    syncAuthUiState() {
      if (this.isUserLoggedIn()) {
        this.applyAuthenticatedUiState();
      } else {
        this.applyLoggedOutUiState();
      }
    },

    refreshChromeElements() {
      const doc = typeof document !== "undefined" ? document : null;
      const findElement = (id) => {
        if (!doc || typeof doc.getElementById !== "function") {
          return null;
        }
        const element = doc.getElementById(id);
        if (!element || typeof element.addEventListener !== "function") {
          return null;
        }
        return element;
      };

      this.loginButton = findElement("loginButton");
      this.logoutButton = findElement("logoutButton");
      this.uploadButton = findElement("uploadButton");
      this.profileButton = findElement("profileButton");
      this.closeLoginModalBtn = findElement("closeLoginModal");

      return {
        loginButton: this.loginButton,
        logoutButton: this.logoutButton,
        uploadButton: this.uploadButton,
        profileButton: this.profileButton,
        closeLoginModalButton: this.closeLoginModalBtn,
      };
    },

    resolveSubscriptionsLink() {
      if (
        this.subscriptionsLink instanceof HTMLElement &&
        this.subscriptionsLink.isConnected
      ) {
        return this.subscriptionsLink;
      }

      const linkCandidate = document.getElementById("subscriptionsLink");
      if (linkCandidate instanceof HTMLElement) {
        this.subscriptionsLink = linkCandidate;
        return this.subscriptionsLink;
      }

      this.subscriptionsLink = null;
      return null;
    },

    resolveForYouLink() {
      if (this.forYouLink instanceof HTMLElement && this.forYouLink.isConnected) {
        return this.forYouLink;
      }

      const linkCandidate = document.getElementById("forYouLink");
      if (linkCandidate instanceof HTMLElement) {
        this.forYouLink = linkCandidate;
        return this.forYouLink;
      }

      this.forYouLink = null;
      return null;
    },

    resolveExploreLink() {
      if (
        this.exploreLink instanceof HTMLElement &&
        this.exploreLink.isConnected
      ) {
        return this.exploreLink;
      }

      const linkCandidate = document.getElementById("exploreLink");
      if (linkCandidate instanceof HTMLElement) {
        this.exploreLink = linkCandidate;
        return this.exploreLink;
      }

      this.exploreLink = null;
      return null;
    },

    hydrateSidebarNavigation() {
      const chromeElements = this.refreshChromeElements();
      this.resolveSubscriptionsLink();
      this.resolveForYouLink();
      this.resolveExploreLink();

      if (this.appChromeController) {
        if (typeof this.appChromeController.setElements === "function") {
          this.appChromeController.setElements(chromeElements);
        } else {
          if (this.appChromeController.elements) {
            Object.assign(this.appChromeController.elements, chromeElements);
          }
          this.appChromeController.initialize();
        }
      }

      this.syncAuthUiState();
    },

    maybeShowExperimentalLoginWarning(provider) {
      const normalizedProvider =
        typeof provider === "string" ? provider.trim().toLowerCase() : "";

      if (normalizedProvider !== "nsec" && normalizedProvider !== "nip46") {
        return;
      }

      const now = Date.now();
      if (
        this.lastExperimentalWarningKey === normalizedProvider &&
        typeof this.lastExperimentalWarningAt === "number" &&
        now - this.lastExperimentalWarningAt < DEBOUNCE_DELAY_MS
      ) {
        return;
      }

      this.lastExperimentalWarningKey = normalizedProvider;
      this.lastExperimentalWarningAt = now;

      const providerLabel =
        normalizedProvider === "nsec"
          ? "Direct nsec or seed"
          : "NIP-46 remote signer";

      this.showStatus(
        `${providerLabel} logins are still in development and may not work well yet. We recommend using a NIP-07 browser extension for the most reliable experience.`,
        { showSpinner: false, autoHideMs: SHORT_TIMEOUT_MS },
      );
    }
  };
}
