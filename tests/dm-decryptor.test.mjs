import assert from "node:assert/strict";
import test from "node:test";

import { decryptDM } from "../js/dmDecryptor.js";

test("decryptDM handles kind 4 events with nip04 ciphertext", async () => {
  const nostrTools = await import("nostr-tools");
  const { generateSecretKey, getPublicKey, nip04 } = nostrTools;

  const senderSecret = generateSecretKey();
  const recipientSecret = generateSecretKey();

  const senderPubkey = getPublicKey(senderSecret);
  const recipientPubkey = getPublicKey(recipientSecret);

  const message = "Hello from kind 4";
  const ciphertext = await nip04.encrypt(senderSecret, recipientPubkey, message);

  const event = {
    id: "kind4-event",
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: senderPubkey,
    tags: [["p", recipientPubkey]],
    content: ciphertext,
  };

  const context = {
    actorPubkey: recipientPubkey,
    decryptors: [
      {
        scheme: "nip04",
        priority: 0,
        decrypt: (remotePubkey, cipher) =>
          nip04.decrypt(recipientSecret, remotePubkey, cipher),
      },
    ],
  };

  const result = await decryptDM(event, context);

  assert.equal(result.ok, true, "decryptDM should succeed for kind 4 event");
  assert.equal(result.plaintext, message, "plaintext should match original message");
  assert.equal(result.scheme, "nip04", "scheme should resolve to nip04");
  assert.equal(result.sender.pubkey, senderPubkey, "sender pubkey should match event");
  assert.equal(result.recipients.length, 1, "recipient metadata should be populated");
  assert.equal(result.recipients[0].pubkey, recipientPubkey);
  assert.equal(result.direction, "incoming", "direction should be incoming for recipient");
});

test("decryptDM prefers recipient pubkeys when actor is the sender", async () => {
  const nostrTools = await import("nostr-tools");
  const { generateSecretKey, getPublicKey, nip04 } = nostrTools;

  const senderSecret = generateSecretKey();
  const recipientSecret = generateSecretKey();

  const senderPubkey = getPublicKey(senderSecret);
  const recipientPubkey = getPublicKey(recipientSecret);

  const message = "Hello from the author";
  const ciphertext = await nip04.encrypt(senderSecret, recipientPubkey, message);

  const event = {
    id: "outgoing-kind4",
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: senderPubkey,
    tags: [["p", recipientPubkey]],
    content: ciphertext,
  };

  const context = {
    actorPubkey: senderPubkey,
    decryptors: [
      {
        scheme: "nip04",
        priority: 0,
        decrypt: (remotePubkey, cipher) =>
          nip04.decrypt(senderSecret, remotePubkey, cipher),
      },
    ],
  };

  const result = await decryptDM(event, context);

  assert.equal(result.ok, true, "decryptDM should succeed for outgoing event");
  assert.equal(result.plaintext, message, "plaintext should match outgoing message");
  assert.equal(result.recipients.length, 1, "recipient metadata should remain intact");
  assert.equal(result.recipients[0].pubkey, recipientPubkey);
  assert.equal(result.direction, "outgoing", "direction should be outgoing for the author");
});

test("decryptDM unwraps kind 1059 gift wraps with nip44", async () => {
  const nostrTools = await import("nostr-tools");
  const { generateSecretKey, getPublicKey, nip44, nip59 } = nostrTools;

  const senderSecret = generateSecretKey();
  const recipientSecret = generateSecretKey();

  const senderPubkey = getPublicKey(senderSecret);
  const recipientPubkey = getPublicKey(recipientSecret);

  const baseEvent = {
    kind: 14,
    content: "Gift wrapped hello",
    tags: [["p", recipientPubkey]],
    created_at: Math.floor(Date.now() / 1000),
  };

  const wrap = nip59.wrapEvent(baseEvent, senderSecret, recipientPubkey);

  const nip44Module = nip44.v2 ?? nip44;
  const getConversationKey =
    typeof nip44Module?.getConversationKey === "function"
      ? nip44Module.getConversationKey.bind(nip44Module)
      : typeof nip44Module?.utils?.getConversationKey === "function"
      ? nip44Module.utils.getConversationKey.bind(nip44Module.utils)
      : null;
  const decryptFn =
    typeof nip44Module?.decrypt === "function"
      ? nip44Module.decrypt.bind(nip44Module)
      : typeof nip44?.v2?.decrypt === "function"
      ? nip44.v2.decrypt.bind(nip44.v2)
      : null;

  assert.ok(getConversationKey && decryptFn, "nip44 helpers should be available for tests");

  const context = {
    actorPubkey: recipientPubkey,
    decryptors: [
      {
        scheme: "nip44_v2",
        priority: 0,
        supportsGiftWrap: true,
        decrypt: (remotePubkey, cipher) => {
          const conversationKey = getConversationKey(recipientSecret, remotePubkey);
          return decryptFn(cipher, conversationKey);
        },
      },
    ],
  };

  const result = await decryptDM(wrap, context);

  assert.equal(result.ok, true, "decryptDM should succeed for gift wrap event");
  assert.equal(
    result.plaintext,
    baseEvent.content,
    "plaintext should match unwrap payload",
  );
  assert.equal(result.sender.pubkey, senderPubkey, "sender should match rumor pubkey");
  assert.equal(result.scheme, "nip44_v2", "scheme should report nip44 variant");
  assert.equal(result.direction, "incoming", "direction should be incoming for recipient");
  assert.ok(result.envelope && result.envelope.seal, "seal metadata should be provided");
  assert.equal(
    result.recipients[0].pubkey,
    recipientPubkey,
    "recipient metadata should reflect unwrap target",
  );
});

test("decryptDM returns failure when decryptors are unavailable", async () => {
  const event = { id: "unhandled", kind: 4, content: "", pubkey: "" };

  const result = await decryptDM(event, { decryptors: [] });

  assert.equal(result.ok, false, "decryptDM should report failure");
  assert.ok(Array.isArray(result.errors), "failure payload should include errors");
});
