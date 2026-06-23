// Cross-ecosystem dedupe: when the same video exists as a bitvid kind-30078 note
// AND a NIP-71 mirror/original, show exactly one — always the bitvid version.
// This is the shared pass behind every grid (feed, channel, search, ...).

import assert from "node:assert/strict";
import test from "node:test";
import {
  collapseCrossEcosystem,
  dedupeVideos,
} from "../js/utils/videoDeduper.js";

const PK = "a".repeat(64);
const SHA = "f".repeat(64);

const bitvid = (over = {}) => ({
  id: "bitvid-id",
  pubkey: PK,
  videoRootId: "bitvid-root",
  created_at: 100,
  // native: no nip71-ingest source
  ...over,
});
const foreign = (over = {}) => ({
  id: "foreign-id",
  pubkey: PK,
  videoRootId: "foreign-root",
  created_at: 200,
  source: "nip71-ingest",
  foreign: true,
  ...over,
});

test("same file hash → keeps the bitvid version, drops the foreign one", () => {
  const out = collapseCrossEcosystem([
    foreign({ fileSha256: SHA }),
    bitvid({ fileSha256: SHA }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "bitvid-id");
});

test("prefers bitvid even when the foreign version is NEWER", () => {
  const out = collapseCrossEcosystem([
    bitvid({ fileSha256: SHA, created_at: 1 }),
    foreign({ fileSha256: SHA, created_at: 9999 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "bitvid-id");
});

test("matches on infohash too", () => {
  const ih = "1".repeat(40);
  const out = collapseCrossEcosystem([
    foreign({ infoHash: ih }),
    bitvid({ infoHash: ih }),
  ]);
  assert.deepEqual(out.map((v) => v.id), ["bitvid-id"]);
});

test("matches via on-board provenance link (importedFrom -> foreign event id)", () => {
  const out = collapseCrossEcosystem([
    foreign({ id: "orig-evt" }),
    bitvid({ id: "imported-note", importedFrom: "orig-evt" }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "imported-note");
});

test("distinct videos (no shared identity) are NOT merged", () => {
  const out = collapseCrossEcosystem([
    bitvid({ id: "v1", fileSha256: "1".repeat(64) }),
    foreign({ id: "v2", fileSha256: "2".repeat(64) }),
  ]);
  assert.equal(out.length, 2);
});

test("hash-less videos are not merged (documented limitation)", () => {
  const out = collapseCrossEcosystem([
    bitvid({ id: "v1" }),
    foreign({ id: "v2" }),
  ]);
  assert.equal(out.length, 2);
});

test("two foreign versions of one file collapse to the newest (no bitvid present)", () => {
  const out = collapseCrossEcosystem([
    foreign({ id: "old", fileSha256: SHA, created_at: 100 }),
    foreign({ id: "new", fileSha256: SHA, created_at: 200 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "new");
});

test("dedupeVideos collapses by root THEN across ecosystems", () => {
  // Two bitvid events same root (older + newer) + a foreign mirror by hash.
  const out = dedupeVideos([
    bitvid({ id: "old", videoRootId: "r", created_at: 1, fileSha256: SHA }),
    bitvid({ id: "new", videoRootId: "r", created_at: 2, fileSha256: SHA }),
    foreign({ id: "mirror", fileSha256: SHA, created_at: 3 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "new", "newest bitvid per root wins, foreign mirror dropped");
});

test("different authors with the same hash are NOT merged (identity is per-author)", () => {
  const out = collapseCrossEcosystem([
    bitvid({ id: "mine", pubkey: PK, fileSha256: SHA }),
    foreign({ id: "theirs", pubkey: "b".repeat(64), fileSha256: SHA }),
  ]);
  assert.equal(out.length, 2);
});
