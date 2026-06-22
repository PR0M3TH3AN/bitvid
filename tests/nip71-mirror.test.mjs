// Phase 0 of the NIP-71 interop plan: bitvid video (kind 30078 shape) -> addressable
// NIP-71 mirror event (kind 34235/34236). Scenarios assert the observable event
// shape AND that bitvid's own NIP-71 parser reads it back (round-trip), plus the
// two hard rules (private never mirrored, HTTPS url required) and short selection.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNip71MirrorEvent,
  deriveVideoMime,
  NIP71_NORMAL_VIDEO_KIND,
  NIP71_SHORT_VIDEO_KIND,
} from "../js/nostr/nip71Mirror.js";
import { extractNip71MetadataFromTags } from "../js/nostr/nip71.js";

const PUBKEY = "a".repeat(64);
const INFOHASH = "b".repeat(40);

function baseVideo(overrides = {}) {
  return {
    videoRootId: "root-123",
    pubkey: PUBKEY,
    title: "Crystalline Bliss",
    description: "A lo-fi voxel puzzle journey.",
    url: "https://cdn.example.com/u/abc/video.mp4",
    thumbnail: "https://cdn.example.com/u/abc/thumb.jpg",
    magnet: `magnet:?xt=urn:btih:${INFOHASH}&ws=https://cdn.example.com/u/abc/video.mp4`,
    infoHash: INFOHASH,
    fileSha256: "c".repeat(64),
    originalFileSha256: "d".repeat(64),
    isPrivate: false,
    isNsfw: false,
    hashtags: ["gamestr", "voxel"],
    duration: 123,
    ...overrides,
  };
}

// Find the imeta tag and parse "key value" entries into an object (last wins,
// images/magnet collected).
function imetaFields(event) {
  const tag = event.tags.find((t) => t[0] === "imeta");
  assert.ok(tag, "event must have an imeta tag");
  const fields = {};
  for (let i = 1; i < tag.length; i += 1) {
    const sp = tag[i].indexOf(" ");
    const k = tag[i].slice(0, sp);
    const v = tag[i].slice(sp + 1);
    fields[k] = v;
  }
  return fields;
}

function tagValue(event, name) {
  const tag = event.tags.find((t) => t[0] === name);
  return tag ? tag[1] : undefined;
}

test("maps a public bitvid video to a spec-shaped addressable 34235 event", async () => {
  const res = buildNip71MirrorEvent(baseVideo(), { createdAt: 1000, publishedAt: 900 });
  assert.equal(res.ok, true);
  const ev = res.event;

  assert.equal(ev.kind, NIP71_NORMAL_VIDEO_KIND, "landscape/default => 34235");
  assert.equal(ev.pubkey, PUBKEY);
  assert.equal(ev.content, "A lo-fi voxel puzzle journey.");

  // Required + addressable identity
  assert.equal(tagValue(ev, "d"), "root-123", "addressable d-tag = videoRootId");
  assert.equal(tagValue(ev, "title"), "Crystalline Bliss");
  assert.equal(tagValue(ev, "published_at"), "900", "stable first-publish time");

  // Back-pointer + attribution + hashtags
  assert.equal(tagValue(ev, "a"), `30078:${PUBKEY}:root-123`, "links to canonical 30078");
  const origin = ev.tags.find((t) => t[0] === "origin");
  assert.deepEqual(origin.slice(0, 3), ["origin", "bitvid", "root-123"]);
  const tTags = ev.tags.filter((t) => t[0] === "t").map((t) => t[1]).sort();
  assert.deepEqual(tTags, ["gamestr", "voxel"]);

  // imeta: HTTPS url + standard NIP-94 magnet/infohash/hashes
  const f = imetaFields(ev);
  assert.equal(f.url, "https://cdn.example.com/u/abc/video.mp4");
  assert.equal(f.m, "video/mp4");
  assert.equal(f.image, "https://cdn.example.com/u/abc/thumb.jpg");
  assert.equal(f.x, "c".repeat(64));
  assert.equal(f.ox, "d".repeat(64));
  assert.equal(f.i, INFOHASH, "infohash rides standard NIP-94 'i'");
  assert.ok(f.magnet.startsWith("magnet:?xt=urn:btih:"), "magnet rides standard NIP-94 'magnet'");
  assert.equal(f.duration, "123");
});

test("round-trips: the produced event parses back via bitvid's NIP-71 parser", async () => {
  const res = buildNip71MirrorEvent(baseVideo());
  const parsed = extractNip71MetadataFromTags(res.event);
  assert.ok(parsed, "parser must read the mirror event");
  const meta = parsed.metadata;
  assert.equal(meta.kind, NIP71_NORMAL_VIDEO_KIND, "addressable kind preserved");
  assert.equal(parsed.source.kind, NIP71_NORMAL_VIDEO_KIND, "source kind preserved");
  assert.equal(meta.title, "Crystalline Bliss");
  assert.deepEqual(meta.hashtags.sort(), ["gamestr", "voxel"]);
  const v = meta.imeta[0];
  assert.equal(v.url, "https://cdn.example.com/u/abc/video.mp4");
  assert.equal(v.magnet, baseVideo().magnet, "magnet survives the round-trip");
  assert.equal(v.i, INFOHASH, "infohash survives the round-trip");
  assert.equal(v.ox, "d".repeat(64), "original-file hash survives the round-trip");
});

test("private videos are NEVER mirrored", async () => {
  const res = buildNip71MirrorEvent(baseVideo({ isPrivate: true }));
  assert.equal(res.ok, false);
  assert.equal(res.reason, "private");
});

test("a video without an HTTPS url cannot be mirrored", async () => {
  // magnet-only: bitvid plays it, foreign clients can't.
  const res = buildNip71MirrorEvent(baseVideo({ url: "" }));
  assert.equal(res.ok, false);
  assert.equal(res.reason, "no-url");

  const httpRes = buildNip71MirrorEvent(baseVideo({ url: "http://insecure.example/v.mp4" }));
  assert.equal(httpRes.ok, false, "non-HTTPS url is refused");
});

test("portrait dimensions select the short kind 34236; content-warning for NSFW", async () => {
  const res = buildNip71MirrorEvent(
    baseVideo({ width: 1080, height: 1920, isNsfw: true, nsfwReason: "mature" }),
  );
  assert.equal(res.event.kind, NIP71_SHORT_VIDEO_KIND, "portrait => 34236 short");
  assert.equal(tagValue(res.event, "content-warning"), "mature");
  assert.equal(imetaFields(res.event).dim, "1080x1920");
});

test("explicit short flag overrides dimension inference", async () => {
  const landscapeButShort = buildNip71MirrorEvent(
    baseVideo({ width: 1920, height: 1080 }),
    { short: true },
  );
  assert.equal(landscapeButShort.event.kind, NIP71_SHORT_VIDEO_KIND);
});

test("deriveVideoMime maps common extensions and defaults to mp4", async () => {
  assert.equal(deriveVideoMime("https://x/y.webm"), "video/webm");
  assert.equal(deriveVideoMime("https://x/y.m3u8?token=1"), "application/x-mpegURL");
  assert.equal(deriveVideoMime("https://x/y"), "video/mp4");
});
