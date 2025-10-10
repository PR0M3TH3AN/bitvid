import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { buildRepostEvent } = await import("../js/nostrEventSchemas.js");
const { NostrClient } = await import("../js/nostr.js");

function createClientHarness() {
  const client = new NostrClient();
  client.relays = ["wss://relay.example" ];
  client.writeRelays = ["wss://relay.example" ];
  client.pool = {};
  client.ensurePool = async () => client.pool;
  return client;
}

(function testBuildRepostEventIncludesPointerTags() {
  const createdAt = 1_700_000_000;
  const event = buildRepostEvent({
    pubkey: "actorpubkey",
    created_at: createdAt,
    eventId: "event123",
    eventRelay: "wss://origin",
    address: "30078:deadbeef:identifier",
    addressRelay: "wss://address",
    authorPubkey: "deadbeef",
  });

  assert.equal(event.kind, 6);
  assert.equal(event.pubkey, "actorpubkey");
  assert.equal(event.created_at, createdAt);

  assert.deepEqual(event.tags[0], ["e", "event123", "wss://origin"]);
  assert.deepEqual(event.tags[1], ["a", "30078:deadbeef:identifier", "wss://address"]);
  assert.deepEqual(event.tags[2], ["p", "deadbeef"]);
})();

await (async function testRepostEventUsesSessionActorAndDerivesAddress() {
  const client = createClientHarness();
  const eventId = "test-event";
  const authorPubkey = "f".repeat(64);
  const sessionPubkey = "a".repeat(64);

  client.sessionActor = { pubkey: sessionPubkey, privateKey: "session-key" };
  client.ensureSessionActor = async () => sessionPubkey;
  client.signAndPublishEvent = async (event, opts) => {
    return {
      signedEvent: event,
      summary: { accepted: [{ url: opts.relaysOverride?.[0] || "wss://relay.example" }], failed: [] },
      signerPubkey: sessionPubkey,
    };
  };

  client.allEvents.set(eventId, {
    id: eventId,
    pubkey: authorPubkey,
    videoRootId: "root-id",
    title: "Video",
    url: "https://cdn.example/video.mp4",
  });

  const result = await client.repostEvent(eventId, {
    pointer: ["e", eventId, "wss://origin"],
    authorPubkey,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sessionActor, true);
  assert.equal(Array.isArray(result.summary.accepted), true);
  const tags = result.event?.tags;
  assert.ok(Array.isArray(tags), "Repost event should include tags");
  assert.deepEqual(tags[0], ["e", eventId, "wss://origin"]);
  assert.equal(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "a" && tag[1].startsWith("30078:")),
    true,
    "Repost event should include an address pointer"
  );
  assert.equal(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === authorPubkey),
    true,
    "Repost event should include a p tag"
  );
})();

await (async function testMirrorEventIncludesHostedMetadata() {
  const client = createClientHarness();
  const eventId = "mirror-event";
  const actorPubkey = "1".repeat(64);

  client.pubkey = actorPubkey;
  client.signAndPublishEvent = async (event, opts) => {
    return {
      signedEvent: event,
      summary: { accepted: [{ url: opts.relaysOverride?.[0] || "wss://relay.example" }], failed: [] },
      signerPubkey: actorPubkey,
    };
  };

  const result = await client.mirrorVideoEvent(eventId, {
    url: "https://videos.example/video.mp4",
    magnet: "magnet:?xt=urn:btih:abc",
    thumbnail: "https://videos.example/thumb.jpg",
    description: "Sample clip",
    title: "Sample",
  });

  assert.equal(result.ok, true);
  const tags = result.event?.tags;
  assert.ok(Array.isArray(tags));
  const tagValues = Object.fromEntries(tags.map((tag) => [tag[0], tag.slice(1)]));
  assert.equal(tagValues.url[0], "https://videos.example/video.mp4");
  assert.equal(tagValues.m[0], "video/mp4");
  assert.equal(tagValues.thumb[0], "https://videos.example/thumb.jpg");
  assert.equal(tagValues.alt[0], "Sample clip");
  assert.equal(tagValues.magnet[0], "magnet:?xt=urn:btih:abc");
})();

await (async function testMirrorSkipsMagnetWhenPrivate() {
  const client = createClientHarness();
  const eventId = "private-mirror";
  const actorPubkey = "2".repeat(64);

  client.pubkey = actorPubkey;
  client.signAndPublishEvent = async (event, opts) => {
    return {
      signedEvent: event,
      summary: { accepted: [{ url: opts.relaysOverride?.[0] || "wss://relay.example" }], failed: [] },
      signerPubkey: actorPubkey,
    };
  };

  const result = await client.mirrorVideoEvent(eventId, {
    url: "https://videos.example/private.mp4",
    magnet: "magnet:?xt=urn:btih:hidden",
    isPrivate: true,
  });

  assert.equal(result.ok, true);
  const tags = result.event?.tags || [];
  assert.equal(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "magnet"),
    false,
    "Private mirrors must omit the magnet tag",
  );
})();

console.log("nostr boost action tests passed");
