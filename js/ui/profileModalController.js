const noop = () => {};

export class ProfileModalController {
  constructor(options = {}) {
    const {
      modalContainer = null,
      removeTrackingScripts = noop,
      createWatchHistoryRenderer = null,
      setGlobalModalState = noop,
      showError = noop,
      showSuccess = noop,
      showStatus = noop,
      callbacks = {},
    } = options;

    this.modalContainer = modalContainer;
    this.removeTrackingScripts = removeTrackingScripts;
    this.createWatchHistoryRenderer = createWatchHistoryRenderer;
    this.setGlobalModalState = setGlobalModalState;
    this.showError = showError;
    this.showSuccess = showSuccess;
    this.showStatus = showStatus;

    this.callbacks = {
      onClose: callbacks.onClose || noop,
      onLogout: callbacks.onLogout || noop,
      onChannelLink: callbacks.onChannelLink || noop,
      onAddAccount: callbacks.onAddAccount || noop,
      onSelectPane: callbacks.onSelectPane || noop,
      onPaneShown: callbacks.onPaneShown || noop,
      onAddRelay: callbacks.onAddRelay || noop,
      onRestoreRelays: callbacks.onRestoreRelays || noop,
      onAddBlocked: callbacks.onAddBlocked || noop,
      onWalletSave: callbacks.onWalletSave || noop,
      onWalletTest: callbacks.onWalletTest || noop,
      onWalletDisconnect: callbacks.onWalletDisconnect || noop,
      onAdminAddModerator: callbacks.onAdminAddModerator || noop,
      onAdminAddWhitelist: callbacks.onAdminAddWhitelist || noop,
      onAdminAddBlacklist: callbacks.onAdminAddBlacklist || noop,
      onAdminRemoveModerator: callbacks.onAdminRemoveModerator || noop,
      onAdminRemoveWhitelist: callbacks.onAdminRemoveWhitelist || noop,
      onAdminRemoveBlacklist: callbacks.onAdminRemoveBlacklist || noop,
      onHistoryReady: callbacks.onHistoryReady || noop,
    };

    this.profileModal = null;
    this.closeButton = null;
    this.logoutButton = null;
    this.channelLink = null;
    this.addAccountButton = null;
    this.navButtons = {
      account: null,
      relays: null,
      wallet: null,
      blocked: null,
      history: null,
      admin: null,
    };
    this.panes = {
      account: null,
      relays: null,
      wallet: null,
      blocked: null,
      history: null,
      admin: null,
    };
    this.relayList = null;
    this.relayInput = null;
    this.relayAddButton = null;
    this.relayRestoreButton = null;
    this.blockList = null;
    this.blockInput = null;
    this.blockAddButton = null;
    this.walletUriInput = null;
    this.walletDefaultZapInput = null;
    this.walletSaveButton = null;
    this.walletTestButton = null;
    this.walletDisconnectButton = null;
    this.adminAddModeratorButton = null;
    this.adminModeratorInput = null;
    this.adminAddWhitelistButton = null;
    this.adminWhitelistInput = null;
    this.adminAddBlacklistButton = null;
    this.adminBlacklistInput = null;

    this.profileHistoryRenderer = null;
    this.boundKeydown = null;
    this.boundFocusIn = null;
    this.focusableElements = [];
    this.activeProfilePane = "account";
    this.isWalletPaneBusy = false;
    this.adminEmptyMessages = new Map();
  }

  async load() {
    if (!(this.modalContainer instanceof HTMLElement)) {
      throw new Error("profile modal container missing");
    }

    const response = await fetch("components/profile-modal.html");
    if (!response.ok) {
      throw new Error(`Failed to load profile modal HTML (${response.status})`);
    }

    const html = await response.text();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    this.removeTrackingScripts(wrapper);
    this.modalContainer.appendChild(wrapper);

    this.cacheDomReferences();
    this.registerEventListeners();
    this.updateFocusTrap();
    this.callbacks.onPaneShown(this.activeProfilePane, { controller: this });

    return true;
  }

  cacheDomReferences() {
    this.profileModal = document.getElementById("profileModal") || null;
    this.closeButton = document.getElementById("closeProfileModal") || null;
    this.logoutButton = document.getElementById("profileLogoutBtn") || null;
    this.channelLink = document.getElementById("profileChannelLink") || null;
    this.addAccountButton =
      document.getElementById("profileAddAccountBtn") || null;

    this.navButtons.account =
      document.getElementById("profileNavAccount") || null;
    this.navButtons.relays = document.getElementById("profileNavRelays") || null;
    this.navButtons.wallet = document.getElementById("profileNavWallet") || null;
    this.navButtons.blocked =
      document.getElementById("profileNavBlocked") || null;
    this.navButtons.history =
      document.getElementById("profileNavHistory") || null;
    this.navButtons.admin = document.getElementById("profileNavAdmin") || null;

    this.panes.account = document.getElementById("profilePaneAccount") || null;
    this.panes.relays = document.getElementById("profilePaneRelays") || null;
    this.panes.wallet = document.getElementById("profilePaneWallet") || null;
    this.panes.blocked = document.getElementById("profilePaneBlocked") || null;
    this.panes.history = document.getElementById("profilePaneHistory") || null;
    this.panes.admin = document.getElementById("profilePaneAdmin") || null;

    this.relayList = document.getElementById("relayList") || null;
    this.relayInput = document.getElementById("relayInput") || null;
    this.relayAddButton = document.getElementById("addRelayBtn") || null;
    this.relayRestoreButton =
      document.getElementById("restoreRelaysBtn") || null;

    this.blockList = document.getElementById("blockedList") || null;
    this.blockInput = document.getElementById("blockedInput") || null;
    this.blockAddButton = document.getElementById("addBlockedBtn") || null;

    this.walletUriInput = document.getElementById("profileWalletUri") || null;
    this.walletDefaultZapInput =
      document.getElementById("profileWalletDefaultZap") || null;
    this.walletSaveButton =
      document.getElementById("profileWalletSave") || null;
    this.walletTestButton =
      document.getElementById("profileWalletTest") || null;
    this.walletDisconnectButton =
      document.getElementById("profileWalletDisconnect") || null;

    this.adminAddModeratorButton =
      document.getElementById("adminAddModeratorBtn") || null;
    this.adminModeratorInput =
      document.getElementById("adminModeratorInput") || null;
    this.adminAddWhitelistButton =
      document.getElementById("adminAddWhitelistBtn") || null;
    this.adminWhitelistInput =
      document.getElementById("adminWhitelistInput") || null;
    this.adminAddBlacklistButton =
      document.getElementById("adminAddBlacklistBtn") || null;
    this.adminBlacklistInput =
      document.getElementById("adminBlacklistInput") || null;

    if (!this.profileHistoryRenderer && this.createWatchHistoryRenderer) {
      this.profileHistoryRenderer = this.createWatchHistoryRenderer({
        viewSelector: "#profilePaneHistory",
        gridSelector: "#profileHistoryGrid",
        loadingSelector: "#profileHistoryLoading",
        statusSelector: "#profileHistoryStatus",
        emptySelector: "#profileHistoryEmpty",
        sentinelSelector: "#profileHistorySentinel",
        scrollContainerSelector: "#profileHistoryScroll",
        errorBannerSelector: "#profileHistoryError",
        clearButtonSelector: "#profileHistoryClear",
        republishButtonSelector: "#profileHistoryRepublish",
        featureBannerSelector: "#profileHistoryFeatureBanner",
        toastRegionSelector: "#profileHistoryToastRegion",
        sessionWarningSelector: "#profileHistorySessionWarning",
        metadataToggleSelector: "#profileHistoryMetadataToggle",
        metadataThumbSelector: "#profileHistoryMetadataThumb",
        metadataLabelSelector: "#profileHistoryMetadataLabel",
        metadataDescriptionSelector: "#profileHistoryMetadataDescription",
        remove: (payload) => this.callbacks.onHistoryReady(payload, this),
      });
    }
  }

  registerEventListeners() {
    if (this.closeButton instanceof HTMLElement) {
      this.closeButton.addEventListener("click", () => {
        this.hide();
        this.callbacks.onClose(this);
      });
    }

    if (this.logoutButton instanceof HTMLElement) {
      this.logoutButton.addEventListener("click", async () => {
        try {
          await this.callbacks.onLogout(this);
        } catch (error) {
          this.showError("Failed to logout. Please try again.");
        }
        this.hide();
      });
    }

    if (this.channelLink instanceof HTMLElement) {
      this.channelLink.addEventListener("click", (event) => {
        event.preventDefault();
        this.callbacks.onChannelLink(this.channelLink, this);
      });
    }

    if (this.addAccountButton instanceof HTMLElement) {
      this.addAccountButton.addEventListener("click", () => {
        this.callbacks.onAddAccount(this);
      });
    }

    Object.entries(this.navButtons).forEach(([name, button]) => {
      if (button instanceof HTMLElement) {
        button.addEventListener("click", () => {
          this.selectPane(name);
        });
      }
    });

    if (this.relayAddButton instanceof HTMLElement) {
      this.relayAddButton.addEventListener("click", () => {
        this.callbacks.onAddRelay(this.relayInput, this);
      });
    }

    if (this.relayRestoreButton instanceof HTMLElement) {
      this.relayRestoreButton.addEventListener("click", () => {
        this.callbacks.onRestoreRelays(this);
      });
    }

    if (this.blockAddButton instanceof HTMLElement) {
      this.blockAddButton.addEventListener("click", () => {
        this.callbacks.onAddBlocked(this.blockInput, this);
      });
    }

    if (this.walletUriInput instanceof HTMLElement) {
      this.walletUriInput.addEventListener("input", () => {
        this.callbacks.onWalletInputChange?.(this.walletUriInput, this);
      });
    }

    if (this.walletDefaultZapInput instanceof HTMLElement) {
      this.walletDefaultZapInput.addEventListener("input", () => {
        this.callbacks.onWalletInputChange?.(this.walletDefaultZapInput, this);
      });
    }

    if (this.walletSaveButton instanceof HTMLElement) {
      this.walletSaveButton.addEventListener("click", () => {
        this.callbacks.onWalletSave(this);
      });
    }

    if (this.walletTestButton instanceof HTMLElement) {
      this.walletTestButton.addEventListener("click", () => {
        this.callbacks.onWalletTest(this);
      });
    }

    if (this.walletDisconnectButton instanceof HTMLElement) {
      this.walletDisconnectButton.addEventListener("click", () => {
        this.callbacks.onWalletDisconnect(this);
      });
    }

    if (this.adminAddModeratorButton instanceof HTMLElement) {
      this.adminAddModeratorButton.addEventListener("click", () => {
        this.callbacks.onAdminAddModerator(this.adminModeratorInput, this);
      });
    }

    if (this.adminModeratorInput instanceof HTMLElement) {
      this.adminModeratorInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.callbacks.onAdminAddModerator(this.adminModeratorInput, this);
        }
      });
    }

    if (this.adminAddWhitelistButton instanceof HTMLElement) {
      this.adminAddWhitelistButton.addEventListener("click", () => {
        this.callbacks.onAdminAddWhitelist(this.adminWhitelistInput, this);
      });
    }

    if (this.adminWhitelistInput instanceof HTMLElement) {
      this.adminWhitelistInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.callbacks.onAdminAddWhitelist(this.adminWhitelistInput, this);
        }
      });
    }

    if (this.adminAddBlacklistButton instanceof HTMLElement) {
      this.adminAddBlacklistButton.addEventListener("click", () => {
        this.callbacks.onAdminAddBlacklist(this.adminBlacklistInput, this);
      });
    }

    if (this.adminBlacklistInput instanceof HTMLElement) {
      this.adminBlacklistInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.callbacks.onAdminAddBlacklist(this.adminBlacklistInput, this);
        }
      });
    }
  }

  selectPane(name = "account") {
    const normalized = typeof name === "string" ? name.toLowerCase() : "account";
    if (this.activeProfilePane === normalized) {
      this.callbacks.onSelectPane(normalized, { controller: this });
      return;
    }

    Object.entries(this.panes).forEach(([key, pane]) => {
      if (pane instanceof HTMLElement) {
        const isActive = key === normalized;
        pane.classList.toggle("hidden", !isActive);
        pane.setAttribute("aria-hidden", String(!isActive));
      }
    });

    Object.entries(this.navButtons).forEach(([key, button]) => {
      if (button instanceof HTMLElement) {
        const isActive = key === normalized;
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.classList.toggle("bg-gray-800", isActive);
        button.classList.toggle("text-white", isActive);
        button.classList.toggle("text-gray-400", !isActive);
      }
    });

    this.activeProfilePane = normalized;
    this.updateFocusTrap();
    this.callbacks.onSelectPane(normalized, { controller: this });
    this.callbacks.onPaneShown(normalized, { controller: this });
  }

  updateFocusTrap() {
    if (!(this.profileModal instanceof HTMLElement)) {
      this.focusableElements = [];
      return;
    }

    const selector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(
      this.profileModal.querySelectorAll(selector),
    );
    this.focusableElements = nodes.filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (node.hasAttribute("disabled")) {
        return false;
      }
      if (node.getAttribute("aria-hidden") === "true") {
        return false;
      }
      return true;
    });

    this.bindFocusTrap();
  }

  bindFocusTrap() {
    if (!(this.profileModal instanceof HTMLElement)) {
      return;
    }

    if (!this.boundKeydown) {
      this.boundKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.hide();
          this.callbacks.onClose(this);
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        if (!this.focusableElements.length) {
          event.preventDefault();
          if (typeof this.profileModal.focus === "function") {
            this.profileModal.focus();
          }
          return;
        }

        const first = this.focusableElements[0];
        const last = this.focusableElements[this.focusableElements.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !this.profileModal.contains(active)) {
            event.preventDefault();
            if (typeof last?.focus === "function") {
              last.focus();
            }
          }
          return;
        }

        if (active === last) {
          event.preventDefault();
          if (typeof first?.focus === "function") {
            first.focus();
          }
        }
      };
    }

    if (!this.boundFocusIn) {
      this.boundFocusIn = (event) => {
        if (
          !this.profileModal ||
          this.profileModal.classList.contains("hidden") ||
          this.profileModal.contains(event.target)
        ) {
          return;
        }

        const target = this.focusableElements[0] || this.profileModal;
        if (typeof target?.focus === "function") {
          target.focus();
        }
      };
    }

    this.profileModal.addEventListener("keydown", this.boundKeydown);
    document.addEventListener("focusin", this.boundFocusIn);
  }

  open(pane = "account") {
    if (!(this.profileModal instanceof HTMLElement)) {
      return;
    }

    this.profileModal.classList.remove("hidden");
    this.profileModal.setAttribute("aria-hidden", "false");
    this.setGlobalModalState("profile", true);
    this.selectPane(pane);

    const focusTarget = this.focusableElements[0] || this.profileModal;
    window.requestAnimationFrame(() => {
      if (typeof focusTarget?.focus === "function") {
        focusTarget.focus();
      }
    });
  }

  hide() {
    if (!(this.profileModal instanceof HTMLElement)) {
      return;
    }

    this.profileModal.classList.add("hidden");
    this.profileModal.setAttribute("aria-hidden", "true");
    this.setGlobalModalState("profile", false);

    if (this.boundKeydown) {
      this.profileModal.removeEventListener("keydown", this.boundKeydown);
    }
    if (this.boundFocusIn) {
      document.removeEventListener("focusin", this.boundFocusIn);
    }
  }
}

export default ProfileModalController;
