
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
