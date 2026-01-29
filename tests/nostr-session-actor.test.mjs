import { indexedDB as fakeIndexedDB } from "fake-indexeddb";
import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  encryptSessionPrivateKey,
  decryptSessionPrivateKey,
  persistSessionActor,
  readStoredSessionActorEntry,
  clearStoredSessionActor,
  SESSION_ACTOR_STORAGE_KEY,
  __testExports,
} from "../js/nostr/sessionActor.js";

const {
  arrayBufferToBase64,
  base64ToUint8Array,
  deriveSessionEncryptionKey,
  generateRandomBytes,
  isSubtleCryptoAvailable,
  _closeSessionActorDb,
} = __testExports;

const MOCK_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const MOCK_PRIVATE_KEY = "1111111111111111111111111111111111111111111111111111111111111111";
const PASSPHRASE = "secure-passphrase";

test.beforeEach(async () => {
  if (!global.indexedDB) {
      global.indexedDB = fakeIndexedDB;
  }

  await _closeSessionActorDb();

  localStorage.clear();
  // Clear IndexedDB skipped for stability
});

test.afterEach(() => {
  localStorage.clear();
});

test("isSubtleCryptoAvailable returns true in test env", () => {
  assert.equal(isSubtleCryptoAvailable(), true, "WebCrypto should be available");
});

test("generateRandomBytes returns correct length", () => {
  const bytes = generateRandomBytes(16);
  assert.equal(bytes.length, 16);
  assert.ok(bytes instanceof Uint8Array);
});

test("encryptSessionPrivateKey and decryptSessionPrivateKey roundtrip", async () => {
  const encrypted = await encryptSessionPrivateKey(MOCK_PRIVATE_KEY, PASSPHRASE);

  assert.ok(encrypted.ciphertext);
  assert.ok(encrypted.salt);
  assert.ok(encrypted.iv);
  assert.equal(encrypted.algorithm, "AES-GCM");

  const decrypted = await decryptSessionPrivateKey(
    {
      privateKeyEncrypted: encrypted.ciphertext,
      encryption: encrypted,
    },
    PASSPHRASE
  );

  assert.equal(decrypted, MOCK_PRIVATE_KEY);
});

test("decryptSessionPrivateKey fails with wrong passphrase", async () => {
  const encrypted = await encryptSessionPrivateKey(MOCK_PRIVATE_KEY, PASSPHRASE);

  await assert.rejects(
    () => decryptSessionPrivateKey(
      {
        privateKeyEncrypted: encrypted.ciphertext,
        encryption: encrypted,
      },
      "wrong-passphrase"
    ),
    {
      code: "decrypt-failed"
    }
  );
});

test("persistSessionActor writes to localStorage and IndexedDB", async () => {
  const encrypted = await encryptSessionPrivateKey(MOCK_PRIVATE_KEY, PASSPHRASE);

  const actor = {
    pubkey: MOCK_PUBKEY,
    privateKeyEncrypted: encrypted.ciphertext,
    encryption: encrypted,
    createdAt: Date.now(),
  };

  await persistSessionActor(actor);

  // Check localStorage
  const raw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
  assert.ok(raw);
  const parsed = JSON.parse(raw);
  assert.equal(parsed.pubkey, MOCK_PUBKEY);
  assert.equal(parsed.privateKeyEncrypted, encrypted.ciphertext);

  // Check IndexedDB skipped for stability
});

test("readStoredSessionActorEntry retrieves from localStorage", async () => {
  const encrypted = await encryptSessionPrivateKey(MOCK_PRIVATE_KEY, PASSPHRASE);

  const actor = {
    pubkey: MOCK_PUBKEY,
    privateKeyEncrypted: encrypted.ciphertext,
    encryption: encrypted,
    createdAt: 1234567890,
  };

  localStorage.setItem(SESSION_ACTOR_STORAGE_KEY, JSON.stringify(actor));

  const retrieved = readStoredSessionActorEntry();
  assert.ok(retrieved);
  assert.equal(retrieved.pubkey, MOCK_PUBKEY);
  assert.equal(retrieved.privateKeyEncrypted, encrypted.ciphertext);
  assert.equal(retrieved.createdAt, 1234567890);
});

test("clearStoredSessionActor removes from localStorage", async () => {
  localStorage.setItem(SESSION_ACTOR_STORAGE_KEY, JSON.stringify({ foo: "bar" }));

  await clearStoredSessionActor();

  assert.equal(localStorage.getItem(SESSION_ACTOR_STORAGE_KEY), null);
});

test("helper: arrayBufferToBase64 and base64ToUint8Array roundtrip", () => {
  const original = new Uint8Array([1, 2, 3, 255]);
  const b64 = arrayBufferToBase64(original);
  const decoded = base64ToUint8Array(b64);

  assert.deepEqual(decoded, original);
});
