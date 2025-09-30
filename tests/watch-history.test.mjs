import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

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

console.log("watch history tests passed");
