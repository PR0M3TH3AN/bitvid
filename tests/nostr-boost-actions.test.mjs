import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { buildRepostEvent } = await import("../js/nostrEventSchemas.js");
const {
  repostEvent,
  mirrorVideoEvent,
} = await import("../js/nostr/publishHelpers.js");

const resolveActiveSignerStub = () => ({
  signEvent: async (event) => ({
    ...event,
    id: `${event.kind}-${event.created_at}`,
    sig: "active-signature",
  }),
});

const shouldRequestExtensionPermissionsStub = () => false;

const signEventWithPrivateKeyStub = (event) => ({
  ...event,
  id: `${event.kind}-${event.created_at}-session`,
  sig: "session-signature",
});

const inferMimeTypeStub = (url = "") => {
  if (typeof url !== "string") {
    return "";
  }
  if (url.toLowerCase().endsWith(".mp4")) {
    return "video/mp4";
  }
  if (url.toLowerCase().endsWith(".webm")) {
    return "video/webm";
  }
  return "";
};

const eventToAddressPointerStub = () => "";

function createPublishClient({ actorPubkey = "", sessionPubkey = "", failPublish = false } = {}) {
  const publishCalls = [];
  const pool = {
    publish(urls, event) {
      publishCalls.push({ urls, event });
      return {
        on(eventName, handler) {
          if (!failPublish && eventName === "ok") {
            handler();
          }
          if (failPublish && eventName === "failed") {
            handler(new Error("publish failed"));
          }
          return true;
        },
      };
    },
  };

  const client = {
    pubkey: actorPubkey,
    relays: ["wss://relay.example"],
    writeRelays: ["wss://relay.example"],
    allEvents: new Map(),
    rawEvents: new Map(),
    pool,
    ensurePool: async () => pool,
    ensureSessionActor: async () => sessionPubkey,
    ensureExtensionPermissions: async () => ({ ok: true }),
    countEventsAcrossRelays: async () => ({ total: 0, perRelay: [] }),
  };

  if (sessionPubkey) {
    client.sessionActor = { pubkey: sessionPubkey, privateKey: "session-private-key" };
  }

  return { client, publishCalls };
}

(function testBuildRepostEventIncludesPointerTags() {
  const createdAt = 1_700_000_000;
  const event = buildRepostEvent({
    pubkey: "actorpubkey",
    created_at: createdAt,
    eventId: "event123",
    eventRelay: "wss://origin",
    publishRelay: "wss://relay.example",
    address: "30078:deadbeef:identifier",
    addressRelay: "wss://address",
    authorPubkey: "deadbeef",
    targetKind: 1,
  });

  assert.equal(event.kind, 6);
  assert.equal(event.pubkey, "actorpubkey");
  assert.equal(event.created_at, createdAt);

  assert.deepEqual(event.tags[0], ["e", "event123", "wss://origin"]);
  assert.deepEqual(event.tags[1], ["a", "30078:deadbeef:identifier", "wss://address"]);
  assert.deepEqual(event.tags[2], ["p", "deadbeef"]);
})();

(function testBuildRepostEventFallsBackToPublishRelay() {
  const createdAt = 1_700_000_001;
  const event = buildRepostEvent({
    pubkey: "actorpubkey",
    created_at: createdAt,
    eventId: "event456",
    publishRelay: "wss://relay.example",
    authorPubkey: "cafebabe",
    targetKind: 30078,
  });

  assert.equal(event.kind, 16);
  assert.deepEqual(event.tags[0], ["e", "event456", "wss://relay.example"]);
  assert.deepEqual(event.tags[1], ["p", "cafebabe"]);
})();

await (async function testRepostEventUsesSessionActorAndDerivesAddress() {
  const eventId = "test-event";
  const authorPubkey = "f".repeat(64);
  const sessionPubkey = "a".repeat(64);
  const { client } = createPublishClient({ sessionPubkey });

  client.rawEvents.set(eventId, { id: eventId, pubkey: authorPubkey });
  client.allEvents.set(eventId, {
    id: eventId,
    pubkey: authorPubkey,
    videoRootId: "root-id",
    title: "Video",
    url: "https://cdn.example/video.mp4",
  });

  const result = await repostEvent({
    client,
    eventId,
    options: {
      pointer: ["e", eventId],
      authorPubkey,
    },
    resolveActiveSigner: () => null,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    eventToAddressPointer: eventToAddressPointerStub,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sessionActor, true);
  assert.equal(result.signerPubkey, sessionPubkey);
  assert.equal(result.event?.kind, 16);
  const tags = result.event?.tags || [];
  assert.ok(Array.isArray(tags), "Repost event should include tags");
  assert.deepEqual(tags[0], ["e", eventId, "wss://relay.example"]);
  assert.equal(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "a" && tag[1].startsWith("30078:")),
    true,
    "Repost event should include an address pointer",
  );
  assert.equal(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === authorPubkey),
    true,
    "Repost event should include a p tag",
  );
})();

await (async function testRepostEventHandlesPublishFailure() {
  const eventId = "repost-fail";
  const authorPubkey = "d".repeat(64);
  const sessionPubkey = "b".repeat(64);
  const { client } = createPublishClient({ sessionPubkey, failPublish: true });

  client.allEvents.set(eventId, {
    id: eventId,
    pubkey: authorPubkey,
    videoRootId: "root-id",
    title: "Video",
  });

  const result = await repostEvent({
    client,
    eventId,
    options: {
      pointer: ["e", eventId, "wss://origin"],
      authorPubkey,
    },
    resolveActiveSigner: resolveActiveSignerStub,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    eventToAddressPointer: eventToAddressPointerStub,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "publish-rejected");
  assert.ok(result.details instanceof Error);
})();

await (async function testMirrorEventIncludesHostedMetadata() {
  const eventId = "mirror-event";
  const actorPubkey = "1".repeat(64);
  const { client } = createPublishClient({ actorPubkey });

  const result = await mirrorVideoEvent({
    client,
    eventId,
    options: {
      url: "https://videos.example/video.mp4",
      magnet: "magnet:?xt=urn:btih:abc",
      thumbnail: "https://videos.example/thumb.jpg",
      description: "Sample clip",
      title: "Sample",
    },
    resolveActiveSigner: resolveActiveSignerStub,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    inferMimeTypeFromUrl: inferMimeTypeStub,
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
  const eventId = "private-mirror";
  const actorPubkey = "2".repeat(64);
  const { client } = createPublishClient({ actorPubkey });

  const result = await mirrorVideoEvent({
    client,
    eventId,
    options: {
      url: "https://videos.example/private.mp4",
      magnet: "magnet:?xt=urn:btih:hidden",
      isPrivate: true,
    },
    resolveActiveSigner: resolveActiveSignerStub,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    inferMimeTypeFromUrl: inferMimeTypeStub,
  });

  assert.equal(result.ok, true);
  const tags = result.event?.tags || [];
  assert.equal(
    tags.some((tag) => Array.isArray(tag) && tag[0] === "magnet"),
    false,
    "Private mirrors must omit the magnet tag",
  );
})();

await (async function testMirrorEventPublishFailureIsSurfaced() {
  const eventId = "mirror-fail";
  const actorPubkey = "3".repeat(64);
  const { client } = createPublishClient({ actorPubkey, failPublish: true });

  const result = await mirrorVideoEvent({
    client,
    eventId,
    options: {
      url: "https://videos.example/video.mp4",
      title: "Failure",
    },
    resolveActiveSigner: resolveActiveSignerStub,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    inferMimeTypeFromUrl: inferMimeTypeStub,
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "publish-rejected");
  assert.ok(result.details instanceof Error);
})();

console.log("nostr boost action tests passed");
