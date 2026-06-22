// Reading watch history unions items across the events relays return. Watch-
// history months are replaceable (d-tag = month), so when relays disagree — a
// lagging relay still serving the pre-removal copy — the reader must keep only
// the NEWEST version per month, or removed items get resurrected by the union.

import assert from "node:assert/strict";
import test from "node:test";
import { dedupeNewestPerReplaceableAddress } from "../js/nostr/watchHistoryDedup.js";

const ev = (id, dTag, created_at) => ({
  id,
  created_at,
  tags: [["d", dTag]],
});

test("keeps only the newest event per month (d-tag)", () => {
  // Old full copy (created 100) and new reduced copy (created 200) of 2026-06,
  // as if a lagging relay still served the old one alongside the fresh one.
  const out = dedupeNewestPerReplaceableAddress([
    ev("old", "2026-06", 100),
    ev("new", "2026-06", 200),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "new", "the newest version of the month wins");
});

test("preserves distinct months", () => {
  const out = dedupeNewestPerReplaceableAddress([
    ev("a", "2026-06", 200),
    ev("b", "2026-05", 100),
  ]);
  assert.deepEqual(
    out.map((e) => e.id).sort(),
    ["a", "b"],
    "different months are all kept",
  );
});

test("result is sorted newest-first", () => {
  const out = dedupeNewestPerReplaceableAddress([
    ev("older", "2026-05", 100),
    ev("newer", "2026-06", 300),
    ev("mid", "2026-04", 200),
  ]);
  assert.deepEqual(out.map((e) => e.id), ["newer", "mid", "older"]);
});

test("events without a d-tag are kept individually (by id)", () => {
  const out = dedupeNewestPerReplaceableAddress([
    { id: "x", created_at: 1, tags: [] },
    { id: "y", created_at: 2, tags: [] },
  ]);
  assert.equal(out.length, 2);
});

test("the newest month copy with FEWER items is what survives (removal sticks)", () => {
  // Models the real bug: old copy has [a,b]; the removal published [a] to some
  // relays. Dedup must surface only the [a] event so the union drops b.
  const old = { id: "old", created_at: 100, tags: [["d", "2026-06"]], items: ["a", "b"] };
  const fresh = { id: "fresh", created_at: 200, tags: [["d", "2026-06"]], items: ["a"] };
  const out = dedupeNewestPerReplaceableAddress([old, fresh]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].items, ["a"], "only the post-removal copy contributes");
});
