// Channel-grid relay fetch is bounded (raceListWithTimeout): a hung relay (one
// that never sends EOSE) must resolve to "no events" instead of stalling the
// whole grid render. A failing relay likewise contributes [] rather than
// throwing, and a late rejection after the timeout can't surface as unhandled.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-channel-relay-timeout
//       given: "a relay list() that resolves / hangs / rejects / returns non-array"
//       when: "raceListWithTimeout wraps it with a short timeout"
//       then: "success returns the array; hang/reject/garbage resolve to []"
//   observable_outcomes:
//     - "a fast success passes the array through unchanged"
//     - "a hang resolves to [] within the timeout bound (does not stall)"
//     - "a rejection resolves to [] (does not throw)"
//   determinism_controls:
//     - "explicit short timeoutMs; hang modeled as a never-resolving promise"
//   anti_cheat_rationale:
//     prevents: ["retry/sleep-based flake masking", "hard-coded return value"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { raceListWithTimeout } from "../js/channelProfile.js";

test("passes a fast successful result through unchanged", async () => {
  const events = [{ id: "a" }, { id: "b" }];
  const result = await raceListWithTimeout(async () => events, 1000);
  assert.deepEqual(result, events);
});

test("a hung relay resolves to [] within the timeout instead of stalling", async () => {
  const started = Date.now();
  // Never resolves — models a relay that never sends EOSE.
  const result = await raceListWithTimeout(() => new Promise(() => {}), 30);
  assert.deepEqual(result, []);
  assert.ok(Date.now() - started < 500, "must resolve promptly via the timeout");
});

test("a rejecting relay resolves to [] rather than throwing", async () => {
  const result = await raceListWithTimeout(async () => {
    throw new Error("relay exploded");
  }, 1000);
  assert.deepEqual(result, []);
});

test("a non-array result is normalized to []", async () => {
  const result = await raceListWithTimeout(async () => null, 1000);
  assert.deepEqual(result, []);
});

test("a late rejection after the timeout wins does not throw (no unhandled)", async () => {
  // The list rejects AFTER the timeout has already resolved to []. The helper
  // must swallow it so it can't surface as an unhandled rejection.
  const result = await raceListWithTimeout(
    () => new Promise((_, reject) => setTimeout(() => reject(new Error("late")), 40)),
    10,
  );
  assert.deepEqual(result, []);
  // Give the late rejection a tick to (not) blow up.
  await new Promise((resolve) => setTimeout(resolve, 60));
});
