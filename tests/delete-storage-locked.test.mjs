// When a user deletes a video but their storage is locked, the hosted file (and
// its .torrent / thumbnail) can't be removed and stays publicly downloadable.
// deleteVideoStorage must report "storage-locked" so the UI can warn the user —
// BUT only when there are genuinely hosted objects to remove. An external-URL
// video (nothing on the user's bucket) must NOT trigger a false alarm, even
// while locked.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { R2Service } from "../js/services/r2Service.js";

const BASE = "https://cdn.example.com";

// A locked connection: bucket + public base URL are known (stored in plaintext),
// but the credentials are unavailable.
const LOCKED = {
  provider: "cloudflare_r2",
  accountId: "acc",
  bucket: "my-bucket",
  publicBaseUrl: BASE,
  accessKeyId: "",
  secretAccessKey: "",
};

test("locked storage with hosted objects reports storage-locked", async () => {
  const svc = new R2Service();
  const result = await svc.deleteVideoStorage({
    videos: [{ url: `${BASE}/u/npub1abc/hash/video.mp4` }],
    credentials: LOCKED,
  });
  assert.equal(result.skipped, true);
  assert.equal(
    result.reason,
    "storage-locked",
    "a hosted object that can't be deleted because storage is locked must be flagged",
  );
  assert.equal(result.deleted.length, 0, "nothing is deleted while locked");
});

test("locked storage but an external-URL video is NOT a false storage-locked alarm", async () => {
  const svc = new R2Service();
  const result = await svc.deleteVideoStorage({
    videos: [{ url: "https://some-other-host.example/video.mp4" }],
    credentials: LOCKED,
  });
  assert.equal(result.skipped, true);
  assert.equal(
    result.reason,
    "no-matching-objects",
    "an external URL has nothing on the user's bucket — must not warn about locked storage",
  );
});

test("unlocked storage actually deletes the hosted objects (no false lock warning)", async () => {
  const deleted = [];
  const svc = new R2Service({
    deleteObject: async ({ key }) => {
      deleted.push(key);
    },
    // makeR2Client is invoked but its client is only used by deleteObject, which
    // we've stubbed — return a placeholder so client construction succeeds.
    makeR2Client: () => ({}),
  });
  const result = await svc.deleteVideoStorage({
    videos: [{ url: `${BASE}/u/npub1abc/hash/video.mp4` }],
    credentials: {
      ...LOCKED,
      accessKeyId: "AKIA-test",
      secretAccessKey: "secret-test",
    },
  });
  assert.equal(result.skipped, false, "unlocked storage must not skip");
  assert.ok(
    result.deleted.includes("u/npub1abc/hash/video.mp4"),
    "the hosted video object should be deleted when unlocked",
  );
});
