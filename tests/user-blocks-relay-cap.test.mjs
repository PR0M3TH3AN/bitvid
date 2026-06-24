// Regression: the live block-list subscription (ensureBlockListSubscription) used
// the user's full NIP-65 relay set, a primary contributor to the cold-login REQ
// storm. It must be bounded to the §17 read cap (capReadRelays, ≤8).
//
// Scenario (SCN-blocklist-subscription-relay-cap):
//   Given a user with 20 read relays,
//   When the live block-list subscription is (re)established,
//   Then it subscribes over at most the §17-capped relay set, not all 20.

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { userBlocks } = await import("../js/userBlocks.js");
const { nostrClient } = await import("../js/nostrClientFacade.js");
const { capReadRelays, MAX_SUBSCRIBE_RELAYS } = await import(
  "../js/nostr/toolkit.js"
);

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

test("ensureBlockListSubscription caps the live subscription relay set", () => {
  const actor = "f".repeat(64);
  const manyRelays = Array.from(
    { length: 20 },
    (_, i) => `wss://relay-${i}.example`,
  );

  const originalPool = nostrClient.pool;
  const originalGetManager = nostrClient.getSubscriptionManager;

  let captured = null;
  try {
    nostrClient.pool = { close() {} };
    nostrClient.getSubscriptionManager = () => ({
      subscribe: (args) => {
        captured = args;
        return { close() {} };
      },
    });

    userBlocks.ensureBlockListSubscription(actor, manyRelays);

    assert.ok(captured, "subscription manager should have been invoked");
    const expected = capReadRelays(manyRelays);
    assert.deepEqual(
      captured.relays,
      expected,
      "live subscription must use the §17-capped relay set",
    );
    assert.ok(
      captured.relays.length <= MAX_SUBSCRIBE_RELAYS,
      `relay set must be capped to ${MAX_SUBSCRIBE_RELAYS}, got ${captured.relays.length}`,
    );
    assert.ok(
      captured.relays.length < manyRelays.length,
      "must not fan out across the full 20-relay NIP-65 set",
    );
  } finally {
    nostrClient.pool = originalPool;
    nostrClient.getSubscriptionManager = originalGetManager;
  }
});
