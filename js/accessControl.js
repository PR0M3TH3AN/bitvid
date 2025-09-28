// js/accessControl.js

import {
  ADMIN_EDITORS_NPUBS,
  ADMIN_SUPER_NPUB,
  getWhitelistMode,
  setWhitelistMode as persistWhitelistMode,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
} from "./config.js";
import {
  ADMIN_INITIAL_BLACKLIST,
  ADMIN_INITIAL_WHITELIST,
} from "./lists.js";

const ADMIN_EDITORS_KEY = "bitvid_admin_editors";
const ADMIN_WHITELIST_KEY = "bitvid_admin_whitelist";
const ADMIN_BLACKLIST_KEY = "bitvid_admin_blacklist";

const LEGACY_WHITELIST_KEY = "bitvid_whitelist";
const LEGACY_BLACKLIST_KEY = "bitvid_blacklist";

function loadJSONList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.warn(`Failed to parse list for ${key}:`, error);
    return null;
  }
}

function saveJSONList(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch (error) {
    console.warn(`Failed to persist list for ${key}:`, error);
  }
}

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

function migrateLegacyList(targetKey, legacyKey, fallback) {
  const stored = loadJSONList(targetKey);
  if (stored !== null) {
    return dedupeNpubs(stored);
  }

  const legacy = legacyKey ? loadJSONList(legacyKey) : null;
  if (legacy !== null) {
    const sanitized = dedupeNpubs(legacy);
    saveJSONList(targetKey, sanitized);
    return sanitized;
  }

  const sanitizedFallback = dedupeNpubs(fallback);
  if (sanitizedFallback.length) {
    saveJSONList(targetKey, sanitizedFallback);
  }
  return sanitizedFallback;
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
    this.refresh();
  }

  refresh() {
    this.editors = new Set(
      dedupeNpubs([
        ...ADMIN_EDITORS_NPUBS,
        ...migrateLegacyList(ADMIN_EDITORS_KEY, null, []),
      ])
    );

    this.whitelist = new Set(
      migrateLegacyList(ADMIN_WHITELIST_KEY, LEGACY_WHITELIST_KEY, [
        ...ADMIN_INITIAL_WHITELIST,
      ])
    );

    this.blacklist = new Set(
      migrateLegacyList(ADMIN_BLACKLIST_KEY, LEGACY_BLACKLIST_KEY, [
        ...ADMIN_INITIAL_BLACKLIST,
      ])
    );

    this.whitelistEnabled = getWhitelistMode();
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

  addModerator(requestorNpub, moderatorNpub) {
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

    this.editors.add(normalized);
    saveJSONList(ADMIN_EDITORS_KEY, this.getEditors());
    this.refresh();
    return { ok: true };
  }

  removeModerator(requestorNpub, moderatorNpub) {
    if (!this.isSuperAdmin(requestorNpub)) {
      return { ok: false, error: "forbidden" };
    }

    const normalized = normalizeNpub(moderatorNpub);
    if (!normalized || normalized === ADMIN_SUPER_NPUB) {
      return { ok: false, error: "immutable" };
    }

    this.editors.delete(normalized);
    saveJSONList(ADMIN_EDITORS_KEY, this.getEditors());
    this.refresh();
    return { ok: true };
  }

  addToWhitelist(actorNpub, targetNpub) {
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

    this.blacklist.delete(normalized);
    this.whitelist.add(normalized);
    saveJSONList(ADMIN_WHITELIST_KEY, this.getWhitelist());
    saveJSONList(ADMIN_BLACKLIST_KEY, this.getBlacklist());
    this.refresh();
    return { ok: true };
  }

  removeFromWhitelist(actorNpub, targetNpub) {
    if (!this.canEditAdminLists(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }

    const normalized = normalizeNpub(targetNpub);
    if (!normalized) {
      return { ok: false, error: "invalid npub" };
    }

    this.whitelist.delete(normalized);
    saveJSONList(ADMIN_WHITELIST_KEY, this.getWhitelist());
    this.refresh();
    return { ok: true };
  }

  addToBlacklist(actorNpub, targetNpub) {
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

    if (this.isSuperAdmin(normalized) || this.isAdminEditor(normalized)) {
      return { ok: false, error: "immutable" };
    }

    this.whitelist.delete(normalized);
    this.blacklist.add(normalized);
    saveJSONList(ADMIN_BLACKLIST_KEY, this.getBlacklist());
    saveJSONList(ADMIN_WHITELIST_KEY, this.getWhitelist());
    this.refresh();
    return { ok: true };
  }

  removeFromBlacklist(actorNpub, targetNpub) {
    if (!this.canEditAdminLists(actorNpub)) {
      return { ok: false, error: "forbidden" };
    }

    const normalized = normalizeNpub(targetNpub);
    if (!normalized) {
      return { ok: false, error: "invalid npub" };
    }

    this.blacklist.delete(normalized);
    saveJSONList(ADMIN_BLACKLIST_KEY, this.getBlacklist());
    this.refresh();
    return { ok: true };
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
    return normalized ? this.blacklist.has(normalized) : false;
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
  ADMIN_EDITORS_KEY,
  ADMIN_WHITELIST_KEY,
  ADMIN_BLACKLIST_KEY,
  ADMIN_WHITELIST_MODE_STORAGE_KEY,
  normalizeNpub,
  isValidNpub,
};
