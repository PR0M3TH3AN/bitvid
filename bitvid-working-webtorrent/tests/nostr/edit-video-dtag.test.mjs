import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  NostrClient,
  setActiveSigner,
  clearActiveSigner,
} from "../../js/nostr/client.js";

const noop = () => {};

function createStubPool() {
  return {
    publish(urls, event) {
      noop(event);
      return {
        on(type, handler) {
          if (type === "ok") {
            handler();
            return true;
          }
          if (type === "failed") {
            return true;
          }
          return false;
        },
      };
    },
  };
}

test("editVideo preserves existing d tag", async (t) => {
  const client = new NostrClient();
  const pubkey = "ABC123";
  const existingD = "stable-d-tag";
  const baseEvent = {
    id: "event-original",
    pubkey,
    version: 3,
    videoRootId: "root-abc",
    title: "Original Title",
    url: "https://example.com/video.mp4",
    magnet: "magnet:?xt=urn:btih:example",
    ws: "wss://example.com",
    xs: "https://example.com/file.torrent",
    enableComments: true,
    isPrivate: false,
    isNsfw: false,
    isForKids: false,
    nip71: null,
    thumbnail: "https://example.com/thumb.jpg",
    description: "original",
    mode: "live",
    tags: [
      ["t", "video"],
      ["d", existingD],
    ],
  };

  client.getEventById = async (id) => (id === baseEvent.id ? baseEvent : null);
  client.relays = ["wss://relay.one"];
  client.pool = createStubPool();
  client.ensureExtensionPermissions = async () => ({ ok: true });

  const signedEvents = [];
  const signer = {
    type: "app",
    pubkey,
    signEvent: async (event) => {
      signedEvents.push(event);
      return { ...event, id: `signed-${signedEvents.length}` };
    },
  };

  setActiveSigner(signer);
  client.ensureActiveSignerForPubkey = async () => signer;

  t.after(() => {
    clearActiveSigner();
    signedEvents.length = 0;
  });

  const result = await client.editVideo({ id: baseEvent.id }, { title: "Updated" }, pubkey);

  assert.ok(result, "editVideo should return the signed event");
  assert.equal(signedEvents.length, 1, "editVideo should sign exactly one event");
  const signedEvent = signedEvents[0];
  assert.ok(signedEvent, "signed event should be captured");
  const dTags = signedEvent.tags.filter((tag) => Array.isArray(tag) && tag[0] === "d");
  assert.deepEqual(dTags, [["d", existingD]], "editVideo should preserve the existing d tag");

  const parsedContent = JSON.parse(signedEvent.content);
  assert.equal(
    parsedContent.videoRootId,
    baseEvent.videoRootId,
    "editVideo should preserve the original videoRootId",
  );
});

test("editVideo falls back to base event id when d tag missing", async (t) => {
  const client = new NostrClient();
  const pubkey = "ABC123";
  const baseEvent = {
    id: "event-original-no-d",
    pubkey,
    version: 3,
    videoRootId: "root-abc",
    title: "Original Title",
    url: "https://example.com/video.mp4",
    magnet: "magnet:?xt=urn:btih:example",
    ws: "wss://example.com",
    xs: "https://example.com/file.torrent",
    enableComments: true,
    isPrivate: false,
    isNsfw: false,
    isForKids: false,
    nip71: null,
    thumbnail: "https://example.com/thumb.jpg",
    description: "original",
    mode: "live",
    tags: [["t", "video"]],
  };

  client.getEventById = async (id) => (id === baseEvent.id ? baseEvent : null);
  client.relays = ["wss://relay.one"];
  client.pool = createStubPool();
  client.ensureExtensionPermissions = async () => ({ ok: true });

  const signedEvents = [];
  const signer = {
    type: "app",
    pubkey,
    signEvent: async (event) => {
      signedEvents.push(event);
      return { ...event, id: `signed-${signedEvents.length}` };
    },
  };

  setActiveSigner(signer);
  client.ensureActiveSignerForPubkey = async () => signer;

  t.after(() => {
    clearActiveSigner();
    signedEvents.length = 0;
  });

  const result = await client.editVideo({ id: baseEvent.id }, { title: "Updated" }, pubkey);

  assert.ok(result, "editVideo should return the signed event");
  assert.equal(signedEvents.length, 1, "editVideo should sign exactly one event");
  const signedEvent = signedEvents[0];
  assert.ok(signedEvent, "signed event should be captured");
  const dTags = signedEvent.tags.filter((tag) => Array.isArray(tag) && tag[0] === "d");
  assert.deepEqual(
    dTags,
    [["d", baseEvent.id]],
    "editVideo should fall back to the base event id for the d tag when none exists",
  );

  const parsedContent = JSON.parse(signedEvent.content);
  assert.equal(
    parsedContent.videoRootId,
    baseEvent.videoRootId,
    "editVideo should continue to use the original videoRootId",
  );
});
