// Foreign NIP-71 video event -> bitvid video object adapter. Scenario-style:
// asserts the externally observable shape a feed item needs, and the safety
// behaviors (own-mirror skip, content-warning -> isNsfw, source provenance).

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVideoFromNip71Event,
  isBitvidMirrorEvent,
} from "../js/nostr/nip71IngestAdapter.js";

const SHA = "a".repeat(64);

function foreignEvent(overrides = {}) {
  return {
    id: "evt-1",
    pubkey: "pk-foreign",
    kind: 21,
    created_at: 1_700_000_000,
    content: "A description from another client",
    tags: [
      ["title", "Foreign Video"],
      [
        "imeta",
        "url https://example.com/v.mp4",
        "m video/mp4",
        "dim 1920x1080",
        "image https://example.com/thumb.jpg",
        `x ${SHA}`,
      ],
      ["t", "music"],
      ["duration", "240"],
    ],
    ...overrides,
  };
}

test("maps a foreign NIP-71 event to a playable bitvid video", () => {
  const v = buildVideoFromNip71Event(foreignEvent());
  assert.equal(v.invalid, false);
  assert.equal(v.title, "Foreign Video");
  assert.equal(v.url, "https://example.com/v.mp4");
  assert.equal(v.thumbnail, "https://example.com/thumb.jpg");
  assert.equal(v.description, "A description from another client");
  assert.equal(v.width, 1920);
  assert.equal(v.height, 1080);
  assert.equal(v.duration, 240);
  assert.deepEqual(v.hashtags, ["music"]);
  assert.equal(v.fileSha256, SHA);
  assert.equal(v.pubkey, "pk-foreign");
  // Provenance markers so the app can distinguish ingested content.
  assert.equal(v.source, "nip71-ingest");
  assert.equal(v.foreign, true);
  assert.equal(v.nip71Kind, 21);
  // Never treat foreign content as private (no encryption in NIP-71).
  assert.equal(v.isPrivate, false);
});

test("surfaces nip71.publishedAt so the feed skips per-video history fetches", () => {
  // The published_at tag becomes nip71.publishedAt (feed resolve-posted-at uses
  // it to avoid a blocking kind-30078 history fetch per ingested video).
  const withPublished = buildVideoFromNip71Event(
    foreignEvent({
      tags: [
        ["title", "Has published_at"],
        ["published_at", "1700000123"],
        ["imeta", "url https://example.com/v.mp4", "m video/mp4"],
      ],
    }),
  );
  assert.equal(withPublished.nip71.publishedAt, 1700000123);

  // Falls back to created_at when there's no published_at tag.
  const noPublished = buildVideoFromNip71Event(foreignEvent({ created_at: 1699999999 }));
  assert.equal(noPublished.nip71.publishedAt, 1699999999);
});

test("content-warning maps to isNsfw so the NSFW gate applies", () => {
  const clean = buildVideoFromNip71Event(foreignEvent());
  assert.equal(clean.isNsfw, false);

  const flagged = buildVideoFromNip71Event(
    foreignEvent({
      tags: [
        ["title", "Spicy"],
        ["imeta", "url https://example.com/v.mp4", "m video/mp4"],
        ["content-warning", "explicit"],
      ],
    }),
  );
  assert.equal(flagged.isNsfw, true);
});

test("addressable kinds key the root on the d-tag; regular kinds on the event id", () => {
  const regular = buildVideoFromNip71Event(foreignEvent({ id: "regular-id", kind: 22 }));
  assert.equal(regular.videoRootId, "regular-id");

  const addressable = buildVideoFromNip71Event(
    foreignEvent({
      id: "addr-id",
      kind: 34235,
      tags: [
        ["d", "stable-root"],
        ["title", "Addr"],
        ["imeta", "url https://example.com/v.mp4", "m video/mp4"],
      ],
    }),
  );
  assert.equal(addressable.videoRootId, "stable-root");
});

test("skips bitvid's own outbound mirrors (avoids duplicate listings)", () => {
  const mirror = foreignEvent({
    kind: 34235,
    tags: [
      ["d", "root"],
      ["client", "bitvid"],
      ["title", "Our mirror"],
      ["imeta", "url https://example.com/v.mp4", "m video/mp4"],
    ],
  });
  assert.equal(isBitvidMirrorEvent(mirror), true);
  const v = buildVideoFromNip71Event(mirror);
  assert.equal(v.invalid, true);
  assert.equal(v.reason, "bitvid-mirror");
});

test("rejects events with no playable source or no title", () => {
  const noSource = buildVideoFromNip71Event(
    foreignEvent({ tags: [["title", "No media"]] }),
  );
  assert.equal(noSource.invalid, true);
  assert.equal(noSource.reason, "missing playable source");

  const noTitle = buildVideoFromNip71Event(
    foreignEvent({ tags: [["imeta", "url https://example.com/v.mp4", "m video/mp4"]] }),
  );
  assert.equal(noTitle.invalid, true);
  assert.equal(noTitle.reason, "missing title");
});

test("rejects non-NIP-71 kinds", () => {
  const v = buildVideoFromNip71Event(foreignEvent({ kind: 30078 }));
  assert.equal(v.invalid, true);
  assert.equal(v.reason, "not a NIP-71 video kind");
});

test("extracts a webtorrent magnet + infohash when present", () => {
  const magnet = `magnet:?xt=urn:btih:${"b".repeat(40)}&dn=clip`;
  const v = buildVideoFromNip71Event(
    foreignEvent({
      tags: [
        ["title", "Torrent clip"],
        ["imeta", `magnet ${magnet}`, "m video/mp4", `i ${"c".repeat(40)}`],
      ],
    }),
  );
  assert.equal(v.invalid, false);
  assert.equal(v.magnet, magnet);
  assert.equal(v.infoHash, "c".repeat(40), "prefers the imeta `i` infohash field");
});
