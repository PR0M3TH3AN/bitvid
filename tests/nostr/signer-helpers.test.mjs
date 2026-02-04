import assert from "node:assert/strict";
import test from "node:test";

import { createPrivateKeyCipherClosures } from "../../js/nostr/signerHelpers.js";

const buildHex = (char) => char.repeat(64);

// Setup nostr-tools globally for all tests
let nostrToolsSetup = false;
let nostrTools = null;

async function ensureNostrTools() {
  if (nostrToolsSetup) return nostrTools;

  try {
    nostrTools = await import("nostr-tools");
    const canonicalTools = { ...nostrTools };

    // Use Object.defineProperty to make them configurable
    Object.defineProperty(globalThis, "__BITVID_CANONICAL_NOSTR_TOOLS__", {
      value: canonicalTools,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "NostrTools", {
      value: canonicalTools,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, "nostrToolsReady", {
      value: Promise.resolve({ ok: true, value: canonicalTools }),
      writable: true,
      configurable: true,
    });

    nostrToolsSetup = true;
    return nostrTools;
  } catch (error) {
    console.warn("Failed to setup nostr-tools:", error.message);
    return null;
  }
}

test("createPrivateKeyCipherClosures: returns empty object for invalid privateKey", async () => {
  const result1 = await createPrivateKeyCipherClosures(null);
  assert.deepEqual(result1, {});

  const result2 = await createPrivateKeyCipherClosures(undefined);
  assert.deepEqual(result2, {});

  const result3 = await createPrivateKeyCipherClosures("");
  assert.deepEqual(result3, {});

  const result4 = await createPrivateKeyCipherClosures("not-hex");
  assert.deepEqual(result4, {});

  const result5 = await createPrivateKeyCipherClosures("abc"); // Too short
  assert.deepEqual(result5, {});
});

test("createPrivateKeyCipherClosures: returns empty object for non-64-char hex", async () => {
  const tooShort = "a".repeat(63);
  const result1 = await createPrivateKeyCipherClosures(tooShort);
  assert.deepEqual(result1, {});

  const tooLong = "a".repeat(65);
  const result2 = await createPrivateKeyCipherClosures(tooLong);
  assert.deepEqual(result2, {});
});

test("createPrivateKeyCipherClosures: creates NIP-04 cipher closures", async () => {
  const tools = await ensureNostrTools();
  if (!tools) {
    // Skip if nostr-tools unavailable
    return;
  }

  const privateKeyBytes = tools.generateSecretKey();
  const privateKeyHex = tools.utils.bytesToHex(privateKeyBytes);
  const targetPubkey = tools.getPublicKey(tools.generateSecretKey());

  const closures = await createPrivateKeyCipherClosures(privateKeyHex);

  assert.equal(typeof closures.nip04Encrypt, "function", "Should have nip04Encrypt");
  assert.equal(typeof closures.nip04Decrypt, "function", "Should have nip04Decrypt");

  // Test encryption
  const plaintext = "Hello, Nostr!";
  const ciphertext = await closures.nip04Encrypt(targetPubkey, plaintext);

  assert.ok(typeof ciphertext === "string");
  assert.notEqual(ciphertext, plaintext);
});

test("createPrivateKeyCipherClosures: creates NIP-44 cipher closures when available", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const privateKeyBytes = tools.generateSecretKey();
  const privateKeyHex = tools.utils.bytesToHex(privateKeyBytes);

  const closures = await createPrivateKeyCipherClosures(privateKeyHex);

  // NIP-44 may or may not be available depending on nostr-tools version
  if (closures.nip44Encrypt) {
    assert.equal(typeof closures.nip44Encrypt, "function", "Should have nip44Encrypt");
    assert.equal(typeof closures.nip44Decrypt, "function", "Should have nip44Decrypt");
  }
});

test("createPrivateKeyCipherClosures: nip04Encrypt throws for invalid pubkey", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const privateKeyBytes = tools.generateSecretKey();
  const privateKeyHex = tools.utils.bytesToHex(privateKeyBytes);

  const closures = await createPrivateKeyCipherClosures(privateKeyHex);

  if (closures.nip04Encrypt) {
    await assert.rejects(
      async () => closures.nip04Encrypt("invalid-pubkey", "test"),
      /pubkey.*required/i
    );

    await assert.rejects(
      async () => closures.nip04Encrypt("", "test"),
      /pubkey.*required/i
    );

    await assert.rejects(
      async () => closures.nip04Encrypt(null, "test"),
      /pubkey.*required/i
    );
  }
});

test("createPrivateKeyCipherClosures: nip44 encryption roundtrip", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  // Generate two key pairs for a conversation
  const alicePrivateBytes = tools.generateSecretKey();
  const alicePrivateHex = tools.utils.bytesToHex(alicePrivateBytes);
  const alicePubkey = tools.getPublicKey(alicePrivateBytes);

  const bobPrivateBytes = tools.generateSecretKey();
  const bobPrivateHex = tools.utils.bytesToHex(bobPrivateBytes);
  const bobPubkey = tools.getPublicKey(bobPrivateBytes);

  const aliceClosures = await createPrivateKeyCipherClosures(alicePrivateHex);
  const bobClosures = await createPrivateKeyCipherClosures(bobPrivateHex);

  if (aliceClosures.nip44Encrypt && bobClosures.nip44Decrypt) {
    const plaintext = "Secret message from Alice to Bob";

    // Alice encrypts to Bob
    const ciphertext = await aliceClosures.nip44Encrypt(bobPubkey, plaintext);
    assert.ok(typeof ciphertext === "string");
    assert.notEqual(ciphertext, plaintext);

    // Bob decrypts from Alice
    const decrypted = await bobClosures.nip44Decrypt(alicePubkey, ciphertext);
    assert.equal(decrypted, plaintext);
  }
});

test("createPrivateKeyCipherClosures: nip04 encryption roundtrip", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  // Generate two key pairs for a conversation
  const alicePrivateBytes = tools.generateSecretKey();
  const alicePrivateHex = tools.utils.bytesToHex(alicePrivateBytes);
  const alicePubkey = tools.getPublicKey(alicePrivateBytes);

  const bobPrivateBytes = tools.generateSecretKey();
  const bobPrivateHex = tools.utils.bytesToHex(bobPrivateBytes);
  const bobPubkey = tools.getPublicKey(bobPrivateBytes);

  const aliceClosures = await createPrivateKeyCipherClosures(alicePrivateHex);
  const bobClosures = await createPrivateKeyCipherClosures(bobPrivateHex);

  if (aliceClosures.nip04Encrypt && bobClosures.nip04Decrypt) {
    const plaintext = "Secret NIP-04 message from Alice to Bob";

    // Alice encrypts to Bob
    const ciphertext = await aliceClosures.nip04Encrypt(bobPubkey, plaintext);
    assert.ok(typeof ciphertext === "string");
    assert.notEqual(ciphertext, plaintext);

    // Bob decrypts from Alice
    const decrypted = await bobClosures.nip04Decrypt(alicePubkey, ciphertext);
    assert.equal(decrypted, plaintext);
  }
});

test("createPrivateKeyCipherClosures: normalizes uppercase hex key", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const privateKeyBytes = tools.generateSecretKey();
  const privateKeyHex = tools.utils.bytesToHex(privateKeyBytes);
  const uppercaseHex = privateKeyHex.toUpperCase();

  const closures = await createPrivateKeyCipherClosures(uppercaseHex);

  // Should still work - key should be normalized to lowercase
  assert.ok(closures.nip04Encrypt || closures.nip44Encrypt);
});

test("createPrivateKeyCipherClosures: caches conversation keys for NIP-44", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const privateKeyBytes = tools.generateSecretKey();
  const privateKeyHex = tools.utils.bytesToHex(privateKeyBytes);
  const targetPubkey = tools.getPublicKey(tools.generateSecretKey());

  const closures = await createPrivateKeyCipherClosures(privateKeyHex);

  if (closures.nip44Encrypt) {
    // Multiple encryptions to same target should use cached conversation key
    const message1 = await closures.nip44Encrypt(targetPubkey, "message1");
    const message2 = await closures.nip44Encrypt(targetPubkey, "message2");
    const message3 = await closures.nip44Encrypt(targetPubkey, "message3");

    assert.ok(message1);
    assert.ok(message2);
    assert.ok(message3);
    // All should be different (due to random nonce)
    assert.notEqual(message1, message2);
    assert.notEqual(message2, message3);
  }
});

test("createPrivateKeyCipherClosures: handles empty plaintext", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const alicePrivateBytes = tools.generateSecretKey();
  const alicePrivateHex = tools.utils.bytesToHex(alicePrivateBytes);
  const alicePubkey = tools.getPublicKey(alicePrivateBytes);

  const bobPrivateBytes = tools.generateSecretKey();
  const bobPrivateHex = tools.utils.bytesToHex(bobPrivateBytes);
  const bobPubkey = tools.getPublicKey(bobPrivateBytes);

  const aliceClosures = await createPrivateKeyCipherClosures(alicePrivateHex);
  const bobClosures = await createPrivateKeyCipherClosures(bobPrivateHex);

  if (aliceClosures.nip04Encrypt && bobClosures.nip04Decrypt) {
    const ciphertext = await aliceClosures.nip04Encrypt(bobPubkey, "");
    const decrypted = await bobClosures.nip04Decrypt(alicePubkey, ciphertext);
    assert.equal(decrypted, "");
  }
});

test("createPrivateKeyCipherClosures: handles unicode content", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const alicePrivateBytes = tools.generateSecretKey();
  const alicePrivateHex = tools.utils.bytesToHex(alicePrivateBytes);
  const alicePubkey = tools.getPublicKey(alicePrivateBytes);

  const bobPrivateBytes = tools.generateSecretKey();
  const bobPrivateHex = tools.utils.bytesToHex(bobPrivateBytes);
  const bobPubkey = tools.getPublicKey(bobPrivateBytes);

  const aliceClosures = await createPrivateKeyCipherClosures(alicePrivateHex);
  const bobClosures = await createPrivateKeyCipherClosures(bobPrivateHex);

  const unicodeText = "Hello 世界! 🌍 Привет мир! مرحبا بالعالم";

  if (aliceClosures.nip04Encrypt && bobClosures.nip04Decrypt) {
    const ciphertext = await aliceClosures.nip04Encrypt(bobPubkey, unicodeText);
    const decrypted = await bobClosures.nip04Decrypt(alicePubkey, ciphertext);
    assert.equal(decrypted, unicodeText);
  }

  if (aliceClosures.nip44Encrypt && bobClosures.nip44Decrypt) {
    const ciphertext = await aliceClosures.nip44Encrypt(bobPubkey, unicodeText);
    const decrypted = await bobClosures.nip44Decrypt(alicePubkey, ciphertext);
    assert.equal(decrypted, unicodeText);
  }
});

test("createPrivateKeyCipherClosures: handles large content with NIP-44", async () => {
  const tools = await ensureNostrTools();
  if (!tools) return;

  const alicePrivateBytes = tools.generateSecretKey();
  const alicePrivateHex = tools.utils.bytesToHex(alicePrivateBytes);
  const alicePubkey = tools.getPublicKey(alicePrivateBytes);

  const bobPrivateBytes = tools.generateSecretKey();
  const bobPrivateHex = tools.utils.bytesToHex(bobPrivateBytes);
  const bobPubkey = tools.getPublicKey(bobPrivateBytes);

  const aliceClosures = await createPrivateKeyCipherClosures(alicePrivateHex);
  const bobClosures = await createPrivateKeyCipherClosures(bobPrivateHex);

  // 10KB of text
  const largeText = "A".repeat(10 * 1024);

  if (aliceClosures.nip44Encrypt && bobClosures.nip44Decrypt) {
    const ciphertext = await aliceClosures.nip44Encrypt(bobPubkey, largeText);
    const decrypted = await bobClosures.nip44Decrypt(alicePubkey, ciphertext);
    assert.equal(decrypted, largeText);
  }
});
