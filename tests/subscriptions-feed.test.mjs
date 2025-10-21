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
  createSubscriptionAuthorsSource,
  createBlacklistFilterStage,
  createDedupeByRootStage,
  createChronologicalSorter,
} = await import("../js/feedEngine/index.js");

async function testBlockedCreatorsFiltered() {
  const engine = createFeedEngine();
  const feedName = "subscriptions-blocked";

  const videos = [
    { id: "keep", pubkey: "pub1", created_at: 100, videoRootId: "root-keep" },
    { id: "blocked-event", pubkey: "pub1", created_at: 200, videoRootId: "root-bad" },
    { id: "blocked-author-event", pubkey: "blocked", created_at: 150 },
    { id: "ignored-author", pubkey: "other", created_at: 250 },
  ];

  const calls = [];
  const service = {
    async getActiveVideosByAuthors(authors, options) {
      calls.push({ authors, options });
      return videos;
    },
    async getFilteredActiveVideos() {
      throw new Error("fallback lookup should not run when authors exist");
    },
  };

  engine.registerFeed(feedName, {
    source: createSubscriptionAuthorsSource({ service }),
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
      createDedupeByRootStage(),
    ],
    sorter: createChronologicalSorter(),
  });

  const result = await engine.runFeed(feedName, {
    runtime: {
      subscriptionAuthors: ["pub1", "blocked"],
      authors: ["pub1", "blocked"],
      blacklistedEventIds: new Set(["blocked-event"]),
      isAuthorBlocked: (pubkey) => pubkey === "blocked",
    },
  });

  assert.equal(
    calls.length,
    1,
    "subscription source should request a targeted author lookup"
  );
  assert.deepEqual(
    new Set(calls[0].authors),
    new Set(["pub1", "blocked"]),
    "targeted lookup should receive the subscribed authors"
  );

  assert.deepEqual(
    result.videos.map((video) => video.id),
    ["keep"],
    "subscriptions feed should drop blocked authors and events"
  );

  const reasons = result.metadata?.why || [];
  const blacklistReasons = reasons.filter((entry) => entry.reason === "blacklist");
  assert.equal(
    blacklistReasons.length,
    2,
    "blocked entries should be logged in metadata"
  );
}

async function testDuplicateRootsFiltered() {
  const engine = createFeedEngine();
  const feedName = "subscriptions-dedupe";

  const videos = [
    { id: "older", pubkey: "pub1", created_at: 100, videoRootId: "root-a" },
    { id: "newer", pubkey: "pub1", created_at: 200, videoRootId: "root-a" },
    { id: "other", pubkey: "pub1", created_at: 150, videoRootId: "root-b" },
  ];

  const calls = [];
  const service = {
    async getActiveVideosByAuthors(authors) {
      calls.push({ authors });
      return videos;
    },
    async getFilteredActiveVideos() {
      throw new Error("should not reach filtered active fallback");
    },
  };

  engine.registerFeed(feedName, {
    source: createSubscriptionAuthorsSource({ service }),
    stages: [
      createBlacklistFilterStage({ shouldIncludeVideo: () => true }),
      createDedupeByRootStage(),
    ],
    sorter: createChronologicalSorter(),
  });

  const result = await engine.runFeed(feedName, {
    runtime: {
      subscriptionAuthors: ["pub1"],
      authors: ["pub1"],
      blacklistedEventIds: new Set(),
      isAuthorBlocked: () => false,
    },
  });

  assert.equal(
    calls.length,
    1,
    "dedupe scenario should use the targeted author lookup"
  );

  assert.deepEqual(
    result.videos.map((video) => video.id),
    ["newer", "other"],
    "dedupe stage should keep only the newest root version"
  );

  const dedupeReasons = result.metadata?.why?.filter(
    (entry) => entry.reason === "older-root-version"
  ) || [];
  assert.equal(dedupeReasons.length, 1, "older version should be recorded");
  assert.equal(dedupeReasons[0].videoId, "older");
}

async function testNoAuthorsSkipsLookup() {
  const engine = createFeedEngine();
  const feedName = "subscriptions-empty";

  const service = {
    async getActiveVideosByAuthors() {
      throw new Error("should not request targeted lookup when authors missing");
    },
    async getFilteredActiveVideos() {
      throw new Error("should not fetch active videos when authors missing");
    },
  };

  engine.registerFeed(feedName, {
    source: createSubscriptionAuthorsSource({ service }),
    stages: [createBlacklistFilterStage({ shouldIncludeVideo: () => true })],
    sorter: createChronologicalSorter(),
  });

  const result = await engine.runFeed(feedName, {
    runtime: {
      subscriptionAuthors: [],
      authors: [],
      blacklistedEventIds: new Set(),
      isAuthorBlocked: () => false,
    },
  });

  assert.deepEqual(result.videos, [], "no authors should yield an empty feed");
}

async function testLimitApplied() {
  const engine = createFeedEngine();
  const feedName = "subscriptions-limit";

  const videos = [
    { id: "video-1", pubkey: "pub1", created_at: 100 },
    { id: "video-2", pubkey: "pub1", created_at: 200 },
    { id: "video-3", pubkey: "pub1", created_at: 300 },
    { id: "video-4", pubkey: "pub1", created_at: 400 },
    { id: "video-5", pubkey: "pub1", created_at: 500 },
  ];

  const calls = [];
  const service = {
    async getActiveVideosByAuthors(authors, options) {
      calls.push({ authors, options });
      return videos;
    },
    async getFilteredActiveVideos() {
      throw new Error("limit run should not use fallback lookup");
    },
  };

  engine.registerFeed(feedName, {
    source: createSubscriptionAuthorsSource({ service }),
    stages: [
      createBlacklistFilterStage({ shouldIncludeVideo: () => true }),
      createDedupeByRootStage(),
    ],
    sorter: createChronologicalSorter(),
  });

  const result = await engine.runFeed(feedName, {
    runtime: {
      subscriptionAuthors: ["pub1"],
      authors: ["pub1"],
      blacklistedEventIds: new Set(),
      isAuthorBlocked: () => false,
      limit: 3,
    },
  });

  assert.equal(calls.length, 1, "limit run should request targeted lookup once");
  assert.equal(
    calls[0]?.options?.limit,
    3,
    "limit option should be forwarded to the service lookup",
  );

  assert.deepEqual(
    result.videos.map((video) => video.id),
    ["video-5", "video-4", "video-3"],
    "feed should only include the newest videos within the limit",
  );
}

await testBlockedCreatorsFiltered();
await testDuplicateRootsFiltered();
await testNoAuthorsSkipsLookup();
await testLimitApplied();

console.log("subscriptions-feed tests passed");
