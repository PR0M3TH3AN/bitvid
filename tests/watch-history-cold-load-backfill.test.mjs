// Scenario test for bounded watch-history loading (slice B part 2).
//
// SCN-watch-history-cold-load-fast-then-backfill:
//   Given a COLD watch-history load (nothing cached to show yet) whose first,
//     chunk-capped decrypt pass leaves older chunks undecrypted,
//   When the history is loaded,
//   Then the first resolve pass is bounded (a finite chunkDecryptLimit) so the
//     UI can render recent history immediately,
//   And a SINGLE background pass with NO chunk cap then backfills the deferred
//     older chunks and emits "fingerprint" with the complete history.
//
// This is what keeps a deep history under a NIP-46 remote signer from freezing
// the first render (and flooding the relay rate limit) while still surfacing
// the full history without the user having to do anything.

import "./test-helpers/setup-localstorage.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { nostrClient } = await import("../js/nostrClientFacade.js");
const { watchHistoryService } = await import("../js/watchHistoryService.js");

const ACTOR = "b".repeat(64);

test("cold load decrypts newest chunks first, then backfills deferred chunks in the background", async () => {
  const original = {
    pubkey: nostrClient.pubkey,
    sessionActor: nostrClient.sessionActor,
    resolveWatchHistory: nostrClient.resolveWatchHistory,
    getWatchHistoryDeferredChunkCount:
      nostrClient.getWatchHistoryDeferredChunkCount,
    getWatchHistoryFingerprint: nostrClient.getWatchHistoryFingerprint,
  };

  // Logged-in, non-session actor so the feature is enabled for ACTOR.
  nostrClient.pubkey = ACTOR;
  nostrClient.sessionActor = null;
  watchHistoryService.resetProgress(ACTOR);

  const recentItems = [{ pointer: { type: "e", value: "recent" }, watchedAt: 200 }];
  const fullItems = [
    { pointer: { type: "e", value: "recent" }, watchedAt: 200 },
    { pointer: { type: "e", value: "older" }, watchedAt: 100 },
  ];

  const chunkLimitArgs = [];
  let deferred = 0;

  nostrClient.resolveWatchHistory = async (_actor, opts = {}) => {
    chunkLimitArgs.push(opts.chunkDecryptLimit);
    if (chunkLimitArgs.length === 1) {
      // First (bounded) pass: leave one older chunk undecrypted.
      deferred = 1;
      return recentItems;
    }
    // Background backfill pass: full history, nothing left deferred.
    deferred = 0;
    return fullItems;
  };
  nostrClient.getWatchHistoryDeferredChunkCount = () => deferred;
  // Fingerprint derived from the item set so recent vs full differ (the change
  // is what drives the "fingerprint" emit the history view re-renders on).
  nostrClient.getWatchHistoryFingerprint = async (_actor, items) =>
    `fp-${Array.isArray(items) ? items.length : 0}`;

  const emittedItemCounts = [];
  let resolveSecondEmit;
  const gotSecondEmit = new Promise((resolve) => {
    resolveSecondEmit = resolve;
  });
  const unsubscribe = watchHistoryService.subscribe("fingerprint", (payload) => {
    emittedItemCounts.push(
      Array.isArray(payload?.items) ? payload.items.length : 0,
    );
    if (emittedItemCounts.length === 2) {
      resolveSecondEmit();
    }
  });

  try {
    const firstPassItems = await watchHistoryService.loadLatest(ACTOR, {
      forceRefresh: true,
    });

    // The blocking load returns only the recent (fast) items.
    assert.deepStrictEqual(
      firstPassItems.map((item) => item.pointer.value),
      ["recent"],
      "the initial (non-blocking) render should show only recent history",
    );

    // The first pass is bounded (a finite, positive chunk limit) regardless of
    // how quickly the background backfill follows.
    assert.equal(
      typeof chunkLimitArgs[0],
      "number",
      "the first pass must pass a finite chunkDecryptLimit (bounded)",
    );
    assert.ok(
      chunkLimitArgs[0] > 0,
      "the first pass chunk limit must be a positive bound",
    );

    // Background backfill runs without us asking — wait for its emit.
    await gotSecondEmit;

    assert.equal(chunkLimitArgs.length, 2, "a background backfill pass should run");
    assert.equal(
      chunkLimitArgs[1],
      undefined,
      "the backfill pass must be UNbounded (full history)",
    );
    assert.equal(deferred, 0, "no chunks should remain deferred after backfill");
    assert.deepStrictEqual(
      emittedItemCounts,
      [1, 2],
      "should emit recent-only first, then the full history after backfill",
    );
  } finally {
    unsubscribe();
    nostrClient.pubkey = original.pubkey;
    nostrClient.sessionActor = original.sessionActor;
    nostrClient.resolveWatchHistory = original.resolveWatchHistory;
    nostrClient.getWatchHistoryDeferredChunkCount =
      original.getWatchHistoryDeferredChunkCount;
    nostrClient.getWatchHistoryFingerprint = original.getWatchHistoryFingerprint;
    watchHistoryService.resetProgress(ACTOR);
  }
});

test("warm refresh (items already cached) is NOT bounded, to avoid a shrink-then-grow flicker", async () => {
  const original = {
    pubkey: nostrClient.pubkey,
    sessionActor: nostrClient.sessionActor,
    resolveWatchHistory: nostrClient.resolveWatchHistory,
    getWatchHistoryDeferredChunkCount:
      nostrClient.getWatchHistoryDeferredChunkCount,
    getWatchHistoryFingerprint: nostrClient.getWatchHistoryFingerprint,
  };

  const WARM_ACTOR = "c".repeat(64);
  nostrClient.pubkey = WARM_ACTOR;
  nostrClient.sessionActor = null;
  watchHistoryService.resetProgress(WARM_ACTOR);

  const recentItems = [{ pointer: { type: "e", value: "recent" }, watchedAt: 200 }];
  const fullItems = [
    { pointer: { type: "e", value: "recent" }, watchedAt: 200 },
    { pointer: { type: "e", value: "older" }, watchedAt: 100 },
  ];

  const chunkLimitArgs = [];
  let deferred = 0;
  nostrClient.resolveWatchHistory = async (_actor, opts = {}) => {
    chunkLimitArgs.push(opts.chunkDecryptLimit);
    if (chunkLimitArgs.length === 1) {
      deferred = 1;
      return recentItems;
    }
    deferred = 0;
    return fullItems;
  };
  nostrClient.getWatchHistoryDeferredChunkCount = () => deferred;
  let fpCounter = 0;
  // Force a fingerprint change every call so each refresh genuinely re-resolves.
  nostrClient.getWatchHistoryFingerprint = async () => `fp-${(fpCounter += 1)}`;

  try {
    // Cold load primes the cache (bounded first pass).
    await watchHistoryService.loadLatest(WARM_ACTOR, { forceRefresh: true });
    // Let any background backfill settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const passesAfterCold = chunkLimitArgs.length;
    assert.ok(passesAfterCold >= 1, "cold load should resolve at least once");
    assert.equal(
      chunkLimitArgs[0],
      3,
      "cold load first pass is bounded to the initial chunk limit",
    );

    // Warm refresh: items are now cached, so this must be UNbounded.
    chunkLimitArgs.length = 0;
    await watchHistoryService.loadLatest(WARM_ACTOR, { forceRefresh: true });
    assert.ok(chunkLimitArgs.length >= 1, "warm refresh should resolve");
    assert.equal(
      chunkLimitArgs[0],
      undefined,
      "warm refresh must be unbounded (no transient history shrink)",
    );
  } finally {
    nostrClient.pubkey = original.pubkey;
    nostrClient.sessionActor = original.sessionActor;
    nostrClient.resolveWatchHistory = original.resolveWatchHistory;
    nostrClient.getWatchHistoryDeferredChunkCount =
      original.getWatchHistoryDeferredChunkCount;
    nostrClient.getWatchHistoryFingerprint = original.getWatchHistoryFingerprint;
    watchHistoryService.resetProgress(WARM_ACTOR);
  }
});
