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

test("remove() publishes a NIP-09 delete (both addressable kinds) AND a tombstone", async () => {
  const { service, relay } = makeService();
  const result = await service.remove(baseVideo());
  assert.equal(result.ok, true);
  assert.equal(relay.events.length, 2, "delete + empty-replace tombstone");

  const del = relay.events.find((e) => e.kind === 5);
  assert.ok(del, "must publish a NIP-09 kind-5 delete");
  const aTags = del.tags.filter((t) => t[0] === "a").map((t) => t[1]).sort();
  assert.deepEqual(aTags, [
    `34235:${PUBKEY}:root-1`,
    `34236:${PUBKEY}:root-1`,
  ], "delete references both addressable kinds (orientation-robust)");
  const kTags = del.tags.filter((t) => t[0] === "k").map((t) => t[1]).sort();
  assert.deepEqual(kTags, ["34235", "34236"]);

  const tomb = relay.events.find((e) => e.kind === 34235 || e.kind === 34236);
  assert.ok(tomb, "must publish an empty-replace tombstone");
  assert.equal(tomb.tags.find((t) => t[0] === "d")[1], "root-1", "same d-tag");
  assert.equal(
    tomb.tags.some((t) => t[0] === "imeta"),
    false,
    "tombstone has no playable imeta",
  );
});

test("remove() tombstone uses the short kind for portrait videos", async () => {
  const { service, relay } = makeService();
  await service.remove(baseVideo({ width: 1080, height: 1920 }));
  const tomb = relay.events.find((e) => e.kind === 34235 || e.kind === 34236);
  assert.equal(tomb.kind, 34236, "portrait => 34236 tombstone");
});

test("remove() is unavailable without a signer", async () => {
  const { service } = makeService({ available: false });
  const result = await service.remove(baseVideo());
  assert.equal(result.ok, false);
  assert.equal(result.error, "unavailable");
});

// #34: idempotent re-mirror. The mirror KIND is inferred from dimensions
// (34236 short for portrait, else 34235), but (kind,pubkey,d) is the addressable
// identity — so a kind flip between mirror attempts produced a DUPLICATE in NIP-71
// clients. publish() must reuse the kind of any existing mirror instead.
function makeServiceWithExisting(existing) {
  const relay = makeRelay();
  const signer = { signEvent: async (tpl) => ({ ...tpl, id: "id", sig: "sig" }) };
  const service = createNip71MirrorService({
    getActivePubkey: () => PUBKEY,
    getSigner: () => signer,
    getWriteRelays: () => ["wss://write.relay"],
    getPool: () => relay,
    publishEventToRelays,
    summarizePublishResults,
    signEvent: signer.signEvent,
    allowNsfw: () => false,
    fetchExistingMirrors: async () => existing,
  });
  return { service, relay };
}

test("re-mirror reuses the existing mirror's kind (idempotent — no cross-kind duplicate)", async () => {
  // An existing SHORT (34236) mirror exists; the video object has no dims, so the
  // inference would otherwise pick 34235 (normal) → a duplicate. Must reuse 34236.
  const { service, relay } = makeServiceWithExisting([
    { kind: 34236, created_at: 100 },
  ]);
  const result = await service.publish(baseVideo());
  assert.equal(result.ok, true);
  assert.equal(result.reusedExistingKind, true);
  assert.equal(relay.events.length, 1, "replaces the same coordinate, no second event");
  assert.equal(relay.events[0].kind, 34236, "reused the existing kind, not the inferred 34235");
});

test("self-heals a pre-existing cross-kind duplicate by NIP-09-deleting the stale kind", async () => {
  // Both kinds already exist (the bug's aftermath). Reuse the newest (34236) and
  // tear down the stale 34235 so the video stops showing twice.
  const { service, relay } = makeServiceWithExisting([
    { kind: 34236, created_at: 200 },
    { kind: 34235, created_at: 100 },
  ]);
  const result = await service.publish(baseVideo());
  assert.equal(result.ok, true);
  assert.equal(result.healedStaleKind, true);
  assert.equal(relay.events.length, 2, "the mirror + a delete for the stale kind");
  assert.equal(relay.events[0].kind, 34236);
  const del = relay.events[1];
  assert.equal(del.kind, 5, "NIP-09 delete");
  assert.ok(
    del.tags.some((t) => t[0] === "a" && t[1] === `34235:${PUBKEY}:root-1`),
    "delete targets the stale 34235 coordinate",
  );
});

test("an explicit options.short override is respected over any existing mirror", async () => {
  const { service, relay } = makeServiceWithExisting([{ kind: 34236, created_at: 100 }]);
  const result = await service.publish(baseVideo(), { short: false });
  assert.equal(result.ok, true);
  assert.equal(result.reusedExistingKind, false);
  assert.equal(relay.events[0].kind, 34235, "explicit override wins");
});

test("findMirror derives mirror state from relays (truth), flagging duplicates", async () => {
  const dup = makeServiceWithExisting([{ kind: 34235 }, { kind: 34236 }]).service;
  assert.deepEqual(await dup.findMirror(baseVideo()), {
    mirrored: true,
    kinds: [34235, 34236],
    duplicate: true,
  });
  const none = makeServiceWithExisting([]).service;
  assert.deepEqual(await none.findMirror(baseVideo()), {
    mirrored: false,
    kinds: [],
    duplicate: false,
  });
});
