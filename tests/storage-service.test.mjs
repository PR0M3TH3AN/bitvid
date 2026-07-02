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

  test("unlock() normalizes permission denied decrypt errors", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });
    storageService.lock(pubkey);

    const permissionDeniedSigner = {
      nip44Decrypt: mock.fn(async () => {
        const error = new Error("Permission denied by extension");
        error.code = "extension-encryption-permission-denied";
        throw error;
      }),
    };

    await assert.rejects(
      async () => storageService.unlock(pubkey, { signer: permissionDeniedSigner }),
      (error) => error?.code === "storage-unlock-permission-denied",
    );
  });

  test("unlock() normalizes missing decryptor errors", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });
    storageService.lock(pubkey);

    const missingDecryptSigner = {
      capabilities: { nip44: false, nip04: false },
    };

    await assert.rejects(
      async () => storageService.unlock(pubkey, { signer: missingDecryptSigner }),
      (error) => error?.code === "storage-unlock-no-decryptor",
    );
  });

  test("unlock() normalizes unknown decrypt errors", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });
    storageService.lock(pubkey);

    const failingDecryptSigner = {
      nip44Decrypt: mock.fn(async () => {
        throw new Error("Unexpected decrypt failure");
      }),
    };

    await assert.rejects(
      async () => storageService.unlock(pubkey, { signer: failingDecryptSigner }),
      (error) => error?.code === "storage-unlock-decrypt-failed",
    );
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

  test("saveConnection() with defaultForUploads=true clears other defaults", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });

    // Save first connection as default
    await storageService.saveConnection(pubkey, "conn_1", { provider: PROVIDERS.R2 }, { defaultForUploads: true });

    // Save second connection as default
    await storageService.saveConnection(pubkey, "conn_2", { provider: PROVIDERS.S3 }, { defaultForUploads: true });

    const conns = await storageService.listConnections(pubkey);
    const c1 = conns.find(c => c.id === "conn_1");
    const c2 = conns.find(c => c.id === "conn_2");

    assert.strictEqual(c1.meta.defaultForUploads, false);
    assert.strictEqual(c2.meta.defaultForUploads, true);
  });

  // Scenario (SCN-secrets-never-at-rest-plaintext):
  //   Pre-launch credential-security invariant — a user's S3/R2 secret (and
  //   access key id) must NEVER be persisted in plaintext anywhere in the stored
  //   record (not in the encrypted payload, not leaked into plaintext meta), and
  //   listConnections() (the unauthenticated/metadata view) must not expose them.
  //   Cheat-resistant: scans the ENTIRE serialized at-rest record for the secret
  //   strings, so passing requires real encryption, not a narrower field check.
  test("secrets never appear in plaintext anywhere in the at-rest record", async () => {
    await storageService.unlock(pubkey, { signer: mockSigner });

    const SECRET = "S3CR3T-do-not-persist-7f3a9c";
    const ACCESS_KEY = "AKIA-PUBLIC-ID-do-not-persist-1b2c3d";

    await storageService.saveConnection(
      pubkey,
      "conn_secret",
      {
        provider: PROVIDERS.R2,
        accessKeyId: ACCESS_KEY,
        secretAccessKey: SECRET,
        accountId: "acct-123",
      },
      { label: "My R2", bucket: "my-bucket", publicBaseUrl: "https://cdn.example" },
    );

    // Serialize the WHOLE persisted account (meta + encrypted blob + everything).
    const account = await storageService._getAccount(pubkey);
    const atRest = JSON.stringify(account);

    assert.ok(
      !atRest.includes(SECRET),
      "secretAccessKey must never be stored in plaintext at rest",
    );
    assert.ok(
      !atRest.includes(ACCESS_KEY),
      "accessKeyId must never be stored in plaintext at rest",
    );
    // The encrypted payload must actually exist (encryption happened).
    assert.ok(account.connections.conn_secret.encrypted.cipher);

    // The metadata view must not expose secrets either.
    const listed = JSON.stringify(await storageService.listConnections(pubkey));
    assert.ok(!listed.includes(SECRET) && !listed.includes(ACCESS_KEY),
      "listConnections() must not expose secrets");

    // Sanity: round-trips correctly while unlocked.
    const got = await storageService.getConnection(pubkey, "conn_secret");
    assert.strictEqual(got.secretAccessKey, SECRET);

    // And once locked, the plaintext secret is no longer reachable.
    storageService.lock(pubkey);
    await assert.rejects(
      () => storageService.getConnection(pubkey, "conn_secret"),
      /Storage is locked/,
    );
  });

  // hasStoredAccount lets the upload modal auto-unlock EXISTING storage on refresh
  // without unlock() creating a fresh account for users who never set it up (#51).
  test("hasStoredAccount() is false before setup, true after, and never creates an account", async () => {
    assert.strictEqual(
      await storageService.hasStoredAccount(pubkey),
      false,
      "no account before any unlock",
    );
    // A read-only existence check must not create an account.
    assert.strictEqual(await storageService.hasStoredAccount(pubkey), false);

    await storageService.unlock(pubkey, { signer: mockSigner });
    assert.strictEqual(
      await storageService.hasStoredAccount(pubkey),
      true,
      "account exists after unlock persisted the encrypted master key",
    );

    // Survives a lock (existence is on-disk, not the in-memory master key).
    storageService.lock(pubkey);
    assert.strictEqual(await storageService.hasStoredAccount(pubkey), true);

    assert.strictEqual(await storageService.hasStoredAccount(""), false);
  });
});
