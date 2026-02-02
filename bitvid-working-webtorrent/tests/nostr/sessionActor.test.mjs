import test from "node:test";
import assert from "node:assert";
import {
  encryptSessionPrivateKey,
  decryptSessionPrivateKey,
  persistSessionActor,
  readStoredSessionActorEntry,
  clearStoredSessionActor,
  SESSION_ACTOR_STORAGE_KEY,
  __testExports
} from "../../js/nostr/sessionActor.js";

const { generateRandomBytes, isSubtleCryptoAvailable } = __testExports;

// Ensure localStorage is mocked
import "../../tests/test-helpers/setup-localstorage.mjs";

test("js/nostr/sessionActor.js", async (t) => {
  if (!isSubtleCryptoAvailable()) {
    t.skip("WebCrypto not available in this environment");
    return;
  }

  t.beforeEach(async () => {
    localStorage.clear();
    await clearStoredSessionActor();
  });

  await t.test("Encryption and Decryption Roundtrip", async () => {
    const privateKey = "nsec1testkey..."; // In reality this would be hex or bech32, but for encryption it is just a string payload
    const passphrase = "secure-password";

    const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);

    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.salt);
    assert.ok(encrypted.iv);
    assert.strictEqual(encrypted.algorithm, "AES-GCM");

    const payload = {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
    };

    const decrypted = await decryptSessionPrivateKey(payload, passphrase);
    assert.strictEqual(decrypted, privateKey);
  });

  await t.test("Decryption fails with wrong passphrase", async () => {
    const privateKey = "secret";
    const passphrase = "correct";
    const wrongPassphrase = "wrong";

    const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);
    const payload = {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
    };

    await assert.rejects(
      async () => {
        await decryptSessionPrivateKey(payload, wrongPassphrase);
      },
      (err) => err.code === "decrypt-failed" || err.message.includes("decrypt-failed")
    );
  });

  await t.test("Persistence and Retrieval", async () => {
    const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
    const privateKey = "my-secret-key";
    const passphrase = "my-password";

    const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);

    const actor = {
      pubkey,
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
      createdAt: Date.now(),
    };

    persistSessionActor(actor);

    // Verify localStorage
    const storedRaw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
    assert.ok(storedRaw);

    const stored = readStoredSessionActorEntry();
    assert.ok(stored);
    assert.strictEqual(stored.pubkey, pubkey);
    assert.strictEqual(stored.privateKeyEncrypted, encrypted.ciphertext);

    // Verify we can decrypt what we retrieved
    const decrypted = await decryptSessionPrivateKey(stored, passphrase);
    assert.strictEqual(decrypted, privateKey);
  });

  await t.test("Clear Stored Session Actor", async () => {
    const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
    const actor = {
      pubkey,
      privateKeyEncrypted: "fake-encrypted-data",
      encryption: {
        salt: "fake-salt",
        iv: "fake-iv",
        iterations: 1000,
        hash: "SHA-256",
        algorithm: "AES-GCM",
        version: 1
      },
      createdAt: Date.now(),
    };

    persistSessionActor(actor);
    assert.ok(readStoredSessionActorEntry());

    clearStoredSessionActor();
    assert.strictEqual(readStoredSessionActorEntry(), null);
  });
});
