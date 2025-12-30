import test from "node:test";
import assert from "node:assert/strict";

import CommentThreadService from "../js/services/commentThreadService.js";
import {
  COMMENT_EVENT_KIND,
  listVideoComments,
} from "../js/nostr/commentEvents.js";
import {
  FEATURE_IMPROVED_COMMENT_FETCHING,
  setImprovedCommentFetchingEnabled,
} from "../js/constants.js";
import { buildCommentEvent } from "../js/nostrEventSchemas.js";

function createBaseVideo() {
  return {
    id: "video123",
    pubkey: "authorpk",
    kind: 30078,
    tags: [["d", "video-root"], ["alt", "ignored"]],
    videoRootId: "video-root",
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

const originalLocalStorage = globalThis.localStorage;
const originalWindowLocalStorage = globalThis.window?.localStorage;

function createIsolatedLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}

test.beforeEach(() => {
  const stub = createIsolatedLocalStorage();
  globalThis.localStorage = stub;
  if (globalThis.window) {
    globalThis.window.localStorage = stub;
  }
});

test.after(() => {
  if (originalLocalStorage) {
    globalThis.localStorage = originalLocalStorage;
  } else {
    delete globalThis.localStorage;
  }
  if (globalThis.window) {
    if (originalWindowLocalStorage) {
      globalThis.window.localStorage = originalWindowLocalStorage;
    } else {
      delete globalThis.window.localStorage;
    }
  }
});

test("CommentThreadService caches mixed-case video ids consistently", () => {
  const videoEventId = "VideoMixed123";
  const service = new CommentThreadService();

  const comments = [
    {
      id: "comment-1",
      pubkey: "authorpk",
      content: "Cached comment",
      created_at: 1700000000,
      tags: [],
    },
  ];

  service.cacheComments(videoEventId, comments);

  const cachedKeys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    cachedKeys.push(localStorage.key(index));
  }

  assert.deepEqual(
    cachedKeys,
    ["bitvid:comments:videomixed123"],
    "cache key should normalize mixed-case ids",
  );

  const cached = service.getCachedComments(videoEventId.toLowerCase());
  assert.deepEqual(
    cached,
    comments,
    "mixed-case ids should retrieve cached entries",
  );
});

test("CommentThreadService surfaces cache read failures", () => {
  const warnings = [];
  const service = new CommentThreadService({
    logger: {
      warn: (...args) => warnings.push({ channel: "root", args }),
      dev: { warn: (...args) => warnings.push({ channel: "dev", args }) },
      user: { warn: (...args) => warnings.push({ channel: "user", args }) },
    },
  });

  globalThis.localStorage.getItem = () => {
    throw new Error("quota exceeded");
  };

  const cached = service.getCachedComments("video123");

  assert.equal(cached, null, "cache read errors should fall back to null");
  assert.equal(
    service.getSnapshot().commentCacheDiagnostics.storageUnavailable,
    true,
    "comment cache diagnostics should flag storage errors",
  );
  assert.equal(
    warnings.some((entry) => entry.channel === "user"),
    true,
    "user warnings should be emitted when cache reads fail",
  );
});

test("CommentThreadService surfaces cache write failures", () => {
  const warnings = [];
  const service = new CommentThreadService({
    logger: {
      warn: (...args) => warnings.push({ channel: "root", args }),
      dev: { warn: (...args) => warnings.push({ channel: "dev", args }) },
      user: { warn: (...args) => warnings.push({ channel: "user", args }) },
    },
  });

  globalThis.localStorage.setItem = () => {
    throw new Error("private mode");
  };

  service.cacheComments("video123", []);

  assert.equal(
    service.getSnapshot().commentCacheDiagnostics.storageUnavailable,
    true,
    "comment cache diagnostics should flag write failures",
  );
  assert.equal(
    warnings.some((entry) => entry.channel === "user"),
    true,
    "user warnings should be emitted when cache writes fail",
  );
});

test("CommentThreadService logs cache usage and fallback decisions", async () => {
  const initialFlag = FEATURE_IMPROVED_COMMENT_FETCHING;
  const devLogs = [];
  const fetchCalls = [];
  const logger = {
    warn: () => {},
    dev: {
      log: () => {},
      info: (...args) => devLogs.push(args.join(" ")),
      debug: () => {},
      warn: (...args) => devLogs.push(args.join(" ")),
      error: () => {},
    },
    user: { warn: () => {} },
  };

  const fetchVideoComments = async (...args) => {
    fetchCalls.push(args);
    return [
      {
        id: "remote-1",
        pubkey: "remote",
        content: "Fresh comment",
        created_at: 2,
        tags: [],
      },
    ];
  };

  const service = new CommentThreadService({
    fetchVideoComments,
    logger,
  });

  try {
    setImprovedCommentFetchingEnabled(true);
    const cachedComments = [
      {
        id: "cached-1",
        pubkey: "cached",
        content: "Cached comment",
        created_at: 1,
        tags: [],
      },
    ];

    service.cacheComments("video123", cachedComments);
    devLogs.length = 0;
    fetchCalls.length = 0;

    const cachedResult = await service.fetchThread({ videoEventId: "video123" });

    assert.deepEqual(
      cachedResult,
      cachedComments,
      "feature flag on should return cached comments",
    );
    assert.equal(
      fetchCalls.length,
      0,
      "cache hits should avoid fallback fetch",
    );
    assert.equal(
      devLogs.some((entry) =>
        entry.includes("Loaded 1 cached comments for video123"),
      ),
      true,
      "dev logs should note cache usage when enabled",
    );

    setImprovedCommentFetchingEnabled(false);
    devLogs.length = 0;
    fetchCalls.length = 0;

    const fallbackResult = await service.fetchThread({
      videoEventId: "video123",
    });

    assert.equal(
      fetchCalls.length,
      1,
      "feature flag off should invoke fallback fetch",
    );
    assert.equal(
      devLogs.some((entry) =>
        entry.includes("Improved fetching fallback: feature disabled"),
      ),
      true,
      "dev logs should note fallback when feature is disabled",
    );
    assert.deepEqual(
      fallbackResult.map((comment) => comment.id),
      ["remote-1"],
      "fallback path should return freshly fetched comments",
    );
  } finally {
    setImprovedCommentFetchingEnabled(initialFlag);
  }
});

test("CommentThreadService normalizes mixed-case event ids in thread state", async () => {
  const video = { ...createBaseVideo(), id: "VideoMixed123" };
  const topLevelId = "CoMmEnT-Root";
  const replyId = "RePlY-Child";

  const topLevelEvent = {
    id: topLevelId,
    kind: 1,
    pubkey: "commenterpk",
    created_at: 1700000000,
    content: "Top level",
    tags: [
      ["e", video.id],
      ["a", "30078:authorpk:video-root"],
    ],
  };

  const replyEvent = {
    id: replyId,
    kind: 1,
    pubkey: "replypk",
    created_at: 1700000100,
    content: "Reply",
    tags: [
      ["e", video.id.toUpperCase()],
      ["a", "30078:authorpk:video-root"],
      ["e", topLevelId.toUpperCase()],
    ],
  };

  const fetchVideoComments = async () => [topLevelEvent];
  let triggerAppend = null;
  const subscribeVideoComments = (target, options) => {
    triggerAppend = options?.onEvent;
    return () => {};
  };

  const service = new CommentThreadService({
    fetchVideoComments,
    subscribeVideoComments,
  });

  let threadReadyPayload = null;
  let appendPayload = null;
  service.setCallbacks({
    onThreadReady: (payload) => {
      threadReadyPayload = payload;
    },
    onCommentsAppended: (payload) => {
      appendPayload = payload;
    },
  });

  await service.loadThread({ video });

  assert.equal(
    threadReadyPayload.videoEventId,
    video.id.toLowerCase(),
    "video ids should normalize to lowercase in the thread payload",
  );
  assert.deepEqual(
    threadReadyPayload.topLevelIds,
    [topLevelId.toLowerCase()],
    "top-level ids should be normalized",
  );
  assert.equal(
    threadReadyPayload.childrenByParent.get(null)[0],
    topLevelId.toLowerCase(),
    "root children should reference normalized ids",
  );
  assert.equal(
    threadReadyPayload.commentsById.has(topLevelId.toLowerCase()),
    true,
    "comment map should key by normalized ids",
  );
  assert.ok(
    service.getCommentEvent(topLevelId.toUpperCase()),
    "comment lookups should be case-insensitive",
  );

  assert.equal(typeof triggerAppend, "function", "subscription should be active");
  triggerAppend(replyEvent);

  assert.deepEqual(
    appendPayload.commentIds,
    [replyId.toLowerCase()],
    "append payload should emit normalized comment ids",
  );
  assert.equal(
    appendPayload.parentCommentId,
    topLevelId.toLowerCase(),
    "append payload should carry normalized parent ids",
  );
  assert.deepEqual(
    appendPayload.childrenByParent.get(topLevelId.toLowerCase()),
    [replyId.toLowerCase()],
    "children map should store normalized ids for replies",
  );
});

test("CommentThreadService normalizes mixed-case pubkeys during hydration", async () => {
  const video = createBaseVideo();
  const mixedPubkey = "PuBkEy-Upper";

  const fetchVideoComments = async () => [
    createComment({ id: "c-hydrate", pubkey: mixedPubkey, createdAt: 1700000200 }),
  ];

  const hydrationRequests = [];
  const service = new CommentThreadService({
    nostrClient: { ensurePool: async () => {} },
    fetchVideoComments,
    subscribeVideoComments: () => () => {},
    batchFetchProfiles: async (pubkeys) => {
      hydrationRequests.push([...pubkeys]);
      return [];
    },
    hydrationDebounceMs: 0,
  });

  await service.loadThread({ video });

  assert.deepEqual(
    hydrationRequests,
    [[mixedPubkey.toLowerCase()]],
    "hydration should request normalized pubkeys",
  );
});

test("CommentThreadService retries profile hydration before succeeding", async () => {
  const profiles = new Map();
  const hydrationCalls = [];
  let attempts = 0;

  const service = new CommentThreadService({
    getProfileCacheEntry: (pubkey) => profiles.get(pubkey),
    batchFetchProfiles: async (pubkeys) => {
      hydrationCalls.push([...pubkeys]);
      attempts += 1;
      if (attempts === 1) {
        throw new Error("temporary hydration failure");
      }
      pubkeys.forEach((pubkey) =>
        profiles.set(pubkey, { name: `Profile ${pubkey}` }),
      );
    },
    hydrationDebounceMs: 0,
  });

  service.queueProfileForHydration("pk-retry-1");
  service.queueProfileForHydration("pk-retry-2");

  for (let attempt = 0; attempt < 5 && !service.profileHydrationPromise; attempt += 1) {
    await tick(10);
  }
  await service.waitForProfileHydration();

  assert.equal(attempts, 2, "hydration should retry failed batches once");
  assert.deepEqual(
    hydrationCalls,
    [
      ["pk-retry-1", "pk-retry-2"],
      ["pk-retry-1", "pk-retry-2"],
    ],
    "hydration should reuse the same batch across retries",
  );
  assert.ok(service.getProfile("pk-retry-1"));
  assert.ok(service.getProfile("pk-retry-2"));
});

test(
  "CommentThreadService surfaces profile hydration failures after retries",
  async () => {
    const errors = [];
    const userWarnings = [];
    const devWarnings = [];
    let attempts = 0;

    const service = new CommentThreadService({
      batchFetchProfiles: async (pubkeys) => {
        attempts += 1;
        throw new Error(`hydration failed attempt ${attempts}`);
      },
      logger: {
        warn: (...args) => userWarnings.push(args),
        dev: { warn: (...args) => devWarnings.push(args) },
        user: { warn: (...args) => userWarnings.push(args) },
      },
      hydrationDebounceMs: 0,
    });

    service.setCallbacks({ onError: (error) => errors.push(error) });
    service.queueProfileForHydration("pk-retry-fail");

    await tick(200);
    await service.waitForProfileHydration();

    assert.equal(attempts, 3, "hydration should respect the retry limit");
    assert.equal(errors.length, 1, "final failures should emit an error");
    assert.ok(
      userWarnings.some(([message]) =>
        typeof message === "string" && message.includes("pk-retry-fail"),
      ),
      "user-visible warnings should include the failed pubkeys",
    );
    assert.ok(
      devWarnings.some(([message]) =>
        typeof message === "string" && message.includes("attempt 1/3")
      ),
      "dev warnings should log the retry attempts",
    );
  },
);

test(
  "listVideoComments accepts builder events without parent ids and filters replies",
  async () => {
    const relayUrl = "wss://relay.example";
    const videoEventId = "video123";
    const videoDefinitionAddress = "30078:authorpk:video-root";
    const topLevelCommentId = "comment-root";
    const replyCommentId = "comment-reply";

    const topLevelEvent = {
      id: topLevelCommentId,
      ...buildCommentEvent({
        pubkey: "commenterpk",
        created_at: 1700000000,
        videoEventId,
        videoEventRelay: relayUrl,
        videoDefinitionAddress,
        videoDefinitionRelay: relayUrl,
        rootIdentifier: "video-root",
        rootIdentifierRelay: relayUrl,
        rootKind: "30078",
        rootAuthorPubkey: "authorpk",
      }),
    };

    assert.ok(
      topLevelEvent.tags.some(
        (tag) =>
          Array.isArray(tag) &&
          tag[0] === "e" &&
          tag[1] === videoEventId &&
          tag[2] === relayUrl,
      ),
      "builder should retain legacy #e tag for the root event when address pointer is present",
    );
    assert.ok(
      topLevelEvent.tags.some(
        (tag) =>
          Array.isArray(tag) && tag[0] === "a" && tag[1] === videoDefinitionAddress,
      ),
      "builder should include #a pointer for the scoped video definition",
    );

    const replyEvent = {
      id: replyCommentId,
      ...buildCommentEvent({
        pubkey: "replypk",
        created_at: 1700000300,
        videoEventId,
        videoEventRelay: relayUrl,
        videoDefinitionAddress,
        videoDefinitionRelay: relayUrl,
        rootIdentifier: "video-root",
        rootIdentifierRelay: relayUrl,
        rootKind: "30078",
        rootAuthorPubkey: "authorpk",
        parentCommentId: topLevelCommentId,
        parentCommentRelay: relayUrl,
        parentAuthorPubkey: "commenterpk",
      }),
    };

    assert.ok(
      replyEvent.tags.some(
        (tag) =>
          Array.isArray(tag) &&
          tag[0] === "e" &&
          tag[1] === videoEventId &&
          tag[2] === relayUrl,
      ),
      "reply builder should include root #e tag alongside #a pointer",
    );
    assert.ok(
      replyEvent.tags.some(
        (tag) =>
          Array.isArray(tag) && tag[0] === "a" && tag[1] === videoDefinitionAddress,
      ),
      "reply builder should preserve #a pointer",
    );

    const listCalls = [];
    const client = {
      relays: [relayUrl],
      pool: {
        list: async (relays, filters) => {
          listCalls.push({ relays, filters });
          return [[topLevelEvent, replyEvent]];
        },
      },
    };

    const baseTarget = {
      videoEventId,
      videoDefinitionAddress,
      videoEventRelay: relayUrl,
      videoDefinitionRelay: relayUrl,
      rootIdentifier: "video-root",
    };

    const topLevelResults = await listVideoComments(client, baseTarget, {
      relays: [relayUrl],
    });
    assert.equal(
      topLevelResults.some((event) => event.id === topLevelCommentId),
      true,
      "top-level builder comment should be returned when no parent is specified",
    );

    const replyResults = await listVideoComments(
      client,
      { ...baseTarget, parentCommentId: topLevelCommentId },
      { relays: [relayUrl] },
    );
    assert.deepStrictEqual(
      replyResults.map((event) => event.id),
      [replyCommentId],
      "reply queries should filter to child events when parent id is provided",
    );

    assert.equal(listCalls.length, 2, "pool.list should be invoked for each query");
  },
);

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
      nostrClient: { ensurePool: async () => {} },
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
      rootIdentifier: "video-root",
      parentCommentId: "",
    });
    assert.equal(lastFetchOptions.limit, service.defaultLimit);
    assert.deepStrictEqual(lastFetchOptions.relays, ["wss://relay.example"]);
    assert.equal(lastFetchOptions.since, 0);

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
    assert.equal(initialSnapshot.rootIdentifier, "video-root");
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
    assert.equal(appendPayload.rootIdentifier, "video-root");
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
      nostrClient: { ensurePool: async () => {} },
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
      rootIdentifier: "video-root",
      parentCommentId: "",
    });
    assert.equal(
      "videoDefinitionAddress" in fetchTargets[0],
      false,
      "videoDefinitionAddress should be omitted when unavailable",
    );

    const [firstFetchOptions] = fetchOptions;
    assert.equal(firstFetchOptions.limit, service.defaultLimit);
    assert.equal(firstFetchOptions.relays, null);
    assert.equal(firstFetchOptions.since, 0);

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
  "CommentThreadService requests and snapshots comments by root identifier",
  async () => {
    const video = {
      id: "root-only-video",
      pubkey: "rootpk",
      kind: 30078,
      videoRootId: "root-only",
      tags: [],
    };

    const rootOnlyComment = {
      id: "comment-root",
      kind: COMMENT_EVENT_KIND,
      pubkey: "commenter",
      created_at: 1700000000,
      content: "Root scoped",
      tags: [["i", "root-only"], ["p", "rootpk"]],
    };

    let fetchTarget = null;
    const service = new CommentThreadService({
      nostrClient: { ensurePool: async () => {} },
      fetchVideoComments: async (target) => {
        fetchTarget = target;
        return [rootOnlyComment];
      },
      subscribeVideoComments: () => () => {},
    });

    const threadReadyPayloads = [];
    service.setCallbacks({
      onThreadReady: (payload) => threadReadyPayloads.push(payload),
    });

    const snapshot = await service.loadThread({ video });

    assert.ok(fetchTarget, "fetch should run when only root id is provided");
    assert.equal(fetchTarget.rootIdentifier, "root-only");
    assert.equal(snapshot.rootIdentifier, "root-only");
    assert.equal(snapshot.commentsById.get("comment-root").content, "Root scoped");
    assert.equal(threadReadyPayloads[0].rootIdentifier, "root-only");
  },
);

test(
  "CommentThreadService falls back to pointerIdentifiers root id",
  async () => {
    const video = {
      id: "pointer-video",
      pubkey: "rootpk",
      kind: 30078,
      tags: [],
      pointerIdentifiers: {
        videoRootId: "pointer-root",
      },
    };

    const pointerComment = {
      id: "comment-pointer",
      kind: COMMENT_EVENT_KIND,
      pubkey: "commenter",
      created_at: 1700000001,
      content: "Pointer scoped",
      tags: [["i", "pointer-root"], ["p", "rootpk"]],
    };

    let fetchTarget = null;
    const service = new CommentThreadService({
      nostrClient: { ensurePool: async () => {} },
      fetchVideoComments: async (target) => {
        fetchTarget = target;
        return [pointerComment];
      },
      subscribeVideoComments: () => () => {},
    });

    const snapshot = await service.loadThread({ video });

    assert.ok(fetchTarget, "fetch should run when pointer identifiers are provided");
    assert.equal(fetchTarget.rootIdentifier, "pointer-root");
    assert.equal(snapshot.rootIdentifier, "pointer-root");
  },
);

test(
  "CommentThreadService preserves raw video author pubkeys during hydration fetches",
  async () => {
    const video = {
      id: "video-upper",
      pubkey: "AUTHORPK",
      kind: 30078,
      tags: [["d", "video-root-upper"]],
    };

    const videoDefinitionAddress = "30078:AUTHORPK:video-root-upper";
    const pendingComment = {
      id: "upper-comment-1",
      ...buildCommentEvent({
        pubkey: "commenter-upper",
        created_at: 1700001200,
        videoEventId: video.id,
        videoDefinitionAddress,
        rootIdentifier: "video-root-upper",
        rootKind: "30078",
        rootAuthorPubkey: video.pubkey,
        content: "Uppercase hydration check",
      }),
    };

    const fetchTargets = [];
    let resolveFetch = () => {};
    const fetchBlocker = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchVideoComments = async (target) => {
      fetchTargets.push(target);
      await fetchBlocker;
      if (target.videoAuthorPubkey === video.pubkey) {
        return [pendingComment];
      }
      return [];
    };

    const subscribeTargets = [];
    const service = new CommentThreadService({
      nostrClient: { ensurePool: async () => {} },
      fetchVideoComments,
      subscribeVideoComments: (target, _options = {}) => {
        subscribeTargets.push(target);
        return () => {};
      },
      hydrationDebounceMs: 0,
    });

    const loadPromise = service.loadThread({ video });
    await tick();

    assert.equal(fetchTargets.length, 1, "hydration fetch should start immediately");

    service.processIncomingEvent(pendingComment);
    resolveFetch();

    const snapshot = await loadPromise;

    assert.equal(
      fetchTargets[0].videoAuthorPubkey,
      video.pubkey,
      "fetch target should prefer the raw video author pubkey",
    );
    assert.equal(
      snapshot.videoAuthorPubkey,
      video.pubkey,
      "snapshot should retain the raw video author pubkey",
    );
    assert.equal(
      snapshot.commentsById.has(pendingComment.id),
      true,
      "hydration should include comments published before fetch completion",
    );
    assert.equal(
      subscribeTargets.length,
      1,
      "subscription should begin after hydration completes",
    );
    assert.equal(
      subscribeTargets[0].videoAuthorPubkey,
      video.pubkey,
      "subscription target should also retain the raw pubkey",
    );
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
      nostrClient: { ensurePool: async () => {} },
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
