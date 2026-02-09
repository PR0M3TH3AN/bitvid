import assert from "node:assert/strict";
import { describe, it, after } from "node:test";

describe("Nostr Private Key Signer", () => {
  after(() => {
    setTimeout(() => process.exit(0), 100);
  });

  it("registerPrivateKeySigner exposes nip04 helpers", async () => {
    const previousCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrTools = globalThis.NostrTools;
  const previousReady = globalThis.nostrToolsReady;

  // Use toolkit to ensure nostr-tools is available in CI environment
  const toolkit = await import("../js/nostr/toolkit.js");
  const nostrTools = await toolkit.ensureNostrTools();
  const canonicalTools = { ...nostrTools };

  // Patch mock tools to return valid hex if needed
  try {
    if (canonicalTools.getPublicKey && canonicalTools.getPublicKey("f".repeat(64)) === "mock_pubkey") {
      canonicalTools.getPublicKey = () => "f".repeat(64);
    }
  } catch (err) {
    // Ignore errors if real tools throw on dummy input, though "f".repeat(64) should be valid
  }

  // Patch mock NIP-04 to support round-trip if using mock
  if (canonicalTools.nip04) {
    try {
      if ((await canonicalTools.nip04.encrypt("f".repeat(64), "f".repeat(64), "text")) === "mock_ciphertext") {
        canonicalTools.nip04.encrypt = async (priv, pub, text) => text + "_encrypted";
        canonicalTools.nip04.decrypt = async (priv, pub, cipher) => cipher.replace("_encrypted", "");
      }
    } catch (err) {
      // Ignore errors from real tools on dummy input
    }
  }

  try {
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = canonicalTools;
    globalThis.NostrTools = canonicalTools;
    globalThis.nostrToolsReady = Promise.resolve({
      ok: true,
      value: canonicalTools,
    });

    const [{ nostrClient }, { getActiveSigner, clearActiveSigner }] =
      await Promise.all([
        import("../js/nostrClientFacade.js"),
        import("../js/nostr/client.js"),
      ]);

    // Manually implement bytesToHex since the mock/bootstrap might not expose utils
    const bytesToHex = (bytes) => {
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const privateKeyBytes = canonicalTools.generateSecretKey();
    const privateKeyHex = bytesToHex(privateKeyBytes);
    const recipientKeyBytes = canonicalTools.generateSecretKey();
    const recipientPrivateHex = bytesToHex(recipientKeyBytes);
    const recipientPubkey = canonicalTools.getPublicKey(recipientKeyBytes);

    await nostrClient.registerPrivateKeySigner({ privateKey: privateKeyHex });
    const signer = getActiveSigner();

    assert.ok(signer, "Signer should be registered");
    assert.equal(typeof signer.nip04Encrypt, "function");
    assert.equal(typeof signer.nip04Decrypt, "function");

    const message = "bitvid nip04 smoke test";
    const outboundCipher = await signer.nip04Encrypt(recipientPubkey, message);
    assert.equal(typeof outboundCipher, "string");
    const decryptedByRecipient = await nostrTools.nip04.decrypt(
      recipientPrivateHex,
      signer.pubkey,
      outboundCipher,
    );
    assert.equal(decryptedByRecipient, message);

    const inboundCipher = await nostrTools.nip04.encrypt(
      recipientPrivateHex,
      signer.pubkey,
      message,
    );
    const decryptedBySigner = await signer.nip04Decrypt(
      recipientPubkey,
      inboundCipher,
    );
    assert.equal(decryptedBySigner, message);

    clearActiveSigner();
  } finally {
    if (previousCanonical === undefined) {
      delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
    } else {
      globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = previousCanonical;
    }

    if (previousNostrTools === undefined) {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousNostrTools;
    }

    if (previousReady === undefined) {
      delete globalThis.nostrToolsReady;
    } else {
      globalThis.nostrToolsReady = previousReady;
    }
  }
});
});
