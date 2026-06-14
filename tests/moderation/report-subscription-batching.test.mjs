// Scenario (SCN-report-subs-batched):
//   Given the moderation service has a SubscriptionManager available,
//   When the feed sets the active visible event-id set,
//   Then it opens exactly ONE batched kind-1984 subscription (not one per id),
//     updates that same subscription in place as the set changes,
//     backfills history for only the newly-added ids, and does nothing when the
//     set is unchanged.
//
// This is the P2 fix for the ~1000 REQ/s report storm (one sub per video × ~20
// relays, re-fired on every reconnect). See docs/architecture-refactor.md.

import test from "node:test";
import assert from "node:assert/strict";
import {
  withMockedNostrTools,
  createModerationServiceHarness,
} from "../helpers/moderation-test-helpers.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const f = (...ids) => [{ kinds: [1984], "#e": ids, limit: 500 }];

test("setActiveEventIds uses one batched report sub, updated in place", async (t) => {
  withMockedNostrTools(t);
  const { service } = createModerationServiceHarness(t);

  const calls = { subscribe: 0, update: 0, list: 0, lastFilters: null, lastList: null };
  const handle = {
    update({ filters }) {
      calls.update += 1;
      calls.lastFilters = filters;
    },
    close() {},
  };
  const fakeManager = {
    subscribe({ filters }) {
      calls.subscribe += 1;
      calls.lastFilters = filters;
      return handle;
    },
    list({ filters }) {
      calls.list += 1;
      calls.lastList = filters;
      return Promise.resolve([]);
    },
  };
  service.nostrClient = { getSubscriptionManager: () => fakeManager };

  // Initial set of two ids => ONE subscription, ONE backfill covering both.
  await service.setActiveEventIds([A, B]);
  assert.equal(calls.subscribe, 1, "exactly one batched subscription (not per-id)");
  assert.deepEqual(calls.lastFilters, f(A, B), "live sub covers the whole set in one filter");
  assert.equal(calls.list, 1, "one backfill list");
  assert.deepEqual(calls.lastList, f(A, B), "backfill covers the two new ids");

  // Add a third id => same sub updated in place; backfill ONLY the new id.
  await service.setActiveEventIds([A, B, C]);
  assert.equal(calls.subscribe, 1, "no new subscription is opened");
  assert.equal(calls.update, 1, "existing subscription updated in place");
  assert.deepEqual(calls.lastFilters, f(A, B, C), "updated filter covers the full set");
  assert.equal(calls.list, 2);
  assert.deepEqual(calls.lastList, f(C), "backfill only the newly-added id");

  // Unchanged set => no work at all.
  await service.setActiveEventIds([A, B, C]);
  assert.equal(calls.update, 1, "unchanged set must not re-issue");
  assert.equal(calls.list, 2, "unchanged set must not re-backfill");

  // Empty set => close the subscription.
  let closed = false;
  handle.close = () => {
    closed = true;
  };
  await service.setActiveEventIds([]);
  assert.ok(closed, "emptying the set closes the live subscription");
});
