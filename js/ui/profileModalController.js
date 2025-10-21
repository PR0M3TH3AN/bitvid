import {
  isDevMode,
  ADMIN_SUPER_NPUB as CONFIG_ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL as CONFIG_ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL as CONFIG_BITVID_WEBSITE_URL,
  MAX_WALLET_DEFAULT_ZAP as CONFIG_MAX_WALLET_DEFAULT_ZAP,
} from "../config.js";
import { normalizeDesignSystemContext } from "../designSystem.js";
import {
  getTrustedMuteHideThreshold,
  getTrustedSpamHideThreshold,
  RUNTIME_FLAGS,
} from "../constants.js";
import { getProviderMetadata } from "../services/authProviders/index.js";
import { devLogger, userLogger } from "../utils/logger.js";

const noop = () => {};

const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";
const DEFAULT_ADMIN_DM_IMAGE_URL =
  "https://beta.bitvid.network/assets/jpg/video-thumbnail-fallback.jpg";
const DEFAULT_BITVID_WEBSITE_URL = "https://bitvid.network/";
const NWC_URI_SCHEME = "nostr+walletconnect://";
const DEFAULT_MAX_WALLET_DEFAULT_ZAP = 100000000;
const DEFAULT_SAVED_PROFILE_LABEL = "Saved profile";

const PROVIDER_BADGE_BASE_CLASS =
  "text-3xs font-semibold uppercase tracking-extra-wide";
const PROVIDER_BADGE_VARIANT_CLASS_MAP = Object.freeze({
  info: "text-status-info",
  success: "text-status-success",
  warning: "text-status-warning",
  danger: "text-status-danger",
  neutral: "text-muted",
  accent: "text-accent",
  primary: "text-accent",
});

function resolveProviderBadgeClass(variant) {
  if (typeof variant === "string" && variant.trim()) {
    const normalized = variant.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(PROVIDER_BADGE_VARIANT_CLASS_MAP, normalized)) {
      return PROVIDER_BADGE_VARIANT_CLASS_MAP[normalized];
    }
  }

  return PROVIDER_BADGE_VARIANT_CLASS_MAP.neutral;
}

const DEFAULT_INTERNAL_NWC_SETTINGS = Object.freeze({
  nwcUri: "",
  defaultZap: null,
  lastChecked: null,
});

function createInternalDefaultNwcSettings() {
  return { ...DEFAULT_INTERNAL_NWC_SETTINGS };
}

const DEFAULT_INTERNAL_MODERATION_SETTINGS = Object.freeze({
  blurThreshold: 3,
  autoplayBlockThreshold: 2,
  trustedMuteHideThreshold: getTrustedMuteHideThreshold(),
  trustedSpamHideThreshold: getTrustedSpamHideThreshold(),
});

function createInternalDefaultModerationSettings() {
  return { ...DEFAULT_INTERNAL_MODERATION_SETTINGS };
}

function ensureInternalModerationSettings(internalState) {
  if (!internalState || typeof internalState !== "object") {
    return createInternalDefaultModerationSettings();
  }

  if (
    !internalState.moderationSettings ||
    typeof internalState.moderationSettings !== "object" ||
    internalState.moderationSettings === null
  ) {
    internalState.moderationSettings = createInternalDefaultModerationSettings();
  }

  return internalState.moderationSettings;
}

function ensureInternalWalletSettings(internalState) {
  if (!internalState || typeof internalState !== "object") {
    return createInternalDefaultNwcSettings();
  }

  if (
    !internalState.walletSettings ||
    typeof internalState.walletSettings !== "object" ||
    internalState.walletSettings === null
  ) {
    internalState.walletSettings = createInternalDefaultNwcSettings();
  }

  return internalState.walletSettings;
}

const SERVICE_CONTRACT = [
  {
    key: "normalizeHexPubkey",
    type: "function",
    description:
      "Normalizes a provided pubkey (hex or npub) so profile lookups are stable.",
    fallback: () => (value) => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        return trimmed.toLowerCase();
      }
      return trimmed;
    },
  },
  {
    key: "safeEncodeNpub",
    type: "function",
    description:
      "Encodes a hex pubkey as an npub for display. Expected to be resilient to bad input.",
    fallback: () => (pubkey) => {
      if (typeof pubkey === "string" && pubkey.trim()) {
        return pubkey.trim();
      }
      return null;
    },
  },
  {
    key: "safeDecodeNpub",
    type: "function",
    description:
      "Decodes an npub back to its hex form. Should return null/undefined for invalid payloads.",
    fallback: () => () => null,
  },
  {
    key: "truncateMiddle",
    type: "function",
    description:
      "Utility used for shortening long identifiers in the modal without losing context.",
    fallback: () => (value) => value,
  },
  {
    key: "formatShortNpub",
    type: "function",
    description:
      "Formats npub strings for display using the canonical short representation (npubXXXX…XXXX).",
    fallback: () => (value) => (typeof value === "string" ? value : ""),
  },
  {
    key: "getProfileCacheEntry",
    type: "function",
    description:
      "Returns the cached profile metadata for a normalized pubkey (if available).",
    fallback: () => () => null,
  },
  {
    key: "batchFetchProfiles",
    type: "function",
    description:
      "Fetches and caches profile metadata for a set of pubkeys so the modal can hydrate avatars/names in bulk.",
    fallback: () => async () => [],
  },
  {
    key: "switchProfile",
    type: "function",
    description:
      "Switches the active application profile to the provided pubkey and updates state accordingly.",
    fallback: () => async () => ({ switched: false }),
  },
  {
    key: "removeSavedProfile",
    type: "function",
    description:
      "Removes a saved profile entry and persists the updated collection to storage.",
    fallback: () => () => ({ removed: false }),
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
    fallback: () => () => null,
  },
  {
    key: "nwcSettings",
    type: "object",
    description:
      "Service that manages Nostr Wallet Connect settings and interactions for the active profile.",
    fallback: ({ internalState }) => {
      const ensure = () => ensureInternalWalletSettings(internalState);
      const service = {};

      service.createDefaultNwcSettings = () => createInternalDefaultNwcSettings();

      service.getActiveNwcSettings = () => {
        const current = ensure();
        return { ...current };
      };

      service.updateActiveNwcSettings = (partial = {}) => {
        const current = ensure();
        const next = {
          ...current,
          ...(partial && typeof partial === "object" ? partial : {}),
        };
        internalState.walletSettings = next;
        return { ...next };
      };

      service.hydrateNwcSettingsForPubkey = async () => {
        return service.getActiveNwcSettings();
      };

      service.handleProfileWalletPersist = async (options = {}) => {
        const { nwcUri, defaultZap, lastChecked } =
          options && typeof options === "object" ? options : {};
        const partial = {};
        if (nwcUri !== undefined) {
          partial.nwcUri = nwcUri;
        }
        if (defaultZap !== undefined) {
          partial.defaultZap = defaultZap;
        }
        if (lastChecked !== undefined) {
          partial.lastChecked = lastChecked;
        }
        if (!Object.keys(partial).length) {
          return service.getActiveNwcSettings();
        }
        return service.updateActiveNwcSettings(partial);
      };

      service.hasActiveWalletConnection = () => {
        const settings = ensure();
        const candidate =
          typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
        return candidate.length > 0;
      };

      service.validateWalletUri = (uri, { requireValue = false } = {}) => {
        const value = typeof uri === "string" ? uri.trim() : "";

        if (!value) {
          if (requireValue) {
            return {
              valid: false,
              sanitized: "",
              message: "Enter a wallet connect URI before continuing.",
            };
          }
          return { valid: true, sanitized: "" };
        }

        if (!value.toLowerCase().startsWith(NWC_URI_SCHEME)) {
          return {
            valid: false,
            sanitized: value,
            message: `Wallet URI must start with ${NWC_URI_SCHEME}.`,
          };
        }

        return { valid: true, sanitized: value };
      };

      service.ensureWallet = async ({ nwcUri } = {}) => {
        const settings = service.getActiveNwcSettings();
        const candidate =
          typeof nwcUri === "string" && nwcUri.trim()
            ? nwcUri.trim()
            : settings.nwcUri || "";
        const { valid, sanitized, message } = service.validateWalletUri(
          candidate,
          { requireValue: true },
        );
        if (!valid) {
          throw new Error(message || "Invalid wallet URI provided.");
        }
        return { ...settings, nwcUri: sanitized };
      };

      service.clearStoredNwcSettings = async () => true;

      service.onLogin = async () => service.getActiveNwcSettings();

      service.onLogout = async () => service.createDefaultNwcSettings();

      service.onIdentityChanged = () => {
        internalState.walletSettings = createInternalDefaultNwcSettings();
      };

      return service;
    },
  },
  {
    key: "moderationSettings",
    type: "object",
    description:
      "Service that manages Safety & Moderation threshold overrides for the active profile.",
    fallback: ({ internalState }) => {
      const ensure = () => ensureInternalModerationSettings(internalState);
      const sanitize = (value, fallback) => {
        if (value === null || value === undefined) {
          return fallback;
        }
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          return fallback;
        }
        return Math.max(0, Math.floor(numeric));
      };

      const service = {};

      service.getDefaultModerationSettings = () =>
        createInternalDefaultModerationSettings();

      service.getActiveModerationSettings = () => {
        const current = ensure();
        const defaults = service.getDefaultModerationSettings();
        return {
          blurThreshold: sanitize(current.blurThreshold, defaults.blurThreshold),
          autoplayBlockThreshold: sanitize(
            current.autoplayBlockThreshold,
            defaults.autoplayBlockThreshold,
          ),
        };
      };

      service.updateModerationSettings = (partial = {}) => {
        const defaults = service.getDefaultModerationSettings();
        const current = ensure();
        const next = { ...current };

        if (Object.prototype.hasOwnProperty.call(partial, "blurThreshold")) {
          const value = partial.blurThreshold;
          next.blurThreshold =
            value === null
              ? defaults.blurThreshold
              : sanitize(value, defaults.blurThreshold);
        }

        if (
          Object.prototype.hasOwnProperty.call(
            partial,
            "autoplayBlockThreshold",
          )
        ) {
          const value = partial.autoplayBlockThreshold;
          next.autoplayBlockThreshold =
            value === null
              ? defaults.autoplayBlockThreshold
              : sanitize(value, defaults.autoplayBlockThreshold);
        }

        internalState.moderationSettings = next;
        return service.getActiveModerationSettings();
      };

      service.resetModerationSettings = () => {
        internalState.moderationSettings = createInternalDefaultModerationSettings();
        return service.getActiveModerationSettings();
      };

      return service;
    },
  },
  {
    key: "loadVideos",
    type: "function",
    description: "Triggers a video reload so UI reflects profile or permission changes.",
    fallback: () => async () => undefined,
  },
  {
    key: "onVideosShouldRefresh",
    type: "function",
    description:
      "Signals that video listings should be refreshed after a profile-driven mutation.",
    fallback: ({ services, resolved }) => async (context = {}) => {
      const loader =
        typeof services.loadVideos === "function"
          ? services.loadVideos
          : typeof resolved.loadVideos === "function"
          ? resolved.loadVideos
          : null;
      if (loader) {
        return loader(true, context);
      }
      return undefined;
    },
  },
  {
    key: "sendAdminListNotification",
    type: "function",
    description:
      "Sends an administrative notification when moderators/whitelist/blacklist entries change.",
    optional: true,
  },
  {
    key: "describeAdminError",
    type: "function",
    description:
      "Maps low-level admin errors to readable copy for surfaced error messages.",
    fallback: () => () => "",
  },
  {
    key: "describeNotificationError",
    type: "function",
    description:
      "Maps notification send errors to human readable descriptions for toast/banner messaging.",
    fallback: () => () => "",
  },
  {
    key: "onAccessControlUpdated",
    type: "function",
    description:
      "Callback invoked after access control mutations so the app can refresh dependent UI.",
    fallback: () => async () => undefined,
  },
  {
    key: "persistSavedProfiles",
    type: "function",
    description:
      "Persists the saved profile collection (and optionally the active profile) to storage.",
    fallback: () => () => undefined,
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

function buildServicesContract(services = {}, internalState) {
  const resolved = {};
  const missing = [];

  SERVICE_CONTRACT.forEach((definition) => {
    const provided = services[definition.key];

    if (provided == null) {
      if (typeof definition.fallback === "function") {
        const fallbackValue = definition.fallback({
          services,
          resolved,
          internalState,
          definition,
        });

        if (definition.type === "function" && typeof fallbackValue === "function") {
          resolved[definition.key] = fallbackValue;
          return;
        }
        if (
          definition.type === "object" &&
          typeof fallbackValue === "object" &&
          fallbackValue !== null
        ) {
          resolved[definition.key] = fallbackValue;
          return;
        }
      }

      if (definition.optional) {
        return;
      }

      missing.push(`- ${definition.key}: ${definition.description}`);
      return;
    }

    if (definition.type === "function" && typeof provided !== "function") {
      throw new TypeError(
        `Expected service \"${definition.key}\" to be a function. Received ${typeof provided}.`,
      );
    }
    if (
      definition.type === "object" &&
      (typeof provided !== "object" || provided === null)
    ) {
      throw new TypeError(
        `Expected service \"${definition.key}\" to be an object. Received ${typeof provided}.`,
      );
    }

    resolved[definition.key] = provided;
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
      constants: providedConstants = {},
      designSystem = null,
    } = options;

    this.modalContainer = modalContainer;
    this.removeTrackingScripts = removeTrackingScripts;
    this.createWatchHistoryRenderer = createWatchHistoryRenderer;
    this.setGlobalModalState = setGlobalModalState;
    this.showError = showError;
    this.showSuccess = showSuccess;
    this.showStatus = showStatus;
    this.designSystem = normalizeDesignSystemContext(designSystem);

    const resolvedMaxWalletDefaultZap =
      typeof providedConstants.MAX_WALLET_DEFAULT_ZAP === "number" &&
      Number.isFinite(providedConstants.MAX_WALLET_DEFAULT_ZAP)
        ? providedConstants.MAX_WALLET_DEFAULT_ZAP
        : typeof CONFIG_MAX_WALLET_DEFAULT_ZAP === "number" &&
          Number.isFinite(CONFIG_MAX_WALLET_DEFAULT_ZAP)
        ? CONFIG_MAX_WALLET_DEFAULT_ZAP
        : DEFAULT_MAX_WALLET_DEFAULT_ZAP;

    const resolvedAdminSuperNpub = (() => {
      const fromOptions =
        typeof providedConstants.ADMIN_SUPER_NPUB === "string"
          ? providedConstants.ADMIN_SUPER_NPUB.trim()
          : "";
      if (fromOptions) {
        return fromOptions;
      }
      const fromConfig =
        typeof CONFIG_ADMIN_SUPER_NPUB === "string"
          ? CONFIG_ADMIN_SUPER_NPUB.trim()
          : "";
      return fromConfig || null;
    })();

    const resolvedAdminDmImageUrl = (() => {
      const fromOptions =
        typeof providedConstants.ADMIN_DM_IMAGE_URL === "string"
          ? providedConstants.ADMIN_DM_IMAGE_URL.trim()
          : "";
      if (fromOptions) {
        return fromOptions;
      }
      const fromConfig =
        typeof CONFIG_ADMIN_DM_IMAGE_URL === "string"
          ? CONFIG_ADMIN_DM_IMAGE_URL.trim()
          : "";
      return fromConfig || DEFAULT_ADMIN_DM_IMAGE_URL;
    })();

    const resolvedbitvidWebsiteUrl = (() => {
      const fromOptions =
        typeof providedConstants.BITVID_WEBSITE_URL === "string"
          ? providedConstants.BITVID_WEBSITE_URL.trim()
          : "";
      if (fromOptions) {
        return fromOptions;
      }
      const fromConfig =
        typeof CONFIG_BITVID_WEBSITE_URL === "string"
          ? CONFIG_BITVID_WEBSITE_URL.trim()
          : "";
      return fromConfig || DEFAULT_BITVID_WEBSITE_URL;
    })();

    this.maxWalletDefaultZap = resolvedMaxWalletDefaultZap;
    this.adminSuperNpub = resolvedAdminSuperNpub;
    this.adminDmImageUrl = resolvedAdminDmImageUrl;
    this.bitvidWebsiteUrl = resolvedbitvidWebsiteUrl;

    this.internalState = {
      savedProfiles: [],
      activePubkey: null,
      cachedSelection: null,
      activePane: "account",
      walletBusy: false,
      walletSettings: createInternalDefaultNwcSettings(),
      moderationSettings: createInternalDefaultModerationSettings(),
    };

    this.services = buildServicesContract(services, this.internalState);
    this.state = buildStateContract(state, this.internalState);

    this.normalizeHexPubkey = this.services.normalizeHexPubkey;
    this.safeEncodeNpub = this.services.safeEncodeNpub;
    this.safeDecodeNpub = this.services.safeDecodeNpub;
    this.truncateMiddle = this.services.truncateMiddle;
    this.formatShortNpub = this.services.formatShortNpub;
    this.moderationSettingsDefaults = createInternalDefaultModerationSettings();
    this.currentModerationSettings = createInternalDefaultModerationSettings();
    this.sendAdminListNotificationService =
      typeof this.services.sendAdminListNotification === "function"
        ? this.services.sendAdminListNotification
        : null;
    this.describeAdminErrorService = this.services.describeAdminError;
    this.describeNotificationErrorService =
      this.services.describeNotificationError;

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
      onRequestSwitchProfile: callbacks.onRequestSwitchProfile || noop,
      onRelayOperation: callbacks.onRelayOperation || noop,
      onRelayModeToggle: callbacks.onRelayModeToggle || noop,
      onRelayRestore: callbacks.onRelayRestore || noop,
      onBlocklistMutation: callbacks.onBlocklistMutation || noop,
      onWalletPersist: callbacks.onWalletPersist || noop,
      onWalletTestRequest: callbacks.onWalletTestRequest || callbacks.onWalletTest || noop,
      onWalletDisconnectRequest:
        callbacks.onWalletDisconnectRequest || callbacks.onWalletDisconnect || noop,
      onAdminMutation: callbacks.onAdminMutation || noop,
      onAdminNotifyError: callbacks.onAdminNotifyError || noop,
      onModerationSettingsChange:
        callbacks.onModerationSettingsChange || noop,
    };

    this.profileModal = null;
    this.profileModalRoot = null;
    this.profileModalPanel = null;
    this.profileModalBackdrop = null;
    this.profileModalLayout = null;
    this.profileModalMenu = null;
    this.profileModalPaneWrapper = null;
    this.profileModalBackButton = null;
    this.profileAvatar = null;
    this.profileName = null;
    this.profileNpub = null;
    this.switcherList = null;
    this.profileModalAvatar = null;
    this.profileModalName = null;
    this.profileModalNpub = null;
    this.profileSwitcherList = null;
    this.globalProfileAvatar = null;
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
    this.addRelayButton = null;
    this.restoreRelaysButton = null;
    this.profileRelayList = null;
    this.profileRelayInput = null;
    this.profileAddRelayBtn = null;
    this.profileRestoreRelaysBtn = null;
    this.blockList = null;
    this.blockListEmpty = null;
    this.blockListStatus = null;
    this.blockListLoadingState = "idle";
    this.blockInput = null;
    this.addBlockedButton = null;
    this.profileBlockedList = null;
    this.profileBlockedEmpty = null;
    this.profileBlockedInput = null;
    this.profileAddBlockedBtn = null;
    this.walletUriInput = null;
    this.walletDefaultZapInput = null;
    this.walletSaveButton = null;
    this.walletTestButton = null;
    this.walletDisconnectButton = null;
    this.walletStatusText = null;
    this.profileWalletStatusText = null;
    this.moderationSettingsCard = null;
    this.moderationBlurInput = null;
    this.moderationAutoplayInput = null;
    this.moderationMuteHideInput = null;
    this.moderationSpamHideInput = null;
    this.moderationSaveButton = null;
    this.moderationResetButton = null;
    this.moderationStatusText = null;
    this.moderationHideControlsGroup = null;
    this.moderationHideControlElements = [];
    this.moderatorSection = null;
    this.moderatorEmpty = null;
    this.adminModeratorList = null;
    this.addModeratorButton = null;
    this.moderatorInput = null;
    this.adminModeratorsSection = null;
    this.adminModeratorsEmpty = null;
    this.adminAddModeratorButton = null;
    this.adminModeratorInput = null;
    this.whitelistSection = null;
    this.whitelistEmpty = null;
    this.whitelistList = null;
    this.addWhitelistButton = null;
    this.whitelistInput = null;
    this.adminWhitelistSection = null;
    this.adminWhitelistEmpty = null;
    this.adminWhitelistList = null;
    this.adminAddWhitelistButton = null;
    this.adminWhitelistInput = null;
    this.blacklistSection = null;
    this.blacklistEmpty = null;
    this.blacklistList = null;
    this.addBlacklistButton = null;
    this.blacklistInput = null;
    this.adminBlacklistSection = null;
    this.adminBlacklistEmpty = null;
    this.adminBlacklistList = null;
    this.adminAddBlacklistButton = null;
    this.adminBlacklistInput = null;

    this.profileHistoryRenderer = null;
    this.profileHistoryRendererConfig = null;
    this.boundProfileHistoryVisibility = null;
    this.boundKeydown = null;
    this.boundFocusIn = null;
    this.focusableElements = [];
    this.focusTrapContainer = null;
    this.profileSwitcherSelectionPubkey = null;
    this.previouslyFocusedElement = null;
    this.largeLayoutQuery = null;
    this.largeLayoutQueryListener = null;
    this.isLargeLayoutActiveFlag = false;
    this.mobileViewState = "menu";
    this.lastMobileViewState = "menu";
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
    const template = document.createElement("template");
    template.innerHTML = html;
    this.removeTrackingScripts(template.content);

    const modalRoot = template.content.querySelector("#profileModal");
    if (!(modalRoot instanceof HTMLElement)) {
      throw new Error("profile modal markup missing expected #profileModal root");
    }

    this.modalContainer.appendChild(template.content);
    this.profileModalRoot = modalRoot;
    this.profileModal = modalRoot;
    this.profileModalPanel =
      modalRoot.querySelector(".bv-modal__panel") || modalRoot;
    this.profileModalBackdrop =
      modalRoot.querySelector(".bv-modal-backdrop") || null;

    this.cacheDomReferences();
    this.setupLayoutBreakpointObserver();
    this.applyModalStackingOverrides();
    this.registerEventListeners();
    this.refreshModerationSettingsUi();
    const preserveMenu = this.isMobileLayoutActive();
    this.selectPane(this.getActivePane(), { keepMenuView: preserveMenu });

    return true;
  }

  cacheDomReferences() {
    this.profileModalRoot = document.getElementById("profileModal") || null;
    this.profileModalPanel =
      this.profileModalRoot?.querySelector(".bv-modal__panel") || null;
    this.profileModalBackdrop =
      this.profileModalRoot?.querySelector(".bv-modal-backdrop") || null;
    this.profileModalLayout =
      this.profileModalRoot?.querySelector("[data-profile-layout]") || null;
    this.profileModalMenu =
      this.profileModalRoot?.querySelector("[data-profile-mobile-menu]") || null;
    this.profileModalPaneWrapper =
      this.profileModalRoot?.querySelector("[data-profile-mobile-pane]") || null;
    this.profileModal = this.profileModalRoot;
    this.closeButton = document.getElementById("closeProfileModal") || null;
    this.profileModalBackButton =
      document.getElementById("profileModalBack") || null;
    this.logoutButton = document.getElementById("profileLogoutBtn") || null;
    this.channelLink = document.getElementById("profileChannelLink") || null;
    this.addAccountButton =
      document.getElementById("profileAddAccountBtn") || null;
    this.profileAvatar = document.getElementById("profileModalAvatar") || null;
    this.profileName = document.getElementById("profileModalName") || null;
    this.profileNpub = document.getElementById("profileModalNpub") || null;
    this.switcherList = document.getElementById("profileSwitcherList") || null;

    this.profileModalAvatar = this.profileAvatar;
    this.profileModalName = this.profileName;
    this.profileModalNpub = this.profileNpub;
    this.profileSwitcherList = this.switcherList;

    const topLevelProfileAvatar =
      document.getElementById("profileAvatar") || null;
    if (topLevelProfileAvatar) {
      this.globalProfileAvatar = topLevelProfileAvatar;
    }

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
    this.addRelayButton = document.getElementById("addRelayBtn") || null;
    this.restoreRelaysButton =
      document.getElementById("restoreRelaysBtn") || null;

    this.blockList = document.getElementById("blockedList") || null;
    this.blockListEmpty = document.getElementById("blockedEmpty") || null;
    this.blockInput = document.getElementById("blockedInput") || null;
    this.addBlockedButton = document.getElementById("addBlockedBtn") || null;

    this.walletUriInput = document.getElementById("profileWalletUri") || null;
    this.walletDefaultZapInput =
      document.getElementById("profileWalletDefaultZap") || null;
    this.walletSaveButton =
      document.getElementById("profileWalletSave") || null;
    this.walletTestButton =
      document.getElementById("profileWalletTest") || null;
    this.walletDisconnectButton =
      document.getElementById("profileWalletDisconnect") || null;
    this.walletStatusText =
      document.getElementById("profileWalletStatus") || null;

    this.profileRelayList = this.relayList;
    this.profileRelayInput = this.relayInput;
    this.profileAddRelayBtn = this.addRelayButton;
    this.profileRestoreRelaysBtn = this.restoreRelaysButton;
    this.profileBlockedList = this.blockList;
    this.profileBlockedEmpty = this.blockListEmpty;
    this.profileBlockedInput = this.blockInput;
    this.profileAddBlockedBtn = this.addBlockedButton;
    this.blockListStatus =
      this.panes.blocked?.querySelector("[data-role=\"blocked-list-status\"]") ||
      null;
    this.profileWalletStatusText = this.walletStatusText;
    this.moderationSettingsCard =
      document.getElementById("profileModerationSettings") || null;
    this.moderationBlurInput =
      document.getElementById("profileModerationBlurThreshold") || null;
    this.moderationAutoplayInput =
      document.getElementById("profileModerationAutoplayThreshold") || null;
    this.moderationMuteHideInput =
      document.getElementById("profileModerationMuteHideThreshold") || null;
    this.moderationSpamHideInput =
      document.getElementById("profileModerationSpamHideThreshold") || null;
    this.moderationSaveButton =
      document.getElementById("profileModerationSave") || null;
    this.moderationResetButton =
      document.getElementById("profileModerationReset") || null;
    this.moderationStatusText =
      document.getElementById("profileModerationStatus") || null;
    this.moderationHideControlsGroup =
      this.moderationSettingsCard?.querySelector(
        "[data-role=\"trusted-hide-controls\"]",
      ) || null;
    this.moderationHideControlElements = Array.from(
      this.moderationSettingsCard?.querySelectorAll(
        "[data-role=\"trusted-hide-control\"]",
      ) || [],
    );

    this.moderatorSection =
      document.getElementById("adminModeratorsSection") || null;
    this.moderatorEmpty =
      document.getElementById("adminModeratorsEmpty") || null;
    this.adminModeratorList =
      document.getElementById("adminModeratorList") || null;
    this.addModeratorButton =
      document.getElementById("adminAddModeratorBtn") || null;
    this.moderatorInput =
      document.getElementById("adminModeratorInput") || null;

    // Backwards-compatible aliases retained for application code that still
    // mirrors DOM references from the controller. These should be removed once
    // the application stops reaching through the controller.
    this.adminModeratorsSection = this.moderatorSection;
    this.adminModeratorsEmpty = this.moderatorEmpty;
    this.adminAddModeratorButton = this.addModeratorButton;
    this.adminModeratorInput = this.moderatorInput;
    this.whitelistSection =
      document.getElementById("adminWhitelistSection") || null;
    this.whitelistEmpty =
      document.getElementById("adminWhitelistEmpty") || null;
    this.whitelistList =
      document.getElementById("adminWhitelistList") || null;
    this.addWhitelistButton =
      document.getElementById("adminAddWhitelistBtn") || null;
    this.whitelistInput =
      document.getElementById("adminWhitelistInput") || null;
    this.blacklistSection =
      document.getElementById("adminBlacklistSection") || null;
    this.blacklistEmpty =
      document.getElementById("adminBlacklistEmpty") || null;
    this.blacklistList =
      document.getElementById("adminBlacklistList") || null;
    this.addBlacklistButton =
      document.getElementById("adminAddBlacklistBtn") || null;
    this.blacklistInput =
      document.getElementById("adminBlacklistInput") || null;

    this.adminWhitelistSection = this.whitelistSection;
    this.adminWhitelistEmpty = this.whitelistEmpty;
    this.adminWhitelistList = this.whitelistList;
    this.adminAddWhitelistButton = this.addWhitelistButton;
    this.adminWhitelistInput = this.whitelistInput;
    this.adminBlacklistSection = this.blacklistSection;
    this.adminBlacklistEmpty = this.blacklistEmpty;
    this.adminBlacklistList = this.blacklistList;
    this.adminAddBlacklistButton = this.addBlacklistButton;
    this.adminBlacklistInput = this.blacklistInput;

    if (this.createWatchHistoryRenderer) {
      this.ensureProfileHistoryRenderer();
    }
  }

  ensureProfileHistoryRenderer() {
    if (this.profileHistoryRenderer) {
      return this.profileHistoryRenderer;
    }

    if (!this.createWatchHistoryRenderer) {
      return null;
    }

    const config = this.getProfileHistoryRendererConfig();

    try {
      this.profileHistoryRenderer = this.createWatchHistoryRenderer(config);
    } catch (error) {
      userLogger.error(
        "[profileModal] Failed to create watch history renderer:",
        error,
      );
      this.profileHistoryRenderer = null;
    }

    return this.profileHistoryRenderer;
  }

  getProfileHistoryRendererConfig() {
    if (this.profileHistoryRendererConfig) {
      return this.profileHistoryRendererConfig;
    }

    this.profileHistoryRendererConfig = {
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
      emptyCopy: "You haven’t watched any videos yet.",
      remove: (payload) =>
        this.callbacks.onHistoryReady({
          ...(typeof payload === "object" && payload ? payload : {}),
          controller: this,
          renderer: this.profileHistoryRenderer,
        }),
    };

    return this.profileHistoryRendererConfig;
  }

  registerEventListeners() {
    if (this.closeButton instanceof HTMLElement) {
      this.closeButton.addEventListener("click", () => {
        this.hide();
      });
    }

    if (this.profileModalBackButton instanceof HTMLElement) {
      this.profileModalBackButton.addEventListener("click", () => {
        this.setMobileView("menu", { focusMenu: true });
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

    if (this.addRelayButton instanceof HTMLElement) {
      this.addRelayButton.addEventListener("click", () => {
        void this.handleAddRelay();
      });
    }

    if (this.restoreRelaysButton instanceof HTMLElement) {
      this.restoreRelaysButton.addEventListener("click", () => {
        void this.handleRestoreRelays();
      });
    }

    if (this.addBlockedButton instanceof HTMLElement) {
      this.addBlockedButton.addEventListener("click", () => {
        void this.handleAddBlockedCreator();
      });
    }

    if (this.blockInput instanceof HTMLElement) {
      this.blockInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddBlockedCreator();
        }
      });
    }

    if (this.walletUriInput instanceof HTMLElement) {
      this.walletUriInput.addEventListener("input", () => {
        this.applyWalletControlState();
      });
    }

    if (this.walletDefaultZapInput instanceof HTMLElement) {
      this.walletDefaultZapInput.addEventListener("input", () => {
        this.applyWalletControlState();
      });
    }

    if (this.walletSaveButton instanceof HTMLElement) {
      this.walletSaveButton.addEventListener("click", () => {
        void this.handleWalletSave();
      });
    }

    if (this.walletTestButton instanceof HTMLElement) {
      this.walletTestButton.addEventListener("click", () => {
        void this.handleWalletTest();
      });
    }

    if (this.walletDisconnectButton instanceof HTMLElement) {
      this.walletDisconnectButton.addEventListener("click", () => {
        void this.handleWalletDisconnect();
      });
    }

    if (this.moderationBlurInput instanceof HTMLElement) {
      this.moderationBlurInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationAutoplayInput instanceof HTMLElement) {
      this.moderationAutoplayInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationMuteHideInput instanceof HTMLElement) {
      this.moderationMuteHideInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationSpamHideInput instanceof HTMLElement) {
      this.moderationSpamHideInput.addEventListener("input", () => {
        this.applyModerationSettingsControlState();
      });
    }

    if (this.moderationSaveButton instanceof HTMLElement) {
      this.moderationSaveButton.addEventListener("click", () => {
        void this.handleModerationSettingsSave();
      });
    }

    if (this.moderationResetButton instanceof HTMLElement) {
      this.moderationResetButton.addEventListener("click", () => {
        void this.handleModerationSettingsReset();
      });
    }

    if (this.addModeratorButton instanceof HTMLElement) {
      this.addModeratorButton.addEventListener("click", () => {
        void this.handleAddModerator();
      });
    }

    if (this.moderatorInput instanceof HTMLElement) {
      this.moderatorInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddModerator();
        }
      });
    }

    if (this.addWhitelistButton instanceof HTMLElement) {
      this.addWhitelistButton.addEventListener("click", () => {
        void this.handleAdminListMutation("whitelist", "add");
      });
    }

    if (this.whitelistInput instanceof HTMLElement) {
      this.whitelistInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAdminListMutation("whitelist", "add");
        }
      });
    }

    if (this.addBlacklistButton instanceof HTMLElement) {
      this.addBlacklistButton.addEventListener("click", () => {
        void this.handleAdminListMutation("blacklist", "add");
      });
    }

    if (this.blacklistInput instanceof HTMLElement) {
      this.blacklistInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAdminListMutation("blacklist", "add");
        }
      });
    }
  }

  renderSavedProfiles() {
    const normalizedActive = this.normalizeHexPubkey(this.getActivePubkey());
    const entriesNeedingFetch = new Set();
    const savedProfiles = this.getSavedProfiles();

    const resolveMeta = (entry) => {
      if (!entry || typeof entry !== "object") {
        return {
          name: "",
          picture: FALLBACK_PROFILE_AVATAR,
          npub: null,
        };
      }

      const normalizedPubkey = this.normalizeHexPubkey(entry.pubkey);
      let cacheEntry = null;
      if (normalizedPubkey) {
        cacheEntry = this.services.getProfileCacheEntry(normalizedPubkey);
      }
      const cachedProfile = cacheEntry?.profile || {};

      const hasStoredName =
        typeof entry.name === "string" && entry.name.trim().length > 0;
      const hasStoredPicture =
        typeof entry.picture === "string" && entry.picture.trim().length > 0;

      if (
        !cacheEntry &&
        normalizedPubkey &&
        (!hasStoredName || !hasStoredPicture)
      ) {
        entriesNeedingFetch.add(normalizedPubkey);
      }

      let resolvedNpub =
        typeof entry.npub === "string" && entry.npub.trim()
          ? entry.npub.trim()
          : null;
      if (!resolvedNpub && entry.pubkey) {
        resolvedNpub = this.safeEncodeNpub(entry.pubkey);
      }

      return {
        name: cachedProfile.name || entry.name || "",
        picture: cachedProfile.picture || entry.picture || FALLBACK_PROFILE_AVATAR,
        npub: resolvedNpub,
      };
    };

    const savedEntries = Array.isArray(savedProfiles)
      ? savedProfiles.filter((entry) => entry && entry.pubkey)
      : [];

    let activeEntry = null;
    if (normalizedActive) {
      activeEntry = savedEntries.find(
        (entry) => this.normalizeHexPubkey(entry.pubkey) === normalizedActive,
      );
    }
    if (!activeEntry && savedEntries.length) {
      activeEntry = savedEntries[0];
    }

    const activeMeta = activeEntry ? resolveMeta(activeEntry) : null;
    const hasActiveProfile = Boolean(activeEntry && activeMeta);
    const truncate = this.truncateMiddle || ((value) => value);
    const formatNpub =
      typeof this.formatShortNpub === "function"
        ? (value) => this.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");
    const activeNameFallback = activeMeta?.npub
      ? formatNpub(activeMeta.npub) || DEFAULT_SAVED_PROFILE_LABEL
      : DEFAULT_SAVED_PROFILE_LABEL;
    const activeDisplayName = hasActiveProfile
      ? activeMeta?.name?.trim() || activeNameFallback
      : "No active profile";
    const activeAvatarSrc = hasActiveProfile
      ? activeMeta?.picture || FALLBACK_PROFILE_AVATAR
      : FALLBACK_PROFILE_AVATAR;

    if (this.profileName) {
      this.profileName.textContent = activeDisplayName;
    }

    if (this.profileAvatar instanceof HTMLImageElement) {
      if (this.profileAvatar.src !== activeAvatarSrc) {
        this.profileAvatar.src = activeAvatarSrc;
      }
      this.profileAvatar.alt = hasActiveProfile
        ? `${activeDisplayName} avatar`
        : "Default profile avatar";
    } else if (this.profileAvatar instanceof HTMLElement) {
      this.profileAvatar.setAttribute("data-avatar-src", activeAvatarSrc);
    }

    if (this.profileNpub) {
      if (hasActiveProfile && activeMeta?.npub) {
        const displayNpub = formatNpub(activeMeta.npub);
        this.profileNpub.textContent = displayNpub || "npub unavailable";
      } else if (hasActiveProfile) {
        this.profileNpub.textContent = "npub unavailable";
      } else {
        this.profileNpub.textContent = "Link a profile to get started";
      }
    }

    if (this.channelLink instanceof HTMLElement) {
      if (hasActiveProfile && activeMeta?.npub) {
        const encodedNpub = activeMeta.npub;
        this.channelLink.href = `#view=channel-profile&npub=${encodeURIComponent(
          encodedNpub,
        )}`;
        this.channelLink.dataset.targetNpub = encodedNpub;
        this.channelLink.classList.remove("hidden");
        this.channelLink.setAttribute("aria-hidden", "false");
      } else {
        this.channelLink.classList.add("hidden");
        this.channelLink.removeAttribute("href");
        if (this.channelLink.dataset) {
          delete this.channelLink.dataset.targetNpub;
        }
        this.channelLink.setAttribute("aria-hidden", "true");
      }
    }

    if (this.globalProfileAvatar instanceof HTMLImageElement) {
      if (this.globalProfileAvatar.src !== activeAvatarSrc) {
        this.globalProfileAvatar.src = activeAvatarSrc;
      }
      this.globalProfileAvatar.alt = hasActiveProfile
        ? `${activeDisplayName} avatar`
        : this.globalProfileAvatar.alt || "Profile avatar";
    }

    const listEl = this.switcherList;
    if (listEl instanceof HTMLElement) {
      listEl.innerHTML = "";
      let normalizedSelection = this.normalizeHexPubkey(
        this.profileSwitcherSelectionPubkey,
      );
      if (normalizedSelection && normalizedSelection === normalizedActive) {
        normalizedSelection = null;
        this.profileSwitcherSelectionPubkey = null;
      }

      const entriesToRender = savedEntries.filter((entry) => {
        const normalized = this.normalizeHexPubkey(entry.pubkey);
        return normalized && normalized !== normalizedActive;
      });

      if (!entriesToRender.length) {
        listEl.setAttribute("data-profile-switcher-empty", "true");
        const helper = document.createElement("p");
        helper.className = "text-sm text-muted";
        helper.textContent = "No other profiles saved yet.";
        helper.setAttribute("role", "note");
        listEl.appendChild(helper);
      } else {
        listEl.removeAttribute("data-profile-switcher-empty");

        entriesToRender.forEach((entry) => {
          const meta = resolveMeta(entry);
          const button = document.createElement("button");
          button.type = "button";
          button.className =
            "card focus-ring flex w-full items-center gap-4 p-4 text-left transition";
          button.dataset.pubkey = entry.pubkey;
          if (meta.npub) {
            button.dataset.npub = meta.npub;
          }
          const normalizedAuthType =
            typeof entry.authType === "string" && entry.authType.trim()
              ? entry.authType.trim()
              : null;
          if (normalizedAuthType) {
            button.dataset.authType = normalizedAuthType;
          }

          const normalizedPubkey = this.normalizeHexPubkey(entry.pubkey);
          const isSelected =
            normalizedSelection && normalizedPubkey === normalizedSelection;
          if (isSelected) {
            button.dataset.state = "active";
            button.setAttribute("aria-pressed", "true");
          } else {
            delete button.dataset.state;
            button.setAttribute("aria-pressed", "false");
          }

          const avatarSpan = document.createElement("span");
          avatarSpan.className =
            "flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-overlay-strong bg-overlay-panel-soft";
          const avatarImg = document.createElement("img");
          avatarImg.className = "h-full w-full object-cover";
          avatarImg.src = meta.picture || FALLBACK_PROFILE_AVATAR;
          const cardDisplayName =
            meta.name?.trim() ||
            (meta.npub
              ? formatNpub(meta.npub) || DEFAULT_SAVED_PROFILE_LABEL
              : DEFAULT_SAVED_PROFILE_LABEL);
          avatarImg.alt = `${cardDisplayName} avatar`;
          avatarSpan.appendChild(avatarImg);

          const metaSpan = document.createElement("div");
          metaSpan.className = "flex min-w-0 flex-1 flex-col gap-2";

          const topLine = document.createElement("div");
          topLine.className = "flex flex-wrap items-center gap-3";

          const providerId = this.getEntryProviderId(entry);
          const providerInfo = this.resolveEntryProviderMetadata(entry);
          const providerLabel =
            (providerInfo && providerInfo.label) || DEFAULT_SAVED_PROFILE_LABEL;
          const badgeVariant = resolveProviderBadgeClass(
            providerInfo && providerInfo.badgeVariant,
          );

          const label = document.createElement("span");
          label.className = `${PROVIDER_BADGE_BASE_CLASS} ${badgeVariant}`;
          label.textContent = providerLabel;
          label.dataset.providerVariant =
            (providerInfo && providerInfo.badgeVariant) || "neutral";
          if (providerId) {
            label.dataset.providerId = providerId;
          } else if (providerInfo && providerInfo.id) {
            label.dataset.providerId = providerInfo.id;
          }

          const action = document.createElement("span");
          action.className = "text-xs font-medium text-muted";
          action.setAttribute("aria-hidden", "true");
          action.textContent = isSelected ? "Selected" : "Switch";

          topLine.append(label, action);

          const nameSpan = document.createElement("span");
          nameSpan.className = "truncate text-sm font-semibold text-primary";
          nameSpan.textContent = cardDisplayName;

          const npubSpan = document.createElement("span");
          npubSpan.className = "break-all font-mono text-xs text-muted";
          if (meta.npub) {
            const displayNpub = formatNpub(meta.npub);
            npubSpan.textContent = displayNpub || "npub unavailable";
          } else {
            npubSpan.textContent = "npub unavailable";
          }

          metaSpan.append(topLine, nameSpan, npubSpan);
          button.append(avatarSpan, metaSpan);

          const ariaLabel = isSelected
            ? `${cardDisplayName} selected`
            : `Switch to ${cardDisplayName}`;
          button.setAttribute("aria-label", ariaLabel);

          const datasetProviderId =
            providerId || (providerInfo && providerInfo.id) || "";

          if (datasetProviderId) {
            button.dataset.providerId = datasetProviderId;
          } else {
            delete button.dataset.providerId;
          }

          const activateProfile = async (event) => {
            if (event) {
              event.preventDefault();
              event.stopPropagation();
            }

            if (button.dataset.loading === "true") {
              return;
            }

            button.dataset.loading = "true";
            button.setAttribute("aria-busy", "true");

            const logProviderId =
              providerId || (providerInfo && providerInfo.id) || normalizedAuthType || "unknown";

            try {
              await this.switchProfile(entry.pubkey, {
                entry,
                providerId: providerId || null,
              });
            } catch (error) {
              userLogger.error(
                `[ProfileModalController] Failed to switch profile for provider ${logProviderId}:`,
                error,
              );
            } finally {
              button.dataset.loading = "false";
              button.setAttribute("aria-busy", "false");
            }
          };

          button.addEventListener("click", activateProfile);
          button.addEventListener("keydown", (event) => {
            const key = event?.key;
            if (key === "Enter" || key === " " || key === "Spacebar") {
              activateProfile(event);
            }
          });

          listEl.appendChild(button);
        });
      }

      this.updateFocusTrap();
    } else {
      this.updateFocusTrap();
    }

    if (entriesNeedingFetch.size) {
      this.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  createCompactProfileSummary({
    displayName,
    displayNpub,
    avatarSrc,
    size = "sm",
  } = {}) {
    const sizeClassMap = {
      xs: "h-8 w-8",
      sm: "h-10 w-10",
      md: "h-12 w-12",
    };
    const avatarSize = sizeClassMap[size] || sizeClassMap.sm;
    const safeName = displayName?.trim() || "Unknown profile";
    const safeNpub = displayNpub?.trim() || "npub unavailable";
    const avatarUrl = avatarSrc || FALLBACK_PROFILE_AVATAR;

    const container = document.createElement("div");
    container.className = "min-w-0 flex flex-1 items-center gap-2";

    const avatarWrapper = document.createElement("span");
    avatarWrapper.className = `flex ${avatarSize} flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-overlay-strong bg-overlay-panel-soft`;

    const avatarImg = document.createElement("img");
    avatarImg.className = "h-full w-full object-cover";
    avatarImg.src = avatarUrl;
    avatarImg.alt = `${safeName} avatar`;
    avatarWrapper.appendChild(avatarImg);

    const textStack = document.createElement("div");
    textStack.className = "min-w-0 flex flex-col";

    const nameEl = document.createElement("p");
    nameEl.className = "truncate text-xs font-semibold text-primary";
    nameEl.textContent = safeName;

    const npubEl = document.createElement("p");
    npubEl.className = "break-all font-mono text-2xs text-muted";
    npubEl.textContent = safeNpub;

    textStack.append(nameEl, npubEl);

    container.append(avatarWrapper, textStack);

    return container;
  }

  createViewChannelButton({ targetNpub, displayNpub } = {}) {
    const normalizedTarget =
      typeof targetNpub === "string" && targetNpub.trim()
        ? targetNpub.trim()
        : "";
    if (!normalizedTarget) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-xs";
    button.textContent = "View channel";
    button.dataset.targetNpub = normalizedTarget;

    if (displayNpub && typeof displayNpub === "string") {
      button.setAttribute(
        "aria-label",
        `View channel ${displayNpub.trim() || normalizedTarget}`,
      );
      button.title = `View channel ${displayNpub.trim() || normalizedTarget}`;
    }

    button.addEventListener("click", () => {
      this.callbacks.onChannelLink(button, this);
    });

    return button;
  }

  createCopyNpubButton({ targetNpub, displayNpub } = {}) {
    const normalizedTarget =
      typeof targetNpub === "string" && targetNpub.trim()
        ? targetNpub.trim()
        : "";
    if (!normalizedTarget) {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-xs";
    button.textContent = "Copy npub";

    if (displayNpub && typeof displayNpub === "string") {
      button.setAttribute(
        "aria-label",
        `Copy ${displayNpub.trim() || normalizedTarget}`,
      );
      button.title = `Copy ${displayNpub.trim() || normalizedTarget}`;
    }

    const handleCopy = async () => {
      if (button.dataset.state === "loading") {
        return;
      }

      button.dataset.state = "loading";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      try {
        await this.copyNpubToClipboard(normalizedTarget, { displayNpub });
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
        delete button.dataset.state;
      }
    };

    button.addEventListener("click", () => {
      void handleCopy();
    });

    return button;
  }

  createRemoveButton({
    label = "Remove",
    confirmMessage,
    confirmValue,
    onRemove,
  } = {}) {
    if (typeof onRemove !== "function") {
      return null;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-xs profile-modal__remove-button";
    button.dataset.variant = "critical";
    button.dataset.role = "remove";
    button.textContent = label;

    const handleRemove = async () => {
      if (confirmMessage) {
        const replacement =
          typeof confirmValue === "string" && confirmValue.trim()
            ? confirmValue.trim()
            : "this entry";
        const prompt = confirmMessage.replace("{npub}", replacement);
        if (!window.confirm(prompt)) {
          return;
        }
      }

      button.disabled = true;
      button.setAttribute("aria-busy", "true");

      try {
        await onRemove(button);
      } catch (error) {
        userLogger.error("Failed to remove entry:", error);
      } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    };

    button.addEventListener("click", () => {
      void handleRemove();
    });

    return button;
  }

  async copyNpubToClipboard(npub, { displayNpub } = {}) {
    const normalized =
      typeof npub === "string" && npub.trim() ? npub.trim() : "";
    if (!normalized) {
      this.showError("Unable to copy npub. Invalid value provided.");
      return { copied: false, reason: "invalid" };
    }

    const clipboard = (() => {
      if (
        this.services?.clipboard &&
        typeof this.services.clipboard.writeText === "function"
      ) {
        return this.services.clipboard;
      }
      if (
        typeof navigator !== "undefined" &&
        navigator?.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        return navigator.clipboard;
      }
      return null;
    })();

    if (!clipboard) {
      this.showError("Copy to clipboard is not supported in this browser.");
      return { copied: false, reason: "unsupported" };
    }

    try {
      await clipboard.writeText(normalized);
      this.showSuccess("npub copied to clipboard!");
      return { copied: true };
    } catch (error) {
      userLogger.error("Failed to copy npub:", error);
      this.showError("Failed to copy npub. Please try again.");
      return { copied: false, error };
    }
  }

  setupLayoutBreakpointObserver() {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      this.largeLayoutQuery = null;
      this.largeLayoutQueryListener = null;
      this.isLargeLayoutActiveFlag = false;
      return;
    }

    if (this.largeLayoutQuery && this.largeLayoutQueryListener) {
      this.teardownLayoutBreakpointObserver();
    }

    try {
      const query = window.matchMedia("(min-width: 1024px)");
      const handler = (event) => {
        const matches =
          typeof event?.matches === "boolean" ? event.matches : query.matches;
        this.handleLayoutBreakpointChange(matches);
      };
      this.largeLayoutQuery = query;
      this.largeLayoutQueryListener = handler;

      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", handler);
      } else if (typeof query.addListener === "function") {
        query.addListener(handler);
      }

      this.handleLayoutBreakpointChange(query.matches);
    } catch (error) {
      this.largeLayoutQuery = null;
      this.largeLayoutQueryListener = null;
      devLogger.warn(
        "[profileModal] Failed to initialize responsive breakpoint observer:",
        error,
      );
      this.handleLayoutBreakpointChange(false);
    }
  }

  teardownLayoutBreakpointObserver() {
    const query = this.largeLayoutQuery;
    const handler = this.largeLayoutQueryListener;
    if (query && handler) {
      if (typeof query.removeEventListener === "function") {
        query.removeEventListener("change", handler);
      } else if (typeof query.removeListener === "function") {
        query.removeListener(handler);
      }
    }
    this.largeLayoutQuery = null;
    this.largeLayoutQueryListener = null;
  }

  handleLayoutBreakpointChange(matches) {
    const isLarge = Boolean(matches);
    this.isLargeLayoutActiveFlag = isLarge;
    if (isLarge) {
      this.setMobileView("pane", { skipFocusTrap: false });
      return;
    }

    const targetView = this.lastMobileViewState || this.mobileViewState || "menu";
    this.setMobileView(targetView, { skipFocusTrap: false });
  }

  isLargeLayoutActive() {
    return Boolean(this.isLargeLayoutActiveFlag);
  }

  isMobileLayoutActive() {
    return !this.isLargeLayoutActive();
  }

  focusActiveNavButton() {
    const active = this.getActivePane();
    const candidates = [];
    if (active && this.navButtons[active] instanceof HTMLElement) {
      candidates.push(this.navButtons[active]);
    }
    Object.values(this.navButtons).forEach((button) => {
      if (
        button instanceof HTMLElement &&
        !candidates.includes(button) &&
        !button.classList.contains("hidden")
      ) {
        candidates.push(button);
      }
    });

    const target = candidates.find((button) => button instanceof HTMLElement);
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      try {
        target.focus();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to focus active navigation button:",
          error,
        );
      }
    });
  }

  setMobileView(view = "menu", options = {}) {
    const normalizedView = view === "pane" ? "pane" : "menu";
    const settings =
      options && typeof options === "object" ? options : { skipFocusTrap: false };
    const skipFocusTrap = Boolean(settings.skipFocusTrap);
    const focusMenu = Boolean(settings.focusMenu);

    const layoutElement =
      this.profileModalLayout instanceof HTMLElement
        ? this.profileModalLayout
        : null;
    const paneWrapper =
      this.profileModalPaneWrapper instanceof HTMLElement
        ? this.profileModalPaneWrapper
        : null;
    const menuWrapper =
      this.profileModalMenu instanceof HTMLElement
        ? this.profileModalMenu
        : null;
    const panelElement =
      this.profileModalPanel instanceof HTMLElement
        ? this.profileModalPanel
        : null;
    const rootElement =
      this.profileModalRoot instanceof HTMLElement ? this.profileModalRoot : null;
    const backButton =
      this.profileModalBackButton instanceof HTMLElement
        ? this.profileModalBackButton
        : null;

    const isLarge = this.isLargeLayoutActive();
    this.mobileViewState = normalizedView;
    if (!isLarge) {
      this.lastMobileViewState = normalizedView;
    }

    if (layoutElement) {
      layoutElement.dataset.mobileView = normalizedView;
    }
    if (panelElement) {
      panelElement.dataset.mobileView = normalizedView;
    }
    if (rootElement) {
      rootElement.dataset.mobileView = normalizedView;
    }

    const menuHidden = !isLarge && normalizedView === "pane";
    const paneHidden = !isLarge && normalizedView === "menu";

    if (menuWrapper) {
      menuWrapper.setAttribute("aria-hidden", menuHidden ? "true" : "false");
      if (menuHidden) {
        menuWrapper.classList.add("hidden");
        menuWrapper.setAttribute("hidden", "");
      } else {
        menuWrapper.classList.remove("hidden");
        menuWrapper.removeAttribute("hidden");
      }
    }

    if (paneWrapper) {
      paneWrapper.setAttribute("aria-hidden", paneHidden ? "true" : "false");
      if (paneHidden) {
        paneWrapper.classList.add("hidden");
        paneWrapper.setAttribute("hidden", "");
      } else {
        paneWrapper.classList.remove("hidden");
        paneWrapper.removeAttribute("hidden");
      }
    }

    if (backButton) {
      if (isLarge || normalizedView === "menu") {
        backButton.classList.add("hidden");
        backButton.setAttribute("aria-hidden", "true");
      } else {
        backButton.classList.remove("hidden");
        backButton.setAttribute("aria-hidden", "false");
      }
    }

    if (!skipFocusTrap) {
      this.updateFocusTrap();
    }

    if (focusMenu && normalizedView === "menu") {
      this.focusActiveNavButton();
    }

    return normalizedView;
  }

  selectPane(name = "account", options = {}) {
    const { keepMenuView = false } =
      options && typeof options === "object" ? options : {};
    const normalized = typeof name === "string" ? name.toLowerCase() : "account";
    const previous = this.getActivePane();
    const availableKeys = Object.keys(this.panes).filter((key) => {
      const pane = this.panes[key];
      if (!(pane instanceof HTMLElement)) {
        return false;
      }
      const button = this.navButtons[key];
      if (button instanceof HTMLElement && button.classList.contains("hidden")) {
        return false;
      }
      return true;
    });

    const fallbackTarget = availableKeys.includes("account")
      ? "account"
      : availableKeys[0] || "account";
    const target = availableKeys.includes(normalized)
      ? normalized
      : fallbackTarget;

    if (previous === "history" && target !== "history") {
      try {
        this.profileHistoryRenderer?.pause();
      } catch (error) {
        userLogger.warn("[profileModal] Failed to pause history renderer:", error);
      }
    }

    Object.entries(this.panes).forEach(([key, pane]) => {
      if (!(pane instanceof HTMLElement)) {
        return;
      }
      const isActive = key === target;
      pane.classList.toggle("hidden", !isActive);
      pane.setAttribute("aria-hidden", (!isActive).toString());
    });

    Object.entries(this.navButtons).forEach(([key, button]) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const isActive = key === target;
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) {
        button.dataset.state = "active";
      } else {
        delete button.dataset.state;
      }
    });

    this.setActivePane(target);
    const isMobile = this.isMobileLayoutActive();
    const shouldStayInMenu = keepMenuView && isMobile;
    this.setMobileView(shouldStayInMenu ? "menu" : "pane");

    if (target === "history") {
      void this.populateProfileWatchHistory();
    } else if (target === "wallet") {
      this.refreshWalletPaneState();
    } else if (target === "blocked") {
      this.populateBlockedList();
    }

    this.callbacks.onSelectPane(target, { controller: this });
    this.callbacks.onPaneShown(target, { controller: this });
  }

  populateProfileRelays(relayEntries = null) {
    if (!this.relayList) {
      return;
    }

    const sourceEntries = Array.isArray(relayEntries)
      ? relayEntries
      : this.services.relayManager.getEntries();

    const relays = sourceEntries
      .map((entry) => {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          return trimmed ? { url: trimmed, mode: "both" } : null;
        }
        if (entry && typeof entry === "object") {
          const url = typeof entry.url === "string" ? entry.url.trim() : "";
          if (!url) {
            return null;
          }
          const mode = typeof entry.mode === "string" ? entry.mode : "both";
          const normalizedMode =
            mode === "read" || mode === "write" ? mode : "both";
          return {
            url,
            mode: normalizedMode,
            read: entry.read !== false,
            write: entry.write !== false,
          };
        }
        return null;
      })
      .filter((entry) => entry && typeof entry.url === "string");

    this.relayList.innerHTML = "";

    if (!relays.length) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-surface-strong p-4 text-center text-sm text-muted";
      emptyState.textContent = "No relays configured.";
      this.relayList.appendChild(emptyState);
      return;
    }

    relays.forEach((entry) => {
      const item = document.createElement("li");
      item.className =
        "card flex items-start justify-between gap-4 p-4";

      const info = document.createElement("div");
      info.className = "flex-1 min-w-0";

      const urlEl = document.createElement("p");
      urlEl.className = "text-sm font-medium text-primary break-all";
      urlEl.textContent = entry.url;

      const statusEl = document.createElement("p");
      statusEl.className = "mt-1 text-xs text-muted";
      let modeLabel = "Read & write";
      if (entry.mode === "read") {
        modeLabel = "Read only";
      } else if (entry.mode === "write") {
        modeLabel = "Write only";
      }
      statusEl.textContent = modeLabel;

      info.appendChild(urlEl);
      info.appendChild(statusEl);

      const actions = document.createElement("div");
      actions.className = "flex items-center gap-2";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn-ghost focus-ring text-xs";
      editBtn.textContent = "Change mode";
      editBtn.title = "Cycle between read-only, write-only, or read/write modes.";
      editBtn.addEventListener("click", () => {
        void this.handleRelayModeToggle(entry.url);
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-ghost focus-ring text-xs";
      removeBtn.dataset.variant = "danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        void this.handleRemoveRelay(entry.url);
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      item.appendChild(info);
      item.appendChild(actions);

      this.relayList.appendChild(item);
    });
  }

  async handleRelayOperation(meta = {}, {
    successMessage = "Relay preferences updated.",
    skipPublishIfUnchanged = true,
    unchangedMessage = null,
  } = {}) {
    const operationContext = {
      ...meta,
      ok: false,
      changed: false,
      reason: null,
      error: null,
      publishResult: null,
      operationResult: null,
    };

    const activePubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activePubkey) {
      this.showError("Please login to manage your relays.");
      operationContext.reason = "no-active-pubkey";
      return operationContext;
    }

    let result;
    try {
      result = await this.runRelayOperation({
        ...meta,
        activePubkey,
        skipPublishIfUnchanged,
      });
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to update relay preferences.";
      operationContext.reason = error?.code || "callback-error";
      operationContext.error = error;
      this.showError(message);
      return operationContext;
    }

    if (result && typeof result === "object") {
      operationContext.ok = Boolean(result.ok);
      operationContext.changed = Boolean(result.changed);
      operationContext.reason =
        typeof result.reason === "string" ? result.reason : operationContext.reason;
      operationContext.error = result.error ?? operationContext.error;
      operationContext.publishResult =
        result.publishResult ?? operationContext.publishResult;
      operationContext.operationResult =
        result.operationResult ?? operationContext.operationResult;
    }

    if (!operationContext.changed && skipPublishIfUnchanged) {
      const reason = operationContext.reason || "unchanged";
      operationContext.reason = reason;
      if (reason === "duplicate") {
        this.showSuccess("Relay is already configured.");
      } else if (typeof unchangedMessage === "string" && unchangedMessage) {
        this.showSuccess(unchangedMessage);
      }
      this.populateProfileRelays();
      return operationContext;
    }

    this.populateProfileRelays();

    if (operationContext.ok) {
      if (successMessage) {
        this.showSuccess(successMessage);
      }
      return operationContext;
    }

    const message =
      operationContext.error &&
      typeof operationContext.error.message === "string" &&
      operationContext.error.message.trim()
        ? operationContext.error.message.trim()
        : "Failed to publish relay configuration. Please try again.";

    if (operationContext.reason !== "no-active-pubkey") {
      this.showError(message);
    }

    return operationContext;
  }

  async handleAddRelay() {
    const rawValue =
      typeof this.relayInput?.value === "string"
        ? this.relayInput.value
        : "";
    const trimmed = rawValue.trim();

    const context = {
      input: this.relayInput,
      rawValue,
      url: trimmed,
      result: null,
      success: false,
      reason: null,
    };

    if (!trimmed) {
      this.showError("Enter a relay URL to add.");
      context.reason = "empty";
      this.callbacks.onAddRelay(context, this);
      return context;
    }

    const operationResult = await this.handleRelayOperation(
      { action: "add", url: trimmed },
      {
        successMessage: "Relay saved.",
        unchangedMessage: "Relay is already configured.",
      },
    );

    if (this.relayInput) {
      this.relayInput.value = "";
    }

    context.result = operationResult;
    context.success = !!operationResult?.ok;
    context.reason = operationResult?.reason || null;

    this.callbacks.onAddRelay(context, this);
    return context;
  }

  async handleRestoreRelays() {
    const context = {
      confirmed: false,
      result: null,
      success: false,
      reason: null,
    };

    const confirmed = window.confirm("Restore the recommended relay defaults?");
    context.confirmed = confirmed;
    if (!confirmed) {
      context.reason = "cancelled";
      this.callbacks.onRestoreRelays(context, this);
      return context;
    }

    const operationResult = await this.handleRelayOperation(
      { action: "restore" },
      {
        successMessage: "Relay defaults restored.",
        unchangedMessage: "Relay defaults are already in use.",
      },
    );

    context.result = operationResult;
    context.success = !!operationResult?.ok;
    context.reason = operationResult?.reason || null;

    this.callbacks.onRestoreRelays(context, this);
    this.callbacks.onRelayRestore({
      controller: this,
      context,
    });
    return context;
  }

  async handleRelayModeToggle(url) {
    if (!url) {
      return;
    }
    const context = await this.handleRelayOperation(
      { action: "mode-toggle", url },
      { successMessage: "Relay mode updated." },
    );
    this.callbacks.onRelayModeToggle({
      controller: this,
      url,
      context,
    });
  }

  async handleRemoveRelay(url) {
    if (!url) {
      return;
    }

    const confirmed = window.confirm(
      `Remove ${url} from your relay list?`,
    );
    if (!confirmed) {
      return;
    }

    await this.handleRelayOperation(
      { action: "remove", url },
      { successMessage: "Relay removed." },
    );
  }

  ensureBlockListStatusElement() {
    if (this.blockListStatus instanceof HTMLElement) {
      return this.blockListStatus;
    }

    const anchor =
      this.blockList instanceof HTMLElement
        ? this.blockList
        : this.blockListEmpty instanceof HTMLElement
        ? this.blockListEmpty
        : null;

    if (!anchor || !(anchor.parentElement instanceof HTMLElement)) {
      return null;
    }

    const existing = anchor.parentElement.querySelector(
      '[data-role="blocked-list-status"]',
    );
    if (existing instanceof HTMLElement) {
      this.blockListStatus = existing;
      return existing;
    }

    const status = document.createElement("div");
    status.dataset.role = "blocked-list-status";
    status.className = "mt-4 flex items-center gap-3 text-sm text-muted hidden";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    if (this.blockList instanceof HTMLElement) {
      anchor.parentElement.insertBefore(status, this.blockList);
    } else {
      anchor.parentElement.appendChild(status);
    }

    this.blockListStatus = status;
    return status;
  }

  setBlockListLoadingState(state = "idle", options = {}) {
    const statusEl = this.ensureBlockListStatusElement();
    if (!statusEl) {
      this.blockListLoadingState = state;
      return;
    }

    const message =
      typeof options.message === "string" && options.message.trim()
        ? options.message.trim()
        : "";

    statusEl.innerHTML = "";
    statusEl.classList.remove("text-status-warning");
    statusEl.classList.add("text-muted");
    statusEl.classList.add("hidden");

    this.blockListLoadingState = state;

    if (state === "loading") {
      if (this.blockListEmpty instanceof HTMLElement) {
        this.blockListEmpty.classList.add("hidden");
      }

      const spinner = document.createElement("span");
      spinner.className = "status-spinner status-spinner--inline";
      spinner.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = message || "Loading blocked creators…";

      statusEl.appendChild(spinner);
      statusEl.appendChild(text);
      statusEl.classList.remove("hidden");
      return;
    }

    if (state === "error") {
      statusEl.classList.remove("text-muted");
      statusEl.classList.add("text-status-warning");

      if (this.blockListEmpty instanceof HTMLElement) {
        this.blockListEmpty.classList.add("hidden");
      }

      const text = document.createElement("span");
      text.textContent =
        message || "Blocked creators may be out of date. Try again later.";

      statusEl.appendChild(text);
      statusEl.classList.remove("hidden");
    }
  }

  populateBlockedList(blocked = null) {
    if (!this.blockList || !this.blockListEmpty) {
      if (this.blockListLoadingState === "loading") {
        this.setBlockListLoadingState("idle");
      }
      return;
    }

    const sourceEntries =
      Array.isArray(blocked) && blocked.length
        ? blocked
        : this.services.userBlocks.getBlockedPubkeys();

    const normalizedEntries = [];
    const pushEntry = (hex, label) => {
      if (!hex || !label) {
        return;
      }
      normalizedEntries.push({ hex, label });
    };

    sourceEntries.forEach((entry) => {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (!trimmed) {
          return;
        }

        if (trimmed.startsWith("npub1")) {
          const decoded = this.safeDecodeNpub(trimmed);
          if (!decoded) {
            return;
          }
          const label = this.safeEncodeNpub(decoded) || trimmed;
          pushEntry(decoded, label);
          return;
        }

        if (/^[0-9a-f]{64}$/i.test(trimmed)) {
          const hex = trimmed.toLowerCase();
          const label = this.safeEncodeNpub(hex) || hex;
          pushEntry(hex, label);
        }
        return;
      }

      if (entry && typeof entry === "object") {
        const candidateNpub =
          typeof entry.npub === "string" ? entry.npub.trim() : "";
        const candidateHex =
          typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";

        if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
          const normalizedHex = candidateHex.toLowerCase();
          const label =
            candidateNpub && candidateNpub.startsWith("npub1")
              ? candidateNpub
              : this.safeEncodeNpub(normalizedHex) || normalizedHex;
          pushEntry(normalizedHex, label);
          return;
        }

        if (candidateNpub && candidateNpub.startsWith("npub1")) {
          const decoded = this.safeDecodeNpub(candidateNpub);
          if (!decoded) {
            return;
          }
          const label = this.safeEncodeNpub(decoded) || candidateNpub;
          pushEntry(decoded, label);
        }
      }
    });

    const deduped = [];
    const seenHex = new Set();
    normalizedEntries.forEach((entry) => {
      if (!seenHex.has(entry.hex)) {
        seenHex.add(entry.hex);
        deduped.push(entry);
      }
    });

    this.blockList.innerHTML = "";

    if (!deduped.length) {
      this.blockListEmpty.classList.remove("hidden");
      this.blockList.classList.add("hidden");
      if (this.blockListLoadingState === "loading") {
        this.setBlockListLoadingState("idle");
      }
      return;
    }

    this.blockListEmpty.classList.add("hidden");
    this.blockList.classList.remove("hidden");

    const formatNpub =
      typeof this.formatShortNpub === "function"
        ? (value) => this.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");
    const entriesNeedingFetch = new Set();

    deduped.forEach(({ hex, label }) => {
      const item = document.createElement("li");
      item.className =
        "card flex items-center justify-between gap-4 p-4";

      let cachedProfile = null;
      if (hex) {
        const cacheEntry = this.services.getProfileCacheEntry(hex);
        cachedProfile = cacheEntry?.profile || null;
        if (!cacheEntry) {
          entriesNeedingFetch.add(hex);
        }
      }

      const encodedNpub =
        hex && typeof this.safeEncodeNpub === "function"
          ? this.safeEncodeNpub(hex)
          : label;
      const displayNpub = formatNpub(encodedNpub) || encodedNpub || label;
      const displayName =
        cachedProfile?.name?.trim() || displayNpub || "Blocked profile";
      const avatarSrc =
        cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

      const summary = this.createCompactProfileSummary({
        displayName,
        displayNpub,
        avatarSrc,
      });

      const actions = document.createElement("div");
      actions.className = "flex flex-wrap items-center justify-end gap-2";

      const viewButton = this.createViewChannelButton({
        targetNpub: encodedNpub,
        displayNpub,
      });
      if (viewButton) {
        actions.appendChild(viewButton);
      }

      const copyButton = this.createCopyNpubButton({
        targetNpub: encodedNpub,
        displayNpub,
      });
      if (copyButton) {
        actions.appendChild(copyButton);
      }

      const removeButton = this.createRemoveButton({
        label: "Remove",
        onRemove: () => this.handleRemoveBlockedCreator(hex),
      });
      if (removeButton) {
        removeButton.dataset.blockedHex = hex;
        actions.appendChild(removeButton);
      }

      item.appendChild(summary);
      if (actions.childElementCount > 0) {
        item.appendChild(actions);
      }

      this.blockList.appendChild(item);
    });

    if (this.blockListLoadingState === "loading") {
      this.setBlockListLoadingState("idle");
    }

    if (
      entriesNeedingFetch.size &&
      typeof this.services.batchFetchProfiles === "function"
    ) {
      this.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  async handleAddBlockedCreator() {
    const input = this.blockInput || null;
    const rawValue = typeof input?.value === "string" ? input.value : "";
    const trimmed = rawValue.trim();

    const context = {
      input,
      rawValue,
      value: trimmed,
      success: false,
      reason: null,
      error: null,
    };

    if (!input) {
      context.reason = "missing-input";
      this.callbacks.onAddBlocked(context, this);
      return context;
    }

    if (!trimmed) {
      this.showError("Enter an npub to block.");
      context.reason = "empty";
      this.callbacks.onAddBlocked(context, this);
      return context;
    }

    const activePubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activePubkey) {
      this.showError("Please login to manage your block list.");
      context.reason = "no-active-pubkey";
      this.callbacks.onAddBlocked(context, this);
      return context;
    }

    const actorHex = activePubkey;
    let targetHex = "";

    if (trimmed.startsWith("npub1")) {
      targetHex = this.safeDecodeNpub(trimmed) || "";
      if (!targetHex) {
        this.showError("Invalid npub. Please double-check and try again.");
        context.reason = "invalid-npub";
        this.callbacks.onAddBlocked(context, this);
        return context;
      }
    } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      targetHex = trimmed.toLowerCase();
    } else {
      this.showError("Enter a valid npub or hex pubkey.");
      context.reason = "invalid-value";
      this.callbacks.onAddBlocked(context, this);
      return context;
    }

    if (targetHex === actorHex) {
      this.showError("You cannot block yourself.");
      context.reason = "self";
      this.callbacks.onAddBlocked(context, this);
      return context;
    }

    context.targetHex = targetHex;

    try {
      const mutationResult = await this.mutateBlocklist({
        action: "add",
        actorHex,
        targetHex,
        controller: this,
      });

      context.result = mutationResult;

      if (mutationResult?.ok) {
        this.showSuccess(
          "Creator blocked. You won't see their videos anymore.",
        );
        context.success = true;
        context.reason = mutationResult.reason || "blocked";
      } else if (mutationResult?.reason === "already-blocked") {
        this.showSuccess("You already blocked this creator.");
        context.reason = "already-blocked";
      } else {
        const message =
          mutationResult?.error?.code === "nip04-missing"
            ? "Your Nostr extension must support NIP-04 to manage private lists."
            : mutationResult?.error?.message ||
              "Failed to update your block list. Please try again.";
        context.error = mutationResult?.error || null;
        context.reason = mutationResult?.reason || "service-error";
        if (message) {
          this.showError(message);
        }
      }

      if (this.blockInput) {
        this.blockInput.value = "";
      }
      this.populateBlockedList();
    } catch (error) {
      userLogger.error("Failed to add creator to personal block list:", error);
      context.error = error;
      context.reason = error?.code || "service-error";
      const message =
        error?.code === "nip04-missing"
          ? "Your Nostr extension must support NIP-04 to manage private lists."
          : "Failed to update your block list. Please try again.";
      this.showError(message);
    }

    this.callbacks.onAddBlocked(context, this);
    return context;
  }

  async handleRemoveBlockedCreator(candidate) {
    const activePubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activePubkey) {
      this.showError("Please login to manage your block list.");
      return;
    }

    let targetHex = "";
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return;
      }

      if (trimmed.startsWith("npub1")) {
        targetHex = this.safeDecodeNpub(trimmed) || "";
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        targetHex = trimmed.toLowerCase();
      }
    }

    if (!targetHex) {
      userLogger.warn("No valid pubkey to remove from block list:", candidate);
      return;
    }

    try {
      const mutationResult = await this.mutateBlocklist({
        action: "remove",
        actorHex: activePubkey,
        targetHex,
        controller: this,
      });

      if (mutationResult?.ok) {
        this.showSuccess("Creator removed from your block list.");
      } else if (mutationResult?.reason === "not-blocked") {
        this.showSuccess("Creator already removed from your block list.");
      } else if (mutationResult?.error) {
        const message =
          mutationResult.error.code === "nip04-missing"
            ? "Your Nostr extension must support NIP-04 to manage private lists."
            : mutationResult.error.message ||
              "Failed to update your block list. Please try again.";
        if (message) {
          this.showError(message);
        }
      }

      this.populateBlockedList();
    } catch (error) {
      userLogger.error(
        "Failed to remove creator from personal block list:",
        error,
      );
      const message =
        error?.code === "nip04-missing"
          ? "Your Nostr extension must support NIP-04 to manage private lists."
          : "Failed to update your block list. Please try again.";
      this.showError(message);
    }
  }

  async populateProfileWatchHistory() {
    const renderer = this.ensureProfileHistoryRenderer();
    if (!renderer) {
      return;
    }

    let primaryActor = this.normalizeHexPubkey(this.getActivePubkey());
    if (!primaryActor && this.services.nostrClient?.sessionActor?.pubkey) {
      const candidate = this.services.nostrClient.sessionActor.pubkey;
      if (typeof candidate === "string" && candidate) {
        primaryActor = candidate;
      }
    }

    try {
      await renderer.ensureInitialLoad({ actor: primaryActor });
      await renderer.refresh({
        actor: primaryActor,
        force: true,
      });

      if (!this.boundProfileHistoryVisibility) {
        this.boundProfileHistoryVisibility = () => {
          if (!this.profileHistoryRenderer) {
            return;
          }
          if (document.visibilityState === "visible") {
            this.profileHistoryRenderer.resume();
          } else {
            this.profileHistoryRenderer.pause();
          }
        };
        document.addEventListener(
          "visibilitychange",
          this.boundProfileHistoryVisibility,
        );
      }

      if (document.visibilityState === "hidden") {
        renderer.pause();
      } else {
        renderer.resume();
      }
    } catch (error) {
      userLogger.error(
        "[profileModal] Failed to populate watch history pane:",
        error,
      );
    }
  }

  applyWalletControlState() {
    const hasActive = Boolean(this.normalizeHexPubkey(this.getActivePubkey()));
    const busy = this.isWalletBusy();
    const uriValue =
      typeof this.walletUriInput?.value === "string"
        ? this.walletUriInput.value.trim()
        : "";
    const hasUri = uriValue.length > 0;

    const applyDisabledState = (element, disabled) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if ("disabled" in element) {
        element.disabled = disabled;
      }
      if (disabled) {
        element.setAttribute("aria-disabled", "true");
      } else {
        element.removeAttribute("aria-disabled");
      }
    };

    applyDisabledState(this.walletUriInput, busy || !hasActive);
    applyDisabledState(this.walletDefaultZapInput, busy || !hasActive);
    applyDisabledState(this.walletSaveButton, busy || !hasActive);

    const testDisabled = busy || !hasActive || !hasUri;
    applyDisabledState(this.walletTestButton, testDisabled);

    const disconnectDisabled = busy || !hasActive || !hasUri;
    applyDisabledState(this.walletDisconnectButton, disconnectDisabled);
    if (this.walletDisconnectButton instanceof HTMLElement) {
      this.walletDisconnectButton.classList.toggle("hidden", !hasUri);
      if (!hasUri) {
        this.walletDisconnectButton.setAttribute("aria-hidden", "true");
      } else {
        this.walletDisconnectButton.removeAttribute("aria-hidden");
      }
    }
  }

  updateWalletStatus(message, variant = "info") {
    if (!(this.walletStatusText instanceof HTMLElement)) {
      return;
    }

    const element = this.walletStatusText;
    const variants = {
      success: "text-status-success",
      error: "text-status-danger",
      info: "text-status-info",
      neutral: "text-status-neutral",
    };

    element.classList.remove(
      "text-status-info",
      "text-status-success",
      "text-status-danger",
      "text-status-neutral",
    );
    const variantClass = variants[variant] || variants.neutral;
    element.classList.add(variantClass);
    element.textContent = message || "";
  }

  refreshWalletPaneState() {
    const hasActive = Boolean(this.normalizeHexPubkey(this.getActivePubkey()));
    const setInputValue = (element, value) => {
      if (element && typeof element === "object" && "value" in element) {
        try {
          element.value = value;
        } catch (error) {
          if (element instanceof HTMLElement) {
            element.setAttribute("data-value", value);
          }
        }
      }
    };
    if (!hasActive) {
      setInputValue(this.walletUriInput, "");
      setInputValue(this.walletDefaultZapInput, "");
      this.updateWalletStatus("Sign in to connect a wallet.", "info");
      this.applyWalletControlState();
      return;
    }

    let settings = this.services.nwcSettings.getActiveNwcSettings();
    if (!settings || typeof settings !== "object") {
      settings = this.services.nwcSettings.createDefaultNwcSettings();
    }
    setInputValue(this.walletUriInput, settings.nwcUri || "");
    setInputValue(
      this.walletDefaultZapInput,
      settings.defaultZap === null || settings.defaultZap === undefined
        ? ""
        : String(settings.defaultZap),
    );

    if (settings.nwcUri) {
      this.updateWalletStatus(
        "Wallet connected via Nostr Wallet Connect.",
        "success",
      );
    } else {
      this.updateWalletStatus("No wallet connected yet.", "info");
    }

    this.applyWalletControlState();
  }

  getWalletFormValues() {
    const uri =
      typeof this.walletUriInput?.value === "string"
        ? this.walletUriInput.value.trim()
        : "";
    const defaultZapRaw =
      typeof this.walletDefaultZapInput?.value === "string"
        ? this.walletDefaultZapInput.value.trim()
        : "";

    if (defaultZapRaw) {
      const numeric = Number(defaultZapRaw);
      if (!Number.isFinite(numeric)) {
        return { uri, error: "Default zap amount must be a number." };
      }
      const rounded = Math.round(numeric);
      if (!Number.isFinite(rounded) || rounded < 0) {
        return {
          uri,
          error: "Default zap amount must be a positive whole number.",
        };
      }
      const clamped = Math.min(this.maxWalletDefaultZap, rounded);
      return { uri, defaultZap: clamped };
    }

    return { uri, defaultZap: null };
  }

  validateWalletUri(uri, { requireValue = false } = {}) {
    const value = typeof uri === "string" ? uri.trim() : "";
    if (!value) {
      if (requireValue) {
        return {
          valid: false,
          sanitized: "",
          message: "Enter a wallet connect URI before continuing.",
        };
      }
      return { valid: true, sanitized: "" };
    }

    if (!value.toLowerCase().startsWith(NWC_URI_SCHEME)) {
      return {
        valid: false,
        sanitized: value,
        message: `Wallet URI must start with ${NWC_URI_SCHEME}.`,
      };
    }

    return { valid: true, sanitized: value };
  }

  async handleWalletSave() {
    const { uri, defaultZap, error } = this.getWalletFormValues();
    const context = {
      uri,
      defaultZap: defaultZap ?? null,
      sanitizedUri: null,
      success: false,
      reason: null,
      error: error || null,
      status: null,
      variant: null,
    };

    if (this.isWalletBusy()) {
      context.reason = "busy";
      this.callbacks.onWalletSave(context, this);
      return context;
    }

    if (error) {
      this.updateWalletStatus(error, "error");
      this.showError(error);
      context.reason = "invalid-default-zap";
      if (this.walletDefaultZapInput instanceof HTMLElement) {
        this.walletDefaultZapInput.focus();
      }
      this.callbacks.onWalletSave(context, this);
      return context;
    }

    const { valid, sanitized, message } = this.validateWalletUri(uri);
    context.sanitizedUri = sanitized;
    if (!valid) {
      this.updateWalletStatus(message, "error");
      this.showError(message);
      context.reason = "invalid-uri";
      context.error = message;
      if (this.walletUriInput instanceof HTMLElement) {
        this.walletUriInput.focus();
      }
      this.callbacks.onWalletSave(context, this);
      return context;
    }

    const normalizedActive = this.normalizeHexPubkey(this.getActivePubkey());
    if (!normalizedActive) {
      const loginMessage = "Sign in to save wallet settings.";
      this.updateWalletStatus(loginMessage, "error");
      this.showError(loginMessage);
      context.reason = "no-active-pubkey";
      context.error = loginMessage;
      this.callbacks.onWalletSave(context, this);
      return context;
    }

    this.setWalletPaneBusy(true);
    let finalStatus = null;
    let finalVariant = "info";
    try {
      const persistResult = await this.persistWalletSettings({
        nwcUri: sanitized,
        defaultZap,
        activePubkey: normalizedActive,
      });
      context.persistResult = persistResult || null;

      if (sanitized) {
        finalStatus = "Wallet settings saved.";
        finalVariant = "success";
        this.showSuccess("Wallet settings saved.");
        context.reason = "saved";
      } else {
        finalStatus = "Wallet connection removed.";
        finalVariant = "info";
        this.showStatus("Wallet connection removed.");
        context.reason = "cleared";
      }
      context.success = true;
    } catch (error) {
      const fallbackMessage = "Failed to save wallet settings.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      finalStatus = detail;
      finalVariant = "error";
      context.error = detail;
      context.reason = error?.code || "service-error";
      this.showError(detail);
    } finally {
      this.setWalletPaneBusy(false);
      this.refreshWalletPaneState();
      if (finalStatus) {
        this.updateWalletStatus(finalStatus, finalVariant);
      }
      context.status = finalStatus;
      context.variant = finalVariant;
      this.callbacks.onWalletSave(context, this);
    }

    return context;
  }

  async handleWalletTest() {
    const { uri, defaultZap, error } = this.getWalletFormValues();
    const context = {
      uri,
      defaultZap: defaultZap ?? null,
      sanitizedUri: null,
      success: false,
      reason: null,
      error: error || null,
      status: null,
      variant: null,
      result: null,
    };

    if (this.isWalletBusy()) {
      context.reason = "busy";
      this.callbacks.onWalletTest(context, this);
      return context.result;
    }

    if (error) {
      this.updateWalletStatus(error, "error");
      this.showError(error);
      context.reason = "invalid-default-zap";
      if (this.walletDefaultZapInput instanceof HTMLElement) {
        this.walletDefaultZapInput.focus();
      }
      this.callbacks.onWalletTest(context, this);
      return context.result;
    }

    const { valid, sanitized, message } = this.validateWalletUri(uri, {
      requireValue: true,
    });
    context.sanitizedUri = sanitized;
    if (!valid) {
      this.updateWalletStatus(message, "error");
      this.showError(message);
      context.reason = "invalid-uri";
      context.error = message;
      if (this.walletUriInput instanceof HTMLElement) {
        this.walletUriInput.focus();
      }
      this.callbacks.onWalletTest(context, this);
      return context.result;
    }

    const normalizedActive = this.normalizeHexPubkey(this.getActivePubkey());
    if (!normalizedActive) {
      const loginMessage = "Sign in to test your wallet connection.";
      this.updateWalletStatus(loginMessage, "error");
      this.showError(loginMessage);
      context.reason = "no-active-pubkey";
      context.error = loginMessage;
      this.callbacks.onWalletTest(context, this);
      return context.result;
    }

    this.setWalletPaneBusy(true);
    let finalStatus = null;
    let finalVariant = "info";
    try {
      const result = await this.testWalletConnection({
        nwcUri: sanitized,
        defaultZap,
        activePubkey: normalizedActive,
      });
      finalStatus = "Wallet connection confirmed.";
      finalVariant = "success";
      this.showSuccess("Wallet connection confirmed.");
      context.result = result;
      context.success = true;
      context.reason = "tested";

      let currentSettings = this.services.nwcSettings.getActiveNwcSettings();
      if (!currentSettings || typeof currentSettings !== "object") {
        currentSettings = this.services.nwcSettings.createDefaultNwcSettings();
      }
      if (currentSettings.nwcUri === sanitized) {
        await this.persistWalletSettings({
          lastChecked: Date.now(),
          activePubkey: normalizedActive,
        });
      }
    } catch (error) {
      const fallbackMessage = "Failed to reach wallet.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      finalStatus = detail;
      finalVariant = "error";
      context.error = detail;
      context.reason = error?.code || "service-error";
      this.showError(detail);
    } finally {
      this.setWalletPaneBusy(false);
      this.refreshWalletPaneState();
      if (finalStatus) {
        this.updateWalletStatus(finalStatus, finalVariant);
      }
      context.status = finalStatus;
      context.variant = finalVariant;
      this.callbacks.onWalletTest(context, this);
    }

    return context.result;
  }

  async handleWalletDisconnect() {
    const context = {
      success: false,
      reason: null,
      error: null,
      status: null,
      variant: null,
    };

    if (this.isWalletBusy()) {
      context.reason = "busy";
      this.callbacks.onWalletDisconnect(context, this);
      return context;
    }

    const normalizedActive = this.normalizeHexPubkey(this.getActivePubkey());
    if (!normalizedActive) {
      const loginMessage = "Sign in to disconnect your wallet.";
      this.updateWalletStatus(loginMessage, "error");
      this.showError(loginMessage);
      context.reason = "no-active-pubkey";
      context.error = loginMessage;
      this.callbacks.onWalletDisconnect(context, this);
      return context;
    }

    this.setWalletPaneBusy(true);
    let finalStatus = null;
    let finalVariant = "info";
    try {
      const disconnectResult = await this.disconnectWallet({
        activePubkey: normalizedActive,
      });
      context.result = disconnectResult || null;
      finalStatus = "Wallet disconnected.";
      this.showStatus("Wallet disconnected.");
      context.success = true;
      context.reason = "disconnected";
    } catch (error) {
      const fallbackMessage = "Failed to disconnect wallet.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      finalStatus = detail;
      finalVariant = "error";
      context.error = detail;
      context.reason = error?.code || "service-error";
      this.showError(detail);
    } finally {
      this.setWalletPaneBusy(false);
      this.refreshWalletPaneState();
      if (finalStatus) {
        this.updateWalletStatus(finalStatus, finalVariant);
      }
      context.status = finalStatus;
      context.variant = finalVariant;
      this.callbacks.onWalletDisconnect(context, this);
    }

    return context;
  }

  getModerationSettingsService() {
    const service = this.services.moderationSettings;
    if (!service || typeof service !== "object") {
      return null;
    }
    return service;
  }

  getModerationSettingsDefaults() {
    const service = this.getModerationSettingsService();
    let defaults = null;

    if (service && typeof service.getDefaultModerationSettings === "function") {
      try {
        defaults = service.getDefaultModerationSettings();
      } catch (error) {
        devLogger.info("[profileModal] moderation defaults fallback used", error);
      }
    }

    if (!defaults || typeof defaults !== "object") {
      defaults = createInternalDefaultModerationSettings();
    }

    const sanitized = {
      blurThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.blurThreshold ?? DEFAULT_INTERNAL_MODERATION_SETTINGS.blurThreshold,
          ),
        ),
      ),
      autoplayBlockThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.autoplayBlockThreshold ??
              DEFAULT_INTERNAL_MODERATION_SETTINGS.autoplayBlockThreshold,
          ),
        ),
      ),
      trustedMuteHideThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.trustedMuteHideThreshold ??
              DEFAULT_INTERNAL_MODERATION_SETTINGS.trustedMuteHideThreshold,
          ),
        ),
      ),
      trustedSpamHideThreshold: Math.max(
        0,
        Math.floor(
          Number(
            defaults.trustedSpamHideThreshold ??
              DEFAULT_INTERNAL_MODERATION_SETTINGS.trustedSpamHideThreshold,
          ),
        ),
      ),
    };

    return sanitized;
  }

  normalizeModerationSettings(settings = null) {
    const defaults = this.getModerationSettingsDefaults();
    const blur = Number.isFinite(settings?.blurThreshold)
      ? Math.max(0, Math.floor(settings.blurThreshold))
      : defaults.blurThreshold;
    const autoplay = Number.isFinite(settings?.autoplayBlockThreshold)
      ? Math.max(0, Math.floor(settings.autoplayBlockThreshold))
      : defaults.autoplayBlockThreshold;
    const muteHide = Number.isFinite(settings?.trustedMuteHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedMuteHideThreshold))
      : defaults.trustedMuteHideThreshold;
    const spamHide = Number.isFinite(settings?.trustedSpamHideThreshold)
      ? Math.max(0, Math.floor(settings.trustedSpamHideThreshold))
      : defaults.trustedSpamHideThreshold;

    return {
      blurThreshold: blur,
      autoplayBlockThreshold: autoplay,
      trustedMuteHideThreshold: muteHide,
      trustedSpamHideThreshold: spamHide,
    };
  }

  readModerationInputs() {
    const defaults = this.getModerationSettingsDefaults();

    const parse = (input, fallback) => {
      if (!(input instanceof HTMLInputElement)) {
        return { value: fallback, override: null, valid: true };
      }

      const raw = typeof input.value === "string" ? input.value.trim() : "";
      if (!raw) {
        return { value: fallback, override: null, valid: true };
      }

      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        return { value: fallback, override: null, valid: false };
      }

      const sanitized = Math.max(0, Math.floor(numeric));
      return { value: sanitized, override: sanitized, valid: true };
    };

    const blur = parse(this.moderationBlurInput, defaults.blurThreshold);
    const autoplay = parse(
      this.moderationAutoplayInput,
      defaults.autoplayBlockThreshold,
    );
    const muteHide = parse(
      this.moderationMuteHideInput,
      defaults.trustedMuteHideThreshold,
    );
    const spamHide = parse(
      this.moderationSpamHideInput,
      defaults.trustedSpamHideThreshold,
    );

    const valid = blur.valid && autoplay.valid && muteHide.valid && spamHide.valid;
    const values = {
      blurThreshold: blur.value,
      autoplayBlockThreshold: autoplay.value,
      trustedMuteHideThreshold: muteHide.value,
      trustedSpamHideThreshold: spamHide.value,
    };
    const overrides = {
      blurThreshold: blur.override,
      autoplayBlockThreshold: autoplay.override,
      trustedMuteHideThreshold: muteHide.override,
      trustedSpamHideThreshold: spamHide.override,
    };

    return { defaults, values, overrides, valid };
  }

  applyModerationSettingsControlState({ resetStatus = false } = {}) {
    const result = this.readModerationInputs();

    const button = this.moderationSaveButton;
    if (button instanceof HTMLElement) {
      const baseline = this.currentModerationSettings || this.normalizeModerationSettings();
      const isDirty =
        result.valid &&
        (baseline.blurThreshold !== result.values.blurThreshold ||
          baseline.autoplayBlockThreshold !== result.values.autoplayBlockThreshold ||
          baseline.trustedMuteHideThreshold !==
            result.values.trustedMuteHideThreshold ||
          baseline.trustedSpamHideThreshold !==
            result.values.trustedSpamHideThreshold);
      button.disabled = !(result.valid && isDirty);
      if (button.disabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }
    }

    if (resetStatus) {
      this.updateModerationSettingsStatus("", "info");
    }

    return result;
  }

  areTrustedHideControlsEnabled() {
    if (
      RUNTIME_FLAGS &&
      typeof RUNTIME_FLAGS === "object" &&
      RUNTIME_FLAGS.FEATURE_TRUSTED_HIDE_CONTROLS === false
    ) {
      return false;
    }

    return true;
  }

  updateTrustedHideControlsVisibility() {
    const shouldShow = this.areTrustedHideControlsEnabled();
    const targets = new Set();

    if (this.moderationHideControlsGroup instanceof HTMLElement) {
      targets.add(this.moderationHideControlsGroup);
    }

    if (Array.isArray(this.moderationHideControlElements)) {
      for (const element of this.moderationHideControlElements) {
        if (element instanceof HTMLElement) {
          targets.add(element);
        }
      }
    }

    targets.forEach((element) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      if (shouldShow) {
        element.classList.remove("hidden");
        element.removeAttribute("hidden");
        element.removeAttribute("aria-hidden");
      } else {
        element.classList.add("hidden");
        element.setAttribute("hidden", "");
        element.setAttribute("aria-hidden", "true");
      }
    });
  }

  updateModerationSettingsStatus(message = "", variant = "info") {
    if (!(this.moderationStatusText instanceof HTMLElement)) {
      return;
    }

    const text = typeof message === "string" ? message : "";
    this.moderationStatusText.textContent = text;

    if (text) {
      this.moderationStatusText.dataset.variant = variant || "info";
    } else if (this.moderationStatusText.dataset.variant) {
      delete this.moderationStatusText.dataset.variant;
    }
  }

  refreshModerationSettingsUi() {
    const service = this.getModerationSettingsService();
    if (!service) {
      this.moderationSettingsDefaults = createInternalDefaultModerationSettings();
      this.currentModerationSettings = createInternalDefaultModerationSettings();
      this.updateTrustedHideControlsVisibility();
      this.applyModerationSettingsControlState({ resetStatus: true });
      return;
    }

    let active = null;
    if (typeof service.getActiveModerationSettings === "function") {
      try {
        active = service.getActiveModerationSettings();
      } catch (error) {
        devLogger.info("[profileModal] moderation settings fallback used", error);
      }
    }

    const defaults = this.getModerationSettingsDefaults();
    this.moderationSettingsDefaults = defaults;
    const normalized = this.normalizeModerationSettings(active);
    this.currentModerationSettings = normalized;

    if (this.moderationBlurInput instanceof HTMLInputElement) {
      this.moderationBlurInput.value = String(normalized.blurThreshold);
    }

    if (this.moderationAutoplayInput instanceof HTMLInputElement) {
      this.moderationAutoplayInput.value = String(
        normalized.autoplayBlockThreshold,
      );
    }

    if (this.moderationMuteHideInput instanceof HTMLInputElement) {
      this.moderationMuteHideInput.value = String(
        normalized.trustedMuteHideThreshold,
      );
    }

    if (this.moderationSpamHideInput instanceof HTMLInputElement) {
      this.moderationSpamHideInput.value = String(
        normalized.trustedSpamHideThreshold,
      );
    }

    this.updateTrustedHideControlsVisibility();

    this.applyModerationSettingsControlState({ resetStatus: true });
  }

  async handleModerationSettingsSave() {
    const service = this.getModerationSettingsService();
    const context = {
      success: false,
      reason: null,
      error: null,
      settings: null,
    };

    if (!service) {
      return context;
    }

    const inputState = this.applyModerationSettingsControlState();
    if (!inputState.valid) {
      const message =
        "Enter non-negative whole numbers for moderation thresholds.";
      this.updateModerationSettingsStatus(message, "error");
      this.showError(message);
      context.reason = "invalid-input";
      context.error = message;
      return context;
    }

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(inputState.overrides, "blurThreshold")) {
      payload.blurThreshold = inputState.overrides.blurThreshold;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        inputState.overrides,
        "autoplayBlockThreshold",
      )
    ) {
      payload.autoplayBlockThreshold = inputState.overrides.autoplayBlockThreshold;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        inputState.overrides,
        "trustedMuteHideThreshold",
      )
    ) {
      payload.trustedMuteHideThreshold =
        inputState.overrides.trustedMuteHideThreshold;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        inputState.overrides,
        "trustedSpamHideThreshold",
      )
    ) {
      payload.trustedSpamHideThreshold =
        inputState.overrides.trustedSpamHideThreshold;
    }

    try {
      const updated =
        typeof service.updateModerationSettings === "function"
          ? await service.updateModerationSettings(payload)
          : inputState.values;

      const normalized = this.normalizeModerationSettings(updated);
      this.currentModerationSettings = normalized;
      if (this.moderationBlurInput instanceof HTMLInputElement) {
        this.moderationBlurInput.value = String(normalized.blurThreshold);
      }
      if (this.moderationAutoplayInput instanceof HTMLInputElement) {
        this.moderationAutoplayInput.value = String(
          normalized.autoplayBlockThreshold,
        );
      }
      if (this.moderationMuteHideInput instanceof HTMLInputElement) {
        this.moderationMuteHideInput.value = String(
          normalized.trustedMuteHideThreshold,
        );
      }
      if (this.moderationSpamHideInput instanceof HTMLInputElement) {
        this.moderationSpamHideInput.value = String(
          normalized.trustedSpamHideThreshold,
        );
      }
      this.applyModerationSettingsControlState();
      this.updateModerationSettingsStatus("Moderation settings saved.", "success");
      this.showSuccess("Moderation settings saved.");
      context.success = true;
      context.reason = "saved";
      context.settings = normalized;
      this.callbacks.onModerationSettingsChange({
        settings: normalized,
        controller: this,
        reason: "saved",
      });
    } catch (error) {
      const fallbackMessage = "Failed to update moderation settings.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      this.updateModerationSettingsStatus(detail, "error");
      this.showError(detail);
      context.error = detail;
      context.reason = error?.code || "service-error";
    }

    return context;
  }

  async handleModerationSettingsReset() {
    const service = this.getModerationSettingsService();
    const context = {
      success: false,
      reason: null,
      error: null,
      settings: null,
    };

    if (!service) {
      return context;
    }

    try {
      const updated =
        typeof service.resetModerationSettings === "function"
          ? await service.resetModerationSettings()
          : createInternalDefaultModerationSettings();

      const normalized = this.normalizeModerationSettings(updated);
      this.currentModerationSettings = normalized;
      if (this.moderationBlurInput instanceof HTMLInputElement) {
        this.moderationBlurInput.value = String(normalized.blurThreshold);
      }
      if (this.moderationAutoplayInput instanceof HTMLInputElement) {
        this.moderationAutoplayInput.value = String(
          normalized.autoplayBlockThreshold,
        );
      }
      if (this.moderationMuteHideInput instanceof HTMLInputElement) {
        this.moderationMuteHideInput.value = String(
          normalized.trustedMuteHideThreshold,
        );
      }
      if (this.moderationSpamHideInput instanceof HTMLInputElement) {
        this.moderationSpamHideInput.value = String(
          normalized.trustedSpamHideThreshold,
        );
      }
      this.updateTrustedHideControlsVisibility();
      this.applyModerationSettingsControlState({ resetStatus: true });
      this.updateModerationSettingsStatus(
        "Moderation defaults restored.",
        "success",
      );
      this.showSuccess("Moderation defaults restored.");
      context.success = true;
      context.reason = "reset";
      context.settings = normalized;
      this.callbacks.onModerationSettingsChange({
        settings: normalized,
        controller: this,
        reason: "reset",
      });
    } catch (error) {
      const fallbackMessage = "Failed to restore moderation defaults.";
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallbackMessage;
      this.updateModerationSettingsStatus(detail, "error");
      this.showError(detail);
      context.error = detail;
      context.reason = error?.code || "service-error";
    }

    return context;
  }

  storeAdminEmptyMessages() {
    const capture = (element) => {
      if (element instanceof HTMLElement && !element.dataset.defaultMessage) {
        element.dataset.defaultMessage = element.textContent || "";
      }
    };

    capture(this.moderatorEmpty);
    capture(this.whitelistEmpty);
    capture(this.blacklistEmpty);
  }

  setAdminLoading(isLoading) {
    this.storeAdminEmptyMessages();
    if (this.panes.admin instanceof HTMLElement) {
      this.panes.admin.setAttribute("aria-busy", isLoading ? "true" : "false");
    }

    const toggleMessage = (element, message) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (isLoading) {
        element.textContent = message;
        element.classList.remove("hidden");
      } else {
        element.textContent = element.dataset.defaultMessage || element.textContent;
      }
    };

    toggleMessage(this.moderatorEmpty, "Loading moderators…");
    toggleMessage(this.whitelistEmpty, "Loading whitelist…");
    toggleMessage(this.blacklistEmpty, "Loading blacklist…");
  }

  clearAdminLists() {
    this.storeAdminEmptyMessages();
    if (this.adminModeratorList) {
      this.adminModeratorList.innerHTML = "";
    }
    if (this.whitelistList) {
      this.whitelistList.innerHTML = "";
    }
    if (this.blacklistList) {
      this.blacklistList.innerHTML = "";
    }
    if (this.moderatorEmpty instanceof HTMLElement) {
      this.moderatorEmpty.textContent =
        this.moderatorEmpty.dataset.defaultMessage ||
        this.moderatorEmpty.textContent;
      this.moderatorEmpty.classList.remove("hidden");
    }
    if (this.whitelistEmpty instanceof HTMLElement) {
      this.whitelistEmpty.textContent =
        this.whitelistEmpty.dataset.defaultMessage ||
        this.whitelistEmpty.textContent;
      this.whitelistEmpty.classList.remove("hidden");
    }
    if (this.blacklistEmpty instanceof HTMLElement) {
      this.blacklistEmpty.textContent =
        this.blacklistEmpty.dataset.defaultMessage ||
        this.blacklistEmpty.textContent;
      this.blacklistEmpty.classList.remove("hidden");
    }
  }

  normalizeAdminListEntries(entries) {
    const collected = [];
    const seen = new Set();

    const append = (value) => {
      if (typeof value !== "string") {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed || seen.has(trimmed)) {
        return;
      }
      seen.add(trimmed);
      collected.push(trimmed);
    };

    if (Array.isArray(entries)) {
      entries.forEach(append);
    } else if (entries && typeof entries?.[Symbol.iterator] === "function") {
      for (const entry of entries) {
        append(entry);
      }
    } else if (entries && typeof entries === "object") {
      Object.values(entries).forEach(append);
    }

    try {
      collected.sort((a, b) => a.localeCompare(b));
    } catch (error) {
      devLogger.warn(
        "[profileModal] Failed to sort admin list entries, using fallback order.",
        error,
      );
    }

    return collected;
  }

  renderAdminList(listEl, emptyEl, entries, options = {}) {
    if (!(listEl instanceof HTMLElement) || !(emptyEl instanceof HTMLElement)) {
      return;
    }

    const { onRemove, removeLabel = "Remove", confirmMessage, removable = true } =
      options;

    const formatNpub =
      typeof this.formatShortNpub === "function"
        ? (value) => this.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");

    const entriesNeedingFetch = new Set();

    listEl.innerHTML = "";

    const values = this.normalizeAdminListEntries(entries);

    const toggleHiddenState = (element, shouldHide) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      if (shouldHide) {
        element.classList.add("hidden");
        element.setAttribute("hidden", "");
      } else {
        element.classList.remove("hidden");
        element.removeAttribute("hidden");
      }
    };

    if (!values.length) {
      toggleHiddenState(emptyEl, false);
      toggleHiddenState(listEl, true);
      return;
    }

    toggleHiddenState(emptyEl, true);
    toggleHiddenState(listEl, false);

    values.forEach((npub) => {
      const item = document.createElement("li");
      item.className =
        "card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between";

      const normalizedNpub = typeof npub === "string" ? npub.trim() : "";
      const decodedHex =
        normalizedNpub && normalizedNpub.startsWith("npub1")
          ? this.safeDecodeNpub(normalizedNpub)
          : null;
      const normalizedHex =
        decodedHex && /^[0-9a-f]{64}$/i.test(decodedHex)
          ? decodedHex.toLowerCase()
          : null;

      let cachedProfile = null;
      if (normalizedHex) {
        const cacheEntry = this.services.getProfileCacheEntry(normalizedHex);
        cachedProfile = cacheEntry?.profile || null;
        if (!cacheEntry) {
          entriesNeedingFetch.add(normalizedHex);
        }
      }

      const encodedNpub =
        normalizedHex && typeof this.safeEncodeNpub === "function"
          ? this.safeEncodeNpub(normalizedHex)
          : normalizedNpub;
      const displayNpub = formatNpub(encodedNpub) || encodedNpub || normalizedNpub;
      const displayName =
        cachedProfile?.name?.trim() || displayNpub || "Unknown profile";
      const avatarSrc =
        cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

      const summary = this.createCompactProfileSummary({
        displayName,
        displayNpub,
        avatarSrc,
      });

      const actions = document.createElement("div");
      actions.className =
        "flex flex-wrap items-center justify-end gap-2 sm:flex-none";

      const viewButton = this.createViewChannelButton({
        targetNpub: encodedNpub,
        displayNpub,
      });
      if (viewButton) {
        actions.appendChild(viewButton);
      }

      const copyButton = this.createCopyNpubButton({
        targetNpub: encodedNpub,
        displayNpub,
      });
      if (copyButton) {
        actions.appendChild(copyButton);
      }

      if (removable && typeof onRemove === "function") {
        const removeBtn = this.createRemoveButton({
          label: removeLabel,
          confirmMessage,
          confirmValue: displayNpub,
          onRemove: (button) => onRemove(npub, button),
        });
        if (removeBtn) {
          actions.appendChild(removeBtn);
        }
      }

      item.appendChild(summary);
      if (actions.childElementCount > 0) {
        item.appendChild(actions);
      }

      listEl.appendChild(item);
    });

    if (
      entriesNeedingFetch.size &&
      typeof this.services.batchFetchProfiles === "function"
    ) {
      this.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  populateAdminLists() {
    const actorNpub = this.services.getCurrentUserNpub();
    if (!actorNpub || !this.services.accessControl.canEditAdminLists(actorNpub)) {
      this.clearAdminLists();
      return;
    }

    const isSuperAdmin = this.services.accessControl.isSuperAdmin(actorNpub);
    const editors = this.normalizeAdminListEntries(
      this.services.accessControl.getEditors(),
    ).filter((npub) => npub && npub !== this.adminSuperNpub);
    const whitelist = this.normalizeAdminListEntries(
      this.services.accessControl.getWhitelist(),
    );
    const blacklist = this.normalizeAdminListEntries(
      this.services.accessControl.getBlacklist(),
    );

    this.renderAdminList(
      this.adminModeratorList,
      this.moderatorEmpty,
      editors,
      {
        onRemove: (npub, button) => this.handleRemoveModerator(npub, button),
        removeLabel: "Remove",
        confirmMessage:
          "Remove moderator {npub}? They will immediately lose access to the admin panel.",
        removable: isSuperAdmin,
      },
    );

    this.renderAdminList(
      this.whitelistList,
      this.whitelistEmpty,
      whitelist,
      {
        onRemove: (npub, button) =>
          this.handleAdminListMutation("whitelist", "remove", npub, button),
        removeLabel: "Remove",
        confirmMessage: "Remove {npub} from the whitelist?",
        removable: true,
      },
    );

    this.renderAdminList(
      this.blacklistList,
      this.blacklistEmpty,
      blacklist,
      {
        onRemove: (npub, button) =>
          this.handleAdminListMutation("blacklist", "remove", npub, button),
        removeLabel: "Unblock",
        confirmMessage: "Remove {npub} from the blacklist?",
        removable: true,
      },
    );
  }

  async refreshAdminPaneState() {
    const adminNav = this.navButtons.admin;
    const adminPane = this.panes.admin;

    let loadError = null;
    this.setAdminLoading(true);
    this.showStatus("Fetching moderation filters…");
    try {
      const ensureResult = await this.runAdminMutation({
        action: "ensure-ready",
      });
      if (ensureResult?.error && ensureResult.ok === false) {
        loadError = ensureResult.error;
      }
    } catch (error) {
      loadError = error;
    }

    const actorNpub = this.services.getCurrentUserNpub();
    const canEdit =
      !!actorNpub && this.services.accessControl.canEditAdminLists(actorNpub);
    const isSuperAdmin =
      !!actorNpub && this.services.accessControl.isSuperAdmin(actorNpub);

    if (adminNav instanceof HTMLElement) {
      adminNav.classList.toggle("hidden", !canEdit);
      if (!canEdit) {
        adminNav.setAttribute("aria-selected", "false");
      }
    }

    if (adminPane instanceof HTMLElement) {
      if (!canEdit) {
        adminPane.classList.add("hidden");
        adminPane.setAttribute("aria-hidden", "true");
      } else {
        const isActive = this.getActivePane() === "admin";
        adminPane.classList.toggle("hidden", !isActive);
        adminPane.setAttribute("aria-hidden", (!isActive).toString());
      }
    }

    if (loadError) {
      if (loadError?.code === "nostr-unavailable") {
        devLogger.info("Moderation lists are still syncing with relays.");
        return;
      }

      userLogger.error("Failed to load admin lists:", loadError);
      this.showStatus(null);
      this.showError("Unable to load moderation lists. Please try again.");
      this.clearAdminLists();
      this.setAdminLoading(false);
      return;
    }

    if (!canEdit) {
      this.clearAdminLists();
      this.showStatus(null);
      this.setAdminLoading(false);
      if (
        adminNav instanceof HTMLElement &&
        adminNav.dataset.state === "active"
      ) {
        this.selectPane("account");
      }
      return;
    }

    if (this.moderatorSection instanceof HTMLElement) {
      this.moderatorSection.classList.toggle("hidden", !isSuperAdmin);
      this.moderatorSection.setAttribute(
        "aria-hidden",
        (!isSuperAdmin).toString(),
      );
    }
    this.populateAdminLists();
    this.showStatus(null);
    this.setAdminLoading(false);
  }

  normalizeNpubValue(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("npub1")) {
      return trimmed;
    }
    const normalizedHex = this.normalizeHexPubkey(trimmed);
    if (!normalizedHex) {
      return null;
    }
    return this.safeEncodeNpub(normalizedHex);
  }

  ensureAdminActor(requireSuperAdmin = false) {
    const actorNpub = this.services.getCurrentUserNpub();
    if (!actorNpub) {
      this.showError("Please login with a Nostr account to manage admin settings.");
      return null;
    }
    if (!this.services.accessControl.canEditAdminLists(actorNpub)) {
      this.showError("You do not have permission to manage bitvid moderation lists.");
      return null;
    }
    if (requireSuperAdmin && !this.services.accessControl.isSuperAdmin(actorNpub)) {
      this.showError("Only the Super Admin can manage moderators or whitelist mode.");
      return null;
    }
    return actorNpub;
  }

  async handleAddModerator() {
    const input = this.moderatorInput || null;
    const rawValue = typeof input?.value === "string" ? input.value : "";
    const trimmed = rawValue.trim();
    const normalizedValue = this.normalizeNpubValue(trimmed);
    const context = {
      input,
      rawValue,
      value: trimmed,
      normalizedValue,
      actorNpub: null,
      success: false,
      reason: null,
      error: null,
      result: null,
    };

    let preloadError = null;
    try {
      const ensureResult = await this.runAdminMutation({ action: "ensure-ready" });
      if (ensureResult?.error && ensureResult.ok === false) {
        preloadError = ensureResult.error;
      }
    } catch (error) {
      preloadError = error;
      userLogger.error("Failed to load admin lists before adding moderator:", error);
    }

    if (preloadError) {
      this.showError(this.describeAdminError(preloadError.code || "storage-error"));
      context.reason = preloadError.code || "storage-error";
      context.error = preloadError;
      this.callbacks.onAdminAddModerator(context, this);
      return context;
    }

    const actorNpub = this.ensureAdminActor(true);
    context.actorNpub = actorNpub;
    if (!actorNpub || !input) {
      context.reason = actorNpub ? "missing-input" : "unauthorized";
      this.callbacks.onAdminAddModerator(context, this);
      return context;
    }

    if (!trimmed) {
      this.showError("Enter an npub to add as a moderator.");
      context.reason = "empty";
      this.callbacks.onAdminAddModerator(context, this);
      return context;
    }

    if (!normalizedValue) {
      this.showError("Enter a valid npub before adding it as a moderator.");
      context.reason = "invalid";
      this.callbacks.onAdminAddModerator(context, this);
      return context;
    }

    if (this.addModeratorButton) {
      this.addModeratorButton.disabled = true;
      this.addModeratorButton.setAttribute("aria-busy", "true");
    }

    try {
      const mutationResult = await this.runAdminMutation({
        action: "add-moderator",
        actorNpub,
        targetNpub: normalizedValue,
      });
      context.result = mutationResult?.result || null;
      if (!mutationResult?.ok) {
        const errorCode = mutationResult?.result?.error || mutationResult?.error?.code;
        this.showError(this.describeAdminError(errorCode || "service-error"));
        context.reason = errorCode || "service-error";
        context.error = mutationResult?.error || mutationResult?.result || null;
        return context;
      }

      this.moderatorInput.value = "";
      this.showSuccess("Moderator added successfully.");
      await this.services.onAccessControlUpdated();
      context.success = true;
      context.reason = "added";
    } finally {
      if (this.addModeratorButton) {
        this.addModeratorButton.disabled = false;
        this.addModeratorButton.removeAttribute("aria-busy");
      }
      this.callbacks.onAdminAddModerator(context, this);
    }

    return context;
  }

  async handleRemoveModerator(npub, button) {
    const context = {
      npub,
      normalizedNpub: this.normalizeNpubValue(npub),
      button,
      actorNpub: null,
      success: false,
      reason: null,
      error: null,
      result: null,
    };

    const releaseButton = () => {
      if (button instanceof HTMLElement) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
    };

    if (!context.normalizedNpub) {
      this.showError("Unable to remove moderator: invalid npub.");
      context.reason = "invalid";
      releaseButton();
      this.callbacks.onAdminRemoveModerator(context, this);
      return context;
    }

    let preloadError = null;
    try {
      const ensureResult = await this.runAdminMutation({ action: "ensure-ready" });
      if (ensureResult?.error && ensureResult.ok === false) {
        preloadError = ensureResult.error;
      }
    } catch (error) {
      preloadError = error;
      userLogger.error("Failed to load admin lists before removing moderator:", error);
    }

    if (preloadError) {
      this.showError(this.describeAdminError(preloadError.code || "storage-error"));
      context.reason = preloadError.code || "storage-error";
      context.error = preloadError;
      releaseButton();
      this.callbacks.onAdminRemoveModerator(context, this);
      return context;
    }

    const actorNpub = this.ensureAdminActor(true);
    context.actorNpub = actorNpub;
    if (!actorNpub) {
      context.reason = "unauthorized";
      releaseButton();
      this.callbacks.onAdminRemoveModerator(context, this);
      return context;
    }

    const mutationResult = await this.runAdminMutation({
      action: "remove-moderator",
      actorNpub,
      targetNpub: context.normalizedNpub,
    });
    context.result = mutationResult?.result || null;
    if (!mutationResult?.ok) {
      const errorCode = mutationResult?.result?.error || mutationResult?.error?.code;
      this.showError(this.describeAdminError(errorCode || "service-error"));
      context.reason = errorCode || "service-error";
      context.error = mutationResult?.error || mutationResult?.result || null;
      releaseButton();
      this.callbacks.onAdminRemoveModerator(context, this);
      return context;
    }

    this.showSuccess("Moderator removed.");
    await this.services.onAccessControlUpdated();
    context.success = true;
    context.reason = "removed";

    releaseButton();
    this.callbacks.onAdminRemoveModerator(context, this);
    return context;
  }

  async handleAdminListMutation(listType, action, explicitNpub = null, sourceButton = null) {
    const isWhitelist = listType === "whitelist";
    const input = isWhitelist ? this.whitelistInput : this.blacklistInput;
    const addButton = isWhitelist ? this.addWhitelistButton : this.addBlacklistButton;
    const isAdd = action === "add";
    let buttonToToggle = sourceButton || (isAdd ? addButton : null);

    const context = {
      listType,
      action,
      explicitNpub,
      sourceButton,
      actorNpub: null,
      targetNpub: null,
      success: false,
      reason: null,
      error: null,
      result: null,
      notificationResult: null,
      notificationError: null,
    };

    const callbackMap = {
      whitelist: {
        add: this.callbacks.onAdminAddWhitelist,
        remove: this.callbacks.onAdminRemoveWhitelist,
      },
      blacklist: {
        add: this.callbacks.onAdminAddBlacklist,
        remove: this.callbacks.onAdminRemoveBlacklist,
      },
    };

    const adminCallback = callbackMap[listType]?.[action] || noop;

    const setBusy = (element, busy) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      element.disabled = !!busy;
      if (busy) {
        element.setAttribute("aria-busy", "true");
      } else {
        element.removeAttribute("aria-busy");
      }
    };

    const finalize = () => {
      setBusy(buttonToToggle, false);
      adminCallback(context, this);
    };

    let preloadError = null;
    try {
      const ensureResult = await this.runAdminMutation({ action: "ensure-ready" });
      if (ensureResult?.error && ensureResult.ok === false) {
        preloadError = ensureResult.error;
      }
    } catch (error) {
      preloadError = error;
      userLogger.error("Failed to load admin lists before updating entries:", error);
    }

    if (preloadError) {
      this.showError(this.describeAdminError(preloadError.code || "storage-error"));
      context.reason = preloadError.code || "storage-error";
      context.error = preloadError;
      finalize();
      return context;
    }

    const actorNpub = this.ensureAdminActor(false);
    context.actorNpub = actorNpub;
    if (!actorNpub) {
      context.reason = "unauthorized";
      finalize();
      return context;
    }

    let target = typeof explicitNpub === "string" ? explicitNpub.trim() : "";
    if (!target && input instanceof HTMLInputElement) {
      target = input.value.trim();
    }
    context.targetNpub = target;

    if (isAdd && !target) {
      this.showError("Enter an npub before adding it to the list.");
      context.reason = "empty";
      finalize();
      return context;
    }

    buttonToToggle = buttonToToggle || (isAdd ? addButton : null);
    setBusy(buttonToToggle, true);

    const mutationResult = await this.runAdminMutation({
      action: "list-mutation",
      listType,
      mode: action,
      actorNpub,
      targetNpub: target,
    });

    context.result = mutationResult?.result || null;

    if (!mutationResult?.ok) {
      const errorCode = mutationResult?.result?.error || mutationResult?.error?.code;
      this.showError(this.describeAdminError(errorCode || "service-error"));
      context.reason = errorCode || "service-error";
      context.error = mutationResult?.error || mutationResult?.result || null;
      finalize();
      return context;
    }

    if (isAdd && input instanceof HTMLInputElement) {
      input.value = "";
    }

    const successMessage = isWhitelist
      ? isAdd
        ? "Added to the whitelist."
        : "Removed from the whitelist."
      : isAdd
      ? "Added to the blacklist."
      : "Removed from the blacklist.";
    this.showSuccess(successMessage);
    await this.services.onAccessControlUpdated();

    context.success = true;
    context.reason = isAdd ? "added" : "removed";

    if (isAdd) {
      try {
        const notifyResult = await this.sendAdminListNotification({
          listType,
          actorNpub,
          targetNpub: target,
        });
        context.notificationResult = notifyResult;
        if (!notifyResult?.ok) {
          const errorMessage = this.describeNotificationError(notifyResult?.error);
          if (errorMessage) {
            this.showError(errorMessage);
          }
          if (isDevMode && notifyResult?.error) {
            userLogger.warn(
              "[admin] Failed to send list notification DM:",
              notifyResult,
            );
          }
          this.notifyAdminError({
            listType,
            action,
            actorNpub,
            targetNpub: target,
            error: notifyResult?.error || null,
            result: notifyResult,
          });
        }
      } catch (error) {
        context.notificationError = error;
        userLogger.error("Failed to send list notification DM:", error);
        devLogger.warn(
          "List update succeeded, but DM notification threw an unexpected error.",
          error,
        );
        this.notifyAdminError({
          listType,
          action,
          actorNpub,
          targetNpub: target,
          error,
        });
      }
    }

    finalize();
    return context;
  }

  describeAdminError(code) {
    if (typeof this.describeAdminErrorService === "function") {
      const result = this.describeAdminErrorService(code);
      if (typeof result === "string" && result) {
        return result;
      }
    }

    switch (code) {
      case "invalid npub":
        return "Please provide a valid npub address.";
      case "immutable":
        return "That account cannot be modified.";
      case "self":
        return "You cannot blacklist yourself.";
      case "forbidden":
        return "You do not have permission to perform that action.";
      case "nostr-unavailable":
        return "Unable to reach the configured Nostr relays. Please retry once your connection is restored.";
      case "nostr-extension-missing":
        return "Connect a Nostr extension before editing moderation lists.";
      case "signature-failed":
        return "We couldn’t sign the update with your Nostr key. Please reconnect your extension and try again.";
      case "publish-failed":
        return "Failed to publish the update to Nostr relays. Please try again.";
      case "storage-error":
        return "Unable to update moderation settings. Please try again.";
      default:
        return "Unable to update moderation settings. Please try again.";
    }
  }

  describeNotificationError(code) {
    if (typeof this.describeNotificationErrorService === "function") {
      const result = this.describeNotificationErrorService(code);
      if (typeof result === "string") {
        return result;
      }
    }

    switch (code) {
      case "nostr-extension-missing":
        return "List updated, but the DM notification failed because no Nostr extension is connected.";
      case "nostr-uninitialized":
        return "List updated, but the DM notification system is still connecting to Nostr relays. Please try again in a moment.";
      case "nip04-unavailable":
        return "List updated, but your Nostr extension does not support NIP-04 encryption, so the DM notification was not sent.";
      case "sign-event-unavailable":
        return "List updated, but your Nostr extension could not sign the DM notification.";
      case "missing-actor-pubkey":
        return "List updated, but we could not determine your public key to send the DM notification.";
      case "publish-failed":
        return "List updated, but the DM notification could not be delivered to any relay.";
      case "encryption-failed":
      case "signature-failed":
        return "List updated, but the DM notification failed while preparing the encrypted message.";
      case "invalid-target":
      case "empty-message":
        return "";
      default:
        return "List updated, but the DM notification could not be sent.";
    }
  }

  async sendAdminListNotification({ listType, actorNpub, targetNpub }) {
    if (typeof this.sendAdminListNotificationService === "function") {
      return this.sendAdminListNotificationService({ listType, actorNpub, targetNpub });
    }

    const normalizedTarget = this.normalizeNpubValue(targetNpub);
    if (!normalizedTarget) {
      return { ok: false, error: "invalid-target" };
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      return { ok: false, error: "missing-actor-pubkey" };
    }

    const fallbackActor = this.safeEncodeNpub(activeHex) || "a bitvid moderator";
    const actorDisplay = this.normalizeNpubValue(actorNpub) || fallbackActor;
    const isWhitelist = listType === "whitelist";

    const formatNpub =
      typeof this.formatShortNpub === "function"
        ? (value) => this.formatShortNpub(value)
        : (value) => (typeof value === "string" ? value : "");
    const displayTarget = formatNpub(normalizedTarget) || normalizedTarget;
    const displayActor = formatNpub(actorDisplay) || actorDisplay;

    const introLine = isWhitelist
      ? `Great news—your npub ${displayTarget} has been added to the bitvid whitelist by ${displayActor}.`
      : `We wanted to let you know that your npub ${displayTarget} has been placed on the bitvid blacklist by ${displayActor}.`;

    const statusLine = isWhitelist
      ? `You now have full creator access across bitvid (${this.bitvidWebsiteUrl}).`
      : `This hides your channel and prevents uploads across bitvid (${this.bitvidWebsiteUrl}) for now.`;

    const followUpLine = isWhitelist
      ? "Please take a moment to review our community guidelines (https://bitvid.network/#view=community-guidelines), and reply to this DM if you have any questions."
      : "Please review our community guidelines (https://bitvid.network/#view=community-guidelines). If you believe this was a mistake, you can submit an appeal at https://bitvid.network/?modal=appeals to request reinstatement, or reply to this DM with any questions.";

    const messageBody = [
      "Hi there,",
      "",
      introLine,
      "",
      statusLine,
      "",
      followUpLine,
      "",
      "— the bitvid team",
    ].join("\n");

    const message = `![bitvid status update](${this.adminDmImageUrl})\n\n${messageBody}`;

    return this.services.nostrClient.sendDirectMessage(
      normalizedTarget,
      message,
      activeHex,
    );
  }

  async requestSwitchProfile({ pubkey, entry, providerId } = {}) {
    const callback = this.callbacks.onRequestSwitchProfile;
    if (callback && callback !== noop) {
      return callback({ controller: this, pubkey, entry, providerId });
    }

    if (!pubkey) {
      throw new Error("Missing target pubkey for switch request.");
    }

    if (providerId) {
      return this.services.switchProfile(pubkey, { providerId });
    }

    return this.services.switchProfile(pubkey);
  }

  async runRelayOperation({
    action,
    url,
    activePubkey,
    skipPublishIfUnchanged = true,
  } = {}) {
    const callback = this.callbacks.onRelayOperation;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this,
        action,
        url,
        activePubkey,
        skipPublishIfUnchanged,
      });
      if (result !== undefined) {
        return result;
      }
    }

    const context = {
      ok: false,
      changed: false,
      reason: null,
      error: null,
      publishResult: null,
      operationResult: null,
    };

    if (!activePubkey) {
      context.reason = "no-active-pubkey";
      return context;
    }

    const previous = this.services.relayManager.snapshot();

    const runOperation = () => {
      switch (action) {
        case "add":
          return this.services.relayManager.addRelay(url);
        case "remove":
          return this.services.relayManager.removeRelay(url);
        case "restore":
          return this.services.relayManager.restoreDefaults();
        case "mode-toggle":
          return this.services.relayManager.cycleRelayMode(url);
        default:
          throw Object.assign(new Error("Unknown relay operation."), {
            code: "invalid-operation",
          });
      }
    };

    let operationResult;
    try {
      operationResult = runOperation();
      context.operationResult = operationResult;
    } catch (error) {
      context.reason = error?.code || "operation-error";
      context.error = error;
      return context;
    }

    context.changed = Boolean(operationResult?.changed);
    if (!context.changed && skipPublishIfUnchanged) {
      context.reason = operationResult?.reason || "unchanged";
      return context;
    }

    try {
      const publishResult = await this.services.relayManager.publishRelayList(
        activePubkey,
      );
      if (!publishResult?.ok) {
        throw new Error("No relays accepted the update.");
      }
      context.ok = true;
      context.publishResult = publishResult;
      return context;
    } catch (error) {
      this.services.relayManager.setEntries(previous, { allowEmpty: false });
      context.reason = error?.code || "publish-failed";
      context.error = error;
      return context;
    }
  }

  async mutateBlocklist({ action, actorHex, targetHex } = {}) {
    const callback = this.callbacks.onBlocklistMutation;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this,
        action,
        actorHex,
        targetHex,
      });
      if (result !== undefined) {
        return result;
      }
    }

    const context = { ok: false, reason: null, error: null };
    if (!actorHex || !targetHex) {
      context.reason = "invalid-target";
      return context;
    }

    try {
      await this.services.userBlocks.ensureLoaded(actorHex);
      const isBlocked = this.services.userBlocks.isBlocked(targetHex);

      if (action === "add") {
        if (isBlocked) {
          context.reason = "already-blocked";
          return context;
        }
        await this.services.userBlocks.addBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "blocked";
      } else if (action === "remove") {
        if (!isBlocked) {
          context.reason = "not-blocked";
          return context;
        }
        await this.services.userBlocks.removeBlock(targetHex, actorHex);
        context.ok = true;
        context.reason = "unblocked";
      } else {
        context.reason = "invalid-action";
        return context;
      }

      if (context.ok) {
        try {
          await this.services.onVideosShouldRefresh({
            reason: `blocklist-${action}`,
            actorHex,
            targetHex,
          });
        } catch (refreshError) {
          userLogger.warn(
            "[ProfileModalController] Failed to refresh videos after blocklist mutation:",
            refreshError,
          );
        }
      }

      return context;
    } catch (error) {
      context.error = error;
      context.reason = error?.code || "service-error";
      return context;
    }
  }

  async persistWalletSettings({
    nwcUri,
    defaultZap,
    lastChecked,
    activePubkey,
  } = {}) {
    const callback = this.callbacks.onWalletPersist;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this,
        nwcUri,
        defaultZap,
        lastChecked,
        activePubkey,
      });
      if (result !== undefined) {
        return result;
      }
    }

    return this.services.nwcSettings.handleProfileWalletPersist({
      nwcUri,
      defaultZap,
      lastChecked,
    });
  }

  async testWalletConnection({ nwcUri, defaultZap, activePubkey } = {}) {
    const callback = this.callbacks.onWalletTestRequest;
    if (callback && callback !== noop) {
      const result = await callback({
        controller: this,
        nwcUri,
        defaultZap,
        activePubkey,
      });
      if (result !== undefined) {
        return result;
      }
    }

    return this.services.nwcSettings.ensureWallet({ nwcUri, defaultZap });
  }

  async disconnectWallet({ activePubkey } = {}) {
    const callback = this.callbacks.onWalletDisconnectRequest;
    if (callback && callback !== noop) {
      const result = await callback({ controller: this, activePubkey });
      if (result !== undefined) {
        return result;
      }
    }

    return this.services.nwcSettings.updateActiveNwcSettings(
      this.services.nwcSettings.createDefaultNwcSettings(),
    );
  }

  async runAdminMutation(payload = {}) {
    const callback = this.callbacks.onAdminMutation;
    if (callback && callback !== noop) {
      const result = await callback({ ...payload, controller: this });
      if (result !== undefined) {
        return result;
      }
    }

    const action = payload?.action;
    const resultContext = { ok: false, error: null, result: null };

    try {
      switch (action) {
        case "ensure-ready":
          await this.services.accessControl.ensureReady();
          resultContext.ok = true;
          break;
        case "add-moderator":
          resultContext.result = await this.services.accessControl.addModerator(
            payload.actorNpub,
            payload.targetNpub,
          );
          resultContext.ok = !!resultContext.result?.ok;
          break;
        case "remove-moderator":
          resultContext.result =
            await this.services.accessControl.removeModerator(
              payload.actorNpub,
              payload.targetNpub,
            );
          resultContext.ok = !!resultContext.result?.ok;
          break;
        case "list-mutation":
          if (payload.listType === "whitelist") {
            resultContext.result = payload.mode === "add"
              ? await this.services.accessControl.addToWhitelist(
                  payload.actorNpub,
                  payload.targetNpub,
                )
              : await this.services.accessControl.removeFromWhitelist(
                  payload.actorNpub,
                  payload.targetNpub,
                );
          } else {
            resultContext.result = payload.mode === "add"
              ? await this.services.accessControl.addToBlacklist(
                  payload.actorNpub,
                  payload.targetNpub,
                )
              : await this.services.accessControl.removeFromBlacklist(
                  payload.actorNpub,
                  payload.targetNpub,
                );
          }
          resultContext.ok = !!resultContext.result?.ok;
          break;
        default:
          resultContext.error = Object.assign(
            new Error("Unknown admin mutation."),
            { code: "invalid-action" },
          );
      }
    } catch (error) {
      resultContext.error = error;
      return resultContext;
    }

    return resultContext;
  }

  notifyAdminError(payload = {}) {
    const callback = this.callbacks.onAdminNotifyError;
    if (callback && callback !== noop) {
      callback({ ...payload, controller: this });
    }
  }

  updateFocusTrap() {
    const container =
      this.profileModalPanel instanceof HTMLElement
        ? this.profileModalPanel
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (!container) {
      this.focusableElements = [];
      return;
    }

    const selector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(container.querySelectorAll(selector));
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

    this.bindFocusTrap(container);
  }

  bindFocusTrap(container) {
    const targetContainer =
      container ||
      (this.profileModalPanel instanceof HTMLElement
        ? this.profileModalPanel
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null);

    if (!targetContainer) {
      return;
    }

    if (!this.boundKeydown) {
      this.boundKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.hide();
          return;
        }

        if (event.key !== "Tab") {
          return;
        }

        if (!this.focusableElements.length) {
          event.preventDefault();
          const fallback =
            this.profileModalPanel || this.profileModal || targetContainer;
          if (typeof fallback?.focus === "function") {
            fallback.focus();
          }
          return;
        }

        const first = this.focusableElements[0];
        const last = this.focusableElements[this.focusableElements.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !targetContainer.contains(active)) {
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
        const modalRoot = this.profileModalRoot || this.profileModal;
        if (
          !modalRoot ||
          modalRoot.classList.contains("hidden") ||
          modalRoot.contains(event.target)
        ) {
          return;
        }

        const fallback =
          this.focusableElements[0] ||
          this.profileModalPanel ||
          this.profileModal;
        if (typeof fallback?.focus === "function") {
          fallback.focus();
        }
      };
    }

    if (
      this.focusTrapContainer &&
      this.focusTrapContainer !== targetContainer &&
      this.boundKeydown
    ) {
      this.focusTrapContainer.removeEventListener("keydown", this.boundKeydown);
    }

    targetContainer.addEventListener("keydown", this.boundKeydown);
    this.focusTrapContainer = targetContainer;

    document.addEventListener("focusin", this.boundFocusIn);
  }

  ensureModalOrder(modalRoot) {
    if (!(modalRoot instanceof HTMLElement)) {
      return;
    }

    const container =
      this.modalContainer instanceof HTMLElement ? this.modalContainer : null;
    const parentElement = modalRoot.parentElement;

    if (container) {
      if (parentElement !== container) {
        container.appendChild(modalRoot);
        return;
      }

      if (container.lastElementChild !== modalRoot) {
        container.appendChild(modalRoot);
      }
      return;
    }

    if (parentElement) {
      if (parentElement.lastElementChild !== modalRoot) {
        parentElement.appendChild(modalRoot);
      }
      return;
    }

    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(modalRoot);
    }
  }

  applyModalStackingOverrides() {
    const modalRoot =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (modalRoot) {
      modalRoot.style.setProperty("z-index", "var(--z-modal-top-root)");
    }

    if (this.profileModalBackdrop instanceof HTMLElement) {
      this.profileModalBackdrop.style.setProperty(
        "z-index",
        "var(--z-modal-top-overlay)",
      );
    }

    if (this.profileModalPanel instanceof HTMLElement) {
      this.profileModalPanel.style.setProperty(
        "z-index",
        "var(--z-modal-top-content)",
      );
    }
  }

  async show(targetPane = "account") {
    const pane =
      typeof targetPane === "string" && targetPane.trim()
        ? targetPane.trim()
        : "account";

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const modalRoot =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (activeElement && modalRoot && modalRoot.contains(activeElement)) {
      this.previouslyFocusedElement = null;
    } else {
      this.previouslyFocusedElement = activeElement;
    }

    this.renderSavedProfiles();
    this.refreshWalletPaneState();
    this.refreshModerationSettingsUi();
    const hasBlockHydrator =
      this.services.userBlocks &&
      typeof this.services.userBlocks.ensureLoaded === "function";

    if (hasBlockHydrator) {
      this.setBlockListLoadingState("loading");
    } else {
      this.populateBlockedList();
    }

    this.open(pane);

    const backgroundTasks = [];

    backgroundTasks.push(
      Promise.resolve()
        .then(() => this.refreshAdminPaneState())
        .catch((error) => {
          userLogger.error(
            "Failed to refresh admin pane while opening profile modal:",
            error,
          );
        }),
    );

    backgroundTasks.push(
      Promise.resolve().then(() => {
        try {
          this.populateProfileRelays();
        } catch (error) {
          userLogger.warn(
            "Failed to populate relay list while opening profile modal:",
            error,
          );
        }
      }),
    );

    if (hasBlockHydrator) {
      const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
      backgroundTasks.push(
        Promise.resolve()
          .then(() => this.services.userBlocks.ensureLoaded(activeHex))
          .then(() => {
            try {
              this.populateBlockedList();
            } catch (error) {
              userLogger.warn(
                "Failed to render blocked creators after hydration:",
                error,
              );
              this.setBlockListLoadingState("error", {
                message:
                  "Blocked creators may be out of date. Try again later.",
              });
            }
          })
          .catch((error) => {
            userLogger.warn(
              "Failed to refresh user block list while opening profile modal:",
              error,
            );
            this.setBlockListLoadingState("error", {
              message:
                "Blocked creators may be out of date. Try again later.",
            });
            try {
              this.populateBlockedList();
            } catch (populateError) {
              userLogger.warn(
                "Failed to render blocked creators after hydration failure:",
                populateError,
              );
            }
          }),
      );
    }

    if (backgroundTasks.length) {
      void Promise.allSettled(backgroundTasks);
    }

    return true;
  }

  showWalletPane() {
    return this.show("wallet");
  }

  open(pane = "account") {
    const modalRoot =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (!modalRoot) {
      return;
    }

    this.ensureModalOrder(modalRoot);
    this.applyModalStackingOverrides();

    modalRoot.classList.remove("hidden");
    modalRoot.setAttribute("aria-hidden", "false");
    this.setGlobalModalState("profile", true);
    const preserveMenu = this.isMobileLayoutActive();
    this.selectPane(pane, { keepMenuView: preserveMenu });

    const focusTarget =
      this.focusableElements[0] ||
      this.profileModalPanel ||
      modalRoot;
    window.requestAnimationFrame(() => {
      if (typeof focusTarget?.focus === "function") {
        focusTarget.focus();
      }
    });
  }

  hide(options = {}) {
    const { silent = false } =
      options && typeof options === "object" ? options : {};

    const modalElement =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (modalElement) {
      modalElement.classList.add("hidden");
      modalElement.setAttribute("aria-hidden", "true");
      this.setGlobalModalState("profile", false);
      this.setMobileView("menu", { skipFocusTrap: true });

      if (this.boundKeydown && this.focusTrapContainer) {
        this.focusTrapContainer.removeEventListener(
          "keydown",
          this.boundKeydown,
        );
      }
    }

    if (this.boundFocusIn) {
      document.removeEventListener("focusin", this.boundFocusIn);
    }

    this.focusTrapContainer = null;

    if (
      this.boundProfileHistoryVisibility &&
      typeof document !== "undefined" &&
      typeof document.removeEventListener === "function"
    ) {
      document.removeEventListener(
        "visibilitychange",
        this.boundProfileHistoryVisibility,
      );
      this.boundProfileHistoryVisibility = null;
    }

    if (this.profileHistoryRenderer) {
      try {
        if (typeof this.profileHistoryRenderer.destroy === "function") {
          this.profileHistoryRenderer.destroy();
        }
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to reset watch history renderer on close:",
          error,
        );
      }
      this.profileHistoryRenderer = null;
      this.profileHistoryRendererConfig = null;
    }

    this.setActivePane(null);
    this.setWalletPaneBusy(false);

    const previous = this.previouslyFocusedElement;
    this.previouslyFocusedElement = null;

    if (
      previous &&
      typeof previous.focus === "function" &&
      (!modalElement || !modalElement.contains(previous))
    ) {
      const shouldRestore =
        "isConnected" in previous ? previous.isConnected !== false : true;
      if (shouldRestore) {
        window.requestAnimationFrame(() => {
          try {
            previous.focus();
          } catch (error) {
            userLogger.warn(
              "[profileModal] Failed to restore focus after closing modal:",
              error,
            );
          }
        });
      }
    }

    if (!silent) {
      try {
        this.callbacks.onClose(this);
      } catch (error) {
        userLogger.warn(
          "[profileModal] onClose callback threw while hiding modal:",
          error,
        );
      }
    }
  }

  async handleAuthLogin(detail = {}) {
    const postLoginPromise =
      detail && typeof detail.postLoginPromise?.then === "function"
        ? detail.postLoginPromise
        : Promise.resolve(detail?.postLogin ?? null);

    const savedProfiles = Array.isArray(detail?.savedProfiles)
      ? detail.savedProfiles
      : null;
    if (savedProfiles) {
      try {
        this.setSavedProfiles(savedProfiles, {
          persist: false,
          persistActive: false,
        });
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to sync saved profiles during login:",
          error,
        );
      }
    }

    const activePubkey =
      detail?.activeProfilePubkey ?? detail?.pubkey ?? undefined;
    if (activePubkey !== undefined) {
      this.setActivePubkey(activePubkey);
    }

    await this.hydrateActiveWalletSettings(activePubkey);

    this.renderSavedProfiles();

    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      userLogger.warn("Failed to refresh admin pane after login:", error);
    }

    this.populateBlockedList();
    this.populateProfileRelays();
    this.refreshWalletPaneState();

    postLoginPromise
      .then(() => {
        this.populateBlockedList();
        this.populateProfileRelays();
        this.refreshWalletPaneState();
      })
      .catch((error) => {
        userLogger.warn(
          "[profileModal] Failed to hydrate deferred login data:",
          error,
        );
      });

    return true;
  }

  async handleAuthLogout(detail = {}) {
    const savedProfiles = Array.isArray(detail?.savedProfiles)
      ? detail.savedProfiles
      : null;
    if (savedProfiles) {
      try {
        this.setSavedProfiles(savedProfiles, {
          persist: false,
          persistActive: false,
        });
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to sync saved profiles during logout:",
          error,
        );
      }
    }

    if (detail?.activeProfilePubkey !== undefined) {
      this.setActivePubkey(detail.activeProfilePubkey);
    } else {
      this.setActivePubkey(null);
    }

    this.profileSwitcherSelectionPubkey = null;
    this.renderSavedProfiles();

    try {
      await this.refreshAdminPaneState();
    } catch (error) {
      userLogger.warn("Failed to refresh admin pane after logout:", error);
    }

    this.populateBlockedList();
    this.populateProfileRelays();
    this.refreshWalletPaneState();

    return true;
  }

  handleProfileUpdated(detail = {}) {
    if (Array.isArray(detail?.savedProfiles)) {
      try {
        this.setSavedProfiles(detail.savedProfiles, {
          persist: false,
          persistActive: false,
        });
      } catch (error) {
        userLogger.warn(
          "[profileModal] Failed to sync saved profiles after profile update:",
          error,
        );
      }
    }

    if (detail?.activeProfilePubkey !== undefined) {
      this.setActivePubkey(detail.activeProfilePubkey);
    } else if (detail?.pubkey) {
      this.setActivePubkey(detail.pubkey);
    }

    this.renderSavedProfiles();
  }

  removeSavedProfile(pubkey) {
    if (!pubkey) {
      return { removed: false };
    }

    let result;
    try {
      result = this.services.removeSavedProfile(pubkey) || { removed: false };
    } catch (error) {
      userLogger.error("Failed to remove saved profile:", error);
      result = { removed: false, error };
    }

    if (result?.removed) {
      if (
        this.normalizeHexPubkey(pubkey) ===
        this.normalizeHexPubkey(this.getActivePubkey())
      ) {
        this.setActivePubkey(null);
      }
      this.renderSavedProfiles();
    }

    return result;
  }

  async hydrateActiveWalletSettings(pubkey) {
    const hydrate = this.services.nwcSettings?.hydrateNwcSettingsForPubkey;
    if (typeof hydrate !== "function") {
      return null;
    }

    const normalized = this.normalizeHexPubkey(
      pubkey !== undefined ? pubkey : this.getActivePubkey(),
    );
    if (!normalized) {
      return null;
    }

    try {
      return await hydrate(normalized);
    } catch (error) {
      userLogger.warn(
        `[ProfileModalController] Failed to hydrate wallet settings for ${normalized}:`,
        error,
      );
      return null;
    }
  }

  async switchProfile(pubkey, { entry, providerId } = {}) {
    if (!pubkey) {
      return { switched: false, reason: "missing-pubkey" };
    }

    let result;
    try {
      result = await this.requestSwitchProfile({ pubkey, entry, providerId });
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to switch profiles. Please try again.";
      this.showError(message);
      return {
        switched: false,
        error,
        reason: error?.code || "switch-error",
      };
    }

    if (!result?.switched) {
      this.hide();
      return result || { switched: false };
    }

    await this.hydrateActiveWalletSettings(pubkey);

    this.profileSwitcherSelectionPubkey = null;
    this.renderSavedProfiles();
    this.hide();

    return result;
  }

  getSavedProfiles() {
    return this.state.getSavedProfiles();
  }

  setSavedProfiles(...args) {
    return this.state.setSavedProfiles(...args);
  }

  normalizeProviderId(providerId) {
    if (typeof providerId !== "string") {
      return null;
    }

    const trimmed = providerId.trim();
    if (!trimmed) {
      return null;
    }

    return trimmed;
  }

  getEntryProviderId(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const explicit = this.normalizeProviderId(entry.providerId);
    if (explicit) {
      return explicit;
    }

    return this.normalizeProviderId(entry.authType);
  }

  resolveEntryProviderMetadata(entry) {
    const providerId = this.getEntryProviderId(entry);
    if (providerId) {
      return getProviderMetadata(providerId);
    }

    return getProviderMetadata();
  }

  persistSavedProfiles(...args) {
    if (typeof this.services.persistSavedProfiles === "function") {
      try {
        return this.services.persistSavedProfiles(...args);
      } catch (error) {
        userLogger.warn(
          "[ProfileModalController] Persist saved profiles service threw:",
          error,
        );
      }
    }
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
    const result = this.state.setWalletBusy(Boolean(isBusy));
    if (this.panes.wallet instanceof HTMLElement) {
      this.panes.wallet.setAttribute(
        "aria-busy",
        this.isWalletBusy() ? "true" : "false",
      );
    }
    this.applyWalletControlState();
    return result;
  }
}

export default ProfileModalController;
