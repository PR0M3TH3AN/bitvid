// Run with: node tests/services/storage-service.test.mjs

import "../test-helpers/setup-localstorage.mjs";
import "fake-indexeddb/auto";
import assert from "node:assert/strict";

// Fix for fake-indexeddb in Node env with window mock:
// fake-indexeddb might attach to window.indexedDB because window exists,
// but in Node, window is not the global scope, so 'indexedDB' global lookup fails.
if (typeof globalThis.indexedDB === "undefined" && globalThis.window?.indexedDB) {
  globalThis.indexedDB = globalThis.window.indexedDB;
  globalThis.IDBKeyRange = globalThis.window.IDBKeyRange;
}
import { StorageService, PROVIDERS } from "../../js/services/storageService.js";

// Ensure global crypto is available (Node.js 19+)
if (!globalThis.crypto) {
  throw new Error("Crypto API is not available in this environment.");
}

// Mock userLogger to avoid console noise during tests
// We can't easily mock the module import, so we'll just suppress console output if needed.
// For now, we'll let it log, as it helps debugging.

const SAMPLE_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";

// Helper to create a mock signer
function createMockSigner() {
  return {
    nip04Encrypt: async (pubkey, plaintext) => {
      return `nip04_enc:${plaintext}`;
    },
    nip04Decrypt: async (pubkey, ciphertext) => {
      if (!ciphertext.startsWith("nip04_enc:")) {
        throw new Error("Decryption failed");
      }
      return ciphertext.replace("nip04_enc:", "");
    },
    nip44Encrypt: async (pubkey, plaintext) => {
      return `nip44_enc:${plaintext}`;
    },
    nip44Decrypt: async (pubkey, ciphertext) => {
      if (!ciphertext.startsWith("nip44_enc:")) {
        throw new Error("Decryption failed");
      }
      return ciphertext.replace("nip44_enc:", "");
    }
  };
}

// Helper: Delete DB to ensure clean state
async function deleteDatabase() {
  const idb = globalThis.indexedDB || globalThis.window?.indexedDB;
  if (!idb) {
    throw new Error("IndexedDB is not available in global scope");
  }
  return new Promise((resolve, reject) => {
    const request = idb.deleteDatabase("bitvid-storage");
    request.onsuccess = resolve;
    request.onerror = reject;
    request.onblocked = resolve; // Just proceed
  });
}

// Tests

// 1. Initialization
await (async () => {
  console.log("Test: Initialization");
  await deleteDatabase();
  const storage = new StorageService();
  const db = await storage.init();
  assert.ok(db, "Database should be initialized");
  assert.equal(db.name, "bitvid-storage");
  assert.ok(db.objectStoreNames.contains("accounts"), "Should contain 'accounts' store");
  db.close();
})();

// 2. Unlock with NIP-04 (Legacy)
await (async () => {
  console.log("Test: Unlock with NIP-04");
  await deleteDatabase();
  const storage = new StorageService();
  const signer = createMockSigner();

  try {
    // Remove nip44 methods to force NIP-04
    const legacySigner = {
      nip04Encrypt: signer.nip04Encrypt,
      nip04Decrypt: signer.nip04Decrypt
    };

    await storage.unlock(SAMPLE_PUBKEY, { signer: legacySigner });
    assert.ok(storage.isUnlocked(SAMPLE_PUBKEY), "Storage should be unlocked");

    // Verify account created
    const account = await storage._getAccount(SAMPLE_PUBKEY);
    assert.ok(account, "Account should be created");
    assert.equal(account.pubkey, SAMPLE_PUBKEY);
    assert.equal(account.encryptedMasterKey.method, "nip04");
    assert.ok(account.encryptedMasterKey.ciphertext.startsWith("nip04_enc:"), "Master key should be encrypted with NIP-04");
  } finally {
    if (storage.db) storage.db.close();
  }
})();

// 3. Unlock with NIP-44
await (async () => {
  console.log("Test: Unlock with NIP-44");
  await deleteDatabase();
  const storage = new StorageService();
  const signer = createMockSigner();

  try {
    await storage.unlock(SAMPLE_PUBKEY, { signer }); // Has nip44 methods
    assert.ok(storage.isUnlocked(SAMPLE_PUBKEY));

    const account = await storage._getAccount(SAMPLE_PUBKEY);
    assert.equal(account.encryptedMasterKey.method, "nip44");
    assert.ok(account.encryptedMasterKey.ciphertext.startsWith("nip44_enc:"), "Master key should be encrypted with NIP-44");
  } finally {
    if (storage.db) storage.db.close();
  }
})();

// 4. Save and Get Connection (Encryption/Decryption)
await (async () => {
  console.log("Test: Save and Get Connection");
  await deleteDatabase();
  const storage = new StorageService();
  const signer = createMockSigner();

  try {
    await storage.unlock(SAMPLE_PUBKEY, { signer });

    const connectionId = "conn_1";
    const payload = {
      provider: PROVIDERS.R2,
      accessKeyId: "TEST_ACCESS_KEY",
      secretAccessKey: "TEST_SECRET_KEY",
      endpoint: "https://example.com"
    };
    const meta = {
      label: "My R2 Bucket"
    };

    await storage.saveConnection(SAMPLE_PUBKEY, connectionId, payload, meta);

    // Verify raw storage is encrypted
    const account = await storage._getAccount(SAMPLE_PUBKEY);
    const connStored = account.connections[connectionId];
    assert.ok(connStored.encrypted.cipher, "Payload should be encrypted");
    assert.notEqual(connStored.encrypted.cipher, JSON.stringify(payload), "Cipher should not match plaintext");

    // Retrieve and decrypt
    const retrieved = await storage.getConnection(SAMPLE_PUBKEY, connectionId);
    assert.deepEqual(retrieved.accessKeyId, payload.accessKeyId);
    assert.deepEqual(retrieved.secretAccessKey, payload.secretAccessKey);
    assert.equal(retrieved.meta.label, meta.label);
  } finally {
    if (storage.db) storage.db.close();
  }
})();

// 5. Locking
await (async () => {
  console.log("Test: Locking");
  await deleteDatabase();
  const storage = new StorageService();
  const signer = createMockSigner();

  try {
    await storage.unlock(SAMPLE_PUBKEY, { signer });
    assert.ok(storage.isUnlocked(SAMPLE_PUBKEY));

    storage.lock(SAMPLE_PUBKEY);
    assert.ok(!storage.isUnlocked(SAMPLE_PUBKEY));

    // Try to access without unlock
    await assert.rejects(
      async () => await storage.getConnection(SAMPLE_PUBKEY, "conn_1"),
      /Storage is locked/,
      "Should reject access when locked"
    );
  } finally {
    if (storage.db) storage.db.close();
  }
})();

// 6. List and Delete Connections
await (async () => {
  console.log("Test: List and Delete Connections");
  await deleteDatabase();
  const storage = new StorageService();
  const signer = createMockSigner();

  try {
    await storage.unlock(SAMPLE_PUBKEY, { signer });

    await storage.saveConnection(SAMPLE_PUBKEY, "c1", { provider: "p1" }, { label: "C1" });
    await storage.saveConnection(SAMPLE_PUBKEY, "c2", { provider: "p2" }, { label: "C2" });

    const list = await storage.listConnections(SAMPLE_PUBKEY);
    assert.equal(list.length, 2);
    assert.ok(list.find(c => c.id === "c1"));
    assert.ok(list.find(c => c.id === "c2"));

    await storage.deleteConnection(SAMPLE_PUBKEY, "c1");
    const listAfter = await storage.listConnections(SAMPLE_PUBKEY);
    assert.equal(listAfter.length, 1);
    assert.equal(listAfter[0].id, "c2");
  } finally {
    if (storage.db) storage.db.close();
  }
})();

// 7. Relock and Unlock (Persistence)
await (async () => {
  console.log("Test: Persistence (Unlock -> Lock -> Unlock)");
  await deleteDatabase();
  const storage = new StorageService();
  const signer = createMockSigner();

  let storage2;
  try {
    // Initial unlock and save
    await storage.unlock(SAMPLE_PUBKEY, { signer });
    await storage.saveConnection(SAMPLE_PUBKEY, "c1", { secret: "secret123" }, { label: "Persistent" });
    storage.lock(SAMPLE_PUBKEY);

    // Re-unlock
    storage2 = new StorageService(); // Simulate app restart or new service instance
    await storage2.unlock(SAMPLE_PUBKEY, { signer });

    const conn = await storage2.getConnection(SAMPLE_PUBKEY, "c1");
    assert.equal(conn.secret, "secret123", "Should be able to decrypt data persisted in DB");
  } finally {
    if (storage.db) storage.db.close();
    if (storage2 && storage2.db) storage2.db.close();
  }
})();

console.log("All tests passed!");
