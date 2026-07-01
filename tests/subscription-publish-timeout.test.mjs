// Subscribe/unsubscribe intermittently showed "Failed to update your
// subscriptions" but worked after a refresh — because the kind-30000 list event
// was SENT and persisted, but no relay ACKed it within the 10s window, so
// assertAnyRelayAccepted threw and the optimistic UI was reverted with a scary
// error. Fix: an all-timeout (unconfirmed) publish of the idempotent replaceable
// list is treated as a SOFT SUCCESS (reconciles on next load); only an explicit
// relay rejection (or a pre-publish signer/encryption error) fails loudly. This
// covers the classifier that makes that call.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-subscription-publish-timeout
//       given: "a RelayPublishError from publishing the subscription list"
//       when: "its per-relay failures are classified"
//       then: "all-timeout => soft success; any explicit rejection => hard failure"
//   observable_outcomes:
//     - "every-relay-timeout classifies as all-timeouts (soft success)"
//     - "an explicit rejection (e.g. 'blocked'/'auth-required') does NOT"
//     - "no failures / empty does NOT (nothing to soft-succeed)"
//   determinism_controls:
//     - "constructs real RelayPublishError objects; no network/clock"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { RelayPublishError } from "../js/nostrPublish.js";
import { subscriptionPublishFailuresAreAllTimeouts } from "../js/subscriptions.js";

// Build a RelayPublishError the same way assertAnyRelayAccepted does — from the
// per-relay result objects (success:false + an Error whose message is the reason).
const errFrom = (results) =>
  new RelayPublishError("Failed to publish subscription list to any relay.", results, {
    context: "subscription list",
  });
const timeout = (url) => ({ url, success: false, error: new Error("publish timeout") });
const rejected = (url, reason) => ({ url, success: false, error: new Error(reason) });

test("every relay timing out is classified as all-timeouts (soft success)", () => {
  const e = errFrom([timeout("wss://a"), timeout("wss://b"), timeout("wss://c")]);
  assert.equal(subscriptionPublishFailuresAreAllTimeouts(e), true);
});

test("an explicit relay rejection is NOT all-timeouts (hard failure)", () => {
  const e = errFrom([timeout("wss://a"), rejected("wss://b", "blocked: spam")]);
  assert.equal(subscriptionPublishFailuresAreAllTimeouts(e), false);
});

test("only-rejections are NOT all-timeouts", () => {
  const e = errFrom([rejected("wss://a", "auth-required"), rejected("wss://b", "restricted")]);
  assert.equal(subscriptionPublishFailuresAreAllTimeouts(e), false);
});

test("no failures / empty does not soft-succeed", () => {
  assert.equal(subscriptionPublishFailuresAreAllTimeouts(errFrom([])), false);
  assert.equal(subscriptionPublishFailuresAreAllTimeouts(undefined), false);
  assert.equal(subscriptionPublishFailuresAreAllTimeouts({}), false);
});

test("case-insensitive: 'Publish Timeout' still counts as a timeout", () => {
  const e = errFrom([rejected("wss://a", "Publish Timeout")]);
  assert.equal(subscriptionPublishFailuresAreAllTimeouts(e), true);
});
