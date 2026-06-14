// Scenario (SCN-view-counts-batched):
//   Given multiple grid cards subscribe to view counts,
//   When a SubscriptionManager is available,
//   Then they share ONE batched kind-30079 subscription whose filter covers all
//     their addresses, and incoming view events are bucketed back to the correct
//     per-pointer count (one video's views never leak into another's).
//
// P3 fix for the per-card view-count storm. See docs/architecture-refactor.md.

import "./test-helpers/setup-localstorage.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { nostrClient } = await import("../js/nostrClientFacade.js");
const vc = await import("../js/viewCounter.js");

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test("grid view counts share one batched sub and bucket by #a", async (t) => {
  const original = nostrClient.getSubscriptionManager;
  let subscribeCalls = 0;
  let listCalls = 0;
  let lastFilters = null;
  let onEvent = null;
  const handle = {
    update({ filters }) {
      lastFilters = filters;
    },
    close() {},
  };
  nostrClient.getSubscriptionManager = () => ({
    subscribe(opts) {
      subscribeCalls += 1;
      lastFilters = opts.filters;
      onEvent = opts.onEvent;
      return handle;
    },
    list() {
      listCalls += 1;
      return Promise.resolve([]);
    },
  });
  t.after(() => {
    nostrClient.getSubscriptionManager = original;
  });

  const pk = "a".repeat(64);
  const A1 = `30078:${pk}:vid-batch-1`;
  const A2 = `30078:${pk}:vid-batch-2`;
  let total1 = null;
  let total2 = null;
  const tok1 = vc.subscribeToVideoViewCount({ type: "a", value: A1 }, ({ total }) => {
    total1 = total;
  });
  const tok2 = vc.subscribeToVideoViewCount({ type: "a", value: A2 }, ({ total }) => {
    total2 = total;
  });

  await tick(); // let the coalesced live refresh + backfill run

  assert.equal(subscribeCalls, 1, "exactly one batched subscription for both cards");
  const aVals = (lastFilters || []).flatMap((f) => f["#a"] || []);
  assert.ok(
    aVals.includes(A1) && aVals.includes(A2),
    "the single batched filter covers both video addresses",
  );
  assert.ok(typeof onEvent === "function", "batched sub wired an onEvent handler");

  // Deliver a view event for A1 only — only A1's count should move.
  onEvent({
    id: "view-1",
    pubkey: "b".repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    tags: [["a", A1], ["t", "view"]],
  });
  assert.equal(total1, 1, "A1 view count incremented");
  assert.equal(total2, 0, "A2 view count unaffected (correct per-#a bucketing)");

  vc.unsubscribeFromVideoViewCount({ type: "a", value: A1 }, tok1);
  vc.unsubscribeFromVideoViewCount({ type: "a", value: A2 }, tok2);
});
