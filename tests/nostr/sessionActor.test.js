import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

const originalCrypto = globalThis.crypto;
if (originalCrypto === undefined) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
    writable: false,
    enumerable: false,
  });
}

import {
  encryptSessionPrivateKey,
  decryptSessionPrivateKey,
  persistSessionActor,
  readStoredSessionActorEntry,
  clearStoredSessionActor,
  SESSION_ACTOR_STORAGE_KEY,
} from "../../js/nostr/sessionActor.js";

test.after(() => {
  clearStoredSessionActor();
  if (originalCrypto === undefined) {
    delete globalThis.crypto;
  }
});

test("encryptSessionPrivateKey + decryptSessionPrivateKey roundtrip", async () => {
  clearStoredSessionActor();
  const privateKey = "a".repeat(64);
  const passphrase = "correct horse";

  const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);
  assert.match(encrypted.ciphertext, /.+/);
  assert.ok(encrypted.salt.length > 0);
  assert.ok(encrypted.iv.length > 0);

  const decrypted = await decryptSessionPrivateKey(
    {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
    },
    passphrase,
  );

  assert.strictEqual(decrypted, privateKey);
});

test("persistSessionActor stores plain-text session actors", () => {
  clearStoredSessionActor();

  persistSessionActor({
    pubkey: "npub1test",
    privateKey: "b".repeat(64),
    createdAt: 123,
  });

  const raw = globalThis.localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
  assert.ok(raw, "session actor should be persisted");

  const parsed = JSON.parse(raw);
  assert.deepStrictEqual(parsed, {
    pubkey: "npub1test",
    privateKey: "b".repeat(64),
    createdAt: 123,
  });
});

test("persistSessionActor stores encrypted payload metadata", async () => {
  clearStoredSessionActor();

  const privateKey = "c".repeat(64);
  const passphrase = "battery staple";
  const encrypted = await encryptSessionPrivateKey(privateKey, passphrase);

  persistSessionActor({
    pubkey: "npub1encrypted",
    privateKeyEncrypted: encrypted.ciphertext,
    encryption: encrypted,
    createdAt: 456,
  });

  const entry = readStoredSessionActorEntry();
  assert.ok(entry);
  assert.strictEqual(entry.pubkey, "npub1encrypted");
  assert.strictEqual(entry.privateKey, "");
  assert.strictEqual(entry.privateKeyEncrypted, encrypted.ciphertext);
  assert.deepStrictEqual(entry.encryption, {
    version: encrypted.version,
    algorithm: encrypted.algorithm,
    salt: encrypted.salt,
    iv: encrypted.iv,
    iterations: encrypted.iterations,
    hash: encrypted.hash,
  });
  assert.strictEqual(entry.createdAt, 456);

  const raw = globalThis.localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.privateKey, undefined);
  assert.strictEqual(parsed.pubkey, "npub1encrypted");
  assert.strictEqual(parsed.privateKeyEncrypted, encrypted.ciphertext);
});

test("clearStoredSessionActor removes persisted payload", () => {
  clearStoredSessionActor();
  persistSessionActor({
    pubkey: "npub1cleanup",
    privateKey: "d".repeat(64),
  });
  assert.ok(globalThis.localStorage.getItem(SESSION_ACTOR_STORAGE_KEY));

  clearStoredSessionActor();
  assert.strictEqual(
    globalThis.localStorage.getItem(SESSION_ACTOR_STORAGE_KEY),
    null,
  );
});
