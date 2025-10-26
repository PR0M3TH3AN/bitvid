import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { userBlocks, USER_BLOCK_EVENTS } = await import("../js/userBlocks.js");
const {
  nostrClient,
  setActiveSigner,
  clearActiveSigner,
  getActiveSigner,
} = await import("../js/nostr.js");

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
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalMuteEventId = userBlocks.muteEventId;
  const originalMuteEventCreatedAt = userBlocks.muteEventCreatedAt;
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
  nostrClient.writeRelays = relays;

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
    userBlocks.muteEventId = originalMuteEventId;
    userBlocks.muteEventCreatedAt = originalMuteEventCreatedAt;
    userBlocks.loaded = originalLoaded;
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
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
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalBlockEventCreatedAt = userBlocks.blockEventCreatedAt;
  const originalMuteEventId = userBlocks.muteEventId;
  const originalMuteEventCreatedAt = userBlocks.muteEventCreatedAt;
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
  nostrClient.writeRelays = relays;

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
    userBlocks.muteEventId = originalMuteEventId;
    userBlocks.muteEventCreatedAt = originalMuteEventCreatedAt;
    userBlocks.loaded = originalLoaded;
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
    window.nostr = originalNostr;
  }
})();

await (async () => {
  const actor = "1".repeat(64);
  const seedOneHex = "2".repeat(64);
  const seedTwoHex = "3".repeat(64);
  const seedOneNpub = "npub1seedone";
  const seedTwoNpub = "npub1seedtwo";

  const originalEnsureLoaded = userBlocks.ensureLoaded;
  const originalPublishBlockList = userBlocks.publishBlockList;
  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalBlockEventCreatedAt = userBlocks.blockEventCreatedAt;
  const originalLastPublishedCreatedAt = userBlocks.lastPublishedCreatedAt;
  const originalMuteEventId = userBlocks.muteEventId;
  const originalMuteEventCreatedAt = userBlocks.muteEventCreatedAt;
  const originalLoaded = userBlocks.loaded;
  const originalSeedStateCache = userBlocks.seedStateCache;
  const originalNostrTools = window.NostrTools;

  const publishCalls = [];

  localStorage.clear();

  const decodeMap = new Map([
    [seedOneNpub, seedOneHex],
    [seedTwoNpub, seedTwoHex],
  ]);

  window.NostrTools = {
    ...(originalNostrTools || {}),
    nip19: {
      ...((originalNostrTools && originalNostrTools.nip19) || {}),
      decode(value) {
        if (decodeMap.has(value)) {
          return { type: "npub", data: decodeMap.get(value) };
        }
        throw new Error(`unexpected npub decode: ${value}`);
      },
    },
  };

  userBlocks.ensureLoaded = async () => {
    userBlocks.loaded = true;
  };

  userBlocks.publishBlockList = async (pubkey) => {
    publishCalls.push({
      pubkey,
      blocked: Array.from(userBlocks.blockedPubkeys),
    });
    userBlocks.blockEventId = `event-${publishCalls.length}`;
    userBlocks.blockEventCreatedAt = 1_000 + publishCalls.length;
    userBlocks.lastPublishedCreatedAt = userBlocks.blockEventCreatedAt;
    return { id: userBlocks.blockEventId, created_at: userBlocks.blockEventCreatedAt };
  };

  userBlocks.blockedPubkeys = new Set();
  userBlocks.blockEventId = null;
  userBlocks.blockEventCreatedAt = null;
  userBlocks.lastPublishedCreatedAt = null;
  userBlocks.muteEventId = null;
  userBlocks.muteEventCreatedAt = null;
  userBlocks.loaded = false;
  userBlocks.seedStateCache = new Map();

  try {
    const seedResult = await userBlocks.seedWithNpubs(actor, [
      seedOneNpub,
      seedTwoNpub,
      seedTwoNpub,
    ]);

    assert.equal(
      seedResult.seeded,
      true,
      "initial seeding should publish the aggregated blacklist",
    );
    assert.equal(
      publishCalls.length,
      1,
      "seeding should publish exactly one block list event",
    );
    assert.deepEqual(
      Array.from(userBlocks.blockedPubkeys).sort(),
      [seedOneHex, seedTwoHex],
      "seeding should populate the local block list with decoded hex pubkeys",
    );

    const secondSeed = await userBlocks.seedWithNpubs(actor, [seedOneNpub, seedTwoNpub]);
    assert.equal(
      secondSeed.seeded,
      false,
      "subsequent seeding attempts should be a no-op",
    );
    assert.equal(
      publishCalls.length,
      1,
      "subsequent seeding attempts should not republish the block list",
    );

    await userBlocks.removeBlock(seedTwoHex, actor);
    assert.equal(
      publishCalls.length,
      2,
      "removing a seeded pubkey should republish the block list",
    );
    assert.deepEqual(
      Array.from(userBlocks.blockedPubkeys),
      [seedOneHex],
      "removal should persist in the local block list",
    );

    await userBlocks.removeBlock(seedOneHex, actor);
    assert.equal(
      publishCalls.length,
      3,
      "removing the final baseline entry should publish again",
    );
    assert.equal(
      userBlocks.blockedPubkeys.size,
      0,
      "block list should become empty after removing all seeded entries",
    );

    const removalState = userBlocks._getSeedState(actor);
    assert(removalState.removals.has(seedOneHex), "seed removals should be recorded for the actor");
    assert(removalState.removals.has(seedTwoHex), "seed removals should include every removed pubkey");

    const afterRemovalSeed = await userBlocks.seedWithNpubs(actor, [
      seedOneNpub,
      seedTwoNpub,
    ]);
    assert.equal(
      afterRemovalSeed.seeded,
      false,
      "seeding should stay disabled after removals",
    );
    assert.equal(
      publishCalls.length,
      3,
      "no additional publish calls should occur after removals",
    );
    assert.equal(
      userBlocks.blockedPubkeys.size,
      0,
      "removed entries should not be re-applied by seeding",
    );
  } finally {
    userBlocks.ensureLoaded = originalEnsureLoaded;
    userBlocks.publishBlockList = originalPublishBlockList;
    userBlocks.blockedPubkeys = originalBlocked;
    userBlocks.blockEventId = originalBlockEventId;
    userBlocks.blockEventCreatedAt = originalBlockEventCreatedAt;
    userBlocks.lastPublishedCreatedAt = originalLastPublishedCreatedAt;
    userBlocks.muteEventId = originalMuteEventId;
    userBlocks.muteEventCreatedAt = originalMuteEventCreatedAt;
    userBlocks.loaded = originalLoaded;
    userBlocks.seedStateCache = originalSeedStateCache;
    window.NostrTools = originalNostrTools;
    localStorage.clear();
  }
})();

await (async () => {
  const actor = "4".repeat(64);
  const target = "5".repeat(64);

  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalBlockEventCreatedAt = userBlocks.blockEventCreatedAt;
  const originalLastPublishedCreatedAt = userBlocks.lastPublishedCreatedAt;
  const originalMuteEventId = userBlocks.muteEventId;
  const originalMuteEventCreatedAt = userBlocks.muteEventCreatedAt;
  const originalLoaded = userBlocks.loaded;
  const originalPool = nostrClient.pool;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalEnsurePermissions = nostrClient.ensureExtensionPermissions;
  const originalSignerState = getActiveSigner();
  clearActiveSigner();
  const originalNostr = window.nostr;

  let permissionRequests = 0;
  nostrClient.ensureExtensionPermissions = async () => {
    permissionRequests += 1;
    return { ok: true };
  };

  let eventCounter = 0;
  let latestCiphertext = "cipher:[]";
  let latestEventId = "event-initial";
  let latestCreatedAt = 1_000;

  const decryptPayloads = new Map([
    [latestCiphertext, JSON.stringify({ blockedPubkeys: [] })],
  ]);

  const signedEvents = [];

  nostrClient.relays = ["wss://direct-signer.example"];
  nostrClient.writeRelays = nostrClient.relays;
  nostrClient.pool = {
    publish: (_targets, event) => {
      latestCiphertext = event.content;
      latestEventId = event.id || `event-${Date.now()}`;
      latestCreatedAt = event.created_at || Math.floor(Date.now() / 1000);
      return {
        on(eventName, handler) {
          if (eventName === "ok") {
            setImmediate(handler);
            return true;
          }
          return false;
        },
      };
    },
    list: async () => [
      {
        id: latestEventId,
        created_at: latestCreatedAt,
        pubkey: actor,
        content: latestCiphertext,
      },
    ],
  };

  setActiveSigner({
    type: "private-key",
    pubkey: actor,
    nip04Decrypt: async (pubkey, ciphertext) => {
      assert.equal(pubkey, actor, "decrypt should target the actor pubkey");
      if (!decryptPayloads.has(ciphertext)) {
        throw new Error(`unexpected ciphertext ${ciphertext}`);
      }
      return decryptPayloads.get(ciphertext);
    },
    nip04Encrypt: async (pubkey, plaintext) => {
      assert.equal(pubkey, actor, "encrypt should target the actor pubkey");
      let parsed;
      try {
        parsed = JSON.parse(plaintext);
      } catch (error) {
        throw new Error(`unexpected payload ${plaintext}`);
      }
      const blocked = Array.isArray(parsed?.blockedPubkeys)
        ? [...parsed.blockedPubkeys].sort()
        : [];
      const cipher = `cipher:${JSON.stringify(blocked)}`;
      decryptPayloads.set(cipher, plaintext);
      return cipher;
    },
    nip44Encrypt: async (pubkey, plaintext) => {
      assert.equal(pubkey, actor, "nip44 encrypt should target the actor pubkey");
      return `nip44:${plaintext}`;
    },
    signEvent: async (event) => {
      eventCounter += 1;
      const signed = {
        ...event,
        id: `event-${eventCounter}`,
        created_at: event.created_at ?? Math.floor(Date.now() / 1000),
      };
      signedEvents.push(signed);
      return signed;
    },
  });

  userBlocks.blockedPubkeys = new Set();
  userBlocks.blockEventId = null;
  userBlocks.blockEventCreatedAt = null;
  userBlocks.lastPublishedCreatedAt = null;
  userBlocks.loaded = false;

  try {
    window.nostr = undefined;

    await userBlocks.loadBlocks(actor);
    assert.deepEqual(
      userBlocks.getBlockedPubkeys(),
      [],
      "direct signer should load block list without extension decryptor",
    );
    assert.equal(
      permissionRequests,
      0,
      "loadBlocks should not request extension permissions when signer decryptor exists",
    );

    const blockResult = await userBlocks.addBlock(target, actor);
    assert.equal(blockResult?.ok, true, "addBlock should succeed with direct signer");
    assert(userBlocks.blockedPubkeys.has(target), "target should be in the block list");

    const unblockResult = await userBlocks.removeBlock(target, actor);
    assert.equal(
      unblockResult?.ok,
      true,
      "removeBlock should succeed with direct signer",
    );
    assert.equal(
      userBlocks.blockedPubkeys.has(target),
      false,
      "target should be removed from the block list",
    );

    assert.equal(
      permissionRequests,
      0,
      "direct signer flows should never trigger extension permission prompts",
    );

    const muteEvent = signedEvents.find((event) => event.kind === 10000);
    assert(muteEvent, "block list updates should publish a kind 10000 mute list event");
    assert(
      Array.isArray(muteEvent.tags) &&
        muteEvent.tags.some((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === target),
      "mute list event should include p-tags for blocked pubkeys",
    );
  } finally {
    userBlocks.blockedPubkeys = originalBlocked;
    userBlocks.blockEventId = originalBlockEventId;
    userBlocks.blockEventCreatedAt = originalBlockEventCreatedAt;
    userBlocks.lastPublishedCreatedAt = originalLastPublishedCreatedAt;
    userBlocks.muteEventId = originalMuteEventId;
    userBlocks.muteEventCreatedAt = originalMuteEventCreatedAt;
    userBlocks.loaded = originalLoaded;
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.ensureExtensionPermissions = originalEnsurePermissions;
    window.nostr = originalNostr;
    clearActiveSigner();
    if (originalSignerState) {
      setActiveSigner(originalSignerState);
    }
  }
})();
