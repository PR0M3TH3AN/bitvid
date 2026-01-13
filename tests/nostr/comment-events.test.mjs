import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMENT_EVENT_KIND,
  LEGACY_COMMENT_KIND,
  publishComment,
  listVideoComments,
  subscribeVideoComments,
  __testExports,
} from "../../js/nostr/commentEvents.js";

const { normalizeCommentTarget, isVideoCommentEvent } = __testExports;

function createMockClient({
  actorPubkey = "actor-pubkey",
  relays = ["wss://primary"],
  publishResults = [],
  extensionPermissions = { ok: true },
} = {}) {
  const publishCalls = [];
  const pool = {
    publish(urls, event) {
      publishCalls.push({ urls, event });
      const result = publishResults.shift();
      return {
        on(name, handler) {
          if (name === "ok" && (!result || result.success !== false)) {
            handler();
          }
          if (name === "failed" && result && result.success === false) {
            handler(result.error || new Error("publish failed"));
          }
        },
      };
    },
    list: async () => [],
    sub: () => ({ on() {}, unsub() {} }),
  };

  const client = {
    pool,
    relays,
    pubkey: actorPubkey,
    ensureExtensionPermissions: async () => extensionPermissions,
  };

  return { client, pool, publishCalls };
}

function buildCommentEventTags(event) {
  return Array.isArray(event?.tags)
    ? event.tags.map((tag) => Array.isArray(tag) ? [...tag] : tag)
    : [];
}

test("publishComment prefers active signer when available", async () => {
  const {
    client,
    publishCalls,
  } = createMockClient({
    relays: ["wss://relay.one", "wss://relay.two"],
  });

  const signerCalls = [];
  const signer = {
    type: "extension",
    pubkey: client.pubkey,
    async signEvent(event) {
      signerCalls.push(event);
      return { ...event, id: "signed-by-active" };
    },
  };

  const result = await publishComment(
    client,
    {
      videoEventId: "video-event-id",
      videoEventRelay: "wss://video-relay",
      videoDefinitionAddress: "30078:deadbeef:clip",
      videoDefinitionRelay: "wss://definition-relay",
      parentCommentId: "parent-comment-id",
      threadParticipantPubkey: "thread-participant",
    },
    {
      content: "Hello world",
      relays: ["wss://custom"],
    },
    {
      resolveActiveSigner: () => signer,
      shouldRequestExtensionPermissions: () => true,
      DEFAULT_NIP07_PERMISSION_METHODS: ["signEvent"],
    },
  );

  assert.equal(result.ok, true, "publish should succeed when relay accepts the event");
  assert.deepEqual(
    result.acceptedRelays,
    ["wss://custom"],
    "accepted relays should reflect the sanitized relay list",
  );
  assert.equal(
    publishCalls.length,
    1,
    "exactly one publish call should be issued",
  );
  assert.deepEqual(
    publishCalls[0].urls,
    ["wss://custom"],
    "publish should target the caller supplied relays",
  );

  assert.equal(signerCalls.length, 1, "active signer should sign the event once");

  const eventTags = buildCommentEventTags(signerCalls[0]);
  assert.deepEqual(
    eventTags,
    [
      ["A", "30078:deadbeef:clip", "wss://definition-relay"],
      ["K", "30078"],
      ["P", "deadbeef", "wss://definition-relay"],
      ["E", "video-event-id", "wss://video-relay"],
      ["A", "30078:deadbeef:clip", "wss://definition-relay"],
      ["E", "parent-comment-id", "thread-participant"],
      ["K", String(COMMENT_EVENT_KIND)],
      ["P", "thread-participant"],
    ],
    "comment event should include uppercase pointers and participant metadata",
  );
});

test("publishComment rejects when active signer is unavailable", async () => {
  const { client, publishCalls } = createMockClient();

  client.sessionActor = {
    pubkey: client.pubkey,
    privateKey: "session-private",
  };

  const result = await publishComment(
    client,
    {
      videoEventId: "event-1",
      videoDefinitionAddress: "30078:abc:def",
    },
    { content: "Fallback" },
    {
      resolveActiveSigner: () => null,
      shouldRequestExtensionPermissions: () => false,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, false, "publish should fail without an active signer");
  assert.equal(result.error, "auth-required", "missing signer should yield auth-required");
  assert.equal(publishCalls.length, 0, "publish should not be attempted without a signer");
});

test("publishComment accepts legacy targets with only an event id", async () => {
  const { client, publishCalls } = createMockClient();

  let signCalls = 0;
  const signer = {
    type: "extension",
    pubkey: client.pubkey,
    signEvent: (event) => {
      signCalls += 1;
      return { ...event, id: `signed-${signCalls}` };
    },
  };

  const result = await publishComment(
    client,
    {
      videoEventId: "legacy-event-id",
      parentCommentId: "parent-legacy",
    },
    { content: "Legacy comment" },
    {
      resolveActiveSigner: () => signer,
      shouldRequestExtensionPermissions: () => false,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, true, "publishing should succeed without a definition address");
  assert.equal(signCalls, 1, "active signer should be used to sign the event");
  assert.equal(publishCalls.length, 1, "event should be published exactly once");

  const publishedEvent = publishCalls[0]?.event;
  const tags = buildCommentEventTags(publishedEvent);
  assert.deepEqual(
    tags,
    [
      ["E", "legacy-event-id"],
      ["K", String(COMMENT_EVENT_KIND)],
      ["E", "legacy-event-id"],
      ["E", "parent-legacy"],
      ["K", String(COMMENT_EVENT_KIND)],
    ],
    "legacy publish should emit uppercase root metadata with lowercase fallbacks",
  );
});

test("publishComment derives root and parent metadata from parent comment tags", async () => {
  const { client } = createMockClient();

  const parentEvent = {
    id: "parent-comment",
    kind: COMMENT_EVENT_KIND,
    pubkey: "parentpk",
    tags: [
      ["E", "video-event", "wss://root", "videopk"],
      ["K", "30078"],
      ["P", "videopk", "wss://author"],
      ["A", "30078:videopk:root", "wss://definition"],
      ["E", "video-event", "wss://root"],
      ["E", "parent-comment", "wss://parent", "parentpk"],
      ["K", String(COMMENT_EVENT_KIND)],
      ["P", "parentpk", "wss://parent"],
    ],
  };

  const signer = {
    type: "extension",
    pubkey: client.pubkey,
    signEvent: (event) => ({ ...event, id: "signed" }),
  };

  const result = await publishComment(
    client,
    { parentComment: parentEvent },
    { content: "Reply" },
    {
      resolveActiveSigner: () => signer,
      shouldRequestExtensionPermissions: () => false,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  const tags = buildCommentEventTags(result.event);
  assert.deepEqual(tags, [
    ["A", "30078:videopk:root", "wss://definition"],
    ["K", "30078"],
    ["P", "videopk", "wss://author"],
    ["E", "video-event", "wss://root"],
    ["A", "30078:videopk:root", "wss://definition"],
    ["E", "parent-comment", "wss://parent", "parentpk"],
    ["K", String(COMMENT_EVENT_KIND)],
    ["P", "parentpk", "wss://parent"],
  ]);
});

test("listVideoComments matches comments even when tag casing and whitespace differ", async () => {
  const mismatchedEvent = {
    id: "case-comment",
    kind: COMMENT_EVENT_KIND,
    created_at: 1700000300,
    tags: [
      [" A ", " 30078:AUTHOR:CLIP ", " WSS://Definition "],
      ["E", " VIDEO-1 "],
      [" E ", " VIDEO-1 "],
      ["E", " PARENT-1 "],
      ["K", String(COMMENT_EVENT_KIND)],
      ["P", " THREAD-PARTICIPANT "],
    ],
  };

  const { client, pool } = createMockClient();
  pool.list = async () => [[mismatchedEvent]];

  const descriptorInput = {
    videoEventId: " video-1 ",
    videoDefinitionAddress: " 30078:author:clip ",
    parentCommentId: " parent-1 ",
  };

  const events = await listVideoComments(client, descriptorInput);
  assert.equal(events.length, 1, "case-insensitive descriptor should match comment");
  assert.equal(events[0].id, "case-comment", "matched event should be returned");

  const normalizedDescriptor = normalizeCommentTarget(descriptorInput);
  assert.ok(normalizedDescriptor, "normalizeCommentTarget should produce a descriptor");
  assert.equal(
    isVideoCommentEvent(mismatchedEvent, normalizedDescriptor),
    true,
    "isVideoCommentEvent should treat tag casing and whitespace as insignificant",
  );
});

test("listVideoComments matches uppercase definition addresses without lowering", async () => {
  const uppercasePointer = "30078:AUTHOR:Clip42";
  const matchingEvent = {
    id: "uppercase-comment",
    kind: COMMENT_EVENT_KIND,
    created_at: 1700000400,
    tags: [
      ["A", uppercasePointer],
      ["E", "video-1"],
    ],
  };

  const { client, pool } = createMockClient();
  pool.list = async () => [[matchingEvent]];

  const descriptorInput = {
    videoEventId: "video-1",
    videoDefinitionAddress: uppercasePointer,
  };

  const events = await listVideoComments(client, descriptorInput);
  assert.equal(events.length, 1, "uppercase pointer should still match");
  assert.equal(events[0].id, "uppercase-comment", "matched event should be returned");

  const normalizedDescriptor = normalizeCommentTarget(descriptorInput);
  assert.ok(normalizedDescriptor, "normalizeCommentTarget should produce a descriptor");
  assert.equal(
    isVideoCommentEvent(matchingEvent, normalizedDescriptor),
    true,
    "isVideoCommentEvent should respect descriptor casing for definition pointers",
  );
});

test("publishComment emits only uppercase video event pointer when address and parent are absent", async () => {
  const { client, publishCalls } = createMockClient();

  const signer = {
    type: "extension",
    pubkey: client.pubkey,
    signEvent: (event) => ({ ...event, id: "solo" }),
  };

  const result = await publishComment(
    client,
    {
      videoEventId: "video-only",
    },
    { content: "Solo" },
    {
      resolveActiveSigner: () => signer,
      shouldRequestExtensionPermissions: () => false,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, true, "publishing should succeed with only a video id");
  assert.equal(publishCalls.length, 1, "comment should be published once");

  const publishedEvent = publishCalls[0]?.event;
  const tags = buildCommentEventTags(publishedEvent);
  assert.deepEqual(
    tags,
    [
      ["E", "video-only"],
    ],
    "event should include a single uppercase pointer",
  );
});

test("listVideoComments builds filters with uppercase roots plus legacy fallbacks", async () => {
  const matchingEventLatest = {
    id: "comment-2",
    kind: COMMENT_EVENT_KIND,
    created_at: 1700000200,
    tags: [
      ["A", "30078:author:clip"],
      ["K", "30078"],
      ["P", "author"],
      ["E", "parent-1"],
      ["K", String(COMMENT_EVENT_KIND)],
      ["P", "thread-participant"],
    ],
  };

  const matchingEventOlder = {
    id: "comment-2",
    kind: COMMENT_EVENT_KIND,
    created_at: 1690000000,
    tags: [
      ["A", "30078:author:clip"],
      ["E", "parent-1"],
    ],
  };

  const otherEvent = {
    id: "comment-3",
    kind: COMMENT_EVENT_KIND,
    created_at: 1700000100,
    tags: [["A", "30078:author:clip"]],
  };

  const {
    client,
    pool,
  } = createMockClient();

  let receivedFilters = null;
  pool.list = async (relays, filters) => {
    receivedFilters = { relays, filters };
    return [[matchingEventLatest, matchingEventOlder, otherEvent]];
  };

  const events = await listVideoComments(
    client,
    {
      videoEventId: "video-1",
      videoDefinitionAddress: "30078:author:clip",
      parentCommentId: "parent-1",
      parentKind: COMMENT_EVENT_KIND,
      parentAuthorPubkey: "thread-participant",
    },
    { relays: ["wss://history"], since: 1700000000, limit: 10 },
  );

  assert.ok(Array.isArray(events), "listing should produce an array");
  assert.equal(events.length, 1, "duplicate ids should be collapsed to the newest instance");
  assert.equal(events[0].id, "comment-2", "newest event should be retained");

  assert.ok(receivedFilters, "pool.list should receive filters");
  assert.deepEqual(
    receivedFilters.relays,
    ["wss://history"],
    "list should use caller provided relays",
  );
  assert.equal(
    receivedFilters.filters.length,
    4,
    "event, uppercase, parent, and address filters should be emitted",
  );
  const [eventFilter, uppercaseFilter, parentFilter, definitionFilter] =
    receivedFilters.filters;
  assert.deepEqual(
    eventFilter.kinds,
    [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
    "event filter should target comment kind",
  );
  assert.deepEqual(
    eventFilter["#E"],
    ["video-1"],
    "event filter should target the video via #E",
  );
  assert.deepEqual(
    uppercaseFilter.kinds,
    [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
    "uppercase filter should target comment kind",
  );
  assert.deepEqual(
    uppercaseFilter["#A"],
    ["30078:author:clip"],
    "uppercase filter should target the video definition via #A",
  );
  assert.deepEqual(
    uppercaseFilter["#K"],
    ["30078"],
    "uppercase filter should scope the root kind via #K",
  );
  assert.deepEqual(
    uppercaseFilter["#P"],
    ["author"],
    "uppercase filter should scope the root author via #P",
  );
  assert.equal(
    uppercaseFilter.since,
    1700000000,
    "since option should propagate to uppercase filter",
  );
  assert.equal(
    uppercaseFilter.limit,
    10,
    "limit option should propagate to uppercase filter",
  );
  assert.deepEqual(
    parentFilter,
    {
      kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
      "#E": ["parent-1"],
      since: 1700000000,
      limit: 10,
    },
    "parent filter should scope the thread via #E",
  );
  assert.equal(
    eventFilter.since,
    1700000000,
    "since option should propagate to event filter",
  );
  assert.equal(
    eventFilter.limit,
    10,
    "limit option should propagate to event filter",
  );

  assert.deepEqual(
    definitionFilter.kinds,
    [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
    "definition filter should target comment kind",
  );
  assert.deepEqual(
    definitionFilter["#A"],
    ["30078:author:clip"],
    "definition filter should bind the video definition via #A",
  );
  assert.deepEqual(
    definitionFilter["#E"],
    ["parent-1"],
    "definition filter should continue scoping to the parent comment",
  );
  assert.equal(
    definitionFilter.since,
    1700000000,
    "since option should propagate to definition filter",
  );
  assert.equal(
    definitionFilter.limit,
    10,
    "limit option should propagate to definition filter",
  );
});

test("listVideoComments emits uppercase root filters when only the identifier is known", async () => {
  const matchingEvent = {
    id: "comment-root",
    kind: COMMENT_EVENT_KIND,
    tags: [
      ["I", "root-only"],
      ["P", "root-author"],
      ["E", "video-rooted"],
    ],
  };

  const { client, pool } = createMockClient();

  let receivedFilters = null;
  pool.list = async (relays, filters) => {
    receivedFilters = { relays, filters };
    return [[matchingEvent]];
  };

  const events = await listVideoComments(
    client,
    {
      videoEventId: "video-rooted",
      videoKind: COMMENT_EVENT_KIND,
      videoAuthorPubkey: "root-author",
      rootIdentifier: "root-only",
    },
    { since: 1700000000, limit: 5 },
  );

  assert.equal(events.length, 1, "matching comment should be returned");
  assert.ok(receivedFilters, "pool.list should receive filters");
  assert.equal(
    receivedFilters.filters.length,
    2,
    "root identifier requests should emit uppercase filters only",
  );

  const [eventFilter, uppercaseRootFilter] = receivedFilters.filters;

  assert.deepEqual(
    eventFilter,
    {
      kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
      "#E": ["video-rooted"],
      since: 1700000000,
      limit: 5,
    },
    "event filter should target the video event id via #E",
  );

  assert.deepEqual(
    uppercaseRootFilter.kinds,
    [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
    "uppercase root filter should continue targeting comment kind",
  );
  assert.deepEqual(
    uppercaseRootFilter["#I"],
    ["root-only"],
    "uppercase root filter should continue binding the root identifier via #I",
  );
  assert.deepEqual(
    uppercaseRootFilter["#P"],
    ["root-author"],
    "uppercase root filter should scope by author when available",
  );
  assert.equal(
    uppercaseRootFilter.since,
    1700000000,
    "since option should propagate to uppercase root filter",
  );
  assert.equal(
    uppercaseRootFilter.limit,
    5,
    "limit option should propagate to uppercase root filter",
  );
});

test("listVideoComments supports legacy targets without a definition address", async () => {
  const legacyEvent = {
    id: "legacy-comment",
    kind: COMMENT_EVENT_KIND,
    tags: [["E", "legacy-video"]],
  };

  const { client, pool } = createMockClient();

  let receivedFilters = null;
  pool.list = async (relays, filters) => {
    receivedFilters = { relays, filters };
    return [[legacyEvent]];
  };

  const events = await listVideoComments(client, { videoEventId: "legacy-video" });

  assert.ok(Array.isArray(events), "listing should still return an array");
  assert.equal(events.length, 1, "legacy matching comment should be returned");
  assert.equal(events[0].id, "legacy-comment", "returned event should match the pool payload");

  assert.ok(receivedFilters, "pool.list should be invoked with filters");
  assert.deepEqual(
    receivedFilters.relays,
    client.relays,
    "legacy listing should fall back to client relays when none are provided",
  );
  assert.deepEqual(
    receivedFilters.filters,
    [
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#E": ["legacy-video"],
      },
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#E": ["legacy-video"],
      },
    ],
    "legacy listing should target the video event id via #E",
  );
});

test("subscribeVideoComments forwards matching events and cleans up unsubscribe", async () => {
  const {
    client,
    pool,
  } = createMockClient();

  let handler = null;
  let unsubCalls = 0;
  let subscriptionArgs = null;
  pool.sub = (relays, filters) => {
    subscriptionArgs = { relays, filters };
    handler = null;
    return {
      on(name, cb) {
        if (name === "event") {
          handler = cb;
        }
      },
      unsub() {
        unsubCalls += 1;
      },
      relays,
      filters,
    };
  };

  const receivedEvents = [];
  const unsubscribe = subscribeVideoComments(
    client,
    {
      videoEventId: "video-1",
      videoDefinitionAddress: "30078:author:clip",
      parentCommentId: "parent-1",
      parentKind: COMMENT_EVENT_KIND,
      parentAuthorPubkey: "thread-participant",
    },
    {
      relays: ["wss://live"],
      onEvent: (event) => {
        receivedEvents.push(event);
      },
    },
  );

  assert.ok(typeof unsubscribe === "function", "subscribe should return an unsubscribe function");
  assert.ok(handler, "subscription handler should be registered");
  assert.ok(subscriptionArgs, "subscription should capture args");
  assert.deepEqual(
    subscriptionArgs.relays,
    ["wss://live"],
    "subscription should use caller provided relays",
  );
  assert.deepEqual(
    subscriptionArgs.filters,
    [
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#E": ["video-1"],
      },
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#A": ["30078:author:clip"],
        "#K": ["30078"],
        "#P": ["author"],
      },
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#E": ["parent-1"],
      },
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#a": ["30078:author:clip"],
        "#E": ["parent-1"],
      },
    ],
    "subscription should emit event, parent, and address filters",
  );

  handler({
    id: "comment-accepted",
    kind: COMMENT_EVENT_KIND,
    tags: [
      ["A", "30078:author:clip"],
      ["K", "30078"],
      ["P", "author"],
      ["E", "parent-1"],
      ["K", String(COMMENT_EVENT_KIND)],
      ["P", "thread-participant"],
    ],
  });

  handler({
    id: "comment-rejected",
    kind: COMMENT_EVENT_KIND,
    tags: [["E", "video-1"]],
  });

  assert.equal(receivedEvents.length, 1, "only matching events should reach the callback");
  assert.equal(receivedEvents[0].id, "comment-accepted", "matching event should be forwarded");

  unsubscribe();
  unsubscribe();

  assert.equal(unsubCalls, 1, "underlying unsubscribe should only run once");
});

test("subscribeVideoComments supports video targets without a definition address", async () => {
  const { client, pool } = createMockClient();

  let handler = null;
  let subscriptionArgs = null;
  pool.sub = (relays, filters) => {
    subscriptionArgs = { relays, filters };
    return {
      on(name, cb) {
        if (name === "event") {
          handler = cb;
        }
      },
      unsub() {},
    };
  };

  const receivedEvents = [];
  subscribeVideoComments(
    client,
    { videoEventId: "legacy-video" },
    {
      onEvent: (event) => {
        receivedEvents.push(event);
      },
    },
  );

  assert.ok(subscriptionArgs, "subscription should capture filters");
  assert.deepEqual(
    subscriptionArgs.filters,
    [
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#E": ["legacy-video"],
      },
      {
        kinds: [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND],
        "#E": ["legacy-video"],
      },
    ],
    "subscription should emit both legacy and uppercase video filters when address is absent",
  );

  assert.ok(handler, "event handler should be registered");

  handler({
    id: "legacy-comment",
    kind: COMMENT_EVENT_KIND,
    tags: [["E", "legacy-video"]],
  });

  assert.equal(receivedEvents.length, 1, "legacy comment should be forwarded");
  assert.equal(receivedEvents[0].id, "legacy-comment", "comment payload should be delivered");
});
