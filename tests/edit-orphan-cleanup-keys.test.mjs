// On edit, superseded R2/S3 objects are removed by passing orphan descriptors to
// deleteVideoStorage, which derives the bucket keys via collectVideoStorageKeys.
// This guards the descriptors the edit-cleanup builds map to the right keys:
//   - a replaced video entry -> the video key AND its sibling .torrent
//   - a replaced thumbnail entry -> the thumbnail key
// and that only objects under the configured publicBaseUrl are ever collected.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { collectVideoStorageKeys } from "../js/utils/storagePointer.js";

const BASE = "https://pub-abc.r2.dev";

test("a replaced video entry yields the video key + its .torrent", () => {
  const keys = collectVideoStorageKeys({
    videos: [{ url: `${BASE}/u/npub1x/deadbeef/my-clip.mp4` }],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(
    keys.sort(),
    ["u/npub1x/deadbeef/my-clip.mp4", "u/npub1x/deadbeef/my-clip.torrent"].sort(),
  );
});

test("a replaced thumbnail entry yields the thumbnail key", () => {
  const keys = collectVideoStorageKeys({
    videos: [{ thumbnail: `${BASE}/npub1x/thumbnails/123-old.png` }],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(keys, ["npub1x/thumbnails/123-old.png"]);
});

test("both video and thumbnail orphans collect together", () => {
  const keys = collectVideoStorageKeys({
    videos: [
      { url: `${BASE}/u/npub1x/hash/clip.mp4` },
      { thumbnail: `${BASE}/npub1x/thumbnails/9-old.jpg` },
    ],
    publicBaseUrl: BASE,
  });
  assert.ok(keys.includes("u/npub1x/hash/clip.mp4"));
  assert.ok(keys.includes("u/npub1x/hash/clip.torrent"));
  assert.ok(keys.includes("npub1x/thumbnails/9-old.jpg"));
});

test("objects under a DIFFERENT base are never collected (bucket switch safety)", () => {
  const keys = collectVideoStorageKeys({
    videos: [
      { url: "https://other-bucket.r2.dev/u/npub1x/hash/clip.mp4" },
      { thumbnail: "https://other-bucket.r2.dev/npub1x/thumbnails/9.jpg" },
    ],
    publicBaseUrl: BASE,
  });
  assert.deepEqual(keys, []);
});
