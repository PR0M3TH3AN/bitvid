// Scenario (SCN-upload-optional-asset-failure):
//   Thumbnail and .torrent uploads are non-fatal, but their failures used to be
//   swallowed (warn-only) so the user got a silently-missing asset
//   (Cloudflare-upload audit #5).
//   Given a video upload where the thumbnail AND torrent uploads fail,
//   When uploadVideo runs and the note still publishes,
//   Then the user sees a 'warning' status for each failed asset, and the final
//     success status is a 'warning' that names what failed.
//
// Anti-cheat: drives the real uploadVideo control flow with the per-asset upload
// made to fail by content type; asserts the externally observable status events
// (message + variant), not internals.

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { S3UploadService } from "../../js/services/s3UploadService.js";

function makeDeps() {
  return {
    ensureS3SdkLoaded: async () => {},
    makeS3Client: () => ({}),
    // Fail thumbnail (image/*) and torrent uploads; succeed for the video.
    multipartUpload: async ({ contentType }) => {
      if (
        contentType &&
        (contentType.startsWith("image/") || contentType === "application/x-bittorrent")
      ) {
        throw new Error("simulated optional-asset upload failure");
      }
    },
    buildR2Key: () => "u/npub/ns/video.mp4",
    computeStorageContentHash: async () => "sha256deadbeef",
    buildS3ObjectUrl: () => "https://mock.example/file",
    getCorsOrigins: () => ["*"],
    prepareS3Connection: async (o) => ({ ...o, bucket: "b", publicBaseUrl: "https://mock.example" }),
    validateS3Connection: (s) => ({
      ...s,
      endpoint: "https://s3.mock",
      region: "auto",
      accessKeyId: "k",
      secretAccessKey: "s",
      bucket: "b",
      forcePathStyle: false,
      publicBaseUrl: "https://mock.example",
    }),
    userLogger: { warn() {}, error() {} },
    buildStoragePointerValue: () => "ptr",
    buildStoragePrefixFromKey: () => "prefix",
    getVideoNoteErrorMessage: (c) => `Error: ${c}`,
    normalizeVideoNotePayload: (p) => ({ payload: p, errors: [] }),
    calculateTorrentInfoHash: async () => "a".repeat(40),
  };
}

const blob = (name, type) => ({ name, type, size: 8, slice() { return this; } });

test("failed thumbnail + torrent uploads surface as warnings and in the final status", async () => {
  const service = new S3UploadService(makeDeps());
  const events = [];
  service.on("uploadStatus", (d) => events.push(d));

  const published = await service.uploadVideo({
    npub: "npub1example",
    file: blob("video.mp4", "video/mp4"),
    thumbnailFile: blob("thumb.jpg", "image/jpeg"),
    torrentFile: blob("video.torrent", "application/x-bittorrent"),
    metadata: { title: "Test" },
    settings: { endpoint: "https://s3.mock", accessKeyId: "k", secretAccessKey: "s", bucket: "b" },
    infoHash: "a".repeat(40),
    publishVideoNote: async () => true,
  });

  assert.equal(published, true, "publish should still succeed despite optional-asset failures");

  const warnings = events.filter((e) => e.variant === "warning").map((e) => e.message);
  assert.ok(warnings.some((m) => /thumbnail/i.test(m)), `expected a thumbnail warning, got ${JSON.stringify(warnings)}`);
  assert.ok(warnings.some((m) => /torrent/i.test(m)), `expected a torrent warning, got ${JSON.stringify(warnings)}`);

  const final = events[events.length - 1];
  assert.equal(final.variant, "warning", "final status should be a warning when assets failed");
  assert.match(final.message, /Published/);
  assert.match(final.message, /thumbnail/i);
  assert.match(final.message, /torrent/i);
});

test("clean upload ends with a plain success status (no caveats)", async () => {
  const deps = makeDeps();
  deps.multipartUpload = async () => {}; // everything succeeds
  const service = new S3UploadService(deps);
  const events = [];
  service.on("uploadStatus", (d) => events.push(d));

  await service.uploadVideo({
    npub: "npub1example",
    file: blob("video.mp4", "video/mp4"),
    thumbnailFile: blob("thumb.jpg", "image/jpeg"),
    metadata: { title: "Test" },
    settings: { endpoint: "https://s3.mock", accessKeyId: "k", secretAccessKey: "s", bucket: "b" },
    infoHash: "a".repeat(40),
    publishVideoNote: async () => true,
  });

  const final = events[events.length - 1];
  assert.equal(final.variant, "success");
  assert.doesNotMatch(final.message, /note:/i);
});
