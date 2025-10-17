import {
  loadNwcSettings,
  saveNwcSettings,
  clearNwcSettings,
  createDefaultNwcSettings,
} from "../nwcSettings.js";
import { MAX_WALLET_DEFAULT_ZAP } from "../config.js";
import { devLogger, userLogger } from "../utils/logger.js";

const NWC_URI_SCHEME = "nostr+walletconnect://";

function isFunction(value) {
  return typeof value === "function";
}

export default class NwcSettingsService {
  constructor({
    normalizeHexPubkey,
    getActivePubkey,
    payments = null,
    logger = { dev: devLogger, user: userLogger },
    notifyError,
    maxWalletDefaultZap = MAX_WALLET_DEFAULT_ZAP,
    loadSettings = loadNwcSettings,
    saveSettings = saveNwcSettings,
    clearSettings = clearNwcSettings,
    createDefaultSettings = createDefaultNwcSettings,
  } = {}) {
    this.normalizeHexPubkey = isFunction(normalizeHexPubkey)
      ? normalizeHexPubkey
      : (value) => (typeof value === "string" ? value.trim() : null);
    this.getActivePubkey = isFunction(getActivePubkey)
      ? getActivePubkey
      : () => null;
    this.payments = payments || null;
    const devChannel = logger?.dev && typeof logger.dev.warn === "function" ? logger.dev : devLogger;
    const userChannel = logger?.user && typeof logger.user.warn === "function" ? logger.user : userLogger;
    this.logger = { dev: devChannel, user: userChannel };
    this.notifyError = isFunction(notifyError) ? notifyError : null;
    this.maxWalletDefaultZap =
      Number.isFinite(maxWalletDefaultZap) && maxWalletDefaultZap > 0
        ? maxWalletDefaultZap
        : MAX_WALLET_DEFAULT_ZAP;
    this.loadSettings = isFunction(loadSettings)
      ? loadSettings
      : loadNwcSettings;
    this.saveSettings = isFunction(saveSettings)
      ? saveSettings
      : saveNwcSettings;
    this.clearSettings = isFunction(clearSettings)
      ? clearSettings
      : clearNwcSettings;
    this.createDefaultSettings = isFunction(createDefaultSettings)
      ? createDefaultSettings
      : () => createDefaultNwcSettings();
    this.cache = new Map();
  }

  cloneSettings(settings) {
    if (!settings || typeof settings !== "object") {
      return this.createDefaultNwcSettings();
    }
    return { ...settings };
  }

  setPayments(payments) {
    this.payments = payments || null;
  }

  setActivePubkeyGetter(fn) {
    if (isFunction(fn)) {
      this.getActivePubkey = fn;
    }
  }

  clearCache() {
    this.cache.clear();
  }

  getNormalizedPubkey(pubkey) {
    try {
      return this.normalizeHexPubkey(pubkey);
    } catch (error) {
      if (isFunction(this.logger.user?.warn)) {
        this.logger.user.warn("[nwcSettings] Failed to normalize pubkey:", error);
      }
      return null;
    }
  }

  async hydrateNwcSettingsForPubkey(pubkey) {
    const normalized = this.getNormalizedPubkey(pubkey);
    if (!normalized) {
      return this.createDefaultNwcSettings();
    }

    try {
      const settings = await this.loadSettings(normalized);
      const record =
        settings && typeof settings === "object"
          ? { ...settings }
          : this.createDefaultNwcSettings();
      this.cache.set(normalized, record);
      return this.cloneSettings(record);
    } catch (error) {
      if (isFunction(this.logger.user?.warn)) {
        this.logger.user.warn(
          `[nwcSettings] Failed to load settings for ${normalized}:`,
          error,
        );
      }
      const fallback = this.createDefaultNwcSettings();
      this.cache.set(normalized, fallback);
      return this.cloneSettings(fallback);
    }
  }

  getActiveNwcSettings() {
    const normalized = this.getNormalizedPubkey(this.getActivePubkey());
    if (!normalized) {
      return this.createDefaultNwcSettings();
    }
    const cached = this.cache.get(normalized);
    return cached ? this.cloneSettings(cached) : this.createDefaultNwcSettings();
  }

  createDefaultNwcSettings() {
    return this.createDefaultSettings();
  }

  hasActiveWalletConnection() {
    const settings = this.getActiveNwcSettings();
    const candidate =
      typeof settings?.nwcUri === "string" ? settings.nwcUri.trim() : "";
    return candidate.length > 0;
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

  async updateActiveNwcSettings(partial = {}) {
    const normalized = this.getNormalizedPubkey(this.getActivePubkey());
    if (!normalized) {
      if (isFunction(this.logger.user?.warn)) {
        this.logger.user.warn(
          "[nwcSettings] Cannot update settings without an active pubkey.",
        );
      }
      return this.createDefaultNwcSettings();
    }

    try {
      const updated = await this.saveSettings(normalized, partial);
      const record =
        updated && typeof updated === "object"
          ? { ...updated }
          : this.createDefaultNwcSettings();
      this.cache.set(normalized, record);
      return this.cloneSettings(record);
    } catch (error) {
      if (isFunction(this.logger.user?.warn)) {
        this.logger.user.warn(
          `[nwcSettings] Failed to save settings for ${normalized}:`,
          error,
        );
      }
      return this.getActiveNwcSettings();
    }
  }

  async handleProfileWalletPersist({
    nwcUri,
    defaultZap,
    lastChecked,
  } = {}) {
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
      return this.getActiveNwcSettings();
    }

    return this.updateActiveNwcSettings(partial);
  }

  async ensureWallet({ nwcUri, defaultZap } = {}) {
    const activeSettings = this.getActiveNwcSettings();
    const candidateUri =
      typeof nwcUri === "string" && nwcUri.trim()
        ? nwcUri.trim()
        : activeSettings.nwcUri || "";
    const { valid, sanitized, message } = this.validateWalletUri(candidateUri, {
      requireValue: true,
    });
    if (!valid) {
      throw new Error(message || "Invalid wallet URI provided.");
    }

    const merged = {
      ...activeSettings,
      nwcUri: sanitized,
    };

    if (typeof defaultZap === "number" && Number.isFinite(defaultZap)) {
      const rounded = Math.max(0, Math.round(defaultZap));
      merged.defaultZap = Math.min(this.maxWalletDefaultZap, rounded);
    } else if (defaultZap === null) {
      merged.defaultZap = null;
    }

    if (this.payments && isFunction(this.payments.ensureWallet)) {
      return this.payments.ensureWallet({ settings: merged });
    }

    if (isFunction(this.logger.dev?.warn)) {
      this.logger.dev.warn(
        "[wallet] Falling back to stub ensureWallet implementation. Returning settings without performing a connection test.",
      );
    }
    return merged;
  }

  async clearStoredNwcSettings(pubkey, { silent = false } = {}) {
    const normalized = this.getNormalizedPubkey(pubkey);
    if (!normalized) {
      return false;
    }

    try {
      await this.clearSettings(normalized);
    } catch (error) {
      if (isFunction(this.logger.user?.warn)) {
        this.logger.user.warn(
          `[nwcSettings] Failed to clear settings for ${normalized}:`,
          error,
        );
      }
      if (!silent && this.notifyError) {
        this.notifyError("Failed to clear wallet settings for this account.");
      }
      try {
        await this.saveSettings(normalized, this.createDefaultNwcSettings());
      } catch (persistError) {
        if (isFunction(this.logger.user?.warn)) {
          this.logger.user.warn(
            `[nwcSettings] Failed to overwrite settings for ${normalized}:`,
            persistError,
          );
        }
      }
      this.cache.delete(normalized);
      return false;
    }

    this.cache.delete(normalized);
    return true;
  }

  async onLogin({ pubkey, previousPubkey, identityChanged } = {}) {
    if (identityChanged) {
      this.onIdentityChanged();
    }

    const normalizedActive = this.getNormalizedPubkey(
      pubkey !== undefined ? pubkey : this.getActivePubkey(),
    );
    const normalizedPrevious = this.getNormalizedPubkey(previousPubkey);

    if (
      normalizedPrevious &&
      (!normalizedActive || normalizedPrevious !== normalizedActive)
    ) {
      await this.clearStoredNwcSettings(normalizedPrevious, { silent: true });
    }

    if (normalizedActive) {
      await this.hydrateNwcSettingsForPubkey(normalizedActive);
    }

    return this.getActiveNwcSettings();
  }

  async onLogout({ pubkey, previousPubkey } = {}) {
    const normalizedPrevious = this.getNormalizedPubkey(
      previousPubkey !== undefined ? previousPubkey : pubkey,
    );
    if (normalizedPrevious) {
      await this.clearStoredNwcSettings(normalizedPrevious, { silent: false });
    }
    this.clearCache();
    return this.createDefaultNwcSettings();
  }

  onIdentityChanged() {
    this.clearCache();
  }
}
