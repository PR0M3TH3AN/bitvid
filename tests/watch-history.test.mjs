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
  client.pool = {
    publish(urls, event) {
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
  client.encryptWatchHistoryPayload = async () => ({
    ok: true,
    ciphertext: "ciphertext",
  });
  client.persistWatchHistoryEntry = () => {};
  client.cancelWatchHistoryRepublish = () => {};
  client.scheduleWatchHistoryRepublish = () => {};
  return client;
}

function createDecryptClient(actorPubkey) {
  const client = new nostrClient.constructor();
  client.sessionActor = { pubkey: actorPubkey, privateKey: "unit-secret" };
  client.ensureSessionActor = async () => actorPubkey;
  return client;
}

const ACTOR = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const POINTER_A = {
  type: "a",
  value: `30078:${ACTOR}:watch-history`,
  relay: "wss://relay.unit",
};
const POINTER_E = { type: "e", value: "event-id-123", relay: null };

const publishingClient = createPublishingClient(ACTOR);
const publishResult = await publishingClient.publishWatchHistorySnapshot(
  ACTOR,
  [POINTER_A, POINTER_E]
);

assert.equal(publishResult.ok, true, "publish should report success");

const pointerTags = publishResult.event.tags.filter((tag) =>
  tag && (tag[0] === "a" || tag[0] === "e")
);
assert.deepEqual(pointerTags, [
  ["a", POINTER_A.value, POINTER_A.relay],
  ["e", POINTER_E.value],
]);

assert.deepEqual(
  publishResult.items.map((item) => ({
    type: item.type,
    value: item.value,
    relay: item.relay || null,
  })),
  [
    { type: "a", value: POINTER_A.value, relay: POINTER_A.relay },
    { type: "e", value: POINTER_E.value, relay: null },
  ]
);

delete globalThis.window.nostr;
delete globalThis.window.NostrTools.nip04;

const decryptClient = createDecryptClient(ACTOR);
const decrypted = await decryptClient.decryptWatchHistoryEvent(
  publishResult.event,
  ACTOR
);

assert.deepEqual(decrypted, {
  version: 0,
  items: [
    { type: "a", value: POINTER_A.value, relay: POINTER_A.relay },
    { type: "e", value: POINTER_E.value, relay: null },
  ],
});

console.log("watch history tests passed");
