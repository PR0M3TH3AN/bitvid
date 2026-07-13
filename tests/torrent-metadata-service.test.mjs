// torrentMetadataService: fetch → decode → VERIFY infohash → cache, plus the
// bencode/SHA-1 infohash computation. Builds a real .torrent in-test so the verify
// is exercised end-to-end (not circularly). See docs/blossom-torrent-metadata-plan.md.
import test from "node:test";
import assert from "node:assert/strict";

import {
  TorrentMetadataService,
  infoHashFromTorrent,
  base64ToBytes,
} from "../js/services/torrentMetadataService.js";
import { torrentMetadataDTag } from "../js/nostrEventSchemas.js";

// --- tiny bencode encoder (test-only) ---
function bstr(s) {
  const b = Buffer.from(s);
  return Buffer.concat([Buffer.from(`${b.length}:`), b]);
}
function bbytes(buf) {
  return Buffer.concat([Buffer.from(`${buf.length}:`), buf]);
}
function bint(n) {
  return Buffer.from(`i${n}e`);
}

// A minimal, valid info dict + a full .torrent wrapping it.
const pieces = Buffer.alloc(20, 7); // one 20-byte SHA-1 placeholder
const infoDict = Buffer.concat([
  Buffer.from("d"),
  bstr("length"), bint(3),
  bstr("name"), bstr("clip.mp4"),
  bstr("piece length"), bint(16384),
  bstr("pieces"), bbytes(pieces),
  Buffer.from("e"),
]);
const torrent = Buffer.concat([
  Buffer.from("d"),
  bstr("announce"), bstr("wss://tracker.example"),
  bstr("info"), infoDict,
  Buffer.from("e"),
]);

async function sha1Hex(buf) {
  const d = await crypto.subtle.digest("SHA-1", buf);
  return Buffer.from(new Uint8Array(d)).toString("hex");
}

function companionEvent(infoHash, torrentBuf, created_at = 1000) {
  return {
    kind: 30078,
    created_at,
    tags: [["d", torrentMetadataDTag(infoHash)]],
    content: JSON.stringify({ v: 1, infohash: infoHash, torrent: torrentBuf.toString("base64") }),
  };
}

test("infoHashFromTorrent isolates the info dict and SHA-1s exactly those bytes", async () => {
  const expected = await sha1Hex(infoDict); // hash of ONLY the info dict
  const actual = await infoHashFromTorrent(new Uint8Array(torrent));
  assert.equal(actual, expected, "infohash = SHA-1 of the bencoded info dict");
  assert.equal(actual.length, 40);
});

test("infoHashFromTorrent returns '' for non-torrent / malformed bytes", async () => {
  assert.equal(await infoHashFromTorrent(new Uint8Array([1, 2, 3])), "");
  assert.equal(await infoHashFromTorrent(new Uint8Array(Buffer.from("d4:spam"))), "");
});

test("fetch returns the verified piece-map for a matching companion event", async () => {
  const infoHash = await infoHashFromTorrent(new Uint8Array(torrent));
  const svc = new TorrentMetadataService();
  let queries = 0;
  const out = await svc.fetch({
    infoHash,
    author: "a".repeat(64),
    queryEvents: async (filter) => {
      queries += 1;
      assert.deepEqual(filter["#d"], [torrentMetadataDTag(infoHash)], "queried by infohash key");
      assert.deepEqual(filter.authors, ["a".repeat(64)], "author-scoped");
      return [companionEvent(infoHash, torrent)];
    },
  });
  assert.ok(out, "returns a result");
  assert.equal(out.infoHash, infoHash);
  assert.equal(Buffer.from(out.torrentBytes).equals(torrent), true, "exact .torrent bytes");
  assert.equal(queries, 1);
});

test("fetch REJECTS a companion whose bytes don't match the requested infohash", async () => {
  // Ask for a different infohash than the .torrent actually reconstructs to.
  const wrongHash = "1".repeat(40);
  const svc = new TorrentMetadataService();
  const out = await svc.fetch({
    infoHash: wrongHash,
    queryEvents: async () => [companionEvent(wrongHash, torrent)], // torrent hashes to something else
  });
  assert.equal(out, null, "infohash mismatch ⇒ rejected (tamper-resistant)");
});

test("fetch returns null when not found or malformed", async () => {
  const infoHash = await infoHashFromTorrent(new Uint8Array(torrent));
  const svc = new TorrentMetadataService();
  assert.equal(await svc.fetch({ infoHash, queryEvents: async () => [] }), null, "not found");
  assert.equal(
    await svc.fetch({ infoHash, queryEvents: async () => [{ content: "not json" }] }),
    null,
    "malformed content",
  );
  assert.equal(await svc.fetch({ infoHash: "nope", queryEvents: async () => [] }), null, "bad infohash");
});

test("fetch caches the verified result (no second relay query)", async () => {
  const infoHash = await infoHashFromTorrent(new Uint8Array(torrent));
  const svc = new TorrentMetadataService();
  let queries = 0;
  const q = async () => {
    queries += 1;
    return [companionEvent(infoHash, torrent)];
  };
  await svc.fetch({ infoHash, queryEvents: q });
  await svc.fetch({ infoHash, queryEvents: q });
  assert.equal(queries, 1, "second fetch served from cache");
});

test("base64ToBytes round-trips", () => {
  const bytes = base64ToBytes(Buffer.from([1, 2, 3, 250]).toString("base64"));
  assert.deepEqual([...bytes], [1, 2, 3, 250]);
});
