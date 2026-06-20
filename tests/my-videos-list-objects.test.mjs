// listVideoStorageObjects backs the My Videos tab's bucket reconciliation. It is
// UNLOCK-GATED — it must never attempt a bucket listing without credentials —
// and when unlocked it must list under the user's own prefix (u/<npub>/) so it
// can't enumerate (or later act on) anything outside the user's space.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { listVideoStorageObjects } from "../js/services/r2ServiceHelpers.js";

const NPUB = "npub1exampleexampleexample";

function makeCtx(overrides = {}) {
  const calls = { listObjects: [] };
  const ctx = {
    resolveConnection: async () => null,
    ensureS3SdkLoaded: async () => {},
    makeR2Client: () => ({}),
    makeS3Client: () => ({}),
    listObjects: async (args) => {
      calls.listObjects.push(args);
      return ["u/npub1example/a/v.mp4", "u/npub1example/b/v.mp4"];
    },
    ...overrides,
  };
  return { ctx, calls };
}

const UNLOCKED = {
  provider: "cloudflare_r2",
  accountId: "acc",
  bucket: "bkt",
  accessKeyId: "AK",
  secretAccessKey: "SK",
};

test("locked storage never lists (returns storage-locked)", async () => {
  const { ctx, calls } = makeCtx();
  const result = await listVideoStorageObjects(ctx, {
    npub: NPUB,
    credentials: { ...UNLOCKED, accessKeyId: "", secretAccessKey: "" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage-locked");
  assert.equal(calls.listObjects.length, 0, "must not attempt a listing while locked");
});

test("no resolvable connection returns no-connection", async () => {
  const { ctx, calls } = makeCtx();
  const result = await listVideoStorageObjects(ctx, { npub: NPUB });
  assert.equal(result.reason, "no-connection");
  assert.equal(calls.listObjects.length, 0);
});

test("missing bucket is reported and not listed", async () => {
  const { ctx, calls } = makeCtx();
  const result = await listVideoStorageObjects(ctx, {
    npub: NPUB,
    credentials: { ...UNLOCKED, bucket: "" },
  });
  assert.equal(result.reason, "missing-bucket");
  assert.equal(calls.listObjects.length, 0);
});

test("unlocked storage lists under the user's own u/<npub>/ prefix", async () => {
  const { ctx, calls } = makeCtx();
  const result = await listVideoStorageObjects(ctx, {
    npub: NPUB,
    credentials: UNLOCKED,
  });
  assert.equal(result.ok, true);
  assert.equal(calls.listObjects.length, 1);
  assert.equal(
    calls.listObjects[0].prefix,
    `u/${NPUB}/`,
    "must scope the listing to the user's own prefix",
  );
  assert.equal(calls.listObjects[0].bucket, "bkt");
  assert.deepEqual(result.keys, [
    "u/npub1example/a/v.mp4",
    "u/npub1example/b/v.mp4",
  ]);
});
