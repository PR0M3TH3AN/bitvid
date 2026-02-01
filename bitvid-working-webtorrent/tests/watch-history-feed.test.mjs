// Run with: node tests/watch-history-feed.test.mjs

import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = noopStorage;
}

if (typeof window.localStorage === "undefined") {
  window.localStorage = globalThis.localStorage;
}

const { createFeedEngine, registerWatchHistoryFeed } = await import(
  "../js/feedEngine/index.js"
);

function createStubService(history = []) {
  let loadCount = 0;
  return {
    get loadCount() {
      return loadCount;
    },
    loadLatest: async () => {
      loadCount += 1;
      return history.map((entry) => ({ ...entry }));
    },
    setHistory(next) {
      history = Array.isArray(next) ? next : [];
    },
    shouldStoreMetadata: () => false,
    getLocalMetadata: () => null,
    setLocalMetadata: () => {},
    removeLocalMetadata: () => {},
  };
}

function createResolverFactory() {
  return () => ({
    resolveVideo: async () => null,
    resolveProfile: () => null,
  });
}

async function testOrderingByWatchedAt() {
  const service = createStubService([
    {
      pointer: { type: "e", value: "earlier" },
      watchedAt: 100,
    },
    {
      pointer: { type: "e", value: "latest" },
      watchedAt: 200,
    },
  ]);

  const engine = createFeedEngine();
  registerWatchHistoryFeed(engine, {
    service,
    nostr: { shouldIncludeVideo: () => true },
    metadataResolverFactory: createResolverFactory(),
  });

  const result = await engine.runFeed("watch-history", {
    runtime: { watchHistory: { actor: "npub-order" } },
  });

  assert.equal(result.items.length, 2, "feed should include two watch history entries");
  assert.equal(
    result.items[0].metadata.pointerKey,
    "e:latest",
    "newest watch event should be first in the feed",
  );
  assert.equal(
    result.items[1].metadata.pointerKey,
    "e:earlier",
    "older watch event should be last in the feed",
  );
  assert.ok(
    result.items[0].metadata.watchedAt >= result.items[1].metadata.watchedAt,
    "items should be sorted by watchedAt descending",
  );
}

async function testRemovalRefreshesSource() {
  const initialHistory = [
    { pointer: { type: "e", value: "keep" }, watchedAt: 300 },
    { pointer: { type: "e", value: "remove" }, watchedAt: 250 },
  ];
  const service = createStubService(initialHistory);
  const engine = createFeedEngine();
  registerWatchHistoryFeed(engine, {
    service,
    nostr: { shouldIncludeVideo: () => true },
    metadataResolverFactory: createResolverFactory(),
  });

  const firstRun = await engine.runFeed("watch-history", {
    runtime: { watchHistory: { actor: "npub-refresh" } },
  });
  assert.equal(firstRun.items.length, 2, "initial run should return full history");
  assert.equal(service.loadCount, 1, "loadLatest should be invoked for the initial run");

  service.setHistory([{ pointer: { type: "e", value: "keep" }, watchedAt: 300 }]);

  const secondRun = await engine.runFeed("watch-history", {
    runtime: { watchHistory: { actor: "npub-refresh" } },
  });

  assert.equal(service.loadCount, 2, "engine should request fresh history after change");
  assert.equal(secondRun.items.length, 1, "second run should reflect updated history");
  assert.equal(
    secondRun.items[0].metadata.pointerKey,
    "e:keep",
    "remaining pointer should persist after refresh",
  );
}

await testOrderingByWatchedAt();
await testRemovalRefreshesSource();

console.log("watch-history-feed.test.mjs completed successfully.");
