import assert from "node:assert/strict";
import test from "node:test";

const { publishVideoReaction } = await import("../../js/nostr/reactionEvents.js");

function createReactionClient({ actorPubkey = "" } = {}) {
  const publishCalls = [];
  const pool = {
    publish(urls, event) {
      publishCalls.push({ urls, event });
      return {
        on(eventName, handler) {
          if (eventName === "ok") {
            handler();
          }
          return true;
        },
      };
    },
  };

  const client = {
    pubkey: actorPubkey,
    relays: ["wss://relay.example"],
    pool,
    ensureExtensionPermissions: async () => ({ ok: true }),
    async ensureSessionActor() {
      if (!this.sessionActor) {
        this.sessionActor = {
          pubkey: actorPubkey,
          privateKey: "session-private-key",
        };
      }
      return actorPubkey;
    },
  };

  if (actorPubkey) {
    client.sessionActor = {
      pubkey: actorPubkey,
      privateKey: "session-private-key",
    };
  }

  return { client, publishCalls };
}

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

test("publishVideoReaction includes both address and event tags when reacting to addressable content", async () => {
  const actorPubkey = "0".repeat(64);
  const { client, publishCalls } = createReactionClient({ actorPubkey });

  const result = await publishVideoReaction(
    client,
    { type: "a", value: "30078:deadbeefcafebabe:clip-1", relay: "wss://relay.address" },
    {
      pointerEventId: "target-event-id",
      pointerEventRelay: "wss://event.relay",
    },
    {
      resolveActiveSigner: resolveActiveSignerStub,
      shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
      signEventWithPrivateKey: signEventWithPrivateKeyStub,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, true, "reaction publish should succeed");
  assert.equal(publishCalls.length, 1, "reaction should publish exactly once");

  const tags = publishCalls[0].event.tags || [];
  const addressTags = tags.filter((tag) => Array.isArray(tag) && tag[0] === "a");
  const eventTags = tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");

  assert.deepEqual(addressTags, [[
    "a",
    "30078:deadbeefcafebabe:clip-1",
    "wss://relay.address",
  ]]);

  assert.deepEqual(eventTags, [["e", "target-event-id", "wss://event.relay"]]);
});

test("publishVideoReaction aborts when address pointer is missing a resolvable event id", async () => {
  const actorPubkey = "f".repeat(64);
  const { client, publishCalls } = createReactionClient({ actorPubkey });

  const result = await publishVideoReaction(
    client,
    "30078:abcdef:clip-1",
    {},
    {
      resolveActiveSigner: () => {
        throw new Error("resolveActiveSigner should not be called when validation fails");
      },
      shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
      signEventWithPrivateKey: signEventWithPrivateKeyStub,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, false, "reaction publish should fail when event id is missing");
  assert.equal(result.error, "missing-pointer-event-id");
  assert.match(
    result.details,
    /Unable to resolve event id/, 
    "error details should explain why the publish failed",
  );
  assert.equal(publishCalls.length, 0, "reaction should not publish when validation fails");
});
