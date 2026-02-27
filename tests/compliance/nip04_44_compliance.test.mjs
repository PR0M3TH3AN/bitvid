
import test from 'node:test';
import assert from 'node:assert/strict';
import * as RealNostrTools from 'nostr-tools';
import { utils } from 'nostr-tools';

const { bytesToHex } = utils;

// Polyfill minimal window/localStorage
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    crypto: globalThis.crypto,
    location: { protocol: 'https:' }
  };
}

test('NIP-04/44 Compliance: Encryption Preference', async (t) => {
  const { createNip46Cipher } = await import('../../js/nostr/nip46Client.js');

  const privateKey = RealNostrTools.generateSecretKey();
  const privateKeyHex = bytesToHex(privateKey);
  const remoteKey = RealNostrTools.generateSecretKey();
  const remotePubkeyHex = RealNostrTools.getPublicKey(remoteKey); // getPublicKey expects Uint8Array in v2, returns hex string

  const toolsMock = {
    nip44: { ...RealNostrTools.nip44 }, // Shallow copy to allow attaching v2 if missing
    nip04: RealNostrTools.nip04,
    utils: RealNostrTools.utils // Needed for hexToBytes conversion in nip46Client
  };

  // Ensure toolsMock.nip44.v2 is explicitly available for resolveAvailableNip46Ciphers
  if (!toolsMock.nip44.v2 && RealNostrTools.nip44.v2) {
      toolsMock.nip44.v2 = RealNostrTools.nip44.v2;
  }

  // Debug logging to inspect structure
  console.log('DEBUG: toolsMock.nip44 keys:', Object.keys(toolsMock.nip44));
  if (toolsMock.nip44.v2) {
      console.log('DEBUG: toolsMock.nip44.v2 keys:', Object.keys(toolsMock.nip44.v2));
      console.log('DEBUG: toolsMock.nip44.v2.utils keys:', toolsMock.nip44.v2.utils ? Object.keys(toolsMock.nip44.v2.utils) : 'undefined');
  }

  await t.test('createNip46Cipher prefers nip44.v2 when available', async () => {
    // Verify the mock structure matches what nip46Client expects
    const hasV2 = !!(toolsMock.nip44?.v2?.encrypt && toolsMock.nip44?.v2?.decrypt);
    if (!hasV2) {
        console.warn('Test Warning: nip44.v2 methods missing from toolsMock');
    }
    const cipher = createNip46Cipher(toolsMock, privateKeyHex, remotePubkeyHex);
    assert.equal(cipher.algorithm, 'nip44.v2');

    const plaintext = 'test message';
    const ciphertext = await cipher.encrypt(plaintext);

    assert.match(ciphertext, /^[A-Za-z0-9+/=]+$/, 'Ciphertext should be base64 (NIP-44 style)');
    assert.doesNotMatch(ciphertext, /\?iv=/, 'Ciphertext should not contain ?iv= (NIP-04 style)');
  });

  await t.test('createNip46Cipher falls back to nip04 if nip44 is missing', async () => {
    const toolsNoNip44 = {
        nip04: RealNostrTools.nip04
    };

    const cipher = createNip46Cipher(toolsNoNip44, privateKeyHex, remotePubkeyHex);
    assert.equal(cipher.algorithm, 'nip04');

    const plaintext = 'test message';
    const ciphertext = await cipher.encrypt(plaintext);

    assert.match(ciphertext, /\?iv=/, 'Ciphertext should contain ?iv= (NIP-04 style)');
  });
});

test('NIP-04/44 Compliance: Decryption Fallback', async (t) => {
    const { decryptNip46PayloadWithKeys } = await import('../../js/nostr/nip46Client.js');

    // Inject tools globally so decryptNip46PayloadWithKeys can find them via getCachedNostrTools
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = {
        nip44: RealNostrTools.nip44,
        nip04: RealNostrTools.nip04,
        nip19: RealNostrTools.nip19,
        getPublicKey: RealNostrTools.getPublicKey,
        utils: RealNostrTools.utils
    };
    // Ensure tools.nip44.v2 is available for resolveAvailableNip46Ciphers -> resolveNip44V2ConversationKeyGetter
    if (!globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__.nip44.v2) {
        globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__.nip44.v2 = RealNostrTools.nip44.v2;
    }

    const privateKey = RealNostrTools.generateSecretKey();
    const privateKeyHex = bytesToHex(privateKey);
    const remoteKey = RealNostrTools.generateSecretKey();
    const remotePubkeyHex = RealNostrTools.getPublicKey(remoteKey);

    await t.test('decryptNip46PayloadWithKeys handles nip44 (v2) payload', async () => {
        // nip44.v2.utils.getConversationKey expects Uint8Array private key and hex string public key
        const skBytes = RealNostrTools.utils.hexToBytes(privateKeyHex);
        const conversationKey = RealNostrTools.nip44.v2.utils.getConversationKey(skBytes, remotePubkeyHex);
        const plaintext = 'secret nip44 message';
        const ciphertext = RealNostrTools.nip44.v2.encrypt(plaintext, conversationKey);

        const result = await decryptNip46PayloadWithKeys(privateKeyHex, remotePubkeyHex, ciphertext);
        assert.equal(result.plaintext, plaintext);
        assert.equal(result.algorithm, 'nip44.v2');
    });

    await t.test('decryptNip46PayloadWithKeys handles nip04 payload', async () => {
        const plaintext = 'secret nip04 message';
        const ciphertext = await RealNostrTools.nip04.encrypt(privateKeyHex, remotePubkeyHex, plaintext);

        const result = await decryptNip46PayloadWithKeys(privateKeyHex, remotePubkeyHex, ciphertext);
        assert.equal(result.plaintext, plaintext);
        assert.equal(result.algorithm, 'nip04');
    });
});
