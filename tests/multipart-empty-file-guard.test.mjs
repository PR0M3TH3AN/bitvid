// Scenario (SCN-upload-empty-file):
//   Given a 0-byte file,
//   When multipartUpload is called,
//   Then it rejects FAST with a clear "empty" message and never issues any S3
//     request (the old behavior completed a multipart upload with zero parts and
//     surfaced a cryptic CompleteMultipartUpload error — Cloudflare-upload #4).

// Disable the network import of the AWS SDK before importing the module.
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;

import test from "node:test";
import assert from "node:assert/strict";

const { multipartUpload } = await import("../js/storage/s3-multipart.js");

test("rejects a 0-byte file before any S3 request", async () => {
  let sendCalled = false;
  const s3 = {
    send: async () => {
      sendCalled = true;
      return {};
    },
  };

  await assert.rejects(
    () =>
      multipartUpload({
        s3,
        bucket: "bucket",
        key: "u/npub/ns/empty.mp4",
        file: { size: 0, type: "video/mp4" },
      }),
    /empty|0 bytes/i,
    "empty file should produce a clear error",
  );

  assert.equal(sendCalled, false, "must not start a multipart upload for an empty file");
});
