// One encrypted cross-login sync implementation, shared by every syncable item
// (NWC wallet, storage credentials, …). Previously walletSyncService and
// storageSyncService were near-identical copies; the only per-item differences
// are the d-tag, the sync "kind", the availability check, and how the payload is
// built (push) / applied (pull). This factory captures the shared machinery —
// per-pubkey enable flags, conflict-checked push, cheap remote existence check,
// enable/disable — so the two "systems" become one.
//
// Item config:
//   id            "wallet" | "storage" — the per-pubkey sync-flag kind
//   dtag          stable d-tag for the encrypted note
//   encryptedSync the encrypted-sync facade
//   available     () => boolean (extra availability beyond encryptedSync)
//   buildPayload  async (pubkey) => payload | null  (null => "nothing-to-sync")
//   applyPayload  async (pubkey, payload) => void | { imported:false, error }
//   logLabel      short label for warnings

import { encryptedSync as defaultEncryptedSync } from "../nostr/encryptedSyncFacade.js";
import { isSyncEnabled, setSyncEnabled } from "./settingsSyncFlags.js";
import { pushWithConflictCheck } from "./syncConflict.js";
import { userLogger } from "../utils/logger.js";

export function createEncryptedSyncItem({
  id,
  dtag,
  encryptedSync = defaultEncryptedSync,
  available = () => true,
  buildPayload,
  applyPayload,
  logLabel = id || "sync",
} = {}) {
  function normalizePubkey(pubkey) {
    return typeof pubkey === "string" ? pubkey.trim() : "";
  }

  function isAvailable() {
    return Boolean(encryptedSync?.isAvailable?.()) && Boolean(available());
  }

  function isEnabled(pubkey) {
    return isSyncEnabled(normalizePubkey(pubkey), id);
  }

  function setEnabledFlag(pubkey, enabled) {
    setSyncEnabled(normalizePubkey(pubkey), id, enabled);
  }

  // Cheap existence check (no decrypt) for the login-restore offer.
  async function hasRemote() {
    if (typeof encryptedSync.exists !== "function") {
      return false;
    }
    const result = await encryptedSync.exists(dtag);
    return Boolean(result?.exists);
  }

  async function push(pubkey, { confirmOverwrite } = {}) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return { ok: false, error: "missing-pubkey" };
    }
    let payload;
    try {
      payload = await buildPayload(key);
    } catch (error) {
      userLogger.warn(`[${logLabel}] Failed to build sync payload:`, error);
      return { ok: false, error: "export-failed", cause: error };
    }
    if (!payload) {
      return { ok: false, error: "nothing-to-sync" };
    }
    return pushWithConflictCheck({
      encryptedSync,
      dTag: dtag,
      kind: id,
      pubkey: key,
      payload,
      confirmOverwrite,
    });
  }

  async function pull(pubkey) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return { found: false, error: "missing-pubkey" };
    }
    const result = await encryptedSync.pull(dtag);
    if (!result?.found) {
      return result;
    }
    try {
      const applied = await applyPayload(key, result.payload || {});
      if (applied && applied.imported === false) {
        return { ...result, imported: false, error: applied.error };
      }
    } catch (error) {
      userLogger.warn(`[${logLabel}] Failed to apply pulled settings:`, error);
      return { ...result, imported: false, error: "import-failed", cause: error };
    }
    return { ...result, imported: true };
  }

  async function enable(pubkey, options = {}) {
    setEnabledFlag(pubkey, true);
    return push(pubkey, options);
  }

  async function disable(pubkey) {
    setEnabledFlag(pubkey, false);
    return encryptedSync.clear(dtag);
  }

  return {
    id,
    dtag,
    isAvailable,
    isEnabled,
    hasRemote,
    push,
    pull,
    enable,
    disable,
  };
}

export default createEncryptedSyncItem;
