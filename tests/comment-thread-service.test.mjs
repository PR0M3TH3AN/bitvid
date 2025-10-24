// Run with: node tests/comment-thread-service.test.mjs

import assert from "node:assert/strict";

import CommentThreadService from "../js/services/commentThreadService.js";

function createBaseVideo() {
  return {
    id: "video123",
    pubkey: "authorpk",
    kind: 30078,
    tags: [["d", "video-root"], ["alt", "ignored"]],
  };
}

function createComment({ id, pubkey, createdAt, parentId = null }) {
  const baseTags = [
    ["e", "video123"],
    ["a", "30078:authorpk:video-root"],
  ];
  const tags = parentId
    ? [...baseTags, ["e", parentId]]
    : [...baseTags];
  return {
    id,
    kind: 1,
    pubkey,
    created_at: createdAt,
    content: `${id} content`,
    tags,
  };
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

async function testThreadFlow() {
  const video = createBaseVideo();
  const initialEvents = [
    createComment({ id: "comment-1", pubkey: "pk1", createdAt: 100 }),
    createComment({ id: "comment-2", pubkey: "pk2", createdAt: 90 }),
    createComment({
      id: "reply-1",
      pubkey: "pk3",
      createdAt: 110,
      parentId: "comment-1",
    }),
  ];

  const profileCache = new Map();
  const batchCalls = [];
  const app = {
    getProfileCacheEntry: (pubkey) =>
      profileCache.has(pubkey) ? { profile: profileCache.get(pubkey) } : null,
    batchFetchProfiles: async (pubkeys) => {
      batchCalls.push([...pubkeys]);
      pubkeys.forEach((pubkey) => {
        profileCache.set(pubkey, {
          name: `Profile ${pubkey}`,
          picture: `https://example.com/${pubkey}.png`,
        });
      });
    },
  };

  let subscriptionHandler = null;
  const nostrClient = {
    fetchVideoComments: async () => initialEvents,
    subscribeVideoComments: (_target, options = {}) => {
      subscriptionHandler = typeof options.onEvent === "function"
        ? options.onEvent
        : null;
      return () => {
        subscriptionHandler = null;
      };
    },
  };

  const received = {
    initial: [],
    appended: [],
    errors: [],
  };

  const service = new CommentThreadService({
    nostrClient,
    app,
    hydrationDebounceMs: 0,
  });

  service.setCallbacks({
    onThreadReady: (payload) => received.initial.push(payload),
    onCommentsAppended: (payload) => received.appended.push(payload),
    onError: (error) => received.errors.push(error),
  });

  await service.loadThread({ video });
  await tick(10);
  await service.waitForProfileHydration();

  assert.equal(received.initial.length, 1, "initial callback should fire once");
  assert.equal(received.errors.length, 0, "no errors should be reported");
  assert.equal(batchCalls.length, 1, "profiles should be fetched once for unknown authors");
  assert.deepEqual(
    new Set(batchCalls[0]),
    new Set(["pk1", "pk2", "pk3"]),
    "hydration should request each unique pubkey",
  );

  const initialPayload = received.initial[0];
  assert.ok(initialPayload.childrenByParent instanceof Map);
  assert.deepEqual(
    initialPayload.topLevelIds,
    ["comment-2", "comment-1"],
    "top-level comments should be sorted by created_at",
  );
  assert.deepEqual(
    initialPayload.childrenByParent.get(null),
    ["comment-2", "comment-1"],
    "root mapping should expose top-level ids",
  );
  assert.deepEqual(
    initialPayload.childrenByParent.get("comment-1"),
    ["reply-1"],
    "parent mapping should include replies",
  );
  assert.ok(
    service.getProfile("pk3"),
    "profiles should be cached for retrieval",
  );
  assert.ok(subscriptionHandler, "subscription handler should be registered");

  const newReply = createComment({
    id: "reply-2",
    pubkey: "pk4",
    createdAt: 120,
    parentId: "comment-2",
  });

  subscriptionHandler(newReply);
  await tick(10);
  await service.waitForProfileHydration();
  for (let attempt = 0; attempt < 5 && batchCalls.length < 2; attempt += 1) {
    await tick(20);
  }
  assert.equal(
    batchCalls.length,
    2,
    "hydration should fetch new reply authors",
  );
  assert.equal(
    service.profileQueue.size,
    0,
    "profile queue should be cleared after hydration",
  );

  assert.equal(
    received.appended.length,
    1,
    "one append callback should fire for the new reply",
  );
  const appendPayload = received.appended[0];
  assert.equal(
    appendPayload.parentCommentId,
    "comment-2",
    "append payload should identify the parent comment",
  );
  assert.deepEqual(
    appendPayload.commentIds,
    ["reply-2"],
    "append payload should surface the new reply id",
  );
  assert.ok(
    service.getProfilesSnapshot().has("pk4"),
    "new reply author should be hydrated and cached",
  );

  // Duplicate events should be ignored.
  subscriptionHandler(newReply);
  await tick();
  assert.equal(
    received.appended.length,
    1,
    "duplicate events should not trigger additional append callbacks",
  );

  service.teardown();
}

async function testTeardownCancelsHydration() {
  const video = createBaseVideo();
  const delayedReply = createComment({
    id: "delayed-1",
    pubkey: "pk9",
    createdAt: 200,
  });

  let unsubscribed = false;
  let batchCallCount = 0;
  let subscriptionHandler = null;
  const app = {
    getProfileCacheEntry: () => null,
    batchFetchProfiles: async () => {
      batchCallCount += 1;
    },
  };

  const nostrClient = {
    fetchVideoComments: async () => [],
    subscribeVideoComments: (_target, options = {}) => {
      subscriptionHandler = typeof options.onEvent === "function"
        ? options.onEvent
        : null;
      return () => {
        unsubscribed = true;
      };
    },
  };

  const service = new CommentThreadService({
    nostrClient,
    app,
    hydrationDebounceMs: 50,
  });

  await service.loadThread({ video });
  assert.ok(subscriptionHandler, "subscription handler should be available");

  subscriptionHandler(delayedReply);
  service.teardown();
  await tick(80);

  assert.equal(batchCallCount, 0, "teardown should cancel pending hydration timers");
  assert.equal(unsubscribed, true, "teardown should unsubscribe from nostr feed");
}

await testThreadFlow();
await testTeardownCancelsHydration();

console.log("comment-thread-service tests passed");
