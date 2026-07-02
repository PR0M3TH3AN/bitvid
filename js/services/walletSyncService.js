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
import { createEncryptedSyncItem } from "./encryptedSyncItem.js";

export const WALLET_SYNC_DTAG = "bitvid:nwc";
const SYNC_KIND = "wallet";

export function createWalletSyncService({
  encryptedSync = defaultEncryptedSync,
  nwcSettings,
} = {}) {
  const item = createEncryptedSyncItem({
    id: SYNC_KIND,
    dtag: WALLET_SYNC_DTAG,
    encryptedSync,
    logLabel: "walletSync",
    available: () => Boolean(nwcSettings),
    // Minimal syncable payload from current wallet settings. null => nothing to
    // sync (no wallet connected).
    buildPayload: () => {
      const settings = nwcSettings?.getActiveNwcSettings?.() || {};
      const nwcUri = typeof settings.nwcUri === "string" ? settings.nwcUri.trim() : "";
      if (!nwcUri) {
        return null;
      }
      const payload = { nwcUri };
      if (settings.defaultZap !== undefined) {
        payload.defaultZap = settings.defaultZap;
      }
      return payload;
    },
    applyPayload: async (pubkey, payload) => {
      const nwcUri = typeof payload.nwcUri === "string" ? payload.nwcUri.trim() : "";
      if (!nwcUri) {
        return { imported: false, error: "empty-payload" };
      }
      const partial = { nwcUri };
      if (payload.defaultZap !== undefined) {
        partial.defaultZap = payload.defaultZap;
      }
      await nwcSettings.updateActiveNwcSettings(partial);
    },
  });

  return { WALLET_SYNC_DTAG, ...item };
}

export default createWalletSyncService;
