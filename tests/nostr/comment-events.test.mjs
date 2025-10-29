import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMENT_EVENT_KIND,
  publishComment,
  listVideoComments,
  subscribeVideoComments,
} from "../../js/nostr/commentEvents.js";

function createMockClient({
  actorPubkey = "actor-pubkey",
  sessionPrivateKey = "session-private",
  relays = ["wss://primary"],
  publishResults = [],
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

  const ensureSessionActorCalls = [];
  const client = {
    pool,
    relays,
    pubkey: actorPubkey,
    sessionActor: {
      pubkey: actorPubkey,
      privateKey: sessionPrivateKey,
    },
    ensureSessionActor: async (forceRefresh = false) => {
      ensureSessionActorCalls.push(forceRefresh);
      if (forceRefresh && !client.sessionActor) {
        client.sessionActor = {
          pubkey: actorPubkey,
          privateKey: sessionPrivateKey,
        };
      }
      return actorPubkey;
    },
    ensureExtensionPermissions: async () => ({ ok: true }),
  };

  return { client, pool, publishCalls, ensureSessionActorCalls };
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

  let privateKeySignCalls = 0;

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
      signEventWithPrivateKey: () => {
        privateKeySignCalls += 1;
        return null;
      },
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

  assert.equal(privateKeySignCalls, 0, "session key signing should be skipped when active signer succeeds");
  assert.equal(signerCalls.length, 1, "active signer should sign the event once");

  const eventTags = buildCommentEventTags(signerCalls[0]);
  const eTags = eventTags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  const aTags = eventTags.filter((tag) => Array.isArray(tag) && tag[0] === "a");
  assert.deepEqual(
    eTags,
    [["e", "parent-comment-id"]],
    "comment event should include parent pointer but omit the addressable video id",
  );
  assert.deepEqual(
    aTags,
    [["a", "30078:deadbeef:clip", "wss://definition-relay"]],
    "comment event should target the video definition via #a tag",
  );
});

test("publishComment falls back to session signer when active signer is missing", async () => {
  const {
    client,
    publishCalls,
    ensureSessionActorCalls,
  } = createMockClient();

  client.sessionActor = null;

  let privateKeySignCalls = 0;
  const signEventWithPrivateKey = (event, key) => {
    privateKeySignCalls += 1;
    assert.equal(key, "session-private", "session key should be used when rehydrated");
    return { ...event, id: "signed-by-session" };
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
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, true, "publish should succeed with session signer");
  assert.equal(privateKeySignCalls, 1, "session signing should occur exactly once");
  assert.equal(
    ensureSessionActorCalls.includes(true),
    true,
    "ensureSessionActor should be invoked with force refresh",
  );
  assert.equal(publishCalls.length, 1, "publish should still occur once");
});

test("publishComment accepts legacy targets with only an event id", async () => {
  const { client, publishCalls } = createMockClient();

  let signCalls = 0;
  const signEventWithPrivateKey = (event) => {
    signCalls += 1;
    return { ...event, id: `signed-${signCalls}` };
  };

  const result = await publishComment(
    client,
    {
      videoEventId: "legacy-event-id",
      parentCommentId: "parent-legacy",
    },
    { content: "Legacy comment" },
    {
      resolveActiveSigner: () => null,
      shouldRequestExtensionPermissions: () => false,
      signEventWithPrivateKey,
      DEFAULT_NIP07_PERMISSION_METHODS: [],
    },
  );

  assert.equal(result.ok, true, "publishing should succeed without a definition address");
  assert.equal(signCalls, 1, "session signer should be used to sign the event");
  assert.equal(publishCalls.length, 1, "event should be published exactly once");

  const publishedEvent = publishCalls[0]?.event;
  const tags = buildCommentEventTags(publishedEvent);
  const eTags = tags.filter((tag) => Array.isArray(tag) && tag[0] === "e");
  const aTags = tags.filter((tag) => Array.isArray(tag) && tag[0] === "a");

  assert.deepEqual(
    eTags,
    [
      ["e", "legacy-event-id"],
      ["e", "parent-legacy"],
    ],
    "legacy publish should target the video event id and parent comment",
  );
  assert.deepEqual(aTags, [], "no address tag should be emitted when unavailable");
});

test("listVideoComments builds filters that prefer #a pointers", async () => {
  const matchingEventLatest = {
    id: "comment-2",
    kind: COMMENT_EVENT_KIND,
    created_at: 1700000200,
    tags: [
      ["a", "30078:author:clip"],
      ["e", "parent-1"],
    ],
  };

  const matchingEventOlder = {
    id: "comment-2",
    kind: COMMENT_EVENT_KIND,
    created_at: 1690000000,
    tags: [
      ["a", "30078:author:clip"],
      ["e", "parent-1"],
    ],
  };

  const otherEvent = {
    id: "comment-3",
    kind: COMMENT_EVENT_KIND,
    created_at: 1700000100,
    tags: [["a", "30078:author:clip"]],
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
  assert.equal(receivedFilters.filters.length, 2, "legacy and preferred filters should be emitted");
  const [primaryFilter, legacyFilter] = receivedFilters.filters;
  assert.equal(
    primaryFilter.kinds[0],
    COMMENT_EVENT_KIND,
    "primary filter should target comment kind",
  );
  assert.deepEqual(
    primaryFilter["#a"],
    ["30078:author:clip"],
    "primary filter should bind the video definition via #a",
  );
  assert.deepEqual(
    primaryFilter["#e"],
    ["parent-1"],
    "primary filter should include the parent pointer via #e",
  );
  assert.equal(primaryFilter.since, 1700000000, "since option should propagate to primary filter");
  assert.equal(primaryFilter.limit, 10, "limit option should propagate to primary filter");

  assert.equal(
    legacyFilter.kinds[0],
    COMMENT_EVENT_KIND,
    "legacy filter should target comment kind",
  );
  assert.deepEqual(
    legacyFilter["#e"],
    ["video-1", "parent-1"],
    "legacy filter should target the video id for backward compatibility",
  );
  assert.equal(legacyFilter.since, 1700000000, "since option should propagate to legacy filter");
  assert.equal(legacyFilter.limit, 10, "limit option should propagate to legacy filter");
});

test("listVideoComments supports legacy targets without a definition address", async () => {
  const legacyEvent = {
    id: "legacy-comment",
    kind: COMMENT_EVENT_KIND,
    tags: [["e", "legacy-video"], ["e", "legacy-parent"]],
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
        kinds: [COMMENT_EVENT_KIND],
        "#e": ["legacy-video"],
      },
    ],
    "legacy listing should target the video event id via #e",
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
        kinds: [COMMENT_EVENT_KIND],
        "#a": ["30078:author:clip"],
        "#e": ["parent-1"],
      },
      {
        kinds: [COMMENT_EVENT_KIND],
        "#e": ["video-1", "parent-1"],
      },
    ],
    "subscription should emit preferred and legacy filters",
  );

  handler({
    id: "comment-accepted",
    kind: COMMENT_EVENT_KIND,
    tags: [
      ["a", "30078:author:clip"],
      ["e", "parent-1"],
    ],
  });

  handler({
    id: "comment-rejected",
    kind: COMMENT_EVENT_KIND,
    tags: [["e", "video-1"]],
  });

  assert.equal(receivedEvents.length, 1, "only matching events should reach the callback");
  assert.equal(receivedEvents[0].id, "comment-accepted", "matching event should be forwarded");

  unsubscribe();
  unsubscribe();

  assert.equal(unsubCalls, 1, "underlying unsubscribe should only run once");
});
