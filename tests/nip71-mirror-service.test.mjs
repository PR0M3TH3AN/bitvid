// Phase 1: the NIP-71 mirror publish service. Scenarios assert the observable
// outcomes at the publish boundary, especially the site-wide NSFW moderation gate
// (ALLOW_NSFW_CONTENT) — an instance that won't surface NSFW must not publish it
// outward — plus the private / url / availability gates and a real publish.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createNip71MirrorService } from "../js/services/nip71MirrorService.js";
import {
  publishEventToRelays,
  summarizePublishResults,
} from "../js/nostrPublish.js";

const PUBKEY = "a".repeat(64);

function baseVideo(overrides = {}) {
  return {
    videoRootId: "root-1",
    pubkey: PUBKEY,
    title: "Hello",
    description: "desc",
    url: "https://cdn.example.com/v.mp4",
    thumbnail: "https://cdn.example.com/t.jpg",
    isPrivate: false,
    isNsfw: false,
    ...overrides,
  };
}

// Faithful relay twin: stores published events; thenable publish => success path.
function makeRelay() {
  const events = [];
  return {
    events,
    publish(_urls, event) {
      events.push(event);
      return Promise.resolve();
    },
  };
}

function makeService({ allowNsfw = false, available = true } = {}) {
  const relay = makeRelay();
  const signer = available
    ? { signEvent: async (tpl) => ({ ...tpl, id: "id", sig: "sig" }) }
    : null;
  const service = createNip71MirrorService({
    getActivePubkey: () => (available ? PUBKEY : ""),
    getSigner: () => signer,
    getWriteRelays: () => ["wss://write.relay"],
    getPool: () => relay,
    publishEventToRelays,
    summarizePublishResults,
    signEvent: signer ? signer.signEvent : async () => { throw new Error("no signer"); },
    allowNsfw: () => allowNsfw === true,
  });
  return { service, relay };
}

test("publishes a public video as an addressable 34235 mirror to the write relays", async () => {
  const { service, relay } = makeService();
  const result = await service.publish(baseVideo());
  assert.equal(result.ok, true);
  assert.equal(result.accepted, 1);
  assert.equal(relay.events.length, 1);
  assert.equal(relay.events[0].kind, 34235);
  assert.equal(relay.events[0].tags.find((t) => t[0] === "d")[1], "root-1");
});

test("NSFW video is NOT mirrored when the instance forbids NSFW (ALLOW_NSFW_CONTENT=false)", async () => {
  const { service, relay } = makeService({ allowNsfw: false });
  const result = await service.publish(baseVideo({ isNsfw: true }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "nsfw-blocked");
  assert.equal(relay.events.length, 0, "must not publish NSFW outward");
  assert.deepEqual(service.canMirror(baseVideo({ isNsfw: true })), {
    ok: false,
    reason: "nsfw-blocked",
  });
});

test("NSFW video IS mirrored when the instance allows NSFW", async () => {
  const { service, relay } = makeService({ allowNsfw: true });
  const result = await service.publish(baseVideo({ isNsfw: true, nsfwReason: "mature" }));
  assert.equal(result.ok, true);
  assert.equal(relay.events.length, 1);
  assert.equal(
    relay.events[0].tags.find((t) => t[0] === "content-warning")[1],
    "mature",
  );
});

test("private and url-less videos are refused (builder rules)", async () => {
  const { service, relay } = makeService();
  assert.equal((await service.publish(baseVideo({ isPrivate: true }))).reason, "private");
  assert.equal((await service.publish(baseVideo({ url: "" }))).reason, "no-url");
  assert.equal(relay.events.length, 0);
});

test("publish is unavailable without a signer / pubkey", async () => {
  const { service } = makeService({ available: false });
  assert.equal(service.isAvailable(), false);
  const result = await service.publish(baseVideo());
  assert.equal(result.ok, false);
  assert.equal(result.error, "unavailable");
});
