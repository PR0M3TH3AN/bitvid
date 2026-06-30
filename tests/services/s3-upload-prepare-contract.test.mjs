// Bug: B2 (and generic-S3) uploads failed with "S3 endpoint is required." MediaUploader
// calls service.prepareUpload(npub, { credentials }) (the r2Service contract), but
// s3UploadService.prepareUpload used to take (settings, ...) — so the npub string became
// the settings (no endpoint). Also, a storageService.getConnection() result keeps
// bucket/endpoint under `.meta`, which validateS3Connection reads at the top level.
//
// Fix: s3UploadService.prepareUpload accepts (npub, { credentials }) AND flattens meta.

import "../test-helpers/setup-localstorage.mjs";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { S3UploadService } from "../../js/services/s3UploadService.js";

function createDeps() {
  const seen = {};
  return {
    deps: {
      ensureS3SdkLoaded: mock.fn(async () => {}),
      makeS3Client: mock.fn(() => ({})),
      multipartUpload: mock.fn(async () => {}),
      buildR2Key: mock.fn(() => "k"),
      buildS3ObjectUrl: mock.fn(() => "https://u/file"),
      getCorsOrigins: mock.fn(() => ["*"]),
      prepareS3Connection: mock.fn(async (opts) => ({ ...opts })),
      validateS3Connection: mock.fn((settings) => {
        seen.settings = settings;
        return { ...settings };
      }),
      userLogger: { warn: mock.fn(), error: mock.fn() },
      buildStoragePointerValue: mock.fn(() => "p"),
      buildStoragePrefixFromKey: mock.fn(() => "pre"),
      getVideoNoteErrorMessage: mock.fn((c) => `Error: ${c}`),
      normalizeVideoNotePayload: mock.fn((p) => ({ payload: p, errors: [] })),
      calculateTorrentInfoHash: mock.fn(async () => "h"),
    },
    seen,
  };
}

// A B2 connection as storageService.getConnection() returns it: keys + endpoint at the
// top level, but bucket/region/forcePathStyle/publicBaseUrl under `.meta`.
const B2_CONNECTION = {
  provider: "backblaze_b2",
  accessKeyId: "b2key",
  secretAccessKey: "b2secret",
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  forcePathStyle: false,
  meta: {
    provider: "backblaze_b2",
    bucket: "bitvid",
    region: "us-west-004",
    publicBaseUrl: "https://bitvid.s3.us-west-004.backblazeb2.com",
    forcePathStyle: false,
  },
};

test("prepareUpload(npub, { credentials }) flattens the connection's meta to top-level settings", async () => {
  const { deps, seen } = createDeps();
  const service = new S3UploadService(deps);

  const { settings, bucketEntry } = await service.prepareUpload("npub1abc", {
    credentials: B2_CONNECTION,
  });

  // validateS3Connection must have received endpoint + bucket (the prior bug passed the
  // npub string, so endpoint was undefined).
  assert.equal(seen.settings.endpoint, "https://s3.us-west-004.backblazeb2.com");
  assert.equal(seen.settings.bucket, "bitvid", "bucket flattened out of meta");
  assert.equal(seen.settings.region, "us-west-004");
  assert.equal(seen.settings.forcePathStyle, false);
  assert.equal(
    seen.settings.publicBaseUrl,
    "https://bitvid.s3.us-west-004.backblazeb2.com",
    "public URL flattened (so uploads don't get a blank base URL)",
  );
  assert.equal(bucketEntry.bucket, "bitvid");
});

test("the npub is ignored when credentials are supplied (not treated as settings)", async () => {
  const { deps, seen } = createDeps();
  const service = new S3UploadService(deps);
  await service.prepareUpload("npub1ignored", { credentials: B2_CONNECTION });
  assert.notEqual(seen.settings, "npub1ignored");
  assert.equal(typeof seen.settings, "object");
});

test("still accepts a direct settings object (back-compat)", async () => {
  const { deps, seen } = createDeps();
  const service = new S3UploadService(deps);
  await service.prepareUpload({
    endpoint: "https://s3.mock",
    bucket: "flat-bucket",
    accessKeyId: "k",
    secretAccessKey: "s",
  });
  assert.equal(seen.settings.bucket, "flat-bucket");
  assert.equal(seen.settings.endpoint, "https://s3.mock");
});
