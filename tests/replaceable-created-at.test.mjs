// Replaceable events (hashtag prefs, subscriptions, blocks) must publish with a
// created_at STRICTLY greater than the last one, or relays reject the second of two
// quick edits as "not newer" — the "added a second disinterest, it errored but
// works after refresh" bug. nextReplaceableCreatedAt guarantees monotonicity.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-replaceable-created-at
//       given: "the last-published created_at + the current clock"
//       when: "nextReplaceableCreatedAt computes the next created_at"
//       then: "it is strictly greater than the last, and >= now"
//   observable_outcomes:
//     - "same wall-clock second as the last -> last+1 (never equal)"
//     - "clock ahead of last -> uses now"
//     - "no prior event -> uses now"
//     - "successive rapid calls strictly increase"
//   determinism_controls:
//     - "pure function with an injected clock"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { nextReplaceableCreatedAt } from "../js/nostr/replaceableCreatedAt.js";

test("same wall-clock second as the last event -> strictly greater (last+1)", () => {
  assert.equal(nextReplaceableCreatedAt(1000, 1000), 1001);
  assert.equal(nextReplaceableCreatedAt(1000, 999), 1001, "even a laggy clock advances");
});

test("clock ahead of the last event -> uses the clock", () => {
  assert.equal(nextReplaceableCreatedAt(1000, 2000), 2000);
});

test("no prior event -> uses the clock", () => {
  assert.equal(nextReplaceableCreatedAt(0, 500), 500);
  assert.equal(nextReplaceableCreatedAt(undefined, 500), 500);
  assert.equal(nextReplaceableCreatedAt(null, 500), 500);
});

test("rapid successive edits in the same second strictly increase", () => {
  const now = 1_700_000_000;
  let last = 0;
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    last = nextReplaceableCreatedAt(last, now); // clock frozen within the same second
    seen.push(last);
  }
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `edit ${i} must be strictly newer than ${i - 1}`);
  }
  assert.deepEqual(seen, [now, now + 1, now + 2, now + 3, now + 4]);
});

test("floors fractional inputs (created_at is unix seconds)", () => {
  assert.equal(nextReplaceableCreatedAt(1000.9, 1000.4), 1001);
});
