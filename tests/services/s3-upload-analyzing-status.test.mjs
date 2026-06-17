// Scenario (SCN-upload-analyzing-status):
//   Computing the torrent info-hash (and the content-hash fallback) reads the
//   ENTIRE file before the upload starts, which on large videos is a long silent
//   pause that looks like a freeze (Cloudflare-upload audit #2).
//   Given an upload with NO usable info-hash (so the file must be hashed),
//   When uploadVideo runs,
//   Then an "Analyzing…" status is emitted before the upload; and when a valid
//     info-hash IS supplied (no hashing needed) that status is NOT emitted.
//
// Anti-cheat: asserts the externally observable uploadStatus events, with the
// hashing dependency mocked so the assertion reflects the control-flow decision,
// not the hash itself.

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { S3UploadService } from "../../js/services/s3UploadService.js";

function makeDeps() {
  return {
    ensureS3SdkLoaded: async () => {},
    makeS3Client: () => ({}),
    multipartUpload: async () => {},
    buildR2Key: () => "u/npub/ns/video.mp4",
    computeStorageContentHash: async () => "sha256deadbeefcafe",
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
    // Returns an INVALID hash, so the service treats it as "no info-hash".
    calculateTorrentInfoHash: async () => "not-a-real-hash",
  };
}

const fakeFile = { name: "video.mp4", type: "video/mp4", size: 10, slice() { return this; } };

async function statusesFor({ infoHash } = {}) {
  const service = new S3UploadService(makeDeps());
  const messages = [];
  service.on("uploadStatus", (d) => messages.push(d.message));
  const published = await service.uploadVideo({
    npub: "npub1example",
    file: fakeFile,
    metadata: { title: "Test" },
    settings: { endpoint: "https://s3.mock", accessKeyId: "k", secretAccessKey: "s", bucket: "b" },
    infoHash,
    publishVideoNote: async () => true,
  });
  return { messages, published };
}

test("emits an Analyzing status when the file must be hashed (no info-hash)", async () => {
  const { messages, published } = await statusesFor({ infoHash: "" });
  assert.equal(published, true, "upload should still succeed");
  assert.ok(
    messages.some((m) => /analyz/i.test(m)),
    `expected an 'Analyzing' status, got: ${JSON.stringify(messages)}`,
  );
});

test("does NOT emit Analyzing when a valid info-hash is already supplied", async () => {
  const { messages } = await statusesFor({ infoHash: "a".repeat(40) });
  assert.ok(
    !messages.some((m) => /analyz/i.test(m)),
    `expected no 'Analyzing' status, got: ${JSON.stringify(messages)}`,
  );
});
