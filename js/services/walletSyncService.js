// Opt-in encrypted cross-login sync for the NWC WALLET connection (todo #15).
// Mirrors storageSyncService but for the wallet settings managed by
// NwcSettingsService.
//
// HIGHEST SENSITIVITY: the NWC URI is a bearer SPENDING secret. Anyone who can
// decrypt this note (i.e. anyone who controls the user's Nostr key) can spend
// from the connected wallet. The UI MUST gate enabling this behind an explicit
// confirmation. Off by default; never log the decrypted URI.
//
// NwcSettingsService is a per-app instance (not a singleton), so this is a
// factory — the caller injects the live service.

import { encryptedSync as defaultEncryptedSync } from "../nostr/encryptedSyncFacade.js";
import { isSyncEnabled, setSyncEnabled } from "./settingsSyncFlags.js";
import { userLogger } from "../utils/logger.js";

export const WALLET_SYNC_DTAG = "bitvid:nwc";
const SYNC_KIND = "wallet";

export function createWalletSyncService({
  encryptedSync = defaultEncryptedSync,
  nwcSettings,
} = {}) {
  function normalizePubkey(pubkey) {
    return typeof pubkey === "string" ? pubkey.trim() : "";
  }

  function isAvailable() {
    return Boolean(encryptedSync?.isAvailable?.()) && Boolean(nwcSettings);
  }

  function isEnabled(pubkey) {
    return isSyncEnabled(normalizePubkey(pubkey), SYNC_KIND);
  }

  function setEnabledFlag(pubkey, enabled) {
    setSyncEnabled(normalizePubkey(pubkey), SYNC_KIND, enabled);
  }

  // Build the minimal syncable payload from current wallet settings.
  function buildPayload() {
    const settings = nwcSettings?.getActiveNwcSettings?.() || {};
    const nwcUri = typeof settings.nwcUri === "string" ? settings.nwcUri.trim() : "";
    const payload = { nwcUri };
    if (settings.defaultZap !== undefined) {
      payload.defaultZap = settings.defaultZap;
    }
    return payload;
  }

  async function push(pubkey) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return { ok: false, error: "missing-pubkey" };
    }
    const payload = buildPayload();
    if (!payload.nwcUri) {
      return { ok: false, error: "nothing-to-sync" };
    }
    return encryptedSync.push(WALLET_SYNC_DTAG, payload);
  }

  async function pull(pubkey) {
    const key = normalizePubkey(pubkey);
    if (!key) {
      return { found: false, error: "missing-pubkey" };
    }
    const result = await encryptedSync.pull(WALLET_SYNC_DTAG);
    if (!result?.found) {
      return result;
    }
    const payload = result.payload || {};
    const nwcUri = typeof payload.nwcUri === "string" ? payload.nwcUri.trim() : "";
    if (!nwcUri) {
      return { ...result, imported: false, error: "empty-payload" };
    }
    try {
      const partial = { nwcUri };
      if (payload.defaultZap !== undefined) {
        partial.defaultZap = payload.defaultZap;
      }
      await nwcSettings.updateActiveNwcSettings(partial);
    } catch (error) {
      userLogger.warn("[walletSync] Failed to apply pulled wallet settings:", error);
      return { ...result, imported: false, error: "import-failed", cause: error };
    }
    return { ...result, imported: true };
  }

  async function enable(pubkey) {
    setEnabledFlag(pubkey, true);
    return push(pubkey);
  }

  async function disable(pubkey) {
    setEnabledFlag(pubkey, false);
    return encryptedSync.clear(WALLET_SYNC_DTAG);
  }

  return {
    WALLET_SYNC_DTAG,
    isAvailable,
    isEnabled,
    push,
    pull,
    enable,
    disable,
  };
}

export default createWalletSyncService;
