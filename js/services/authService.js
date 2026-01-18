// js/services/authService.js

import {
  setPubkey,
  setCurrentUserNpub,
  getPubkey,
  getCurrentUserNpub,
} from "../state/appState.js";
import { userLogger } from "../utils/logger.js";
import { requestDefaultExtensionPermissions } from "../nostr/defaultClient.js";
import {
  getSavedProfiles,
  getActiveProfilePubkey,
  setActiveProfilePubkey,
  mutateSavedProfiles,
  persistSavedProfiles,
  loadSavedProfilesFromStorage as hydrateSavedProfilesFromStorage,
  syncSavedProfileFromCache as syncSavedProfileFromCacheState,
  loadProfileCacheFromStorage as hydrateProfileCacheFromStorage,
  persistProfileCacheToStorage as persistProfileCacheState,
  getProfileCacheEntry as getCachedProfileEntry,
  setProfileCacheEntry as setCachedProfileEntry,
  resetModerationSettings,
} from "../state/cache.js";
import { profileCache } from "../state/profileCache.js";
import getDefaultAuthProvider, {
  providers as defaultAuthProviders,
} from "./authProviders/index.js";

class SimpleEventEmitter {
  constructor(logger = null) {
    this.logger = typeof logger === "function" ? logger : null;
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    const handlers = this.listeners.get(eventName);
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        if (this.logger) {
          this.logger(`AuthService listener for "${eventName}" threw`, error);
        }
      }
    }
  }
}

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const FALLBACK_PROFILE = {
  name: "Unknown",
  picture: "assets/svg/default-profile.svg",
  about: "",
  website: "",
  banner: "",
  lud16: "",
  lud06: "",
};

const FAST_PROFILE_RELAY_LIMIT = 3;
const FAST_PROFILE_TIMEOUT_MS = 2500;
const BACKGROUND_PROFILE_TIMEOUT_MS = 6000;

export default class AuthService {
  constructor({
    nostrClient,
    userBlocks,
    relayManager,
    logger,
    accessControl,
    authProviders,
    getAuthProvider,
  } = {}) {
    this.nostrClient = nostrClient || null;
    this.userBlocks = userBlocks || null;
    this.relayManager = relayManager || null;
    this.accessControl = accessControl || null;
    this.authProviders =
      authProviders && typeof authProviders === "object"
        ? authProviders
        : defaultAuthProviders;

    if (typeof logger === "function") {
      this.logger = logger;
    } else if (logger && typeof logger.log === "function") {
      this.logger = (...args) => logger.log(...args);
    } else {
      this.logger = () => {};
    }

    this.emitter = new SimpleEventEmitter((message, error) => {
      try {
        this.logger(message, error);
      } catch (logError) {
        userLogger.warn("[AuthService] logger threw", logError);
      }
    });

    if (typeof getAuthProvider === "function") {
      this.resolveAuthProvider = (providerId) => {
        const normalizedId = this.normalizeProviderId(providerId);
        const provider = getAuthProvider(normalizedId);
        if (!provider || typeof provider.login !== "function") {
          const error = new Error(`Unknown auth provider: ${normalizedId}`);
          error.code = "unknown-auth-provider";
          throw error;
        }
        return provider;
      };
    } else {
      this.resolveAuthProvider = (providerId) => {
        const normalizedId = this.normalizeProviderId(providerId);
        const registry = this.authProviders || defaultAuthProviders;
        const provider =
          registry && typeof registry === "object"
            ? registry[normalizedId]
            : null;

        if (provider && typeof provider.login === "function") {
          return provider;
        }

        return getDefaultAuthProvider(normalizedId);
      };
    }
  }

  normalizeProviderId(providerId) {
    return typeof providerId === "string" && providerId.trim()
      ? providerId.trim()
      : "nip07";
  }

  normalizeAuthType(authTypeCandidate, providerId, providerResult) {
    const candidates = [];

    if (typeof authTypeCandidate === "string") {
      candidates.push(authTypeCandidate);
    }

    if (providerResult && typeof providerResult === "object") {
      const resultAuthType = providerResult.authType;
      if (typeof resultAuthType === "string") {
        candidates.push(resultAuthType);
      }

      const resultProviderId = providerResult.providerId;
      if (typeof resultProviderId === "string") {
        candidates.push(resultProviderId);
      }
    }

    if (typeof providerId === "string") {
      candidates.push(providerId);
    }

    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return "nip07";
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (error) {
      userLogger.warn("[AuthService] logger threw", error);
    }
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  emit(eventName, detail) {
    this.emitter.emit(eventName, detail);
  }

  hydrateFromStorage() {
    hydrateProfileCacheFromStorage();
    const { profiles, hasExplicitActiveProfile } = hydrateSavedProfilesFromStorage();
    if (
      !getActiveProfilePubkey() &&
      !hasExplicitActiveProfile &&
      Array.isArray(profiles) &&
      profiles.length
    ) {
      const first = profiles[0]?.pubkey || null;
      if (first) {
        setActiveProfilePubkey(first, { persist: true });
      }
    }
    this.emitProfileList("hydrate");
  }

  persistProfileCache() {
    persistProfileCacheState();
  }

  getProfileCacheEntry(pubkey) {
    return getCachedProfileEntry(pubkey);
  }

  setProfileCacheEntry(pubkey, profile, { persist = true, reason = "manual" } = {}) {
    const entry = setCachedProfileEntry(pubkey, profile, { persist });
    if (entry) {
      const normalized = this.normalizeHexPubkey(pubkey);
      if (normalized) {
        const updated = syncSavedProfileFromCacheState(normalized, {
          persist,
        });
        if (updated) {
          this.emitProfileList("cache-sync");
        }
        this.emit("profile:updated", {
          pubkey: normalized,
          profile: entry.profile || FALLBACK_PROFILE,
          reason,
          savedProfiles: this.cloneSavedProfiles(),
          activeProfilePubkey: getActiveProfilePubkey(),
        });
      }
    }
    return entry;
  }

  cloneSavedProfiles() {
    const saved = getSavedProfiles();
    return Array.isArray(saved) ? saved.map((entry) => ({ ...entry })) : [];
  }

  emitProfileList(reason = "update") {
    this.emit("profile:updated", {
      reason,
      savedProfiles: this.cloneSavedProfiles(),
      activeProfilePubkey: getActiveProfilePubkey(),
    });
  }

  safeEncodeNpub(pubkey) {
    if (typeof pubkey !== "string") {
      return null;
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith("npub1")) {
      return trimmed;
    }

    try {
      return window?.NostrTools?.nip19?.npubEncode(trimmed) || null;
    } catch (error) {
      return null;
    }
  }

  safeDecodeNpub(npub) {
    if (typeof npub !== "string") {
      return null;
    }

    const trimmed = npub.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const decoded = window?.NostrTools?.nip19?.decode(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  normalizeHexPubkey(pubkey) {
    if (typeof pubkey !== "string") {
      return null;
    }

    const trimmed = pubkey.trim();
    if (!trimmed) {
      return null;
    }

    if (HEX64_REGEX.test(trimmed)) {
      return trimmed.toLowerCase();
    }

    if (trimmed.startsWith("npub1")) {
      const decoded = this.safeDecodeNpub(trimmed);
      if (decoded && HEX64_REGEX.test(decoded)) {
        return decoded.toLowerCase();
      }
    }

    return null;
  }

  async requestLogin(rawOptions = {}) {
    const normalizedOptions =
      rawOptions && typeof rawOptions === "object" ? { ...rawOptions } : {};
    const {
      providerId: requestedProviderId = "nip07",
      persistActive,
      autoApply,
      ...providerOptions
    } = normalizedOptions;

    const providerId = this.normalizeProviderId(requestedProviderId);
    const provider = this.resolveAuthProvider(providerId);
    const providerResult = await provider.login({
      nostrClient: this.nostrClient,
      options: providerOptions,
    });

    const rawPubkey =
      providerResult && typeof providerResult === "object"
        ? providerResult.pubkey
        : providerResult;
    const pubkey =
      typeof rawPubkey === "string"
        ? rawPubkey
        : providerResult && typeof providerResult === "object"
        ? providerResult.publicKey || ""
        : "";

    const authTypeCandidate =
      providerResult && typeof providerResult === "object"
        ? providerResult.authType
        : null;
    const authType = this.normalizeAuthType(
      authTypeCandidate,
      providerId,
      providerResult,
    );
    const signer =
      providerResult && typeof providerResult === "object"
        ? providerResult.signer || null
        : null;
    const detailAuthType =
      typeof authType === "string" && authType.trim() ? authType.trim() : "nip07";

    if (authType === "nip07") {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        const error = new Error(
          "The NIP-07 extension denied the permission request required to finish logging in.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult.error;
        throw error;
      }
    }

    const trimmed = typeof pubkey === "string" ? pubkey.trim() : "";
    if (!trimmed) {
      return { pubkey: null, providerId, authType: detailAuthType, signer };
    }

    if (autoApply === false) {
      return { pubkey: trimmed, providerId, authType: detailAuthType, signer };
    }

    const detail = await this.login(trimmed, {
      persistActive: persistActive !== false,
      providerId,
      authType: detailAuthType,
      signer,
      providerResult,
    });

    return {
      pubkey: trimmed,
      detail,
      providerId,
      authType: detailAuthType,
      signer,
    };
  }

  async handleUploadSubmit(payload, { publish } = {}) {
    if (!this.getActivePubkey()) {
      await this.requestLogin({ allowAccountSelection: true });
      if (!this.getActivePubkey()) {
        throw new Error("Login required to publish videos.");
      }
    }

    if (typeof publish !== "function") {
      throw new Error("A publish callback must be provided to handleUploadSubmit.");
    }

    return publish(payload);
  }

  getActivePubkey() {
    return getPubkey();
  }

  async login(pubkey, options = {}) {
    const normalizedOptions =
      options && typeof options === "object" ? { ...options } : {};
    const persistActive =
      normalizedOptions.persistActive === false ? false : true;
    const providerId = this.normalizeProviderId(normalizedOptions.providerId);
    const providerResult = Object.prototype.hasOwnProperty.call(
      normalizedOptions,
      "providerResult",
    )
      ? normalizedOptions.providerResult ?? null
      : null;
    const authTypeCandidate =
      typeof normalizedOptions.authType === "string"
        ? normalizedOptions.authType
        : null;
    const authType = this.normalizeAuthType(
      authTypeCandidate,
      providerId,
      providerResult,
    );
    const signer = Object.prototype.hasOwnProperty.call(normalizedOptions, "signer")
      ? normalizedOptions.signer ?? null
      : null;

    const previousPubkey = this.normalizeHexPubkey(getPubkey()) || getPubkey();
    const normalized = this.normalizeHexPubkey(pubkey);
    const trimmed = typeof pubkey === "string" ? pubkey.trim() : "";
    const nextPubkey = normalized || trimmed || null;
    if (!nextPubkey) {
      throw new Error("A valid pubkey is required for login.");
    }

    const identityChanged = previousPubkey !== nextPubkey;

    const control = this.accessControl;
    const candidateNpub = this.safeEncodeNpub(nextPubkey) || null;
    let lockdownActive = false;
    if (control && typeof control.isLockdownActive === "function") {
      try {
        lockdownActive = control.isLockdownActive();
      } catch (error) {
        this.log("[AuthService] accessControl.isLockdownActive threw", error);
        lockdownActive = Boolean(lockdownActive);
      }
    }

    if (lockdownActive) {
      let isAdminCandidate = false;
      const adminCheckValue =
        candidateNpub || (typeof trimmed === "string" && trimmed ? trimmed : null);
      if (adminCheckValue && typeof control?.isAdminEditor === "function") {
        try {
          isAdminCandidate = !!control.isAdminEditor(adminCheckValue);
        } catch (error) {
          this.log("[AuthService] accessControl.isAdminEditor threw", error);
          isAdminCandidate = false;
        }
      }

      if (!isAdminCandidate) {
        const lockdownError = new Error(
          "This site is temporarily locked down. Only administrators may sign in right now.",
        );
        lockdownError.code = "site-lockdown";
        lockdownError.npub = candidateNpub || adminCheckValue;
        throw lockdownError;
      }
    }

    if (control && typeof control.canAccess === "function") {
      let canAccess = true;
      try {
        canAccess = control.canAccess(candidateNpub || nextPubkey);
      } catch (error) {
        this.log("[AuthService] accessControl.canAccess threw", error);
        canAccess = Boolean(canAccess);
      }

      if (!canAccess) {
        let isBlocked = false;
        if (typeof control.isBlacklisted === "function") {
          try {
            isBlocked = control.isBlacklisted(candidateNpub || nextPubkey);
          } catch (error) {
            this.log("[AuthService] accessControl.isBlacklisted threw", error);
            isBlocked = false;
          }
        }

        const accessError = new Error(
          isBlocked
            ? "Your account has been blocked on this platform."
            : "Access restricted to admins and moderators users only.",
        );
        throw accessError;
      }
    }

    if (normalized) {
      setPubkey(normalized);
      if (this.nostrClient && typeof this.nostrClient === "object") {
        this.nostrClient.pubkey = normalized;
      }
      profileCache.setActiveProfile(normalized);
    } else {
      setPubkey(nextPubkey);
      if (this.nostrClient && typeof this.nostrClient === "object") {
        this.nostrClient.pubkey = trimmed ? trimmed.toLowerCase() : "";
      }
      profileCache.setActiveProfile(trimmed ? trimmed.toLowerCase() : null);
    }

    const npub = candidateNpub;
    setCurrentUserNpub(npub);

    let savedProfilesMutated = false;
    const entryAuthType = this.normalizeAuthType(
      authType,
      providerId,
      providerResult,
    );

    const entryProviderId = this.normalizeProviderId(providerId) || entryAuthType;

    mutateSavedProfiles((profiles) => {
      const draft = Array.isArray(profiles) ? profiles.slice() : [];
      const existingIndex = draft.findIndex((entry) => {
        const normalizedEntry = this.normalizeHexPubkey(entry?.pubkey);
        return normalizedEntry && normalizedEntry === normalized;
      });

      const cacheEntry = this.getProfileCacheEntry(normalized || nextPubkey);
      const cachedProfile = cacheEntry?.profile || {};

      const nextEntry = {
        pubkey: normalized || nextPubkey,
        npub: npub || (cachedProfile.npub ?? null),
        name: cachedProfile.name || draft[existingIndex]?.name || "",
        picture: cachedProfile.picture || draft[existingIndex]?.picture || "",
        authType: entryAuthType,
        providerId: entryProviderId,
      };

      if (existingIndex >= 0) {
        const currentEntry = draft[existingIndex] || {};
        const changed =
          currentEntry.npub !== nextEntry.npub ||
          currentEntry.name !== nextEntry.name ||
          currentEntry.picture !== nextEntry.picture ||
          currentEntry.authType !== nextEntry.authType ||
          currentEntry.providerId !== nextEntry.providerId;
        if (changed) {
          draft[existingIndex] = nextEntry;
          savedProfilesMutated = true;
        }
      } else {
        draft.push(nextEntry);
        savedProfilesMutated = true;
      }

      return draft;
    }, { persist: false, persistActive: false });

    if (persistActive) {
      setActiveProfilePubkey(normalized || nextPubkey, { persist: true });
    }

    if (!persistActive && savedProfilesMutated) {
      persistSavedProfiles({ persistActive: false });
    } else if (persistActive || savedProfilesMutated) {
      persistSavedProfiles({ persistActive: true });
    }

    if (savedProfilesMutated) {
      this.emitProfileList("login");
    }

    const activeLoginPubkey = getPubkey();
    const normalizedLoginPubkey =
      this.normalizeHexPubkey(activeLoginPubkey) || activeLoginPubkey || null;

    const detail = {
      pubkey: activeLoginPubkey,
      npub: getCurrentUserNpub(),
      previousPubkey: previousPubkey || null,
      identityChanged,
      savedProfiles: this.cloneSavedProfiles(),
      activeProfilePubkey: getActiveProfilePubkey(),
      providerId,
      authType: entryAuthType,
      signer,
      providerResult,
      postLogin: {
        pubkey: normalizedLoginPubkey,
        blocksLoaded: false,
        relaysLoaded: false,
        profile: null,
      },
      postLoginPromise: null,
      postLoginError: null,
    };

    const postLoginPromise = Promise.resolve()
      .then(() => this.applyPostLoginState())
      .then((postLogin) => {
        detail.postLogin = postLogin;
        detail.postLoginError = null;

        try {
          this.emitProfileList("post-login");
        } catch (error) {
          this.log("[AuthService] Failed to emit profile list after login", error);
        }

        this.emit("auth:post-login", {
          ...detail,
          postLogin,
          postLoginError: null,
          savedProfiles: this.cloneSavedProfiles(),
          activeProfilePubkey: getActiveProfilePubkey(),
        });

        return postLogin;
      })
      .catch((error) => {
        this.log("[AuthService] applyPostLoginState failed", error);
        detail.postLoginError = error;

        this.emit("auth:post-login", {
          ...detail,
          postLogin: detail.postLogin,
          postLoginError: error,
          savedProfiles: this.cloneSavedProfiles(),
          activeProfilePubkey: getActiveProfilePubkey(),
        });

        return null;
      });

    detail.postLoginPromise = postLoginPromise;

    try {
      Object.defineProperty(detail, "__handled", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: false,
      });
    } catch (error) {
      // Ignore descriptor errors (e.g., frozen objects) and fall back to direct assignment.
      detail.__handled = false;
    }

    this.emit("auth:login", detail);
    return detail;
  }

  async applyPostLoginState() {
    const activePubkey = this.normalizeHexPubkey(getPubkey()) || getPubkey();
    const detail = {
      pubkey: activePubkey || null,
      blocksLoaded: false,
      relaysLoaded: false,
      profile: null,
    };

    if (!activePubkey) {
      return detail;
    }

    const schedule = (callback) => Promise.resolve().then(() => callback());

    const operations = [];

    if (this.userBlocks && typeof this.userBlocks.loadBlocks === "function") {
      operations.push({
        name: "blocksLoaded",
        promise: schedule(() => this.userBlocks.loadBlocks(activePubkey)),
        onFulfilled: () => true,
        onRejected: (error) => {
          this.log("[AuthService] Failed to load block list", error);
          return false;
        },
      });
    }

    if (this.relayManager && typeof this.relayManager.loadRelayList === "function") {
      operations.push({
        name: "relaysLoaded",
        promise: schedule(() => this.relayManager.loadRelayList(activePubkey)),
        onFulfilled: () => true,
        onRejected: (error) => {
          this.log("[AuthService] Failed to load relay list", error);
          return false;
        },
      });
    }

    operations.push({
      name: "profile",
      promise: schedule(() => this.loadOwnProfile(activePubkey)),
      onFulfilled: (value) => value,
      onRejected: (error) => {
        this.log("[AuthService] Failed to load own profile", error);
        return null;
      },
    });

    const settled = await Promise.allSettled(
      operations.map((operation) => operation.promise)
    );

    settled.forEach((result, index) => {
      const operation = operations[index];
      if (!operation) {
        return;
      }

      if (result.status === "fulfilled") {
        detail[operation.name] = operation.onFulfilled(result.value);
      } else {
        detail[operation.name] = operation.onRejected(result.reason);
      }
    });

    return detail;
  }

  async logout() {
    if (this.nostrClient && typeof this.nostrClient.logout === "function") {
      try {
        this.nostrClient.logout();
      } catch (error) {
        this.log("[AuthService] nostrClient.logout threw", error);
      }
    }

    const previousPubkey = this.normalizeHexPubkey(getPubkey()) || getPubkey();

    setPubkey(null);
    setCurrentUserNpub(null);
    setActiveProfilePubkey(null, { persist: true });

    try {
      resetModerationSettings({ persist: true });
    } catch (error) {
      this.log(
        "[AuthService] Failed to reset moderation settings on logout",
        error,
      );
    }

    if (this.userBlocks && typeof this.userBlocks.reset === "function") {
      try {
        this.userBlocks.reset();
      } catch (error) {
        this.log("[AuthService] userBlocks.reset threw", error);
      }
    }

    if (this.relayManager && typeof this.relayManager.reset === "function") {
      try {
        this.relayManager.reset();
      } catch (error) {
        this.log("[AuthService] relayManager.reset threw", error);
      }
    }

    persistSavedProfiles({ persistActive: true });

    const detail = {
      previousPubkey: previousPubkey || null,
      savedProfiles: this.cloneSavedProfiles(),
      activeProfilePubkey: getActiveProfilePubkey(),
    };

    this.emit("auth:logout", detail);
    return detail;
  }

  removeSavedProfile(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey) ||
      (typeof pubkey === "string" ? pubkey.trim() : "");
    if (!normalized) {
      return { removed: false };
    }

    const { changed } = mutateSavedProfiles((profiles) =>
      profiles.filter((entry) => entry?.pubkey !== normalized),
    {
      persist: true,
      persistActive: true,
    });

    if (changed && getActiveProfilePubkey() === normalized) {
      setActiveProfilePubkey(null, { persist: true });
    }

    if (changed) {
      this.emitProfileList("remove-saved-profile");
    }

    return { removed: changed };
  }

  async switchProfile(pubkey, options = {}) {
    const normalizedTarget = this.normalizeHexPubkey(pubkey);
    if (!normalizedTarget) {
      throw new Error("Unable to switch profiles: invalid account.");
    }

    const normalizedOptions =
      options && typeof options === "object" ? { ...options } : {};
    const providerId = this.normalizeProviderId(normalizedOptions.providerId);

    const normalizedActive = this.normalizeHexPubkey(getActiveProfilePubkey());
    if (normalizedActive && normalizedActive === normalizedTarget) {
      return { switched: false, reason: "already-active" };
    }

    const requestOptions = {
      allowAccountSelection: true,
      expectPubkey: normalizedTarget,
      persistActive: true,
      ...(providerId ? { providerId } : {}),
    };
    const autoApply = requestOptions.autoApply !== false;

    let requestResult;
    try {
      requestResult = await this.requestLogin(requestOptions);
    } catch (error) {
      throw error;
    }

    const requestedPubkey =
      this.normalizeHexPubkey(requestResult?.pubkey) ||
      (typeof requestResult?.pubkey === "string"
        ? requestResult.pubkey.trim()
        : "");

    let detail = requestResult?.detail || null;

    if (!detail && !autoApply) {
      const fallbackTarget =
        this.normalizeHexPubkey(requestedPubkey) || requestedPubkey || normalizedTarget;
      detail = await this.login(fallbackTarget, {
        persistActive: true,
        providerId,
      });
    }

    mutateSavedProfiles((profiles) => {
      const draft = profiles.slice();
      const index = draft.findIndex(
        (entry) => this.normalizeHexPubkey(entry?.pubkey) === normalizedTarget
      );
      if (index > 0) {
        const [moved] = draft.splice(index, 1);
        draft.unshift(moved);
      }
      return draft;
    }, { persist: true, persistActive: true });

    const savedProfiles = this.cloneSavedProfiles();
    const activeProfilePubkey = getActiveProfilePubkey();

    if (detail && typeof detail === "object") {
      detail.savedProfiles = savedProfiles;
      detail.activeProfilePubkey = activeProfilePubkey;
    }

    this.emitProfileList("switch-profile");

    return { switched: true, detail };
  }

  async loadOwnProfile(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey) ||
      (typeof pubkey === "string" ? pubkey.trim() : "");
    if (!normalized) {
      return FALLBACK_PROFILE;
    }

    if (!this.nostrClient?.pool || !Array.isArray(this.nostrClient?.relays)) {
      return FALLBACK_PROFILE;
    }

    const relays = Array.isArray(this.nostrClient.relays)
      ? this.nostrClient.relays.filter((url) => typeof url === "string" && url)
      : [];

    if (!relays.length) {
      this.setProfileCacheEntry(normalized, FALLBACK_PROFILE, {
        persist: true,
        reason: "load-own-profile:fallback",
      });
      return FALLBACK_PROFILE;
    }

    const filter = [{ kinds: [0], authors: [normalized], limit: 1 }];

    const selectNewestEvent = (eventList) => {
      if (!Array.isArray(eventList) || !eventList.length) {
        return null;
      }
      const sorted = eventList
        .filter((event) => event && event.pubkey === normalized)
        .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));
      return sorted.length ? sorted[0] : null;
    };

    const buildProfileFromEvent = (event) => {
      if (!event?.content) {
        return FALLBACK_PROFILE;
      }
      try {
        const data = JSON.parse(event.content);
        return {
          name: data.display_name || data.name || FALLBACK_PROFILE.name,
          picture: data.picture || FALLBACK_PROFILE.picture,
          about: typeof data.about === "string" ? data.about : FALLBACK_PROFILE.about,
          website:
            typeof data.website === "string" ? data.website : FALLBACK_PROFILE.website,
          banner:
            typeof data.banner === "string" ? data.banner : FALLBACK_PROFILE.banner,
          lud16: typeof data.lud16 === "string" ? data.lud16 : FALLBACK_PROFILE.lud16,
          lud06: typeof data.lud06 === "string" ? data.lud06 : FALLBACK_PROFILE.lud06,
        };
      } catch (error) {
        this.log("[AuthService] Failed to parse profile metadata", error);
        return FALLBACK_PROFILE;
      }
    };

    const fetchFromRelay = (relayUrl, timeoutMs, requireEvent) => {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          const timeoutError = new Error(
            `Timed out fetching profile from ${relayUrl} after ${timeoutMs}ms`
          );
          timeoutError.code = "timeout";
          timeoutError.relay = relayUrl;
          timeoutError.timeoutMs = timeoutMs;
          reject(timeoutError);
        }, timeoutMs);

        Promise.resolve()
          .then(() => this.nostrClient.pool.list([relayUrl], filter))
          .then((result) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            const events = Array.isArray(result)
              ? result.filter((event) => event && event.pubkey === normalized)
              : [];
            if (requireEvent && !events.length) {
              const emptyError = new Error(
                `No profile events returned from ${relayUrl}`
              );
              emptyError.code = "empty";
              emptyError.relay = relayUrl;
              reject(emptyError);
              return;
            }
            resolve({ relayUrl, events });
          })
          .catch((error) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);
            const wrapped =
              error instanceof Error ? error : new Error(String(error));
            wrapped.relay = relayUrl;
            reject(wrapped);
          });
      });
    };

    const fastRelays = relays.slice(0, FAST_PROFILE_RELAY_LIMIT);
    const backgroundRelays = relays.slice(fastRelays.length);

    const fastPromises = fastRelays.map((relayUrl) =>
      fetchFromRelay(relayUrl, FAST_PROFILE_TIMEOUT_MS, true)
    );
    const backgroundPromises = backgroundRelays.map((relayUrl) =>
      fetchFromRelay(relayUrl, BACKGROUND_PROFILE_TIMEOUT_MS, false)
    );

    const background = Promise.allSettled([
      ...fastPromises,
      ...backgroundPromises,
    ])
      .then((outcomes) => {
        const aggregated = [];
        outcomes.forEach((outcome) => {
          if (outcome.status === "fulfilled") {
            const events = Array.isArray(outcome.value?.events)
              ? outcome.value.events
              : [];
            if (events.length) {
              aggregated.push(...events);
            }
          } else if (outcome.status === "rejected") {
            const reason = outcome.reason;
            if (reason?.code === "timeout") {
              this.log(
                `[AuthService] Relay ${reason.relay} timed out loading profile (background)`
              );
            } else {
              this.log(
                `[AuthService] Relay ${reason?.relay || "unknown"} failed loading profile (background)`,
                reason
              );
            }
          }
        });

        const newest = selectNewestEvent(aggregated);
        if (newest && this.nostrClient && typeof this.nostrClient.handleEvent === "function") {
          this.nostrClient.handleEvent(newest);
        }
      })
      .catch((error) => {
        this.log("[AuthService] Background profile refresh failed", error);
      });

    let fastResult = null;
    if (fastPromises.length) {
      try {
        fastResult = await Promise.any(fastPromises);
      } catch (error) {
        if (error instanceof AggregateError) {
          error.errors?.forEach((err) => {
            if (err?.code === "timeout") {
              this.log(
                `[AuthService] Relay ${err.relay} timed out loading profile`
              );
            }
          });
        } else {
          this.log("[AuthService] Failed to load profile from fast relays", error);
        }
      }
    }

    if (fastResult?.events?.length) {
      const newest = selectNewestEvent(fastResult.events);
      if (newest) {
        if (this.nostrClient && typeof this.nostrClient.handleEvent === "function") {
          this.nostrClient.handleEvent(newest);
        }
        const profile = buildProfileFromEvent(newest);
        // setProfileCacheEntry now delegates to profileCache.setProfile, but handleEvent also does it.
        // Doing it here returns the profile object which might be needed immediately.
        background.catch(() => {});
        return profile;
      }
    }

    this.setProfileCacheEntry(normalized, FALLBACK_PROFILE, {
      persist: true,
      reason: "load-own-profile:fallback",
    });

    background.catch(() => {});

    return FALLBACK_PROFILE;
  }

  async fetchProfile(pubkey, { forceRefresh = false } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey) ||
      (typeof pubkey === "string" ? pubkey.trim() : "");
    if (!normalized) {
      return null;
    }

    const cacheEntry = this.getProfileCacheEntry(normalized);
    if (cacheEntry && !forceRefresh) {
      this.emit("profile:updated", {
        pubkey: normalized,
        profile: cacheEntry.profile || FALLBACK_PROFILE,
        reason: "cache-hit",
        savedProfiles: this.cloneSavedProfiles(),
        activeProfilePubkey: getActiveProfilePubkey(),
      });
      return cacheEntry.profile;
    }

    if (!this.nostrClient?.pool || !Array.isArray(this.nostrClient?.relays)) {
      return cacheEntry?.profile || FALLBACK_PROFILE;
    }

    try {
      const results = await Promise.all(
        this.nostrClient.relays.map((relayUrl) =>
          this.nostrClient.pool.list([relayUrl], [
            { kinds: [0], authors: [normalized], limit: 1 },
          ])
        )
      );

      const events = results.flat();
      let newest = null;
      for (const event of events) {
        if (!event || event.pubkey !== normalized || !event.content) {
          continue;
        }
        if (!newest || event.created_at > newest.created_at) {
          newest = event;
        }
      }

      if (newest) {
        if (this.nostrClient && typeof this.nostrClient.handleEvent === "function") {
          this.nostrClient.handleEvent(newest);
        }
        if (newest.content) {
          const data = JSON.parse(newest.content);
          const profile = {
            name: data.display_name || data.name || FALLBACK_PROFILE.name,
            picture: data.picture || FALLBACK_PROFILE.picture,
            about: typeof data.about === "string" ? data.about : FALLBACK_PROFILE.about,
            website:
              typeof data.website === "string" ? data.website : FALLBACK_PROFILE.website,
            banner:
              typeof data.banner === "string" ? data.banner : FALLBACK_PROFILE.banner,
            lud16: typeof data.lud16 === "string" ? data.lud16 : FALLBACK_PROFILE.lud16,
            lud06: typeof data.lud06 === "string" ? data.lud06 : FALLBACK_PROFILE.lud06,
          };
          return profile;
        }
      }
    } catch (error) {
      this.log("[AuthService] Failed to fetch profile", error);
    }

    return cacheEntry?.profile || FALLBACK_PROFILE;
  }

  async fetchAndRenderProfile(pubkey, forceRefresh = false) {
    return this.fetchProfile(pubkey, { forceRefresh });
  }

  syncSavedProfileFromCache(pubkey, { persist = false } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey) ||
      (typeof pubkey === "string" ? pubkey.trim() : "");
    if (!normalized) {
      return false;
    }

    const updated = syncSavedProfileFromCacheState(normalized, { persist });
    if (updated) {
      this.emitProfileList("cache-sync");
    }
    return updated;
  }

  loadProfileCacheFromStorage() {
    hydrateProfileCacheFromStorage();
  }

  loadSavedProfilesFromStorage() {
    const result = hydrateSavedProfilesFromStorage();
    this.emitProfileList("hydrate");
    return result;
  }
}
