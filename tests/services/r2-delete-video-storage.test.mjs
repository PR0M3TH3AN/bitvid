// Scenario (SCN-delete-video-storage):
//   When a video is deleted, its R2/S3 objects must be removed so the file isn't
//   left publicly downloadable (Cloudflare R2 cleanup). The method must be
//   best-effort: delete owned objects, skip when storage is locked / has no
//   creds, never touch external URLs, and never throw (a failed object delete is
//   recorded, not propagated).
//
// Anti-cheat: drives the real deleteVideoStorage with I/O stubbed (resolveConnection,
// makeR2Client, deleteObject) and asserts which keys were actually deleted.

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

// Disable the AWS SDK network import before the storage modules load.
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const { R2Service } = await import("../../js/services/r2Service.js");

const BASE = "https://pub.bitvid.network";
const CREDS = {
  provider: "cloudflare_r2",
  accountId: "acct",
  accessKeyId: "AK",
  secretAccessKey: "SK",
  bucket: "my-bucket",
  publicBaseUrl: BASE,
  endpoint: "https://acct.r2.cloudflarestorage.com",
  region: "auto",
};

function buildService(creds, deleteImpl) {
  const deleted = [];
  const clients = []; // records which client builder was used (r2 vs s3) + args
  const svc = new R2Service({
    makeR2Client: (args) => {
      clients.push({ kind: "r2", args });
      return { __mock: "r2" };
    },
    makeS3Client: (args) => {
      clients.push({ kind: "s3", args });
      return { __mock: "s3" };
    },
    deleteObject:
      deleteImpl ||
      (async ({ key }) => {
        deleted.push(key);
      }),
  });
  svc.resolveConnection = async () => creds;
  return { svc, deleted, clients };
}

test("deletes the video, its .torrent, and the thumbnail for an owned video (R2)", async () => {
  const { svc, deleted, clients } = buildService(CREDS);
  const res = await svc.deleteVideoStorage({
    npub: "npub1owner",
    videos: [
      { url: `${BASE}/u/np/h/clip.mp4`, thumbnail: `${BASE}/u/np/h/clip.thumb.jpg` },
    ],
  });
  assert.equal(res.skipped, false);
  assert.deepEqual(
    new Set(deleted),
    new Set(["u/np/h/clip.mp4", "u/np/h/clip.torrent", "u/np/h/clip.thumb.jpg"]),
  );
  assert.equal(res.deleted.length, 3);
  // R2 connection => R2 (path-style) client.
  assert.equal(clients[0]?.kind, "r2");
});

test("uses a forcePathStyle-aware S3 client for a generic-S3 connection", async () => {
  // No accountId, non-R2 provider, virtual-hosted-style bucket.
  const s3Creds = {
    provider: "s3",
    accessKeyId: "AK",
    secretAccessKey: "SK",
    bucket: "my-bucket",
    publicBaseUrl: BASE,
    endpoint: "https://s3.us-east-1.amazonaws.com",
    region: "us-east-1",
    forcePathStyle: false,
  };
  const { svc, deleted, clients } = buildService(s3Creds);
  const res = await svc.deleteVideoStorage({
    npub: "npub1owner",
    videos: [{ url: `${BASE}/u/np/h/clip.mp4` }],
  });
  assert.equal(res.skipped, false);
  assert.ok(deleted.includes("u/np/h/clip.mp4"), "deletes the S3 object");
  // Generic S3 => S3 client built with the connection's forcePathStyle (not forced).
  assert.equal(clients[0]?.kind, "s3");
  assert.equal(clients[0]?.args.forcePathStyle, false);
  assert.equal(clients[0]?.args.endpoint, "https://s3.us-east-1.amazonaws.com");
});

test("skips entirely when storage is locked (no credentials available)", async () => {
  const { svc, deleted } = buildService({ ...CREDS, accessKeyId: "", secretAccessKey: "" });
  const res = await svc.deleteVideoStorage({
    npub: "npub1owner",
    videos: [{ url: `${BASE}/u/np/h/clip.mp4` }],
  });
  assert.equal(res.skipped, true);
  assert.equal(res.reason, "storage-locked");
  assert.equal(deleted.length, 0);
});

test("never deletes external/3rd-party objects", async () => {
  const { svc, deleted } = buildService(CREDS);
  const res = await svc.deleteVideoStorage({
    npub: "npub1owner",
    videos: [{ url: "https://youtube.com/watch?v=x" }],
  });
  assert.equal(deleted.length, 0);
  assert.equal(res.skipped, true);
  assert.equal(res.reason, "no-matching-objects");
});

test("records a failed object delete without throwing", async () => {
  const deleted = [];
  const { svc } = buildService(CREDS, async ({ key }) => {
    if (key.endsWith(".torrent")) throw new Error("boom");
    deleted.push(key);
  });
  const res = await svc.deleteVideoStorage({
    npub: "npub1owner",
    videos: [{ url: `${BASE}/u/np/h/clip.mp4` }],
  });
  assert.equal(res.failed.length, 1);
  assert.ok(res.failed[0].key.endsWith(".torrent"));
  assert.ok(res.deleted.includes("u/np/h/clip.mp4"));
});
