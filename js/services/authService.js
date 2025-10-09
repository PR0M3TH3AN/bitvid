// js/services/authService.js

import {
  setPubkey,
  setCurrentUserNpub,
  getPubkey,
  getCurrentUserNpub,
} from "../state/appState.js";
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
} from "../state/cache.js";

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

export default class AuthService {
  constructor({ nostrClient, userBlocks, relayManager, logger } = {}) {
    this.nostrClient = nostrClient || null;
    this.userBlocks = userBlocks || null;
    this.relayManager = relayManager || null;

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
        console.warn("[AuthService] logger threw", logError);
      }
    });
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (error) {
      console.warn("[AuthService] logger threw", error);
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
    const { profiles } = hydrateSavedProfilesFromStorage();
    if (!getActiveProfilePubkey() && Array.isArray(profiles) && profiles.length) {
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

  async requestLogin(options = {}) {
    if (!this.nostrClient || typeof this.nostrClient.login !== "function") {
      throw new Error("Nostr login is not available.");
    }

    const result = await this.nostrClient.login(options);
    const pubkey =
      typeof result === "string"
        ? result
        : result && typeof result === "object"
        ? result.pubkey || result.publicKey || ""
        : "";

    const trimmed = typeof pubkey === "string" ? pubkey.trim() : "";
    if (!trimmed) {
      return { pubkey: null };
    }

    if (options?.autoApply === false) {
      return { pubkey: trimmed };
    }

    const detail = await this.login(trimmed, {
      persistActive: options?.persistActive !== false,
    });

    return { pubkey: trimmed, detail };
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
      options && typeof options === "object" ? options : { persistActive: true };
    const persistActive =
      normalizedOptions.persistActive === false ? false : true;

    const previousPubkey = this.normalizeHexPubkey(getPubkey()) || getPubkey();
    const normalized = this.normalizeHexPubkey(pubkey);
    const trimmed = typeof pubkey === "string" ? pubkey.trim() : "";
    const nextPubkey = normalized || trimmed || null;
    if (!nextPubkey) {
      throw new Error("A valid pubkey is required for login.");
    }

    const identityChanged = previousPubkey !== nextPubkey;

    if (normalized) {
      setPubkey(normalized);
      if (this.nostrClient && typeof this.nostrClient === "object") {
        this.nostrClient.pubkey = normalized;
      }
    } else {
      setPubkey(nextPubkey);
      if (this.nostrClient && typeof this.nostrClient === "object") {
        this.nostrClient.pubkey = trimmed ? trimmed.toLowerCase() : "";
      }
    }

    const npub = this.safeEncodeNpub(nextPubkey);
    setCurrentUserNpub(npub);

    let savedProfilesMutated = false;
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
        authType: "nip07",
      };

      if (existingIndex >= 0) {
        const currentEntry = draft[existingIndex] || {};
        const changed =
          currentEntry.npub !== nextEntry.npub ||
          currentEntry.name !== nextEntry.name ||
          currentEntry.picture !== nextEntry.picture ||
          currentEntry.authType !== nextEntry.authType;
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

    const postLogin = await this.applyPostLoginState();

    const detail = {
      pubkey: getPubkey(),
      npub: getCurrentUserNpub(),
      previousPubkey: previousPubkey || null,
      identityChanged,
      savedProfiles: this.cloneSavedProfiles(),
      activeProfilePubkey: getActiveProfilePubkey(),
      postLogin,
    };

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

  async switchProfile(pubkey) {
    const normalizedTarget = this.normalizeHexPubkey(pubkey);
    if (!normalizedTarget) {
      throw new Error("Unable to switch profiles: invalid account.");
    }

    const normalizedActive = this.normalizeHexPubkey(getActiveProfilePubkey());
    if (normalizedActive && normalizedActive === normalizedTarget) {
      return { switched: false, reason: "already-active" };
    }

    try {
      await this.requestLogin({
        allowAccountSelection: true,
        expectPubkey: normalizedTarget,
      });
    } catch (error) {
      throw error;
    }

    const detail = await this.login(normalizedTarget, { persistActive: true });

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

    const events = await this.nostrClient.pool.list(this.nostrClient.relays, [
      { kinds: [0], authors: [normalized], limit: 1 },
    ]);

    let profile = FALLBACK_PROFILE;
    if (Array.isArray(events) && events.length && events[0]?.content) {
      try {
        const data = JSON.parse(events[0].content);
        profile = {
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
      }
    }

    this.setProfileCacheEntry(normalized, profile, {
      persist: true,
      reason: "load-own-profile",
    });

    return profile;
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

      if (newest?.content) {
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
        this.setProfileCacheEntry(normalized, profile, {
          persist: true,
          reason: forceRefresh ? "force-refresh" : "fetch-profile",
        });
        return profile;
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
