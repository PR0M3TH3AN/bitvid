import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
} from "../constants.js";

const noop = () => {};

export const NWC_URI_SCHEME = "nostr+walletconnect://";
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
  blurThreshold: DEFAULT_BLUR_THRESHOLD,
  autoplayBlockThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  trustedSpamHideThreshold: DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
});

function createInternalDefaultModerationSettings() {
  return { ...DEFAULT_INTERNAL_MODERATION_SETTINGS };
}

const DEFAULT_INTERNAL_DM_PRIVACY_SETTINGS = Object.freeze({
  readReceiptsEnabled: false,
  typingIndicatorsEnabled: false,
});

function createInternalDefaultDmPrivacySettings() {
  return { ...DEFAULT_INTERNAL_DM_PRIVACY_SETTINGS };
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
    key: "requestAddProfileLogin",
    type: "function",
    description:
      "Opens the login modal and resolves with the authentication result for the add-profile flow.",
    fallback: () => async () => {
      throw new Error("Login service unavailable.");
    },
  },
  {
    key: "describeLoginError",
    type: "function",
    description:
      "Maps authentication errors to human-readable strings for add-profile messaging.",
    fallback: () => (_, fallbackMessage) =>
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : "Failed to login. Please try again.",
  },
  {
    key: "r2Service",
    type: "object",
    description: "Service for handling file uploads (R2/S3).",
    optional: true,
  },
  {
    key: "nostrService",
    type: "object",
    description:
      "Provides encrypted direct message helpers for loading and subscribing to inbox updates.",
    optional: true,
    fallback: () => ({
      getDirectMessages: () => [],
      loadDirectMessages: async () => [],
      ensureDirectMessageSubscription: () => null,
      stopDirectMessageSubscription: () => {},
      clearDirectMessages: () => {},
      on: () => () => {},
    }),
  },
  {
    key: "hashtagPreferences",
    type: "object",
    description:
      "Service providing access to interest and disinterest hashtag collections.",
    fallback: () => ({
      getInterests: () => [],
      getDisinterests: () => [],
      addInterest: () => false,
      removeInterest: () => false,
      addDisinterest: () => false,
      removeDisinterest: () => false,
      publish: async () => false,
      on: () => () => {},
    }),
  },
  {
    key: "getHashtagPreferences",
    type: "function",
    description:
      "Returns the cached hashtag preferences snapshot (interests, disinterests, metadata).",
    fallback: ({ resolved }) => () => {
      const service = resolved.hashtagPreferences || {};
      const interests =
        typeof service.getInterests === "function"
          ? service.getInterests()
          : [];
      const disinterests =
        typeof service.getDisinterests === "function"
          ? service.getDisinterests()
          : [];
      return {
        interests,
        disinterests,
        eventId: null,
        createdAt: null,
        loaded: false,
      };
    },
  },
  {
    key: "describeHashtagPreferencesError",
    type: "function",
    description:
      "Maps hashtag preference errors to user-facing status messages for the modal.",
    fallback: () => (_, fallbackMessage) =>
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : "Failed to update hashtag preferences. Please try again.",
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
    key: "fetchDmRelayHints",
    type: "function",
    description:
      "Fetches DM relay hints (kind 10050) for a given pubkey.",
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
    key: "subscriptions",
    type: "object",
    optional: true,
    description:
      "Subscriptions manager used by the profile modal to inspect or refresh the viewer's channel subscriptions.",
  },
  {
    key: "moderation",
    type: "object",
    optional: true,
    description:
      "Moderation service exposing the viewer's Nostr contacts and trust graph metadata.",
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
    key: "getModerationOverrides",
    type: "function",
    description:
      "Returns a list of stored moderation overrides for the active viewer.",
    fallback: () => () => [],
  },
  {
    key: "clearModerationOverride",
    type: "function",
    description:
      "Clears a specific moderation override when the viewer resets a decision.",
    fallback: () => () => false,
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
  {
    key: "getDmRecipient",
    type: "function",
    description:
      "Returns the currently selected direct message recipient pubkey.",
    fallback: (internal) => () => internal.dmRecipient,
  },
  {
    key: "setDmRecipient",
    type: "function",
    description:
      "Updates the selected direct message recipient pubkey and returns the stored value.",
    fallback: (internal) => (pubkey) => {
      if (typeof pubkey === "string") {
        const trimmed = pubkey.trim();
        internal.dmRecipient = trimmed || null;
      } else {
        internal.dmRecipient = null;
      }
      return internal.dmRecipient;
    },
  },
  {
    key: "getDmRelayHints",
    type: "function",
    description:
      "Returns the cached DM relay hints for a given pubkey.",
    fallback: (internal) => (pubkey) => {
      const normalized =
        typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
      if (!normalized || !(internal.dmRelayHints instanceof Map)) {
        return [];
      }
      const hints = internal.dmRelayHints.get(normalized);
      return Array.isArray(hints) ? hints.slice() : [];
    },
  },
  {
    key: "setDmRelayHints",
    type: "function",
    description:
      "Stores DM relay hints for a given pubkey and returns the stored list.",
    fallback: (internal) => (pubkey, hints = []) => {
      if (!(internal.dmRelayHints instanceof Map)) {
        internal.dmRelayHints = new Map();
      }
      const normalized =
        typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
      if (!normalized) {
        return [];
      }
      const stored = Array.isArray(hints) ? hints.slice() : [];
      internal.dmRelayHints.set(normalized, stored);
      return stored;
    },
  },
  {
    key: "getDmRelayPreferences",
    type: "function",
    description:
      "Returns the cached DM relay hints for a given pubkey (publisher view).",
    fallback: (internal) => (pubkey) => {
      const normalized =
        typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
      if (!normalized || !(internal.dmRelayHints instanceof Map)) {
        return [];
      }
      const hints = internal.dmRelayHints.get(normalized);
      return Array.isArray(hints) ? hints.slice() : [];
    },
  },
  {
    key: "setDmRelayPreferences",
    type: "function",
    description:
      "Stores DM relay hints for a given pubkey (publisher view).",
    fallback: (internal) => (pubkey, hints = []) => {
      if (!(internal.dmRelayHints instanceof Map)) {
        internal.dmRelayHints = new Map();
      }
      const normalized =
        typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
      if (!normalized) {
        return [];
      }
      const stored = Array.isArray(hints) ? hints.slice() : [];
      internal.dmRelayHints.set(normalized, stored);
      return stored;
    },
  },
  {
    key: "getDmPrivacySettings",
    type: "function",
    description:
      "Returns the DM privacy settings (read receipts and typing indicators) for the active profile.",
    fallback: (internal) => () => {
      if (!(internal.dmPrivacySettings instanceof Map)) {
        internal.dmPrivacySettings = new Map();
      }
      const settings = internal.dmPrivacySettings.get("default");
      return settings ? { ...settings } : createInternalDefaultDmPrivacySettings();
    },
  },
  {
    key: "setDmPrivacySettings",
    type: "function",
    description:
      "Updates the DM privacy settings (read receipts and typing indicators) for the active profile.",
    fallback: (internal) => (settings = {}) => {
      if (!(internal.dmPrivacySettings instanceof Map)) {
        internal.dmPrivacySettings = new Map();
      }
      const base = createInternalDefaultDmPrivacySettings();
      const normalized = {
        readReceiptsEnabled:
          typeof settings.readReceiptsEnabled === "boolean"
            ? settings.readReceiptsEnabled
            : base.readReceiptsEnabled,
        typingIndicatorsEnabled:
          typeof settings.typingIndicatorsEnabled === "boolean"
            ? settings.typingIndicatorsEnabled
            : base.typingIndicatorsEnabled,
      };
      internal.dmPrivacySettings.set("default", normalized);
      return { ...normalized };
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


export {
  PROVIDER_BADGE_BASE_CLASS,
  PROVIDER_BADGE_VARIANT_CLASS_MAP,
  DEFAULT_INTERNAL_NWC_SETTINGS,
  DEFAULT_INTERNAL_MODERATION_SETTINGS,
  DEFAULT_INTERNAL_DM_PRIVACY_SETTINGS,
  resolveProviderBadgeClass,
  createInternalDefaultNwcSettings,
  createInternalDefaultModerationSettings,
  createInternalDefaultDmPrivacySettings,
  ensureInternalModerationSettings,
  ensureInternalWalletSettings,
  buildServicesContract,
  buildStateContract
};
