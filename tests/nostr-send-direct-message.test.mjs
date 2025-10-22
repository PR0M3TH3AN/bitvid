import assert from "node:assert/strict";
import test from "node:test";

const RELAY_URL = "wss://relay.unit.test";

test("sendDirectMessage succeeds with private key signer and no extension", async () => {
  const previousCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrTools = globalThis.NostrTools;
  const previousReady = globalThis.nostrToolsReady;

  const nostrTools = await import("nostr-tools");
  const canonicalTools = { ...nostrTools };
  if (typeof canonicalTools.signEvent !== "function") {
    canonicalTools.signEvent = (event, privateKey) => {
      const finalized = canonicalTools.finalizeEvent(event, privateKey);
      return finalized.sig;
    };
  }

  try {
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = canonicalTools;
    globalThis.NostrTools = canonicalTools;
    globalThis.nostrToolsReady = Promise.resolve({
      ok: true,
      value: canonicalTools,
    });

    const { nostrClient, getActiveSigner, clearActiveSigner } = await import(
      "../js/nostr.js"
    );

    const previousPool = nostrClient.pool;
    const previousRelays = Array.isArray(nostrClient.relays)
      ? [...nostrClient.relays]
      : nostrClient.relays;
    const previousPubkey = nostrClient.pubkey;
    const previousSessionActor = nostrClient.sessionActor;
    const previousLockedSessionActor = nostrClient.lockedSessionActor;

    const publishInvocations = [];
    nostrClient.pool = {
      publish(urls, event) {
        publishInvocations.push({ urls, event });
        return {
          on(eventName, handler) {
            if (eventName === "ok") {
              setTimeout(() => handler(), 0);
            }
            return true;
          },
        };
      },
    };
    nostrClient.relays = [RELAY_URL];

    const senderPrivateKey = canonicalTools.utils.bytesToHex(
      canonicalTools.generateSecretKey(),
    );
    const senderPubkey = canonicalTools.getPublicKey(senderPrivateKey);
    const recipientSecret = canonicalTools.generateSecretKey();
    const recipientPrivateKey = canonicalTools.utils.bytesToHex(recipientSecret);
    const recipientPubkey = canonicalTools.getPublicKey(recipientSecret);

    await nostrClient.registerPrivateKeySigner({
      privateKey: senderPrivateKey,
      pubkey: senderPubkey,
    });
    nostrClient.pubkey = senderPubkey;

    const signer = getActiveSigner();
    const originalSignEvent = signer?.signEvent;
    const originalNip04 = signer?.nip04Encrypt;
    const originalNip44 = signer?.nip44Encrypt;
    if (signer) {
      signer.signEvent = (event) => {
        const finalized = canonicalTools.finalizeEvent(event, senderPrivateKey);
        return { ...event, id: finalized.id, sig: finalized.sig };
      };
      delete signer.nip04Encrypt;
      delete signer.nip44Encrypt;
    }

    const message = "bitvid direct message smoke test";
    const result = await nostrClient.sendDirectMessage(recipientPubkey, message);

    assert.deepEqual(result, { ok: true }, "sendDirectMessage should resolve successfully");
    assert.equal(publishInvocations.length, 1, "exactly one relay publish should be attempted");

    const [{ urls, event }] = publishInvocations;
    assert.deepEqual(urls, [RELAY_URL], "publish should target the configured relay");
    assert.equal(event.kind, 4, "event kind should be 4 for direct messages");
    assert.equal(event.pubkey, senderPubkey, "event should be authored by the sender");
    assert.equal(typeof event.content, "string", "ciphertext should be a string");
    assert.notEqual(event.content, "", "ciphertext should not be empty");

    const decrypted = await canonicalTools.nip04.decrypt(
      recipientPrivateKey,
      senderPubkey,
      event.content,
    );
    assert.equal(decrypted, message, "recipient should decrypt the original message");

    if (signer) {
      signer.signEvent = originalSignEvent;
      signer.nip04Encrypt = originalNip04;
      signer.nip44Encrypt = originalNip44;
    }

    clearActiveSigner();
    nostrClient.pool = previousPool;
    nostrClient.relays = previousRelays;
    nostrClient.pubkey = previousPubkey;
    nostrClient.sessionActor = previousSessionActor;
    nostrClient.lockedSessionActor = previousLockedSessionActor;
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
