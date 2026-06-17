// Scenario (SCN-s3-upload-cors-guidance):
//   Parity with the R2 path — when a generic-S3 upload fails with an opaque
//   browser CORS rejection ("Failed to fetch"), the user-facing status must
//   include actionable CORS guidance, not a bare "Upload failed: Failed to
//   fetch". Ordinary errors must NOT get the CORS hint.

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { S3UploadService } from "../../js/services/s3UploadService.js";

function makeDeps(uploadImpl) {
  return {
    ensureS3SdkLoaded: async () => {},
    makeS3Client: () => ({}),
    multipartUpload: uploadImpl,
    buildR2Key: () => "u/np/ns/video.mp4",
    computeStorageContentHash: async () => "sha256deadbeef",
    buildS3ObjectUrl: () => "https://mock.example/file",
    getCorsOrigins: () => ["*"],
    prepareS3Connection: async (o) => ({ ...o }),
    validateS3Connection: (s) => ({
      ...s,
      endpoint: "https://s3.us-east-1.amazonaws.com",
      region: "us-east-1",
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

const fakeFile = { name: "v.mp4", type: "video/mp4", size: 10, slice() { return this; } };

async function uploadAndCaptureError(uploadImpl) {
  const service = new S3UploadService(makeDeps(uploadImpl));
  const errors = [];
  service.on("uploadStatus", (d) => {
    if (d.variant === "error") errors.push(d.message);
  });
  await service.uploadVideo({
    npub: "npub1x",
    file: fakeFile,
    metadata: { title: "T" },
    settings: { endpoint: "https://s3.mock", accessKeyId: "k", secretAccessKey: "s", bucket: "b" },
    infoHash: "a".repeat(40),
    publishVideoNote: async () => true,
  });
  return errors;
}

test("a CORS-like upload failure surfaces actionable CORS guidance", async () => {
  const errors = await uploadAndCaptureError(async () => {
    throw new TypeError("Failed to fetch");
  });
  const msg = errors.join(" | ");
  assert.match(msg, /CORS/i, `expected CORS guidance, got: ${msg}`);
  assert.match(msg, /s3\.us-east-1\.amazonaws\.com/, "names the S3 endpoint to configure");
});

test("an ordinary upload error does NOT get the CORS hint", async () => {
  const errors = await uploadAndCaptureError(async () => {
    throw new Error("Access Denied");
  });
  const msg = errors.join(" | ");
  assert.ok(msg.includes("Access Denied"));
  assert.doesNotMatch(msg, /CORS/i);
});
