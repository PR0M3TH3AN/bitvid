// Batching the community-blacklist curator fetch into a single multi-author REQ
// (instead of one kind-30000 REQ per curator — the cold-start relay storm).
// Tests the pure filter-builder + result-selector.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBatchedReferenceFilter,
  selectNewestEventsForReferences,
} from "../js/adminListBatch.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

function evt({ id, pubkey, d, created_at }) {
  return { id, pubkey, created_at, tags: [["d", d]] };
}

test("builds one filter with all unique authors + d-tags", () => {
  const filter = buildBatchedReferenceFilter([
    { authorHex: A, dTag: "community:blacklist" },
    { authorHex: B, dTag: "community:blacklist" },
    { authorHex: A, dTag: "community:blacklist" }, // dup
  ]);
  assert.deepEqual(filter.kinds, [30000]);
  assert.deepEqual(filter.authors.sort(), [A, B]);
  assert.deepEqual(filter["#d"], ["community:blacklist"]);
});

test("returns null when there are no usable references", () => {
  assert.equal(buildBatchedReferenceFilter([]), null);
  assert.equal(buildBatchedReferenceFilter([{ authorHex: "", dTag: "" }]), null);
});

test("selects the newest event per (author, d-tag) reference", () => {
  const references = [
    { authorHex: A, dTag: "list-1" },
    { authorHex: B, dTag: "list-1" },
  ];
  const events = [
    evt({ id: "a-old", pubkey: A, d: "list-1", created_at: 100 }),
    evt({ id: "a-new", pubkey: A, d: "list-1", created_at: 200 }),
    evt({ id: "b-only", pubkey: B, d: "list-1", created_at: 50 }),
  ];
  const matched = selectNewestEventsForReferences(events, references);
  assert.deepEqual(matched.map((e) => e.id), ["a-new", "b-only"]);
});

test("discards cross-product events that aren't real references", () => {
  // The batched filter (authors A,B × d-tags d1,d2) can return (A,d2) even
  // though only (A,d1) and (B,d2) were requested. Those must be dropped.
  const references = [
    { authorHex: A, dTag: "d1" },
    { authorHex: B, dTag: "d2" },
  ];
  const events = [
    evt({ id: "a-d1", pubkey: A, d: "d1", created_at: 10 }),
    evt({ id: "a-d2-crossproduct", pubkey: A, d: "d2", created_at: 99 }),
    evt({ id: "b-d2", pubkey: B, d: "d2", created_at: 10 }),
  ];
  const matched = selectNewestEventsForReferences(events, references);
  assert.deepEqual(matched.map((e) => e.id).sort(), ["a-d1", "b-d2"]);
});

test("tie-break on created_at uses higher event id (deterministic)", () => {
  const references = [{ authorHex: A, dTag: "d1" }];
  const events = [
    evt({ id: "id-aaa", pubkey: A, d: "d1", created_at: 100 }),
    evt({ id: "id-zzz", pubkey: A, d: "d1", created_at: 100 }),
  ];
  const matched = selectNewestEventsForReferences(events, references);
  assert.deepEqual(matched.map((e) => e.id), ["id-zzz"]);
});
