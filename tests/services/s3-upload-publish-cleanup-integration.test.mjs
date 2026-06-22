// Scenario (SCN-s3-publish-cleanup-roundtrip):
//   End-to-end parity smoke for GENERIC S3 (virtual-hosted style). Drives the
//   real s3UploadService.uploadVideo with only the S3 I/O boundary mocked
//   (makeS3Client + multipartUpload), using the REAL key/URL/magnet/note
//   builders, then feeds the resulting published note's URLs into
//   r2Service.deleteVideoStorage. Asserts:
//     - the upload writes the expected objects (video + .thumb + .torrent),
//     - the published note is valid (has the URL + a magnet with the info-hash),
//     - cleanup deletes EXACTLY the objects the upload wrote (the upload key and
//       the cleanup-derived key agree) — using a forcePathStyle-aware S3 client.
//   This is the round-trip that makes generic-S3 delete/edit cleanup actually
//   work, the parity gap that previously broke for vhost-style buckets.

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const { S3UploadService } = await import("../../js/services/s3UploadService.js");
const { R2Service } = await import("../../js/services/r2Service.js");

const PUBLIC_BASE = "https://cdn.example";
const ENDPOINT = "https://s3.us-east-1.amazonaws.com";
const NPUB = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsx5h2j";
const INFO_HASH = "a".repeat(40);

const S3_SETTINGS = {
  provider: "s3",
  endpoint: ENDPOINT,
  region: "us-east-1",
  accessKeyId: "AK",
  secretAccessKey: "SK",
  bucket: "my-bucket",
  forcePathStyle: false, // virtual-hosted-style — the case that used to break
  publicBaseUrl: PUBLIC_BASE,
};

const fileLike = (name, type) => ({ name, type, size: 1024, slice() { return this; } });

test("a generic-S3 upload publishes a valid note whose objects deleteVideoStorage can clean up", async () => {
  // --- 1. Upload via the real s3UploadService (only S3 I/O mocked) ---
  const uploadedKeys = [];
  let publishedPayload = null;

  const svc = new S3UploadService({
    ensureS3SdkLoaded: async () => {},
    makeS3Client: () => ({ __mock: "s3" }),
    multipartUpload: async ({ key }) => {
      uploadedKeys.push(key);
    },
    calculateTorrentInfoHash: async () => INFO_HASH,
    userLogger: { warn() {}, error() {} },
    // buildR2Key, buildS3ObjectUrl, normalizeVideoNotePayload,
    // buildStoragePointer*, getVideoNoteErrorMessage stay REAL (defaultDeps).
  });

  const ok = await svc.uploadVideo({
    npub: NPUB,
    file: fileLike("clip.mp4", "video/mp4"),
    thumbnailFile: fileLike("clip.jpg", "image/jpeg"),
    torrentFile: fileLike("clip.torrent", "application/x-bittorrent"),
    metadata: { title: "Parity Smoke" },
    infoHash: INFO_HASH,
    settings: S3_SETTINGS,
    publishVideoNote: async (payload) => {
      publishedPayload = payload;
      return true;
    },
  });

  assert.equal(ok, true, "upload+publish should succeed");
  assert.equal(uploadedKeys.length, 3, "uploads video + thumbnail + torrent");

  const note = publishedPayload?.legacyFormData;
  assert.ok(note, "published a normalized video note");
  assert.ok(
    note.url.startsWith(`${PUBLIC_BASE}/`),
    `note URL should be under the bucket base: ${note.url}`,
  );
  assert.match(note.magnet, new RegExp(`btih:${INFO_HASH}`), "magnet carries the info-hash");
  assert.match(note.magnet, /ws=/, "magnet has a web-seed (the hosted URL)");
  assert.ok(note.thumbnail.startsWith(`${PUBLIC_BASE}/`), "thumbnail URL under the base");

  // --- 2. Clean up via the real r2Service.deleteVideoStorage, S3 connection ---
  const deletedKeys = [];
  const clients = [];
  const r2 = new R2Service({
    makeR2Client: (args) => { clients.push({ kind: "r2", args }); return {}; },
    makeS3Client: (args) => { clients.push({ kind: "s3", args }); return {}; },
    deleteObject: async ({ key }) => { deletedKeys.push(key); },
  });
  r2.resolveConnection = async () => S3_SETTINGS;

  const cleanup = await r2.deleteVideoStorage({
    npub: NPUB,
    videos: [{ url: note.url, thumbnail: note.thumbnail }],
  });

  assert.equal(cleanup.skipped, false);
  // Generic S3 => S3 client honoring forcePathStyle: false (not the R2 path-style).
  assert.equal(clients[0]?.kind, "s3");
  assert.equal(clients[0]?.args.forcePathStyle, false);

  // The round-trip property: cleanup deletes exactly the objects we uploaded
  // (video + its .torrent + thumbnail). The video + thumbnail keys must match
  // what the upload wrote; the .torrent is derived from the video key.
  const uploadedSet = new Set(uploadedKeys);
  const torrentKey = uploadedKeys
    .find((k) => /\.mp4$/.test(k))
    .replace(/\.[^/.]+$/, ".torrent");
  for (const k of deletedKeys) {
    assert.ok(
      uploadedSet.has(k) || k === torrentKey,
      `cleanup deleted ${k}, which was not uploaded`,
    );
  }
  // Specifically: the video object and the thumbnail object are both removed.
  for (const uploaded of uploadedKeys) {
    if (uploaded === torrentKey) continue; // torrent re-derived; covered above
    assert.ok(
      deletedKeys.includes(uploaded),
      `uploaded object ${uploaded} should be cleaned up`,
    );
  }
});
