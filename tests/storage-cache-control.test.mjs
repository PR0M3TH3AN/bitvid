// Cache-Control policy for uploaded media (TODO #55, part 1). Upload keys are
// content-addressed (buildR2Key namespaces by infohash), so media should get a
// long immutable Cache-Control — browsers then keep thumbnails/videos/torrents
// across visits. Mutable playlists (m3u8/mpd) must stay short-lived.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-upload-cache-control
//       given: "an object key by extension"
//       when: "computeCacheControl derives the Cache-Control header"
//       then: "media/torrents are immutable-year; playlists revalidate; unknown gets the default"
//   observable_outcomes:
//     - "video + image (incl webp/avif) + .torrent keys -> public, max-age=31536000, immutable"
//     - "m3u8/mpd -> public, max-age=60, must-revalidate"
//     - "unknown/empty keys -> the 1h default (never immutable)"
//   determinism_controls:
//     - "pure function; explicit inputs"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { computeCacheControl } from "../js/storage/s3-multipart.js";

const IMMUTABLE = "public, max-age=31536000, immutable";

test("videos, images (incl. webp/avif), and torrents are immutable for a year", () => {
  for (const key of [
    "u/npub1x/abc123/video.mp4",
    "u/npub1x/abc123/clip.webm",
    "u/npub1x/abc123/thumb.jpg",
    "u/npub1x/abc123/thumb.webp",
    "u/npub1x/abc123/poster.avif",
    "u/npub1x/abc123/video.torrent",
    "u/npub1x/external/deadbeef.torrent",
    "SHOUTY/PATH/THUMB.PNG",
  ]) {
    assert.equal(computeCacheControl(key), IMMUTABLE, key);
  }
});

test("mutable playlists stay short-lived (live manifests change in place)", () => {
  assert.equal(
    computeCacheControl("u/npub1x/live/stream.m3u8"),
    "public, max-age=60, must-revalidate",
  );
  assert.equal(
    computeCacheControl("u/npub1x/live/stream.mpd"),
    "public, max-age=60, must-revalidate",
  );
});

test("unknown or missing keys fall back to the 1h default, never immutable", () => {
  for (const key of ["u/npub1x/uploads/file.bin", "no-extension", "", null, undefined]) {
    const value = computeCacheControl(key);
    assert.equal(value, "public, max-age=3600", String(key));
    assert.ok(!value.includes("immutable"));
  }
});
