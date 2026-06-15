// Scenario (SCN-nip07-channel-breaker):
//   Given the NIP-07 signer channel that lists decrypt through,
//   When it stops responding (consecutive call timeouts, as happens when the
//     extension's message port drops under the post-login burst — KNOWN_BUGS #0),
//   Then after a threshold of consecutive timeouts the circuit OPENS and further
//     calls fail FAST (code "nip07-channel-unresponsive") instead of each hanging
//     to its full timeout — so the per-list retry loops stop pinning the CPU.
//   And while open a single periodic PROBE is allowed through to detect recovery;
//     one successful call CLOSES the circuit (no page refresh required).
//   And a call that ERRORS (extension responded) does NOT count toward opening.
//   And interactive permission prompts (bypassCircuitBreaker) are never fast-failed.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
  __testExports,
} from "../../js/nostr/nip07Permissions.js";

const {
  runNip07WithRetry,
  resetNip07ChannelBreaker,
  getNip07ChannelBreakerState,
  CIRCUIT_TIMEOUT_THRESHOLD,
} = __testExports;

// A NIP-07 call that never responds -> withNip07Timeout fires the timeout.
const hangingOp = () => new Promise(() => {});
// A NIP-07 call the extension answers successfully (channel alive).
const successOp = async () => "ok";
// A NIP-07 call the extension answers with an error (channel alive, but refused).
const respondingErrorOp = async () => {
  throw new Error("user rejected");
};

// Small timeout so "hangs to full timeout" is fast in the test; no retry
// extension so each attempt is exactly one timeout window.
const FAST = { timeoutMs: 20, retryMultiplier: 1 };

const swallow = (p) => p.then(() => null).catch((e) => e);

test("circuit opens after consecutive timeouts and then fails fast", async () => {
  resetNip07ChannelBreaker();

  for (let i = 0; i < CIRCUIT_TIMEOUT_THRESHOLD; i++) {
    await swallow(runNip07WithRetry(hangingOp, FAST));
  }
  assert.equal(
    getNip07ChannelBreakerState().open,
    true,
    "circuit should be open after the timeout threshold",
  );

  // First call after opening is the recovery PROBE (still runs -> times out).
  const probeErr = await swallow(runNip07WithRetry(hangingOp, FAST));
  assert.equal(
    probeErr.message,
    NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    "the probe should actually run (and time out here), not fast-fail",
  );

  // The next call within the probe interval must FAIL FAST.
  const start = Date.now();
  const fastErr = await swallow(runNip07WithRetry(hangingOp, FAST));
  const elapsed = Date.now() - start;
  assert.equal(
    fastErr.code,
    "nip07-channel-unresponsive",
    "calls while the circuit is open (outside the probe slot) must fast-fail",
  );
  assert.ok(
    elapsed < FAST.timeoutMs,
    `fast-fail must not wait for the timeout window (got ${elapsed}ms)`,
  );
});

test("a successful probe closes the circuit (recovery without refresh)", async () => {
  resetNip07ChannelBreaker();

  for (let i = 0; i < CIRCUIT_TIMEOUT_THRESHOLD; i++) {
    await swallow(runNip07WithRetry(hangingOp, FAST));
  }
  assert.equal(getNip07ChannelBreakerState().open, true, "precondition: open");

  // First post-open call is the probe; let it succeed -> channel recovered.
  const result = await runNip07WithRetry(successOp, FAST);
  assert.equal(result, "ok");
  const state = getNip07ChannelBreakerState();
  assert.equal(state.open, false, "a successful probe must close the circuit");
  assert.equal(
    state.consecutiveTimeouts,
    0,
    "the timeout streak must reset on success",
  );
});

test("extension errors (responsive failures) do not open the circuit", async () => {
  resetNip07ChannelBreaker();

  // Far more than the threshold, but the extension is RESPONDING (with errors),
  // so the channel is alive and the breaker must stay closed.
  for (let i = 0; i < CIRCUIT_TIMEOUT_THRESHOLD + 2; i++) {
    await swallow(runNip07WithRetry(respondingErrorOp, FAST));
  }
  const state = getNip07ChannelBreakerState();
  assert.equal(state.open, false, "responsive errors must not open the circuit");
  assert.equal(state.consecutiveTimeouts, 0, "no timeout streak should accrue");
});

test("interactive (bypass) calls are never fast-failed while open", async () => {
  resetNip07ChannelBreaker();

  for (let i = 0; i < CIRCUIT_TIMEOUT_THRESHOLD; i++) {
    await swallow(runNip07WithRetry(hangingOp, FAST));
  }
  // Consume the probe slot so a NON-bypass call would now fast-fail.
  await swallow(runNip07WithRetry(hangingOp, FAST));
  assert.equal(getNip07ChannelBreakerState().open, true, "precondition: open");

  // A bypass call (interactive permission prompt) must still RUN — it can't be
  // blocked by the breaker and can itself heal the channel.
  const err = await swallow(
    runNip07WithRetry(hangingOp, { ...FAST, bypassCircuitBreaker: true }),
  );
  assert.equal(
    err.message,
    NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    "bypass call should run to its timeout, not be fast-failed by the breaker",
  );
});
