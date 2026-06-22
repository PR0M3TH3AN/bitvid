// Logged-out / local-only watch-history removal must NOT be rejected as
// "watch-history-disabled". handleWatchHistoryRemoval previously threw whenever
// the service wasn't synced (isEnabled() false), which is the normal state for a
// logged-out user — so local deletes errored out. It must instead perform the
// local removal (snapshot with replace, which rewrites the local queue) and NOT
// publish to relays.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import WatchHistoryController from "../js/ui/watchHistoryController.js";

const ACTOR = "f".repeat(64);

function makeController({ synced }) {
  const calls = { snapshot: [], relayPublish: [], errors: [], success: [] };
  const controller = new WatchHistoryController({
    watchHistoryService: {
      isEnabled: () => synced,
      supportsLocalHistory: () => true,
      snapshot: async (items, opts) => {
        calls.snapshot.push({ items, opts });
        return { ok: true, local: !synced };
      },
      loadLatest: async () => [],
    },
    nostrClient: {
      updateWatchHistoryList: async (items, opts) => {
        calls.relayPublish.push({ items, opts });
        return { ok: true, items };
      },
    },
    showError: (m) => calls.errors.push(m),
    showSuccess: (m) => calls.success.push(m),
    getActivePubkey: () => "",
  });
  return { controller, calls };
}

test("local-only removal is NOT rejected and rewrites the local list", async () => {
  const { controller, calls } = makeController({ synced: false });
  await controller.handleWatchHistoryRemoval({
    actor: ACTOR,
    items: [{ type: "e", value: "keep-1" }, { type: "e", value: "keep-2" }],
    removed: { pointerKey: "e:gone" },
  });

  assert.equal(calls.errors.length, 0, "must not show the 'disabled' error for local-only");
  assert.equal(calls.snapshot.length, 1, "must snapshot the reduced list");
  assert.equal(calls.snapshot[0].opts.replace, true, "local removal must replace, not merge");
  assert.equal(
    calls.relayPublish.length,
    0,
    "must NOT publish a local-only list to relays",
  );
});

test("synced removal still publishes to relays", async () => {
  const { controller, calls } = makeController({ synced: true });
  await controller.handleWatchHistoryRemoval({
    actor: ACTOR,
    items: [{ type: "e", value: "keep-1" }],
    removed: { pointerKey: "e:gone" },
  });

  assert.equal(calls.errors.length, 0);
  assert.equal(calls.snapshot.length, 1);
  assert.equal(calls.relayPublish.length, 1, "synced removal must push to relays");
  assert.equal(calls.relayPublish[0].opts.replace, true);
});

test("truly disabled (no sync AND no local) is still rejected", async () => {
  const calls = { errors: [] };
  const controller = new WatchHistoryController({
    watchHistoryService: {
      isEnabled: () => false,
      supportsLocalHistory: () => false,
      snapshot: async () => ({ ok: true }),
    },
    nostrClient: {},
    showError: (m) => calls.errors.push(m),
    getActivePubkey: () => "",
  });
  await assert.rejects(
    () => controller.handleWatchHistoryRemoval({ actor: ACTOR, items: [] }),
    /watch-history-disabled/,
  );
  assert.equal(calls.errors.length, 1);
});
