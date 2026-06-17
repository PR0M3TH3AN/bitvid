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
  accessKeyId: "AK",
  secretAccessKey: "SK",
  bucket: "my-bucket",
  publicBaseUrl: BASE,
  endpoint: "https://acct.r2.cloudflarestorage.com",
  region: "auto",
};

function buildService(creds, deleteImpl) {
  const deleted = [];
  const svc = new R2Service({
    makeR2Client: () => ({ __mock: true }),
    deleteObject:
      deleteImpl ||
      (async ({ key }) => {
        deleted.push(key);
      }),
  });
  svc.resolveConnection = async () => creds;
  return { svc, deleted };
}

test("deletes the video, its .torrent, and the thumbnail for an owned video", async () => {
  const { svc, deleted } = buildService(CREDS);
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
