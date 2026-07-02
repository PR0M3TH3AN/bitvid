// Sending a NIP-17 DM (kind 1059 gift wrap) must generate an ephemeral wrapper
// keypair. That keygen hex-encodes the generated secret via bytesToHex; a
// missing import made bytesToHex throw (swallowed into "") so keygen returned
// null and every NIP-17 send failed with `nip17-keygen-failed`. The legacy
// (kind 4 / NIP-04) send tests delete nip44Encrypt, so they never exercised
// this path. This test forces the NIP-17 path and asserts a gift wrap is built
// and published.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-nip17-send-gift-wrap
//       given: "a nip44-capable signer and known DM relays"
//       when: "sendDirectMessage is called with useNip17:true"
//       then: "it resolves ok and publishes a kind-1059 gift wrap (no keygen failure)"
//   observable_outcomes:
//     - "result.ok === true (not { error: 'nip17-keygen-failed' })"
//     - "a kind 1059 gift-wrap event is published to the recipient relay"
//   determinism_controls:
//     - "real nostr-tools injected; pool.publish/list stubbed; relay hints supplied"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import assert from "node:assert/strict";
import test, { after } from "node:test";

const RELAY_URL = "wss://relay.nip17.test";

after(() => {
  setTimeout(() => process.exit(0), 100);
});

test("sendDirectMessage (NIP-17) builds and publishes a kind-1059 gift wrap", async () => {
  const previousCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrTools = globalThis.NostrTools;
  const previousReady = globalThis.nostrToolsReady;

  const nostrTools = await import("nostr-tools");
  const canonicalTools = { ...nostrTools };

  try {
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = canonicalTools;
    globalThis.NostrTools = canonicalTools;
    globalThis.nostrToolsReady = Promise.resolve({ ok: true, value: canonicalTools });

    const [{ nostrClient }, { getActiveSigner, clearActiveSigner }] =
      await Promise.all([
        import("../js/nostrClientFacade.js"),
        import("../js/nostr/client.js"),
      ]);

    const previousPool = nostrClient.pool;
    const previousRelays = nostrClient.relays;
    const previousPubkey = nostrClient.pubkey;

    const publishInvocations = [];
    nostrClient.pool = {
      publish(urls, event) {
        publishInvocations.push({ urls, event });
        return {
          on(eventName, handler) {
            if (eventName === "ok") setTimeout(() => handler(), 0);
            return true;
          },
        };
      },
      list() {
        return Promise.resolve([]);
      },
    };
    nostrClient.relays = [RELAY_URL];
    nostrClient.readRelays = [RELAY_URL];
    nostrClient.writeRelays = [RELAY_URL];

    const senderSecret = canonicalTools.generateSecretKey();
    const senderPubkey = canonicalTools.getPublicKey(senderSecret);
    const recipientSecret = canonicalTools.generateSecretKey();
    const recipientPubkey = canonicalTools.getPublicKey(recipientSecret);

    await nostrClient.registerPrivateKeySigner({
      privateKey: canonicalTools.utils.bytesToHex(senderSecret),
      pubkey: senderPubkey,
    });
    nostrClient.pubkey = senderPubkey;

    const signer = getActiveSigner();
    // Keep nip44 (so the NIP-17 path is taken) and give it a working impl.
    signer.signEvent = (event) => {
      const finalized = canonicalTools.finalizeEvent(event, senderSecret);
      return { ...event, id: finalized.id, sig: finalized.sig };
    };
    signer.nip44Encrypt = async (peerPubkey, plaintext) => {
      const key = canonicalTools.nip44.v2.utils.getConversationKey(
        senderSecret,
        peerPubkey,
      );
      return canonicalTools.nip44.v2.encrypt(plaintext, key);
    };

    const result = await nostrClient.sendDirectMessage(
      recipientPubkey,
      "nip17 gift wrap smoke test",
      {
        useNip17: true,
        recipientRelayHints: [RELAY_URL],
        senderRelayHints: [RELAY_URL],
      },
    );

    assert.equal(
      result.ok,
      true,
      `NIP-17 send should succeed, got: ${JSON.stringify(result)}`,
    );
    assert.notEqual(
      result.error,
      "nip17-keygen-failed",
      "ephemeral wrapper keygen must not fail",
    );

    const giftWraps = publishInvocations.filter(
      ({ event }) => event?.kind === 1059,
    );
    assert.ok(
      giftWraps.length >= 1,
      "at least one kind-1059 gift wrap should be published",
    );
    // A gift wrap is signed by a fresh ephemeral key, never the sender's.
    assert.notEqual(
      giftWraps[0].event.pubkey,
      senderPubkey,
      "gift wrap must be authored by the ephemeral wrapper key, not the sender",
    );

    signer.signEvent = undefined;
    signer.nip44Encrypt = undefined;
    clearActiveSigner();
    nostrClient.pool = previousPool;
    nostrClient.relays = previousRelays;
    nostrClient.pubkey = previousPubkey;
  } finally {
    if (previousCanonical === undefined) delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
    else globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = previousCanonical;
    if (previousNostrTools === undefined) delete globalThis.NostrTools;
    else globalThis.NostrTools = previousNostrTools;
    if (previousReady === undefined) delete globalThis.nostrToolsReady;
    else globalThis.nostrToolsReady = previousReady;
  }
});
