// Conflict-aware push (todo #15 follow-up): a save pushes silently UNLESS the
// relay copy is newer than the one we last pushed (another device changed it) —
// then it must ask confirmOverwrite before clobbering it. On confirm it forces a
// strictly-newer created_at so the replace wins; on decline it does not push.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { pushWithConflictCheck } from "../js/services/syncConflict.js";
import { getSyncPushedAt } from "../js/services/settingsSyncFlags.js";

const PUBKEY = "a".repeat(64);
const DTAG = "bitvid:nwc";
const KIND = "wallet";

function makeEncryptedSync(remoteCreatedAt) {
  return {
    pushes: [],
    async exists() {
      return remoteCreatedAt
        ? { exists: true, createdAt: remoteCreatedAt }
        : { exists: false };
    },
    async push(dTag, payload, options) {
      const createdAt = Math.max(2_000_000_000, (options?.afterCreatedAt || 0) + 1);
      this.pushes.push({ dTag, payload, options, createdAt });
      return { ok: true, accepted: 1, total: 1, createdAt };
    },
  };
}

test("no remote copy → pushes silently, records the push timestamp", async () => {
  localStorage.clear();
  const es = makeEncryptedSync(0);
  let confirmCalls = 0;
  const result = await pushWithConflictCheck({
    encryptedSync: es,
    dTag: DTAG,
    kind: KIND,
    pubkey: PUBKEY,
    payload: { nwcUri: "x" },
    confirmOverwrite: () => {
      confirmCalls += 1;
      return false;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(confirmCalls, 0, "no conflict → never prompt");
  assert.equal(es.pushes.length, 1);
  assert.equal(getSyncPushedAt(PUBKEY, KIND), es.pushes[0].createdAt, "records push time");
});

test("remote NEWER than our last push → prompts; decline does NOT push", async () => {
  localStorage.clear();
  const es = makeEncryptedSync(9_999_999_999); // far-future remote = newer
  let prompted = 0;
  const result = await pushWithConflictCheck({
    encryptedSync: es,
    dTag: DTAG,
    kind: KIND,
    pubkey: PUBKEY,
    payload: { nwcUri: "x" },
    confirmOverwrite: () => {
      prompted += 1;
      return false; // user declines
    },
  });
  assert.equal(prompted, 1, "newer remote must prompt");
  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(es.pushes.length, 0, "declining must NOT overwrite the newer remote");
});

test("remote NEWER but user confirms → pushes strictly-newer than remote", async () => {
  localStorage.clear();
  const remote = 9_999_999_999;
  const es = makeEncryptedSync(remote);
  const result = await pushWithConflictCheck({
    encryptedSync: es,
    dTag: DTAG,
    kind: KIND,
    pubkey: PUBKEY,
    payload: { nwcUri: "x" },
    confirmOverwrite: () => true,
  });
  assert.equal(result.ok, true);
  assert.equal(es.pushes.length, 1);
  assert.ok(
    es.pushes[0].createdAt > remote,
    "the overwrite must be strictly newer than the remote so the replace wins",
  );
});

test("remote OLDER than our last push → no prompt (we already own the latest)", async () => {
  localStorage.clear();
  // First push establishes our last-pushed timestamp.
  const es = makeEncryptedSync(0);
  await pushWithConflictCheck({
    encryptedSync: es, dTag: DTAG, kind: KIND, pubkey: PUBKEY, payload: { nwcUri: "x" },
  });
  const ours = getSyncPushedAt(PUBKEY, KIND);

  // Now remote reports an OLDER created_at than what we last pushed.
  const es2 = makeEncryptedSync(ours - 100);
  es2.pushes = [];
  let prompted = 0;
  const result = await pushWithConflictCheck({
    encryptedSync: es2, dTag: DTAG, kind: KIND, pubkey: PUBKEY,
    payload: { nwcUri: "y" },
    confirmOverwrite: () => { prompted += 1; return false; },
  });
  assert.equal(prompted, 0, "remote not newer than our last push → no prompt");
  assert.equal(result.ok, true);
  assert.equal(es2.pushes.length, 1);
});
