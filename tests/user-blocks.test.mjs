import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { userBlocks } = await import("../js/userBlocks.js");
const { nostrClient } = await import("../js/nostr.js");

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

await (async () => {
  const actor = "f".repeat(64);
  const blocked = "e".repeat(64);
  const relays = [
    "wss://relay-one.example",
    "wss://relay-two.example",
    "wss://relay-three.example",
  ];

  const originalNostr = window.nostr;
  const originalPool = nostrClient.pool;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalLoaded = userBlocks.loaded;

  const calls = [];
  const resolvers = [];

  window.nostr = {
    ...(originalNostr || {}),
    nip04: {
      ...((originalNostr && originalNostr.nip04) || {}),
      decrypt: async () =>
        JSON.stringify({
          blockedPubkeys: [blocked],
        }),
    },
  };

  const pool = originalPool ? { ...originalPool } : {};
  pool.list = (targets) => {
    const relay = Array.isArray(targets) ? targets[0] : undefined;
    calls.push(relay);
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });
    resolvers.push({ relay, resolve });
    return promise;
  };

  nostrClient.pool = pool;
  nostrClient.relays = relays;

  userBlocks.blockedPubkeys = new Set();
  userBlocks.blockEventId = null;
  userBlocks.loaded = false;

  try {
    const loadPromise = userBlocks.loadBlocks(actor);

    await Promise.resolve();

    assert.deepEqual(
      calls,
      relays,
      "loadBlocks should initiate queries for all relays concurrently"
    );

    const responses = {
      [relays[0]]: [
        {
          id: "event-old",
          created_at: 1700,
          content: "ciphertext-old",
        },
      ],
      [relays[1]]: [
        {
          id: "event-new",
          created_at: 1800,
          content: "ciphertext-new",
        },
      ],
      [relays[2]]: [],
    };

    for (const { relay, resolve } of resolvers) {
      resolve(responses[relay]);
    }

    await loadPromise;

    assert.equal(
      userBlocks.blockEventId,
      "event-new",
      "latest event should win after aggregating relay responses"
    );
    assert.deepEqual(
      userBlocks.getBlockedPubkeys(),
      [blocked],
      "decrypted block list should hydrate from newest event"
    );
  } finally {
    userBlocks.blockedPubkeys = originalBlocked;
    userBlocks.blockEventId = originalBlockEventId;
    userBlocks.loaded = originalLoaded;
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    window.nostr = originalNostr;
  }
})();
