const noop = () => {};

const SERVICE_CONTRACT = [
  {
    key: "normalizeHexPubkey",
    type: "function",
    description:
      "Normalizes a provided pubkey (hex or npub) so profile lookups are stable.",
  },
  {
    key: "safeEncodeNpub",
    type: "function",
    description:
      "Encodes a hex pubkey as an npub for display. Expected to be resilient to bad input.",
  },
  {
    key: "safeDecodeNpub",
    type: "function",
    description:
      "Decodes an npub back to its hex form. Should return null/undefined for invalid payloads.",
  },
  {
    key: "truncateMiddle",
    type: "function",
    description:
      "Utility used for shortening long identifiers in the modal without losing context.",
  },
  {
    key: "getProfileCacheEntry",
    type: "function",
    description:
      "Returns the cached profile metadata for a normalized pubkey (if available).",
  },
  {
    key: "batchFetchProfiles",
    type: "function",
    description:
      "Fetches and caches profile metadata for a set of pubkeys so the modal can hydrate avatars/names in bulk.",
  },
  {
    key: "switchProfile",
    type: "function",
    description:
      "Switches the active application profile to the provided pubkey and updates state accordingly.",
  },
  {
    key: "relayManager",
    type: "object",
    description:
      "Shared relay manager instance responsible for the user\'s relay configuration.",
  },
  {
    key: "userBlocks",
    type: "object",
    description: "User blocks helper used to read and mutate the local block list.",
  },
  {
    key: "nostrClient",
    type: "object",
    description: "Reference to the nostr client powering subscriptions and profile fetches.",
  },
  {
    key: "accessControl",
    type: "object",
    description:
      "Access control module required for admin list permission checks and updates.",
  },
  {
    key: "getCurrentUserNpub",
    type: "function",
    description: "Returns the active user\'s npub so UI actions can target the correct actor.",
  },
  {
    key: "getActiveNwcSettings",
    type: "function",
    description:
      "Reads the active Nostr Wallet Connect settings (uri/default zap) for the logged in profile.",
  },
  {
    key: "updateActiveNwcSettings",
    type: "function",
    description: "Persists updates to the active wallet settings and returns the new state.",
  },
  {
    key: "createDefaultNwcSettings",
    type: "function",
    description: "Creates a baseline wallet settings object when none exists.",
  },
  {
    key: "ensureWallet",
    type: "function",
    description:
      "Guarantees a wallet connection exists before issuing wallet related operations (connect/test).",
  },
  {
    key: "loadVideos",
    type: "function",
    description: "Triggers a video reload so UI reflects profile or permission changes.",
  },
  {
    key: "sendAdminListNotification",
    type: "function",
    description:
      "Sends an administrative notification when moderators/whitelist/blacklist entries change.",
  },
  {
    key: "describeAdminError",
    type: "function",
    description:
      "Maps low-level admin errors to readable copy for surfaced error messages.",
  },
  {
    key: "describeNotificationError",
    type: "function",
    description:
      "Maps notification send errors to human readable descriptions for toast/banner messaging.",
  },
  {
    key: "onAccessControlUpdated",
    type: "function",
    description:
      "Callback invoked after access control mutations so the app can refresh dependent UI.",
  },
];

const STATE_CONTRACT = [
  {
    key: "getSavedProfiles",
    type: "function",
    description:
      "Returns the saved profile entries that populate the account switcher UI.",
    fallback: (internal) => () => internal.savedProfiles.slice(),
  },
  {
    key: "setSavedProfiles",
    type: "function",
    description:
      "Replaces the saved profile entries and returns the newly stored collection.",
    fallback: (internal) => (profiles = []) => {
      internal.savedProfiles = Array.isArray(profiles)
        ? profiles.slice()
        : [];
      return internal.savedProfiles;
    },
  },
  {
    key: "persistSavedProfiles",
    type: "function",
    description:
      "Persists the saved profile collection (and optionally the active profile) to storage.",
    fallback: () => noop,
  },
  {
    key: "getActivePubkey",
    type: "function",
    description: "Returns the currently active profile pubkey.",
    fallback: (internal) => () => internal.activePubkey,
  },
  {
    key: "setActivePubkey",
    type: "function",
    description: "Updates the active profile pubkey and returns the stored value.",
    fallback: (internal) => (pubkey) => {
      if (typeof pubkey === "string") {
        const trimmed = pubkey.trim();
        internal.activePubkey = trimmed ? trimmed : null;
      } else {
        internal.activePubkey = null;
      }
      return internal.activePubkey;
    },
  },
  {
    key: "getCachedSelection",
    type: "function",
    description:
      "Reads the cached profile selection used to restore switcher focus after reloads.",
    fallback: (internal) => () => internal.cachedSelection,
  },
  {
    key: "setCachedSelection",
    type: "function",
    description:
      "Caches the last selected profile identifier and returns the stored value.",
    fallback: (internal) => (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        internal.cachedSelection = trimmed || null;
      } else {
        internal.cachedSelection = null;
      }
      return internal.cachedSelection;
    },
  },
  {
    key: "getActivePane",
    type: "function",
    description: "Returns the identifier for the currently visible profile modal pane.",
    fallback: (internal) => () => internal.activePane,
  },
  {
    key: "setActivePane",
    type: "function",
    description: "Updates the active pane identifier and returns the stored value.",
    fallback: (internal) => (pane) => {
      if (typeof pane === "string") {
        const trimmed = pane.trim().toLowerCase();
        internal.activePane = trimmed || "account";
      } else {
        internal.activePane = "account";
      }
      return internal.activePane;
    },
  },
  {
    key: "getWalletBusy",
    type: "function",
    description:
      "Indicates whether wallet-related actions are currently in-flight (disables UI as needed).",
    fallback: (internal) => () => internal.walletBusy,
  },
  {
    key: "setWalletBusy",
    type: "function",
    description: "Updates the wallet busy flag and returns the new boolean state.",
    fallback: (internal) => (isBusy) => {
      internal.walletBusy = Boolean(isBusy);
      return internal.walletBusy;
    },
  },
];

function buildServicesContract(services = {}) {
  const resolved = {};
  const missing = [];

  SERVICE_CONTRACT.forEach((definition) => {
    const value = services[definition.key];
    if (value == null) {
      missing.push(`- ${definition.key}: ${definition.description}`);
      return;
    }

    if (definition.type === "function" && typeof value !== "function") {
      throw new TypeError(
        `Expected service \"${definition.key}\" to be a function. Received ${typeof value}.`,
      );
    }
    if (definition.type === "object" && (typeof value !== "object" || value === null)) {
      throw new TypeError(
        `Expected service \"${definition.key}\" to be an object. Received ${typeof value}.`,
      );
    }

    resolved[definition.key] = value;
  });

  if (missing.length) {
    throw new Error(
      [
        "[ProfileModalController] Missing required services for profile modal controller:",
        ...missing,
      ].join("\n"),
    );
  }

  return Object.freeze({ ...services, ...resolved });
}

function buildStateContract(state = {}, internalState) {
  const resolved = {};

  STATE_CONTRACT.forEach((definition) => {
    const value = state[definition.key];
    if (typeof value === definition.type) {
      resolved[definition.key] = value;
      return;
    }

    if (definition.fallback) {
      const fallback = definition.fallback(internalState);
      if (typeof fallback === definition.type) {
        resolved[definition.key] = fallback;
        return;
      }
    }

    throw new Error(
      `[ProfileModalController] Missing state handler \"${definition.key}\" (${definition.description}).`,
    );
  });

  return { ...state, ...resolved };
}

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
      services = {},
      state = {},
    } = options;

    this.modalContainer = modalContainer;
    this.removeTrackingScripts = removeTrackingScripts;
    this.createWatchHistoryRenderer = createWatchHistoryRenderer;
    this.setGlobalModalState = setGlobalModalState;
    this.showError = showError;
    this.showSuccess = showSuccess;
    this.showStatus = showStatus;

    this.internalState = {
      savedProfiles: [],
      activePubkey: null,
      cachedSelection: null,
      activePane: "account",
      walletBusy: false,
    };

    this.services = buildServicesContract(services);
    this.state = buildStateContract(state, this.internalState);

    this.normalizeHexPubkey = this.services.normalizeHexPubkey;
    this.safeEncodeNpub = this.services.safeEncodeNpub;
    this.safeDecodeNpub = this.services.safeDecodeNpub;
    this.truncateMiddle = this.services.truncateMiddle;
    this.getProfileCacheEntry = this.services.getProfileCacheEntry;
    this.batchFetchProfiles = this.services.batchFetchProfiles;
    this.switchProfile = this.services.switchProfile;
    this.relayManager = this.services.relayManager;
    this.userBlocks = this.services.userBlocks;
    this.nostrClient = this.services.nostrClient;
    this.accessControl = this.services.accessControl;
    this.getCurrentUserNpub = this.services.getCurrentUserNpub;
    this.getActiveNwcSettings = this.services.getActiveNwcSettings;
    this.updateActiveNwcSettings = this.services.updateActiveNwcSettings;
    this.createDefaultNwcSettings = this.services.createDefaultNwcSettings;
    this.ensureWallet = this.services.ensureWallet;
    this.loadVideos = this.services.loadVideos;
    this.sendAdminListNotification = this.services.sendAdminListNotification;
    this.describeAdminError = this.services.describeAdminError;
    this.describeNotificationError = this.services.describeNotificationError;
    this.onAccessControlUpdated = this.services.onAccessControlUpdated;

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
    this.setActivePane(this.getActivePane());
    this.setWalletPaneBusy(this.isWalletBusy());
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
    this.callbacks.onPaneShown(this.getActivePane(), { controller: this });

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
    if (this.getActivePane() === normalized) {
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

    this.setActivePane(normalized);
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

  getSavedProfiles() {
    return this.state.getSavedProfiles();
  }

  setSavedProfiles(...args) {
    return this.state.setSavedProfiles(...args);
  }

  persistSavedProfiles(...args) {
    return this.state.persistSavedProfiles(...args);
  }

  getActivePubkey() {
    return this.state.getActivePubkey();
  }

  setActivePubkey(...args) {
    return this.state.setActivePubkey(...args);
  }

  getCachedProfileSelection() {
    return this.state.getCachedSelection();
  }

  setCachedProfileSelection(...args) {
    return this.state.setCachedSelection(...args);
  }

  getActivePane() {
    return this.state.getActivePane();
  }

  setActivePane(...args) {
    return this.state.setActivePane(...args);
  }

  isWalletBusy() {
    return Boolean(this.state.getWalletBusy());
  }

  setWalletPaneBusy(isBusy) {
    return this.state.setWalletBusy(Boolean(isBusy));
  }
}

export default ProfileModalController;
