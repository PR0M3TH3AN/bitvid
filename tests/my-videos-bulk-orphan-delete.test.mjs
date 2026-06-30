// #8: a one-click "Delete all" bulk action for orphaned storage objects in My Videos.
// It must (a) send EVERY listed orphan key in a single deleteStorageKeys call, (b) be
// confirmation-gated, (c) refresh on success, and (d) surface storage-locked + partial
// outcomes honestly (never claim success when nothing was deleted).

import "./test-helpers/setup-localstorage.mjs";
import test, { afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { MyVideosController } from "../js/ui/profileModal/MyVideosController.js";

const KEYS = ["u/n/a/v.mp4", "u/n/a/v.torrent", "u/n/b/old.mp4"];

function makeController({ deleteResult, confirm = true } = {}) {
  const calls = { deleteKeys: [], success: [], error: [], populated: 0 };
  const mainController = {
    services: {
      r2Service: {
        deleteStorageKeys: async ({ keys, pubkey }) => {
          calls.deleteKeys.push({ keys, pubkey });
          return deleteResult;
        },
      },
    },
    showSuccess: (m) => calls.success.push(m),
    showError: (m) => calls.error.push(m),
    normalizeHexPubkey: (v) => v,
    getActivePubkey: () => "abc",
  };
  const c = new MyVideosController(mainController);
  c.pubkey = "abc";
  c.orphanKeys = KEYS.slice();
  c.populate = async () => {
    calls.populated += 1;
  };
  globalThis.window = { confirm: () => confirm };
  // The controller guards DOM writes with `instanceof HTMLElement`; define a stand-in
  // so the check evaluates (to false, since we run without a real DOM) instead of
  // throwing ReferenceError in this non-jsdom test.
  if (typeof globalThis.HTMLElement === "undefined") {
    globalThis.HTMLElement = class {};
  }
  return { c, calls };
}

afterEach(() => {
  delete globalThis.window;
  delete globalThis.HTMLElement;
});

test("deletes every orphan key in a single call and refreshes on full success", async () => {
  const { c, calls } = makeController({
    deleteResult: { ok: true, deleted: KEYS.slice() },
  });
  await c.handleDeleteAllOrphans();

  assert.equal(calls.deleteKeys.length, 1, "exactly one bulk delete call");
  assert.deepEqual(calls.deleteKeys[0].keys, KEYS, "all keys sent at once");
  assert.equal(calls.deleteKeys[0].pubkey, "abc");
  assert.equal(calls.populated, 1, "list refreshed after delete");
  assert.equal(calls.success.length, 1);
  assert.match(calls.success[0], /all 3/i);
  assert.equal(calls.error.length, 0);
});

test("cancelling the confirmation deletes nothing", async () => {
  const { c, calls } = makeController({
    deleteResult: { ok: true, deleted: KEYS.slice() },
    confirm: false,
  });
  await c.handleDeleteAllOrphans();
  assert.equal(calls.deleteKeys.length, 0, "no delete when the user cancels");
  assert.equal(calls.populated, 0);
});

test("storage-locked surfaces an unlock prompt and does not refresh or claim success", async () => {
  const { c, calls } = makeController({
    deleteResult: { ok: false, reason: "storage-locked" },
  });
  await c.handleDeleteAllOrphans();
  assert.equal(calls.success.length, 0);
  assert.equal(calls.populated, 0);
  assert.equal(calls.error.length, 1);
  assert.match(calls.error[0], /unlock storage/i);
});

test("a partial delete reports how many succeeded and how many failed", async () => {
  const { c, calls } = makeController({
    deleteResult: { ok: true, deleted: KEYS.slice(0, 2) }, // 2 of 3
  });
  await c.handleDeleteAllOrphans();
  assert.equal(calls.populated, 1);
  assert.equal(calls.success.length, 1);
  assert.match(calls.success[0], /2/);
  assert.match(calls.success[0], /1/);
});

test("an empty orphan list is a no-op (no delete call)", async () => {
  const { c, calls } = makeController({ deleteResult: { ok: true, deleted: [] } });
  c.orphanKeys = [];
  await c.handleDeleteAllOrphans();
  assert.equal(calls.deleteKeys.length, 0);
});
