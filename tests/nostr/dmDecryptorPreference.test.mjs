import assert from "node:assert/strict";
import test from "node:test";

import { decryptDM } from "../../js/dmDecryptor.js";

const buildHex = (value) => value.repeat(64);

const baseEvent = (pubkey, tags = []) => ({
  kind: 4,
  pubkey,
  content: "ciphertext",
  tags,
});

// SPEC: a legacy kind-4 DM is NIP-04 by convention. With no explicit encryption
// hint, try nip04 FIRST so we don't burn a slow, serialized nip-07 extension
// round-trip on nip44 before falling back. (Spec correction: the previous
// expectation preferred nip44 by default for kind-4, which caused every legacy
// DM to pay an extra extension call.)
test("decryptDM prefers nip04 first for legacy kind-4 DMs without hints", async () => {
  const senderPubkey = buildHex("e");

  const result = await decryptDM(baseEvent(senderPubkey), {
    actorPubkey: senderPubkey,
    decryptors: [
      {
        scheme: "nip04",
        decrypt: async () => "nip04",
        priority: 0,
      },
      {
        scheme: "nip44",
        decrypt: async () => "nip44",
        priority: 0,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.scheme, "nip04");
  assert.equal(result.plaintext, "nip04");
});

// SPEC: an explicit per-event encryption hint always wins, even for kind-4. If
// the sender tagged the message nip44, decrypt with nip44 first regardless of
// the legacy default.
test("decryptDM honors an explicit nip44 hint on a kind-4 DM", async () => {
  const senderPubkey = buildHex("a");

  const result = await decryptDM(
    baseEvent(senderPubkey, [["encrypted", "nip44"]]),
    {
      actorPubkey: senderPubkey,
      decryptors: [
        {
          scheme: "nip04",
          decrypt: async () => "nip04",
          priority: 0,
        },
        {
          scheme: "nip44",
          decrypt: async () => "nip44",
          priority: 0,
        },
      ],
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.scheme, "nip44");
  assert.equal(result.plaintext, "nip44");
});

// SPEC: when the preferred scheme fails, fall through to the next decryptor and
// still succeed. Here nip04 (tried first by the legacy default) throws, so the
// result must come from nip44.
test("decryptDM falls back to nip44 when the nip04 attempt fails", async () => {
  const senderPubkey = buildHex("f");

  const result = await decryptDM(baseEvent(senderPubkey), {
    actorPubkey: senderPubkey,
    decryptors: [
      {
        scheme: "nip04",
        decrypt: async () => {
          throw new Error("nip04 failure");
        },
        priority: 0,
      },
      {
        scheme: "nip44",
        decrypt: async () => "fallback",
        priority: 0,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.scheme, "nip44");
  assert.equal(result.plaintext, "fallback");
});

// SPEC: a note-to-self DM has no counterparty other than the actor. The self
// key must still be attempted (deferred to last) rather than dropped, or the
// message can never decrypt.
test("decryptDM still decrypts a note-to-self DM (self is the only candidate)", async () => {
  const selfPubkey = buildHex("b");
  let attemptedRemote = null;

  const result = await decryptDM(baseEvent(selfPubkey), {
    actorPubkey: selfPubkey,
    decryptors: [
      {
        scheme: "nip04",
        decrypt: async (remotePubkey) => {
          attemptedRemote = remotePubkey;
          return "self-note";
        },
        priority: 0,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.plaintext, "self-note");
  assert.equal(attemptedRemote, selfPubkey);
});
