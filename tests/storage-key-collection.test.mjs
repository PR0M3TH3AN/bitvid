// Scenario (SCN-collect-video-storage-keys):
//   Deriving the object keys backing a video note for cleanup must (a) cover the
//   video, its sibling .torrent, and the thumbnail, (b) decode percent-encoded
//   paths, and (c) NEVER include URLs outside the owner's bucket base (so we
//   can't delete objects we don't own). Pure + deterministic.

import test from "node:test";
import assert from "node:assert/strict";

import { collectVideoStorageKeys } from "../js/utils/storagePointer.js";

const BASE = "https://pub.bitvid.network";

test("collects video + .torrent + thumbnail keys for an owned video", () => {
  const keys = collectVideoStorageKeys({
    videos: [
      {
        url: `${BASE}/u/np/abc123/my-clip.mp4`,
        thumbnail: `${BASE}/u/np/abc123/my-clip.thumb.jpg`,
      },
    ],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(
    new Set(keys),
    new Set([
      "u/np/abc123/my-clip.mp4",
      "u/np/abc123/my-clip.torrent",
      "u/np/abc123/my-clip.thumb.jpg",
    ]),
  );
});

test("ignores URLs outside the bucket base (never deletes others' objects)", () => {
  const keys = collectVideoStorageKeys({
    videos: [
      {
        url: "https://youtube.com/watch?v=abc",
        thumbnail: `${BASE}/u/np/h/t.thumb.jpg`, // this one IS ours
      },
    ],
    publicBaseUrl: BASE,
  });
  assert.ok(!keys.some((k) => k.includes("youtube")), "no external host keys");
  assert.deepEqual(new Set(keys), new Set(["u/np/h/t.thumb.jpg"]));
});

test("decodes percent-encoded path segments and tolerates a trailing-slash base", () => {
  const keys = collectVideoStorageKeys({
    videos: [{ url: `${BASE}/u/np/h/my%20clip.mp4` }],
    publicBaseUrl: `${BASE}/`,
  });
  assert.ok(keys.includes("u/np/h/my clip.mp4"), `got ${JSON.stringify(keys)}`);
  assert.ok(keys.includes("u/np/h/my clip.torrent"));
});

test("returns nothing when no base url or no owned objects", () => {
  assert.deepEqual(collectVideoStorageKeys({ videos: [{ url: `${BASE}/x.mp4` }], publicBaseUrl: "" }), []);
  assert.deepEqual(
    collectVideoStorageKeys({ videos: [{ url: "https://other.example/x.mp4" }], publicBaseUrl: BASE }),
    [],
  );
});
