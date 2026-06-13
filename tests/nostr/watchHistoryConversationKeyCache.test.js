// Regression test for the NIP-44 conversation-key memoization in the
// watch-history decrypt path.
//
// Scenario (SCN-watch-history-convkey-memo):
//   Given a user whose watch history is stored as many separately NIP-44
//     encrypted chunk events (each chunk historically built its own cipher
//     suite, re-deriving the ECDH conversation key ~12ms at a time),
//   When the chunks are decrypted during a single load (i.e. many cipher
//     suites are created for the same private key + target),
//   Then the conversation key must be derived exactly once and reused, so a
//     1,500-item / ~150-chunk history does not block the main thread for
//     seconds.
//
// Observable outcome asserted at the boundary: the number of calls to
// nostr-tools' getConversationKey, which is the expensive ECDH operation.

import test from "node:test";
import assert from "node:assert/strict";

import {
  watchHistoryHelpers,
  clearWatchHistoryConversationKeyCache,
} from "../../js/nostr/watchHistory.js";

const { createNip44CipherSuite } = watchHistoryHelpers;

const PRIV_A =
  "1111111111111111111111111111111111111111111111111111111111111111";
const PRIV_B =
  "2222222222222222222222222222222222222222222222222222222222222222";
const TARGET_X =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1";
const TARGET_Y =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1";

/**
 * Build a fake nostr-tools surface whose getConversationKey counts invocations.
 * decrypt simply echoes the ciphertext so we can confirm the suite is wired up.
 */
function makeCountingTools() {
  const calls = [];
  return {
    calls,
    tools: {
      nip44: {
        v2: {
          encrypt: (plaintext) => `enc(${plaintext})`,
          decrypt: (ciphertext) => `dec(${ciphertext})`,
          utils: {
            getConversationKey: (privBytes, target) => {
              // Record the full (private key, target) identity so assertions can
              // distinguish two pairs that share a target but differ by signer.
              const privId = Array.from(privBytes ?? []).join("");
              calls.push(`${privId}:${target}`);
              // Return a distinct "key" object per (priv,target) so we can also
              // detect accidental cross-identity reuse if assertions tighten.
              return { keyFor: `${privId}:${target}`, n: calls.length };
            },
          },
        },
      },
    },
  };
}

test("conversation key is derived once across many chunk cipher suites", () => {
  clearWatchHistoryConversationKeyCache();
  const { tools, calls } = makeCountingTools();

  // Simulate the per-chunk path: a fresh suite per chunk event, all sharing the
  // same identity (PRIV_A -> TARGET_X), as a real watch-history load does.
  const CHUNKS = 150;
  for (let i = 0; i < CHUNKS; i++) {
    const suite = createNip44CipherSuite(tools, PRIV_A, TARGET_X);
    assert.ok(suite?.v2, "expected a v2 cipher suite");
    const out = suite.v2.decrypt(`chunk-${i}`);
    assert.equal(out, `dec(chunk-${i})`);
  }

  assert.equal(
    calls.length,
    1,
    `ECDH conversation key should be derived exactly once for ${CHUNKS} chunks, got ${calls.length}`,
  );
});

test("distinct identities and targets each derive their own key", () => {
  clearWatchHistoryConversationKeyCache();
  const { tools, calls } = makeCountingTools();

  // Three distinct (priv,target) pairs => three derivations, regardless of how
  // many suites/decrypts each performs. This guards against over-caching that
  // would leak one identity's key into another.
  for (let i = 0; i < 5; i++) {
    createNip44CipherSuite(tools, PRIV_A, TARGET_X).v2.decrypt("x");
    createNip44CipherSuite(tools, PRIV_A, TARGET_Y).v2.decrypt("x");
    createNip44CipherSuite(tools, PRIV_B, TARGET_X).v2.decrypt("x");
  }

  assert.deepEqual(
    new Set(calls).size,
    3,
    "expected exactly three distinct conversation keys",
  );
  assert.equal(calls.length, 3, "each distinct pair derived exactly once");
});

test("clearing the cache forces re-derivation (no secret outlives logout)", () => {
  clearWatchHistoryConversationKeyCache();
  const { tools, calls } = makeCountingTools();

  createNip44CipherSuite(tools, PRIV_A, TARGET_X).v2.decrypt("x");
  assert.equal(calls.length, 1);

  // Same identity again while cached: no new derivation.
  createNip44CipherSuite(tools, PRIV_A, TARGET_X).v2.decrypt("x");
  assert.equal(calls.length, 1);

  // After logout-style clear, the key must be derived fresh.
  clearWatchHistoryConversationKeyCache();
  createNip44CipherSuite(tools, PRIV_A, TARGET_X).v2.decrypt("x");
  assert.equal(calls.length, 2, "cache clear must force a fresh derivation");
});
