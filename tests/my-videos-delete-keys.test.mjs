// deleteStorageKeys reclaims orphaned bucket objects from the My Videos tab. It
// is destructive, so it must be UNLOCK-GATED (never delete without credentials)
// and only ever delete the exact keys it was given.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { deleteStorageKeys } from "../js/services/r2ServiceHelpers.js";

function makeCtx() {
  const deleted = [];
  const ctx = {
    resolveConnection: async () => null,
    ensureS3SdkLoaded: async () => {},
    makeR2Client: () => ({}),
    makeS3Client: () => ({}),
    deleteObject: async ({ key }) => {
      deleted.push(key);
    },
  };
  return { ctx, deleted };
}

const UNLOCKED = {
  provider: "cloudflare_r2",
  accountId: "acc",
  bucket: "bkt",
  accessKeyId: "AK",
  secretAccessKey: "SK",
};

test("locked storage never deletes", async () => {
  const { ctx, deleted } = makeCtx();
  const result = await deleteStorageKeys(ctx, {
    keys: ["u/n/a/v.mp4"],
    credentials: { ...UNLOCKED, accessKeyId: "", secretAccessKey: "" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage-locked");
  assert.equal(deleted.length, 0, "must not delete anything while locked");
});

test("empty key list is a no-op", async () => {
  const { ctx, deleted } = makeCtx();
  const result = await deleteStorageKeys(ctx, { keys: [], credentials: UNLOCKED });
  assert.equal(result.reason, "no-keys");
  assert.equal(deleted.length, 0);
});

test("unlocked: deletes exactly the given keys", async () => {
  const { ctx, deleted } = makeCtx();
  const result = await deleteStorageKeys(ctx, {
    keys: ["u/n/a/v.mp4", "u/n/a/v.torrent"],
    credentials: UNLOCKED,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(deleted.sort(), ["u/n/a/v.mp4", "u/n/a/v.torrent"]);
  assert.deepEqual(result.deleted.sort(), ["u/n/a/v.mp4", "u/n/a/v.torrent"]);
});

test("a per-key failure is recorded but doesn't abort the rest", async () => {
  const { ctx, deleted } = makeCtx();
  ctx.deleteObject = async ({ key }) => {
    if (key.includes("boom")) {
      throw new Error("nope");
    }
    deleted.push(key);
  };
  const result = await deleteStorageKeys(ctx, {
    keys: ["u/n/a/boom.mp4", "u/n/a/ok.mp4"],
    credentials: UNLOCKED,
  });
  assert.deepEqual(deleted, ["u/n/a/ok.mp4"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].key, "u/n/a/boom.mp4");
});
