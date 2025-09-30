import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const {
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_KIND,
} = await import("../js/config.js");

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

globalThis.window.NostrTools.getEventHash = (event) => {
  const payload = `${event.kind}:${event.pubkey}:${event.created_at}`;
  return `hash-${Buffer.from(payload).toString("hex")}`;
};

globalThis.window.NostrTools.signEvent = (event, privateKey) =>
  `sig-${privateKey.slice(0, 8)}-${event.created_at}`;

delete globalThis.window.NostrTools.nip04;
delete globalThis.window.nostr;

const { nostrClient } = await import("../js/nostr.js");

function createPublishingClient(actorPubkey) {
  const client = new nostrClient.constructor();
  const publishedEvents = [];
  const payloads = [];
  client.pool = {
    publish(urls, event) {
      publishedEvents.push(event);
      return {
        on(eventName, handler) {
          if (eventName === "ok" || eventName === "seen") {
            setTimeout(handler, 0);
          }
        },
      };
    },
  };
  client.relays = ["wss://unit.test"];
  client.pubkey = "";
  client.sessionActor = { pubkey: actorPubkey, privateKey: "unit-secret" };
  client.ensureSessionActor = async () => actorPubkey;
  client.encryptWatchHistoryPayload = async (_actor, payload) => {
    payloads.push(payload);
    return { ok: true, ciphertext: JSON.stringify(payload) };
  };
  client.persistWatchHistoryEntry = () => {};
  client.cancelWatchHistoryRepublish = () => {};
  client.scheduleWatchHistoryRepublish = () => {};
  return { client, publishedEvents, payloads };
}

function createDecryptClient(actorPubkey) {
  const client = new nostrClient.constructor();
  client.sessionActor = { pubkey: actorPubkey, privateKey: "unit-secret" };
  client.ensureSessionActor = async () => actorPubkey;
  return client;
}

const ACTOR = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { client: publishingClient, publishedEvents, payloads } =
  createPublishingClient(ACTOR);

publishingClient.watchHistoryPayloadMaxBytes = 400;
publishingClient.watchHistoryFetchEventLimit = 10;

const longPointers = Array.from({ length: 8 }, (_, index) => {
  const relay = index % 3 === 0 ? "wss://relay.unit" : null;
  if (index % 2 === 0) {
    return {
      type: "e",
      value: `event-${index}-${"x".repeat(90)}`,
      relay,
    };
  }
  return {
    type: "a",
    value: `30078:${ACTOR}:history-${index}-${"y".repeat(60)}`,
    relay,
  };
});

const publishResult = await publishingClient.publishWatchHistorySnapshot(
  ACTOR,
  longPointers
);

assert.equal(publishResult.ok, true, "publish should report success");
assert(publishResult.events.length > 1, "snapshot should chunk into multiple events");
assert.equal(
  publishResult.events.length,
  payloads.length,
  "each chunk should produce an encryption payload"
);

payloads.forEach((payload) => {
  const size = JSON.stringify(payload).length;
  assert(
    size <= publishingClient.watchHistoryPayloadMaxBytes,
    `payload size ${size} should respect cap`
  );
  assert.equal(payload.version, 2, "chunk payload should use version 2");
});

const snapshotIds = new Set(
  publishResult.events.map((event) =>
    event.tags.find((tag) => Array.isArray(tag) && tag[0] === "snapshot")?.[1]
  )
);
assert.equal(snapshotIds.size, 1, "all chunks should share a snapshot id");

const headTag = publishResult.event.tags.find(
  (tag) => Array.isArray(tag) && tag[0] === "head"
);
assert(headTag, "head chunk should include head tag");

const chunkIdentifiers = publishResult.events.map((event) =>
  event.tags.find((tag) => Array.isArray(tag) && tag[0] === "d")?.[1]
);

assert.equal(
  chunkIdentifiers.length,
  publishResult.events.length,
  "each chunk should expose a d tag"
);

assert.equal(
  chunkIdentifiers[0],
  WATCH_HISTORY_LIST_IDENTIFIER,
  "head chunk should retain canonical watch history identifier"
);

const uniqueChunkIdentifiers = new Set(chunkIdentifiers);
assert.equal(
  uniqueChunkIdentifiers.size,
  publishResult.events.length,
  "each chunk should have a unique d tag"
);

chunkIdentifiers.slice(1).forEach((identifier, index) => {
  assert(
    identifier && identifier.startsWith("watch-history:"),
    `chunk ${index + 1} should use a watch-history namespace identifier`
  );
  assert.notEqual(
    identifier,
    WATCH_HISTORY_LIST_IDENTIFIER,
    "only the head chunk should use the canonical identifier"
  );
});

const headATags = publishResult.event.tags
  .filter((tag) => Array.isArray(tag) && tag[0] === "a")
  .map((tag) => tag[1]);

const expectedChunkAddresses = publishResult.events.map((event) => {
  const identifier = event.tags.find(
    (tag) => Array.isArray(tag) && tag[0] === "d"
  )?.[1];
  assert(identifier, "chunk should include identifier tag");
  return `${WATCH_HISTORY_KIND}:${ACTOR}:${identifier}`;
});

expectedChunkAddresses.forEach((address) => {
  assert(
    headATags.includes(address),
    `head chunk should reference ${address}`
  );
});

delete globalThis.window.nostr;

if (!globalThis.window.NostrTools.nip04) {
  globalThis.window.NostrTools.nip04 = {};
}

globalThis.window.NostrTools.nip04.decrypt = async (
  _priv,
  _pub,
  ciphertext
) => ciphertext;

const decryptClient = createDecryptClient(ACTOR);
decryptClient.relays = ["wss://unit.test"];
decryptClient.watchHistoryFetchEventLimit = 10;
decryptClient.pool = {
  list: async () => publishedEvents,
};

const fetched = await decryptClient.fetchWatchHistory(ACTOR);

assert.equal(
  fetched.items.length,
  longPointers.length,
  "fetch should reassemble all chunked items"
);

assert.deepEqual(
  fetched.items.map((item) => ({
    type: item.type,
    value: item.value,
    relay: item.relay || null,
  })),
  longPointers.map((item) => ({
    type: item.type,
    value: item.value,
    relay: item.relay || null,
  })),
  "chunked fetch should preserve pointer order"
);

if (typeof localStorage !== "undefined") {
  localStorage.clear();
}

const headEvent = publishResult.event;
const chunkEvents = publishResult.events.filter(
  (event) => event.id !== headEvent.id
);

const snapshotId = headEvent.tags.find(
  (tag) => Array.isArray(tag) && tag[0] === "snapshot"
)?.[1];

const freshClient = createDecryptClient(ACTOR);
freshClient.relays = ["wss://unit.test"];
freshClient.watchHistoryFetchEventLimit = 10;

const observedFilters = [];
freshClient.pool = {
  list: async (_relays, filters) => {
    observedFilters.push(filters);

    const firstFilter = filters[0] || {};
    const dFilter = Array.isArray(firstFilter["#d"])
      ? firstFilter["#d"]
      : [];

    if (filters.length === 1 && dFilter.includes(WATCH_HISTORY_LIST_IDENTIFIER)) {
      return [headEvent];
    }

    const requestedIdentifiers = new Set();
    const requestedSnapshots = new Set();

    for (const filter of filters) {
      if (Array.isArray(filter?.["#d"])) {
        for (const identifier of filter["#d"]) {
          requestedIdentifiers.add(identifier);
        }
      }
      if (Array.isArray(filter?.["#snapshot"])) {
        for (const value of filter["#snapshot"]) {
          requestedSnapshots.add(value);
        }
      }
    }

    const responses = [];

    for (const event of publishResult.events) {
      const identifier = event.tags.find(
        (tag) => Array.isArray(tag) && tag[0] === "d"
      )?.[1];
      const eventSnapshot = event.tags.find(
        (tag) => Array.isArray(tag) && tag[0] === "snapshot"
      )?.[1];

      if (identifier && requestedIdentifiers.has(identifier)) {
        responses.push(event);
        continue;
      }
      if (eventSnapshot && requestedSnapshots.has(eventSnapshot)) {
        responses.push(event);
      }
    }

    return responses;
  },
};

const rebuilt = await freshClient.fetchWatchHistory(ACTOR);

assert.equal(
  rebuilt.items.length,
  longPointers.length,
  "fresh client should rebuild full watch history list"
);

assert(
  observedFilters.length >= 2,
  "fetch should include a follow-up query for chunk events"
);

const followUpFilters = observedFilters[observedFilters.length - 1];
const identifiersRequested = new Set();
let snapshotRequested = false;

for (const filter of followUpFilters) {
  if (Array.isArray(filter?.["#d"])) {
    for (const identifier of filter["#d"]) {
      identifiersRequested.add(identifier);
    }
  }
  if (Array.isArray(filter?.["#snapshot"])) {
    snapshotRequested = snapshotRequested || filter["#snapshot"].includes(snapshotId);
  }
}

assert(
  chunkEvents.every((event) => {
    const identifier = event.tags.find(
      (tag) => Array.isArray(tag) && tag[0] === "d"
    )?.[1];
    return (
      identifiersRequested.has(identifier) ||
      (snapshotId && snapshotRequested)
    );
  }),
  "follow-up query should target chunk identifiers or snapshot"
);

const MONOTONIC_ACTOR = `${ACTOR}-monotonic`;
const { client: monotonicPublishingClient, publishedEvents: monotonicEvents } =
  createPublishingClient(MONOTONIC_ACTOR);

const monotonicOriginalDateNow = Date.now;
try {
  const monotonicBaseSeconds = 1_700_123_456;
  Date.now = () => monotonicBaseSeconds * 1000;

  const firstMonotonicPointers = [
    { type: "e", value: "event-monotonic-1", relay: null },
    { type: "e", value: "event-monotonic-2", relay: null },
  ];

  const firstSnapshot = await monotonicPublishingClient.publishWatchHistorySnapshot(
    MONOTONIC_ACTOR,
    firstMonotonicPointers
  );

  const baselineEntry = monotonicPublishingClient.createWatchHistoryEntry(
    firstSnapshot.event,
    firstMonotonicPointers,
    Date.now()
  );
  monotonicPublishingClient.watchHistoryCache.set(
    MONOTONIC_ACTOR,
    baselineEntry
  );

  const secondMonotonicPointers = [
    { type: "e", value: "event-monotonic-3", relay: null },
    { type: "e", value: "event-monotonic-1", relay: null },
  ];

  const secondSnapshot = await monotonicPublishingClient.publishWatchHistorySnapshot(
    MONOTONIC_ACTOR,
    secondMonotonicPointers,
    baselineEntry
  );

  assert(
    secondSnapshot.event.created_at > firstSnapshot.event.created_at,
    "new snapshot should advance created_at when reusing the same second"
  );

  const monotonicDecryptClient = createDecryptClient(MONOTONIC_ACTOR);
  monotonicDecryptClient.pool = { list: async () => monotonicEvents };

  const monotonicFetched = await monotonicDecryptClient.fetchWatchHistory(
    MONOTONIC_ACTOR
  );

  assert.deepEqual(
    monotonicFetched.items.map((item) => ({
      type: item.type,
      value: item.value,
      relay: item.relay || null,
    })),
    [
      { type: "e", value: "event-monotonic-3", relay: null },
      { type: "e", value: "event-monotonic-1", relay: null },
    ],
    "newer snapshot should win pointer ordering"
  );
} finally {
  Date.now = monotonicOriginalDateNow;
}

localStorage.clear();

const originalDateNow = Date.now;
try {
  const baseTime = 1_700_000_000_000;
  const ttlActor = `${ACTOR}-ttl`;
  const pointer = { type: "e", value: "event-ttl", relay: null };

  const cachingClient = createDecryptClient(ttlActor);
  cachingClient.watchHistoryCacheTtlMs = 24 * 60 * 60 * 1000;

  Date.now = () => baseTime;

  const entry = cachingClient.createWatchHistoryEntry(null, [pointer], baseTime);
  cachingClient.watchHistoryCache.set(ttlActor, entry);
  cachingClient.persistWatchHistoryEntry(ttlActor, entry);

  const reloadClient = createDecryptClient(ttlActor);
  reloadClient.watchHistoryCacheTtlMs = cachingClient.watchHistoryCacheTtlMs;

  Date.now = () => baseTime + 60 * 60 * 1000;

  const cachedSnapshot = await reloadClient.fetchWatchHistory(ttlActor);
  assert.equal(
    cachedSnapshot.items.length,
    1,
    "cached snapshot should survive within extended TTL"
  );
  assert.equal(
    cachedSnapshot.items[0].value,
    pointer.value,
    "cached snapshot should preserve pointer"
  );

  localStorage.clear();

  const expiryClient = createDecryptClient(ttlActor);
  expiryClient.watchHistoryCacheTtlMs = 1_000;

  Date.now = () => baseTime;

  const expiringEntry = expiryClient.createWatchHistoryEntry(
    null,
    [pointer],
    baseTime
  );
  expiryClient.watchHistoryCache.set(ttlActor, expiringEntry);
  expiryClient.persistWatchHistoryEntry(ttlActor, expiringEntry);

  Date.now = () => baseTime + 1_500;

  const expiredSnapshot = await expiryClient.fetchWatchHistory(ttlActor);
  assert.equal(
    expiredSnapshot.items.length,
    0,
    "expired snapshot should be dropped"
  );
  const cachedFallback = expiryClient.watchHistoryCache.get(ttlActor);
  assert.equal(
    cachedFallback?.items?.length ?? 0,
    0,
    "expired snapshot should not preserve stale items in memory"
  );
  const storage = expiryClient.getWatchHistoryStorage();
  assert.equal(
    Object.prototype.hasOwnProperty.call(storage.actors, ttlActor),
    false,
    "expired snapshot should be removed from localStorage"
  );
} finally {
  Date.now = originalDateNow;
}

console.log("watch history tests passed");
