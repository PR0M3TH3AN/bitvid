import test from "node:test";
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

function createComment({
  id,
  pubkey,
  createdAt,
  parentId = null,
  extraTags = [],
}) {
  const tags = [["e", "video123"], ["a", "30078:authorpk:video-root"], ...extraTags];
  if (parentId) {
    tags.push(["e", parentId]);
  }
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

test(
  "CommentThreadService hydrates, subscribes, and dedupes incoming comment events",
  async (t) => {
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

    let fetchCalls = 0;
    let lastFetchTarget = null;
    let lastFetchOptions = null;
    const fetchVideoComments = async (target, options) => {
      fetchCalls += 1;
      lastFetchTarget = target;
      lastFetchOptions = options;
      return initialEvents;
    };

    let subscribeCalls = 0;
    let unsubscribeCalled = 0;
    let subscriptionHandler = null;
    let subscriptionOptions = null;
    let subscriptionTarget = null;
    const subscribeVideoComments = (target, options = {}) => {
      subscribeCalls += 1;
      subscriptionTarget = target;
      subscriptionOptions = options;
      subscriptionHandler = typeof options.onEvent === "function" ? options.onEvent : null;
      return () => {
        unsubscribeCalled += 1;
      };
    };

    const cachedProfiles = new Map([
      ["pk1", { name: "Cached profile" }],
    ]);
    const hydrationRequests = [];

    const service = new CommentThreadService({
      fetchVideoComments,
      subscribeVideoComments,
      getProfileCacheEntry: (pubkey) =>
        cachedProfiles.get(pubkey?.toLowerCase?.() || pubkey) || null,
      batchFetchProfiles: async (pubkeys) => {
        hydrationRequests.push([...pubkeys]);
        pubkeys.forEach((pubkey) => {
          cachedProfiles.set(pubkey.toLowerCase(), {
            name: `Profile ${pubkey}`,
          });
        });
      },
      hydrationDebounceMs: 0,
    });

    const initialPayloads = [];
    const appendedPayloads = [];
    const errorPayloads = [];

    service.setCallbacks({
      onThreadReady: (payload) => initialPayloads.push(payload),
      onCommentsAppended: (payload) => appendedPayloads.push(payload),
      onError: (error) => errorPayloads.push(error),
    });

    const snapshot = await service.loadThread({ video, relays: ["wss://relay.example"] });
    await service.waitForProfileHydration();

    assert.equal(fetchCalls, 1, "fetchVideoComments should be called once");
    assert.deepStrictEqual(lastFetchTarget, {
      videoEventId: "video123",
      videoDefinitionAddress: "30078:authorpk:video-root",
      videoKind: "30078",
      videoAuthorPubkey: "authorpk",
      parentCommentId: "",
    });
    assert.deepStrictEqual(lastFetchOptions, {
      limit: service.defaultLimit,
      relays: ["wss://relay.example"],
    });

    assert.equal(subscribeCalls, 1, "subscribeVideoComments should be invoked");
    assert.deepStrictEqual(subscriptionTarget, lastFetchTarget);
    assert.ok(subscriptionOptions?.onEvent, "subscription handler should be provided");

    assert.equal(errorPayloads.length, 0, "no errors should be emitted");
    assert.equal(initialPayloads.length, 1, "thread ready callback should fire once");

    const initialSnapshot = initialPayloads[0];
    assert.ok(initialSnapshot.childrenByParent instanceof Map);
    assert.equal(initialSnapshot.videoDefinitionAddress, "30078:authorpk:video-root");
    assert.equal(initialSnapshot.videoKind, "30078");
    assert.equal(initialSnapshot.videoAuthorPubkey, "authorpk");
    assert.equal(initialSnapshot.parentCommentKind, null);
    assert.equal(initialSnapshot.parentCommentPubkey, null);
    assert.deepStrictEqual(initialSnapshot.topLevelIds, [
      "comment-2",
      "comment-1",
    ]);
    assert.deepStrictEqual(
      initialSnapshot.childrenByParent.get(null),
      ["comment-2", "comment-1"],
      "root mapping should list top-level comments",
    );
    assert.deepStrictEqual(
      initialSnapshot.childrenByParent.get("comment-1"),
      ["reply-1"],
      "child mapping should include replies",
    );

    assert.ok(service.getProfile("pk1"), "cached profile should be readable");
    assert.ok(service.getProfile("pk2"), "hydrated profile should be cached");
    assert.ok(service.getProfile("pk3"), "reply author profile should be cached");
    assert.deepStrictEqual(
      hydrationRequests,
      [["pk2", "pk3"]],
      "profile hydration should fetch unknown authors once",
    );

    assert.equal(
      snapshot.childrenByParent.get(null).length,
      2,
      "loadThread should return populated snapshot",
    );

    const newReply = createComment({
      id: "reply-2",
      pubkey: "pk4",
      createdAt: 120,
      parentId: "comment-2",
    });

    subscriptionHandler?.(newReply);
    for (let attempt = 0; attempt < 5 && hydrationRequests.length < 2; attempt += 1) {
      await tick(10);
      await service.waitForProfileHydration();
    }

    assert.equal(appendedPayloads.length, 1, "new reply should trigger append callback");
    const appendPayload = appendedPayloads[0];
    assert.equal(appendPayload.parentCommentId, "comment-2");
    assert.deepStrictEqual(appendPayload.commentIds, ["reply-2"]);
    assert.ok(appendPayload.commentsById instanceof Map);
    assert.ok(
      appendPayload.commentsById.has("reply-2"),
      "appended payload should contain the new reply",
    );
    assert.equal(hydrationRequests.length, 2, "hydration should run for appended replies");
    assert.deepStrictEqual(hydrationRequests[1], ["pk4"]);
    const profilesSnapshot = service.getProfilesSnapshot();
    assert.equal(
      profilesSnapshot.has("pk4"),
      true,
      "profile snapshot should include the new reply author",
    );
    assert.ok(service.getProfile("pk4"), "new reply author should be hydrated");
    assert.equal(service.profileQueue.size, 0, "profile queue should be flushed");

    subscriptionHandler?.(newReply);
    await tick();
    assert.equal(
      appendedPayloads.length,
      1,
      "duplicate events should not trigger extra append callbacks",
    );

    service.teardown();
    assert.equal(unsubscribeCalled, 1, "teardown should unsubscribe from feed");
  },
);

test(
  "CommentThreadService loadThread falls back to event id when address is missing",
  async () => {
    const video = {
      ...createBaseVideo(),
      tags: [["alt", "ignored"]],
    };

    const fetchTargets = [];
    const fetchOptions = [];
    const subscribeTargets = [];
    const subscribeOptions = [];
    const errors = [];

    const service = new CommentThreadService({
      fetchVideoComments: async (target, options) => {
        fetchTargets.push(target);
        fetchOptions.push(options);
        return [];
      },
      subscribeVideoComments: (target, options = {}) => {
        subscribeTargets.push(target);
        subscribeOptions.push(options);
        return () => {};
      },
    });

    service.setCallbacks({
      onError: (error) => errors.push(error),
    });

    const snapshot = await service.loadThread({ video });

    assert.equal(fetchTargets.length, 1, "fetch should run even without an address");
    assert.deepStrictEqual(fetchTargets[0], {
      videoEventId: "video123",
      videoKind: "30078",
      videoAuthorPubkey: "authorpk",
      parentCommentId: "",
    });
    assert.equal(
      "videoDefinitionAddress" in fetchTargets[0],
      false,
      "videoDefinitionAddress should be omitted when unavailable",
    );

    assert.deepStrictEqual(fetchOptions[0], {
      limit: service.defaultLimit,
      relays: null,
    });

    assert.equal(
      subscribeTargets.length,
      1,
      "subscribe should run even without an address",
    );
    assert.deepStrictEqual(subscribeTargets[0], fetchTargets[0]);
    assert.equal(
      typeof subscribeOptions[0]?.onEvent,
      "function",
      "subscription handler should be provided",
    );

    assert.equal(errors.length, 0, "missing address should not emit errors");
    assert.equal(snapshot.videoEventId, "video123");
    assert.equal(snapshot.videoKind, "30078");
    assert.equal(snapshot.videoAuthorPubkey, "authorpk");
    assert.equal(snapshot.videoDefinitionAddress, null);
  },
);

test(
  "CommentThreadService teardown cancels hydration timers",
  async () => {
    const video = createBaseVideo();
    const delayedComment = createComment({ id: "pending-1", pubkey: "pk9", createdAt: 200 });

    let unsubscribeCalled = false;
    let hydrationCalls = 0;
    let subscriptionHandler = null;

    const service = new CommentThreadService({
      fetchVideoComments: async () => [],
      subscribeVideoComments: (_target, options = {}) => {
        subscriptionHandler = typeof options.onEvent === "function" ? options.onEvent : null;
        return () => {
          unsubscribeCalled = true;
        };
      },
      getProfileCacheEntry: () => null,
      batchFetchProfiles: async () => {
        hydrationCalls += 1;
      },
      hydrationDebounceMs: 50,
    });

    await service.loadThread({ video });
    assert.ok(subscriptionHandler, "subscription handler should be registered");

    subscriptionHandler(delayedComment);
    service.teardown();

    await tick(80);

    assert.equal(hydrationCalls, 0, "hydration timer should be cancelled on teardown");
    assert.equal(unsubscribeCalled, true, "teardown should invoke subscription cleanup");
  },
);
