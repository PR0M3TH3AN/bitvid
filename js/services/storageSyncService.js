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
import { createEncryptedSyncItem } from "./encryptedSyncItem.js";

export const STORAGE_SYNC_DTAG = "bitvid:storage-connections";
const SYNC_KIND = "storage";

export function createStorageSyncService({
  encryptedSync = defaultEncryptedSync,
  storage = defaultStorageService,
} = {}) {
  const item = createEncryptedSyncItem({
    id: SYNC_KIND,
    dtag: STORAGE_SYNC_DTAG,
    encryptedSync,
    logLabel: "storageSync",
    // Export the local storage account record (self-protected). null => nothing
    // to sync. An export error surfaces as { error: "export-failed" }.
    buildPayload: async (pubkey) => {
      const record = await storage.exportAccountRecord(pubkey);
      return record || null;
    },
    applyPayload: async (pubkey, payload) => {
      await storage.importAccountRecord(pubkey, payload);
    },
  });

  return { STORAGE_SYNC_DTAG, ...item };
}

export const storageSyncService = createStorageSyncService();

export default storageSyncService;
