import assert from "node:assert/strict";
import test from "node:test";

const { mirrorVideoEvent } = await import("../../js/nostr/publishHelpers.js");

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

function createPublishClient({ actorPubkey = "" } = {}) {
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
    writeRelays: ["wss://relay.example"],
    pool,
    allEvents: new Map(),
    rawEvents: new Map(),
    ensurePool: async () => pool,
    ensureSessionActor: async () => actorPubkey,
    ensureExtensionPermissions: async () => ({ ok: true }),
  };

  if (actorPubkey) {
    client.sessionActor = {
      pubkey: actorPubkey,
      privateKey: "session-private-key",
    };
  }

  return { client, publishCalls };
}

test("mirrorVideoEvent lowercases provided MIME types", async () => {
  const eventId = "provided-mime";
  const actorPubkey = "1".repeat(64);
  const { client } = createPublishClient({ actorPubkey });

  const result = await mirrorVideoEvent({
    client,
    eventId,
    options: {
      url: "https://videos.example/demo.mp4",
      mimeType: "Video/MP4",
    },
    resolveActiveSigner: resolveActiveSignerStub,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    inferMimeTypeFromUrl: () => "",
  });

  assert.equal(result.ok, true);
  const mTag = result.event?.tags?.find(
    (tag) => Array.isArray(tag) && tag[0] === "m",
  );
  assert.ok(mTag, "mirror events must include a MIME tag");
  assert.equal(mTag[1], "video/mp4");
});

test("mirrorVideoEvent lowercases inferred MIME types", async () => {
  const eventId = "inferred-mime";
  const actorPubkey = "2".repeat(64);
  const { client } = createPublishClient({ actorPubkey });

  const result = await mirrorVideoEvent({
    client,
    eventId,
    options: {
      url: "https://videos.example/demo.webm",
    },
    resolveActiveSigner: resolveActiveSignerStub,
    shouldRequestExtensionPermissions: shouldRequestExtensionPermissionsStub,
    signEventWithPrivateKey: signEventWithPrivateKeyStub,
    inferMimeTypeFromUrl: () => "VIDEO/WEBM",
  });

  assert.equal(result.ok, true);
  const mTag = result.event?.tags?.find(
    (tag) => Array.isArray(tag) && tag[0] === "m",
  );
  assert.ok(mTag, "mirror events must include a MIME tag");
  assert.equal(mTag[1], "video/webm");
});
