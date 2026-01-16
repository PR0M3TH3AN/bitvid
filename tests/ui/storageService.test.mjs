import { test, describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import { createUiDom } from "./helpers/jsdom-test-helpers.mjs";

// We need to import storageService AFTER we setup globals like indexedDB and crypto
// So we will use dynamic import in the before() hook.
let storageService;
let PROVIDERS;

describe("StorageService", () => {
  let dom;
  const mockPubkey = "0000000000000000000000000000000000000000000000000000000000000001";

  // Mock Signer (NIP-04 style for simplicity)
  // In a real app, this does ECIES. Here we just reverse string or something reversible for test speed/simplicity
  // OR strictly obey the contract: returns Promise<hexString>
  const mockSigner = {
    encrypt: async (pubkey, plaintext) => {
      // Fake encryption: prefix "enc:" + hex(plaintext)
      return "enc:" + Buffer.from(plaintext).toString("hex");
    },
    decrypt: async (pubkey, ciphertext) => {
      // Fake decryption
      if (!ciphertext.startsWith("enc:")) throw new Error("Bad ciphertext");
      const hex = ciphertext.slice(4);
      return Buffer.from(hex, "hex").toString("utf8");
    },
    // Add NIP-04 aliases just in case
    nip04Encrypt: async (pk, pt) => "enc:" + Buffer.from(pt).toString("hex"),
    nip04Decrypt: async (pk, ct) => {
         if (!ct.startsWith("enc:")) throw new Error("Bad ciphertext");
         return Buffer.from(ct.slice(4), "hex").toString("utf8");
    }
  };

  before(async () => {
    dom = createUiDom();

    // Polyfill Globals
    global.window = dom.window;

    // Use fake-indexeddb for reliable testing
    const { indexedDB, IDBKeyRange } = await import("fake-indexeddb");
    global.indexedDB = indexedDB;
    globalThis.indexedDB = indexedDB;
    global.IDBKeyRange = IDBKeyRange;
    globalThis.IDBKeyRange = IDBKeyRange;

    // Ensure crypto is available (Node's or Window's)
    if (!global.crypto) {
        const cryptoModule = await import("node:crypto");
        global.crypto = global.window.crypto || cryptoModule.webcrypto;
    }
    // StorageService uses crypto.subtle
    if (!global.crypto.subtle) {
        // If JSDOM crypto is partial, fallback to Node
        const cryptoModule = await import("node:crypto");
        global.crypto = cryptoModule.webcrypto;
    }

    // Now import the service (it instantiates 'storageService' singleton on load)
    const module = await import("../../js/services/storageService.js");
    storageService = module.default;
    PROVIDERS = module.PROVIDERS;
  });

  after(() => {
    if (dom) dom.cleanup();
  });

  // Since storageService is a singleton, state might persist.
  // We should try to reset it or use different pubkeys.
  // The service uses IndexedDB. We can try to delete the DB between tests if needed,
  // or just rely on unique pubkeys or connection IDs.
  // For unit tests, clearing the DB is cleaner.
  beforeEach(async () => {
      // Optional: Clear DB store if possible.
      // Since `storageService` doesn't expose a clear method, we'll just use unique IDs/pubkeys or rely on overwrites.
      // But we can reset the in-memory masterKeys map.
      if (storageService.masterKeys) storageService.masterKeys.clear();
  });

  it("should unlock storage with a valid signer", async () => {
    assert.strictEqual(storageService.isUnlocked(mockPubkey), false, "Should be locked initially");

    await storageService.unlock(mockPubkey, { signer: mockSigner });

    assert.strictEqual(storageService.isUnlocked(mockPubkey), true, "Should be unlocked");
  });

  it("should save and retrieve an R2 connection", async () => {
    // Ensure unlocked
    if (!storageService.isUnlocked(mockPubkey)) {
        await storageService.unlock(mockPubkey, { signer: mockSigner });
    }

    const connectionId = "r2-test-1";
    const payload = {
        provider: PROVIDERS.R2,
        accountId: "acc123",
        accessKeyId: "key123",
        secretAccessKey: "secret123"
    };
    const meta = {
        label: "My R2",
        baseDomain: "https://pub.r2.dev"
    };

    await storageService.saveConnection(mockPubkey, connectionId, payload, meta);

    const retrieved = await storageService.getConnection(mockPubkey, connectionId);

    assert.ok(retrieved, "Should return connection");
    assert.strictEqual(retrieved.provider, PROVIDERS.R2);
    assert.strictEqual(retrieved.accountId, "acc123");
    assert.strictEqual(retrieved.accessKeyId, "key123");
    assert.strictEqual(retrieved.meta.label, "My R2");
    assert.strictEqual(retrieved.meta.baseDomain, "https://pub.r2.dev");

    // Ensure secret didn't leak into meta or something unintended, but main point is it came back
    assert.strictEqual(retrieved.secretAccessKey, "secret123");
  });

  it("should save and retrieve a Generic S3 connection with extra fields", async () => {
    // Verify Generic S3 Payload (endpoint, region, bucket)
    if (!storageService.isUnlocked(mockPubkey)) {
        await storageService.unlock(mockPubkey, { signer: mockSigner });
    }

    const connectionId = "s3-generic-1";
    const payload = {
        provider: PROVIDERS.GENERIC || "generic_s3",
        endpoint: "https://minio.local:9000",
        region: "us-east-1",
        bucket: "my-bucket",
        accessKeyId: "minio-key",
        secretAccessKey: "minio-secret"
    };
    const meta = {
        label: "Local Minio",
        defaultForUploads: true
    };

    await storageService.saveConnection(mockPubkey, connectionId, payload, meta);

    const retrieved = await storageService.getConnection(mockPubkey, connectionId);

    assert.ok(retrieved, "Should return connection");
    assert.strictEqual(retrieved.provider, "generic_s3");
    assert.strictEqual(retrieved.endpoint, "https://minio.local:9000", "Endpoint should be preserved");
    assert.strictEqual(retrieved.region, "us-east-1", "Region should be preserved");
    assert.strictEqual(retrieved.bucket, "my-bucket", "Bucket should be preserved");
    assert.strictEqual(retrieved.accessKeyId, "minio-key");
    assert.strictEqual(retrieved.meta.defaultForUploads, true);
  });

  it("should fail to get connection if locked", async () => {
      storageService.lock(mockPubkey);
      assert.strictEqual(storageService.isUnlocked(mockPubkey), false);

      await assert.rejects(
          async () => await storageService.getConnection(mockPubkey, "r2-test-1"),
          /Storage is locked/,
          "Should throw if locked"
      );
  });
});
