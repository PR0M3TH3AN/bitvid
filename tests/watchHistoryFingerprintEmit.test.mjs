// Regression test for the infinite feed-refresh loop that pegged the CPU.
//
// Scenario (SCN-fingerprint-emit-on-change-only):
//   Given the For You feed re-runs whenever watch history emits "fingerprint",
//   When watch history is re-evaluated but its fingerprint is UNCHANGED,
//   Then no "fingerprint" event is emitted — so the feed does not refresh,
//     which would re-evaluate watch history, re-emit, and loop forever.
//   And when the fingerprint genuinely changes, exactly one event is emitted.
//
// The bug: getFingerprint/updateFingerprintCache emitted "fingerprint" on every
// evaluation regardless of change, so the feed's refresh -> reload -> emit chain
// never settled (a full feed rebuild ~2.5x/second).

import "./test-helpers/setup-localstorage.mjs";
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const { nostrClient } = await import("../js/nostrClientFacade.js");
const { watchHistoryService } = await import("../js/watchHistoryService.js");
const { WATCH_HISTORY_CACHE_TTL_MS } = await import("../js/config.js");

const ACTOR = "a".repeat(64);

test("emits 'fingerprint' only when it actually changes", async () => {
  const originalGet = nostrClient.getWatchHistoryFingerprint;
  const originalPubkey = nostrClient.pubkey;
  const originalSession = nostrClient.sessionActor;

  // Logged-in, non-session actor so the feature is enabled for ACTOR.
  nostrClient.pubkey = ACTOR;
  nostrClient.sessionActor = null;
  watchHistoryService.resetProgress(ACTOR); // start from a clean fingerprint cache

  let currentFingerprint = "fp-1";
  nostrClient.getWatchHistoryFingerprint = async () => currentFingerprint;

  let emitCount = 0;
  const unsubscribe = watchHistoryService.subscribe("fingerprint", () => {
    emitCount += 1;
  });

  // Fake the clock so we can expire the (24h) fingerprint cache between calls
  // and thus force a genuine re-evaluation each time (otherwise the fresh-cache
  // early-return would mask whether the change-guard works).
  mock.timers.enable({ apis: ["Date"] });
  try {
    // 1) First evaluation: undefined -> "fp-1" is a change => one emit.
    await watchHistoryService.getFingerprint(ACTOR);
    assert.equal(emitCount, 1, "first fingerprint should emit once");

    // 2) Re-evaluate with the SAME fingerprint after the cache expires.
    mock.timers.tick(WATCH_HISTORY_CACHE_TTL_MS + 1000);
    await watchHistoryService.getFingerprint(ACTOR);
    assert.equal(
      emitCount,
      1,
      "unchanged fingerprint must NOT emit (this is what broke the loop)",
    );

    // 3) Re-evaluate after a real change => exactly one more emit.
    mock.timers.tick(WATCH_HISTORY_CACHE_TTL_MS + 1000);
    currentFingerprint = "fp-2";
    await watchHistoryService.getFingerprint(ACTOR);
    assert.equal(emitCount, 2, "a changed fingerprint should emit once more");
  } finally {
    mock.timers.reset();
    unsubscribe();
    nostrClient.getWatchHistoryFingerprint = originalGet;
    nostrClient.pubkey = originalPubkey;
    nostrClient.sessionActor = originalSession;
    watchHistoryService.resetProgress(ACTOR);
  }
});
