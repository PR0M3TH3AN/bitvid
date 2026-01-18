import assert from "node:assert/strict";
import test from "node:test";

import { decryptDM } from "../../js/dmDecryptor.js";

const buildHex = (value) => value.repeat(64);

const baseEvent = (pubkey) => ({
  kind: 4,
  pubkey,
  content: "ciphertext",
  tags: [],
});

test("decryptDM prefers nip44 decryptors when available", async () => {
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
  assert.equal(result.scheme, "nip44");
  assert.equal(result.plaintext, "nip44");
});

test("decryptDM falls back to nip04 when nip44 fails", async () => {
  const senderPubkey = buildHex("f");

  const result = await decryptDM(baseEvent(senderPubkey), {
    actorPubkey: senderPubkey,
    decryptors: [
      {
        scheme: "nip44",
        decrypt: async () => {
          throw new Error("nip44 failure");
        },
        priority: 0,
      },
      {
        scheme: "nip04",
        decrypt: async () => "fallback",
        priority: 0,
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.scheme, "nip04");
  assert.equal(result.plaintext, "fallback");
});
