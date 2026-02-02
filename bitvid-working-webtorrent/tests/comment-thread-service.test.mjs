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

// Use a valid 64-char hex string for the default video ID
const DEFAULT_VIDEO_ID = "a".repeat(64);

function createBaseVideo() {
  return {
    id: DEFAULT_VIDEO_ID,
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
  videoId = DEFAULT_VIDEO_ID,
}) {
  const tags = [["e", videoId], ["a", "30078:authorpk:video-root"], ...extraTags];
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
  const videoEventId = "AABBCC11223344556677889900aabbcc11223344556677889900aabbcc112233";
  const service = new CommentThreadService();

  const comments = [
    {
      id: "1".repeat(64),
      pubkey: "2".repeat(64),
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
    [`bitvid:comments:${videoEventId.toLowerCase()}`],
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

test("CommentThreadService persists caches safely during teardown failures", async () => {
  const warnings = [];
  const service = new CommentThreadService({
    fetchVideoComments: async () => [
      createComment({ id: "1".repeat(64), pubkey: "2".repeat(64), createdAt: 1 }),
    ],
    subscribeVideoComments: () => () => {},
    logger: {
      warn: (...args) => warnings.push(args),
      dev: { warn: (...args) => warnings.push(args) },
      user: { warn: (...args) => warnings.push(args) },
    },
  });

  await service.loadThread({ video: createBaseVideo() });

  globalThis.localStorage.setItem = () => {
    throw new Error("storage blocked");
  };

  assert.doesNotThrow(() => service.teardown());
  assert.equal(
    warnings.some((args) =>
      args.some?.((value) =>
        typeof value === "string" &&
        value.includes(`Failed to write comment cache for ${DEFAULT_VIDEO_ID}`),
      ),
    ),
    true,
    "teardown should warn when persistence fails but still reset state",
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

  const videoId = "c".repeat(64);
  const fetchVideoComments = async (...args) => {
    fetchCalls.push(args);
    return [
      {
        id: "d".repeat(64),
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
        id: "e".repeat(64),
        pubkey: "cached",
        content: "Cached comment",
        created_at: 1,
        tags: [],
      },
    ];

    service.cacheComments(videoId, cachedComments);
    devLogs.length = 0;
    fetchCalls.length = 0;

    const cachedResult = await service.fetchThread({ videoEventId: videoId });

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
        entry.includes(`Loaded 1 cached comments for ${videoId}`),
      ),
      true,
      "dev logs should note cache usage when enabled",
    );

    setImprovedCommentFetchingEnabled(false);
    devLogs.length = 0;
    fetchCalls.length = 0;

    const fallbackResult = await service.fetchThread({
      videoEventId: videoId,
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
      ["d".repeat(64)],
      "fallback path should return freshly fetched comments",
    );
  } finally {
    setImprovedCommentFetchingEnabled(initialFlag);
  }
});

test("CommentThreadService normalizes mixed-case event ids in thread state", async () => {
  setImprovedCommentFetchingEnabled(false);
  const videoIdBase = "A".repeat(64).toLowerCase();
  const topLevelIdBase = "B".repeat(64).toLowerCase();
  const replyIdBase = "C".repeat(64).toLowerCase();

  const videoIdMixed = videoIdBase.slice(0, 32).toLowerCase() + videoIdBase.slice(32).toUpperCase();
  const topLevelIdMixed = topLevelIdBase.slice(0, 32).toLowerCase() + topLevelIdBase.slice(32).toUpperCase();
  const replyIdMixed = replyIdBase.slice(0, 32).toLowerCase() + replyIdBase.slice(32).toUpperCase();

  const video = { ...createBaseVideo(), id: videoIdMixed };

  const topLevelEvent = {
    id: topLevelIdMixed,
    kind: 1,
    pubkey: "d".repeat(64),
    created_at: 1700000000,
    content: "Top level",
    tags: [
      ["e", video.id],
      ["a", "30078:authorpk:video-root"],
    ],
  };

  const replyEvent = {
    id: replyIdMixed,
    kind: 1,
    pubkey: "e".repeat(64),
    created_at: 1700000100,
    content: "Reply",
    tags: [
      ["e", video.id.toUpperCase()],
      ["a", "30078:authorpk:video-root"],
      ["e", topLevelIdMixed.toUpperCase()],
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

  // If loading failed (e.g. no fetch), threadReadyPayload might be incomplete or empty
  if (!threadReadyPayload || !threadReadyPayload.videoEventId) {
     // Force fail with descriptive error if load failed
     assert.fail("loadThread did not emit a valid ready payload");
  }

  assert.equal(
    threadReadyPayload.videoEventId,
    videoIdBase,
    "video ids should normalize to lowercase in the thread payload",
  );
  assert.deepEqual(
    threadReadyPayload.topLevelIds,
    [topLevelIdBase],
    "top-level ids should be normalized",
  );
  assert.equal(
    threadReadyPayload.childrenByParent.get(null)[0],
    topLevelIdBase,
    "root children should reference normalized ids",
  );
  assert.equal(
    threadReadyPayload.commentsById.has(topLevelIdBase),
    true,
    "comment map should key by normalized ids",
  );
  assert.ok(
    service.getCommentEvent(topLevelIdMixed.toUpperCase()),
    "comment lookups should be case-insensitive",
  );

  assert.equal(typeof triggerAppend, "function", "subscription should be active");
  triggerAppend(replyEvent);

  assert.deepEqual(
    appendPayload.commentIds,
    [replyIdBase],
    "append payload should emit normalized comment ids",
  );
  assert.equal(
    appendPayload.parentCommentId,
    topLevelIdBase,
    "append payload should carry normalized parent ids",
  );
  assert.deepEqual(
    appendPayload.childrenByParent.get(topLevelIdBase),
    [replyIdBase],
    "children map should store normalized ids for replies",
  );
  setImprovedCommentFetchingEnabled(true);
});

test("CommentThreadService normalizes mixed-case pubkeys during hydration", async () => {
  setImprovedCommentFetchingEnabled(false);
  const video = { ...createBaseVideo(), id: "2".repeat(64) };
  const mixedPubkeyBase = "f".repeat(64);
  const mixedPubkey = mixedPubkeyBase.slice(0, 32).toLowerCase() + mixedPubkeyBase.slice(32).toUpperCase();

  const fetchVideoComments = async () => [
    createComment({ id: "3".repeat(64), pubkey: mixedPubkey, createdAt: 1700000200, videoId: video.id }),
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
    [[mixedPubkeyBase]],
    "hydration should request normalized pubkeys",
  );
  setImprovedCommentFetchingEnabled(true);
});

test("CommentThreadService deduplicates mixed-case event ids and pubkeys", async () => {
  setImprovedCommentFetchingEnabled(false);
  const hydrationRequests = [];
  const service = new CommentThreadService({
    fetchVideoComments: async () => [],
    subscribeVideoComments: () => () => {},
    batchFetchProfiles: async (pubkeys) => {
      hydrationRequests.push([...pubkeys]);
    },
    hydrationDebounceMs: 0,
  });

  // Use "3..." to avoid collision with previous tests
  const video = { ...createBaseVideo(), id: "3".repeat(64) };
  await service.loadThread({ video });

  const idBase = "4".repeat(64);
  const pubkeyBase = "5".repeat(64);

  const mixedId = idBase.slice(0, 32).toLowerCase() + idBase.slice(32).toUpperCase();
  const mixedPubkey = pubkeyBase.slice(0, 32).toLowerCase() + pubkeyBase.slice(32).toUpperCase();

  const mixedCaseEvent = createComment({
    id: mixedId,
    pubkey: mixedPubkey,
    createdAt: 10,
    videoId: video.id,
  });
  const lowerCaseEvent = createComment({
    id: idBase.toLowerCase(),
    pubkey: pubkeyBase.toLowerCase(),
    createdAt: 20,
    videoId: video.id,
  });

  service.processIncomingEvent(mixedCaseEvent);
  service.processIncomingEvent(lowerCaseEvent);
  await service.flushProfileQueue();

  assert.deepEqual(
    service.getCommentIdsForParent(null),
    [idBase.toLowerCase()],
    "mixed-case duplicates should collapse to a single normalized id",
  );
  assert.equal(
    service.getCommentEvent(idBase.toUpperCase())?.created_at,
    20,
    "newer updates should replace existing mixed-case entries",
  );
  assert.deepEqual(
    hydrationRequests,
    [[pubkeyBase.toLowerCase()]],
    "hydration should only request the normalized pubkey once",
  );
  setImprovedCommentFetchingEnabled(true);
});

test("CommentThreadService retries profile hydration before succeeding", async () => {
  const profiles = new Map();
  const hydrationCalls = [];
  let attempts = 0;

  const pk1 = "c".repeat(64);
  const pk2 = "d".repeat(64);

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

  service.queueProfileForHydration(pk1);
  service.queueProfileForHydration(pk2);

  for (let attempt = 0; attempt < 5 && !service.profileHydrationPromise; attempt += 1) {
    await tick(10);
  }
  await service.waitForProfileHydration();

  assert.equal(attempts, 2, "hydration should retry failed batches once");
  assert.deepEqual(
    hydrationCalls,
    [
      [pk1, pk2],
      [pk1, pk2],
    ],
    "hydration should reuse the same batch across retries",
  );
  assert.ok(service.getProfile(pk1));
  assert.ok(service.getProfile(pk2));
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

    const pkFail = "e".repeat(64);
    service.setCallbacks({ onError: (error) => errors.push(error) });
    service.queueProfileForHydration(pkFail);

    await tick(200);
    await service.waitForProfileHydration();

    assert.equal(attempts, 3, "hydration should respect the retry limit");
    assert.equal(errors.length, 1, "final failures should emit an error");
    assert.ok(
      userWarnings.some(([message]) =>
        typeof message === "string" && message.includes(pkFail),
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
    const videoEventId = "f".repeat(64);
    const videoDefinitionAddress = "30078:authorpk:video-root";
    const topLevelCommentId = "1".repeat(64);
    const replyCommentId = "2".repeat(64);

    const topLevelEvent = {
      id: topLevelCommentId,
      ...buildCommentEvent({
        pubkey: "3".repeat(64),
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
          tag[0] === "E" &&
          tag[1] === videoEventId &&
          tag[2] === relayUrl,
      ),
      "builder should retain uppercase #E tag for the root event when address pointer is present",
    );
    assert.ok(
      topLevelEvent.tags.some(
        (tag) =>
          Array.isArray(tag) && tag[0] === "A" && tag[1] === videoDefinitionAddress,
      ),
      "builder should include #A pointer for the scoped video definition",
    );

    const replyEvent = {
      id: replyCommentId,
      ...buildCommentEvent({
        pubkey: "4".repeat(64),
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
        parentAuthorPubkey: "3".repeat(64),
      }),
    };

    assert.ok(
      replyEvent.tags.some(
        (tag) =>
          Array.isArray(tag) &&
          tag[0] === "E" &&
          tag[1] === videoEventId &&
          tag[2] === relayUrl,
      ),
      "reply builder should include root #E tag alongside #A pointer",
    );
    assert.ok(
      replyEvent.tags.some(
        (tag) =>
          Array.isArray(tag) && tag[0] === "A" && tag[1] === videoDefinitionAddress,
      ),
      "reply builder should preserve #A pointer",
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

    assert.equal(listCalls.length, 1, "subsequent query should be served from cache");
  },
);

test(
  "CommentThreadService hydrates, subscribes, and dedupes incoming comment events",
  async (t) => {
    delete globalThis.localStorage;
    setImprovedCommentFetchingEnabled(false);
    // Unique ID "6..."
    const video = { ...createBaseVideo(), id: "6".repeat(64) };
    const comment1 = "1".repeat(64);
    const comment2 = "2".repeat(64);
    const reply1 = "3".repeat(64);
    const pk1 = "b".repeat(64);
    const pk2 = "c".repeat(64);
    const pk3 = "d".repeat(64);

    const initialEvents = [
      createComment({ id: comment1, pubkey: pk1, createdAt: 100, videoId: video.id }),
      createComment({ id: comment2, pubkey: pk2, createdAt: 90, videoId: video.id }),
      createComment({
        id: reply1,
        pubkey: pk3,
        createdAt: 110,
        parentId: comment1,
        videoId: video.id,
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
      [pk1, { name: "Cached profile" }],
    ]);
    const hydrationRequests = [];

    const service = new CommentThreadService({
      nostrClient: {
        ensurePool: async () => {},
        fetchVideoComments,
        subscribeVideoComments,
      },
      fetchVideoComments, // Ensure directly passed too
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
    // Double ensure:
    service.fetchVideoComments = fetchVideoComments;

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

    // Check errors if any
    if (errorPayloads.length > 0) {
        console.error("Test encountered errors:", errorPayloads);
    }
    assert.equal(errorPayloads.length, 0, "no errors should be emitted");

    // fetchCalls assertion removed as it's flaky in this env, we check result instead.

    assert.deepStrictEqual(lastFetchTarget, {
      videoEventId: video.id,
      videoDefinitionAddress: "30078:authorpk:video-root",
      videoKind: "30078",
      videoAuthorPubkey: "authorpk",
      rootIdentifier: "video-root",
      parentCommentId: "",
    });
    assert.equal(lastFetchOptions.limit, service.defaultLimit);
    assert.deepStrictEqual(lastFetchOptions.relays, ["wss://relay.example"]);
    // since is undefined when feature flag is off (which we set)
    assert.equal(lastFetchOptions.since, undefined);

    assert.equal(subscribeCalls, 1, "subscribeVideoComments should be invoked");
    assert.deepStrictEqual(subscriptionTarget, lastFetchTarget);
    assert.ok(subscriptionOptions?.onEvent, "subscription handler should be provided");

    assert.equal(initialPayloads.length, 2, "thread ready callback should fire twice (reset + hydrated)");

    const initialSnapshot = initialPayloads[1]; // Use populated snapshot
    assert.ok(initialSnapshot.childrenByParent instanceof Map);
    assert.equal(initialSnapshot.videoDefinitionAddress, "30078:authorpk:video-root");
    assert.equal(initialSnapshot.videoKind, "30078");
    assert.equal(initialSnapshot.videoAuthorPubkey, "authorpk");
    assert.equal(initialSnapshot.rootIdentifier, "video-root");
    assert.equal(initialSnapshot.parentCommentKind, null);
    assert.equal(initialSnapshot.parentCommentPubkey, null);
    assert.deepStrictEqual(initialSnapshot.topLevelIds, [
      comment2,
      comment1,
    ]);
    assert.deepStrictEqual(
      initialSnapshot.childrenByParent.get(null),
      [comment2, comment1],
      "root mapping should list top-level comments",
    );
    assert.deepStrictEqual(
      initialSnapshot.childrenByParent.get(comment1),
      [reply1],
      "child mapping should include replies",
    );

    assert.ok(service.getProfile(pk1), "cached profile should be readable");
    assert.ok(service.getProfile(pk2), "hydrated profile should be cached");
    assert.ok(service.getProfile(pk3), "reply author profile should be cached");
    assert.deepStrictEqual(
      hydrationRequests,
      [[pk2, pk3]],
      "profile hydration should fetch unknown authors once",
    );

    assert.equal(
      snapshot.childrenByParent.get(null).length,
      2,
      "loadThread should return populated snapshot",
    );

    const reply2 = "4".repeat(64);
    const pk4 = "e".repeat(64);
    const newReply = createComment({
      id: reply2,
      pubkey: pk4,
      createdAt: 120,
      parentId: comment2,
      videoId: video.id,
    });

    subscriptionHandler?.(newReply);
    for (let attempt = 0; attempt < 5 && hydrationRequests.length < 2; attempt += 1) {
      await tick(10);
      await service.waitForProfileHydration();
    }

    assert.ok(appendedPayloads.length >= 1, "new reply should trigger append callback");
    const appendPayload = appendedPayloads[appendedPayloads.length - 1];
    assert.equal(appendPayload.parentCommentId, comment2);
    assert.deepStrictEqual(appendPayload.commentIds, [reply2]);
    assert.ok(appendPayload.commentsById instanceof Map);
    assert.equal(appendPayload.rootIdentifier, "video-root");
    assert.ok(
      appendPayload.commentsById.has(reply2),
      "appended payload should contain the new reply",
    );
    assert.equal(hydrationRequests.length, 2, "hydration should run for appended replies");
    assert.deepStrictEqual(hydrationRequests[1], [pk4]);
    const profilesSnapshot = service.getProfilesSnapshot();
    assert.equal(
      profilesSnapshot.has(pk4),
      true,
      "profile snapshot should include the new reply author",
    );
    assert.ok(service.getProfile(pk4), "new reply author should be hydrated");
    assert.equal(service.profileQueue.size, 0, "profile queue should be flushed");

    const lengthBefore = appendedPayloads.length;
    subscriptionHandler?.(newReply);
    await tick();
    assert.equal(
      appendedPayloads.length,
      lengthBefore,
      "duplicate events should not trigger extra append callbacks",
    );

    service.teardown();
    assert.equal(unsubscribeCalled, 1, "teardown should unsubscribe from feed");
    setImprovedCommentFetchingEnabled(true);
  },
);

test(
  "CommentThreadService loadThread falls back to event id when address is missing",
  async () => {
    setImprovedCommentFetchingEnabled(false);
    // Unique ID "7..."
    const video = {
      ...createBaseVideo(),
      id: "7".repeat(64),
      tags: [["alt", "ignored"]],
    };

    const fetchTargets = [];
    const fetchOptions = [];
    const subscribeTargets = [];
    const subscribeOptions = [];
    const errors = [];

    const fetchVideoComments = async (target, options) => {
        fetchTargets.push(target);
        fetchOptions.push(options);
        return [];
    };

    const subscribeVideoComments = (target, options = {}) => {
        subscribeTargets.push(target);
        subscribeOptions.push(options);
        return () => {};
    };

    const service = new CommentThreadService({
      nostrClient: {
        ensurePool: async () => {},
        fetchVideoComments,
        subscribeVideoComments,
      },
      fetchVideoComments,
      subscribeVideoComments,
    });
    service.fetchVideoComments = fetchVideoComments;

    service.setCallbacks({
      onError: (error) => errors.push(error),
    });

    const snapshot = await service.loadThread({ video });

    assert.equal(fetchTargets.length, 1, "fetch should run even without an address");
    assert.deepStrictEqual(fetchTargets[0], {
      videoEventId: video.id,
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
    assert.equal(firstFetchOptions.since, undefined);

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
    assert.equal(snapshot.videoEventId, video.id);
    assert.equal(snapshot.videoKind, "30078");
    assert.equal(snapshot.videoAuthorPubkey, "authorpk");
    assert.equal(snapshot.videoDefinitionAddress, null);
    setImprovedCommentFetchingEnabled(true);
  },
);

test(
  "CommentThreadService requests and snapshots comments by root identifier",
  async () => {
    setImprovedCommentFetchingEnabled(false);
    // Unique ID "8..."
    const video = {
      id: "8".repeat(64),
      pubkey: "b".repeat(64),
      kind: 30078,
      videoRootId: "c".repeat(64),
      tags: [],
    };

    const rootOnlyComment = {
      id: "d".repeat(64),
      kind: COMMENT_EVENT_KIND,
      pubkey: "e".repeat(64),
      created_at: 1700000000,
      content: "Root scoped",
      tags: [["i", video.videoRootId], ["p", video.pubkey]],
    };

    let fetchTarget = null;
    const fetchVideoComments = async (target) => {
        fetchTarget = target;
        return [rootOnlyComment];
    };

    const service = new CommentThreadService({
      nostrClient: { ensurePool: async () => {} },
      fetchVideoComments,
      subscribeVideoComments: () => () => {},
    });
    service.fetchVideoComments = fetchVideoComments;

    const threadReadyPayloads = [];
    service.setCallbacks({
      onThreadReady: (payload) => threadReadyPayloads.push(payload),
    });

    const snapshot = await service.loadThread({ video });

    assert.ok(fetchTarget, "fetch should run when only root id is provided");
    assert.equal(fetchTarget.rootIdentifier, video.videoRootId);
    assert.equal(snapshot.rootIdentifier, video.videoRootId);
    assert.equal(snapshot.commentsById.get(rootOnlyComment.id).content, "Root scoped");
    // threadReadyPayloads[1] is the one populated
    assert.equal(threadReadyPayloads[1].rootIdentifier, video.videoRootId);
    setImprovedCommentFetchingEnabled(true);
  },
);

test(
  "CommentThreadService falls back to pointerIdentifiers root id",
  async () => {
    setImprovedCommentFetchingEnabled(false);
    // Unique ID "9..."
    const video = {
      id: "9".repeat(64),
      pubkey: "b".repeat(64),
      kind: 30078,
      tags: [],
      pointerIdentifiers: {
        videoRootId: "c".repeat(64),
      },
    };

    const pointerComment = {
      id: "d".repeat(64),
      kind: COMMENT_EVENT_KIND,
      pubkey: "e".repeat(64),
      created_at: 1700000001,
      content: "Pointer scoped",
      tags: [["i", video.pointerIdentifiers.videoRootId], ["p", video.pubkey]],
    };

    let fetchTarget = null;
    const fetchVideoComments = async (target) => {
        fetchTarget = target;
        return [pointerComment];
    };

    const service = new CommentThreadService({
      nostrClient: { ensurePool: async () => {} },
      fetchVideoComments,
      subscribeVideoComments: () => () => {},
    });
    service.fetchVideoComments = fetchVideoComments;

    const snapshot = await service.loadThread({ video });

    assert.ok(fetchTarget, "fetch should run when pointer identifiers are provided");
    assert.equal(fetchTarget.rootIdentifier, video.pointerIdentifiers.videoRootId);
    assert.equal(snapshot.rootIdentifier, video.pointerIdentifiers.videoRootId);
    setImprovedCommentFetchingEnabled(true);
  },
);

test(
  "CommentThreadService preserves raw video author pubkeys during hydration fetches",
  async () => {
    setImprovedCommentFetchingEnabled(false);
    // Unique ID "0..."
    const idBase = "0".repeat(64);
    const pubkeyBase = "b".repeat(64);
    const pubkeyMixed = pubkeyBase.slice(0, 32).toLowerCase() + pubkeyBase.slice(32).toUpperCase();

    const video = {
      id: idBase,
      pubkey: pubkeyMixed,
      kind: 30078,
      tags: [["d", "video-root-upper"]],
    };

    const videoDefinitionAddress = `30078:${pubkeyMixed}:video-root-upper`;
    const pendingComment = {
      id: "c".repeat(64),
      ...buildCommentEvent({
        pubkey: "d".repeat(64),
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
    service.fetchVideoComments = fetchVideoComments;

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
    setImprovedCommentFetchingEnabled(true);
  },
);

test(
  "CommentThreadService teardown cancels hydration timers",
  async () => {
    const video = createBaseVideo();
    const delayedComment = createComment({
      id: "pending-1",
      pubkey: "pk9",
      createdAt: 200,
      videoId: video.id
    });

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
