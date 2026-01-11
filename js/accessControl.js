// js/accessControl.js

import {
  ADMIN_EDITORS_NPUBS,
  ADMIN_SUPER_NPUB,
  getWhitelistMode,
  setWhitelistMode as persistWhitelistMode,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
  isLockdownMode,
} from "./config.js";
import {
  loadAdminState,
  persistAdminState,
  readCachedAdminState,
} from "./adminListStore.js";
import { ensureNostrTools } from "./nostr/toolkit.js";
import { userLogger } from "./utils/logger.js";

const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function normalizeNpub(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeHexKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase();
  return HEX_KEY_PATTERN.test(trimmed) ? trimmed : "";
}

function bytesToHex(bytes) {
  if (!bytes || typeof bytes !== "object") {
    return "";
  }

  if (typeof bytes.length !== "number") {
    return "";
  }

  let hex = "";
  for (const byte of Array.from(bytes)) {
    const normalized = Number(byte);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 255) {
      return "";
    }
    hex += normalized.toString(16).padStart(2, "0");
  }

  return normalizeHexKey(hex);
}

function dedupeNpubs(values) {
  const normalized = Array.isArray(values) ? values.map(normalizeNpub) : [];
  return Array.from(
    normalized.reduce((set, npub) => {
      if (npub) {
        set.add(npub);
      }
      return set;
    }, new Set())
  );
}

function areSetsEqual(first, second) {
  if (first === second) {
    return true;
  }

  const a = first instanceof Set ? first : new Set();
  const b = second instanceof Set ? second : new Set();

  if (a.size !== b.size) {
    return false;
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }

  return true;
}

function isValidNpub(npub) {
  if (typeof npub !== "string") {
    return false;
  }
  const trimmed = npub.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const decoded = window?.NostrTools?.nip19?.decode(trimmed);
    return decoded?.type === "npub";
  } catch (error) {
    return false;
  }
}

class AccessControl {
  constructor() {
    this.editors = new Set();
    this.whitelist = new Set();
    this.whitelistPubkeys = new Set();
    this.blacklist = new Set();
    this.blacklistPubkeys = new Set();
    this.whitelistEnabled = getWhitelistMode();
    this.hasLoaded = false;
    this.lastError = null;
    this._isRefreshing = false;
    this._refreshPromise = Promise.resolve();
    this._hydratedFromCache = false;
    this._whitelistListeners = new Set();
    this._editorListeners = new Set();
    this._blacklistListeners = new Set();

    this._scheduleHydrateFromCache();
  }

  _scheduleHydrateFromCache() {
    const runHydrate = () => {
      try {
        this._hydrateFromCache();
      } catch (error) {
        userLogger.error("accessControl failed to hydrate from cache", error);
      }
    };

    // Attempt a synchronous hydration so downstream consumers (like
    // bootstrapTrustedSeeds) have immediate access to any cached admin
    // state before they trigger refresh logic. This avoids a race where the
    // async microtask hydration hasn't executed yet when those consumers
    // call into `refresh()` and encounter an empty cache.
    runHydrate();

    if (typeof queueMicrotask === "function") {
      queueMicrotask(runHydrate);
      return;
    }

    Promise.resolve().then(runHydrate);
  }

  _hydrateFromCache() {
    this._hydratedFromCache = false;
    let cachedState = null;
    try {
      cachedState = readCachedAdminState();
    } catch (error) {
      if (error && error.name === "ReferenceError") {
        return;
      }
      throw error;
    }
    if (cachedState) {
      this._applyState(cachedState, { markLoaded: false });
      this._hydratedFromCache = true;
    }
  }

  _rebuildHexSets(
    whitelistValues = [],
    blacklistValues = [],
    toolkitCandidate = null
  ) {
    const whitelistHex = new Set();
    const blacklistHex = new Set();

    const decodeSources = [];
    const addDecodeSource = (candidate) => {
      if (
        candidate &&
        typeof candidate === "object" &&
        candidate.nip19 &&
        typeof candidate.nip19.decode === "function" &&
        !decodeSources.includes(candidate.nip19)
      ) {
        decodeSources.push(candidate.nip19);
      }
    };

    addDecodeSource(toolkitCandidate);

    const scopeTools =
      (typeof window !== "undefined" ? window?.NostrTools : null) ||
      (typeof globalThis !== "undefined" ? globalThis?.NostrTools : null) ||
      null;
    addDecodeSource(scopeTools);

    const decodeNpubToHex = (npub) => {
      const normalized = normalizeNpub(npub);
      if (!normalized) {
        return "";
      }

      for (const nip19 of decodeSources) {
        try {
          const decoded = nip19.decode(normalized);
          if (!decoded || decoded.type !== "npub") {
            continue;
          }
          const data = decoded.data;
          if (typeof data === "string") {
            const normalizedHex = normalizeHexKey(data);
            if (normalizedHex) {
              return normalizedHex;
            }
          } else {
            const converted = bytesToHex(data);
            if (converted) {
              return converted;
            }
          }
        } catch (error) {
          continue;
        }
      }

      return "";
    };

    for (const entry of whitelistValues) {
      const decodedHex = decodeNpubToHex(entry);
      if (decodedHex) {
        whitelistHex.add(decodedHex);
      }
    }

    for (const entry of blacklistValues) {
      const decodedHex = decodeNpubToHex(entry);
      if (decodedHex) {
        blacklistHex.add(decodedHex);
      }
    }

    this.whitelistPubkeys = whitelistHex;
    this.blacklistPubkeys = blacklistHex;
  }

  _applyState(state, options = {}) {
    userLogger.info("[accessControl] _applyState called", { state, options });
    const markLoaded = options.markLoaded !== false;
    const editors = Array.isArray(state?.editors) ? state.editors : [];
    const whitelist = Array.isArray(state?.whitelist) ? state.whitelist : [];
    const blacklist = Array.isArray(state?.blacklist) ? state.blacklist : [];

    const previousEditors =
      this.editors instanceof Set ? new Set(this.editors) : new Set();
    const previousWhitelist =
      this.whitelist instanceof Set ? new Set(this.whitelist) : new Set();
    const previousBlacklist =
      this.blacklist instanceof Set ? new Set(this.blacklist) : new Set();

    this.editors = new Set(
      dedupeNpubs([...ADMIN_EDITORS_NPUBS, ...editors])
    );
    const editorsChanged = !areSetsEqual(previousEditors, this.editors);
    const normalizedWhitelist = dedupeNpubs(whitelist);
    this.whitelist = new Set(normalizedWhitelist);
    const whitelistChanged = !areSetsEqual(previousWhitelist, this.whitelist);

    const blacklistDedupe = dedupeNpubs(blacklist);
    const adminGuardSet = new Set([
      normalizeNpub(ADMIN_SUPER_NPUB),
      ...Array.from(this.editors),
    ]);
    const sanitizedBlacklist = blacklistDedupe.filter((npub) => {
      const normalized = normalizeNpub(npub);
      if (!normalized) {
        return false;
      }
      if (adminGuardSet.has(normalized)) {
        return false;
      }
      return true;
    });
    this.blacklist = new Set(sanitizedBlacklist);
    const blacklistChanged = !areSetsEqual(previousBlacklist, this.blacklist);

    const toolkitCandidate =
      (typeof window !== "undefined" ? window?.NostrTools : null) ||
      (typeof globalThis !== "undefined" ? globalThis?.NostrTools : null);
    this._rebuildHexSets(normalizedWhitelist, sanitizedBlacklist, toolkitCandidate);

    try {
      const ensured = ensureNostrTools();
      if (ensured && typeof ensured.then === "function") {
        ensured
          .then((tools) => {
            if (!tools) {
              return;
            }
            this._rebuildHexSets(
              Array.from(this.whitelist),
              Array.from(this.blacklist),
              tools
            );
          })
          .catch(() => {});
      } else if (ensured) {
        this._rebuildHexSets(
          Array.from(this.whitelist),
          Array.from(this.blacklist),
          ensured
        );
      }
    } catch (error) {
      // ignore toolkit errors; we'll attempt to hydrate again on the next refresh
    }

    this.whitelistEnabled = getWhitelistMode();
    this.lastError = null;

    if (markLoaded) {
      this.hasLoaded = true;
      this._hydratedFromCache = false;
    }

    if (whitelistChanged) {
      this._emitWhitelistChange(Array.from(this.whitelist));
    }
    if (editorsChanged) {
      this._emitEditorsChange(Array.from(this.editors));
    }
    if (blacklistChanged) {
      this._emitBlacklistChange(Array.from(this.blacklist));
    }
  }

  _emitWhitelistChange(whitelistValues) {
    if (!this._whitelistListeners.size) {
      return;
    }

    const snapshot = Array.isArray(whitelistValues)
      ? [...whitelistValues]
      : this.getWhitelist();

    for (const listener of Array.from(this._whitelistListeners)) {
      try {
        listener(snapshot);
      } catch (error) {
        userLogger.error("accessControl whitelist listener failed", error);
      }
    }
  }

  _emitBlacklistChange(blacklistValues) {
    if (!this._blacklistListeners.size) {
      return;
    }

    const snapshot = Array.isArray(blacklistValues)
      ? [...blacklistValues]
      : this.getBlacklist();

    for (const listener of Array.from(this._blacklistListeners)) {
      try {
        listener(snapshot);
      } catch (error) {
        userLogger.error("accessControl blacklist listener failed", error);
      }
    }
  }

  _emitEditorsChange(editorsValues) {
    if (!this._editorListeners.size) {
      return;
    }

    const snapshot = Array.isArray(editorsValues)
      ? [...editorsValues]
      : this.getEditors();

    for (const listener of Array.from(this._editorListeners)) {
      try {
        listener(snapshot);
      } catch (error) {
        userLogger.error("accessControl editors listener failed", error);
      }
    }
  }

  _performRefresh() {
    if (this._isRefreshing) {
      return this._refreshPromise;
    }

    this._isRefreshing = true;

    const operation = (async () => {
      try {
        const state = await loadAdminState();
        this._applyState(state);
      } catch (error) {
        this.lastError = error;
        if (!this.hasLoaded && !this._hydratedFromCache) {
          this.editors.clear();
          this.whitelist.clear();
          this.whitelistPubkeys.clear();
          this.blacklist.clear();
          this.blacklistPubkeys.clear();
        }
        throw error;
      } finally {
        this._isRefreshing = false;
      }
    })();

    this._refreshPromise = operation;
    return operation;
  }

  refresh() {
    if (this._isRefreshing) {
      userLogger.info("[accessControl] refresh ignored (already refreshing)");
      return this._refreshPromise;
    }

    userLogger.info("[accessControl] refresh started");
    const operation = this._performRefresh();
    const tracked = operation.catch((error) => {
      userLogger.error("Failed to refresh admin lists:", error);
      throw error;
    });
    this._refreshPromise = tracked;
    return tracked;
  }

  async ensureReady() {
    if (!this.hasLoaded && !this._isRefreshing) {
      this.refresh();
    }

    try {
      await this._refreshPromise;
      userLogger.info("[accessControl] ensureReady resolved");
    } catch (error) {
      if (!this.hasLoaded) {
        userLogger.warn("[accessControl] ensureReady retry");
        await this.refresh();
        await this._refreshPromise;
      } else {
        throw error;
      }
    }
  }

  whitelistMode() {
    return this.whitelistEnabled;
  }

  isSuperAdmin(npub) {
    const normalized = normalizeNpub(npub);
    return normalized ? normalized === ADMIN_SUPER_NPUB : false;
  }

  isAdminEditor(npub) {
    const normalized = normalizeNpub(npub);
    if (!normalized) {
      return false;
    }
    if (this.isSuperAdmin(normalized)) {
      return true;
    }
    return this.editors.has(normalized);
  }

  canEditAdminLists(npub) {
    return this.isAdminEditor(npub);
  }

  getWhitelist() {
    return Array.from(this.whitelist);
  }

  getBlacklist() {
    return Array.from(this.blacklist);
  }

  getEditors() {
    return Array.from(this.editors);
  }

  onWhitelistChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this._whitelistListeners.add(listener);

    return () => {
      this._whitelistListeners.delete(listener);
    };
  }

  onEditorsChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this._editorListeners.add(listener);

    return () => {
      this._editorListeners.delete(listener);
    };
  }

  onBlacklistChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this._blacklistListeners.add(listener);

    return () => {
      this._blacklistListeners.delete(listener);
    };
  }

  async addModerator(requestorNpub, moderatorNpub) {
    if (!this.isSuperAdmin(requestorNpub)) {
      return { ok: false, error: "forbidden" };
    }
    if (!isValidNpub(moderatorNpub)) {
      return { ok: false, error: "invalid npub" };
    }

    const normalized = normalizeNpub(moderatorNpub);
    if (!normalized || normalized === ADMIN_SUPER_NPUB) {
      return { ok: false, error: "immutable" };
    }

    const nextEditors = dedupeNpubs([...this.getEditors(), normalized]);

    try {
      await persistAdminState(requestorNpub, { editors: nextEditors });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || "storage-error" };
    }
  }

  async removeModerator(requestorNpub, moderatorNpub) {
    if (!this.isSuperAdmin(requestorNpub)) {
      return { ok: false, error: "forbidden" };
    }

    const normalized = normalizeNpub(moderatorNpub);
    if (!normalized || normalized === ADMIN_SUPER_NPUB) {
      return { ok: false, error: "immutable" };
    }
    const nextEditors = this.getEditors().filter((value) => value !== normalized);

    try {
      await persistAdminState(requestorNpub, { editors: nextEditors });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || "storage-error" };
    }
  }

  async addToWhitelist(actorNpub, targetNpub) {
    if (!this.canEditAdminLists(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }
    if (!isValidNpub(targetNpub)) {
      return { ok: false, error: "invalid npub" };
    }

    const normalized = normalizeNpub(targetNpub);
    if (!normalized) {
      return { ok: false, error: "invalid npub" };
    }

    const nextWhitelist = dedupeNpubs([...this.getWhitelist(), normalized]);
    const nextBlacklist = this.getBlacklist();

    try {
      await persistAdminState(actorNpub, {
        whitelist: nextWhitelist,
        blacklist: nextBlacklist,
      });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || "storage-error" };
    }
  }

  async removeFromWhitelist(actorNpub, targetNpub) {
    if (!this.canEditAdminLists(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }

    const normalized = normalizeNpub(targetNpub);
    if (!normalized) {
      return { ok: false, error: "invalid npub" };
    }
    const nextWhitelist = this.getWhitelist().filter(
      (value) => value !== normalized
    );

    try {
      await persistAdminState(actorNpub, { whitelist: nextWhitelist });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || "storage-error" };
    }
  }

  async addToBlacklist(actorNpub, targetNpub) {
    if (!this.canEditAdminLists(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }
    if (!isValidNpub(targetNpub)) {
      return { ok: false, error: "invalid npub" };
    }

    const normalized = normalizeNpub(targetNpub);
    if (!normalized) {
      return { ok: false, error: "invalid npub" };
    }

    const normalizedActor = normalizeNpub(actorNpub);
    if (normalizedActor && normalized === normalizedActor) {
      return { ok: false, error: "self" };
    }

    if (this.isSuperAdmin(normalized) || this.isAdminEditor(normalized)) {
      return { ok: false, error: "immutable" };
    }

    const nextBlacklist = dedupeNpubs([...this.getBlacklist(), normalized]);
    const nextWhitelist = this.getWhitelist();

    try {
      await persistAdminState(actorNpub, {
        blacklist: nextBlacklist,
        whitelist: nextWhitelist,
      });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || "storage-error" };
    }
  }

  async removeFromBlacklist(actorNpub, targetNpub) {
    if (!this.canEditAdminLists(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }

    const normalized = normalizeNpub(targetNpub);
    if (!normalized) {
      return { ok: false, error: "invalid npub" };
    }
    const nextBlacklist = this.getBlacklist().filter(
      (value) => value !== normalized
    );

    try {
      await persistAdminState(actorNpub, { blacklist: nextBlacklist });
      await this.refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || "storage-error" };
    }
  }

  setWhitelistMode(actorNpub, enabled) {
    if (!this.isSuperAdmin(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }
    persistWhitelistMode(!!enabled);
    this.whitelistEnabled = !!enabled;
    return { ok: true };
  }

  isBlacklisted(npub) {
    const normalized = normalizeNpub(npub);
    if (!normalized) {
      return false;
    }

    const normalizedHexCandidate = normalizeHexKey(normalized);
    if (normalizedHexCandidate) {
      return this.blacklistPubkeys.has(normalizedHexCandidate);
    }

    return this.blacklist.has(normalized);
  }

  canAccess(candidate) {
    let npub = "";
    let hex = "";

    const considerHexCandidate = (value) => {
      const normalizedHex = normalizeHexKey(value);
      if (!normalizedHex) {
        return false;
      }
      hex = normalizedHex;
      return true;
    };

    if (typeof candidate === "string") {
      if (!considerHexCandidate(candidate)) {
        npub = candidate;
      }
    } else if (candidate && typeof candidate === "object") {
      if (typeof candidate.npub === "string") {
        npub = candidate.npub;
      } else if (typeof candidate.pubkey === "string") {
        if (!considerHexCandidate(candidate.pubkey)) {
          try {
            npub = window.NostrTools.nip19.npubEncode(candidate.pubkey);
          } catch (error) {
            npub = candidate.pubkey;
          }
        }
      }
    }

    const normalized = normalizeNpub(npub);
    if (!normalized) {
      if (!hex) {
        return false;
      }

      if (this.isLockdownActive()) {
        return false;
      }

      if (this.blacklistPubkeys.has(hex)) {
        return false;
      }

      if (this.whitelistPubkeys.has(hex)) {
        return true;
      }

      if (this.whitelistEnabled && !this.whitelistPubkeys.has(hex)) {
        return false;
      }

      return true;
    }

    if (this.isAdminEditor(normalized)) {
      return true;
    }

    if (this.isLockdownActive()) {
      return false;
    }

    if (hex) {
      if (this.blacklistPubkeys.has(hex)) {
        return false;
      }
      if (this.whitelistPubkeys.has(hex)) {
        return true;
      }
    }

    if (this.blacklist.has(normalized)) {
      return false;
    }

    if (this.whitelist.has(normalized)) {
      return true;
    }

    if (this.whitelistEnabled && !this.whitelist.has(normalized)) {
      return false;
    }

    return true;
  }

  isLockdownActive() {
    return Boolean(isLockdownMode);
  }
}

export const accessControl = new AccessControl();
export default accessControl;
export {
  AccessControl,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
  normalizeNpub,
  isValidNpub,
};
