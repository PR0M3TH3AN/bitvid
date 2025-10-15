// js/accessControl.js

import {
  ADMIN_EDITORS_NPUBS,
  ADMIN_SUPER_NPUB,
  getWhitelistMode,
  setWhitelistMode as persistWhitelistMode,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
} from "./config.js";
import { loadAdminState, persistAdminState } from "./adminListStore.js";
import { userLogger } from "./utils/logger.js";

function normalizeNpub(value) {
  return typeof value === "string" ? value.trim() : "";
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
    this.blacklist = new Set();
    this.whitelistEnabled = getWhitelistMode();
    this.hasLoaded = false;
    this.lastError = null;
    this._isRefreshing = false;
    this._refreshPromise = Promise.resolve();
  }

  _performRefresh() {
    if (this._isRefreshing) {
      return this._refreshPromise;
    }

    this._isRefreshing = true;

    const operation = (async () => {
      try {
        const state = await loadAdminState();
        const editors = Array.isArray(state?.editors) ? state.editors : [];
        const whitelist = Array.isArray(state?.whitelist)
          ? state.whitelist
          : [];
        const blacklist = Array.isArray(state?.blacklist)
          ? state.blacklist
          : [];

        this.editors = new Set(
          dedupeNpubs([...ADMIN_EDITORS_NPUBS, ...editors])
        );
        const normalizedWhitelist = dedupeNpubs(whitelist);
        this.whitelist = new Set(normalizedWhitelist);

        const blacklistDedupe = dedupeNpubs(blacklist);
        const whitelistSet = new Set(normalizedWhitelist.map(normalizeNpub));
        const adminGuardSet = new Set([
          normalizeNpub(ADMIN_SUPER_NPUB),
          ...Array.from(this.editors),
        ]);
        const sanitizedBlacklist = blacklistDedupe.filter((npub) => {
          const normalized = normalizeNpub(npub);
          if (!normalized) {
            return false;
          }
          if (whitelistSet.has(normalized)) {
            return false;
          }
          if (adminGuardSet.has(normalized)) {
            return false;
          }
          return true;
        });
        this.blacklist = new Set(sanitizedBlacklist);

        this.whitelistEnabled = getWhitelistMode();
        this.hasLoaded = true;
        this.lastError = null;
      } catch (error) {
        this.lastError = error;
        if (!this.hasLoaded) {
          this.editors.clear();
          this.whitelist.clear();
          this.blacklist.clear();
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
      return this._refreshPromise;
    }

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
    } catch (error) {
      if (!this.hasLoaded) {
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
    const nextBlacklist = this.getBlacklist().filter(
      (value) => value !== normalized
    );

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
    const nextWhitelist = this.getWhitelist().filter(
      (value) => value !== normalized
    );

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
    if (this.whitelist.has(normalized)) {
      return false;
    }
    return this.blacklist.has(normalized);
  }

  canAccess(candidate) {
    let npub = "";

    if (typeof candidate === "string") {
      npub = candidate;
    } else if (candidate && typeof candidate === "object") {
      if (typeof candidate.npub === "string") {
        npub = candidate.npub;
      } else if (typeof candidate.pubkey === "string") {
        try {
          npub = window.NostrTools.nip19.npubEncode(candidate.pubkey);
        } catch (error) {
          npub = candidate.pubkey;
        }
      }
    }

    const normalized = normalizeNpub(npub);
    if (!normalized) {
      return false;
    }

    if (this.isAdminEditor(normalized)) {
      return true;
    }

    if (this.whitelist.has(normalized)) {
      return true;
    }

    if (this.blacklist.has(normalized)) {
      return false;
    }

    if (this.whitelistEnabled && !this.whitelist.has(normalized)) {
      return false;
    }

    return true;
  }
}

export const accessControl = new AccessControl();
export {
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
  normalizeNpub,
  isValidNpub,
};
