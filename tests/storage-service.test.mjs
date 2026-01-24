import { test, mock, describe, beforeEach } from "node:test";
import assert from "node:assert";
import * as fakeIndexedDB from "fake-indexeddb";

// Ensure global indexedDB is set
if (!globalThis.indexedDB) {
    globalThis.indexedDB = fakeIndexedDB.indexedDB;
    globalThis.IDBKeyRange = fakeIndexedDB.IDBKeyRange;
}

// Import module under test
import storageService, { PROVIDERS } from "../js/services/storageService.js";

describe("StorageService", () => {
  const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";

  const mockSigner = {
    nip44Encrypt: mock.fn(async (pk, plaintext) => `encrypted_${plaintext}`),
    nip44Decrypt: mock.fn(async (pk, ciphertext) => ciphertext.replace("encrypted_", "")),
  };

  const mockLegacySigner = {
    nip04Encrypt: mock.fn(async (pk, plaintext) => `legacy_encrypted_${plaintext}`),
    nip04Decrypt: mock.fn(async (pk, ciphertext) => ciphertext.replace("legacy_encrypted_", "")),
  };

  beforeEach(async () => {
    // Reset service state
    storageService.masterKeys.clear();

    // Clear IndexedDB
    if (storageService.db) {
        storageService.db.close();
        storageService.db = null;
        storageService.dbPromise = null;
    }

    const req = globalThis.indexedDB.deleteDatabase("bitvid-storage");
    await new Promise((resolve, reject) => {
      req.onsuccess = resolve;
      req.onerror = resolve; // ignore error if db doesn't exist
      req.onblocked = resolve;
    });
  });

  test("init() creates database and object store", async () => {
    const db = await storageService.init();
    assert.ok(db);
    assert.strictEqual(db.name, "bitvid-storage");
    assert.ok(db.objectStoreNames.contains("accounts"));
  });

  test("unlock() generates and stores master key with NIP-44", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });

    assert.ok(storageService.isUnlocked(pubkey));
    assert.strictEqual(mockSigner.nip44Encrypt.mock.callCount(), 1);

    // Verify persistence
    const account = await storageService._getAccount(pubkey);
    assert.ok(account);
    assert.strictEqual(account.encryptedMasterKey.method, "nip44");
  });

  test("unlock() restores existing master key", async () => {
    // First unlock to create
    await storageService.unlock(pubkey, { signer: mockSigner });
    storageService.lock(pubkey);
    assert.strictEqual(storageService.isUnlocked(pubkey), false);

    // Second unlock to restore
    await storageService.unlock(pubkey, { signer: mockSigner });
    assert.ok(storageService.isUnlocked(pubkey));
    assert.strictEqual(mockSigner.nip44Decrypt.mock.callCount(), 1);
  });

  test("unlock() falls back to NIP-04 if NIP-44 unavailable", async () => {
    await storageService.unlock(pubkey, { signer: mockLegacySigner });

    const account = await storageService._getAccount(pubkey);
    assert.strictEqual(account.encryptedMasterKey.method, "nip04");
    assert.strictEqual(mockLegacySigner.nip04Encrypt.mock.callCount(), 1);
  });

  test("saveConnection() encrypts and stores connection", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });

    const connectionId = "conn_1";
    const payload = {
      accessKeyId: "key",
      secretAccessKey: "secret",
      provider: PROVIDERS.R2,
    };
    const meta = { label: "My R2" };

    await storageService.saveConnection(pubkey, connectionId, payload, meta);

    const connections = await storageService.listConnections(pubkey);
    assert.strictEqual(connections.length, 1);
    assert.strictEqual(connections[0].id, connectionId);
    assert.strictEqual(connections[0].meta.label, "My R2");

    // Verify payload is encrypted in DB
    const account = await storageService._getAccount(pubkey);
    const storedConn = account.connections[connectionId];
    assert.ok(storedConn.encrypted.cipher);
    // Ensure it's not plaintext
    assert.notStrictEqual(storedConn.encrypted.cipher, JSON.stringify(payload));
  });

  test("getConnection() decrypts and returns connection", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });

    const connectionId = "conn_1";
    const payload = {
      accessKeyId: "key",
      secretAccessKey: "secret",
      provider: PROVIDERS.R2,
    };

    await storageService.saveConnection(pubkey, connectionId, payload);
    const retrieved = await storageService.getConnection(pubkey, connectionId);

    assert.strictEqual(retrieved.accessKeyId, payload.accessKeyId);
    assert.strictEqual(retrieved.secretAccessKey, payload.secretAccessKey);
  });

  test("getConnection() throws if locked", async () => {
    await assert.rejects(
      async () => await storageService.getConnection(pubkey, "conn_1"),
      /Storage is locked/
    );
  });

  test("deleteConnection() removes connection", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });
    await storageService.saveConnection(pubkey, "conn_1", { provider: PROVIDERS.R2 });

    await storageService.deleteConnection(pubkey, "conn_1");
    const connections = await storageService.listConnections(pubkey);
    assert.strictEqual(connections.length, 0);
  });

  test("setDefaultConnection() updates metadata", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });
    await storageService.saveConnection(pubkey, "conn_1", { provider: PROVIDERS.R2 });
    await storageService.saveConnection(pubkey, "conn_2", { provider: PROVIDERS.S3 });

    await storageService.setDefaultConnection(pubkey, "conn_2");

    const conns = await storageService.listConnections(pubkey);
    const c1 = conns.find(c => c.id === "conn_1");
    const c2 = conns.find(c => c.id === "conn_2");

    assert.strictEqual(c1.meta.defaultForUploads, false);
    assert.strictEqual(c2.meta.defaultForUploads, true);
  });
});
