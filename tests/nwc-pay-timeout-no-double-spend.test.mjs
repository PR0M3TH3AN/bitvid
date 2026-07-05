// Safety: a `pay_invoice` (or any spending method) that TIMES OUT must NOT be
// auto-resent. The wallet may have received it and be paying — the nip44→nip04
// encryption-fallback retry would double-spend. Only read-only methods (and an
// explicit unsupported-encryption rejection, which means the wallet never
// processed the request) stay retryable.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-nwc-no-double-spend
//       given: "a nip44 wallet context and various errors/methods"
//       when: "shouldRetryWithFallback decides whether to resend"
//       then: "spending method + timeout → no retry; read-only + timeout → retry; unsupported-encryption → retry for any method; already-retried → no retry"
//   observable_outcomes:
//     - "boolean retry decision per (method, error) pair"
//   determinism_controls:
//     - "pure decision function; no socket/network"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { __TESTING__ } from "../js/payments/nwcClient.js";

const { shouldRetryWithFallback, NWC_SPENDING_METHODS } = __TESTING__;

const nip44Ctx = () => ({
  encryption: { scheme: "nip44_v2" },
  encryptionState: undefined,
});
const timeout = new Error("Wallet request timed out.");
const unsupported = Object.assign(new Error("nope"), { code: "UNSUPPORTED_ENCRYPTION" });

test("timeout on a spending method never resends (no double-spend)", () => {
  const encryption = { scheme: "nip44_v2" };
  for (const method of NWC_SPENDING_METHODS) {
    assert.equal(
      shouldRetryWithFallback(nip44Ctx(), timeout, encryption, { hasRetried: false, method }),
      false,
      `${method} must not auto-retry on timeout`,
    );
  }
});

test("timeout on a read-only method may still fall back to nip04", () => {
  const ctx = nip44Ctx();
  const encryption = { scheme: "nip44_v2" };
  const decision = shouldRetryWithFallback(ctx, timeout, encryption, {
    hasRetried: false,
    method: "get_info",
  });
  // Read-only methods remain eligible for the encryption fallback (the guard
  // only blocks spending methods). The exact result depends on the context's
  // encryption state, but it must NOT be short-circuited to false by the guard.
  assert.equal(typeof decision, "boolean");
  // With a fresh context (nip04 not marked unsupported), it retries.
  assert.equal(decision, true, "read-only timeout retries the encryption fallback");
});

test("explicit unsupported-encryption rejection retries for any method", () => {
  const encryption = { scheme: "nip44_v2" };
  assert.equal(
    shouldRetryWithFallback(nip44Ctx(), unsupported, encryption, {
      hasRetried: false,
      method: "pay_invoice",
    }),
    true,
    "a rejection means the wallet never paid → safe to resend under nip04",
  );
});

test("already-retried or non-nip44 never retries", () => {
  const encryption = { scheme: "nip44_v2" };
  assert.equal(
    shouldRetryWithFallback(nip44Ctx(), timeout, encryption, {
      hasRetried: true,
      method: "get_info",
    }),
    false,
  );
  assert.equal(
    shouldRetryWithFallback(nip44Ctx(), timeout, { scheme: "nip04" }, {
      hasRetried: false,
      method: "get_info",
    }),
    false,
    "already on nip04 → no fallback",
  );
});
