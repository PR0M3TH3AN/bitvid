// spreadAuthors() is a gentle diversity re-rank: it keeps the caller's ranked
// order as the priority but breaks up runs of the same creator so a feed tab
// doesn't read as walls of one uploader. The #1 ranked item is always chosen
// first (so "best-fit"/"most-viewed" stays on top), and each author's items keep
// their relative ranked order.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-spread-authors
//       given: "a ranked list with clustered authors"
//       when: "spreadAuthors re-ranks it (window 1)"
//       then: "top item is unchanged, no avoidable adjacent same-author, order-within-author preserved"
//   observable_outcomes:
//     - "result[0] === input[0] (top rank preserved)"
//     - "no two consecutive items share an author when another author remains"
//     - "same-author items keep their input relative order"
//   determinism_controls:
//     - "pure function; fixed input arrays; no clock/network"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "snapshot rubber-stamping"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { spreadAuthors } from "../../js/feedEngine/sorters.js";

const item = (id, pubkey) => ({ video: { id, pubkey } });
const ids = (list) => list.map((i) => i.video.id);
const authorsOf = (list) => list.map((i) => i.video.pubkey);

function hasAvoidableAdjacentDupe(list) {
  const authors = authorsOf(list);
  const distinct = new Set(authors).size;
  if (distinct <= 1) return false; // unavoidable
  for (let i = 1; i < authors.length; i += 1) {
    if (authors[i] && authors[i] === authors[i - 1]) {
      return true;
    }
  }
  return false;
}

test("keeps the #1 ranked item on top", () => {
  const input = [
    item("a1", "A"),
    item("a2", "A"),
    item("b1", "B"),
    item("c1", "C"),
  ];
  const out = spreadAuthors(input);
  assert.equal(out[0].video.id, "a1", "highest-ranked item stays first");
});

test("breaks up a run of one author into non-adjacent slots", () => {
  // Ranked order clusters author A at the top.
  const input = [
    item("a1", "A"),
    item("a2", "A"),
    item("a3", "A"),
    item("b1", "B"),
    item("c1", "C"),
  ];
  const out = spreadAuthors(input);
  assert.equal(hasAvoidableAdjacentDupe(out), false, "no avoidable adjacent same-author");
  assert.equal(out.length, input.length, "no items dropped or duplicated");
  assert.deepEqual(ids(out).sort(), ids(input).sort(), "same set of items");
});

test("preserves each author's relative ranked order", () => {
  const input = [
    item("a1", "A"),
    item("a2", "A"),
    item("b1", "B"),
    item("a3", "A"),
    item("b2", "B"),
  ];
  const out = ids(spreadAuthors(input));
  // A's items stay in a1 < a2 < a3 order; B's in b1 < b2 order.
  assert.ok(out.indexOf("a1") < out.indexOf("a2"), "a1 before a2");
  assert.ok(out.indexOf("a2") < out.indexOf("a3"), "a2 before a3");
  assert.ok(out.indexOf("b1") < out.indexOf("b2"), "b1 before b2");
});

test("all-one-author input is returned in original order", () => {
  const input = [item("a1", "A"), item("a2", "A"), item("a3", "A")];
  assert.deepEqual(ids(spreadAuthors(input)), ["a1", "a2", "a3"]);
});

test("lists shorter than 3 are returned unchanged (copy)", () => {
  const input = [item("a1", "A"), item("a2", "A")];
  const out = spreadAuthors(input);
  assert.deepEqual(ids(out), ["a1", "a2"]);
  assert.notEqual(out, input, "returns a copy, not the same reference");
});

test("anonymous authors are allowed to sit adjacent (not treated as repeats)", () => {
  const input = [
    item("x1", ""),
    item("x2", ""),
    item("x3", ""),
  ];
  // No real author to diversify against → order preserved, no infinite defer.
  assert.deepEqual(ids(spreadAuthors(input)), ["x1", "x2", "x3"]);
});

test("window:2 spreads a clustered author across the feed (tail dupes only when forced)", () => {
  // A is 50% of the list; a larger window pushes A's items further apart.
  const input = [
    item("a1", "A"),
    item("a2", "A"),
    item("a3", "A"),
    item("b1", "B"),
    item("c1", "C"),
    item("d1", "D"),
  ];
  const out = authorsOf(spreadAuthors(input, { window: 2 }));
  assert.equal(out[0], "A", "top item preserved");
  // No adjacent dupes (always achievable here since no author exceeds 50%).
  for (let i = 1; i < out.length; i += 1) {
    assert.notEqual(out[i], out[i - 1], `no adjacent dupe at ${i}`);
  }
  // A's three items are genuinely spread out, not stacked at the front.
  const aPositions = out
    .map((author, idx) => (author === "A" ? idx : -1))
    .filter((idx) => idx >= 0);
  assert.ok(
    aPositions[aPositions.length - 1] - aPositions[0] >= 4,
    "A's items span most of the feed rather than clustering",
  );
});
