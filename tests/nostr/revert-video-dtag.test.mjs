import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  NostrClient,
  setActiveSigner,
  clearActiveSigner,
} from "../../js/nostr.js";

function createStubPool() {
  return {
    publish(urls, event) {
      void urls;
      void event;
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

test("revertVideo preserves existing d tag", async (t) => {
  const client = new NostrClient();
  const pubkey = "ABC123";
  const existingD = "stable-d-tag";
  const baseEvent = {
    id: "event-original",
    pubkey,
    content: JSON.stringify({
      version: 3,
      videoRootId: "root-abc",
    }),
    tags: [
      ["t", "video"],
      ["d", existingD],
    ],
  };

  const signedEvents = [];
  const signer = {
    type: "app",
    pubkey,
    signEvent: async (event) => {
      signedEvents.push(event);
      return { ...event, id: `signed-${signedEvents.length}` };
    },
  };

  client.relays = ["wss://relay.one"];
  client.pool = createStubPool();
  client.ensureExtensionPermissions = async () => ({ ok: true });
  client.ensureActiveSignerForPubkey = async () => signer;

  setActiveSigner(signer);

  t.after(() => {
    clearActiveSigner();
  });

  const result = await client.revertVideo(baseEvent, pubkey);

  assert.ok(result?.event, "revertVideo should return the signed event");
  const signedEvent = signedEvents[0];
  assert.ok(signedEvent, "revertVideo should sign the revert event");
  const dTags = signedEvent.tags.filter((tag) => Array.isArray(tag) && tag[0] === "d");
  assert.deepEqual(
    dTags,
    [["d", existingD]],
    "revertVideo should preserve the existing d tag",
  );
});

test("revertVideo falls back to original event id when d tag missing", async (t) => {
  const client = new NostrClient();
  const pubkey = "ABC123";
  const baseEvent = {
    id: "event-legacy",
    pubkey,
    content: JSON.stringify({
      version: 2,
      videoRootId: "event-legacy",
    }),
    tags: [["t", "video"]],
  };

  const signedEvents = [];
  const signer = {
    type: "app",
    pubkey,
    signEvent: async (event) => {
      signedEvents.push(event);
      return { ...event, id: `signed-${signedEvents.length}` };
    },
  };

  client.relays = ["wss://relay.one"];
  client.pool = createStubPool();
  client.ensureExtensionPermissions = async () => ({ ok: true });
  client.ensureActiveSignerForPubkey = async () => signer;

  setActiveSigner(signer);

  t.after(() => {
    clearActiveSigner();
  });

  const result = await client.revertVideo(baseEvent, pubkey);

  assert.ok(result?.event, "revertVideo should return the signed event");
  const signedEvent = signedEvents[0];
  assert.ok(signedEvent, "revertVideo should sign the revert event");
  const dTags = signedEvent.tags.filter((tag) => Array.isArray(tag) && tag[0] === "d");
  assert.deepEqual(
    dTags,
    [["d", baseEvent.id]],
    "revertVideo should reuse the original event id for the d tag when missing",
  );
});
