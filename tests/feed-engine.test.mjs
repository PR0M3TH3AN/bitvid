// Run with: node tests/feed-engine.test.mjs

import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (typeof globalThis.localStorage === "undefined") {
  const storage = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(String(key), String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };
}

if (typeof window.localStorage === "undefined") {
  window.localStorage = globalThis.localStorage;
}

const {
  createFeedEngine,
  createDedupeByRootStage,
  createBlacklistFilterStage,
  createWatchHistorySuppressionStage,
  createChronologicalSorter,
} = await import("../js/feedEngine/index.js");

async function testDedupeOrdering() {
  const engine = createFeedEngine();
  const feedName = "dedupe";

  const videoOld = { id: "a-old", videoRootId: "rootA", created_at: 100 };
  const videoNew = { id: "a-new", videoRootId: "rootA", created_at: 200 };
  const videoOther = { id: "b", created_at: 150 };

  engine.registerFeed(feedName, {
    source: async () => [
      { video: videoOld },
      { video: videoOther },
      { video: videoNew },
    ],
    stages: [createDedupeByRootStage()],
    sorter: createChronologicalSorter(),
  });

  const result = await engine.runFeed(feedName);
  assert.equal(result.videos.length, 2, "dedupe stage should drop older root entries");
  assert.deepEqual(
    result.videos.map((video) => video.id),
    ["a-new", "b"],
    "videos should be returned newest first",
  );

  const dedupeReasons = result.metadata.why.filter(
    (entry) => entry.reason === "older-root-version",
  );
  assert.equal(dedupeReasons.length, 1, "dedupe stage should log one older-root reason");
  assert.equal(dedupeReasons[0].videoId, "a-old");
  assert.equal(dedupeReasons[0].rootId, "rootA");
}

async function testBlacklistFiltering() {
  const engine = createFeedEngine();
  const feedName = "blacklist";

  engine.registerFeed(feedName, {
    source: async () => [
      { video: { id: "safe", pubkey: "npub1", created_at: 1 } },
      { video: { id: "blocked", pubkey: "npub2", created_at: 2 } },
      { video: { id: "blocked-author", pubkey: "blocked", created_at: 3 } },
    ],
    stages: [
      createBlacklistFilterStage({
        shouldIncludeVideo(video, { blacklistedEventIds, isAuthorBlocked }) {
          if (blacklistedEventIds.has(video.id)) {
            return false;
          }
          if (isAuthorBlocked(video.pubkey)) {
            return false;
          }
          return true;
        },
      }),
    ],
    sorter: createChronologicalSorter(),
  });

  const result = await engine.runFeed(feedName, {
    runtime: {
      blacklistedEventIds: new Set(["blocked"]),
      isAuthorBlocked: (pubkey) => pubkey === "blocked",
    },
  });

  assert.deepEqual(result.videos.map((video) => video.id), ["safe"]);

  const blacklistReasons = result.metadata.why.filter(
    (entry) => entry.reason === "blacklist",
  );
  assert.equal(
    blacklistReasons.length,
    2,
    "blacklist stage should log two exclusions (one per blocked item)",
  );
  const removedIds = new Set(blacklistReasons.map((entry) => entry.videoId));
  assert.ok(removedIds.has("blocked"));
  assert.ok(removedIds.has("blocked-author"));
}

async function testWatchHistoryHookIsolation() {
  const engine = createFeedEngine();

  engine.registerFeed("feed-a", {
    source: async () => [
      { video: { id: "x1", created_at: 10 }, pointer: { type: "e", value: "x1" } },
    ],
    stages: [createWatchHistorySuppressionStage()],
  });

  engine.registerFeed("feed-b", {
    source: async () => [
      { video: { id: "y1", created_at: 20 }, pointer: { type: "e", value: "y1" } },
    ],
    stages: [createWatchHistorySuppressionStage()],
  });

  let hookACount = 0;
  let hookBCount = 0;

  const resultA = await engine.runFeed("feed-a", {
    hooks: {
      watchHistory: {
        async shouldSuppress(item) {
          hookACount += 1;
          return item?.video?.id === "x1";
        },
      },
    },
  });

  const resultB = await engine.runFeed("feed-b", {
    hooks: {
      watchHistory: {
        async shouldSuppress(item) {
          hookBCount += 1;
          return false;
        },
      },
    },
  });

  assert.equal(hookACount, 1, "feed A hook should run once");
  assert.equal(hookBCount, 1, "feed B hook should run once");

  assert.equal(resultA.videos.length, 0, "feed A should suppress the single video");
  assert.equal(resultB.videos.length, 1, "feed B should keep its video");

  const whyA = resultA.metadata.why.find((entry) => entry.reason === "watch-history");
  assert.ok(whyA, "feed A should report watch-history suppression metadata");
  assert.equal(whyA.videoId, "x1");
}

async function testBlacklistOrderingWithRuntimeChanges() {
  const engine = createFeedEngine();
  const feedName = "runtime-order";

  engine.registerFeed(feedName, {
    source: async () => [
      { video: { id: "v1", created_at: 100 } },
      { video: { id: "v2", created_at: 200 } },
      { video: { id: "v3", created_at: 300 } },
    ],
    stages: [
      createBlacklistFilterStage({
        shouldIncludeVideo(video, { blacklistedEventIds }) {
          return !blacklistedEventIds.has(video.id);
        },
      }),
    ],
    sorter: createChronologicalSorter(),
  });

  const baseline = await engine.runFeed(feedName, {
    runtime: { blacklistedEventIds: new Set() },
  });
  assert.deepEqual(baseline.videos.map((video) => video.id), [
    "v3",
    "v2",
    "v1",
  ]);

  const withoutTop = await engine.runFeed(feedName, {
    runtime: { blacklistedEventIds: new Set(["v3"]) },
  });
  assert.deepEqual(withoutTop.videos.map((video) => video.id), ["v2", "v1"]);

  const withoutMiddle = await engine.runFeed(feedName, {
    runtime: { blacklistedEventIds: new Set(["v2"]) },
  });
  assert.deepEqual(withoutMiddle.videos.map((video) => video.id), [
    "v3",
    "v1",
  ]);
}

async function testTrustedMuteDownrank() {
  const sorter = createChronologicalSorter();

  const items = [
    {
      video: { id: "muted", created_at: 400 },
      metadata: { moderation: { trustedMuted: true } },
    },
    {
      video: { id: "fresh", created_at: 500 },
      metadata: { moderation: { trustedMuted: false } },
    },
    {
      video: { id: "older", created_at: 300 },
      metadata: {},
    },
  ];

  const sorted = sorter(items);
  assert.deepEqual(
    sorted.map((entry) => entry.video.id),
    ["fresh", "older", "muted"],
  );
}

await testDedupeOrdering();
await testBlacklistFiltering();
await testWatchHistoryHookIsolation();
await testBlacklistOrderingWithRuntimeChanges();
await testTrustedMuteDownrank();

console.log("All feed engine tests passed");
