// Opt-in encrypted cross-login sync for STORAGE credentials (todo #15, step 2).
// Wraps the encrypted-sync core: the on-disk storage account record (already
// self-protected, but with plaintext meta) is re-encrypted to self and published
// as a NIP-78 replaceable note under a stable d-tag, then pulled + imported on
// another device.
//
// Opt-in only, off by default. A per-pubkey local flag remembers the choice so
// the UI toggle persists and a future "re-push on change" knows whether to sync.

import { encryptedSync as defaultEncryptedSync } from "../nostr/encryptedSyncFacade.js";
import defaultStorageService from "./storageService.js";
import { userLogger } from "../utils/logger.js";

export const STORAGE_SYNC_DTAG = "bitvid:storage-connections";
const FLAG_STORAGE_KEY = "bitvid:settings-sync:v1";

function readFlags() {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(FLAG_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeFlags(flags) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify(flags || {}));
  } catch (error) {
    // Best-effort; the flag is a convenience, not a source of truth.
  }
}

export function createStorageSyncService({
  encryptedSync = defaultEncryptedSync,
  storage = defaultStorageService,
} = {}) {
  function normalizePubkey(pubkey) {
    return typeof pubkey === "string" ? pubkey.trim() : "";
  }

  function isAvailable() {
    return Boolean(encryptedSync?.isAvailable?.());
  }

  function isEnabled(pubkey) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return false;
    }
    return readFlags()[key]?.storage === true;
  }

  function setEnabledFlag(pubkey, enabled) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return;
    }
    const flags = readFlags();
    const entry = flags[key] && typeof flags[key] === "object" ? flags[key] : {};
    entry.storage = enabled === true;
    flags[key] = entry;
    writeFlags(flags);
  }

  // Push the current local storage account record to the user's encrypted note.
  async function push(pubkey) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return { ok: false, error: "missing-pubkey" };
    }
    let record;
    try {
      record = await storage.exportAccountRecord(key);
    } catch (error) {
      userLogger.warn("[storageSync] Failed to export storage record:", error);
      return { ok: false, error: "export-failed", cause: error };
    }
    if (!record) {
      return { ok: false, error: "nothing-to-sync" };
    }
    return encryptedSync.push(STORAGE_SYNC_DTAG, record);
  }

  // Pull the encrypted note and import it into local storage. Returns the
  // encrypted-sync pull result with `imported: true` when a record was applied.
  async function pull(pubkey) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return { found: false, error: "missing-pubkey" };
    }
    const result = await encryptedSync.pull(STORAGE_SYNC_DTAG);
    if (!result?.found) {
      return result;
    }
    try {
      await storage.importAccountRecord(key, result.payload);
    } catch (error) {
      userLogger.warn("[storageSync] Failed to import storage record:", error);
      return { ...result, imported: false, error: "import-failed", cause: error };
    }
    return { ...result, imported: true };
  }

  // Turn sync on: remember the choice and push immediately.
  async function enable(pubkey) {
    setEnabledFlag(pubkey, true);
    return push(pubkey);
  }

  // Turn sync off: remember the choice and wipe the published note.
  async function disable(pubkey) {
    setEnabledFlag(pubkey, false);
    return encryptedSync.clear(STORAGE_SYNC_DTAG);
  }

  return {
    STORAGE_SYNC_DTAG,
    isAvailable,
    isEnabled,
    push,
    pull,
    enable,
    disable,
  };
}

export const storageSyncService = createStorageSyncService();

export default storageSyncService;
