import assert from "node:assert/strict";
import test from "node:test";

import { buildReactionFilters } from "../js/reactionCounter.js";

test("addressable video reactions query both address and immutable event references", () => {
  const filters = buildReactionFilters(
    {
      type: "a",
      value: "34235:creator:episode-42",
      relay: "wss://relay.example",
      eventId: "immutable-video-event-id"
    },
    { limit: 400, since: 123 }
  );

  assert.deepEqual(filters, [
    {
      kinds: [7],
      "#a": ["34235:creator:episode-42"],
      limit: 400,
      since: 123
    },
    {
      kinds: [7],
      "#e": ["immutable-video-event-id"],
      limit: 400,
      since: 123
    }
  ]);
});

test("event-addressed video reactions keep a single immutable event query", () => {
  assert.deepEqual(
    buildReactionFilters({ type: "e", value: "video-event-id" }),
    [{ kinds: [7], "#e": ["video-event-id"] }]
  );
});
