// Channel-profile wall must source BOTH native kind-30078 videos and the
// creator's NIP-71 videos (cross-posted via other apps), while skipping bitvid's
// own outbound mirrors so they don't duplicate the canonical note.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChannelVideoFilters,
  convertChannelEvent,
} from "../js/channelProfileVideos.js";

const PK = "a".repeat(64);

test("builds a native (30078) filter AND a NIP-71 filter for the author", () => {
  const filters = buildChannelVideoFilters(PK);
  assert.equal(filters.length, 2);

  const native = filters.find((f) => f.kinds.includes(30078));
  assert.deepEqual(native.authors, [PK]);
  assert.deepEqual(native["#t"], ["video"]);

  const nip71 = filters.find((f) => !f.kinds.includes(30078));
  assert.deepEqual(nip71.kinds.slice().sort((a, b) => a - b), [21, 22, 34235, 34236]);
  assert.deepEqual(nip71.authors, [PK]);
});

test("converts a foreign NIP-71 event into a renderable video", () => {
  const v = convertChannelEvent({
    id: "evt",
    pubkey: PK,
    kind: 34235,
    created_at: 1000,
    content: "desc",
    tags: [
      ["d", "root"],
      ["title", "Nostube clip"],
      ["imeta", "url https://example.com/v.mp4", "m video/mp4"],
    ],
  });
  assert.equal(v.invalid, false);
  assert.equal(v.title, "Nostube clip");
  assert.equal(v.source, "nip71-ingest");
});

test("skips bitvid's own mirror (returns invalid so the caller drops it)", () => {
  const v = convertChannelEvent({
    id: "mirror",
    pubkey: PK,
    kind: 34235,
    created_at: 1000,
    content: "",
    tags: [
      ["d", "root"],
      ["client", "bitvid"],
      ["title", "Our mirror"],
      ["imeta", "url https://example.com/v.mp4", "m video/mp4"],
    ],
  });
  assert.equal(v.invalid, true);
  assert.equal(v.reason, "bitvid-mirror");
});

test("routes kind-30078 events through the standard converter", () => {
  const v = convertChannelEvent({
    id: "native",
    pubkey: PK,
    kind: 30078,
    created_at: 2000,
    content: JSON.stringify({
      version: 3,
      title: "Native bitvid video",
      videoRootId: "vr",
      url: "https://example.com/native.mp4",
    }),
    tags: [["d", "vr"], ["t", "video"]],
  });
  assert.equal(v.invalid, false);
  assert.equal(v.title, "Native bitvid video");
  // Not stamped as ingested — it's a native note.
  assert.notEqual(v.source, "nip71-ingest");
});
