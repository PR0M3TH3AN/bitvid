// Watch-history removal must publish the reduced list with REPLACE semantics.
//
// Bug (SCN-watch-history-remove-replaces): the removal path calls
// watchHistoryService.snapshot(remaining, …) but snapshot published via
// updateWatchHistoryList WITHOUT replace:true — the default merges incoming
// items with the existing cached list, so the just-removed item was merged
// straight back and the deletion had no effect ("watch history delete does not
// work at all"). Removing the LAST item was even worse: an empty list fell
// through to republishing the pending queue instead of clearing.
//
// Observable outcome asserted at the boundary: the options passed to
// nostrClient.updateWatchHistoryList (the relay-publish entry point).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { watchHistoryService } from "../js/watchHistoryService.js";
import { nostrClient } from "../js/nostrClientFacade.js";

// snapshot calls these as property lookups on the shared singleton, so stubbing
// the properties is sufficient to virtualize the relay boundary.
function installStub() {
  const calls = [];
  nostrClient.updateWatchHistoryList = async (items, opts) => {
    calls.push({ items: items.slice(), opts });
    return { ok: true, items };
  };
  nostrClient.getWatchHistoryFingerprint = async () => `fp-${calls.length}`;
  return calls;
}

test("removing an item snapshots the remaining list with replace:true", async () => {
  const calls = installStub();
  const actor = "1".repeat(64);
  const remaining = [
    { type: "e", value: "keep-1" },
    { type: "e", value: "keep-2" },
  ];

  await watchHistoryService.snapshot(remaining, {
    actor,
    reason: "remove-item",
    replace: true,
  });

  assert.equal(calls.length, 1, "must publish exactly once");
  assert.equal(
    calls[0].opts.replace,
    true,
    "snapshot must forward replace:true so the removed item is not merged back",
  );
  assert.deepEqual(
    calls[0].items.map((p) => p.value).sort(),
    ["keep-1", "keep-2"],
    "must publish the remaining items",
  );
});

test("removing the LAST item publishes an empty replace (clears, not queue republish)", async () => {
  const calls = installStub();
  const actor = "2".repeat(64);

  const result = await watchHistoryService.snapshot([], {
    actor,
    reason: "remove-item",
    replace: true,
  });

  assert.notEqual(
    result?.empty,
    true,
    "an empty replace must NOT short-circuit as a no-op",
  );
  assert.equal(calls.length, 1, "empty replace must still publish to clear relays");
  assert.equal(calls[0].opts.replace, true);
  assert.equal(
    calls[0].items.length,
    0,
    "must publish an empty list, never fall back to the pending queue",
  );
});

test("adds (no replace) keep merge semantics — replace is not forced", async () => {
  const calls = installStub();
  const actor = "3".repeat(64);

  await watchHistoryService.snapshot([{ type: "e", value: "new-watch" }], {
    actor,
    reason: "watch",
  });

  assert.equal(calls.length, 1);
  assert.notEqual(
    calls[0].opts.replace,
    true,
    "a normal watch-tracking snapshot must NOT replace (it appends)",
  );
});
