// On login, after the feed-driving lists (blocks/subscriptions/hashtags) finish
// decrypting, the auth coordinator must warm the watch history in the background
// so the For You feed's suppression/affinity are ready without the user first
// opening the For You / History view. The preload must be strictly
// fire-and-forget: it can never block, await, or throw into the login path
// (re-introducing a blocking cold load would starve the single-threaded signer
// during the fragile post-login handshake — the original reason it was deferred).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { schedulePostLoginWatchHistoryPreload } from "../js/app/authSessionCoordinator.js";

const PK = "a".repeat(64);

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

test("warms watch history for the active pubkey with a stale-tolerant read", async () => {
  const calls = [];
  const watchHistoryService = {
    loadLatest: (actor, options) => {
      calls.push({ actor, options });
      return Promise.resolve([]);
    },
  };

  const scheduled = schedulePostLoginWatchHistoryPreload({
    watchHistoryService,
    activePubkey: PK,
    devLogger: { warn() {} },
  });

  assert.equal(scheduled, true, "a preload must be scheduled for a valid login");

  await flushMicrotasks();

  assert.equal(calls.length, 1, "loadLatest must be invoked exactly once");
  assert.equal(calls[0].actor, PK, "preload must target the logged-in pubkey");
  assert.deepEqual(
    calls[0].options,
    { allowStale: true },
    "preload must use allowStale so it never blocks on the cold fetch",
  );
});

test("does nothing when there is no active pubkey", async () => {
  let called = false;
  const watchHistoryService = {
    loadLatest: () => {
      called = true;
      return Promise.resolve([]);
    },
  };

  const scheduled = schedulePostLoginWatchHistoryPreload({
    watchHistoryService,
    activePubkey: "",
    devLogger: { warn() {} },
  });

  await flushMicrotasks();

  assert.equal(scheduled, false, "no pubkey means no scheduled preload");
  assert.equal(called, false, "loadLatest must not run without a pubkey");
});

test("tolerates a watch-history service without loadLatest", () => {
  const scheduled = schedulePostLoginWatchHistoryPreload({
    watchHistoryService: {},
    activePubkey: PK,
    devLogger: { warn() {} },
  });
  assert.equal(scheduled, false, "missing loadLatest must be a no-op, not a throw");
});

test("is fire-and-forget: a rejecting refresh never throws into the login path", async () => {
  let warned = false;
  const watchHistoryService = {
    // Simulate a dead signer / decrypt failure.
    loadLatest: () => Promise.reject(new Error("signer channel closed")),
  };

  // Must return synchronously (not await the refresh) and not throw.
  const scheduled = schedulePostLoginWatchHistoryPreload({
    watchHistoryService,
    activePubkey: PK,
    devLogger: {
      warn() {
        warned = true;
      },
    },
  });

  assert.equal(scheduled, true, "scheduling still succeeds even if the refresh later fails");

  // Give the rejected promise a chance to settle; the helper's .catch must
  // swallow it (a leaked rejection would crash the login flow / fail the test).
  await flushMicrotasks();

  assert.equal(warned, true, "a failed background refresh is logged, not propagated");
});

test("is non-blocking: a never-resolving refresh still returns immediately", () => {
  const watchHistoryService = {
    loadLatest: () => new Promise(() => {}), // never settles
  };

  const start = Date.now();
  const scheduled = schedulePostLoginWatchHistoryPreload({
    watchHistoryService,
    activePubkey: PK,
    devLogger: { warn() {} },
  });

  assert.equal(scheduled, true);
  assert.ok(
    Date.now() - start < 50,
    "the call must return without awaiting the background refresh",
  );
});
