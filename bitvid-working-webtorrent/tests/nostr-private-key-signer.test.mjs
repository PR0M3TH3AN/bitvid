import assert from "node:assert/strict";
import test from "node:test";

test("registerPrivateKeySigner exposes nip04 helpers", async () => {
  const previousCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrTools = globalThis.NostrTools;
  const previousReady = globalThis.nostrToolsReady;

  const nostrTools = await import("nostr-tools");
  const canonicalTools = { ...nostrTools };

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

    const privateKeyBytes = nostrTools.generateSecretKey();
    const privateKeyHex = nostrTools.utils.bytesToHex(privateKeyBytes);
    const recipientKeyBytes = nostrTools.generateSecretKey();
    const recipientPrivateHex = nostrTools.utils.bytesToHex(recipientKeyBytes);
    const recipientPubkey = nostrTools.getPublicKey(recipientKeyBytes);

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
