// #27: the Trending feed ranks the active set by VIEW COUNT (recency breaks
// ties), with unknown/not-yet-loaded counts treated as 0 and trusted-muted last.
// The sorter reads counts from the injected runtime.getViewCount (the shared
// viewCounter cache).

import test from "node:test";
import assert from "node:assert/strict";
import { createTrendingSorter } from "../js/feedEngine/sorters.js";

const item = (id, { views, created_at = 1000, muted = false } = {}) => ({
  video: {
    id,
    pubkey: "a".repeat(64),
    created_at,
    ...(muted ? { moderation: { trustedMuted: true } } : {}),
  },
  metadata: {},
  __views: views,
});

const sort = (items) => {
  const counts = new Map(items.map((i) => [i.video.id, i.__views]));
  return createTrendingSorter()(items, {
    runtime: { getViewCount: (video) => counts.get(video?.id) },
  }).map((i) => i.video.id);
};

test("ranks by view count descending", () => {
  assert.deepEqual(
    sort([item("low", { views: 5 }), item("high", { views: 100 }), item("mid", { views: 50 })]),
    ["high", "mid", "low"],
  );
});

test("recency breaks ties on equal views", () => {
  assert.deepEqual(
    sort([
      item("older", { views: 10, created_at: 1000 }),
      item("newer", { views: 10, created_at: 2000 }),
    ]),
    ["newer", "older"],
  );
});

test("unknown counts are treated as 0 (rank below known views, recency among them)", () => {
  const ids = sort([
    item("unknown-old", { views: undefined, created_at: 1000 }),
    item("known", { views: 3, created_at: 500 }),
    item("unknown-new", { views: undefined, created_at: 2000 }),
  ]);
  assert.equal(ids[0], "known", "a known-view video leads the not-yet-loaded ones");
  assert.deepEqual(ids.slice(1), ["unknown-new", "unknown-old"], "unknowns fall back to recency");
});

test("trusted-muted sinks last even if most-viewed", () => {
  assert.deepEqual(
    sort([item("muted-popular", { views: 1000, muted: true }), item("plain", { views: 1 })]),
    ["plain", "muted-popular"],
  );
});

test("tolerates non-array input and a missing getViewCount", () => {
  assert.deepEqual(createTrendingSorter()(null, {}), []);
  // No runtime.getViewCount → all 0 → recency order.
  const out = createTrendingSorter()(
    [item("a", { created_at: 1 }), item("b", { created_at: 2 })],
    {},
  ).map((i) => i.video.id);
  assert.deepEqual(out, ["b", "a"]);
});
