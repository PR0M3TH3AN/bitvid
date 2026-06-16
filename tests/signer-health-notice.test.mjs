// Scenario (SCN-signer-unresponsive-notice):
//   Given a NIP-07 signer that reports itself present but never answers decrypt
//     calls (the real-env dead-background-worker case — KNOWN_BUGS #0),
//   When list decrypts time out repeatedly,
//   Then after a small threshold of consecutive timeouts the user is shown ONE
//     actionable notice (rate limited via lastNoticeAt, not spammed per retry),
//   And a successful decrypt resets the streak so a single later blip doesn't
//     immediately re-warn.
//
// Observed at the boundary via getSignerHealthState() (consecutiveTimeouts +
// lastNoticeAt), so we don't depend on the read-only logger internals.

import { test } from "node:test";
import assert from "node:assert/strict";

const {
  noteSignerDecryptTimeout,
  noteSignerDecryptSuccess,
  getSignerHealthState,
  __testExports,
} = await import("../js/utils/signerHealthNotice.js");

test("notice fires once after consecutive timeouts, then rate-limits", () => {
  __testExports.reset();
  const threshold = __testExports.CONSECUTIVE_TIMEOUT_THRESHOLD;

  for (let i = 0; i < threshold - 1; i++) {
    noteSignerDecryptTimeout("hashtags");
  }
  assert.equal(
    getSignerHealthState().lastNoticeAt,
    0,
    "no notice should fire below the threshold",
  );

  noteSignerDecryptTimeout("hashtags");
  const firedAt = getSignerHealthState().lastNoticeAt;
  assert.ok(firedAt > 0, "notice fires when the streak crosses the threshold");

  // Further timeouts within the cooldown must NOT bump the notice timestamp.
  for (let i = 0; i < 10; i++) {
    noteSignerDecryptTimeout("blocks");
  }
  assert.equal(
    getSignerHealthState().lastNoticeAt,
    firedAt,
    "must not re-warn within the cooldown window",
  );
});

test("a successful decrypt resets the streak", () => {
  __testExports.reset();
  const threshold = __testExports.CONSECUTIVE_TIMEOUT_THRESHOLD;

  for (let i = 0; i < threshold - 1; i++) {
    noteSignerDecryptTimeout("subscriptions");
  }
  noteSignerDecryptSuccess();
  assert.equal(
    getSignerHealthState().consecutiveTimeouts,
    0,
    "success clears the timeout streak",
  );

  noteSignerDecryptTimeout("subscriptions");
  assert.equal(
    getSignerHealthState().lastNoticeAt,
    0,
    "a success between timeouts prevents the notice from firing",
  );
});
