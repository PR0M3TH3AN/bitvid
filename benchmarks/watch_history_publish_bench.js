
import { createWatchHistoryManager } from "../js/nostr/watchHistory.js";

async function main() {
  console.log("Starting WatchHistoryManager benchmark...");

  // Mock dependencies
  const mockSigner = {
    signEvent: async (event) => {
        // Simulate signing latency
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ...event, sig: "mock-sig" };
    },
    nip04Encrypt: async (pubkey, plaintext) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return "mock-ciphertext";
    }
  };

  const mockPool = {
    publish: (relays, event) => {
       return {
           on: (status, cb) => {
               if (status === 'ok') {
                   // Simulate network latency
                   setTimeout(cb, 50);
               }
           }
       }
    }
  };

  const deps = {
    ensureNostrTools: async () => ({
        nip04: { encrypt: async () => "encrypted" },
        utils: { hexToBytes: () => new Uint8Array(32) }
    }),
    getCachedNostrTools: () => ({
        nip04: { encrypt: async () => "encrypted" },
        utils: { hexToBytes: () => new Uint8Array(32) }
    }),
    getActivePubkey: () => "00".repeat(32),
    getSessionActor: () => null,
    resolveActiveSigner: () => mockSigner,
    getPool: () => mockPool,
    signEventWithPrivateKey: async () => {
         await new Promise(resolve => setTimeout(resolve, 10));
         return { sig: "mock-sig" };
    },
    shouldRequestExtensionPermissions: () => false,
  };

  const manager = createWatchHistoryManager(deps);

  // Create records for 12 months
  const records = {};
  for (let i = 1; i <= 12; i++) {
      const month = `2023-${String(i).padStart(2, '0')}`;
      records[month] = [{ type: 'e', value: `item-${i}`, watchedAt: 1672531200 + i * 100 }];
  }

  const start = Date.now();
  await manager.publishRecords(records, { actorPubkey: "00".repeat(32) });
  const duration = Date.now() - start;

  console.log(`Published 12 months in ${duration}ms`);
}

main().catch(console.error);
