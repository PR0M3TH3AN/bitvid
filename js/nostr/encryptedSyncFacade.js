// Default encrypted-sync instance wired to the live Nostr client + active signer.
// The pure core lives in ./encryptedSync.js; this file is the only place that
// reaches into the singletons, so the core stays unit-testable.

import { nostrClient } from "../nostrClientFacade.js";
import { getActiveSigner } from "./index.js";
import {
  publishEventToRelays,
  summarizePublishResults,
} from "../nostrPublish.js";
import { createEncryptedSyncManager } from "./encryptedSync.js";

function resolveReadRelays() {
  const read = Array.isArray(nostrClient?.readRelays) ? nostrClient.readRelays : [];
  if (read.length) {
    return read;
  }
  return Array.isArray(nostrClient?.relays) ? nostrClient.relays : [];
}

export const encryptedSync = createEncryptedSyncManager({
  getActivePubkey: () => nostrClient?.pubkey || "",
  getSigner: () => getActiveSigner(),
  // Write to the full write set (not the capped read set) so the update reaches
  // everywhere — mirrors getDeletePublishRelays from the watch-history work.
  getWriteRelays: () =>
    typeof nostrClient?.getDeletePublishRelays === "function"
      ? nostrClient.getDeletePublishRelays()
      : [],
  getReadRelays: resolveReadRelays,
  getPool: () => nostrClient?.pool || null,
  // Reads are routed through the subscription manager (deduped + health-gated),
  // never pool.list directly (lint:pool-access).
  listEvents: (relays, filters) => {
    const manager =
      typeof nostrClient?.getSubscriptionManager === "function"
        ? nostrClient.getSubscriptionManager()
        : null;
    if (!manager || typeof manager.list !== "function") {
      return Promise.resolve([]);
    }
    return manager.list({ filters, relays });
  },
  publishEventToRelays,
  summarizePublishResults,
  signEvent: async (template) => {
    const signer = getActiveSigner();
    if (!signer || typeof signer.signEvent !== "function") {
      const err = new Error("Active signer missing signEvent support.");
      err.code = "sign-event-missing";
      throw err;
    }
    return signer.signEvent(template);
  },
});

export default encryptedSync;
