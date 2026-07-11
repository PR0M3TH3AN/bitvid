// buildTorrentMetadataEvent + infohash-addressing helpers (Phase 0 of the Blossom
// WebTorrent-metadata companion event). Covers the event shape, the base64
// round-trip, the addressing key, and input guards. See
// docs/blossom-torrent-metadata-plan.md.
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTorrentMetadataEvent,
  normalizeInfoHash,
  torrentMetadataDTag,
  TORRENT_METADATA_KIND,
} from "../js/nostrEventSchemas.js";

const INFOHASH = "0123456789abcdef0123456789abcdef01234567"; // 40 hex
const TORRENT_B64 = Buffer.from("d4:infod6:lengthi1eee").toString("base64");
const PK = "a".repeat(64);

test("normalizeInfoHash lowercases valid 40-hex and rejects the rest", () => {
  assert.equal(normalizeInfoHash(INFOHASH.toUpperCase()), INFOHASH);
  assert.equal(normalizeInfoHash(`  ${INFOHASH}  `), INFOHASH);
  assert.equal(normalizeInfoHash("not-hex"), "");
  assert.equal(normalizeInfoHash("abc"), "", "too short");
  assert.equal(normalizeInfoHash("a".repeat(64)), "", "sha256-length is not a v1 infohash");
  assert.equal(normalizeInfoHash(null), "");
});

test("torrentMetadataDTag builds the addressing key, empty on bad input", () => {
  assert.equal(torrentMetadataDTag(INFOHASH), `bitvid:torrent:${INFOHASH}`);
  assert.equal(torrentMetadataDTag("nope"), "");
});

test("buildTorrentMetadataEvent produces a kind-30078 event keyed by infohash", () => {
  const event = buildTorrentMetadataEvent({
    pubkey: PK,
    created_at: 1700000000,
    infoHash: INFOHASH.toUpperCase(), // caller may pass any case
    torrentBase64: TORRENT_B64,
    videoEventId: "vid-event-id",
  });
  assert.equal(event.kind, TORRENT_METADATA_KIND);
  assert.equal(event.pubkey, PK);
  const dTag = event.tags.find((t) => t[0] === "d");
  assert.deepEqual(dTag, ["d", `bitvid:torrent:${INFOHASH}`], "addressed by lowercase infohash");
  assert.deepEqual(event.tags.find((t) => t[0] === "x"), ["x", INFOHASH]);
  assert.deepEqual(event.tags.find((t) => t[0] === "client"), ["client", "bitvid"]);
  assert.deepEqual(event.tags.find((t) => t[0] === "e"), ["e", "vid-event-id"]);
});

test("buildTorrentMetadataEvent content round-trips the exact .torrent bytes", () => {
  const event = buildTorrentMetadataEvent({
    pubkey: PK,
    created_at: 1700000000,
    infoHash: INFOHASH,
    torrentBase64: TORRENT_B64,
  });
  const envelope = JSON.parse(event.content);
  assert.equal(envelope.v, 1);
  assert.equal(envelope.infohash, INFOHASH);
  assert.equal(envelope.torrent, TORRENT_B64);
  // The recovered bytes are byte-identical to what was embedded.
  assert.equal(
    Buffer.from(envelope.torrent, "base64").toString(),
    "d4:infod6:lengthi1eee",
  );
  // No back-reference tag when videoEventId is omitted.
  assert.equal(event.tags.some((t) => t[0] === "e"), false);
});

test("buildTorrentMetadataEvent rejects an invalid infohash or empty payload", () => {
  assert.throws(
    () => buildTorrentMetadataEvent({ pubkey: PK, created_at: 1, infoHash: "bad", torrentBase64: TORRENT_B64 }),
    /valid 40-hex-char infoHash/,
  );
  assert.throws(
    () => buildTorrentMetadataEvent({ pubkey: PK, created_at: 1, infoHash: INFOHASH, torrentBase64: "" }),
    /non-empty base64 torrent payload/,
  );
});
