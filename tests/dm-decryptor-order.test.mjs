
import assert from "node:assert/strict";
import test from "node:test";
import { decryptDM } from "../js/dmDecryptor.js";

const SENDER_HEX = "a".repeat(64);
const RECIPIENT_HEX = "b".repeat(64);

test("decryptDM prefers higher priority decryptor even if slower", async () => {
    // Mock event
    const event = {
        kind: 4,
        content: "ciphertext",
        pubkey: SENDER_HEX,
        tags: [["p", RECIPIENT_HEX]]
    };

    const context = {
        actorPubkey: RECIPIENT_HEX,
        decryptors: [
            {
                scheme: "preferred",
                priority: 0,
                source: "slow-preferred",
                decrypt: async (remote, cipher) => {
                    // Normalize remote key might be done inside decryptDM
                    if (remote === SENDER_HEX) {
                        await new Promise(r => setTimeout(r, 100));
                        return "preferred-plaintext";
                    }
                    throw new Error("wrong remote: " + remote);
                }
            },
            {
                scheme: "fallback",
                priority: 10,
                source: "fast-fallback",
                decrypt: async (remote, cipher) => {
                    if (remote === SENDER_HEX) {
                         // Fast!
                        return "fallback-plaintext";
                    }
                     throw new Error("wrong remote: " + remote);
                }
            }
        ]
    };

    const result = await decryptDM(event, context);

    assert.equal(result.ok, true, "Result should be ok. Errors: " + JSON.stringify(result.errors));

    // If Promise.any is used, it will likely pick "fallback-plaintext" (fast).
    // We WANT "preferred-plaintext".
    assert.equal(result.plaintext, "preferred-plaintext",
        `Expected preferred-plaintext but got ${result.plaintext}. Current implementation likely uses Promise.any which is sensitive to race conditions.`);
});

// Regression: a kind-4 (legacy/NIP-04) DM must attempt the nip04 decryptor FIRST,
// even though the signer registers its nip44 candidate at a lower (earlier)
// `priority`. Previously the priority comparison ran before the legacy
// preference, so every kind-4 message tried nip44 on the `?iv=` ciphertext first
// (guaranteed "invalid base64" failure on the serialized extension) before
// falling back to nip04 — doubling signer round-trips and spamming the console.
test("kind-4 DM tries nip04 before nip44 despite nip44's earlier priority", async () => {
    const event = {
        kind: 4,
        content: "deadbeef?iv=cafe",
        pubkey: SENDER_HEX,
        tags: [["p", RECIPIENT_HEX]],
    };

    const calls = [];
    const context = {
        actorPubkey: RECIPIENT_HEX,
        // Mirror the signer registration: nip44 at priority -20, nip04 at -10.
        decryptors: [
            {
                scheme: "nip44",
                priority: -20,
                source: "extension",
                supportsGiftWrap: true,
                decrypt: async () => {
                    calls.push("nip44");
                    // nip44 on a NIP-04 ?iv= ciphertext always fails.
                    throw new Error('invalid base64: Unknown letter: "?"');
                },
            },
            {
                scheme: "nip04",
                priority: -10,
                source: "extension",
                decrypt: async (remote) => {
                    calls.push("nip04");
                    if (remote === SENDER_HEX) {
                        return "hello";
                    }
                    throw new Error("wrong remote: " + remote);
                },
            },
        ],
    };

    const result = await decryptDM(event, context);

    assert.equal(result.ok, true, "decrypt should succeed via nip04");
    assert.equal(result.plaintext, "hello");
    assert.deepEqual(
        calls,
        ["nip04"],
        `nip04 must be tried first and succeed without ever calling nip44; got call order ${JSON.stringify(calls)}`,
    );
});
