import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { userBlocks, USER_BLOCK_EVENTS } = await import("../js/userBlocks.js");
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

  assert.equal(
    typeof nostrClient.pool?.list,
    "function",
    "nostrClient.pool.list should be stubbed for block list tests",
  );

  userBlocks.blockedPubkeys = new Set();
  userBlocks.blockEventId = null;
  userBlocks.loaded = false;

  try {
    const loadPromise = userBlocks.loadBlocks(actor);

    await new Promise((resolve) => setImmediate(resolve));

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
          pubkey: actor,
          content: "ciphertext-old",
        },
      ],
      [relays[1]]: [
        {
          id: "event-new",
          created_at: 1800,
          pubkey: actor,
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

await (async () => {
  const actor = "a".repeat(64);
  const initialBlocked = "b".repeat(64);
  const backgroundBlocked = "c".repeat(64);
  const relays = [
    "wss://fast-one.example",
    "wss://fast-two.example",
    "wss://fast-three.example",
    "wss://background.example",
  ];

  const originalNostr = window.nostr;
  const originalPool = nostrClient.pool;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalBlockEventCreatedAt = userBlocks.blockEventCreatedAt;
  const originalLoaded = userBlocks.loaded;

  const calls = [];
  const resolvers = [];

  window.nostr = {
    ...(originalNostr || {}),
    nip04: {
      ...((originalNostr && originalNostr.nip04) || {}),
      decrypt: async () =>
        JSON.stringify({
          blockedPubkeys: [backgroundBlocked],
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

  assert.equal(
    typeof nostrClient.pool?.list,
    "function",
    "nostrClient.pool.list should be stubbed for background relay tests",
  );

  userBlocks.blockedPubkeys = new Set([initialBlocked]);
  userBlocks.blockEventId = "existing-event";
  userBlocks.blockEventCreatedAt = 1_000;
  userBlocks.loaded = false;

  const statusEvents = [];
  const changeEvents = [];
  const unsubscribeStatus = userBlocks.on(USER_BLOCK_EVENTS.STATUS, (detail) => {
    statusEvents.push(detail);
  });
  const unsubscribeChange = userBlocks.on(USER_BLOCK_EVENTS.CHANGE, (detail) => {
    changeEvents.push(detail);
  });

  try {
    const loadPromise = userBlocks.loadBlocks(actor);

    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(
      calls,
      relays,
      "loadBlocks should query fast and background relays concurrently",
    );

    for (const { relay, resolve } of resolvers) {
      if (relay !== relays[3]) {
        resolve([]);
      }
    }

    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(
      userBlocks.getBlockedPubkeys(),
      [initialBlocked],
      "existing blocked list should be preserved while waiting for background relays",
    );

    const backgroundResolver = resolvers.find((entry) => entry.relay === relays[3]);
    backgroundResolver.resolve([
      {
        id: "background-event",
        pubkey: actor,
        created_at: 2_000,
        content: "ciphertext-background",
      },
    ]);

    await loadPromise;

    assert.equal(
      userBlocks.blockEventId,
      "background-event",
      "background relay event should be applied after fast relay failures",
    );
    assert.deepEqual(
      userBlocks.getBlockedPubkeys(),
      [backgroundBlocked],
      "block list should hydrate from background relay payload",
    );

    assert(
      statusEvents.some((detail) => detail?.status === "awaiting-background"),
      "status events should indicate when background relays are pending",
    );
    assert(
      statusEvents.some((detail) => detail?.status === "applied"),
      "status events should report when the background payload is applied",
    );
    assert(
      changeEvents.some(
        (detail) =>
          detail?.action === "sync" &&
          Array.isArray(detail?.blockedPubkeys) &&
          detail.blockedPubkeys.includes(backgroundBlocked),
      ),
      "change events should emit sync updates after applying background payloads",
    );
  } finally {
    unsubscribeStatus?.();
    unsubscribeChange?.();
    userBlocks.blockedPubkeys = originalBlocked;
    userBlocks.blockEventId = originalBlockEventId;
    userBlocks.blockEventCreatedAt = originalBlockEventCreatedAt;
    userBlocks.loaded = originalLoaded;
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    window.nostr = originalNostr;
  }
})();
