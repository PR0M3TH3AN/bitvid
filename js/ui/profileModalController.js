import {
  isDevMode,
  ADMIN_SUPER_NPUB as CONFIG_ADMIN_SUPER_NPUB,
  ADMIN_DM_IMAGE_URL as CONFIG_ADMIN_DM_IMAGE_URL,
  BITVID_WEBSITE_URL as CONFIG_BITVID_WEBSITE_URL,
  MAX_WALLET_DEFAULT_ZAP as CONFIG_MAX_WALLET_DEFAULT_ZAP,
} from "../config.js";
import { normalizeDesignSystemContext } from "../designSystem.js";
import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
  DEFAULT_TRUSTED_SPAM_HIDE_THRESHOLD,
  RUNTIME_FLAGS,
} from "../constants.js";
import { getBreakpointLg } from "../designSystem/metrics.js";
import { getProviderMetadata } from "../services/authProviders/index.js";
import { AppShell } from "./dm/index.js";
import { devLogger, userLogger } from "../utils/logger.js";
import {
  normalizeHashtag,
  formatHashtag,
} from "../utils/hashtagNormalization.js";
import { formatTimeAgo } from "../utils/formatters.js";
import { getActiveSigner } from "../nostr/client.js";
import { sanitizeRelayList } from "../nostr/nip46Client.js";
import { buildPublicUrl, buildR2Key } from "../r2.js";
import { buildProfileMetadataEvent } from "../nostrEventSchemas.js";
import {
  describeAttachment,
  extractAttachmentsFromMessage,
  formatAttachmentSize,
} from "../attachments/attachmentUtils.js";
import { getCorsOrigins, prepareS3Connection } from "../services/s3Service.js";
import {
  clearAttachmentCache,
  downloadAttachment,
  uploadAttachment,
  getAttachmentCacheStats,
} from "../services/attachmentService.js";
import { PROVIDERS } from "../services/storageService.js";
import {
  getLinkPreviewSettings,
  setLinkPreviewAutoFetch,
} from "../utils/linkPreviewSettings.js";

const noop = () => {};

const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";
const DEFAULT_ADMIN_DM_IMAGE_URL =
  "https://beta.bitvid.network/assets/jpg/video-thumbnail-fallback.jpg";
const DEFAULT_BITVID_WEBSITE_URL = "https://bitvid.network/";
const NWC_URI_SCHEME = "nostr+walletconnect://";
const SECRET_PLACEHOLDER = "*****";
const DEFAULT_MAX_WALLET_DEFAULT_ZAP = 100000000;
const DEFAULT_SAVED_PROFILE_LABEL = "Saved profile";
const TRUSTED_MUTE_HIDE_HELPER_TEXT =
  "Reaching this count hides cards (with “Show anyway”); lower signals only blur thumbnails or block autoplay.";
const TYPING_INDICATOR_TTL_SECONDS = 15;
const TYPING_INDICATOR_COOLDOWN_MS = 4000;
const DIRECT_MESSAGES_BATCH_DELAY_MS = 250;

const ADD_PROFILE_CANCELLATION_CODES = new Set([
  "login-cancelled",
  "user-cancelled",
  "modal-dismissed",
]);

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
      dmRecipient: null,
      dmRelayHints: new Map(),
    };

    this.dmMobileView = "list";

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
    this.describeLoginErrorService = this.services.describeLoginError;
    this.requestAddProfileLoginService = this.services.requestAddProfileLogin;
    this.log =
      typeof this.services.log === "function"
        ? this.services.log
        : (...args) => {
            devLogger.log(...args);
          };

    this.nostrService =
      this.services.nostrService &&
      typeof this.services.nostrService === "object"
        ? this.services.nostrService
        : null;

    const subscriptionsServiceCandidate = this.services.subscriptions;
    this.subscriptionsService =
      subscriptionsServiceCandidate &&
      typeof subscriptionsServiceCandidate === "object"
        ? subscriptionsServiceCandidate
        : null;

    const moderationServiceCandidate = this.services.moderation;
    this.moderationService =
      moderationServiceCandidate &&
      typeof moderationServiceCandidate === "object"
        ? moderationServiceCandidate
        : null;
    this.unsubscribeModerationContacts = null;
    this.unsubscribeModerationStats = [];
    if (
      this.moderationService &&
      typeof this.moderationService.on === "function"
    ) {
      try {
        const updateTrustStats = () => {
          this.updateModerationTrustStats();
        };

        this.unsubscribeModerationContacts = this.moderationService.on(
          "contacts",
          () => {
            void this.populateFriendsList();
            updateTrustStats();
          },
        );

        this.unsubscribeModerationStats = [
          this.moderationService.on("trusted-mutes", updateTrustStats),
          this.moderationService.on("summary", updateTrustStats),
        ].filter((unsubscribe) => typeof unsubscribe === "function");
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to subscribe to moderation contacts updates:",
          error,
        );
      }
    }

    this.hashtagPreferencesService = this.services.hashtagPreferences;
    this.describeHashtagPreferencesErrorService =
      this.services.describeHashtagPreferencesError;
    this.getHashtagPreferencesSnapshotService =
      this.services.getHashtagPreferences;
    this.hashtagPreferencesPublishInFlight = false;
    this.hashtagPreferencesPublishPromise = null;

    if (
      this.hashtagPreferencesService &&
      typeof this.hashtagPreferencesService.on === "function"
    ) {
      this.hashtagPreferencesUnsubscribe = this.hashtagPreferencesService.on(
        "change",
        (detail) => {
          this.handleHashtagPreferencesChange({
            action:
              typeof detail?.action === "string" ? detail.action : "change",
            preferences: detail,
          });
        },
      );
    }

    this.initializeDirectMessagesService();

    this.callbacks = {
      onClose: callbacks.onClose || noop,
      onLogout: callbacks.onLogout || noop,
      onChannelLink: callbacks.onChannelLink || noop,
      onAddAccount: callbacks.onAddAccount || noop,
      onRequestLogoutProfile: callbacks.onRequestLogoutProfile || noop,
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
      onSendDm: callbacks.onSendDm || noop,
      onTogglePrivacy: callbacks.onTogglePrivacy || noop,
      onOpenRelays: callbacks.onOpenRelays || noop,
      onPublishDmRelayPreferences: callbacks.onPublishDmRelayPreferences || noop,
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
    this.mobileLogoutButton = null;
    this.channelLink = null;
    this.addAccountButton = null;
    this.navButtons = {
      account: null,
      relays: null,
      wallet: null,
      storage: null,
      hashtags: null,
      subscriptions: null,
      friends: null,
      blocked: null,
      messages: null,
      history: null,
      admin: null,
      safety: null,
    };
    this.panes = {
      account: null,
      relays: null,
      wallet: null,
      storage: null,
      hashtags: null,
      subscriptions: null,
      friends: null,
      blocked: null,
      messages: null,
      history: null,
      admin: null,
      safety: null,
    };
    this.relayList = null;
    this.relayInput = null;
    this.addRelayButton = null;
    this.restoreRelaysButton = null;
    this.relayHealthPanel = null;
    this.relayHealthList = null;
    this.relayHealthStatus = null;
    this.relayHealthRefreshButton = null;
    this.relayHealthTelemetryToggle = null;
    this.relayHealthRefreshPromise = null;
    this.profileRelayList = null;
    this.profileRelayInput = null;
    this.profileAddRelayBtn = null;
    this.profileRestoreRelaysBtn = null;
    this.subscriptionList = null;
    this.subscriptionListEmpty = null;
    this.friendList = null;
    this.friendListEmpty = null;
    this.friendInput = null;
    this.addFriendButton = null;
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
    this.profileMessagesList = null;
    this.profileMessagesEmpty = null;
    this.profileMessagesLoading = null;
    this.profileMessagesError = null;
    this.profileMessagesStatus = null;
    this.profileMessagesReloadButton = null;
    this.profileMessagesPane = null;
    this.profileMessagesConversation = null;
    this.profileMessagesConversationEmpty = null;
    this.profileMessageInput = null;
    this.profileMessageSendButton = null;
    this.profileMessageAttachmentInput = null;
    this.profileMessageAttachmentButton = null;
    this.profileMessageAttachmentEncrypt = null;
    this.profileMessageAttachmentList = null;
    this.profileMessageAttachmentClearCache = null;
    this.profileMessagesComposerHelper = null;
    this.profileMessagesSendDmButton = null;
    this.profileMessagesOpenRelaysButton = null;
    this.profileMessagesPrivacyToggle = null;
    this.profileMessagesPrivacyMode = null;
    this.profileMessagesRelayList = null;
    this.profileMessagesRelayInput = null;
    this.profileMessagesRelayAddButton = null;
    this.profileMessagesRelayPublishButton = null;
    this.profileMessagesRelayStatus = null;
    this.profileMessagesUnreadDot = null;
    this.dmAppShellContainer = null;
    this.dmAppShell = null;
    this.profileLinkPreviewAutoToggle = null;
    this.walletUriInput = null;
    this.walletDefaultZapInput = null;
    this.walletSaveButton = null;
    this.walletTestButton = null;
    this.walletDisconnectButton = null;
    this.walletStatusText = null;
    this.profileWalletStatusText = null;
    this.hashtagStatusText = null;
    this.hashtagBackgroundLoading = false;
    this.hashtagInterestList = null;
    this.hashtagInterestEmpty = null;
    this.hashtagInterestInput = null;
    this.addHashtagInterestButton = null;
    this.profileHashtagInterestRefreshBtn = null;
    this.hashtagDisinterestList = null;
    this.hashtagDisinterestEmpty = null;
    this.hashtagDisinterestInput = null;
    this.addHashtagDisinterestButton = null;
    this.profileHashtagDisinterestRefreshBtn = null;
    this.subscriptionsStatusText = null;
    this.subscriptionsBackgroundLoading = false;
    this.profileSubscriptionsRefreshBtn = null;
    this.profileFriendsRefreshBtn = null;
    this.profileBlockedRefreshBtn = null;
    this.profileRelayRefreshBtn = null;
    this.moderationSettingsCard = null;
    this.moderationBlurInput = null;
    this.moderationAutoplayInput = null;
    this.moderationMuteHideInput = null;
    this.moderationSpamHideInput = null;
    this.moderationSaveButton = null;
    this.moderationResetButton = null;
    this.moderationStatusText = null;
    this.moderationOverridesList = null;
    this.moderationOverridesEmpty = null;
    this.moderationHideControlsGroup = null;
    this.moderationHideControlElements = [];
    this.boundModerationOverridesUpdate = null;
    this.moderatorSection = null;
    this.moderatorEmpty = null;
    this.adminModeratorList = null;
    this.addModeratorButton = null;
    this.moderatorInput = null;
    this.adminModeratorsRefreshBtn = null;
    this.adminModeratorsSection = null;
    this.adminModeratorsEmpty = null;
    this.adminAddModeratorButton = null;
    this.adminModeratorInput = null;
    this.whitelistSection = null;
    this.whitelistEmpty = null;
    this.whitelistList = null;
    this.addWhitelistButton = null;
    this.whitelistInput = null;
    this.adminWhitelistRefreshBtn = null;
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
    this.adminBlacklistRefreshBtn = null;
    this.adminBlacklistSection = null;
    this.adminBlacklistEmpty = null;
    this.adminBlacklistList = null;
    this.adminAddBlacklistButton = null;
    this.adminBlacklistInput = null;

    this.messagesLoadingState = "idle";
    this.messagesInitialLoadPending = true;
    this.messagesViewActive = false;
    this.activeMessagesRequest = null;
    this.directMessagesCache = [];
    this.directMessagesLastActor = null;
    this.directMessagesSubscription = null;
    this.directMessagesUnsubscribes = [];
    this.directMessagesRenderTimeout = null;
    this.pendingDirectMessagesUpdate = null;
    this.pendingMessagesRender = null;
    this.messagesStatusClearTimeout = null;
    this.dmPrivacyToggleTouched = false;
    this.dmReadReceiptCache = new Set();
    this.dmTypingLastSentAt = 0;
    this.dmAttachmentQueue = [];
    this.dmAttachmentUploads = new Map();
    this.activeDmConversationId = "";
    this.focusedDmConversationId = "";
    this.dmComposerState = "idle";

    this.profileHistoryRenderer = null;
    this.profileHistoryRendererConfig = null;
    this.boundProfileHistoryVisibility = null;
    this.boundKeydown = null;
    this.boundFocusIn = null;
    this.focusableElements = [];
    this.focusTrapContainer = null;
    this.focusTrapSuspended = false;
    this.focusTrapSuspendCount = 0;
    this.focusTrapAriaHiddenBeforeSuspend = null;
    this.focusTrapNestedModalActiveBeforeSuspend = null;
    this.profileSwitcherSelectionPubkey = null;
    this.previouslyFocusedElement = null;
    this.largeLayoutQuery = null;
    this.largeLayoutQueryListener = null;
    this.isLargeLayoutActiveFlag = false;
    this.mobileViewState = "menu";
    this.lastMobileViewState = "menu";
    this.setActivePane(this.getActivePane());
    this.setWalletPaneBusy(this.isWalletBusy());
    this.addAccountButtonState = null;
    this.adminEmptyMessages = new Map();
    this.hashtagPreferencesUnsubscribe = null;

    if (
      this.subscriptionsService &&
      typeof this.subscriptionsService.on === "function"
    ) {
      this.subscriptionsService.on("change", (detail) => {
        this.handleSubscriptionsChange(detail);
      });
    }

    if (
      this.services.userBlocks &&
      typeof this.services.userBlocks.on === "function"
    ) {
      this.services.userBlocks.on("change", () => {
        this.populateBlockedList();
      });
    }
  }

  async load() {
    if (!(this.modalContainer instanceof HTMLElement)) {
      throw new Error("profile modal container missing");
    }

    // Invalidate any stale renderer reference so it is recreated
    // with the freshly loaded DOM elements.
    if (this.profileHistoryRenderer) {
      try {
        if (typeof this.profileHistoryRenderer.destroy === "function") {
          this.profileHistoryRenderer.destroy();
        }
      } catch (err) {
        devLogger.warn("[profileModal] Failed to destroy stale history renderer:", err);
      }
      this.profileHistoryRenderer = null;
      this.profileHistoryRendererConfig = null;
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
    this.populateHashtagPreferences();
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
    this.mobileLogoutButton =
      document.getElementById("profileMobileLogoutBtn") || null;
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
    this.navButtons.storage = document.getElementById("profileNavStorage") || null;
    this.navButtons.hashtags =
      document.getElementById("profileNavHashtags") || null;
    this.navButtons.subscriptions =
      document.getElementById("profileNavSubscriptions") || null;
    this.navButtons.friends =
      document.getElementById("profileNavFriends") || null;
    this.navButtons.blocked =
      document.getElementById("profileNavBlocked") || null;
    this.navButtons.messages =
      document.getElementById("profileNavMessages") || null;
    this.navButtons.history =
      document.getElementById("profileNavHistory") || null;
    this.navButtons.admin = document.getElementById("profileNavAdmin") || null;
    this.navButtons.safety = document.getElementById("profileNavSafety") || null;

    this.profileEditBtn = document.getElementById("profileEditBtn") || null;
    this.profileEditBackBtn = document.getElementById("profileEditBackBtn") || null;

    this.panes.account = document.getElementById("profilePaneAccount") || null;
    this.panes.edit = document.getElementById("profilePaneEdit") || null;
    this.panes.relays = document.getElementById("profilePaneRelays") || null;
    this.panes.wallet = document.getElementById("profilePaneWallet") || null;
    this.panes.storage = document.getElementById("profilePaneStorage") || null;
    this.panes.hashtags = document.getElementById("profilePaneHashtags") || null;
    this.panes.subscriptions =
      document.getElementById("profilePaneSubscriptions") || null;
    this.panes.friends = document.getElementById("profilePaneFriends") || null;
    this.panes.blocked = document.getElementById("profilePaneBlocked") || null;
    this.panes.messages = document.getElementById("profilePaneMessages") || null;
    this.panes.history = document.getElementById("profilePaneHistory") || null;
    this.panes.admin = document.getElementById("profilePaneAdmin") || null;
    this.panes.safety = document.getElementById("profilePaneSafety") || null;

    this.relayList = document.getElementById("relayList") || null;
    this.relayInput = document.getElementById("relayInput") || null;
    this.addRelayButton = document.getElementById("addRelayBtn") || null;
    this.restoreRelaysButton =
      document.getElementById("restoreRelaysBtn") || null;
    this.relayHealthPanel =
      document.getElementById("relayHealthPanel") || null;
    this.relayHealthList =
      document.getElementById("relayHealthList") || null;
    this.relayHealthStatus =
      document.getElementById("relayHealthStatus") || null;
    this.relayHealthRefreshButton =
      document.getElementById("relayHealthRefreshBtn") || null;
    this.relayHealthTelemetryToggle =
      document.getElementById("relayHealthTelemetryOptIn") || null;
    this.profileRelayRefreshBtn =
      document.getElementById("relayListRefreshBtn") || null;

    this.subscriptionList =
      document.getElementById("subscriptionsList") || null;
    this.subscriptionListEmpty =
      document.getElementById("subscriptionsEmpty") || null;
    this.profileSubscriptionsRefreshBtn =
      document.getElementById("subscriptionsRefreshBtn") || null;
    this.friendList = document.getElementById("friendsList") || null;
    this.friendListEmpty = document.getElementById("friendsEmpty") || null;
    this.friendInput = document.getElementById("friendsInput") || null;
    this.addFriendButton = document.getElementById("addFriendBtn") || null;
    this.profileFriendsRefreshBtn =
      document.getElementById("friendsRefreshBtn") || null;

    this.blockList = document.getElementById("blockedList") || null;
    this.blockListEmpty = document.getElementById("blockedEmpty") || null;
    this.blockInput = document.getElementById("blockedInput") || null;
    this.addBlockedButton = document.getElementById("addBlockedBtn") || null;
    this.profileBlockedRefreshBtn =
      document.getElementById("blockedRefreshBtn") || null;

    this.profileMessagesPane =
      document.getElementById("profilePaneMessages") || null;
    this.profileMessagesList =
      document.getElementById("profileMessagesList") || null;
    this.profileMessagesEmpty =
      document.getElementById("profileMessagesEmpty") || null;
    this.profileMessagesLoading =
      document.getElementById("profileMessagesLoading") || null;
    this.profileMessagesError =
      document.getElementById("profileMessagesError") || null;
    this.profileMessagesStatus =
      document.getElementById("profileMessagesStatus") || null;
    this.profileMessagesReloadButton =
      document.getElementById("profileMessagesReload") || null;
    this.profileMessagesConversation =
      document.getElementById("profileMessagesConversation") || null;
    this.profileMessagesConversationEmpty =
      document.getElementById("profileMessagesConversationEmpty") || null;
    this.profileMessageInput =
      document.getElementById("profileMessageInput") || null;
    this.profileMessageSendButton =
      document.getElementById("profileMessageSendBtn") || null;
    this.profileMessageAttachmentInput =
      document.getElementById("profileMessageAttachmentInput") || null;
    this.profileMessageAttachmentButton =
      document.getElementById("profileMessageAttachmentButton") || null;
    this.profileMessageAttachmentEncrypt =
      document.getElementById("profileMessageAttachmentEncrypt") || null;
    this.profileMessageAttachmentList =
      document.getElementById("profileMessageAttachmentList") || null;
    this.profileMessageAttachmentClearCache =
      document.getElementById("profileMessageAttachmentClearCache") || null;
    this.profileMessagesComposerHelper =
      document.getElementById("profileMessagesComposerHelper") || null;
    this.profileMessagesSendDmButton =
      document.getElementById("profileMessagesSendDm") || null;
    this.profileMessagesOpenRelaysButton =
      document.getElementById("profileMessagesOpenRelays") || null;
    this.profileMessagesPrivacyToggle =
      document.getElementById("profileMessagesPrivacyToggle") || null;
    this.profileMessagesPrivacyMode =
      document.getElementById("profileMessagesPrivacyMode") || null;
    this.cacheDmRelayElements();
    this.profileMessagesUnreadDot =
      document.getElementById("profileMessagesUnreadDot") || null;
    this.dmAppShellContainer =
      document.getElementById("dmAppShellMount") || null;
    this.profileLinkPreviewAutoToggle =
      document.getElementById("profileLinkPreviewAutoToggle") || null;

    if (this.pendingMessagesRender) {
      const { messages, actorPubkey } = this.pendingMessagesRender;
      this.pendingMessagesRender = null;
      void this.renderProfileMessages(messages, { actorPubkey }).catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to render pending direct messages:",
          error,
        );
      });
    } else if (
      (this.profileMessagesList instanceof HTMLElement ||
        this.dmAppShellContainer instanceof HTMLElement) &&
      Array.isArray(this.directMessagesCache) &&
      this.directMessagesCache.length
    ) {
      void this.renderProfileMessages(this.directMessagesCache, {
        actorPubkey: this.directMessagesLastActor,
      }).catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to render cached direct messages:",
          error,
        );
      });
    }

    this.setMessagesLoadingState(this.messagesLoadingState || "idle");
    this.updateMessagePrivacyModeDisplay();
    this.populateDmRelayPreferences();
    this.syncDmPrivacySettingsUi();

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

    this.hashtagStatusText =
      document.getElementById("profileHashtagStatus") || null;
    this.hashtagInterestList =
      document.getElementById("profileHashtagInterestList") || null;
    this.hashtagInterestEmpty =
      document.getElementById("profileHashtagInterestEmpty") || null;
    this.hashtagInterestInput =
      document.getElementById("profileHashtagInterestInput") || null;
    this.addHashtagInterestButton =
      document.getElementById("profileAddHashtagInterestBtn") || null;
    this.profileHashtagInterestRefreshBtn =
      document.getElementById("profileHashtagInterestRefreshBtn") || null;
    this.hashtagDisinterestList =
      document.getElementById("profileHashtagDisinterestList") || null;
    this.hashtagDisinterestEmpty =
      document.getElementById("profileHashtagDisinterestEmpty") || null;
    this.hashtagDisinterestInput =
      document.getElementById("profileHashtagDisinterestInput") || null;
    this.addHashtagDisinterestButton =
      document.getElementById("profileAddHashtagDisinterestBtn") || null;
    this.profileHashtagDisinterestRefreshBtn =
      document.getElementById("profileHashtagDisinterestRefreshBtn") || null;
    this.subscriptionsStatusText =
      document.getElementById("subscriptionsStatus") || null;

    this.profileRelayList = this.relayList;
    this.profileRelayInput = this.relayInput;
    this.profileAddRelayBtn = this.addRelayButton;
    this.profileRestoreRelaysBtn = this.restoreRelaysButton;
    this.profileSubscriptionsList = this.subscriptionList;
    this.profileSubscriptionsEmpty = this.subscriptionListEmpty;
    this.profileFriendsList = this.friendList;
    this.profileFriendsEmpty = this.friendListEmpty;
    this.profileFriendsInput = this.friendInput;
    this.profileAddFriendBtn = this.addFriendButton;
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
    this.moderationOverridesList =
      document.getElementById("profileModerationOverridesList") || null;
    this.moderationOverridesEmpty =
      document.getElementById("profileModerationOverridesEmpty") || null;
    this.moderationTrustedContactsCount =
      document.getElementById("profileModerationTrustedContactsCount") || null;
    this.moderationTrustedMuteCount =
      document.getElementById("profileModerationTrustedMuteCount") || null;
    this.moderationTrustedReportCount =
      document.getElementById("profileModerationTrustedReportCount") || null;
    this.moderationSeedOnlyIndicator =
      document.getElementById("profileModerationSeedOnlyIndicator") || null;
    this.moderationHideControlsGroup =
      this.moderationSettingsCard?.querySelector(
        "[data-role=\"trusted-hide-controls\"]",
      ) || null;
    this.moderationHideControlElements = Array.from(
      this.moderationSettingsCard?.querySelectorAll(
        "[data-role=\"trusted-hide-control\"]",
      ) || [],
    );
    this.updateTrustedMuteHideHelperCopy();

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
    this.adminModeratorsRefreshBtn =
      document.getElementById("adminModeratorsRefreshBtn") || null;

    this.storageUnlockBtn = document.getElementById("profileStorageUnlockBtn") || null;
    this.storageSaveBtn = document.getElementById("storageSaveBtn") || null;
    this.storageTestBtn = document.getElementById("storageTestBtn") || null;
    this.storageClearBtn = document.getElementById("storageClearBtn") || null;
    this.storageUnlockSection = document.getElementById("profileStorageUnlock") || null;
    this.storageFormSection = document.getElementById("profileStorageForm") || null;
    this.storageStatusText = document.getElementById("profileStorageStatus") || null;
    this.storageFormStatus = document.getElementById("storageFormStatus") || null;

    this.storageProviderInput = document.getElementById("storageProvider") || null;
    this.storageEndpointInput = document.getElementById("storageEndpoint") || null;
    this.storageRegionInput = document.getElementById("storageRegion") || null;
    this.storageAccessKeyInput = document.getElementById("storageAccessKey") || null;
    this.storageSecretKeyInput = document.getElementById("storageSecretKey") || null;
    this.storageBucketInput = document.getElementById("storageBucket") || null;
    this.storagePrefixInput = document.getElementById("storagePrefix") || null;
    this.storagePrefixWarning = document.getElementById("storagePrefixWarning") || null;
    this.storageDefaultInput = document.getElementById("storageDefault") || null;
    this.storageR2Helper = document.getElementById("storageR2Helper") || null;
    this.storageS3Helper = document.getElementById("storageS3Helper") || null;
    this.storageForcePathStyleInput = document.getElementById("storageForcePathStyle") || null;
    this.storageForcePathStyleLabel = document.getElementById("storageForcePathStyleLabel") || null;

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
    this.adminWhitelistRefreshBtn =
      document.getElementById("adminWhitelistRefreshBtn") || null;
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
    this.adminBlacklistRefreshBtn =
      document.getElementById("adminBlacklistRefreshBtn") || null;

    const ensureAriaLabel = (button, label) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (!button.getAttribute("aria-label")) {
        button.setAttribute("aria-label", label);
      }
    };

    ensureAriaLabel(this.profileRelayRefreshBtn, "Refresh relay list");
    ensureAriaLabel(
      this.profileHashtagInterestRefreshBtn,
      "Refresh interest hashtags",
    );
    ensureAriaLabel(
      this.profileHashtagDisinterestRefreshBtn,
      "Refresh disinterest hashtags",
    );
    ensureAriaLabel(this.profileSubscriptionsRefreshBtn, "Refresh subscriptions");
    ensureAriaLabel(this.profileFriendsRefreshBtn, "Refresh friends");
    ensureAriaLabel(this.profileBlockedRefreshBtn, "Refresh blocked creators");
    ensureAriaLabel(this.adminModeratorsRefreshBtn, "Refresh moderators");
    ensureAriaLabel(this.adminWhitelistRefreshBtn, "Refresh whitelist");
    ensureAriaLabel(this.adminBlacklistRefreshBtn, "Refresh blacklist");

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

    this.editNameInput = document.getElementById("editNameInput") || null;
    this.editDisplayNameInput = document.getElementById("editDisplayNameInput") || null;
    this.editAboutInput = document.getElementById("editAboutInput") || null;
    this.editWebsiteInput = document.getElementById("editWebsiteInput") || null;
    this.editNip05Input = document.getElementById("editNip05Input") || null;
    this.editLud16Input = document.getElementById("editLud16Input") || null;
    this.editPictureInput = document.getElementById("editPictureInput") || null;
    this.editBannerInput = document.getElementById("editBannerInput") || null;

    this.editPictureFile = document.getElementById("editPictureFile") || null;
    this.editPictureUploadBtn = document.getElementById("editPictureUploadBtn") || null;
    this.editPictureStorageHint = document.getElementById("editPictureStorageHint") || null;
    this.editPictureConfigureLink = document.getElementById("editPictureConfigureLink") || null;

    this.editBannerFile = document.getElementById("editBannerFile") || null;
    this.editBannerUploadBtn = document.getElementById("editBannerUploadBtn") || null;
    this.editBannerStorageHint = document.getElementById("editBannerStorageHint") || null;
    this.editBannerConfigureLink = document.getElementById("editBannerConfigureLink") || null;

    this.editSaveBtn = document.getElementById("editSaveBtn") || null;
    this.editCancelBtn = document.getElementById("editCancelBtn") || null;
    this.editStatusText = document.getElementById("editStatusText") || null;

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
      this.profileHistoryRenderer = this.createWatchHistoryRenderer({
        ...config,
        container: this.profileModalPanel || this.profileModalRoot,
      });
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
      scrollContainerSelector: "#profileModalPanes",
      errorBannerSelector: "#profileHistoryError",
      clearButtonSelector: "#profileHistoryClear",
      refreshButtonSelector: "#profileHistoryRefresh",
      privacyBannerSelector: "#profileHistoryPrivacyBanner",
      privacyMessageSelector: "#profileHistoryPrivacyMessage",
      privacyToggleSelector: "#profileHistoryPrivacyToggle",
      privacyDismissSelector: "#profileHistoryPrivacyDismiss",
      infoSelector: "#profileHistoryInfo",
      featureBannerSelector: "#profileHistoryFeatureBanner",
      sessionWarningSelector: "#profileHistorySessionWarning",
      emptyCopy: "You haven’t watched any videos yet.",
      variant: "modal",
      remove: (payload) =>
        this.callbacks.onHistoryReady({
          ...(typeof payload === "object" && payload ? payload : {}),
          controller: this,
          renderer: this.profileHistoryRenderer,
        }),
    };

    return this.profileHistoryRendererConfig;
  }

  initializeDirectMessagesService() {
    this.teardownDirectMessagesService();

    if (!this.nostrService || typeof this.nostrService.on !== "function") {
      return;
    }

    const unsubscribes = [];
    const subscribe = (eventName, handler) => {
      try {
        const unsubscribe = this.nostrService.on(eventName, handler);
        if (typeof unsubscribe === "function") {
          unsubscribes.push(unsubscribe);
        }
      } catch (error) {
        devLogger.warn(
          `[profileModal] Failed to subscribe to ${eventName} direct message events:`,
          error,
        );
      }
    };

    subscribe("directMessages:updated", (detail) => {
      this.handleDirectMessagesUpdated(detail);
    });
    subscribe("directMessages:cleared", () => {
      this.handleDirectMessagesCleared();
    });
    subscribe("directMessages:error", (detail) => {
      this.handleDirectMessagesError(detail);
    });
    subscribe("directMessages:failure", (detail) => {
      this.handleDirectMessagesError(detail);
    });
    subscribe("directMessages:relayWarning", (detail) => {
      this.handleDirectMessagesRelayWarning(detail);
    });

    this.directMessagesUnsubscribes = unsubscribes;

    const actor = this.resolveActiveDmActor();
    if (actor) {
      this.directMessagesLastActor = actor;
    }

    if (
      this.nostrService &&
      typeof this.nostrService.hydrateDirectMessagesFromStore === "function"
    ) {
      void this.nostrService
        .hydrateDirectMessagesFromStore({ emit: true })
        .then((messages) => {
          if (Array.isArray(messages)) {
            this.directMessagesCache = messages;
            const active = this.resolveActiveDmActor();
            if (active) {
              this.directMessagesLastActor = active;
            }
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[profileModal] Failed to hydrate cached direct messages:",
            error,
          );
        });
    }
  }

  teardownDirectMessagesService() {
    if (!Array.isArray(this.directMessagesUnsubscribes)) {
      this.directMessagesUnsubscribes = [];
      return;
    }

    while (this.directMessagesUnsubscribes.length) {
      const unsubscribe = this.directMessagesUnsubscribes.pop();
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to remove direct message event listener:",
            error,
          );
        }
      }
    }
  }

  resolveActiveDmActor() {
    const active = this.normalizeHexPubkey(this.getActivePubkey());
    if (active) {
      return active;
    }

    const client = this.services.nostrClient || null;
    if (client) {
      if (typeof client.pubkey === "string" && client.pubkey.trim()) {
        const normalizedClient = this.normalizeHexPubkey(client.pubkey);
        if (normalizedClient) {
          return normalizedClient;
        }
      }

      if (
        client.sessionActor &&
        typeof client.sessionActor.pubkey === "string" &&
        client.sessionActor.pubkey.trim()
      ) {
        const session = this.normalizeHexPubkey(client.sessionActor.pubkey);
        if (session) {
          return session;
        }
      }
    }

    return null;
  }

  resolveActiveDmRecipient() {
    const candidate =
      typeof this.state.getDmRecipient === "function"
        ? this.state.getDmRecipient()
        : null;
    const normalized = this.normalizeHexPubkey(candidate);
    if (normalized) {
      return normalized;
    }
    return null;
  }

  resolveActiveDmRelayOwner() {
    const active = this.normalizeHexPubkey(this.getActivePubkey());
    if (active) {
      return active;
    }

    return this.resolveActiveDmActor();
  }

  getActiveDmRelayPreferences() {
    const owner = this.resolveActiveDmRelayOwner();
    if (!owner || typeof this.state.getDmRelayPreferences !== "function") {
      return [];
    }

    const relays = this.state.getDmRelayPreferences(owner);
    return Array.isArray(relays) ? relays.slice() : [];
  }

  setActiveDmRelayPreferences(relays = []) {
    const owner = this.resolveActiveDmRelayOwner();
    if (!owner || typeof this.state.setDmRelayPreferences !== "function") {
      return [];
    }

    return this.state.setDmRelayPreferences(owner, relays);
  }

  setDmRelayPreferencesStatus(message = "") {
    if (!(this.profileMessagesRelayStatus instanceof HTMLElement)) {
      return;
    }

    const text = typeof message === "string" ? message.trim() : "";
    this.profileMessagesRelayStatus.textContent = text;
  }

  updateMessagePrivacyModeDisplay() {
    if (!(this.profileMessagesPrivacyMode instanceof HTMLElement)) {
      return;
    }

    const isNip17 =
      this.profileMessagesPrivacyToggle instanceof HTMLInputElement
        ? this.profileMessagesPrivacyToggle.checked
        : false;
    const label = isNip17 ? "NIP-17" : "NIP-04";
    this.profileMessagesPrivacyMode.textContent = `Privacy: ${label}`;
    this.profileMessagesPrivacyMode.title = isNip17
      ? "NIP-17 gift-wraps your DM so relays only see the wrapper and relay hints."
      : "NIP-04 sends a direct encrypted DM; relays can still see sender and recipient metadata.";
  }

  getDmPrivacySettingsSnapshot() {
    const fallback = createInternalDefaultDmPrivacySettings();
    if (typeof this.state.getDmPrivacySettings !== "function") {
      return { ...fallback };
    }

    const settings = this.state.getDmPrivacySettings();
    return {
      readReceiptsEnabled:
        typeof settings?.readReceiptsEnabled === "boolean"
          ? settings.readReceiptsEnabled
          : fallback.readReceiptsEnabled,
      typingIndicatorsEnabled:
        typeof settings?.typingIndicatorsEnabled === "boolean"
          ? settings.typingIndicatorsEnabled
          : fallback.typingIndicatorsEnabled,
    };
  }

  persistDmPrivacySettings(partial = {}) {
    if (typeof this.state.setDmPrivacySettings !== "function") {
      return this.getDmPrivacySettingsSnapshot();
    }

    const resolved =
      partial && typeof partial === "object" ? partial : {};

    const current = this.getDmPrivacySettingsSnapshot();
    const merged = {
      readReceiptsEnabled:
        typeof resolved.readReceiptsEnabled === "boolean"
          ? resolved.readReceiptsEnabled
          : current.readReceiptsEnabled,
      typingIndicatorsEnabled:
        typeof resolved.typingIndicatorsEnabled === "boolean"
          ? resolved.typingIndicatorsEnabled
          : current.typingIndicatorsEnabled,
    };

    return this.state.setDmPrivacySettings(merged);
  }

  syncDmPrivacySettingsUi() {
    // Legacy UI toggles removed.
    // This method is kept for backwards compatibility with call sites that might expect it,
    // though the settings are now managed via AppShell.
  }

  handleReadReceiptsToggle(enabled) {
    this.persistDmPrivacySettings({
      readReceiptsEnabled: Boolean(enabled),
    });
    this.syncDmPrivacySettingsUi();
    this.showStatus(
      enabled
        ? "Read receipts enabled for direct messages."
        : "Read receipts disabled.",
    );
  }

  handleTypingIndicatorsToggle(enabled) {
    this.persistDmPrivacySettings({
      typingIndicatorsEnabled: Boolean(enabled),
    });
    this.syncDmPrivacySettingsUi();
    this.showStatus(
      enabled
        ? "Typing indicators enabled for direct messages."
        : "Typing indicators disabled.",
    );
  }

  syncLinkPreviewSettingsUi() {
    if (!(this.profileLinkPreviewAutoToggle instanceof HTMLInputElement)) {
      return;
    }
    const settings = getLinkPreviewSettings();
    this.profileLinkPreviewAutoToggle.checked = Boolean(
      settings?.autoFetchUnknownDomains,
    );
  }

  handleLinkPreviewToggle(enabled) {
    setLinkPreviewAutoFetch(Boolean(enabled));
  }

  cacheDmRelayElements() {
    this.profileMessagesRelayList =
      document.getElementById("profileMessagesRelayList") || null;
    this.profileMessagesRelayInput =
      document.getElementById("profileMessagesRelayInput") || null;
    this.profileMessagesRelayAddButton =
      document.getElementById("profileMessagesRelayAdd") || null;
    this.profileMessagesRelayPublishButton =
      document.getElementById("profileMessagesRelayPublish") || null;
    this.profileMessagesRelayStatus =
      document.getElementById("profileMessagesRelayStatus") || null;
  }

  bindDmRelayControls() {
    const bindOnce = (element, eventName, handler, key) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      const datasetKey = key || "dmRelayBound";
      if (element.dataset[datasetKey] === "true") {
        return;
      }
      element.dataset[datasetKey] = "true";
      element.addEventListener(eventName, handler);
    };

    bindOnce(
      this.profileMessagesRelayAddButton,
      "click",
      () => {
        void this.handleAddDmRelayPreference();
      },
      "dmRelayAddBound",
    );

    bindOnce(
      this.profileMessagesRelayInput,
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddDmRelayPreference();
        }
      },
      "dmRelayInputBound",
    );

    bindOnce(
      this.profileMessagesRelayPublishButton,
      "click",
      () => {
        void this.handlePublishDmRelayPreferences();
      },
      "dmRelayPublishBound",
    );
  }

  async refreshDmRelayPreferences({ force = false } = {}) {
    const owner = this.resolveActiveDmRelayOwner();
    if (!owner) {
      this.populateDmRelayPreferences();
      return;
    }

    const existing = this.getActiveDmRelayPreferences();
    if (!existing.length || force) {
      if (typeof this.services.fetchDmRelayHints === "function") {
        try {
          const hints = await this.services.fetchDmRelayHints(owner);
          if (typeof this.state.setDmRelayPreferences === "function") {
            this.state.setDmRelayPreferences(owner, hints);
          }
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to refresh DM relay hints for profile:",
            error,
          );
        }
      }
    }

    this.populateDmRelayPreferences();
  }

  populateDmRelayPreferences() {
    if (!(this.profileMessagesRelayList instanceof HTMLElement)) {
      return;
    }

    const owner = this.resolveActiveDmRelayOwner();
    const relays = this.getActiveDmRelayPreferences();

    this.profileMessagesRelayList.innerHTML = "";

    if (!owner) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-border/60 p-4 text-center text-xs text-muted";
      emptyState.textContent = "Sign in to add DM relay hints.";
      this.profileMessagesRelayList.appendChild(emptyState);
      this.setDmRelayPreferencesStatus("");
      return;
    }

    if (!relays.length) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-border/60 p-4 text-center text-xs text-muted";
      emptyState.textContent = "No DM relay hints yet.";
      this.profileMessagesRelayList.appendChild(emptyState);
      return;
    }

    relays.forEach((url) => {
      const item = document.createElement("li");
      item.className = "card flex items-center justify-between gap-3 p-3";

      const label = document.createElement("p");
      label.className = "text-xs font-medium text-text break-all";
      label.textContent = url;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-ghost focus-ring text-xs";
      removeBtn.dataset.variant = "danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        void this.handleRemoveDmRelayPreference(url);
      });

      item.appendChild(label);
      item.appendChild(removeBtn);
      this.profileMessagesRelayList.appendChild(item);
    });
  }

  async handleAddDmRelayPreference() {
    const input = this.profileMessagesRelayInput;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const owner = this.resolveActiveDmRelayOwner();
    if (!owner) {
      this.showError("Please sign in to save DM relay hints.");
      return;
    }

    const rawValue = typeof input.value === "string" ? input.value.trim() : "";
    const sanitized = sanitizeRelayList([rawValue]);
    const relayUrl = sanitized[0];
    if (!relayUrl) {
      this.showError("Enter a valid WSS relay URL.");
      return;
    }

    const current = this.getActiveDmRelayPreferences();
    const next = sanitizeRelayList([...current, relayUrl]);
    this.setActiveDmRelayPreferences(next);
    input.value = "";
    this.populateDmRelayPreferences();
    this.setDmRelayPreferencesStatus("DM relay hint added.");
  }

  async handleRemoveDmRelayPreference(url) {
    const owner = this.resolveActiveDmRelayOwner();
    if (!owner) {
      this.showError("Please sign in to update DM relay hints.");
      return;
    }

    const target = typeof url === "string" ? url.trim() : "";
    if (!target) {
      return;
    }

    const current = this.getActiveDmRelayPreferences();
    const next = current.filter((entry) => entry !== target);
    this.setActiveDmRelayPreferences(next);
    this.populateDmRelayPreferences();
    this.setDmRelayPreferencesStatus("DM relay hint removed.");
  }

  async handlePublishDmRelayPreferences() {
    const owner = this.resolveActiveDmRelayOwner();
    if (!owner) {
      this.showError("Please sign in to publish DM relay hints.");
      return;
    }

    const relays = this.getActiveDmRelayPreferences();
    if (!relays.length) {
      this.showError("Add at least one DM relay before publishing.");
      return;
    }

    const callback = this.callbacks.onPublishDmRelayPreferences;
    if (!callback || callback === noop) {
      this.showError("DM relay publishing is unavailable right now.");
      return;
    }

    this.setDmRelayPreferencesStatus("Publishing DM relay hints…");

    try {
      const result = await callback({
        pubkey: owner,
        relays,
        controller: this,
      });
      if (result?.ok) {
        const acceptedCount = Array.isArray(result.accepted)
          ? result.accepted.length
          : 0;
        const summary = acceptedCount
          ? `Published to ${acceptedCount} relay${acceptedCount === 1 ? "" : "s"}.`
          : "DM relay hints published.";
        this.showSuccess("DM relay hints published.");
        this.setDmRelayPreferencesStatus(summary);
        return;
      }
      this.showError("Failed to publish DM relay hints.");
      this.setDmRelayPreferencesStatus("DM relay hints publish failed.");
    } catch (error) {
      const message =
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Failed to publish DM relay hints.";
      this.showError(message);
      this.setDmRelayPreferencesStatus(message);
    }
  }

  buildDmRecipientContext(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return null;
    }

    const npub =
      typeof this.safeEncodeNpub === "function"
        ? this.safeEncodeNpub(normalized)
        : null;

    const cacheEntry =
      typeof this.services.getProfileCacheEntry === "function"
        ? this.services.getProfileCacheEntry(normalized)
        : null;
    const profile = cacheEntry?.profile || null;

    const displayName =
      profile?.display_name?.trim?.() ||
      profile?.name?.trim?.() ||
      (typeof this.formatShortNpub === "function"
        ? this.formatShortNpub(npub)
        : npub) ||
      npub ||
      "Unknown profile";

    const relayHints =
      typeof this.state.getDmRelayHints === "function"
        ? this.state.getDmRelayHints(normalized)
        : [];

    return {
      pubkey: normalized,
      npub,
      profile,
      displayName,
      relayHints: Array.isArray(relayHints) ? relayHints.slice() : [],
    };
  }

  async ensureDmRecipientData(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return null;
    }

    if (
      typeof this.services.batchFetchProfiles === "function"
    ) {
      try {
        await this.services.batchFetchProfiles([normalized]);
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM recipient metadata:",
          error,
        );
      }
    }

    if (typeof this.services.fetchDmRelayHints === "function") {
      try {
        const hints = await this.services.fetchDmRelayHints(normalized);
        if (typeof this.state.setDmRelayHints === "function") {
          this.state.setDmRelayHints(normalized, hints);
        }
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM relay hints:",
          error,
        );
      }
    }

    const context = this.buildDmRecipientContext(normalized);
    this.updateDmPrivacyToggleForRecipient(context);
    return context;
  }

  updateDmPrivacyToggleForRecipient(recipientContext, { force = false } = {}) {
    if (!recipientContext) {
      return;
    }

    const relayHints = Array.isArray(recipientContext.relayHints)
      ? recipientContext.relayHints
      : [];
    const hasHints = relayHints.length > 0;

    if (!this.dmPrivacyToggleTouched || force) {
      this.setPrivacyToggleState(hasHints);
    }
  }

  setDirectMessageRecipient(pubkey, { reason = "manual" } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey);
    const nextRecipient = normalized || null;

    if (typeof this.state.setDmRecipient === "function") {
      this.state.setDmRecipient(nextRecipient);
    }

    this.dmPrivacyToggleTouched = false;
    this.updateMessageThreadSelection(nextRecipient);

    if (nextRecipient) {
      void this.ensureDmRecipientData(nextRecipient);
      this.setMessagesAnnouncement("Ready to message this recipient.");
    } else if (reason === "clear") {
      this.setMessagesAnnouncement("Message recipient cleared.");
      this.setFocusedDmConversation("");
    }

    void this.renderDirectMessageConversation();
    if (this.dmAppShellContainer instanceof HTMLElement) {
      void this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: this.resolveActiveDmActor(),
      });
    }
    return nextRecipient;
  }

  updateMessageThreadSelection(activeRecipient) {
    if (!(this.profileMessagesList instanceof HTMLElement)) {
      return;
    }

    const normalized = this.normalizeHexPubkey(activeRecipient);
    const items = Array.from(
      this.profileMessagesList.querySelectorAll("[data-remote-pubkey]"),
    );

    items.forEach((item) => {
      if (!(item instanceof HTMLElement)) {
        return;
      }
      const remote = this.normalizeHexPubkey(item.dataset.remotePubkey);
      const isActive = normalized && remote === normalized;
      item.dataset.state = isActive ? "active" : "inactive";
    });
  }

  focusMessageComposer() {
    const input = this.profileMessageInput;
    if (input instanceof HTMLTextAreaElement) {
      input.focus();
      input.select();
    }
  }

  setPrivacyToggleState(enabled) {
    if (this.profileMessagesPrivacyToggle instanceof HTMLInputElement) {
      this.profileMessagesPrivacyToggle.checked = Boolean(enabled);
    }
    this.updateMessagePrivacyModeDisplay();
  }

  async ensureDirectMessageSubscription(actorPubkey = null) {
    if (
      !this.nostrService ||
      typeof this.nostrService.ensureDirectMessageSubscription !== "function"
    ) {
      return null;
    }

    const normalizedActor = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    if (!normalizedActor) {
      return null;
    }

    if (
      this.directMessagesSubscription &&
      this.directMessagesSubscription.actor === normalizedActor
    ) {
      return this.directMessagesSubscription.subscription || null;
    }

    if (
      this.directMessagesSubscription &&
      this.directMessagesSubscription.actor &&
      this.directMessagesSubscription.actor !== normalizedActor
    ) {
      this.resetDirectMessageSubscription();
    }

    let subscription = null;
    try {
      subscription = await this.nostrService.ensureDirectMessageSubscription({
        actorPubkey: normalizedActor,
      });
    } catch (error) {
      userLogger.warn(
        "[profileModal] Failed to subscribe to direct messages:",
        error,
      );
      return null;
    }

    this.directMessagesSubscription = {
      actor: normalizedActor,
      subscription,
    };

    return subscription;
  }

  resetDirectMessageSubscription() {
    if (
      this.directMessagesSubscription &&
      this.nostrService &&
      typeof this.nostrService.stopDirectMessageSubscription === "function"
    ) {
      try {
        this.nostrService.stopDirectMessageSubscription();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to stop direct message subscription:",
          error,
        );
      }
    }

    this.directMessagesSubscription = null;
  }

  handleActiveDmIdentityChanged(actorPubkey = null) {
    const normalized = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    this.setDirectMessageRecipient(null, { reason: "clear" });
    this.resetAttachmentQueue({ clearInput: true });
    this.dmReadReceiptCache.clear();
    this.dmTypingLastSentAt = 0;
    this.syncDmPrivacySettingsUi();

    if (
      this.directMessagesSubscription &&
      this.directMessagesSubscription.actor &&
      normalized !== this.directMessagesSubscription.actor
    ) {
      this.resetDirectMessageSubscription();
    }

    this.directMessagesLastActor = normalized || null;
    this.directMessagesCache = [];
    this.messagesInitialLoadPending = true;
    this.pendingMessagesRender = null;

    if (this.profileMessagesList instanceof HTMLElement) {
      this.profileMessagesList.innerHTML = "";
      this.profileMessagesList.classList.add("hidden");
      this.profileMessagesList.setAttribute("hidden", "");
    }
    if (this.profileMessagesConversation instanceof HTMLElement) {
      this.profileMessagesConversation.innerHTML = "";
      this.profileMessagesConversation.classList.add("hidden");
      this.profileMessagesConversation.setAttribute("hidden", "");
    }
    if (this.profileMessagesConversationEmpty instanceof HTMLElement) {
      this.profileMessagesConversationEmpty.classList.remove("hidden");
      this.profileMessagesConversationEmpty.removeAttribute("hidden");
    }

    if (!normalized) {
      this.setMessagesLoadingState("unauthenticated");
      this.updateMessagesReloadState();
      this.populateDmRelayPreferences();
      this.setDmRelayPreferencesStatus("");
      return;
    }

    this.setMessagesLoadingState("loading");
    void this.ensureDirectMessageSubscription(normalized);
    this.updateMessagesReloadState();

    if (this.getActivePane() === "messages") {
      void this.populateProfileMessages({
        force: true,
        reason: "identity-change",
      });
    }

    void this.refreshDmRelayPreferences({ force: true });
  }

  setMessagesLoadingState(state, options = {}) {
    const normalized = typeof state === "string" ? state : "idle";
    const defaults = {
      idle: "",
      loading: "Fetching direct messages from relays…",
      ready: "",
      empty: "No direct messages yet.",
      unauthenticated: "Sign in to view your direct messages.",
      error: "Failed to load direct messages. Try again later.",
    };

    const providedMessage =
      typeof options.message === "string" && options.message.trim()
        ? options.message.trim()
        : "";
    const message = providedMessage || defaults[normalized] || "";

    this.messagesLoadingState = normalized;

    if (this.profileMessagesPane instanceof HTMLElement) {
      this.profileMessagesPane.setAttribute("data-messages-state", normalized);
    }

    const toggleVisibility = (element, shouldShow) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (shouldShow) {
        element.classList.remove("hidden");
        element.removeAttribute("hidden");
      } else {
        element.classList.add("hidden");
        element.setAttribute("hidden", "");
      }
    };

    toggleVisibility(
      this.profileMessagesLoading,
      normalized === "loading",
    );

    if (this.profileMessagesError instanceof HTMLElement) {
      if (normalized === "error") {
        this.profileMessagesError.textContent = message;
        toggleVisibility(this.profileMessagesError, true);
      } else {
        this.profileMessagesError.textContent = "";
        toggleVisibility(this.profileMessagesError, false);
      }
    }

    if (this.profileMessagesEmpty instanceof HTMLElement) {
      if (normalized === "empty" || normalized === "unauthenticated") {
        this.profileMessagesEmpty.textContent = message || defaults[normalized];
        toggleVisibility(this.profileMessagesEmpty, true);
      } else {
        toggleVisibility(this.profileMessagesEmpty, false);
      }
    }

    const hasMessages =
      Array.isArray(this.directMessagesCache) &&
      this.directMessagesCache.length > 0;

    if (this.profileMessagesList instanceof HTMLElement) {
      if (normalized === "loading" || normalized === "unauthenticated") {
        toggleVisibility(this.profileMessagesList, false);
      } else if (hasMessages) {
        toggleVisibility(this.profileMessagesList, true);
      }
    }

    if (this.profileMessagesStatus instanceof HTMLElement) {
      if (message && normalized !== "error") {
        this.profileMessagesStatus.textContent = message;
      } else if (normalized === "error") {
        this.profileMessagesStatus.textContent = "";
      } else if (providedMessage) {
        this.profileMessagesStatus.textContent = providedMessage;
      } else {
        this.profileMessagesStatus.textContent = "";
      }
    }

    this.updateMessagesReloadState();
    this.updateMessageComposerState();

    if (this.dmAppShellContainer instanceof HTMLElement) {
      void this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: this.resolveActiveDmActor(),
      });
    }
  }

  updateMessagesReloadState() {
    const button = this.profileMessagesReloadButton;
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const actor = this.resolveActiveDmActor();
    const disabled =
      !actor ||
      this.messagesLoadingState === "loading" ||
      this.activeMessagesRequest !== null;

    if ("disabled" in button) {
      button.disabled = disabled;
    }

    if (disabled) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
  }

  setMessagesUnreadIndicator(visible) {
    if (!(this.profileMessagesUnreadDot instanceof HTMLElement)) {
      return;
    }

    const button = this.navButtons.messages;
    const isVisible =
      button instanceof HTMLElement &&
      !button.classList.contains("hidden") &&
      !button.hasAttribute("hidden");

    this.profileMessagesUnreadDot.classList.toggle(
      "is-visible",
      Boolean(visible) && isVisible,
    );
  }

  updateMessageComposerState() {
    const input = this.profileMessageInput;
    const button = this.profileMessageSendButton;
    const helper = this.profileMessagesComposerHelper;
    const attachmentInput = this.profileMessageAttachmentInput;
    const attachmentButton = this.profileMessageAttachmentButton;
    const attachmentEncrypt = this.profileMessageAttachmentEncrypt;
    const attachmentClearCache = this.profileMessageAttachmentClearCache;
    const shouldDisable = this.messagesLoadingState === "unauthenticated";

    const applyDisabledState = (element) => {
      if (!(element instanceof HTMLElement) || !("disabled" in element)) {
        return;
      }

      element.disabled = shouldDisable;
      if (shouldDisable) {
        element.setAttribute("aria-disabled", "true");
      } else {
        element.removeAttribute("aria-disabled");
      }
    };

    applyDisabledState(input);
    applyDisabledState(button);
    applyDisabledState(attachmentInput);
    applyDisabledState(attachmentButton);
    applyDisabledState(attachmentEncrypt);
    applyDisabledState(attachmentClearCache);

    if (helper instanceof HTMLElement) {
      if (shouldDisable) {
        helper.textContent = "Sign in to send messages.";
        helper.classList.remove("hidden");
        helper.removeAttribute("hidden");
      } else {
        helper.classList.add("hidden");
        helper.setAttribute("hidden", "");
      }
    }

    this.updateMessagePrivacyModeDisplay();
  }

  setMessagesAnnouncement(message) {
    if (!(this.profileMessagesStatus instanceof HTMLElement)) {
      return;
    }

    const content = typeof message === "string" ? message.trim() : "";
    if (!content) {
      this.profileMessagesStatus.textContent = "";
      if (this.messagesStatusClearTimeout) {
        clearTimeout(this.messagesStatusClearTimeout);
        this.messagesStatusClearTimeout = null;
      }
      return;
    }

    this.profileMessagesStatus.textContent = content;

    if (typeof window !== "undefined" && window && window.setTimeout) {
      if (this.messagesStatusClearTimeout) {
        clearTimeout(this.messagesStatusClearTimeout);
      }
      this.messagesStatusClearTimeout = window.setTimeout(() => {
        if (this.profileMessagesStatus) {
          this.profileMessagesStatus.textContent = "";
        }
        this.messagesStatusClearTimeout = null;
      }, 2500);
    }
  }

  async handleSendDmRequest() {
    const recipient = this.resolveActiveDmRecipient();
    if (!recipient) {
      this.showError("Please select a message recipient.");
      return;
    }

    const context = await this.ensureDmRecipientData(recipient);
    this.focusMessageComposer();

    const callback = this.callbacks.onSendDm;
    if (callback && callback !== noop) {
      callback({
        actorPubkey: this.resolveActiveDmActor(),
        recipient: context,
        controller: this,
      });
    }
  }

  async handleOpenDmRelaysRequest() {
    const recipient = this.resolveActiveDmRecipient();
    if (!recipient) {
      this.showError("Please select a message recipient.");
      return;
    }

    const context = await this.ensureDmRecipientData(recipient);

    const callback = this.callbacks.onOpenRelays;
    if (callback && callback !== noop) {
      callback({ controller: this, recipient: context });
    }
  }

  handlePrivacyToggle(enabled) {
    const recipientContext = this.buildDmRecipientContext(
      this.resolveActiveDmRecipient(),
    );
    const relayHints = Array.isArray(recipientContext?.relayHints)
      ? recipientContext.relayHints
      : [];

    if (enabled && !relayHints.length) {
      this.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
        { autoHideMs: 5000 },
      );
    }

    this.dmPrivacyToggleTouched = true;
    this.updateMessagePrivacyModeDisplay();
    const callback = this.callbacks.onTogglePrivacy;
    if (callback && callback !== noop) {
      callback({
        controller: this,
        enabled: Boolean(enabled),
        recipient: recipientContext,
      });
    }
  }

  generateAttachmentId(file) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    const name = typeof file?.name === "string" ? file.name : "attachment";
    return `${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  resetAttachmentQueue({ clearInput = false } = {}) {
    this.dmAttachmentQueue.forEach((entry) => {
      if (entry?.previewUrl && typeof URL !== "undefined") {
        try {
          URL.revokeObjectURL(entry.previewUrl);
        } catch (error) {
          devLogger.warn("[profileModal] Failed to revoke attachment preview URL.", error);
        }
      }
    });
    this.dmAttachmentQueue = [];
    this.dmAttachmentUploads.clear();

    if (clearInput && this.profileMessageAttachmentInput) {
      this.profileMessageAttachmentInput.value = "";
    }

    this.renderAttachmentQueue();
  }

  handleAttachmentSelection() {
    const input = this.profileMessageAttachmentInput;
    if (!(input instanceof HTMLInputElement) || !input.files) {
      return;
    }

    const files = Array.from(input.files);
    if (!files.length) {
      return;
    }

    files.forEach((file) => {
      const previewUrl =
        typeof URL !== "undefined" ? URL.createObjectURL(file) : "";
      this.dmAttachmentQueue.push({
        id: this.generateAttachmentId(file),
        file,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        previewUrl,
        status: "pending",
        progress: 0,
      });
    });

    input.value = "";
    this.renderAttachmentQueue();
  }

  renderAttachmentQueue() {
    const list = this.profileMessageAttachmentList;
    if (!(list instanceof HTMLElement)) {
      return;
    }

    list.innerHTML = "";

    if (!this.dmAttachmentQueue.length) {
      return;
    }

    this.dmAttachmentQueue.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "card flex flex-col gap-2 p-3";
      item.dataset.attachmentId = entry.id;

      const header = document.createElement("div");
      header.className = "flex items-center justify-between gap-2";
      const title = document.createElement("div");
      title.className = "text-sm font-semibold text-text";
      title.textContent = entry.name || "Attachment";
      header.appendChild(title);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn-ghost focus-ring inline-flex items-center";
      removeButton.dataset.size = "sm";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        this.dmAttachmentQueue = this.dmAttachmentQueue.filter(
          (queued) => queued.id !== entry.id,
        );
        if (entry.previewUrl && typeof URL !== "undefined") {
          URL.revokeObjectURL(entry.previewUrl);
        }
        this.renderAttachmentQueue();
      });
      header.appendChild(removeButton);
      item.appendChild(header);

      const meta = document.createElement("div");
      meta.className = "text-xs text-muted";
      const sizeLabel = formatAttachmentSize(entry.size);
      meta.textContent = sizeLabel
        ? `${entry.type || "file"} · ${sizeLabel}`
        : entry.type || "file";
      item.appendChild(meta);

      if (entry.previewUrl && entry.type?.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = entry.previewUrl;
        img.alt = entry.name || "Attachment preview";
        img.className = "h-24 w-24 rounded-lg object-cover";
        item.appendChild(img);
      }

      const progress = document.createElement("progress");
      progress.className = "progress";
      progress.value = entry.progress || 0;
      progress.max = 1;
      progress.dataset.variant = "surface";
      item.appendChild(progress);

      const status = document.createElement("div");
      status.className = "text-xs text-muted";
      status.textContent =
        entry.status === "uploading"
          ? "Uploading…"
          : entry.status === "error"
          ? entry.error || "Upload failed."
          : "Ready to upload.";
      item.appendChild(status);

      list.appendChild(item);
    });
  }

  async uploadAttachmentQueue(actorPubkey) {
    const r2Service = this.services.r2Service;
    if (!r2Service) {
      throw new Error("Storage service unavailable.");
    }

    const encrypt =
      this.profileMessageAttachmentEncrypt instanceof HTMLInputElement
        ? this.profileMessageAttachmentEncrypt.checked
        : false;

    const payloads = [];

    for (const entry of this.dmAttachmentQueue) {
      entry.status = "uploading";
      entry.progress = 0;
      this.renderAttachmentQueue();

      try {
        const payload = await uploadAttachment({
          r2Service,
          pubkey: actorPubkey,
          file: entry.file,
          encrypt,
          buildKey: buildR2Key,
          buildUrl: buildPublicUrl,
          onProgress: (fraction) => {
            entry.progress = Number.isFinite(fraction) ? fraction : entry.progress;
            this.renderAttachmentQueue();
          },
        });
        payloads.push(payload);
        entry.status = "uploaded";
        entry.progress = 1;
      } catch (error) {
        entry.status = "error";
        entry.error =
          error && typeof error.message === "string"
            ? error.message
            : "Attachment upload failed.";
        this.renderAttachmentQueue();
        throw error;
      }
    }

    return payloads;
  }

  async renderDirectMessageConversation() {
    const container = this.profileMessagesConversation;
    const emptyState = this.profileMessagesConversationEmpty;
    const actor = this.resolveActiveDmActor();
    const recipient = this.resolveActiveDmRecipient();

    if (!(container instanceof HTMLElement)) {
      return;
    }

    container.innerHTML = "";

    if (!actor || !recipient || !this.directMessagesCache.length) {
      container.classList.add("hidden");
      container.setAttribute("hidden", "");
      if (emptyState instanceof HTMLElement) {
        emptyState.classList.remove("hidden");
        emptyState.removeAttribute("hidden");
      }
      return;
    }

    const messages = this.directMessagesCache
      .filter((entry) => this.resolveDirectMessageRemote(entry, actor) === recipient)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (!messages.length) {
      container.classList.add("hidden");
      container.setAttribute("hidden", "");
      if (emptyState instanceof HTMLElement) {
        emptyState.classList.remove("hidden");
        emptyState.removeAttribute("hidden");
      }
      return;
    }

    if (emptyState instanceof HTMLElement) {
      emptyState.classList.add("hidden");
      emptyState.setAttribute("hidden", "");
    }

    void this.maybePublishReadReceipt(messages, {
      recipientPubkey: recipient,
    });

    messages.forEach((message) => {
      const item = document.createElement("div");
      item.className = "card flex flex-col gap-2 p-3";

      const body = document.createElement("div");
      body.className = "text-sm text-text whitespace-pre-line";
      const text = typeof message.plaintext === "string" ? message.plaintext.trim() : "";
      body.textContent = text || "Attachment";
      item.appendChild(body);

      const attachments = extractAttachmentsFromMessage(message);
      attachments.forEach((attachment) => {
        const attachmentCard = document.createElement("div");
        attachmentCard.className = "flex flex-col gap-2 rounded-lg border border-border/60 p-3";

        const title = document.createElement("div");
        title.className = "text-xs font-semibold text-text";
        title.textContent = describeAttachment(attachment);
        attachmentCard.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "text-3xs text-muted";
        const sizeLabel = formatAttachmentSize(attachment.size);
        const typeLabel = attachment.type || "file";
        meta.textContent = sizeLabel ? `${typeLabel} · ${sizeLabel}` : typeLabel;
        attachmentCard.appendChild(meta);

        const progress = document.createElement("progress");
        progress.className = "progress";
        progress.value = 0;
        progress.max = 1;
        progress.dataset.variant = "surface";
        attachmentCard.appendChild(progress);

        const status = document.createElement("div");
        status.className = "text-3xs text-muted";
        status.textContent = attachment.encrypted
          ? "Decrypting attachment…"
          : "Downloading attachment…";
        attachmentCard.appendChild(status);

        item.appendChild(attachmentCard);

        downloadAttachment({
          url: attachment.url,
          expectedHash: attachment.x,
          key: attachment.key,
          mimeType: attachment.type,
          onProgress: (fraction) => {
            progress.value = Number.isFinite(fraction) ? fraction : progress.value;
          },
        })
          .then((result) => {
            progress.value = 1;
            progress.classList.add("hidden");
            progress.setAttribute("hidden", "");
            status.textContent = attachment.encrypted ? "Decrypted." : "Ready.";

            if (!result?.objectUrl) {
              return;
            }

            if (attachment.type?.startsWith("image/")) {
              const img = document.createElement("img");
              img.src = result.objectUrl;
              img.alt = attachment.name || "Attachment preview";
              img.className = "h-40 w-full rounded-lg object-cover";
              attachmentCard.appendChild(img);
            } else if (attachment.type?.startsWith("video/")) {
              const video = document.createElement("video");
              video.src = result.objectUrl;
              video.controls = true;
              video.className = "w-full rounded-lg";
              attachmentCard.appendChild(video);
            } else if (attachment.type?.startsWith("audio/")) {
              const audio = document.createElement("audio");
              audio.src = result.objectUrl;
              audio.controls = true;
              audio.className = "w-full";
              attachmentCard.appendChild(audio);
            } else {
              const link = document.createElement("a");
              link.href = result.objectUrl;
              link.textContent = "Download attachment";
              link.className = "text-xs text-accent underline-offset-2 hover:underline";
              link.download = attachment.name || "attachment";
              attachmentCard.appendChild(link);
            }
          })
          .catch((error) => {
            status.textContent =
              error && typeof error.message === "string"
                ? error.message
                : "Attachment download failed.";
            status.classList.add("text-critical");
          });
      });

      container.appendChild(item);
    });

    container.classList.remove("hidden");
    container.removeAttribute("hidden");
  }

  resolveDirectMessageEventId(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    const eventId =
      typeof message.event?.id === "string" ? message.event.id.trim() : "";
    if (eventId) {
      return eventId;
    }

    const innerId =
      typeof message.message?.id === "string" ? message.message.id.trim() : "";
    return innerId;
  }

  resolveLatestDirectMessageForRecipient(recipientPubkey, actorPubkey = null) {
    const normalizedRecipient =
      typeof recipientPubkey === "string"
        ? this.normalizeHexPubkey(recipientPubkey)
        : "";
    if (!normalizedRecipient || !Array.isArray(this.directMessagesCache)) {
      return null;
    }

    const resolvedActor = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    let latest = null;
    let latestTimestamp = 0;

    for (const entry of this.directMessagesCache) {
      if (this.resolveDirectMessageRemote(entry, resolvedActor) !== normalizedRecipient) {
        continue;
      }
      const timestamp = Number(entry?.timestamp) || 0;
      if (!latest || timestamp > latestTimestamp) {
        latest = entry;
        latestTimestamp = timestamp;
      }
    }

    return latest;
  }

  resolveDirectMessageKind(message) {
    if (!message || typeof message !== "object") {
      return null;
    }

    if (Number.isFinite(message?.event?.kind)) {
      return Number(message.event.kind);
    }

    if (Number.isFinite(message?.message?.kind)) {
      return Number(message.message.kind);
    }

    return null;
  }

  async maybePublishReadReceipt(messages, { recipientPubkey } = {}) {
    if (!Array.isArray(messages) || !messages.length) {
      return;
    }

    const settings = this.getDmPrivacySettingsSnapshot();
    if (!settings.readReceiptsEnabled) {
      return;
    }

    if (
      !this.services.nostrClient ||
      typeof this.services.nostrClient.publishDmReadReceipt !== "function"
    ) {
      return;
    }

    const normalizedRecipient =
      typeof recipientPubkey === "string"
        ? this.normalizeHexPubkey(recipientPubkey)
        : "";
    if (!normalizedRecipient) {
      return;
    }

    let latestMessage = null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (
        entry &&
        typeof entry === "object" &&
        entry.direction === "incoming"
      ) {
        const eventId = this.resolveDirectMessageEventId(entry);
        if (eventId) {
          latestMessage = entry;
          break;
        }
      }
    }

    if (!latestMessage) {
      return;
    }

    const eventId = this.resolveDirectMessageEventId(latestMessage);
    if (!eventId) {
      return;
    }

    const cacheKey = `${normalizedRecipient}:${eventId}`;
    if (this.dmReadReceiptCache.has(cacheKey)) {
      return;
    }

    const relayHints = this.buildDmRecipientContext(normalizedRecipient)?.relayHints || [];
    const messageKind = this.resolveDirectMessageKind(latestMessage);

    try {
      const result = await this.services.nostrClient.publishDmReadReceipt({
        eventId,
        recipientPubkey: normalizedRecipient,
        messageKind,
        relays: relayHints,
      });

      if (result?.ok) {
        this.dmReadReceiptCache.add(cacheKey);
      }
    } catch (error) {
      devLogger.warn("[profileModal] Failed to publish read receipt:", error);
    }
  }

  async maybePublishTypingIndicator() {
    const settings = this.getDmPrivacySettingsSnapshot();
    if (!settings.typingIndicatorsEnabled) {
      return;
    }

    if (
      !this.services.nostrClient ||
      typeof this.services.nostrClient.publishDmTypingIndicator !== "function"
    ) {
      return;
    }

    const input = this.profileMessageInput;
    const messageText =
      input instanceof HTMLTextAreaElement ? input.value.trim() : "";
    if (!messageText) {
      return;
    }

    const recipient = this.resolveActiveDmRecipient();
    if (!recipient) {
      return;
    }

    const now = Date.now();
    if (now - this.dmTypingLastSentAt < TYPING_INDICATOR_COOLDOWN_MS) {
      return;
    }

    this.dmTypingLastSentAt = now;

    const relayHints = this.buildDmRecipientContext(recipient)?.relayHints || [];
    const latestMessage = this.resolveLatestDirectMessageForRecipient(
      recipient,
      this.resolveActiveDmActor(),
    );
    const latestEventId = this.resolveDirectMessageEventId(latestMessage);

    try {
      await this.services.nostrClient.publishDmTypingIndicator({
        recipientPubkey: recipient,
        conversationEventId: latestEventId || null,
        relays: relayHints,
        expiresInSeconds: TYPING_INDICATOR_TTL_SECONDS,
      });
    } catch (error) {
      devLogger.warn("[profileModal] Failed to publish typing indicator:", error);
    }
  }

  describeDirectMessageSendError(code) {
    switch (code) {
      case "sign-event-unavailable":
        return "Connect a Nostr signer to send messages.";
      case "encryption-unsupported":
        return "Your signer does not support NIP-04 encryption.";
      case "nip44-unsupported":
        return "Your signer does not support NIP-44 encryption required for NIP-17.";
      case "nip17-relays-missing":
        return "Recipient has not shared NIP-17 relay hints yet.";
      case "nip17-relays-unavailable":
        return "No DM relays are available to deliver this message.";
      case "nip17-keygen-failed":
        return "We couldn’t create secure wrapper keys for NIP-17 delivery.";
      case "extension-permission-denied":
        return "Please grant your Nostr extension permission to send messages.";
      case "extension-encryption-permission-denied":
        return "Please grant your Nostr extension encryption permission to send messages.";
      case "missing-actor-pubkey":
        return "We couldn’t determine your public key to send this message.";
      case "nostr-uninitialized":
        return "Direct messages are still connecting to relays. Please try again.";
      case "signature-failed":
        return "We couldn’t sign the message. Please reconnect your signer and try again.";
      case "encryption-failed":
        return "We couldn’t encrypt the message. Please try again.";
      case "publish-failed":
        return "Failed to deliver this message to any relay. Please try again.";
      case "invalid-target":
        return "Select a valid recipient before sending.";
      case "empty-message":
        return "Please enter a message or attach a file.";
      case "attachments-unsupported":
        return "Attachments require NIP-17 delivery. Enable the privacy toggle to send files.";
      default:
        return "Unable to send message. Please try again.";
    }
  }

  async handleSendProfileMessage() {
    const input = this.profileMessageInput;
    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    const message = typeof input.value === "string" ? input.value.trim() : "";
    const hasAttachments = this.dmAttachmentQueue.length > 0;
    if (!message && !hasAttachments) {
      this.showError("Please enter a message or attach a file.");
      return;
    }

    const targetHex = this.resolveActiveDmRecipient();
    const target =
      typeof targetHex === "string" && typeof this.safeEncodeNpub === "function"
        ? this.safeEncodeNpub(targetHex)
        : "";
    if (!target) {
      this.showError("Please select a message recipient.");
      return;
    }

    const recipientContext = this.buildDmRecipientContext(targetHex);
    const recipientRelayHints = Array.isArray(recipientContext?.relayHints)
      ? recipientContext.relayHints
      : [];
    const useNip17 =
      this.profileMessagesPrivacyToggle instanceof HTMLInputElement
        ? this.profileMessagesPrivacyToggle.checked
        : false;
    const senderRelayHints = this.getActiveDmRelayPreferences();

    if (hasAttachments && !useNip17) {
      this.showError(
        "Attachments require NIP-17 delivery. Enable the privacy toggle to send files.",
      );
      return;
    }

    if (useNip17 && !recipientRelayHints.length) {
      this.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
        { autoHideMs: 5000 },
      );
    }

    if (
      !this.services.nostrClient ||
      typeof this.services.nostrClient.sendDirectMessage !== "function"
    ) {
      this.showError("Direct message service unavailable.");
      return;
    }

    const sendButton = this.profileMessageSendButton;
    if (sendButton instanceof HTMLElement && "disabled" in sendButton) {
      sendButton.disabled = true;
      sendButton.setAttribute("aria-disabled", "true");
    }

    try {
      let attachmentPayloads = [];
      if (hasAttachments) {
        try {
          attachmentPayloads = await this.uploadAttachmentQueue(
            this.resolveActiveDmActor(),
          );
        } catch (error) {
          const messageText =
            error && typeof error.message === "string"
              ? error.message
              : "Attachment upload failed.";
          this.showError(messageText);
          return;
        }
      }

      const result = await this.services.nostrClient.sendDirectMessage(
        target,
        message,
        null,
        useNip17
          ? {
              useNip17: true,
              recipientRelayHints,
              senderRelayHints,
              attachments: attachmentPayloads,
            }
          : {},
      );

      if (result?.ok) {
        input.value = "";
        this.resetAttachmentQueue({ clearInput: true });
        this.showSuccess("Message sent.");
        if (result?.warning === "dm-relays-fallback") {
          this.showStatus(
            "Privacy warning: this message used default relays because no NIP-17 relay list was found.",
            { autoHideMs: 5000 },
          );
        }
        void this.populateProfileMessages({ force: true, reason: "send-message" });
        return;
      }

      const errorCode =
        typeof result?.error === "string" ? result.error : "unknown";
      userLogger.warn("[profileModal] Failed to send direct message:", errorCode);
      this.showError(this.describeDirectMessageSendError(errorCode));
    } catch (error) {
      userLogger.error("[profileModal] Unexpected DM send failure:", error);
      this.showError("Unable to send message. Please try again.");
    } finally {
      this.updateMessageComposerState();
    }
  }

  clearProfileMessages({ message } = {}) {
    this.directMessagesCache = [];
    this.directMessagesLastActor = this.resolveActiveDmActor();
    this.messagesInitialLoadPending = true;
    this.setDirectMessageRecipient(null, { reason: "clear" });

    if (this.profileMessagesList instanceof HTMLElement) {
      this.profileMessagesList.innerHTML = "";
      this.profileMessagesList.classList.add("hidden");
      this.profileMessagesList.setAttribute("hidden", "");
    }

    const actor = this.directMessagesLastActor;
    this.setMessagesLoadingState(actor ? "empty" : "unauthenticated", {
      message,
    });

    if (this.dmAppShellContainer instanceof HTMLElement) {
      void this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: actor,
      });
    }
  }

  extractDirectMessagePreview(entry) {
    if (!entry || typeof entry !== "object") {
      return "";
    }

    const candidates = [];
    if (typeof entry.plaintext === "string") {
      candidates.push(entry.plaintext);
    }
    if (typeof entry.preview === "string") {
      candidates.push(entry.preview);
    }
    if (
      entry.snapshot &&
      typeof entry.snapshot.preview === "string" &&
      entry.snapshot.preview.trim()
    ) {
      candidates.push(entry.snapshot.preview);
    }
    if (entry.message && typeof entry.message.content === "string") {
      candidates.push(entry.message.content);
    }

    const preview = candidates.find((value) => value && value.trim());
    return preview ? preview.trim() : "";
  }

  resolveProfileSummaryForPubkey(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    const fallbackNpub =
      normalized && typeof this.safeEncodeNpub === "function"
        ? this.safeEncodeNpub(normalized)
        : null;
    const formattedNpub =
      typeof this.formatShortNpub === "function"
        ? this.formatShortNpub(fallbackNpub)
        : fallbackNpub;

    let displayName = formattedNpub || fallbackNpub || "Unknown profile";
    let avatarSrc = FALLBACK_PROFILE_AVATAR;
    let lightningAddress = "";
    let status = "";

    if (normalized && typeof this.services.getProfileCacheEntry === "function") {
      const cacheEntry = this.services.getProfileCacheEntry(normalized);
      const profile = cacheEntry?.profile || null;
      if (profile) {
        if (typeof profile.display_name === "string" && profile.display_name.trim()) {
          displayName = profile.display_name.trim();
        } else if (typeof profile.name === "string" && profile.name.trim()) {
          displayName = profile.name.trim();
        }

        if (typeof profile.picture === "string" && profile.picture.trim()) {
          avatarSrc = profile.picture.trim();
        }

        if (typeof profile.lud16 === "string" && profile.lud16.trim()) {
          lightningAddress = profile.lud16.trim();
        } else if (typeof profile.lud06 === "string" && profile.lud06.trim()) {
          lightningAddress = profile.lud06.trim();
        }

        if (typeof profile.status === "string" && profile.status.trim()) {
          status = profile.status.trim();
        }
      }
    }

    return {
      displayName,
      displayNpub: formattedNpub || fallbackNpub || "npub unavailable",
      avatarSrc,
      lightningAddress,
      status,
    };
  }

  formatMessageTimestamp(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { display: "", iso: "" };
    }

    try {
      const date = new Date(numeric * 1000);
      return {
        display: date.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        iso: date.toISOString(),
      };
    } catch (error) {
      return { display: "", iso: "" };
    }
  }

  buildDmConversationId(actorPubkey, remotePubkey) {
    const normalizedActor = this.normalizeHexPubkey(actorPubkey);
    const normalizedRemote = this.normalizeHexPubkey(remotePubkey);

    if (!normalizedActor || !normalizedRemote) {
      return "";
    }

    return `dm:${[normalizedActor, normalizedRemote].sort().join(":")}`;
  }

  formatConversationTimestamp(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }

    try {
      return formatTimeAgo(numeric);
    } catch (error) {
      return "";
    }
  }

  formatMessageClockTime(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }

    try {
      const date = new Date(numeric * 1000);
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (error) {
      return "";
    }
  }

  formatMessageDayLabel(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }

    try {
      const date = new Date(numeric * 1000);
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const startOfMessageDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      const diffDays = Math.round(
        (startOfToday - startOfMessageDay) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 0) {
        return "Today";
      }
      if (diffDays === 1) {
        return "Yesterday";
      }

      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      return "";
    }
  }

  resolveDirectMessageScheme(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    const scheme =
      typeof message.scheme === "string"
        ? message.scheme
        : typeof message.encryption_scheme === "string"
        ? message.encryption_scheme
        : typeof message?.decryptor?.scheme === "string"
        ? message.decryptor.scheme
        : "";

    return typeof scheme === "string" ? scheme.trim().toLowerCase() : "";
  }

  resolveDirectMessageStatus(message) {
    if (!message || typeof message !== "object") {
      return "sent";
    }

    const status =
      typeof message.status === "string"
        ? message.status
        : typeof message.deliveryStatus === "string"
        ? message.deliveryStatus
        : typeof message.state === "string"
        ? message.state
        : "";

    return status ? status.trim() : "sent";
  }

  resolveDirectMessageBody(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    if (typeof message.plaintext === "string" && message.plaintext.trim()) {
      return message.plaintext.trim();
    }

    const preview = this.extractDirectMessagePreview(message);
    if (preview) {
      return preview;
    }

    const attachments = extractAttachmentsFromMessage(message);
    if (attachments.length) {
      return describeAttachment(attachments[0]);
    }

    return "";
  }

  resolveDirectMessagePreviewForConversation(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    const preview = this.extractDirectMessagePreview(message);
    if (preview) {
      return preview;
    }

    const attachments = extractAttachmentsFromMessage(message);
    if (attachments.length) {
      return describeAttachment(attachments[0]);
    }

    return "";
  }

  resolveRemoteForConversationId(conversationId, actorPubkey) {
    const actor = this.normalizeHexPubkey(actorPubkey || this.resolveActiveDmActor());
    const normalizedConversationId =
      typeof conversationId === "string" ? conversationId.trim() : "";

    if (!actor || !normalizedConversationId) {
      return null;
    }

    for (const entry of Array.isArray(this.directMessagesCache) ? this.directMessagesCache : []) {
      const remote = this.resolveDirectMessageRemote(entry, actor);
      if (!remote) {
        continue;
      }
      const resolvedId = this.buildDmConversationId(actor, remote);
      if (resolvedId && resolvedId === normalizedConversationId) {
        return remote;
      }
    }

    return null;
  }

  resolveConversationPrivacyMode(latestMessage) {
    const scheme = this.resolveDirectMessageScheme(latestMessage);
    if (scheme.includes("nip17") || scheme.includes("nip44")) {
      return "nip17";
    }
    return "nip04";
  }

  getDirectMessagesForConversation(conversationId, actorPubkey = null) {
    const actor = this.normalizeHexPubkey(actorPubkey || this.resolveActiveDmActor());
    if (!actor || !conversationId) {
      return [];
    }

    const remote = this.resolveRemoteForConversationId(conversationId, actor);
    if (!remote) {
      return [];
    }

    return (Array.isArray(this.directMessagesCache) ? this.directMessagesCache : [])
      .filter(
        (entry) =>
          entry &&
          entry.ok === true &&
          this.resolveDirectMessageRemote(entry, actor) === remote,
      )
      .sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
  }

  getLatestDirectMessageTimestampForConversation(conversationId, actorPubkey = null) {
    const messages = this.getDirectMessagesForConversation(
      conversationId,
      actorPubkey,
    );
    if (!messages.length) {
      return 0;
    }

    const last = messages[messages.length - 1];
    return Number(last?.timestamp) || 0;
  }

  buildDmMessageTimeline(messages, { actorPubkey, remotePubkey } = {}) {
    const actor = this.normalizeHexPubkey(actorPubkey);
    const remote = this.normalizeHexPubkey(remotePubkey);
    if (!actor || !remote) {
      return [];
    }

    const threadMessages = Array.isArray(messages)
      ? messages.filter((entry) => this.resolveDirectMessageRemote(entry, actor) === remote)
      : [];

    threadMessages.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));

    const timeline = [];
    let lastDayLabel = "";

    threadMessages.forEach((message) => {
      const dayLabel = this.formatMessageDayLabel(message?.timestamp);
      if (dayLabel && dayLabel !== lastDayLabel) {
        timeline.push({ type: "day", label: dayLabel });
        lastDayLabel = dayLabel;
      }

      timeline.push({
        id: this.resolveDirectMessageEventId(message) || "",
        direction: message?.direction || "incoming",
        body: this.resolveDirectMessageBody(message) || "Encrypted message",
        timestamp: this.formatMessageClockTime(message?.timestamp),
        status: this.resolveDirectMessageStatus(message),
      });
    });

    return timeline;
  }

  async buildDmConversationData(messages, { actorPubkey } = {}) {
    const actor = this.normalizeHexPubkey(
      actorPubkey || this.resolveActiveDmActor(),
    );
    if (!actor) {
      return {
        actor: "",
        conversations: [],
        activeConversationId: "",
        activeThread: null,
        activeRemotePubkey: null,
        timeline: [],
      };
    }

    const threads = this.groupDirectMessages(messages, actor);
    const remoteKeys = new Set();
    threads.forEach((thread) => {
      if (thread.remoteHex) {
        remoteKeys.add(thread.remoteHex);
      }
    });

    if (
      remoteKeys.size &&
      this.services.batchFetchProfiles &&
      typeof this.services.batchFetchProfiles === "function"
    ) {
      try {
        await this.services.batchFetchProfiles(remoteKeys);
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM profile metadata:",
          error,
        );
      }
    }

    const conversations = threads.map((thread) => {
      const conversationId = this.buildDmConversationId(actor, thread.remoteHex);
      const summary = this.resolveProfileSummaryForPubkey(thread.remoteHex);
      const preview = this.resolveDirectMessagePreviewForConversation(thread.latestMessage);
      const unreadCount =
        this.nostrService &&
        typeof this.nostrService.getDirectMessageUnseenCount === "function" &&
        conversationId
          ? this.nostrService.getDirectMessageUnseenCount(conversationId)
          : 0;
      const recipientContext = this.buildDmRecipientContext(thread.remoteHex);

      return {
        id: conversationId,
        name: summary.displayName,
        preview: preview || "Encrypted message",
        timestamp: this.formatConversationTimestamp(thread.latestTimestamp),
        unreadCount,
        avatarSrc: summary.avatarSrc,
        status: summary.status,
        pubkey: thread.remoteHex,
        lightningAddress: summary.lightningAddress,
        relayHints: Array.isArray(recipientContext?.relayHints)
          ? recipientContext.relayHints
          : [],
      };
    });

    const conversationMap = new Map();
    threads.forEach((thread) => {
      const conversationId = this.buildDmConversationId(actor, thread.remoteHex);
      if (conversationId) {
        conversationMap.set(conversationId, thread);
      }
    });

    const storedRecipient = this.resolveActiveDmRecipient();
    const storedConversationId =
      storedRecipient && actor
        ? this.buildDmConversationId(actor, storedRecipient)
        : "";
    const preferredConversationId =
      this.activeDmConversationId || storedConversationId;
    const fallbackConversationId = conversations[0]?.id || "";
    const activeConversationId =
      preferredConversationId && conversationMap.has(preferredConversationId)
        ? preferredConversationId
        : fallbackConversationId;
    const activeThread = activeConversationId
      ? conversationMap.get(activeConversationId)
      : null;
    const activeRemotePubkey =
      activeThread?.remoteHex ||
      (activeConversationId
        ? this.resolveRemoteForConversationId(activeConversationId, actor)
        : storedRecipient) ||
      null;

    if (activeConversationId && this.activeDmConversationId !== activeConversationId) {
      this.activeDmConversationId = activeConversationId;
    }

    return {
      actor,
      conversations,
      activeConversationId,
      activeThread,
      activeRemotePubkey,
      timeline:
        activeRemotePubkey && actor
          ? this.buildDmMessageTimeline(messages, {
              actorPubkey: actor,
              remotePubkey: activeRemotePubkey,
            })
          : [],
    };
  }

  groupDirectMessages(messages, actorPubkey) {
    const normalizedActor = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    const threadMap = new Map();
    for (const entry of Array.isArray(messages) ? messages : []) {
      if (!entry || entry.ok !== true) {
        continue;
      }

      const remoteHex = this.resolveDirectMessageRemote(entry, normalizedActor);
      if (!remoteHex) {
        continue;
      }

      const thread = threadMap.get(remoteHex) || {
        remoteHex,
        messages: [],
        latestTimestamp: 0,
        latestMessage: null,
      };

      thread.messages.push(entry);

      const ts = Number(entry.timestamp) || 0;
      if (!thread.latestMessage || ts > thread.latestTimestamp) {
        thread.latestTimestamp = ts;
        thread.latestMessage = entry;
      }

      threadMap.set(remoteHex, thread);
    }

    const threads = Array.from(threadMap.values());
    threads.sort((a, b) => (b.latestTimestamp || 0) - (a.latestTimestamp || 0));
    return threads;
  }

  resolveDirectMessageRemote(entry, actorPubkey = null) {
    if (!entry || entry.ok !== true) {
      return null;
    }

    const normalizedActor = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    if (typeof entry.remotePubkey === "string") {
      const directRemote = this.normalizeHexPubkey(entry.remotePubkey);
      if (directRemote && directRemote !== normalizedActor) {
        return directRemote;
      }
    }

    if (entry.snapshot && typeof entry.snapshot.remotePubkey === "string") {
      const snapshotRemote = this.normalizeHexPubkey(entry.snapshot.remotePubkey);
      if (snapshotRemote && snapshotRemote !== normalizedActor) {
        return snapshotRemote;
      }
    }

    const direction =
      typeof entry.direction === "string" ? entry.direction.toLowerCase() : "";

    const senderHex =
      entry.sender && typeof entry.sender.pubkey === "string"
        ? this.normalizeHexPubkey(entry.sender.pubkey)
        : null;

    if (direction === "incoming" && senderHex && senderHex !== normalizedActor) {
      return senderHex;
    }

    if (Array.isArray(entry.recipients)) {
      for (const recipient of entry.recipients) {
        const candidate =
          recipient && typeof recipient.pubkey === "string"
            ? this.normalizeHexPubkey(recipient.pubkey)
            : null;
        if (candidate && candidate !== normalizedActor) {
          return candidate;
        }
      }
    }

    if (direction === "outgoing" && senderHex && senderHex !== normalizedActor) {
      return senderHex;
    }

    if (entry.message && typeof entry.message.pubkey === "string") {
      const messagePubkey = this.normalizeHexPubkey(entry.message.pubkey);
      if (messagePubkey && messagePubkey !== normalizedActor) {
        return messagePubkey;
      }
    }

    if (entry.event && typeof entry.event.pubkey === "string") {
      const eventPubkey = this.normalizeHexPubkey(entry.event.pubkey);
      if (eventPubkey && eventPubkey !== normalizedActor) {
        return eventPubkey;
      }
    }

    if (senderHex && senderHex !== normalizedActor) {
      return senderHex;
    }

    return null;
  }

  createDirectMessageThreadItem(thread) {
    if (!thread || !thread.remoteHex) {
      return null;
    }

    const item = document.createElement("li");
    item.className = "card flex flex-col gap-3 p-4";
    item.setAttribute("data-remote-pubkey", thread.remoteHex);
    item.dataset.state = "inactive";

    const header = document.createElement("div");
    header.className = "flex items-start justify-between gap-3";

    const summary = this.resolveProfileSummaryForPubkey(thread.remoteHex);
    const summaryNode = this.createCompactProfileSummary({
      displayName: summary.displayName,
      displayNpub: summary.displayNpub,
      avatarSrc: summary.avatarSrc,
      size: "sm",
    });
    header.appendChild(summaryNode);

    const timestampMeta = this.formatMessageTimestamp(thread.latestTimestamp);
    if (timestampMeta.display) {
      const timeEl = document.createElement("time");
      timeEl.className =
        "text-3xs font-semibold uppercase tracking-extra-wide text-muted";
      if (timestampMeta.iso) {
        timeEl.setAttribute("datetime", timestampMeta.iso);
      }
      timeEl.textContent = timestampMeta.display;
      header.appendChild(timeEl);
    }

    item.appendChild(header);

    const previewText = this.extractDirectMessagePreview(thread.latestMessage);
    const previewEl = document.createElement("p");
    previewEl.className = "text-sm text-text whitespace-pre-line";
    previewEl.textContent = previewText || "Encrypted message";
    item.appendChild(previewEl);

    const meta = document.createElement("div");
    meta.className = "flex flex-wrap items-center gap-2";

    const direction =
      typeof thread.latestMessage?.direction === "string"
        ? thread.latestMessage.direction.toLowerCase()
        : "";
    if (direction) {
      const directionPill = document.createElement("span");
      directionPill.className = "pill";
      directionPill.dataset.variant = direction === "incoming" ? "info" : "muted";
      directionPill.textContent =
        direction === "incoming"
          ? "Incoming message"
          : direction === "outgoing"
          ? "Sent message"
          : "Message";
      meta.appendChild(directionPill);
    }

    const countPill = document.createElement("span");
    countPill.className = "pill";
    countPill.dataset.variant = "muted";
    const messageCount = Array.isArray(thread.messages)
      ? thread.messages.length
      : 0;
    countPill.textContent =
      messageCount === 1 ? "1 message" : `${messageCount} messages`;
    meta.appendChild(countPill);

    const scheme =
      typeof thread.latestMessage?.scheme === "string"
        ? thread.latestMessage.scheme.toUpperCase()
        : "";
    if (scheme) {
      const schemePill = document.createElement("span");
      schemePill.className = "pill";
      schemePill.dataset.variant = "muted";
      schemePill.textContent = scheme;
      meta.appendChild(schemePill);
    }

    item.appendChild(meta);

    item.addEventListener("click", () => {
      this.setDirectMessageRecipient(thread.remoteHex, {
        reason: "thread-select",
      });
      this.focusMessageComposer();
    });

    return item;
  }

  async renderProfileMessages(messages, { actorPubkey = null } = {}) {
    if (this.dmAppShellContainer instanceof HTMLElement) {
      await this.renderDmAppShell(messages, { actorPubkey });
    }

    if (!(this.profileMessagesList instanceof HTMLElement)) {
      if (!(this.dmAppShellContainer instanceof HTMLElement)) {
        this.pendingMessagesRender = {
          messages: Array.isArray(messages) ? messages : [],
          actorPubkey,
        };
      }
      return;
    }

    this.pendingMessagesRender = null;

    const normalizedActor = actorPubkey
      ? this.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    const threads = this.groupDirectMessages(messages, normalizedActor);
    const remoteKeys = new Set();
    for (const thread of threads) {
      if (thread.remoteHex) {
        remoteKeys.add(thread.remoteHex);
      }
    }

    if (
      remoteKeys.size &&
      this.services.batchFetchProfiles &&
      typeof this.services.batchFetchProfiles === "function"
    ) {
      try {
        await this.services.batchFetchProfiles(remoteKeys);
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM profile metadata:",
          error,
        );
      }
    }

    this.profileMessagesList.innerHTML = "";

    if (!threads.length) {
      this.profileMessagesList.classList.add("hidden");
      this.profileMessagesList.setAttribute("hidden", "");
      void this.renderDirectMessageConversation();
      return;
    }

    for (const thread of threads) {
      const item = this.createDirectMessageThreadItem(thread);
      if (item) {
        this.profileMessagesList.appendChild(item);
      }
    }

    const activeRecipient = this.resolveActiveDmRecipient();
    const hasActiveRecipient =
      activeRecipient &&
      threads.some((thread) => thread.remoteHex === activeRecipient);

    if (threads.length && !hasActiveRecipient) {
      this.setDirectMessageRecipient(threads[0].remoteHex, {
        reason: "thread-default",
      });
    } else if (hasActiveRecipient) {
      this.updateMessageThreadSelection(activeRecipient);
    }

    this.profileMessagesList.classList.remove("hidden");
    this.profileMessagesList.removeAttribute("hidden");
    void this.renderDirectMessageConversation();
  }

  async renderDmAppShell(messages, { actorPubkey = null } = {}) {
    const container =
      this.dmAppShellContainer instanceof HTMLElement
        ? this.dmAppShellContainer
        : null;
    if (!container) {
      return;
    }

    const snapshot = Array.isArray(messages) ? messages : this.directMessagesCache;
    const {
      actor,
      conversations,
      activeConversationId,
      activeThread,
      timeline,
    } = await this.buildDmConversationData(snapshot, { actorPubkey });

    const currentRecipient = this.resolveActiveDmRecipient();
    if (!currentRecipient && activeThread?.remoteHex) {
      this.setDirectMessageRecipient(activeThread.remoteHex, {
        reason: "thread-default",
      });
    }

    const loadingState = this.messagesLoadingState || "idle";
    const conversationState =
      loadingState === "loading"
        ? "loading"
        : loadingState === "error"
        ? "error"
        : loadingState === "empty" || loadingState === "unauthenticated"
        ? "empty"
        : "idle";

    const hasActiveConversation = Boolean(activeConversationId);
    const threadState =
      conversationState === "loading"
        ? "loading"
        : !hasActiveConversation
        ? "empty"
        : timeline.length
        ? "idle"
        : "empty";

    const privacyMode = this.resolveConversationPrivacyMode(
      activeThread?.latestMessage,
    );

    const currentUserSummary = this.resolveProfileSummaryForPubkey(
      this.resolveActiveDmActor(),
    );
    const currentUserAvatarUrl = currentUserSummary?.avatarSrc || "";

    container.innerHTML = "";

    try {
      const dmPrivacySettings = this.getDmPrivacySettingsSnapshot();

      this.dmAppShell = new AppShell({
        document,
        currentUserAvatarUrl,
        conversations,
        activeConversationId,
        conversationState,
        messages: timeline,
        threadState,
        privacyMode,
        dmPrivacySettings,
        composerState: this.dmComposerState || "idle",
        notifications: [],
        zapConfig: {
            signer: this.services.nostrClient,
        },
        mobileView: this.dmMobileView || "list",
        onSelectConversation: (conversation) => {
          void this.handleDmConversationSelect(conversation);
        },
        onRefreshConversations: () => {
          this.populateProfileMessages({ force: true });
        },
        onBack: () => {
          this.dmMobileView = "list";
          void this.renderDmAppShell(this.directMessagesCache, {
            actorPubkey: this.resolveActiveDmActor(),
          });
        },
        onSendMessage: (messageText, payload) => {
          void this.handleDmAppShellSendMessage(messageText, payload);
        },
        onMarkConversationRead: (conversation) => {
          void this.handleDmConversationMarkRead(conversation);
        },
        onMarkAllRead: () => {
          void this.handleDmMarkAllConversationsRead();
        },
        onToggleReadReceipts: (enabled) => {
          this.handleReadReceiptsToggle(enabled);
        },
        onToggleTypingIndicators: (enabled) => {
          this.handleTypingIndicatorsToggle(enabled);
        },
        onOpenSettings: () => {
          this.cacheDmRelayElements();
          this.bindDmRelayControls();
          this.populateDmRelayPreferences();
        },
      });
    } catch (error) {
      this.dmAppShell = null;
      devLogger.warn("[profileModal] Failed to render DM app shell:", error);
      return;
    }

    const root =
      this.dmAppShell &&
      typeof this.dmAppShell.getRoot === "function"
        ? this.dmAppShell.getRoot()
        : null;
    if (!(root instanceof HTMLElement)) {
      devLogger.warn("[profileModal] DM app shell root missing.");
      return;
    }

    root.classList.add("bg-transparent");
    container.appendChild(root);

    if (actor && activeConversationId) {
      const renderedUntil =
        this.getLatestDirectMessageTimestampForConversation(
          activeConversationId,
          actor,
        ) || Date.now() / 1000;
      void this.nostrService?.acknowledgeRenderedDirectMessages?.(
        activeConversationId,
        renderedUntil,
      );
    }
  }

  setFocusedDmConversation(conversationId) {
    if (
      !this.nostrService ||
      typeof this.nostrService.setFocusedDirectMessageConversation !== "function"
    ) {
      return;
    }

    if (
      this.focusedDmConversationId &&
      this.focusedDmConversationId !== conversationId
    ) {
      this.nostrService.setFocusedDirectMessageConversation(
        this.focusedDmConversationId,
        false,
      );
    }

    if (conversationId) {
      this.nostrService.setFocusedDirectMessageConversation(conversationId, true);
      this.focusedDmConversationId = conversationId;
    } else {
      this.focusedDmConversationId = "";
    }
  }

  async handleDmConversationSelect(conversation) {
    const conversationId =
      conversation && typeof conversation.id === "string"
        ? conversation.id.trim()
        : "";
    if (!conversationId) {
      return;
    }

    this.dmMobileView = "thread";

    const actor = this.resolveActiveDmActor();
    const remote = this.resolveRemoteForConversationId(conversationId, actor);

    this.activeDmConversationId = conversationId;
    if (remote) {
      this.setDirectMessageRecipient(remote, { reason: "thread-select" });
    }

    this.setFocusedDmConversation(conversationId);

    await this.renderDmAppShell(this.directMessagesCache, {
      actorPubkey: actor,
    });
  }

  async handleDmConversationMarkRead(conversation) {
    const conversationId =
      conversation && typeof conversation.id === "string"
        ? conversation.id.trim()
        : this.activeDmConversationId;
    if (!conversationId) {
      return;
    }

    const actor = this.resolveActiveDmActor();
    if (
      !actor ||
      !this.nostrService ||
      typeof this.nostrService.acknowledgeRenderedDirectMessages !== "function"
    ) {
      return;
    }

    const renderedUntil = this.getLatestDirectMessageTimestampForConversation(
      conversationId,
      actor,
    );

    try {
      await this.nostrService.acknowledgeRenderedDirectMessages(
        conversationId,
        renderedUntil,
      );
    } catch (error) {
      devLogger.warn("[profileModal] Failed to mark conversation read:", error);
    }

    const recipient = this.resolveRemoteForConversationId(conversationId, actor);
    const messages = this.getDirectMessagesForConversation(conversationId, actor);
    if (recipient && messages.length) {
      void this.maybePublishReadReceipt(messages, {
        recipientPubkey: recipient,
      });
    }

    await this.renderDmAppShell(this.directMessagesCache, {
      actorPubkey: actor,
    });
  }

  async handleDmMarkAllConversationsRead() {
    if (
      !this.nostrService ||
      typeof this.nostrService.acknowledgeRenderedDirectMessages !== "function"
    ) {
      return;
    }

    const actor = this.resolveActiveDmActor();
    if (!actor) {
      return;
    }

    const summaries =
      typeof this.nostrService.listDirectMessageConversationSummaries === "function"
        ? await this.nostrService.listDirectMessageConversationSummaries()
        : [];
    const list = Array.isArray(summaries) ? summaries : [];

    for (const summary of list) {
      const conversationId =
        typeof summary?.conversation_id === "string"
          ? summary.conversation_id.trim()
          : typeof summary?.conversationId === "string"
            ? summary.conversationId.trim()
            : "";
      if (!conversationId) {
        continue;
      }

      const renderedUntil =
        Number(summary?.last_message_at) ||
        Number(summary?.downloaded_until) ||
        Number(summary?.opened_until) ||
        this.getLatestDirectMessageTimestampForConversation(conversationId, actor);

      try {
        await this.nostrService.acknowledgeRenderedDirectMessages(
          conversationId,
          renderedUntil,
        );
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to mark conversation read:",
          error,
        );
      }

      const recipient = this.resolveRemoteForConversationId(conversationId, actor);
      const messages = this.getDirectMessagesForConversation(conversationId, actor);
      if (recipient && messages.length) {
        void this.maybePublishReadReceipt(messages, {
          recipientPubkey: recipient,
        });
      }
    }

    await this.renderDmAppShell(this.directMessagesCache, {
      actorPubkey: actor,
    });
  }

  async handleDmAppShellSendMessage(messageText, payload = {}) {
    const normalizedPayload =
      payload && typeof payload === "object" ? payload : {};
    const message =
      typeof messageText === "string" ? messageText.trim() : "";
    const attachments = Array.isArray(normalizedPayload.attachments)
      ? normalizedPayload.attachments
      : [];

    if (!message && !attachments.length) {
      this.showError("Please enter a message or attach a file.");
      this.dmComposerState = "error";
      await this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: this.resolveActiveDmActor(),
      });
      return;
    }

    const actor = this.resolveActiveDmActor();
    const activeConversationId =
      this.activeDmConversationId ||
      (actor && this.resolveActiveDmRecipient()
        ? this.buildDmConversationId(actor, this.resolveActiveDmRecipient())
        : "");
    const targetHex =
      this.resolveRemoteForConversationId(activeConversationId, actor) ||
      this.resolveActiveDmRecipient();

    const target =
      typeof targetHex === "string" && typeof this.safeEncodeNpub === "function"
        ? this.safeEncodeNpub(targetHex)
        : "";
    if (!target) {
      this.showError("Please select a message recipient.");
      this.dmComposerState = "error";
      await this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: actor,
      });
      return;
    }

    if (
      !this.services.nostrClient ||
      typeof this.services.nostrClient.sendDirectMessage !== "function"
    ) {
      this.showError("Direct message service unavailable.");
      this.dmComposerState = "error";
      await this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: actor,
      });
      return;
    }

    const privacyMode =
      typeof normalizedPayload.privacyMode === "string"
        ? normalizedPayload.privacyMode.trim().toLowerCase()
        : "nip04";
    const useNip17 = privacyMode === "nip17" || privacyMode === "private";

    if (attachments.length && !useNip17) {
      this.showError(
        "Attachments require NIP-17 delivery. Enable the privacy toggle to send files.",
      );
      this.dmComposerState = "error";
      await this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: actor,
      });
      return;
    }

    const recipientContext = this.buildDmRecipientContext(targetHex);
    const recipientRelayHints = Array.isArray(recipientContext?.relayHints)
      ? recipientContext.relayHints
      : [];
    const senderRelayHints = this.getActiveDmRelayPreferences();

    if (useNip17 && !recipientRelayHints.length) {
      this.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
        { autoHideMs: 5000 },
      );
    }

    this.dmComposerState = "sending";
    await this.renderDmAppShell(this.directMessagesCache, {
      actorPubkey: actor,
    });

    try {
      const result = await this.services.nostrClient.sendDirectMessage(
        target,
        message,
        null,
        useNip17
          ? {
              useNip17: true,
              recipientRelayHints,
              senderRelayHints,
              attachments,
            }
          : {},
      );

      if (result?.ok) {
        this.showSuccess("Message sent.");
        if (result?.warning === "dm-relays-fallback") {
          this.showStatus(
            "Privacy warning: this message used default relays because no NIP-17 relay list was found.",
            { autoHideMs: 5000 },
          );
        }
        if (
          this.nostrService &&
          typeof this.nostrService.loadDirectMessages === "function"
        ) {
          await this.nostrService.loadDirectMessages({
            actorPubkey: actor,
            initialLoad: false,
          });
        }
        this.dmComposerState = "idle";
      } else {
        const errorCode =
          typeof result?.error === "string" ? result.error : "unknown";
        userLogger.warn("[profileModal] Failed to send direct message:", errorCode);
        this.showError(this.describeDirectMessageSendError(errorCode));
        this.dmComposerState = "error";
      }
    } catch (error) {
      userLogger.error("[profileModal] Unexpected DM send failure:", error);
      this.showError("Unable to send message. Please try again.");
      this.dmComposerState = "error";
    } finally {
      await this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: actor,
      });
    }
  }

  async populateProfileMessages(options = {}) {
    const settings =
      options && typeof options === "object" ? options : { force: false };
    const { force = false } = settings;

    const actor = this.resolveActiveDmActor();
    if (!actor) {
      this.clearProfileMessages();
      return;
    }

    if (
      !this.nostrService ||
      typeof this.nostrService.loadDirectMessages !== "function"
    ) {
      this.setMessagesLoadingState("error", {
        message: "Direct message service unavailable.",
      });
      return;
    }

    if (
      !force &&
      !this.messagesInitialLoadPending &&
      Array.isArray(this.directMessagesCache) &&
      this.directMessagesCache.length
    ) {
      await this.renderProfileMessages(this.directMessagesCache, {
        actorPubkey: actor,
      });
      this.setMessagesLoadingState("ready");
      return;
    }

    const requestId = Symbol("messagesLoad");
    this.activeMessagesRequest = requestId;
    this.messagesInitialLoadPending = false;
    this.setMessagesLoadingState("loading");

    if (
      this.directMessagesLastActor &&
      this.directMessagesLastActor !== actor
    ) {
      this.resetDirectMessageSubscription();
      if (
        typeof this.nostrService.clearDirectMessages === "function"
      ) {
        try {
          this.nostrService.clearDirectMessages({ emit: true });
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to clear direct messages cache before reload:",
            error,
          );
        }
      }
    }

    try {
      let snapshot = await this.nostrService.loadDirectMessages({
        actorPubkey: actor,
        initialLoad: true,
      });
      if (!Array.isArray(snapshot)) {
        snapshot = [];
      }

      if (this.activeMessagesRequest !== requestId) {
        return;
      }

      this.directMessagesCache = snapshot;
      this.directMessagesLastActor = actor;

      await this.renderProfileMessages(snapshot, { actorPubkey: actor });

      if (!snapshot.length) {
        this.setMessagesLoadingState("empty");
      } else {
        this.setMessagesLoadingState("ready", {
          message:
            snapshot.length === 1
              ? "1 direct message thread loaded."
              : `${snapshot.length} direct message threads loaded.`,
        });
      }
    } catch (error) {
      if (this.activeMessagesRequest === requestId) {
        userLogger.error(
          "[profileModal] Failed to load direct messages:",
          error,
        );
        this.setMessagesLoadingState("error", {
          message: "Failed to load direct messages. Try again later.",
        });
        this.messagesInitialLoadPending = true;
      }
      return;
    } finally {
      if (this.activeMessagesRequest === requestId) {
        this.activeMessagesRequest = null;
        this.updateMessagesReloadState();
      }
    }

    void this.ensureDirectMessageSubscription(actor);
  }

  mountDmAppShell() {
    const container =
      this.dmAppShellContainer instanceof HTMLElement
        ? this.dmAppShellContainer
        : null;
    if (!container) {
      return;
    }
    void this.renderDmAppShell(this.directMessagesCache, {
      actorPubkey: this.directMessagesLastActor,
    });
  }

  unmountDmAppShell() {
    const container =
      this.dmAppShellContainer instanceof HTMLElement
        ? this.dmAppShellContainer
        : null;
    if (container) {
      container.innerHTML = "";
    }

    this.dmAppShell = null;
  }

  resumeProfileMessages() {
    this.messagesViewActive = true;
    this.mountDmAppShell();
    this.updateMessagesReloadState();
  }

  pauseProfileMessages() {
    this.messagesViewActive = false;
    this.unmountDmAppShell();
    this.updateMessagesReloadState();
  }

  clearDirectMessagesUpdateQueue() {
    if (this.directMessagesRenderTimeout) {
      const clearTimeoutFn =
        typeof window !== "undefined" && typeof window.clearTimeout === "function"
          ? window.clearTimeout.bind(window)
          : clearTimeout;
      clearTimeoutFn(this.directMessagesRenderTimeout);
      this.directMessagesRenderTimeout = null;
    }
    this.pendingDirectMessagesUpdate = null;
  }

  scheduleDirectMessagesRender(payload = null) {
    if (!payload) {
      return;
    }

    this.pendingDirectMessagesUpdate = payload;

    if (this.directMessagesRenderTimeout) {
      return;
    }

    const scheduleTimeout =
      typeof window !== "undefined" && typeof window.setTimeout === "function"
        ? window.setTimeout.bind(window)
        : setTimeout;

    this.directMessagesRenderTimeout = scheduleTimeout(() => {
      this.directMessagesRenderTimeout = null;
      this.flushDirectMessagesRender();
    }, DIRECT_MESSAGES_BATCH_DELAY_MS);
  }

  flushDirectMessagesRender() {
    const pending = this.pendingDirectMessagesUpdate;
    this.pendingDirectMessagesUpdate = null;
    if (!pending) {
      return;
    }

    const { messages, actorPubkey, reason } = pending;
    void this.renderProfileMessages(messages, { actorPubkey })
      .then(() => {
        if (!messages.length) {
          this.setMessagesLoadingState("empty");
        } else {
          this.setMessagesLoadingState("ready");
        }

        if (reason === "subscription") {
          this.setMessagesAnnouncement("New direct message received.");
        } else if (reason === "load") {
          this.setMessagesAnnouncement(
            messages.length === 1
              ? "1 direct message thread synced."
              : `${messages.length} direct message threads synced.`,
          );
        }
      })
      .catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to render direct messages after update:",
          error,
        );
      });
  }

  handleDirectMessagesUpdated(detail = {}) {
    if (
      this.activeMessagesRequest &&
      detail?.reason !== "load-incremental"
    ) {
      return;
    }

    const messages = Array.isArray(detail?.messages)
      ? detail.messages
      : [];
    this.directMessagesCache = messages;

    const actor = this.resolveActiveDmActor();
    if (!actor) {
      this.setMessagesLoadingState("unauthenticated");
      this.clearDirectMessagesUpdateQueue();
      return;
    }

    this.directMessagesLastActor = actor;
    this.scheduleDirectMessagesRender({
      messages,
      actorPubkey: actor,
      reason: typeof detail?.reason === "string" ? detail.reason : "",
    });
  }

  handleDirectMessagesCleared() {
    if (this.activeMessagesRequest) {
      return;
    }

    this.clearDirectMessagesUpdateQueue();
    this.directMessagesCache = [];
    this.setDirectMessageRecipient(null, { reason: "clear" });
    if (this.profileMessagesList instanceof HTMLElement) {
      this.profileMessagesList.innerHTML = "";
      this.profileMessagesList.classList.add("hidden");
      this.profileMessagesList.setAttribute("hidden", "");
    }

    const actor = this.resolveActiveDmActor();
    if (!actor) {
      this.setMessagesLoadingState("unauthenticated");
    } else {
      this.setMessagesLoadingState("empty");
    }

    if (this.dmAppShellContainer instanceof HTMLElement) {
      void this.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: actor,
      });
    }
  }

  handleDirectMessagesError(detail = {}) {
    const error = detail?.error || detail?.failure || detail;
    const reason = detail?.context?.reason || "";
    const errorCode = error?.code || "";
    const errorMessage =
      typeof error === "string"
        ? error
        : typeof error?.message === "string"
          ? error.message
          : "";
    const requiresNip44Decryptor =
      typeof errorMessage === "string" &&
      errorMessage.includes("Gift wrap events require a NIP-44 decryptor");

    const isBenign =
      reason === "no-decryptors" ||
      errorCode === "decryption-failed" ||
      (typeof error === "string" && error.includes("no-decryptors"));

    if (isBenign) {
      devLogger.info("[profileModal] Direct message sync info:", error);
    } else {
      userLogger.warn(
        "[profileModal] Direct message sync issue detected:",
        error,
      );
    }

    if (this.activeMessagesRequest) {
      return;
    }

    if (requiresNip44Decryptor) {
      const nip44Message =
        "NIP-17 direct messages require a NIP-44-capable signer or extension. Unlock or update your extension to continue.";
      if (!this.directMessagesCache.length) {
        this.setMessagesLoadingState("error", {
          message: nip44Message,
        });
        return;
      }

      this.setMessagesAnnouncement(nip44Message);
      this.updateMessagesReloadState();
      return;
    }

    if (!this.directMessagesCache.length) {
      this.setMessagesLoadingState("error", {
        message: "Unable to sync direct messages right now.",
      });
      return;
    }

    this.setMessagesAnnouncement("Unable to sync direct messages right now.");
    this.updateMessagesReloadState();
  }

  handleDirectMessagesRelayWarning(detail = {}) {
    if (detail?.warning !== "dm-relays-fallback") {
      return;
    }

    this.showStatus(
      "Privacy warning: direct messages are using your default relays because no NIP-17 relay list is available.",
      { autoHideMs: 5000 },
    );
  }

  registerEventListeners() {
    if (this.closeButton instanceof HTMLElement) {
      this.closeButton.addEventListener("click", () => {
        this.hide();
      });
    }

    if (this.mobileLogoutButton instanceof HTMLElement) {
      this.mobileLogoutButton.addEventListener("click", async () => {
        try {
          await this.callbacks.onLogout(this);
        } catch (error) {
          this.showError("Failed to logout. Please try again.");
        }
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
        void this.handleAddAccountRequest();
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

    if (this.profileRelayRefreshBtn instanceof HTMLElement) {
      this.profileRelayRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const service = this.services.relayManager;
        if (!service || typeof service.loadRelayList !== "function") {
          return;
        }
        void service
          .loadRelayList(activeHex)
          .then(() => {
            this.populateProfileRelays();
          })
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh relay list:", error);
          });
      });
    }

    if (this.relayHealthRefreshButton instanceof HTMLElement) {
      this.relayHealthRefreshButton.addEventListener("click", () => {
        void this.refreshRelayHealthPanel({ forceRefresh: true, reason: "manual" });
      });
    }

    if (this.relayHealthTelemetryToggle instanceof HTMLInputElement) {
      this.relayHealthTelemetryToggle.addEventListener("change", () => {
        this.handleRelayHealthTelemetryToggle();
      });
    }

    if (this.addBlockedButton instanceof HTMLElement) {
      this.addBlockedButton.addEventListener("click", () => {
        void this.handleAddBlockedCreator();
      });
    }

    if (this.profileBlockedRefreshBtn instanceof HTMLElement) {
      this.profileBlockedRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const blocksService = this.services.userBlocks;
        if (!blocksService || typeof blocksService.loadBlocks !== "function") {
          return;
        }
        void blocksService
          .loadBlocks(activeHex)
          .then(() => {
            this.populateBlockedList();
          })
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh blocked list:", error);
          });
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

    if (this.profileSubscriptionsRefreshBtn instanceof HTMLElement) {
      this.profileSubscriptionsRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const service = this.subscriptionsService;
        if (!service || typeof service.loadSubscriptions !== "function") {
          return;
        }
        void service
          .loadSubscriptions(activeHex, { allowPermissionPrompt: true })
          .then(() => {
            void this.populateSubscriptionsList();
          })
          .catch((error) => {
            devLogger.warn(
              "[profileModal] Failed to refresh subscriptions list:",
              error,
            );
          });
      });
    }

    if (this.profileFriendsRefreshBtn instanceof HTMLElement) {
      this.profileFriendsRefreshBtn.addEventListener("click", () => {
        const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
        if (!activeHex) {
          return;
        }
        const moderationService = this.moderationService;
        const refreshPromise =
          moderationService &&
          typeof moderationService.ensureViewerContactsLoaded === "function"
            ? moderationService.ensureViewerContactsLoaded(activeHex)
            : this.subscriptionsService &&
              typeof this.subscriptionsService.ensureLoaded === "function"
            ? this.subscriptionsService.ensureLoaded(activeHex)
            : null;

        void Promise.resolve(refreshPromise)
          .then(() => {
            this.populateFriendsList();
          })
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh friends list:", error);
          });
      });
    }

    if (this.addHashtagInterestButton instanceof HTMLElement) {
      this.addHashtagInterestButton.addEventListener("click", () => {
        void this.handleAddHashtagPreference("interest");
      });
    }

    const handleHashtagRefresh = () => {
      const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
      if (!activeHex) {
        return;
      }
      const service = this.hashtagPreferencesService;
      if (!service || typeof service.load !== "function") {
        return;
      }
      void service
        .load(activeHex, { allowPermissionPrompt: true })
        .catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to refresh hashtag preferences:",
          error,
        );
      });
    };

    if (this.profileHashtagInterestRefreshBtn instanceof HTMLElement) {
      this.profileHashtagInterestRefreshBtn.addEventListener(
        "click",
        handleHashtagRefresh,
      );
    }

    if (this.profileHashtagDisinterestRefreshBtn instanceof HTMLElement) {
      this.profileHashtagDisinterestRefreshBtn.addEventListener(
        "click",
        handleHashtagRefresh,
      );
    }

    if (this.hashtagInterestInput instanceof HTMLElement) {
      this.hashtagInterestInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddHashtagPreference("interest");
        }
      });
    }

    if (this.addHashtagDisinterestButton instanceof HTMLElement) {
      this.addHashtagDisinterestButton.addEventListener("click", () => {
        void this.handleAddHashtagPreference("disinterest");
      });
    }

    if (this.hashtagDisinterestInput instanceof HTMLElement) {
      this.hashtagDisinterestInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void this.handleAddHashtagPreference("disinterest");
        }
      });
    }

    if (this.profileMessagesReloadButton instanceof HTMLElement) {
      this.profileMessagesReloadButton.addEventListener("click", () => {
        void this.populateProfileMessages({ force: true, reason: "manual" });
      });
    }

    if (this.profileMessagesSendDmButton instanceof HTMLElement) {
      this.profileMessagesSendDmButton.addEventListener("click", () => {
        void this.handleSendDmRequest();
      });
    }

    if (this.profileMessagesOpenRelaysButton instanceof HTMLElement) {
      this.profileMessagesOpenRelaysButton.addEventListener("click", () => {
        void this.handleOpenDmRelaysRequest();
      });
    }

    if (this.profileMessagesPrivacyToggle instanceof HTMLElement) {
      this.profileMessagesPrivacyToggle.addEventListener("change", (event) => {
        const toggle = event.currentTarget;
        if (toggle instanceof HTMLInputElement) {
          this.handlePrivacyToggle(toggle.checked);
        }
      });
    }

    // Legacy toggles removed - handled by DMPrivacySettings in AppShell

    if (this.profileLinkPreviewAutoToggle instanceof HTMLElement) {
      this.profileLinkPreviewAutoToggle.addEventListener("change", (event) => {
        const toggle = event.currentTarget;
        if (toggle instanceof HTMLInputElement) {
          this.handleLinkPreviewToggle(toggle.checked);
        }
      });
    }

    this.bindDmRelayControls();

    if (this.profileMessageSendButton instanceof HTMLElement) {
      this.profileMessageSendButton.addEventListener("click", () => {
        void this.handleSendProfileMessage();
      });
    }

    if (this.profileMessageAttachmentButton instanceof HTMLElement) {
      this.profileMessageAttachmentButton.addEventListener("click", () => {
        if (this.profileMessageAttachmentInput instanceof HTMLInputElement) {
          this.profileMessageAttachmentInput.click();
        }
      });
    }

    if (this.profileMessageAttachmentInput instanceof HTMLElement) {
      this.profileMessageAttachmentInput.addEventListener("change", () => {
        this.handleAttachmentSelection();
      });
    }

    if (this.profileMessageAttachmentClearCache instanceof HTMLElement) {
      this.profileMessageAttachmentClearCache.addEventListener("click", () => {
        clearAttachmentCache();
        const stats = getAttachmentCacheStats();
        this.showStatus(
          `Attachment cache cleared (${stats.size}/${stats.maxSize}).`,
        );
      });
    }

    if (this.profileMessageInput instanceof HTMLElement) {
      this.profileMessageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void this.handleSendProfileMessage();
        }
      });
      this.profileMessageInput.addEventListener("input", () => {
        void this.maybePublishTypingIndicator();
      });
    }

    if (this.walletUriInput instanceof HTMLElement) {
      this.walletUriInput.addEventListener("focus", () => {
        this.revealSecretInputValue(this.walletUriInput);
      });
      this.walletUriInput.addEventListener("blur", () => {
        this.handleSecretInputBlur(this.walletUriInput);
        this.applyWalletControlState();
      });
      this.walletUriInput.addEventListener("input", () => {
        this.handleSecretInputChange(this.walletUriInput);
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

    if (!this.boundModerationOverridesUpdate && typeof document !== "undefined") {
      this.boundModerationOverridesUpdate = () => {
        this.refreshModerationOverridesUi();
      };
      document.addEventListener(
        "video:moderation-override",
        this.boundModerationOverridesUpdate,
      );
      document.addEventListener(
        "video:moderation-hide",
        this.boundModerationOverridesUpdate,
      );
      document.addEventListener(
        "video:moderation-block",
        this.boundModerationOverridesUpdate,
      );
    }

    if (this.addModeratorButton instanceof HTMLElement) {
      this.addModeratorButton.addEventListener("click", () => {
        void this.handleAddModerator();
      });
    }

    if (this.adminModeratorsRefreshBtn instanceof HTMLElement) {
      this.adminModeratorsRefreshBtn.addEventListener("click", () => {
        const service = this.services.accessControl;
        if (!service || typeof service.refresh !== "function") {
          return;
        }
        void service
          .refresh()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh moderators:", error);
          });
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

    if (this.adminWhitelistRefreshBtn instanceof HTMLElement) {
      this.adminWhitelistRefreshBtn.addEventListener("click", () => {
        const service = this.services.accessControl;
        if (!service || typeof service.refresh !== "function") {
          return;
        }
        void service
          .refresh()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh whitelist:", error);
          });
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

    if (this.adminBlacklistRefreshBtn instanceof HTMLElement) {
      this.adminBlacklistRefreshBtn.addEventListener("click", () => {
        const service = this.services.accessControl;
        if (!service || typeof service.refresh !== "function") {
          return;
        }
        void service
          .refresh()
          .then(() => this.refreshAdminPaneState())
          .catch((error) => {
            devLogger.warn("[profileModal] Failed to refresh blacklist:", error);
          });
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

    if (this.storageUnlockBtn instanceof HTMLElement) {
      this.storageUnlockBtn.addEventListener("click", () => {
        void this.handleUnlockStorage();
      });
    }

    if (this.storageSaveBtn instanceof HTMLElement) {
      this.storageSaveBtn.addEventListener("click", () => {
        void this.handleSaveStorage();
      });
    }

    if (this.storageTestBtn instanceof HTMLElement) {
      this.storageTestBtn.addEventListener("click", () => {
        void this.handleTestStorage();
      });
    }

    if (this.storageClearBtn instanceof HTMLElement) {
      this.storageClearBtn.addEventListener("click", () => {
        void this.handleClearStorage();
      });
    }

    if (this.storageProviderInput instanceof HTMLElement) {
      this.storageProviderInput.addEventListener("change", () => {
        this.updateStorageFormVisibility();
      });
    }

    if (this.storagePrefixInput instanceof HTMLElement) {
      this.storagePrefixInput.addEventListener("input", () => {
        this.handlePublicUrlInput();
      });
    }

    if (this.profileEditBtn instanceof HTMLElement) {
      this.profileEditBtn.addEventListener("click", () => {
        this.handleEditProfile();
      });
    }

    if (this.profileEditBackBtn instanceof HTMLElement) {
      this.profileEditBackBtn.addEventListener("click", () => {
        this.selectPane("account");
      });
    }

    if (this.editCancelBtn instanceof HTMLElement) {
      this.editCancelBtn.addEventListener("click", () => {
        this.selectPane("account");
      });
    }

    if (this.editSaveBtn instanceof HTMLElement) {
      this.editSaveBtn.addEventListener("click", () => {
        void this.handleSaveProfile();
      });
    }

    if (this.editPictureUploadBtn instanceof HTMLElement) {
      this.editPictureUploadBtn.addEventListener("click", () => {
        if (this.editPictureFile) this.editPictureFile.click();
      });
    }

    if (this.editPictureFile instanceof HTMLElement) {
      this.editPictureFile.addEventListener("change", () => {
        void this.handleUpload("picture");
      });
    }

    if (this.editBannerUploadBtn instanceof HTMLElement) {
      this.editBannerUploadBtn.addEventListener("click", () => {
        if (this.editBannerFile) this.editBannerFile.click();
      });
    }

    if (this.editBannerFile instanceof HTMLElement) {
      this.editBannerFile.addEventListener("change", () => {
        void this.handleUpload("banner");
      });
    }

    if (this.editPictureConfigureLink instanceof HTMLElement) {
      this.editPictureConfigureLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.selectPane("storage");
      });
    }

    if (this.editBannerConfigureLink instanceof HTMLElement) {
      this.editBannerConfigureLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.selectPane("storage");
      });
    }

    this.updateMessagesReloadState();
  }

  resolveAddAccountLoginError(error, fallbackMessage = "") {
    const describe = this.describeLoginErrorService;
    const fallback =
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : "Couldn't add that profile. Please try again.";

    if (typeof describe === "function") {
      try {
        const message = describe(error, fallback);
        if (typeof message === "string" && message.trim()) {
          return message.trim();
        }
      } catch (describeError) {
        devLogger.warn(
          "[ProfileModalController] describeLoginError service threw:",
          describeError,
        );
      }
    }

    return fallback;
  }

  describeHashtagPreferencesError(error, options = {}) {
    const describe = this.describeHashtagPreferencesErrorService;
    const { fallbackMessage, operation } =
      options && typeof options === "object" ? options : {};
    const normalizedOperation =
      typeof operation === "string" && operation.trim()
        ? operation.trim().toLowerCase()
        : "update";

    const fallback =
      typeof fallbackMessage === "string" && fallbackMessage.trim()
        ? fallbackMessage.trim()
        : normalizedOperation === "load"
        ? "Failed to load hashtag preferences. Please try again."
        : normalizedOperation === "reset"
        ? "Failed to reset hashtag preferences."
        : "Failed to update hashtag preferences. Please try again.";

    if (typeof describe === "function") {
      try {
        const message = describe(error, fallback);
        if (typeof message === "string" && message.trim()) {
          return message.trim();
        }
      } catch (describeError) {
        devLogger.warn(
          "[ProfileModalController] describeHashtagPreferencesError service threw:",
          describeError,
        );
      }
    }

    return fallback;
  }

  setAddAccountLoading(isLoading) {
    if (!(this.addAccountButton instanceof HTMLElement)) {
      return;
    }

    const button = this.addAccountButton;
    const titleEl = button.querySelector("[data-profile-add-title]");
    const hintEl = button.querySelector("[data-profile-add-hint]");

    if (isLoading) {
      this.addAccountButtonState = {
        originalDisabled: button.disabled,
        originalAriaLabel: button.getAttribute("aria-label"),
        titleElement: titleEl instanceof HTMLElement ? titleEl : null,
        hintElement: hintEl instanceof HTMLElement ? hintEl : null,
        originalTitle:
          titleEl instanceof HTMLElement ? titleEl.textContent || "" : "",
        originalHint:
          hintEl instanceof HTMLElement ? hintEl.textContent || "" : "",
      };

      button.disabled = true;
      button.dataset.state = "loading";
      button.setAttribute("aria-busy", "true");
      button.setAttribute("aria-disabled", "true");

      if (this.addAccountButtonState.titleElement) {
        this.addAccountButtonState.titleElement.textContent = "Connecting...";
      }

      if (this.addAccountButtonState.hintElement) {
        this.addAccountButtonState.hintElement.textContent =
          "Complete the login prompt from your provider.";
      }

      button.setAttribute(
        "aria-label",
        "Connecting to your Nostr account",
      );

      return;
    }

    const state = this.addAccountButtonState;

    if (state) {
      button.disabled = !!state.originalDisabled;
      if (state.originalDisabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }

      if (state.titleElement) {
        state.titleElement.textContent = state.originalTitle || "";
      }

      if (state.hintElement) {
        state.hintElement.textContent = state.originalHint || "";
      }

      if (state.originalAriaLabel === null) {
        button.removeAttribute("aria-label");
      } else if (typeof state.originalAriaLabel === "string") {
        button.setAttribute("aria-label", state.originalAriaLabel);
      }
    } else {
      if (button.disabled) {
        button.setAttribute("aria-disabled", "true");
      } else {
        button.removeAttribute("aria-disabled");
      }
    }

    button.setAttribute("aria-busy", "false");
    delete button.dataset.state;

    this.addAccountButtonState = null;
  }

  isAddAccountCancellationError(error) {
    if (!error || typeof error !== "object") {
      return false;
    }

    const code =
      typeof error.code === "string" && error.code.trim()
        ? error.code.trim()
        : "";

    if (!code) {
      return false;
    }

    return ADD_PROFILE_CANCELLATION_CODES.has(code);
  }

  async handleAddAccountRequest() {
    if (!(this.addAccountButton instanceof HTMLElement)) {
      return;
    }

    if (this.addAccountButton.dataset.state === "loading") {
      return;
    }

    const requestLogin = this.requestAddProfileLoginService;
    if (typeof requestLogin !== "function") {
      devLogger.warn(
        "[ProfileModalController] requestAddProfileLogin service unavailable.",
      );
      this.showError("Login is unavailable right now. Please try again later.");
      return;
    }

    this.setAddAccountLoading(true);

    try {
      this.bringLoginModalToFront();
    } catch (error) {
      devLogger.warn(
        "[ProfileModalController] Failed to elevate login modal before add profile authentication:",
        error,
      );
    }

    let suspendedFocusTrap = false;
    try {
      this.suspendFocusTrap();
      suspendedFocusTrap = true;
    } catch (error) {
      devLogger.warn(
        "[ProfileModalController] Failed to suspend profile modal focus trap before login:",
        error,
      );
    }

    try {
      const loginResult = await requestLogin({
        controller: this,
        triggerElement: this.addAccountButton,
      });

      if (loginResult === undefined) {
        return;
      }

      await this.invokeAddAccountCallback(loginResult);
    } catch (error) {
      if (this.isAddAccountCancellationError(error)) {
        try {
          this.log(
            "[ProfileModalController] Add profile flow cancelled by user.",
            error,
          );
        } catch (logError) {
          devLogger.warn(
            "[ProfileModalController] Failed to log cancellation event:",
            logError,
          );
        }
        return;
      }

      devLogger.error(
        "[ProfileModalController] Failed to complete add profile authentication:",
        error,
      );

      const message = this.resolveAddAccountLoginError(
        error,
        "Couldn't add that profile. Please try again.",
      );

      if (message) {
        this.showError(message);
      }
    } finally {
      if (suspendedFocusTrap) {
        try {
          this.resumeFocusTrap();
        } catch (error) {
          devLogger.warn(
            "[ProfileModalController] Failed to resume profile modal focus trap after login:",
            error,
          );
        }
      }

      this.setAddAccountLoading(false);
    }
  }

  async invokeAddAccountCallback(loginResult) {
    if (typeof this.callbacks.onAddAccount !== "function") {
      return;
    }

    try {
      await this.callbacks.onAddAccount({
        controller: this,
        loginResult,
      });
    } catch (error) {
      devLogger.warn(
        "[ProfileModalController] onAddAccount callback threw:",
        error,
      );
      throw error;
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
          topLine.className =
            "flex flex-wrap items-center justify-between gap-3";

          const providerId = this.getEntryProviderId(entry);
          const providerInfo = this.resolveEntryProviderMetadata(entry);
          const providerLabel =
            (providerInfo && providerInfo.label) || DEFAULT_SAVED_PROFILE_LABEL;
          const badgeVariant = resolveProviderBadgeClass(
            providerInfo && providerInfo.badgeVariant,
          );

          const resolvedProviderId =
            providerId || (providerInfo && providerInfo.id) || "";

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

          const actionGroup = document.createElement("div");
          actionGroup.className = "flex flex-wrap items-center gap-2";

          const action = document.createElement("span");
          action.className = "text-xs font-medium text-muted";
          action.setAttribute("aria-hidden", "true");
          action.textContent = isSelected ? "Selected" : "Switch";

          actionGroup.appendChild(action);

          const logoutButton = this.createSavedProfileLogoutButton({
            entry,
            providerId: resolvedProviderId || null,
            cardButton: button,
            displayName: cardDisplayName,
          });
          if (logoutButton) {
            actionGroup.appendChild(logoutButton);
          }

          topLine.append(label, actionGroup);

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

          if (resolvedProviderId) {
            button.dataset.providerId = resolvedProviderId;
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

  async handleSavedProfileLogout({
    entry,
    providerId,
    triggerButton,
    cardButton,
    displayName,
  } = {}) {
    if (!entry || typeof entry !== "object") {
      this.showError("Failed to logout this account. Please try again.");
      return { loggedOut: false, reason: "invalid-entry" };
    }

    const targetPubkey =
      typeof entry.pubkey === "string" && entry.pubkey.trim()
        ? entry.pubkey.trim()
        : "";
    if (!targetPubkey) {
      this.showError("Failed to logout this account. Please try again.");
      return { loggedOut: false, reason: "invalid-pubkey" };
    }

    if (
      !this.callbacks.onRequestLogoutProfile ||
      this.callbacks.onRequestLogoutProfile === noop
    ) {
      this.showError("Account logout is not available right now.");
      return { loggedOut: false, reason: "logout-unavailable" };
    }

    const revertUiState = () => {
      if (triggerButton instanceof HTMLElement) {
        triggerButton.disabled = false;
        triggerButton.removeAttribute("aria-busy");
        delete triggerButton.dataset.state;
      }

      if (cardButton instanceof HTMLElement) {
        cardButton.disabled = false;
        cardButton.removeAttribute("aria-busy");
        delete cardButton.dataset.loading;
      }
    };

    if (triggerButton instanceof HTMLElement) {
      triggerButton.dataset.state = "loading";
      triggerButton.disabled = true;
      triggerButton.setAttribute("aria-busy", "true");
    }

    if (cardButton instanceof HTMLElement) {
      cardButton.dataset.loading = "true";
      cardButton.disabled = true;
      cardButton.setAttribute("aria-busy", "true");
    }

    let result;
    try {
      result = await this.callbacks.onRequestLogoutProfile({
        controller: this,
        pubkey: targetPubkey,
        entry,
        providerId: this.normalizeProviderId(providerId) || null,
      });
    } catch (error) {
      this.showError("Failed to logout this account. Please try again.");
      result = { loggedOut: false, error, reason: "logout-error" };
    } finally {
      revertUiState();
    }

    if (!result || typeof result !== "object") {
      this.showError("Failed to logout this account. Please try again.");
      return { loggedOut: false, reason: "unknown" };
    }

    if (result.loggedOut || result.removed) {
      const successName =
        typeof displayName === "string" && displayName.trim()
          ? displayName.trim()
          : null;
      const message = successName
        ? `${successName} logged out.`
        : "Account logged out.";

      this.profileSwitcherSelectionPubkey = null;
      this.showSuccess(message);
      this.renderSavedProfiles();

      return { ...result, loggedOut: true };
    }

    if (result.reason === "not-found") {
      this.profileSwitcherSelectionPubkey = null;
      this.showStatus("This account is no longer connected.");
      this.renderSavedProfiles();
      return result;
    }

    if (result.reason === "active-profile") {
      return result;
    }

    if (result.error) {
      this.showError("Failed to logout this account. Please try again.");
      return result;
    }

    this.showError("Failed to logout this account. Please try again.");
    return result;
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

  createSavedProfileLogoutButton({
    entry,
    cardButton,
    providerId,
    displayName,
  } = {}) {
    if (this.callbacks.onRequestLogoutProfile === noop) {
      return null;
    }

    if (!entry || typeof entry !== "object" || !entry.pubkey) {
      return null;
    }

    const safeName =
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : "this account";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-ghost focus-ring text-2xs";
    button.dataset.variant = "critical";
    button.dataset.role = "logout";
    button.textContent = "Logout";
    button.setAttribute("aria-label", `Log out ${safeName}`);
    button.title = `Log out ${safeName}`;

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.state === "loading") {
        return;
      }

      void this.handleSavedProfileLogout({
        entry,
        providerId,
        triggerButton: button,
        cardButton,
        displayName: safeName,
      });
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
      const breakpointLg = getBreakpointLg();
      const query = window.matchMedia(`(min-width: ${breakpointLg})`);
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

    if (previous === "messages" && target !== "messages") {
      this.pauseProfileMessages();
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

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());

    if (target === "history") {
      void this.populateProfileWatchHistory();
    } else if (target === "relays") {
      this.populateProfileRelays();
      void this.refreshRelayHealthPanel({
        forceRefresh: true,
        reason: "pane-select",
      });
    } else if (target === "messages") {
      this.resumeProfileMessages();
      void this.populateProfileMessages({ reason: "pane-select" });
      void this.refreshDmRelayPreferences();
    } else if (target === "wallet") {
      this.refreshWalletPaneState();
    } else if (target === "storage") {
      this.populateStoragePane();
    } else if (target === "hashtags") {
      this.populateHashtagPreferences();
      if (activeHex && this.hashtagPreferencesService) {
        this.hashtagPreferencesService
          .load(activeHex, { allowPermissionPrompt: true })
          .catch(noop);
      }
      this.refreshHashtagBackgroundStatus();
    } else if (target === "subscriptions") {
      if (activeHex && this.subscriptionsService) {
        this.subscriptionsService
          .loadSubscriptions(activeHex, { allowPermissionPrompt: true })
          .catch(noop);
      }
      void this.populateSubscriptionsList();
      this.refreshSubscriptionsBackgroundStatus();
    } else if (target === "blocked") {
      if (activeHex && this.services.userBlocks) {
        this.services.userBlocks.loadBlocks(activeHex).catch(noop);
      }
      this.populateBlockedList();
    } else if (target === "safety") {
      this.refreshModerationSettingsUi();
      this.syncLinkPreviewSettingsUi();
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

  updateRelayHealthStatus(message = "") {
    if (!this.relayHealthStatus) {
      return;
    }

    const text = typeof message === "string" ? message.trim() : "";
    this.relayHealthStatus.textContent = text;
  }

  renderRelayHealthSnapshot(snapshot = []) {
    if (!this.relayHealthList) {
      return;
    }

    this.relayHealthList.innerHTML = "";

    if (!snapshot.length) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-surface-strong p-4 text-center text-sm text-muted";
      emptyState.textContent = "No relays configured.";
      this.relayHealthList.appendChild(emptyState);
      return;
    }

    snapshot.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "card flex flex-col gap-2 p-4";

      const header = document.createElement("div");
      header.className = "flex items-center justify-between gap-3";

      const urlEl = document.createElement("p");
      urlEl.className = "text-sm font-medium text-primary break-all";
      urlEl.textContent = entry.url;

      const connection = document.createElement("span");
      const connected = Boolean(entry.connected);
      connection.className = `text-xs font-semibold ${
        connected ? "text-status-success" : "text-status-danger"
      }`;
      connection.textContent = connected ? "Connected" : "Unavailable";

      header.appendChild(urlEl);
      header.appendChild(connection);

      const details = document.createElement("div");
      details.className = "grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-3";

      const latency = document.createElement("div");
      latency.className = "flex items-center justify-between gap-2";
      const latencyLabel = document.createElement("span");
      latencyLabel.textContent = "Latency";
      const latencyValue = document.createElement("span");
      latencyValue.className = "text-text";
      latencyValue.textContent = Number.isFinite(entry.lastLatencyMs)
        ? `${entry.lastLatencyMs} ms`
        : "—";
      latency.appendChild(latencyLabel);
      latency.appendChild(latencyValue);

      const errors = document.createElement("div");
      errors.className = "flex items-center justify-between gap-2";
      const errorsLabel = document.createElement("span");
      errorsLabel.textContent = "Errors";
      const errorsValue = document.createElement("span");
      errorsValue.className = "text-text";
      errorsValue.textContent = Number.isFinite(entry.errorCount)
        ? `${entry.errorCount}`
        : "0";
      errors.appendChild(errorsLabel);
      errors.appendChild(errorsValue);

      const checks = document.createElement("div");
      checks.className = "flex items-center justify-between gap-2";
      const checksLabel = document.createElement("span");
      checksLabel.textContent = "Checked";
      const checksValue = document.createElement("span");
      checksValue.className = "text-text";
      if (Number.isFinite(entry.lastCheckedAt) && entry.lastCheckedAt > 0) {
        checksValue.textContent = new Date(entry.lastCheckedAt).toLocaleTimeString();
      } else {
        checksValue.textContent = "—";
      }
      checks.appendChild(checksLabel);
      checks.appendChild(checksValue);

      details.appendChild(latency);
      details.appendChild(errors);
      details.appendChild(checks);

      item.appendChild(header);
      item.appendChild(details);

      this.relayHealthList.appendChild(item);
    });
  }

  handleRelayHealthTelemetryToggle() {
    const service = this.services?.relayHealthService;
    if (!service || !(this.relayHealthTelemetryToggle instanceof HTMLInputElement)) {
      return;
    }

    const enabled = service.setTelemetryOptIn(
      this.relayHealthTelemetryToggle.checked,
    );
    this.relayHealthTelemetryToggle.checked = enabled;
    this.updateRelayHealthStatus(
      enabled ? "Relay health telemetry enabled." : "Relay health telemetry disabled.",
    );
  }

  async refreshRelayHealthPanel({ forceRefresh = false, reason = "" } = {}) {
    const service = this.services?.relayHealthService;
    if (!service || !this.relayHealthList) {
      return [];
    }

    if (this.relayHealthTelemetryToggle instanceof HTMLInputElement) {
      this.relayHealthTelemetryToggle.checked = service.getTelemetryOptIn();
    }

    const snapshot = service.getSnapshot();
    this.renderRelayHealthSnapshot(snapshot);

    if (!forceRefresh) {
      return snapshot;
    }

    if (this.relayHealthRefreshPromise) {
      return this.relayHealthRefreshPromise;
    }

    const statusMessage = reason === "manual" ? "Refreshing relay health…" : "Checking relays…";
    this.updateRelayHealthStatus(statusMessage);

    const refreshPromise = service
      .refresh()
      .then((latest) => {
        this.renderRelayHealthSnapshot(latest);
        this.updateRelayHealthStatus("Relay health updated.");
        return latest;
      })
      .catch((error) => {
        this.updateRelayHealthStatus("Failed to refresh relay health.");
        this.showError("Failed to refresh relay health.");
        devLogger.warn("[profileModal] Relay health refresh failed:", error);
        return [];
      })
      .finally(() => {
        if (this.relayHealthRefreshPromise === refreshPromise) {
          this.relayHealthRefreshPromise = null;
        }
      });

    this.relayHealthRefreshPromise = refreshPromise;
    return refreshPromise;
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
      void this.refreshRelayHealthPanel({ forceRefresh: true, reason: "relay-update" });
      return operationContext;
    }

    this.populateProfileRelays();
    void this.refreshRelayHealthPanel({ forceRefresh: true, reason: "relay-update" });

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

  normalizeHashtagTag(value) {
    return normalizeHashtag(value);
  }

  formatHashtagTag(value) {
    return formatHashtag(value);
  }

  sanitizeHashtagList(list) {
    if (!Array.isArray(list)) {
      return [];
    }

    const seen = new Set();
    const normalized = [];

    list.forEach((entry) => {
      if (typeof entry !== "string") {
        return;
      }
      const tag = this.normalizeHashtagTag(entry);
      if (!tag || seen.has(tag)) {
        return;
      }
      seen.add(tag);
      normalized.push(tag);
    });

    normalized.sort((a, b) => a.localeCompare(b));
    return normalized;
  }

  getResolvedHashtagPreferences(preferences = null) {
    const candidate =
      preferences && typeof preferences === "object" ? preferences : null;

    let snapshot = null;
    if (candidate) {
      snapshot = candidate;
    } else if (typeof this.getHashtagPreferencesSnapshotService === "function") {
      try {
        const resolved = this.getHashtagPreferencesSnapshotService();
        if (resolved && typeof resolved === "object") {
          snapshot = resolved;
        }
      } catch (error) {
        devLogger.warn(
          "[ProfileModalController] Failed to read hashtag preferences snapshot:",
          error,
        );
      }
    }

    const service = this.hashtagPreferencesService || {};

    const interestsSource = Array.isArray(snapshot?.interests)
      ? snapshot.interests
      : typeof service.getInterests === "function"
      ? service.getInterests()
      : [];
    const disinterestsSource = Array.isArray(snapshot?.disinterests)
      ? snapshot.disinterests
      : typeof service.getDisinterests === "function"
      ? service.getDisinterests()
      : [];

    return {
      interests: this.sanitizeHashtagList(interestsSource),
      disinterests: this.sanitizeHashtagList(disinterestsSource),
    };
  }

  setHashtagStatus(message = "", tone = "muted") {
    if (!(this.hashtagStatusText instanceof HTMLElement)) {
      return;
    }

    const classList = this.hashtagStatusText.classList;
    classList.remove(
      "text-status-success",
      "text-status-warning",
      "text-status-danger",
      "text-status-info",
      "text-muted",
    );

    const normalized =
      typeof message === "string" && message.trim() ? message.trim() : "";

    if (!normalized) {
      this.hashtagStatusText.textContent = "";
      this.hashtagStatusText.classList.add("text-muted", "hidden");
      return;
    }

    this.hashtagStatusText.textContent = normalized;
    this.hashtagStatusText.classList.remove("hidden");

    switch (tone) {
      case "success":
        classList.add("text-status-success");
        break;
      case "warning":
      case "error":
        classList.add("text-status-warning");
        break;
      case "info":
        classList.add("text-status-info");
        break;
      default:
        classList.add("text-muted");
        break;
    }
  }

  setSubscriptionsStatus(message = "", tone = "muted") {
    if (!(this.subscriptionsStatusText instanceof HTMLElement)) {
      return;
    }

    const classList = this.subscriptionsStatusText.classList;
    classList.remove(
      "text-status-success",
      "text-status-warning",
      "text-status-danger",
      "text-status-info",
      "text-muted",
    );

    const normalized =
      typeof message === "string" && message.trim() ? message.trim() : "";

    if (!normalized) {
      this.subscriptionsStatusText.textContent = "";
      this.subscriptionsStatusText.classList.add("text-muted", "hidden");
      return;
    }

    this.subscriptionsStatusText.textContent = normalized;
    this.subscriptionsStatusText.classList.remove("hidden");

    switch (tone) {
      case "success":
        classList.add("text-status-success");
        break;
      case "warning":
      case "error":
        classList.add("text-status-warning");
        break;
      case "info":
        classList.add("text-status-info");
        break;
      default:
        classList.add("text-muted");
        break;
    }
  }

  refreshHashtagBackgroundStatus() {
    const isBackground = this.hashtagPreferencesService?.backgroundLoading === true;
    const statusText = this.hashtagStatusText?.textContent?.trim?.() || "";

    if (isBackground && !this.hashtagBackgroundLoading) {
      this.hashtagBackgroundLoading = true;
      if (!statusText) {
        this.setHashtagStatus("Loading in background…", "info");
      }
      return;
    }

    if (!isBackground && this.hashtagBackgroundLoading) {
      if (statusText === "Loading in background…") {
        this.setHashtagStatus("", "muted");
      }
      this.hashtagBackgroundLoading = false;
    }
  }

  refreshSubscriptionsBackgroundStatus() {
    const isBackground = this.subscriptionsService?.backgroundLoading === true;
    const statusText = this.subscriptionsStatusText?.textContent?.trim?.() || "";

    if (isBackground && !this.subscriptionsBackgroundLoading) {
      this.subscriptionsBackgroundLoading = true;
      if (!statusText) {
        this.setSubscriptionsStatus("Loading in background…", "info");
      }
      return;
    }

    if (!isBackground && this.subscriptionsBackgroundLoading) {
      if (statusText === "Loading in background…") {
        this.setSubscriptionsStatus("", "muted");
      }
      this.subscriptionsBackgroundLoading = false;
    }
  }

  clearHashtagInputs() {
    if (this.hashtagInterestInput instanceof HTMLInputElement) {
      this.hashtagInterestInput.value = "";
    }
    if (this.hashtagDisinterestInput instanceof HTMLInputElement) {
      this.hashtagDisinterestInput.value = "";
    }
  }

  populateHashtagPreferences(preferences = null) {
    const snapshot = this.getResolvedHashtagPreferences(preferences);

    this.renderHashtagList("interest", snapshot.interests);
    this.renderHashtagList("disinterest", snapshot.disinterests);

    if (!snapshot.interests.length && !snapshot.disinterests.length) {
      this.setHashtagStatus("", "muted");
    }
    this.refreshHashtagBackgroundStatus();
  }

  renderHashtagList(type, tags) {
    const list =
      type === "interest" ? this.hashtagInterestList : this.hashtagDisinterestList;
    const empty =
      type === "interest" ? this.hashtagInterestEmpty : this.hashtagDisinterestEmpty;

    if (!(list instanceof HTMLElement) || !(empty instanceof HTMLElement)) {
      return;
    }

    list.innerHTML = "";

    const normalized = this.sanitizeHashtagList(tags);
    if (!normalized.length) {
      empty.classList.remove("hidden");
      list.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    list.classList.remove("hidden");

    normalized.forEach((tag) => {
      const item = this.createHashtagListItem(type, tag);
      if (item) {
        list.appendChild(item);
      }
    });
  }

  createHashtagListItem(type, tag) {
    const normalized = this.normalizeHashtagTag(tag);
    if (!normalized) {
      return null;
    }

    const item = document.createElement("li");
    item.className = "profile-hashtag-item";
    item.dataset.hashtagType = type;
    item.dataset.tag = normalized;

    const label = document.createElement("span");
    label.textContent = this.formatHashtagTag(normalized);
    item.appendChild(label);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "profile-hashtag-remove focus-ring";
    removeButton.dataset.hashtagType = type;
    removeButton.dataset.tag = normalized;
    removeButton.setAttribute(
      "aria-label",
      type === "interest"
        ? `Remove ${this.formatHashtagTag(normalized)} from interests`
        : `Remove ${this.formatHashtagTag(normalized)} from disinterests`,
    );
    removeButton.innerHTML = "<span aria-hidden=\"true\">&times;</span>";
    removeButton.addEventListener("click", () => {
      void this.handleRemoveHashtagPreference(type, normalized);
    });

    item.appendChild(removeButton);

    return item;
  }

  async persistHashtagPreferences(options = {}) {
    const service = this.hashtagPreferencesService;
    const publish =
      service && typeof service.publish === "function" ? service.publish : null;

    if (!publish) {
      const message = this.describeHashtagPreferencesError(null, {
        fallbackMessage: "Hashtag preferences are unavailable right now.",
      });
      if (message) {
        this.showError(message);
        this.setHashtagStatus(message, "warning");
      }
      const error = new Error(
        message || "Hashtag preferences are unavailable right now.",
      );
      error.code = "service-unavailable";
      throw error;
    }

    if (this.hashtagPreferencesPublishInFlight) {
      return this.hashtagPreferencesPublishPromise;
    }

    const { successMessage, pubkey, progressMessage } =
      options && typeof options === "object" ? options : {};

    const resolvedPubkeyCandidate =
      typeof pubkey === "string" && pubkey.trim()
        ? pubkey
        : this.getActivePubkey();
    const normalizedPubkey = this.normalizeHexPubkey(resolvedPubkeyCandidate);

    const payload = normalizedPubkey ? { pubkey: normalizedPubkey } : {};

    const pendingMessage =
      typeof progressMessage === "string" && progressMessage.trim()
        ? progressMessage.trim()
        : "Saving hashtag preferences…";
    const finalMessage =
      typeof successMessage === "string" && successMessage.trim()
        ? successMessage.trim()
        : "Hashtag preferences saved.";

    this.hashtagPreferencesPublishInFlight = true;
    this.setHashtagStatus(pendingMessage, "info");

    const publishPromise = (async () => {
      try {
        const result = await publish.call(service, payload);
        this.setHashtagStatus(finalMessage, "success");
        return result;
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error || ""));
        if (!failure.code) {
          failure.code = "hashtag-preferences-publish-failed";
        }
        const message = this.describeHashtagPreferencesError(failure, {
          fallbackMessage:
            "Failed to update hashtag preferences. Please try again.",
        });
        if (message) {
          this.showError(message);
          this.setHashtagStatus(message, "warning");
        }
        throw failure;
      } finally {
        this.hashtagPreferencesPublishInFlight = false;
        this.hashtagPreferencesPublishPromise = null;
      }
    })();

    this.hashtagPreferencesPublishPromise = publishPromise;
    return publishPromise;
  }

  async handleAddHashtagPreference(type) {
    const isInterest = type === "interest";
    const input = isInterest
      ? this.hashtagInterestInput
      : this.hashtagDisinterestInput;

    const rawValue =
      input instanceof HTMLInputElement ? input.value || "" : "";
    const normalized = this.normalizeHashtagTag(rawValue);

    if (!(input instanceof HTMLInputElement)) {
      return { success: false, reason: "missing-input" };
    }

    if (!normalized) {
      const message = "Enter a hashtag to add.";
      this.showError(message);
      this.setHashtagStatus(message, "warning");
      return { success: false, reason: "empty" };
    }

    const service = this.hashtagPreferencesService;
    const addMethod = isInterest
      ? service?.addInterest
      : service?.addDisinterest;

    if (typeof addMethod !== "function") {
      const message = "Hashtag preferences are unavailable right now.";
      this.showError(message);
      this.setHashtagStatus(message, "warning");
      return { success: false, reason: "service-unavailable" };
    }

    const snapshot = this.getResolvedHashtagPreferences();
    const alreadyInTarget = isInterest
      ? snapshot.interests.includes(normalized)
      : snapshot.disinterests.includes(normalized);
    const inOpposite = isInterest
      ? snapshot.disinterests.includes(normalized)
      : snapshot.interests.includes(normalized);

    let result = false;
    try {
      result = addMethod.call(service, normalized);
    } catch (error) {
      const message = this.describeHashtagPreferencesError(error, {
        fallbackMessage: "Failed to update hashtag preferences. Please try again.",
      });
      if (message) {
        this.showError(message);
        this.setHashtagStatus(message, "warning");
      }
      return { success: false, reason: error?.code || "service-error", error };
    } finally {
      if (input) {
        input.value = "";
      }
    }

    if (result) {
      const actionMessage = inOpposite
        ? `${this.formatHashtagTag(normalized)} moved to ${
            isInterest ? "interests" : "disinterests"
          }.`
        : `${this.formatHashtagTag(normalized)} added to ${
            isInterest ? "interests" : "disinterests"
          }.`;
      this.populateHashtagPreferences();
      try {
        await this.persistHashtagPreferences({
          successMessage: actionMessage,
        });
        this.showSuccess(actionMessage);
        return { success: true, reason: inOpposite ? "moved" : "added" };
      } catch (error) {
        return {
          success: false,
          reason: error?.code || "publish-failed",
          error,
        };
      } finally {
        this.populateHashtagPreferences();
      }
    }

    if (alreadyInTarget) {
      const message = `${this.formatHashtagTag(normalized)} is already in your ${
        isInterest ? "interests" : "disinterests"
      }.`;
      this.showStatus(message);
      this.setHashtagStatus(message, "info");
      this.populateHashtagPreferences();
      return { success: false, reason: "duplicate" };
    }

    const fallbackMessage = this.describeHashtagPreferencesError(null, {
      fallbackMessage: `Failed to add ${this.formatHashtagTag(normalized)}.`,
    });
    if (fallbackMessage) {
      this.showError(fallbackMessage);
      this.setHashtagStatus(fallbackMessage, "warning");
    }
    this.populateHashtagPreferences();
    return { success: false, reason: "no-change" };
  }

  async handleRemoveHashtagPreference(type, candidate) {
    const normalized = this.normalizeHashtagTag(candidate);
    if (!normalized) {
      return { success: false, reason: "invalid" };
    }

    const service = this.hashtagPreferencesService;
    const removeMethod =
      type === "interest"
        ? service?.removeInterest
        : service?.removeDisinterest;

    if (typeof removeMethod !== "function") {
      const message = "Hashtag preferences are unavailable right now.";
      this.showError(message);
      this.setHashtagStatus(message, "warning");
      return { success: false, reason: "service-unavailable" };
    }

    let removed = false;
    try {
      removed = removeMethod.call(service, normalized);
    } catch (error) {
      const message = this.describeHashtagPreferencesError(error, {
        fallbackMessage: `Failed to remove ${this.formatHashtagTag(normalized)}.`,
      });
      if (message) {
        this.showError(message);
        this.setHashtagStatus(message, "warning");
      }
      this.populateHashtagPreferences();
      return { success: false, reason: error?.code || "service-error", error };
    }

    if (removed) {
      const message = `${this.formatHashtagTag(normalized)} removed from ${
        type === "interest" ? "interests" : "disinterests"
      }.`;
      this.populateHashtagPreferences();
      try {
        await this.persistHashtagPreferences({ successMessage: message });
        this.showSuccess(message);
      } catch (error) {
        return {
          success: false,
          reason: error?.code || "publish-failed",
          error,
        };
      } finally {
        this.populateHashtagPreferences();
      }
    } else {
      const message = `${this.formatHashtagTag(normalized)} is already removed.`;
      this.showStatus(message);
      this.setHashtagStatus(message, "info");
    }

    this.populateHashtagPreferences();
    return { success: removed, reason: removed ? "removed" : "already-removed" };
  }

  handleHashtagPreferencesChange(detail = {}) {
    const preferences =
      detail && typeof detail.preferences === "object"
        ? detail.preferences
        : detail;
    const action = typeof detail?.action === "string" ? detail.action : "";

    if (action === "background-loading") {
      this.hashtagBackgroundLoading = true;
      this.setHashtagStatus("Loading in background…", "info");
    } else if (
      (action === "sync" || action === "background-loaded" || action === "reset") &&
      this.hashtagBackgroundLoading
    ) {
      const statusText = this.hashtagStatusText?.textContent?.trim?.() || "";
      if (statusText === "Loading in background…") {
        this.setHashtagStatus("", "muted");
      }
      this.hashtagBackgroundLoading = false;
    }

    this.populateHashtagPreferences(preferences);
    this.refreshHashtagBackgroundStatus();
  }

  handleSubscriptionsChange(detail = {}) {
    const action = typeof detail?.action === "string" ? detail.action : "";

    if (action === "background-loading") {
      this.subscriptionsBackgroundLoading = true;
      this.setSubscriptionsStatus("Loading in background…", "info");
    } else if (
      (action === "sync" || action === "background-loaded" || action === "reset") &&
      this.subscriptionsBackgroundLoading
    ) {
      const statusText = this.subscriptionsStatusText?.textContent?.trim?.() || "";
      if (statusText === "Loading in background…") {
        this.setSubscriptionsStatus("", "muted");
      }
      this.subscriptionsBackgroundLoading = false;
    }

    void this.populateSubscriptionsList();
    this.refreshSubscriptionsBackgroundStatus();
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

  async populateSubscriptionsList(subscriptions = null) {
    if (
      !(this.subscriptionList instanceof HTMLElement) ||
      !(this.subscriptionListEmpty instanceof HTMLElement)
    ) {
      return;
    }

    const service = this.subscriptionsService;
    if (!service) {
      this.clearSubscriptionsList();
      this.refreshSubscriptionsBackgroundStatus();
      return;
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      this.clearSubscriptionsList();
      this.refreshSubscriptionsBackgroundStatus();
      return;
    }

    try {
      let sourceEntries = [];

      if (Array.isArray(subscriptions) && subscriptions.length) {
        sourceEntries = subscriptions;
      } else {
        if (typeof service.getSubscribedAuthors === "function") {
          try {
            sourceEntries = service.getSubscribedAuthors() || [];
          } catch (error) {
            devLogger.warn(
              "[profileModal] Failed to resolve subscriptions for subscriptions list:",
              error,
            );
            sourceEntries = [];
          }
        } else if (service.subscribedPubkeys instanceof Set) {
          sourceEntries = Array.from(service.subscribedPubkeys);
        } else if (Array.isArray(service.subscribedPubkeys)) {
          sourceEntries = service.subscribedPubkeys.slice();
        }
      }

      const normalizedEntries = [];
      const pushEntry = (hex, label) => {
        if (!hex) {
          return;
        }
        normalizedEntries.push({ hex, label });
      };

      sourceEntries.forEach((entry) => {
        if (!entry) {
          return;
        }

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
            pushEntry(trimmed.toLowerCase(), trimmed);
          }
          return;
        }

        if (typeof entry !== "object") {
          return;
        }

        const candidateHex =
          typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";
        if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
          pushEntry(candidateHex.toLowerCase(), candidateHex);
          return;
        }

        const candidateNpub =
          typeof entry.npub === "string" ? entry.npub.trim() : "";
        if (candidateNpub && candidateNpub.startsWith("npub1")) {
          const decoded = this.safeDecodeNpub(candidateNpub);
          if (!decoded) {
            return;
          }
          const label = this.safeEncodeNpub(decoded) || candidateNpub;
          pushEntry(decoded, label);
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

      this.subscriptionList.innerHTML = "";

      if (!deduped.length) {
        this.subscriptionListEmpty.classList.remove("hidden");
        this.subscriptionList.classList.add("hidden");
        this.refreshSubscriptionsBackgroundStatus();
        return;
      }

      this.subscriptionListEmpty.classList.add("hidden");
      this.subscriptionList.classList.remove("hidden");

      const formatNpub =
        typeof this.formatShortNpub === "function"
          ? (value) => this.formatShortNpub(value)
          : (value) => (typeof value === "string" ? value : "");
      const entriesNeedingFetch = new Set();

      deduped.forEach(({ hex, label }) => {
        const item = document.createElement("li");
        item.className = "card flex items-center justify-between gap-4 p-4";

        let cachedProfile = null;
        if (hex && typeof this.services.getProfileCacheEntry === "function") {
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
          (cachedProfile?.name && cachedProfile.name.trim()) ||
          (cachedProfile?.display_name &&
            typeof cachedProfile.display_name === "string" &&
            cachedProfile.display_name.trim()) ||
          displayNpub ||
          "Subscription";
        const avatarSrc = cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

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

        if (hex) {
          const unsubscribeButton = this.createRemoveButton({
            label: "Unsubscribe",
            onRemove: () => this.handleUnsubscribeFromCreator(hex),
          });
          if (unsubscribeButton) {
            unsubscribeButton.dataset.subscriptionHex = hex;
            actions.appendChild(unsubscribeButton);
          }
        }

        item.appendChild(summary);
        if (actions.childElementCount > 0) {
          item.appendChild(actions);
        }

        this.subscriptionList.appendChild(item);
      });

      if (
        entriesNeedingFetch.size &&
        typeof this.services.batchFetchProfiles === "function"
      ) {
        try {
          this.services.batchFetchProfiles(entriesNeedingFetch);
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to batch fetch profiles for subscriptions list:",
            error,
          );
        }
      }
      this.refreshSubscriptionsBackgroundStatus();
    } catch (error) {
      devLogger.warn("[profileModal] Failed to populate subscriptions list:", error);
    }
  }

  clearSubscriptionsList() {
    if (this.subscriptionList instanceof HTMLElement) {
      this.subscriptionList.innerHTML = "";
      this.subscriptionList.classList.add("hidden");
    }

    if (this.subscriptionListEmpty instanceof HTMLElement) {
      this.subscriptionListEmpty.classList.remove("hidden");
    }
  }

  async handleUnsubscribeFromCreator(candidate) {
    const refresh = async () => {
      try {
        await this.populateSubscriptionsList();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh subscriptions list after unsubscribe:",
          error,
        );
      }

      try {
        await this.populateFriendsList();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh friends list after unsubscribe:",
          error,
        );
      }
    };

    return this.handleRemoveFriend(candidate, {
      successMessage: "You unsubscribed from this creator.",
      refresh,
      successReason: "unsubscribed",
    });
  }

  async populateFriendsList(friends = null) {
    if (
      !(this.friendList instanceof HTMLElement) ||
      !(this.friendListEmpty instanceof HTMLElement)
    ) {
      return;
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      this.clearFriendsList();
      return;
    }

    try {
      let sourceEntries = [];
      let usedModerationService = false;

      if (Array.isArray(friends) && friends.length) {
        sourceEntries = friends;
      } else {
        const moderationService = this.moderationService;

        if (moderationService) {
          let contacts = [];

          if (
            typeof moderationService.ensureViewerContactsLoaded === "function"
          ) {
            try {
              contacts =
                (await moderationService.ensureViewerContactsLoaded(activeHex)) ||
                [];
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to ensure viewer contacts before populating friends list:",
                error,
              );
              contacts = [];
            }
          }

          if (!Array.isArray(contacts) || !contacts) {
            contacts = [];
          }

          if (!contacts.length) {
            if (moderationService.viewerContacts instanceof Set) {
              contacts = Array.from(moderationService.viewerContacts);
            }
          }

          if (Array.isArray(contacts)) {
            sourceEntries = contacts;
            usedModerationService = true;
          }
        }

        if (!usedModerationService) {
          const service = this.subscriptionsService;

          if (!service) {
            this.clearFriendsList();
            return;
          }

          if (typeof service.ensureLoaded === "function") {
            try {
              await service.ensureLoaded(activeHex);
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to ensure subscriptions before populating friends list:",
                error,
              );
            }
          }

          if (typeof service.getSubscribedAuthors === "function") {
            try {
              sourceEntries = service.getSubscribedAuthors() || [];
            } catch (error) {
              devLogger.warn(
                "[profileModal] Failed to resolve subscriptions for friends list:",
                error,
              );
              sourceEntries = [];
            }
          } else if (service.subscribedPubkeys instanceof Set) {
            sourceEntries = Array.from(service.subscribedPubkeys);
          } else if (Array.isArray(service.subscribedPubkeys)) {
            sourceEntries = service.subscribedPubkeys.slice();
          }
        }
      }

      const normalizedEntries = [];
      const pushEntry = (hex, label) => {
        if (!hex) {
          return;
        }
        normalizedEntries.push({ hex, label });
      };

      sourceEntries.forEach((entry) => {
        if (!entry) {
          return;
        }

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
            const normalizedHex = trimmed.toLowerCase();
            const label = this.safeEncodeNpub(normalizedHex) || normalizedHex;
            pushEntry(normalizedHex, label);
          }
          return;
        }

        if (entry && typeof entry === "object") {
          const candidateHex =
            typeof entry.pubkey === "string" ? entry.pubkey.trim() : "";
          const candidateNpub =
            typeof entry.npub === "string" ? entry.npub.trim() : "";

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
            pushEntry(decoded, candidateNpub);
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

      this.friendList.innerHTML = "";

      if (!deduped.length) {
        this.friendListEmpty.classList.remove("hidden");
        this.friendList.classList.add("hidden");
        return;
      }

      this.friendListEmpty.classList.add("hidden");
      this.friendList.classList.remove("hidden");

      const formatNpub =
        typeof this.formatShortNpub === "function"
          ? (value) => this.formatShortNpub(value)
          : (value) => (typeof value === "string" ? value : "");

      const entriesNeedingFetch = new Set();
      const canRemoveFriends = this.canManageFriendsList();

      deduped.forEach(({ hex, label }) => {
        const item = document.createElement("li");
        item.className = "card flex items-center justify-between gap-4 p-4";

        let cachedProfile = null;
        if (hex && typeof this.services.getProfileCacheEntry === "function") {
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
          (cachedProfile?.name && cachedProfile.name.trim()) ||
          (cachedProfile?.display_name &&
            typeof cachedProfile.display_name === "string" &&
            cachedProfile.display_name.trim()) ||
          displayNpub ||
          "Friend";
        const avatarSrc = cachedProfile?.picture || FALLBACK_PROFILE_AVATAR;

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

        if (hex && canRemoveFriends) {
          const removeButton = this.createRemoveButton({
            label: "Unfriend",
            onRemove: () => this.handleRemoveFriend(hex),
          });
          if (removeButton) {
            removeButton.dataset.friendHex = hex;
            actions.appendChild(removeButton);
          }
        }

        item.appendChild(summary);
        if (actions.childElementCount > 0) {
          item.appendChild(actions);
        }

        this.friendList.appendChild(item);
      });

      if (
        entriesNeedingFetch.size &&
        typeof this.services.batchFetchProfiles === "function"
      ) {
        try {
          this.services.batchFetchProfiles(entriesNeedingFetch);
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to batch fetch profiles for friends list:",
            error,
          );
        }
      }
    } catch (error) {
      devLogger.warn("[profileModal] Failed to populate friends list:", error);
    }
  }

  canManageFriendsList() {
    if (
      this.moderationService &&
      (!this.subscriptionsService ||
        typeof this.subscriptionsService.removeChannel !== "function")
    ) {
      return false;
    }

    return (
      this.subscriptionsService &&
      typeof this.subscriptionsService.removeChannel === "function"
    );
  }

  clearFriendsList() {
    if (this.friendList instanceof HTMLElement) {
      this.friendList.innerHTML = "";
      this.friendList.classList.add("hidden");
    }

    if (this.friendListEmpty instanceof HTMLElement) {
      this.friendListEmpty.classList.remove("hidden");
    }
  }

  async handleRemoveFriend(candidate, options = {}) {
    if (
      this.moderationService &&
      (!this.subscriptionsService ||
        typeof this.subscriptionsService.removeChannel !== "function")
    ) {
      this.showError(
        "Friends are synced with your Nostr follows. Update your follows in your Nostr client to make changes.",
      );
      return {
        success: false,
        reason: "nostr-friends-managed-externally",
      };
    }

    const service = this.subscriptionsService;
    if (!service || typeof service.removeChannel !== "function") {
      this.showError("Friends list is unavailable right now.");
      return { success: false, reason: "service-unavailable" };
    }

    const activeHex = this.normalizeHexPubkey(this.getActivePubkey());
    if (!activeHex) {
      this.showError("Please login to manage your friends list.");
      return { success: false, reason: "no-active-pubkey" };
    }

    const {
      successMessage = "Creator removed from your friends list.",
      refresh = async () => {
        await this.populateFriendsList();
      },
      successReason = "removed",
    } = typeof options === "object" && options ? options : {};

    let targetHex = "";
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.startsWith("npub1")) {
        targetHex = this.safeDecodeNpub(trimmed) || "";
      } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        targetHex = trimmed.toLowerCase();
      }
    } else if (candidate && typeof candidate === "object") {
      const candidateHex =
        typeof candidate.pubkey === "string" ? candidate.pubkey.trim() : "";
      const candidateNpub =
        typeof candidate.npub === "string" ? candidate.npub.trim() : "";

      if (candidateHex && /^[0-9a-f]{64}$/i.test(candidateHex)) {
        targetHex = candidateHex.toLowerCase();
      } else if (candidateNpub && candidateNpub.startsWith("npub1")) {
        targetHex = this.safeDecodeNpub(candidateNpub) || "";
      }
    }

    if (!targetHex) {
      devLogger.warn(
        "[profileModal] No valid pubkey to remove from friends list:",
        candidate,
      );
      return { success: false, reason: "invalid-target" };
    }

    try {
      await service.removeChannel(targetHex, activeHex);
    } catch (error) {
      userLogger.error(
        "[profileModal] Failed to remove creator from friends list:",
        error,
      );
      const message =
        error?.code === "extension-permission-denied"
          ? "Your Nostr extension must allow encryption to manage subscriptions."
          : error?.message || "Failed to update your friends list. Please try again.";
      if (message) {
        this.showError(message);
      }
      return { success: false, reason: error?.code || "service-error", error };
    }

    this.showSuccess(successMessage);

    if (typeof refresh === "function") {
      try {
        await refresh();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh lists after removing friend:",
          error,
        );
      }
    }

    return { success: true, reason: successReason };
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
            : mutationResult?.error?.code ===
              "extension-encryption-permission-denied"
            ? "Your Nostr extension must allow encryption to update your block list."
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
          : error?.code === "extension-encryption-permission-denied"
          ? "Your Nostr extension must allow encryption to update your block list."
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
            : mutationResult.error.code ===
              "extension-encryption-permission-denied"
            ? "Your Nostr extension must allow encryption to update your block list."
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
          : error?.code === "extension-encryption-permission-denied"
          ? "Your Nostr extension must allow encryption to update your block list."
          : "Failed to update your block list. Please try again.";
      this.showError(message);
    }
  }

  handleEditProfile() {
    this.selectPane("edit");
    void this.populateEditPane();
  }

  async populateEditPane() {
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!pubkey) {
      return;
    }

    const cacheEntry = this.services.getProfileCacheEntry(pubkey);
    const profile = cacheEntry?.profile || {};

    if (this.editNameInput) this.editNameInput.value = profile.name || "";
    if (this.editDisplayNameInput)
      this.editDisplayNameInput.value = profile.display_name || "";
    if (this.editAboutInput) this.editAboutInput.value = profile.about || "";
    if (this.editWebsiteInput)
      this.editWebsiteInput.value = profile.website || "";
    if (this.editNip05Input) this.editNip05Input.value = profile.nip05 || "";
    if (this.editLud16Input) this.editLud16Input.value = profile.lud16 || "";
    if (this.editPictureInput)
      this.editPictureInput.value = profile.picture || "";
    if (this.editBannerInput) this.editBannerInput.value = profile.banner || "";

    void this.checkStorageForUploads(pubkey);
  }

  async checkStorageForUploads(pubkey) {
    const r2Service = this.services.r2Service;
    if (!r2Service) return;

    let hasStorage = false;
    try {
      const credentials = await r2Service.resolveConnection(pubkey);
      hasStorage = !!credentials;
    } catch (e) {
      hasStorage = false;
    }

    const updateUI = (uploadBtn, hint, has) => {
      if (uploadBtn) {
        uploadBtn.disabled = !has;
        if (!has) uploadBtn.setAttribute("aria-disabled", "true");
        else uploadBtn.removeAttribute("aria-disabled");
      }
      if (hint) {
        if (has) hint.classList.add("hidden");
        else hint.classList.remove("hidden");
      }
    };

    updateUI(
      this.editPictureUploadBtn,
      this.editPictureStorageHint,
      hasStorage,
    );
    updateUI(this.editBannerUploadBtn, this.editBannerStorageHint, hasStorage);
  }

  async handleUpload(type) {
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!pubkey) return;

    const r2Service = this.services.r2Service;
    if (!r2Service) return;

    const fileInput =
      type === "picture" ? this.editPictureFile : this.editBannerFile;
    const urlInput =
      type === "picture" ? this.editPictureInput : this.editBannerInput;
    const uploadBtn =
      type === "picture" ? this.editPictureUploadBtn : this.editBannerUploadBtn;

    if (!fileInput || !fileInput.files.length) return;
    const file = fileInput.files[0];

    try {
      if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = "Uploading...";
      }

      const credentials = await r2Service.resolveConnection(pubkey);
      if (!credentials) {
        this.showError("Storage configuration missing.");
        return;
      }

      const key = buildR2Key(pubkey, file);
      await r2Service.uploadFile({
        file,
        ...credentials,
        bucket: credentials.bucket,
        key,
      });

      const url = buildPublicUrl(credentials.baseDomain, key);
      if (urlInput) urlInput.value = url;

      fileInput.value = "";
    } catch (error) {
      this.showError("Upload failed: " + (error.message || "Unknown error"));
      devLogger.error("Upload error:", error);
    } finally {
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Upload";
      }
    }
  }

  async handleSaveProfile() {
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!pubkey) return;

    const profile = {
      name: this.editNameInput?.value?.trim() || "",
      display_name: this.editDisplayNameInput?.value?.trim() || "",
      about: this.editAboutInput?.value?.trim() || "",
      website: this.editWebsiteInput?.value?.trim() || "",
      nip05: this.editNip05Input?.value?.trim() || "",
      lud16: this.editLud16Input?.value?.trim() || "",
      picture: this.editPictureInput?.value?.trim() || "",
      banner: this.editBannerInput?.value?.trim() || "",
    };

    if (this.editSaveBtn) {
      this.editSaveBtn.disabled = true;
      this.editSaveBtn.textContent = "Saving...";
    }

    try {
      const event = buildProfileMetadataEvent({
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        metadata: profile,
      });

      const result =
        await this.services.nostrClient.signAndPublishEvent(event);

      if (result && result.signedEvent) {
        if (this.services.nostrClient.handleEvent) {
          this.services.nostrClient.handleEvent(result.signedEvent);
        }
      }

      this.showSuccess("Profile updated!");
      this.selectPane("account");
      this.renderSavedProfiles();
    } catch (error) {
      this.showError("Failed to save profile: " + error.message);
    } finally {
      if (this.editSaveBtn) {
        this.editSaveBtn.disabled = false;
        this.editSaveBtn.textContent = "Save Profile";
      }
    }
  }

  async populateStoragePane() {
    const storageService = this.services.storageService;
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());

    this.handleClearStorage();

    if (!pubkey) {
      // Not logged in
      if (this.storageUnlockSection) this.storageUnlockSection.classList.add("hidden");
      if (this.storageFormSection) this.storageFormSection.classList.add("hidden");
      if (this.storageStatusText) {
        this.storageStatusText.textContent = "Please login to manage storage.";
        this.storageStatusText.className = "text-xs text-status-danger";
      }
      return;
    }

    const isUnlocked = storageService && storageService.masterKeys.has(pubkey);

    if (this.storageStatusText) {
      this.storageStatusText.textContent = isUnlocked ? "Unlocked" : "Locked";
      this.storageStatusText.className = isUnlocked ? "text-xs text-status-success" : "text-xs text-status-warning";
    }

    if (isUnlocked) {
      if (this.storageUnlockSection) this.storageUnlockSection.classList.add("hidden");
      if (this.storageFormSection) this.storageFormSection.classList.remove("hidden");

      // Load existing connection if form is empty or needs refresh
      // For now, we assume managing a 'default' connection or the first one found.
      try {
        const connections = await storageService.listConnections(pubkey);
        // Prioritize default for uploads
        const defaultConn = connections.find(c => c.meta?.defaultForUploads);
        const targetConn = defaultConn || connections[0];

        if (targetConn) {
          const conn = await storageService.getConnection(pubkey, targetConn.id);
          if (conn) {
            this.fillStorageForm(conn);
            if (this.storageStatusText) {
              const label = conn.meta?.label || conn.provider || "S3";
              this.storageStatusText.textContent = `Unlocked (${label})`;
            }
          }
        }
      } catch (error) {
        devLogger.error("Failed to load storage connections:", error);
      }
    } else {
      if (this.storageUnlockSection) this.storageUnlockSection.classList.remove("hidden");
      if (this.storageFormSection) this.storageFormSection.classList.add("hidden");
    }

    this.updateStorageFormVisibility();
  }

  fillStorageForm(conn) {
    if (!conn) return;
    const { provider, accessKeyId, secretAccessKey, accountId: payloadAccountId, endpoint: payloadEndpoint, forcePathStyle: payloadForcePathStyle } = conn;
    const { endpoint, region, bucket, prefix, defaultForUploads, accountId, forcePathStyle: metaForcePathStyle } = conn.meta || {};

    if (this.storageProviderInput) this.storageProviderInput.value = provider || "cloudflare_r2";

    // For R2, accountId is critical.
    const resolvedEndpoint = endpoint || accountId || payloadAccountId || payloadEndpoint || "";

    if (this.storageEndpointInput) this.storageEndpointInput.value = resolvedEndpoint;
    if (this.storageRegionInput) this.storageRegionInput.value = region || "auto";
    if (this.storageAccessKeyInput) this.storageAccessKeyInput.value = accessKeyId || "";
    if (this.storageSecretKeyInput) this.storageSecretKeyInput.value = secretAccessKey || "";
    if (this.storageBucketInput) this.storageBucketInput.value = bucket || "";
    if (this.storagePrefixInput) this.storagePrefixInput.value = prefix || "";
    if (this.storageDefaultInput) this.storageDefaultInput.checked = !!defaultForUploads;

    if (this.storageForcePathStyleInput) {
      if (typeof payloadForcePathStyle === "boolean") {
        this.storageForcePathStyleInput.checked = payloadForcePathStyle;
      } else if (typeof metaForcePathStyle === "boolean") {
        this.storageForcePathStyleInput.checked = metaForcePathStyle;
      } else {
        // Default to true for S3 if unspecified
        this.storageForcePathStyleInput.checked = true;
      }
    }

    this.updateStorageFormVisibility();
    this.handlePublicUrlInput();
  }

  handlePublicUrlInput() {
    if (!this.storagePrefixInput || !this.storagePrefixWarning) return;
    this.storagePrefixWarning.textContent = "";
    this.storagePrefixWarning.classList.add("hidden");
  }

  updateStorageFormVisibility() {
    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    const isR2 = provider === "cloudflare_r2";

    if (this.storageEndpointInput) {
      const label = this.storageEndpointInput.parentElement.querySelector("span");
      if (isR2) {
        if (label) label.textContent = "Cloudflare Account ID";
        this.storageEndpointInput.placeholder =
          "Account ID from Cloudflare dashboard";
        this.storageEndpointInput.parentElement.classList.remove("hidden");
        this.storageEndpointInput.type = "text";
        if (this.storagePrefixInput) {
          this.storagePrefixInput.placeholder = "https://pub-xxx.r2.dev";
        }
      } else {
        if (label) label.textContent = "Endpoint URL";
        this.storageEndpointInput.placeholder = "https://s3.example.com";
        this.storageEndpointInput.parentElement.classList.remove("hidden");
        this.storageEndpointInput.type = "url";
        if (this.storagePrefixInput) {
          this.storagePrefixInput.placeholder = "https://cdn.example.com";
        }
      }
    }

    if (this.storageR2Helper) {
      if (isR2) this.storageR2Helper.classList.remove("hidden");
      else this.storageR2Helper.classList.add("hidden");
    }

    if (this.storageS3Helper) {
      if (!isR2) this.storageS3Helper.classList.remove("hidden");
      else this.storageS3Helper.classList.add("hidden");
    }

    if (this.storageForcePathStyleLabel) {
      if (!isR2) this.storageForcePathStyleLabel.classList.remove("hidden", "flex");
      else this.storageForcePathStyleLabel.classList.add("hidden");

      if (!isR2) {
        this.storageForcePathStyleLabel.classList.add("flex");
      }
    }
  }

  async handleUnlockStorage() {
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!pubkey) return;

    // We need the active signer.
    const signer = getActiveSigner();
    // Or try resolving via client if global one is missing?
    // ProfileModalController imports getActiveSigner.

    if (!signer) {
      this.showError("No active signer found. Please login.");
      return;
    }

    if (
      signer.pubkey &&
      this.normalizeHexPubkey(signer.pubkey) !== pubkey
    ) {
      this.showError(
        `Signer account (${signer.pubkey.slice(
          0,
          8,
        )}...) does not match profile (${pubkey.slice(
          0,
          8,
        )}...). Please switch accounts in your extension.`,
      );
      return;
    }

    const storageService = this.services.storageService;
    if (!storageService) {
      this.showError("Storage service unavailable.");
      return;
    }

    if (this.storageUnlockBtn) {
      this.storageUnlockBtn.disabled = true;
      this.storageUnlockBtn.textContent = "Unlocking...";
    }

    try {
      await storageService.unlock(pubkey, { signer });
      this.showSuccess("Storage unlocked.");
      this.populateStoragePane();
    } catch (error) {
      devLogger.error("Failed to unlock storage:", error);
      const message =
        error && typeof error.message === "string"
          ? error.message
          : "Failed to unlock storage. Ensure your signer supports NIP-04/44.";
      this.showError(message);
    } finally {
      if (this.storageUnlockBtn) {
        this.storageUnlockBtn.disabled = false;
        this.storageUnlockBtn.textContent = "Unlock Storage";
      }
    }
  }

  async handleSaveStorage() {
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!pubkey) return;

    const storageService = this.services.storageService;
    if (!storageService) return;

    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    let endpointOrAccount = this.storageEndpointInput?.value?.trim() || "";
    const region = this.storageRegionInput?.value?.trim() || "auto";
    const accessKeyId = this.storageAccessKeyInput?.value?.trim() || "";
    const secretAccessKey = this.storageSecretKeyInput?.value?.trim() || "";
    const bucket = this.storageBucketInput?.value?.trim() || "";
    const prefix = this.storagePrefixInput?.value?.trim() || "";
    const isDefault = this.storageDefaultInput?.checked || false;

    if (!accessKeyId || !secretAccessKey || !bucket || !endpointOrAccount) {
        this.setStorageFormStatus("Please fill in all required fields.", "error");
        return;
    }

    if (
      provider === "cloudflare_r2" &&
      (prefix.includes(".r2.cloudflarestorage.com") ||
        prefix.includes(".s3.") ||
        prefix.includes(".amazonaws.com"))
    ) {
      this.setStorageFormStatus(
        "Invalid Public URL. Please use your R2.dev or custom domain.",
        "error",
      );
      return;
    }

    let publicBaseUrl = "";
    // For Generic S3, respect the user's checkbox selection.
    let forcePathStyle = false;
    if (provider === PROVIDERS.GENERIC) {
      forcePathStyle = this.storageForcePathStyleInput?.checked ?? true;
    }

    const payload = {
        provider,
        accessKeyId,
        secretAccessKey,
    };

    // For R2, endpoint input is Account ID.
    // For Generic S3, it's the full endpoint URL.
    if (provider === "cloudflare_r2") {
        payload.accountId = endpointOrAccount;
    } else {
        try {
          const normalized = await prepareS3Connection({
            endpoint: endpointOrAccount,
            region,
            accessKeyId,
            secretAccessKey,
            bucket,
            forcePathStyle,
            origins: getCorsOrigins(),
          });
          endpointOrAccount = normalized.endpoint;
          publicBaseUrl = normalized.publicBaseUrl;
          forcePathStyle = normalized.forcePathStyle;
        } catch (error) {
          devLogger.error("Failed to validate S3 connection:", error);
          this.setStorageFormStatus(
            error?.message || "Invalid S3 configuration.",
            "error"
          );
          return;
        }

        payload.endpoint = endpointOrAccount;
        payload.forcePathStyle = forcePathStyle;
    }

    const meta = {
        provider,
        region,
        bucket,
        prefix,
        defaultForUploads: isDefault,
        label: `${provider} - ${bucket}`,
        // Duplicate non-sensitive info for easier listing
        endpoint: provider === "cloudflare_r2" ? undefined : endpointOrAccount,
    };

    // If R2, we also need accountId in meta? No, keep it private if possible, but R2Service needs it.
    // Actually R2 account ID is not strictly secret, but payload is encrypted.
    // We can store it in meta if we want to show it in UI without decrypting.
    if (provider === "cloudflare_r2") {
        meta.accountId = endpointOrAccount;
        // For R2, the "Prefix" input serves as the Public Base URL (e.g. https://pub-xxx.r2.dev)
        meta.publicBaseUrl = prefix;
        meta.baseDomain = prefix;
    } else {
        meta.publicBaseUrl = publicBaseUrl;
        meta.baseDomain = publicBaseUrl;
        meta.forcePathStyle = forcePathStyle;
    }

    this.setStorageFormStatus("Saving...", "info");

    try {
        await storageService.saveConnection(pubkey, "default", payload, meta);
        this.setStorageFormStatus("Connection saved.", "success");
        this.showSuccess("Storage connection saved.");
    } catch (error) {
        devLogger.error("Failed to save connection:", error);
        this.setStorageFormStatus("Failed to save connection.", "error");
    }
  }

  async handleTestStorage() {
    const pubkey = this.normalizeHexPubkey(this.getActivePubkey());
    if (!pubkey) return;

    const storageService = this.services.storageService;
    if (!storageService) {
        this.setStorageFormStatus("Storage service unavailable.", "error");
        return;
    }

    const provider = this.storageProviderInput?.value || "cloudflare_r2";
    const endpointOrAccount = this.storageEndpointInput?.value?.trim() || "";
    const region = this.storageRegionInput?.value?.trim() || "auto";
    const accessKeyId = this.storageAccessKeyInput?.value?.trim() || "";
    const secretAccessKey = this.storageSecretKeyInput?.value?.trim() || "";
    const bucket = this.storageBucketInput?.value?.trim() || "";

    // Checkbox is only relevant for Generic S3
    const forcePathStyle = provider === PROVIDERS.GENERIC
      ? (this.storageForcePathStyleInput?.checked ?? true)
      : false;

    const publicBaseUrl = this.storagePrefixInput?.value?.trim() || "";

    if (!accessKeyId || !secretAccessKey || !endpointOrAccount) {
        this.setStorageFormStatus("Missing credentials for test.", "error");
        return;
    }

    if (
      provider === "cloudflare_r2" &&
      (publicBaseUrl.includes(".r2.cloudflarestorage.com") ||
        publicBaseUrl.includes(".s3.") ||
        publicBaseUrl.includes(".amazonaws.com"))
    ) {
      this.setStorageFormStatus(
        "Invalid Public URL. Please use your R2.dev or custom domain.",
        "error",
      );
      return;
    }

    this.setStorageFormStatus("Testing connection...", "info");

    const config = {
      provider,
      accessKeyId,
      secretAccessKey,
      region,
      bucket,
    };

    if (provider === "cloudflare_r2") {
      config.accountId = endpointOrAccount;
      config.publicBaseUrl = publicBaseUrl;
      config.baseDomain = publicBaseUrl;
    } else {
      config.endpoint = endpointOrAccount;
      config.forcePathStyle = forcePathStyle;
    }

    try {
        const result = await storageService.testAccess(provider, config);
        if (result.success) {
            this.setStorageFormStatus(result.message || "Connection Verified!", "success");
        } else {
            this.setStorageFormStatus(`Test Failed: ${result.error}`, "error");
        }
    } catch (error) {
        this.setStorageFormStatus(`Test Error: ${error.message}`, "error");
    }
  }

  handleClearStorage() {
    this.storageEndpointInput.value = "";
    this.storageRegionInput.value = "auto";
    this.storageAccessKeyInput.value = "";
    this.storageSecretKeyInput.value = "";
    this.storageBucketInput.value = "";
    this.storagePrefixInput.value = "";
    this.storageDefaultInput.checked = false;
    this.storageProviderInput.value = "cloudflare_r2";
    if (this.storageForcePathStyleInput) {
      this.storageForcePathStyleInput.checked = true;
    }
    this.updateStorageFormVisibility();
    this.setStorageFormStatus("", "info");
  }

  setStorageFormStatus(message, variant = "info") {
    if (!this.storageFormStatus) return;
    this.storageFormStatus.textContent = message;
    this.storageFormStatus.className = `text-sm text-status-${variant}`;
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
      const state = typeof renderer.getState === "function" ? renderer.getState() : {};
      if (state.initialized) {
        await renderer.refresh({ actor: primaryActor, force: true });
      } else {
        await renderer.ensureInitialLoad({ actor: primaryActor });
      }

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
    const uriValue = this.getSecretInputValue(this.walletUriInput);
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
    if (!hasActive) {
      this.setSecretInputValue(this.walletUriInput, "");
      if (this.walletDefaultZapInput && "value" in this.walletDefaultZapInput) {
        try {
          this.walletDefaultZapInput.value = "";
        } catch (error) {
          if (this.walletDefaultZapInput instanceof HTMLElement) {
            this.walletDefaultZapInput.setAttribute("data-value", "");
          }
        }
      }
      this.updateWalletStatus("Sign in to connect a wallet.", "info");
      this.applyWalletControlState();
      return;
    }

    let settings = this.services.nwcSettings.getActiveNwcSettings();
    if (!settings || typeof settings !== "object") {
      settings = this.services.nwcSettings.createDefaultNwcSettings();
    }
    this.setSecretInputValue(this.walletUriInput, settings.nwcUri || "");
    if (this.walletDefaultZapInput && "value" in this.walletDefaultZapInput) {
      const defaultZapValue =
        settings.defaultZap === null || settings.defaultZap === undefined
          ? ""
          : String(settings.defaultZap);
      try {
        this.walletDefaultZapInput.value = defaultZapValue;
      } catch (error) {
        if (this.walletDefaultZapInput instanceof HTMLElement) {
          this.walletDefaultZapInput.setAttribute("data-value", defaultZapValue);
        }
      }
    }

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

  isSecretInputElement(element) {
    if (!element || typeof element !== "object") {
      return false;
    }
    if (typeof HTMLInputElement !== "undefined" && element instanceof HTMLInputElement) {
      return true;
    }
    return typeof element.value === "string";
  }

  sanitizeSecretValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  getSecretInputValue(element) {
    if (!this.isSecretInputElement(element)) {
      return "";
    }

    const placeholder =
      typeof element.dataset?.secretPlaceholder === "string"
        ? element.dataset.secretPlaceholder
        : SECRET_PLACEHOLDER;
    const stored = this.sanitizeSecretValue(
      typeof element.dataset?.secretValue === "string"
        ? element.dataset.secretValue
        : "",
    );
    const raw = this.sanitizeSecretValue(element.value);
    const isMasked = element.dataset?.secretMasked === "true";

    if (isMasked && placeholder && raw === placeholder) {
      return stored;
    }

    if (!raw && isMasked) {
      return stored;
    }

    return raw;
  }

  setSecretInputValue(element, value) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const sanitized = this.sanitizeSecretValue(value);
    if (!sanitized) {
      if (element.dataset) {
        delete element.dataset.secretValue;
        delete element.dataset.secretMasked;
        delete element.dataset.secretPlaceholder;
      }
      element.value = "";
      return;
    }

    const placeholder = SECRET_PLACEHOLDER;
    if (element.dataset) {
      element.dataset.secretValue = sanitized;
      element.dataset.secretPlaceholder = placeholder;
      element.dataset.secretMasked = "true";
    }
    element.value = placeholder;
  }

  revealSecretInputValue(element) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const stored = this.sanitizeSecretValue(
      typeof element.dataset?.secretValue === "string"
        ? element.dataset.secretValue
        : "",
    );

    if (!stored) {
      if (element.dataset) {
        delete element.dataset.secretMasked;
      }
      return;
    }

    if (element.dataset) {
      element.dataset.secretMasked = "false";
    }
    element.value = stored;
    try {
      if (typeof element.setSelectionRange === "function") {
        const length = stored.length;
        element.setSelectionRange(length, length);
      }
    } catch (error) {
      // Ignore selection errors on unsupported input types.
    }
  }

  handleSecretInputChange(element) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const value = this.sanitizeSecretValue(element.value);
    if (!value) {
      if (element.dataset) {
        element.dataset.secretMasked = "false";
        delete element.dataset.secretValue;
      }
      return;
    }

    if (element.dataset) {
      element.dataset.secretValue = value;
      element.dataset.secretMasked = "false";
      if (!element.dataset.secretPlaceholder) {
        element.dataset.secretPlaceholder = SECRET_PLACEHOLDER;
      }
    }
  }

  handleSecretInputBlur(element) {
    if (!this.isSecretInputElement(element)) {
      return;
    }

    const value = this.sanitizeSecretValue(this.getSecretInputValue(element));
    if (!value) {
      if (element.dataset) {
        delete element.dataset.secretValue;
        delete element.dataset.secretMasked;
        delete element.dataset.secretPlaceholder;
      }
      element.value = "";
      return;
    }

    if (element.dataset) {
      element.dataset.secretValue = value;
      element.dataset.secretPlaceholder =
        element.dataset.secretPlaceholder || SECRET_PLACEHOLDER;
      element.dataset.secretMasked = "true";
    }
    element.value = element.dataset?.secretPlaceholder || SECRET_PLACEHOLDER;
  }

  getWalletFormValues() {
    const uri = this.getSecretInputValue(this.walletUriInput);
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

  updateTrustedMuteHideHelperCopy() {
    if (!(this.moderationMuteHideInput instanceof HTMLInputElement)) {
      return;
    }

    const label = this.moderationMuteHideInput.closest("label");
    if (!(label instanceof HTMLElement)) {
      return;
    }

    const helper = label.querySelector("span.text-xs");
    if (!(helper instanceof HTMLElement)) {
      return;
    }

    helper.textContent = TRUSTED_MUTE_HIDE_HELPER_TEXT;
  }

  getModerationOverrideEntries() {
    if (typeof this.services.getModerationOverrides !== "function") {
      return [];
    }

    try {
      const entries = this.services.getModerationOverrides();
      return Array.isArray(entries) ? entries : [];
    } catch (error) {
      devLogger.info(
        "[profileModal] moderation overrides fallback used",
        error,
      );
      return [];
    }
  }

  normalizeModerationOverrideEntries(entries = []) {
    const normalized = [];
    const seen = new Set();

    entries.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const eventId =
        typeof entry.eventId === "string"
          ? entry.eventId.trim().toLowerCase()
          : "";
      if (!eventId) {
        return;
      }
      const author =
        typeof entry.authorPubkey === "string"
          ? entry.authorPubkey.trim()
          : "";
      const normalizedAuthor = author ? this.normalizeHexPubkey(author) || author : "";
      const key = `${normalizedAuthor || ""}:${eventId}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      normalized.push({
        eventId,
        authorPubkey: normalizedAuthor || "",
        updatedAt: Number.isFinite(entry.updatedAt)
          ? Math.floor(entry.updatedAt)
          : 0,
      });
    });

    normalized.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return normalized;
  }

  formatModerationOverrideTimestamp(updatedAt) {
    const numeric = Number(updatedAt);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { display: "", iso: "" };
    }

    try {
      const date = new Date(numeric);
      return {
        display: date.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        iso: date.toISOString(),
      };
    } catch (error) {
      return { display: "", iso: "" };
    }
  }

  async handleModerationOverrideReset(entry) {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    if (typeof this.services.clearModerationOverride !== "function") {
      return false;
    }

    try {
      await this.services.clearModerationOverride({
        eventId: entry.eventId,
        authorPubkey: entry.authorPubkey,
      });
      this.refreshModerationOverridesUi();
      this.showSuccess("Moderation override reset.");
      return true;
    } catch (error) {
      this.showError("Unable to reset this moderation override.");
      return false;
    }
  }

  refreshModerationOverridesUi() {
    if (
      !(this.moderationOverridesList instanceof HTMLElement) ||
      !(this.moderationOverridesEmpty instanceof HTMLElement)
    ) {
      return;
    }

    const entries = this.normalizeModerationOverrideEntries(
      this.getModerationOverrideEntries(),
    );

    this.moderationOverridesList.innerHTML = "";

    if (!entries.length) {
      this.moderationOverridesEmpty.classList.remove("hidden");
      this.moderationOverridesList.classList.add("hidden");
      return;
    }

    this.moderationOverridesEmpty.classList.add("hidden");
    this.moderationOverridesList.classList.remove("hidden");

    const entriesNeedingFetch = new Set();

    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "card space-y-2 p-4";

      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-4";

      const authorKey = entry.authorPubkey;
      let profileSummary = null;
      if (authorKey) {
        const cacheEntry = this.services.getProfileCacheEntry(authorKey);
        if (!cacheEntry) {
          entriesNeedingFetch.add(authorKey);
        }
      }

      const summaryData = this.resolveProfileSummaryForPubkey(authorKey);
      profileSummary = this.createCompactProfileSummary(summaryData);

      const actions = document.createElement("div");
      actions.className = "flex flex-wrap items-center justify-end gap-2";

      const resetButton = this.createRemoveButton({
        label: "Reset",
        onRemove: () => this.handleModerationOverrideReset(entry),
      });
      if (resetButton) {
        actions.appendChild(resetButton);
      }

      if (profileSummary) {
        row.appendChild(profileSummary);
      }
      if (actions.childElementCount > 0) {
        row.appendChild(actions);
      }

      const meta = document.createElement("div");
      meta.className = "flex flex-wrap items-center gap-3 text-2xs text-muted";

      const contentId = document.createElement("span");
      contentId.className = "font-mono text-2xs text-muted";
      const shortId =
        typeof this.truncateMiddle === "function"
          ? this.truncateMiddle(entry.eventId, 16)
          : entry.eventId;
      contentId.textContent = `Content ${shortId}`;
      contentId.title = entry.eventId;
      meta.appendChild(contentId);

      const timestamp = this.formatModerationOverrideTimestamp(entry.updatedAt);
      if (timestamp.display) {
        const time = document.createElement("time");
        time.className = "text-2xs text-muted";
        time.dateTime = timestamp.iso;
        time.textContent = `Updated ${timestamp.display}`;
        meta.appendChild(time);
      }

      item.appendChild(row);
      item.appendChild(meta);

      this.moderationOverridesList.appendChild(item);
    });

    if (
      entriesNeedingFetch.size &&
      typeof this.services.batchFetchProfiles === "function"
    ) {
      this.services.batchFetchProfiles(entriesNeedingFetch);
    }
  }

  refreshModerationSettingsUi() {
    const service = this.getModerationSettingsService();
    if (!service) {
      this.moderationSettingsDefaults = createInternalDefaultModerationSettings();
      this.currentModerationSettings = createInternalDefaultModerationSettings();
      this.updateTrustedHideControlsVisibility();
      this.updateModerationTrustStats();
      this.refreshModerationOverridesUi();
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
    this.updateModerationTrustStats();
    this.refreshModerationOverridesUi();

    this.applyModerationSettingsControlState({ resetStatus: true });
  }

  getModerationTrustStats() {
    const summary = {
      trustedContactsCount: 0,
      trustedMuteContributors: 0,
      trustedReportContributors: 0,
      trustedSeedOnly: false,
    };

    const service = this.moderationService;
    if (!service) {
      return summary;
    }

    if (typeof service.isTrustedSeedOnly === "function") {
      summary.trustedSeedOnly = service.isTrustedSeedOnly();
    } else if (typeof service.trustedSeedOnly === "boolean") {
      summary.trustedSeedOnly = service.trustedSeedOnly;
    }

    const trustedContacts =
      service.trustedContacts instanceof Set
        ? service.trustedContacts
        : Array.isArray(service.trustedContacts)
        ? new Set(service.trustedContacts)
        : new Set();

    summary.trustedContactsCount = trustedContacts.size;

    const adminSnapshot =
      typeof service.getAdminListSnapshot === "function"
        ? service.getAdminListSnapshot()
        : null;

    const resolveStatus = (candidate) => {
      if (typeof service.getAccessControlStatus === "function") {
        return service.getAccessControlStatus(candidate, adminSnapshot);
      }
      return {
        hex: this.normalizeHexPubkey(candidate),
        whitelisted: false,
        blacklisted: false,
      };
    };

    const isBlocked = (pubkey) =>
      typeof service.isPubkeyBlockedByViewer === "function"
        ? service.isPubkeyBlockedByViewer(pubkey)
        : false;

    const isTrustedCandidate = (status) => {
      if (!status || !status.hex) {
        return false;
      }
      if (status.blacklisted) {
        return false;
      }
      if (isBlocked(status.hex)) {
        return false;
      }
      return Boolean(status.whitelisted || trustedContacts.has(status.hex));
    };

    if (service.trustedMuteLists instanceof Map) {
      const trustedMuteOwners = new Set();
      for (const owner of service.trustedMuteLists.keys()) {
        const status = resolveStatus(owner);
        if (isTrustedCandidate(status)) {
          trustedMuteOwners.add(status.hex);
        }
      }
      summary.trustedMuteContributors = trustedMuteOwners.size;
    }

    if (service.reportEvents instanceof Map) {
      const trustedReporters = new Set();
      for (const eventReports of service.reportEvents.values()) {
        if (!(eventReports instanceof Map)) {
          continue;
        }
        for (const reporter of eventReports.keys()) {
          const status = resolveStatus(reporter);
          if (!isTrustedCandidate(status)) {
            continue;
          }
          trustedReporters.add(status.hex);
        }
      }
      summary.trustedReportContributors = trustedReporters.size;
    }

    return summary;
  }

  updateModerationTrustStats() {
    if (
      !(this.moderationTrustedContactsCount instanceof HTMLElement) &&
      !(this.moderationTrustedMuteCount instanceof HTMLElement) &&
      !(this.moderationTrustedReportCount instanceof HTMLElement) &&
      !(this.moderationSeedOnlyIndicator instanceof HTMLElement)
    ) {
      return;
    }

    const summary = this.getModerationTrustStats();

    if (this.moderationTrustedContactsCount instanceof HTMLElement) {
      this.moderationTrustedContactsCount.textContent = String(
        summary.trustedContactsCount,
      );
    }

    if (this.moderationTrustedMuteCount instanceof HTMLElement) {
      this.moderationTrustedMuteCount.textContent = String(
        summary.trustedMuteContributors,
      );
    }

    if (this.moderationTrustedReportCount instanceof HTMLElement) {
      this.moderationTrustedReportCount.textContent = String(
        summary.trustedReportContributors,
      );
    }

    if (this.moderationSeedOnlyIndicator instanceof HTMLElement) {
      this.moderationSeedOnlyIndicator.hidden = !summary.trustedSeedOnly;
    }
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

    const {
      onRemove,
      removeLabel = "Remove",
      confirmMessage,
      removable = true,
      overlapSet,
      overlapLabel,
    } = options;

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
      const comparableNpub =
        this.normalizeNpubValue(normalizedNpub) || normalizedNpub;
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

      if (
        summary &&
        overlapLabel &&
        overlapSet instanceof Set &&
        comparableNpub &&
        overlapSet.has(comparableNpub)
      ) {
        const overlapBadge = document.createElement("span");
        overlapBadge.className = "badge whitespace-nowrap";
        overlapBadge.dataset.variant = "warning";
        overlapBadge.textContent = overlapLabel;
        summary.appendChild(overlapBadge);
      }

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
    const normalizeForCompare = (value) =>
      this.normalizeNpubValue(value) ||
      (typeof value === "string" ? value.trim() : "");
    const whitelistCompare = new Set(
      whitelist.map(normalizeForCompare).filter(Boolean),
    );
    const blacklistCompare = new Set(
      blacklist.map(normalizeForCompare).filter(Boolean),
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
        overlapSet: blacklistCompare,
        overlapLabel: "Also blacklisted",
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
        overlapSet: whitelistCompare,
        overlapLabel: "Also whitelisted",
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

    if (this.focusTrapSuspended) {
      this.focusTrapContainer = targetContainer;
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

  getModalRootElement() {
    if (this.profileModalRoot instanceof HTMLElement) {
      return this.profileModalRoot;
    }
    if (this.profileModal instanceof HTMLElement) {
      return this.profileModal;
    }
    return null;
  }

  getModalPanelElement() {
    if (this.profileModalPanel instanceof HTMLElement) {
      return this.profileModalPanel;
    }
    return this.getModalRootElement();
  }

  suspendFocusTrap() {
    this.focusTrapSuspendCount += 1;
    this.focusTrapSuspended = true;

    if (this.focusTrapSuspendCount > 1) {
      return this.focusTrapSuspendCount;
    }

    if (
      this.boundKeydown &&
      this.focusTrapContainer instanceof HTMLElement
    ) {
      this.focusTrapContainer.removeEventListener(
        "keydown",
        this.boundKeydown,
      );
    }

    if (this.boundFocusIn) {
      document.removeEventListener("focusin", this.boundFocusIn);
    }

    const modalRoot = this.getModalRootElement();
    if (modalRoot) {
      this.focusTrapAriaHiddenBeforeSuspend = modalRoot.getAttribute(
        "aria-hidden",
      );
      this.focusTrapNestedModalActiveBeforeSuspend =
        typeof modalRoot.dataset.nestedModalActive === "string"
          ? modalRoot.dataset.nestedModalActive
          : null;

      modalRoot.dataset.nestedModalActive = "true";
      modalRoot.setAttribute("aria-hidden", "true");
    } else {
      this.focusTrapAriaHiddenBeforeSuspend = null;
      this.focusTrapNestedModalActiveBeforeSuspend = null;
    }

    const panel = this.getModalPanelElement();
    if (panel) {
      panel.setAttribute("inert", "");
    }

    return this.focusTrapSuspendCount;
  }

  resumeFocusTrap() {
    if (this.focusTrapSuspendCount === 0) {
      return 0;
    }

    this.focusTrapSuspendCount = Math.max(
      0,
      this.focusTrapSuspendCount - 1,
    );

    if (this.focusTrapSuspendCount > 0) {
      return this.focusTrapSuspendCount;
    }

    this.focusTrapSuspended = false;

    const modalRoot = this.getModalRootElement();
    if (modalRoot) {
      delete modalRoot.dataset.nestedModalActive;
      if (!modalRoot.classList.contains("hidden")) {
        if (this.focusTrapAriaHiddenBeforeSuspend === null) {
          modalRoot.removeAttribute("aria-hidden");
        } else {
          modalRoot.setAttribute(
            "aria-hidden",
            this.focusTrapAriaHiddenBeforeSuspend,
          );
        }
      }

      if (this.focusTrapNestedModalActiveBeforeSuspend === null) {
        delete modalRoot.dataset.nestedModalActive;
      } else {
        modalRoot.dataset.nestedModalActive =
          this.focusTrapNestedModalActiveBeforeSuspend;
      }
    }

    const panel = this.getModalPanelElement();
    if (panel) {
      panel.removeAttribute("inert");
    }

    this.focusTrapAriaHiddenBeforeSuspend = null;
    this.focusTrapNestedModalActiveBeforeSuspend = null;

    this.updateFocusTrap();

    return 0;
  }

  bringLoginModalToFront() {
    if (typeof document === "undefined") {
      return;
    }

    const loginModal = document.getElementById("loginModal");
    if (!(loginModal instanceof HTMLElement)) {
      return;
    }

    const container =
      this.modalContainer instanceof HTMLElement
        ? this.modalContainer
        : loginModal.parentElement;

    if (!container) {
      return;
    }

    if (loginModal.parentElement !== container) {
      container.appendChild(loginModal);
      return;
    }

    if (container.lastElementChild !== loginModal) {
      container.appendChild(loginModal);
    }
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
      modalRoot.dataset.modalStack = "top";
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

    // Render the header (saved profiles) synchronously so the modal doesn't look empty.
    // This is generally fast as it only touches the top section.
    this.renderSavedProfiles();

    // Show the modal immediately to prevent UI lag.
    this.open(pane);

    const hasBlockHydrator =
      this.services.userBlocks &&
      typeof this.services.userBlocks.ensureLoaded === "function";

    if (hasBlockHydrator) {
      this.setBlockListLoadingState("loading");
    }

    // Defer expensive operations to the next animation frame to allow the modal to paint.
    requestAnimationFrame(() => {
      this.refreshWalletPaneState();
      this.refreshModerationSettingsUi();
      this.syncLinkPreviewSettingsUi();

      if (!hasBlockHydrator) {
        this.populateBlockedList();
      }

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
                  message: "Blocked creators may be out of date. Try again later.",
                });
              }
            })
            .catch((error) => {
              userLogger.warn(
                "Failed to refresh user block list while opening profile modal:",
                error,
              );
              this.setBlockListLoadingState("error", {
                message: "Blocked creators may be out of date. Try again later.",
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
    });

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
    if (document.body) {
      document.body.classList.add("modal-open");
    }
    if (document.documentElement) {
      document.documentElement.classList.add("modal-open");
    }
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

    this.pauseProfileMessages();

    const modalElement =
      this.profileModalRoot instanceof HTMLElement
        ? this.profileModalRoot
        : this.profileModal instanceof HTMLElement
        ? this.profileModal
        : null;

    if (modalElement) {
      modalElement.classList.add("hidden");
      modalElement.setAttribute("aria-hidden", "true");
      delete modalElement.dataset.nestedModalActive;
      delete modalElement.dataset.modalStack;
      if (document.body) {
        document.body.classList.remove("modal-open");
      }
      if (document.documentElement) {
        document.documentElement.classList.remove("modal-open");
      }
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

    const panel = this.getModalPanelElement();
    if (panel) {
      panel.removeAttribute("inert");
    }

    this.focusTrapContainer = null;

    this.focusTrapSuspendCount = 0;
    this.focusTrapSuspended = false;
    this.focusTrapAriaHiddenBeforeSuspend = null;
    this.focusTrapNestedModalActiveBeforeSuspend = null;

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

    const walletPromise = this.hydrateActiveWalletSettings(activePubkey);
    const adminPromise = this.refreshAdminPaneState().catch((error) => {
      userLogger.warn("Failed to refresh admin pane after login:", error);
    });

    this.renderSavedProfiles();

    // Trigger aggressive parallel fetches
    if (activePubkey) {
      if (this.services.userBlocks) {
        this.services.userBlocks.loadBlocks(activePubkey).catch(noop);
      }
      if (this.subscriptionsService) {
        this.subscriptionsService
          .loadSubscriptions(activePubkey, { allowPermissionPrompt: false })
          .catch(noop);
      }
    }

    this.populateBlockedList();
    void this.populateSubscriptionsList();
    void this.populateFriendsList();
    this.populateProfileRelays();
    this.refreshWalletPaneState();
    this.populateHashtagPreferences();
    this.handleActiveDmIdentityChanged(activePubkey);
    void this.refreshDmRelayPreferences({ force: true });

    // Ensure critical state is settled if possible, but don't block initial rendering
    Promise.all([walletPromise, adminPromise, postLoginPromise])
      .then(() => {
        // Re-run population to ensure any late-arriving data is reflected
        this.populateBlockedList();
        void this.populateSubscriptionsList();
        void this.populateFriendsList();
        this.populateProfileRelays();
        this.refreshWalletPaneState();
        this.populateHashtagPreferences();
        void this.refreshDmRelayPreferences({ force: true });
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

    if (
      this.subscriptionsService &&
      typeof this.subscriptionsService.reset === "function"
    ) {
      try {
        this.subscriptionsService.reset();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to reset subscriptions service on logout:",
          error,
        );
      }
    }

    this.populateBlockedList();
    this.clearSubscriptionsList();
    this.clearFriendsList();
    this.populateProfileRelays();
    this.refreshWalletPaneState();
    this.populateHashtagPreferences();
    this.clearHashtagInputs();
    this.setHashtagStatus("", "muted");
    this.handleActiveDmIdentityChanged(null);
    this.setMessagesUnreadIndicator(false);
    this.populateDmRelayPreferences();
    this.setDmRelayPreferencesStatus("");

    return true;
  }

  handleProfileUpdated(detail = {}) {
    const previousActive = this.normalizeHexPubkey(this.getActivePubkey());

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
    void this.populateSubscriptionsList();

    const nextActive = this.normalizeHexPubkey(this.getActivePubkey());
    if (previousActive !== nextActive) {
      this.handleActiveDmIdentityChanged(nextActive);
    }
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
    const service = this.services.nwcSettings;
    const hydrate = service?.hydrateNwcSettingsForPubkey;
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
      return await hydrate.call(service, normalized);
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
