import { test } from "node:test";
import assert from "node:assert/strict";
import * as sessionActor from "../../js/nostr/sessionActor.js";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
// Ensure localStorage is available
import "../test-helpers/setup-localstorage.mjs";

// Polyfill IndexedDB
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

test("SessionActor", async (t) => {
  const passphrase = "correct-horse-battery-staple";
  const privateKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  await t.test("encrypts and decrypts private key", async () => {
    const encrypted = await sessionActor.encryptSessionPrivateKey(privateKey, passphrase);

    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.salt);
    assert.ok(encrypted.iv);
    assert.equal(encrypted.algorithm, "AES-GCM");

    const payload = {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: {
        salt: encrypted.salt,
        iv: encrypted.iv,
        iterations: encrypted.iterations,
        hash: encrypted.hash,
        version: encrypted.version,
        algorithm: encrypted.algorithm,
      }
    };

    const decrypted = await sessionActor.decryptSessionPrivateKey(payload, passphrase);
    assert.equal(decrypted, privateKey);
  });

  await t.test("fails to decrypt with wrong passphrase", async () => {
    const encrypted = await sessionActor.encryptSessionPrivateKey(privateKey, passphrase);

    const payload = {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: {
        salt: encrypted.salt,
        iv: encrypted.iv,
      }
    };

    try {
      await sessionActor.decryptSessionPrivateKey(payload, "wrong-password");
      assert.fail("Should have thrown error");
    } catch (error) {
      assert.match(error.message, /Failed to decrypt/);
    }
  });

  await t.test("persists and reads session actor", async () => {
    // Clean up first
    localStorage.clear();
    sessionActor.clearStoredSessionActor();

    const actor = {
      pubkey: "pubkey123",
      privateKeyEncrypted: "encrypteddata",
      encryption: {
        salt: "salt",
        iv: "iv",
        iterations: 1000,
      },
      createdAt: Date.now(),
    };

    sessionActor.persistSessionActor(actor);

    // Verify localStorage
    const stored = JSON.parse(localStorage.getItem(sessionActor.SESSION_ACTOR_STORAGE_KEY));
    assert.equal(stored.pubkey, actor.pubkey);
    assert.equal(stored.privateKeyEncrypted, actor.privateKeyEncrypted);

    // Verify read
    const read = sessionActor.readStoredSessionActorEntry();
    assert.ok(read);
    assert.equal(read.pubkey, actor.pubkey);
    assert.equal(read.privateKeyEncrypted, actor.privateKeyEncrypted);
    assert.equal(read.encryption.salt, actor.encryption.salt);
  });

  await t.test("clears stored session actor", async () => {
    const actor = {
        pubkey: "pubkey123",
        privateKeyEncrypted: "encrypteddata",
        encryption: { salt: "salt", iv: "iv" }
    };
    sessionActor.persistSessionActor(actor);
    sessionActor.clearStoredSessionActor();

    const read = sessionActor.readStoredSessionActorEntry();
    assert.equal(read, null);
    assert.equal(localStorage.getItem(sessionActor.SESSION_ACTOR_STORAGE_KEY), null);
  });
});
