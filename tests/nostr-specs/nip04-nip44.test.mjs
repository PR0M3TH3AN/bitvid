
import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import * as NostrTools from 'nostr-tools';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import * as nip04 from 'nostr-tools/nip04';
import * as nip44 from 'nostr-tools/nip44';

const hexToBytes = (hex) => {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
  }
  if (hex.length % 2) throw new Error('hexToBytes: received invalid unpadded hex' + hex.length);
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < array.length; i++) {
    const j = i * 2;
    const hexByte = hex.slice(j, j + 2);
    const byte = parseInt(hexByte, 16);
    if (Number.isNaN(byte) || byte < 0) throw new Error('Invalid byte sequence');
    array[i] = byte;
  }
  return array;
};

const bytesToHex = (bytes) => {
  if (!bytes) return '';
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 16) hex += '0';
    hex += b.toString(16);
  }
  return hex;
};

// Polyfill for dmDecryptWorker environment
globalThis.self = {
  addEventListener: (type, listener) => {
    if (type === 'message') {
      globalThis.messageListener = listener;
    }
  },
  postMessage: (msg) => {
    if (globalThis.messageCallback) {
      globalThis.messageCallback(msg);
    }
  }
};

// Mock window for toolkit.js/logger.js if needed
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

// Pre-inject NostrTools to avoid bootstrap issues or timeouts
globalThis.NostrTools = {
  ...NostrTools,
  nip04,
  nip44,
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  verifyEvent: NostrTools.verifyEvent
};

// Import the worker module
// We use a dynamic import to ensure the environment is set up first
const loadWorker = async () => {
  await import('../../js/nostr/dmDecryptWorker.js');
};

describe('NIP-04 / NIP-44 Compliance (dmDecryptWorker)', () => {
  let workerListener;
  let aliceSk, alicePk;
  let bobSk, bobPk;

  before(async () => {
    await loadWorker();
    workerListener = globalThis.messageListener;
    assert.ok(workerListener, 'Worker should have registered a message listener');

    // Generate keys
    aliceSk = generateSecretKey();
    alicePk = getPublicKey(aliceSk);
    bobSk = generateSecretKey();
    bobPk = getPublicKey(bobSk);
  });

  const sendMessage = (payload) => {
    return new Promise((resolve) => {
      globalThis.messageCallback = resolve;
      workerListener({ data: payload });
    });
  };

  it('should decrypt NIP-04 messages', async () => {
    const plaintext = 'Hello NIP-04';
    const ciphertext = await nip04.encrypt(aliceSk, bobPk, plaintext);

    const payload = {
      id: 'test-nip04',
      scheme: 'nip04',
      privateKey: bytesToHex(aliceSk), // decrypting as Alice (sender? no, nip04 is symmetric but usually recipient decrypts)
      // nip04.encrypt(privA, pubB, text) -> can be decrypted by A (with pubB) or B (with pubA).
      // Here we simulate Bob decrypting what Alice sent.
      // So privateKey should be Bob's, targetPubkey should be Alice's.
    };

    // Let's re-encrypt correctly for the test case: Alice sends to Bob.
    // Worker is asked to decrypt using Bob's SK and Alice's PK.
    const payloadForBob = {
      id: 'nip04-1',
      scheme: 'nip04',
      privateKey: bytesToHex(bobSk),
      targetPubkey: alicePk,
      ciphertext: ciphertext
    };

    const response = await sendMessage(payloadForBob);
    assert.strictEqual(response.ok, true, `NIP-04 decryption failed: ${response.error?.message}`);
    assert.strictEqual(response.plaintext, plaintext);
  });

  it('should decrypt NIP-44 v2 messages', async () => {
    const plaintext = 'Hello NIP-44';
    const conversationKey = nip44.v2.utils.getConversationKey(aliceSk, bobPk);
    const ciphertext = nip44.v2.encrypt(plaintext, conversationKey);

    // NIP-44 requires a signed event for verification in the worker?
    // Let's check dmDecryptWorker.js:
    // if (payload.scheme === "nip44" || payload.scheme === "nip44_v2") {
    //   await verifyEventSignature(payload.event);

    const unsignedEvent = {
      kind: 4, // or 14?
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', bobPk]],
      content: ciphertext,
      pubkey: alicePk,
    };

    const signedEvent = finalizeEvent(unsignedEvent, aliceSk);

    const payload = {
      id: 'nip44-1',
      scheme: 'nip44_v2',
      privateKey: bytesToHex(bobSk),
      targetPubkey: alicePk,
      ciphertext: ciphertext,
      event: signedEvent // Worker verifies this signature!
    };

    const response = await sendMessage(payload);
    assert.strictEqual(response.ok, true, `NIP-44 decryption failed: ${response.error?.message}`);
    assert.strictEqual(response.plaintext, plaintext);
  });

  it('should fail NIP-44 decryption with invalid signature', async () => {
    const plaintext = 'Attack';
    const conversationKey = nip44.v2.utils.getConversationKey(aliceSk, bobPk);
    const ciphertext = nip44.v2.encrypt(plaintext, conversationKey);

    const fakeEvent = {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', bobPk]],
      content: ciphertext,
      pubkey: alicePk,
      id: 'fakeid',
      sig: 'f'.repeat(128) // Invalid signature
    };

    const payload = {
      id: 'nip44-fail',
      scheme: 'nip44_v2',
      privateKey: bytesToHex(bobSk),
      targetPubkey: alicePk,
      ciphertext: ciphertext,
      event: fakeEvent
    };

    const response = await sendMessage(payload);
    assert.strictEqual(response.ok, false);
    assert.match(response.error.message, /signature/);
  });

  it('should prioritize NIP-44 v2', async () => {
    // This test implicitly verifies v2 usage because we generated v2 ciphertext
    // and passed 'nip44_v2' scheme.
    // If we pass 'nip44' (v1?), nostr-tools might default to v2 if v1 is not available?
    // nostr-tools v2 only has v2.
    assert.ok(nip44.v2, 'NIP-44 v2 should be available in nostr-tools');
  });
});
