import test from "node:test";
import assert from "node:assert/strict";

import {
  compareListEventsDesc,
  computeIncrementalSinceWithOverlap,
  selectNewestListEvent,
} from "../../js/nostr/listEventOrdering.js";

test("computeIncrementalSinceWithOverlap includes same-second updates", () => {
  assert.equal(computeIncrementalSinceWithOverlap(100, 1), 99);
  assert.equal(computeIncrementalSinceWithOverlap(0, 1), 0);
  assert.equal(computeIncrementalSinceWithOverlap("101", 1), 100);
});

test("compareListEventsDesc breaks ties by preferred kind then event id", () => {
  const canonical = { id: "0001", created_at: 100, kind: 30015 };
  const legacy = { id: "ffff", created_at: 100, kind: 30005 };
  assert.equal(
    compareListEventsDesc(canonical, legacy, { preferredKinds: [30015, 30005] }) < 0,
    true,
  );

  const lowerId = { id: "0001", created_at: 100, kind: 30015 };
  const higherId = { id: "0002", created_at: 100, kind: 30015 };
  assert.equal(compareListEventsDesc(higherId, lowerId) < 0, true);
});

test("selectNewestListEvent chooses deterministic winner on timestamp ties", () => {
  const events = [
    { id: "aaa0", created_at: 500, kind: 30000 },
    { id: "fff0", created_at: 500, kind: 30000 },
    { id: "0100", created_at: 499, kind: 30000 },
  ];
  const newest = selectNewestListEvent(events);
  assert.equal(newest?.id, "fff0");
});
