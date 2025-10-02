// Run with: node tests/view-counter.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const {
  WATCH_HISTORY_KIND,
  VIEW_COUNT_DEDUPE_WINDOW_SECONDS,
  VIEW_COUNT_BACKFILL_MAX_DAYS,
  VIEW_COUNT_CACHE_TTL_MS,
} = await import("../js/config.js");

const { buildViewEvent, setNostrEventSchemaOverrides } = await import(
  "../js/nostrEventSchemas.js"
);

const VIEW_COUNTER_STORAGE_KEY = "bitvid:view-counter:v1";
const CACHE_TTL_TEST_POINTER = { type: "e", value: "view-counter-cache-ttl" };

// Seed a stale cache entry so we can verify hydration ignores data older than the TTL.
const staleSavedAt = Date.now() - (VIEW_COUNT_CACHE_TTL_MS + 60_000);
localStorage.clear();
localStorage.setItem(
  VIEW_COUNTER_STORAGE_KEY,
  JSON.stringify({
    version: 1,
    savedAt: staleSavedAt,
    entries: [
      [
        `${CACHE_TTL_TEST_POINTER.type}:${CACHE_TTL_TEST_POINTER.value}`,
        {
          total: 42,
          dedupeBuckets: [["pub-cache-ttl:bucket", staleSavedAt]],
          lastSyncedAt: staleSavedAt - 5_000,
          status: "live",
        },
      ],
    ],
  })
);

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

setNostrEventSchemaOverrides({});

const canonicalViewEvent = buildViewEvent({
  pubkey: "actor-canonical",
  created_at: 1000,
  pointerValue: CACHE_TTL_TEST_POINTER.value,
  pointerTag: [CACHE_TTL_TEST_POINTER.type, CACHE_TTL_TEST_POINTER.value],
  dedupeTag: "ignore-dedupe",
});

assert.deepEqual(
  canonicalViewEvent.tags,
  [
    ["t", "view"],
    [CACHE_TTL_TEST_POINTER.type, CACHE_TTL_TEST_POINTER.value],
    ["d", "ignore-dedupe"],
  ],
  "view event should include topic, pointer, and dedupe tags when provided"
);

const sessionViewEvent = buildViewEvent({
  pubkey: "actor-session",
  created_at: 2000,
  pointerValue: "kind:1234:actor-session",
  pointerTag: ["a", "kind:1234:actor-session"],
  includeSessionTag: true,
});

assert.deepEqual(
  sessionViewEvent.tags,
  [
    ["t", "view"],
    ["a", "kind:1234:actor-session"],
    ["session", "true"],
  ],
  "view event should append the session tag when requested"
);

const { nostrClient } = await import("../js/nostr.js");

function createMockNostrHarness() {
  const storedEvents = new Map();
  const customCountResults = new Map();
  const subscribers = new Map();
  const metrics = { list: 0, count: 0 };

  const resetMetrics = () => {
    metrics.list = 0;
    metrics.count = 0;
  };

  const pointerKeyFromInput = (input) => {
    if (!input) {
      return "";
    }
    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) {
        return "";
      }
      if (trimmed.includes(":")) {
        return trimmed;
      }
      return `e:${trimmed}`;
    }
    if (Array.isArray(input)) {
      if (input.length < 2) {
        return "";
      }
      const type = input[0] === "a" ? "a" : "e";
      const value = typeof input[1] === "string" ? input[1].trim() : "";
      if (!value) {
        return "";
      }
      return `${type}:${value}`;
    }
    if (typeof input === "object") {
      const type = input.type === "a" ? "a" : "e";
      const value = typeof input.value === "string" ? input.value.trim() : "";
      if (!value) {
        return "";
      }
      return `${type}:${value}`;
    }
    return "";
  };

  const listVideoViewEvents = async (pointer, options = {}) => {
    metrics.list += 1;
    const key = pointerKeyFromInput(pointer);
    const events = storedEvents.get(key) || [];
    const since = Number.isFinite(options?.since) ? Number(options.since) : null;
    if (since === null) {
      return events;
    }
    return events.filter((event) => {
      const createdAt = Number.isFinite(event?.created_at) ? Number(event.created_at) : 0;
      return createdAt >= since;
    });
  };

  const countVideoViewEvents = async (pointer) => {
    metrics.count += 1;
    const key = pointerKeyFromInput(pointer);
    if (customCountResults.has(key)) {
      const stored = customCountResults.get(key);
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        const totalValue = Number(stored.total);
        const normalizedTotal =
          Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : 0;
        const perRelay = Array.isArray(stored.perRelay)
          ? stored.perRelay.map((entry) =>
              entry && typeof entry === "object" ? { ...entry } : entry
            )
          : [];
        const result = {
          total: normalizedTotal,
          perRelay,
          best:
            stored.best && typeof stored.best === "object"
              ? { ...stored.best }
              : null,
        };
        if (stored.fallback) {
          result.fallback = true;
        }
        return result;
      }
      const numericTotal = Number(stored);
      const normalizedTotal =
        Number.isFinite(numericTotal) && numericTotal >= 0 ? numericTotal : 0;
      return { total: normalizedTotal, perRelay: [], best: null };
    }
    const events = storedEvents.get(key) || [];
    return { total: events.length, perRelay: [], best: null };
  };

  const subscribeVideoViewEvents = (pointer, options = {}) => {
    const key = pointerKeyFromInput(pointer);
    let handlers = subscribers.get(key);
    if (!handlers) {
      handlers = new Set();
      subscribers.set(key, handlers);
    }
    const handler = typeof options?.onEvent === "function" ? options.onEvent : null;
    if (handler) {
      handlers.add(handler);
    }
    return () => {
      if (handler && handlers) {
        handlers.delete(handler);
        if (!handlers.size) {
          subscribers.delete(key);
        }
      }
    };
  };

  const emit = (pointer, event) => {
    const key = pointerKeyFromInput(pointer);
    const handlers = subscribers.get(key);
    if (!handlers) {
      return;
    }
    for (const handler of Array.from(handlers)) {
      handler(event);
    }
  };

  const setEvents = (key, events) => {
    storedEvents.set(key, Array.isArray(events) ? events : []);
  };

  const setCountTotal = (key, total) => {
    if (
      typeof total === "object" &&
      total !== null &&
      !Array.isArray(total)
    ) {
      customCountResults.set(key, JSON.parse(JSON.stringify(total)));
    } else if (Number.isFinite(total)) {
      customCountResults.set(key, Number(total));
    } else {
      customCountResults.delete(key);
    }
  };

  const reset = () => {
    storedEvents.clear();
    customCountResults.clear();
    subscribers.clear();
    resetMetrics();
  };

  const subscriptionCount = (key) => {
    const handlers = subscribers.get(key);
    return handlers ? handlers.size : 0;
  };

  const getCallCounts = () => ({ list: metrics.list, count: metrics.count });

  return {
    listVideoViewEvents,
    countVideoViewEvents,
    subscribeVideoViewEvents,
    emit,
    setEvents,
    setCountTotal,
    reset,
    pointerKeyFromInput,
    subscriptionCount,
    resetMetrics,
    getCallCounts,
  };
}

const harness = createMockNostrHarness();

nostrClient.listVideoViewEvents = harness.listVideoViewEvents;
nostrClient.countVideoViewEvents = harness.countVideoViewEvents;
nostrClient.subscribeVideoViewEvents = harness.subscribeVideoViewEvents;

const {
  initViewCounter,
  subscribeToVideoViewCount,
  unsubscribeFromVideoViewCount,
  ingestLocalViewEvent,
} = await import("../js/viewCounter.js");

initViewCounter({ nostrClient });

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

async function testDedupesWithinWindow() {
  localStorage.clear();
  harness.reset();
  harness.resetMetrics();

  const pointer = { type: "e", value: "view-counter-dedupe" };
  const pointerKey = harness.pointerKeyFromInput(pointer);
  const base = Math.floor(Date.now() / 1000);
  const events = [
    { id: "evt-1", pubkey: "pub-dedupe", created_at: base },
    {
      id: "evt-2",
      pubkey: "pub-dedupe",
      created_at: base + Math.floor(VIEW_COUNT_DEDUPE_WINDOW_SECONDS / 2),
    },
  ];
  harness.setEvents(pointerKey, events);
  harness.setCountTotal(pointerKey, 1);

  const updates = [];
  const token = subscribeToVideoViewCount(pointer, (state) => {
    updates.push({ ...state });
  });
  try {
    await flushPromises();
    await flushPromises();
    const final = updates.at(-1);
    assert.ok(final, "expected at least one state update");
    assert.equal(
      final.total,
      1,
      "multiple events from the same pubkey within the dedupe window should count once"
    );
  } finally {
    unsubscribeFromVideoViewCount(pointer, token);
  }
}

async function testHydrationSkipsStaleEventsAndRollsOff() {
  localStorage.clear();
  harness.reset();
  harness.resetMetrics();

  const pointer = { type: "a", value: `${WATCH_HISTORY_KIND}:pk:test-hydrate` };
  const pointerKey = harness.pointerKeyFromInput(pointer);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const horizonSeconds = VIEW_COUNT_BACKFILL_MAX_DAYS * 86_400;

  const staleEvent = {
    id: "evt-stale",
    pubkey: "pub-hydrate",
    created_at: nowSeconds - horizonSeconds - 60,
  };
  const rolledOffEvent = {
    id: "evt-rolled-off",
    pubkey: "pub-hydrate",
    created_at: nowSeconds - VIEW_COUNT_DEDUPE_WINDOW_SECONDS - 10,
  };
  const recentEvent = {
    id: "evt-recent",
    pubkey: "pub-hydrate",
    created_at: nowSeconds - 5,
  };

  harness.setEvents(pointerKey, [staleEvent, rolledOffEvent, recentEvent]);
  harness.setCountTotal(pointerKey, 2);

  const updates = [];
  let token = subscribeToVideoViewCount(pointer, (state) => {
    updates.push({ ...state });
  });

  try {
    await flushPromises();
    await flushPromises();
    const final = updates.at(-1);
    assert.ok(final, "expected hydration state update");
    assert.equal(
      final.total,
      2,
      "hydration should ignore events beyond the backfill window and keep unique buckets"
    );
  } finally {
    unsubscribeFromVideoViewCount(pointer, token);
  }

  const futureEvent = {
    id: "evt-future",
    pubkey: "pub-hydrate",
    created_at: nowSeconds + VIEW_COUNT_DEDUPE_WINDOW_SECONDS + 5,
  };

  harness.setEvents(pointerKey, [rolledOffEvent, recentEvent, futureEvent]);
  harness.setCountTotal(pointerKey, 3);

  const secondUpdates = [];
  token = subscribeToVideoViewCount(pointer, (state) => {
    secondUpdates.push({ ...state });
  });
  try {
    await flushPromises();
    await flushPromises();
    const final = secondUpdates.at(-1);
    assert.ok(final, "expected updated hydration state");
    assert.equal(
      final.total,
      3,
      "events outside the dedupe window should contribute when hydrating fresh data"
    );
  } finally {
    unsubscribeFromVideoViewCount(pointer, token);
  }
}

async function testRelayCountAggregationUsesBestEstimate() {
  localStorage.clear();
  harness.reset();
  harness.resetMetrics();

  const pointer = { type: "e", value: "view-counter-multi-relay" };
  const pointerKey = harness.pointerKeyFromInput(pointer);

  harness.setEvents(pointerKey, []);
  harness.setCountTotal(pointerKey, {
    total: 5,
    best: { relay: "wss://relay.alpha", count: 5 },
    perRelay: [
      { url: "wss://relay.alpha", ok: true, count: 5 },
      { url: "wss://relay.beta", ok: true, count: 5 },
    ],
  });

  const updates = [];
  const token = subscribeToVideoViewCount(pointer, (state) => {
    updates.push({ ...state });
  });

  try {
    await flushPromises();
    await flushPromises();

    const final = updates.at(-1);
    assert.ok(final, "expected hydration update for aggregated relay counts");
    assert.equal(
      final.total,
      5,
      "identical relay COUNT responses should not be double-counted"
    );
  } finally {
    unsubscribeFromVideoViewCount(pointer, token);
  }
}

async function testLocalIngestNotifiesImmediately() {
  localStorage.clear();
  harness.reset();
  harness.resetMetrics();

  const pointer = { type: "e", value: "view-counter-local" };
  const pointerKey = harness.pointerKeyFromInput(pointer);
  harness.setEvents(pointerKey, []);
  harness.setCountTotal(pointerKey, 0);

  const updates = [];
  const token = subscribeToVideoViewCount(pointer, (state) => {
    updates.push({ ...state });
  });

  try {
    await flushPromises();
    const initial = updates.at(-1);
    assert.ok(initial, "expected initial state update");
    assert.equal(initial.total, 0, "initial total should start at zero");

    const localEvent = {
      id: "evt-local",
      pubkey: "pub-local",
      created_at: Math.floor(Date.now() / 1000),
    };

    ingestLocalViewEvent({ pointer, event: localEvent });

    const latest = updates.at(-1);
    assert.equal(
      latest.total,
      1,
      "local ingestion should immediately notify subscribers with incremented total"
    );
  } finally {
    unsubscribeFromVideoViewCount(pointer, token);
  }
}

async function testUnsubscribeStopsCallbacks() {
  localStorage.clear();
  harness.reset();
  harness.resetMetrics();

  const pointer = { type: "e", value: "view-counter-unsubscribe" };
  const pointerKey = harness.pointerKeyFromInput(pointer);
  harness.setEvents(pointerKey, []);
  harness.setCountTotal(pointerKey, 0);

  const updates = [];
  const token = subscribeToVideoViewCount(pointer, (state) => {
    updates.push({ ...state });
  });

  await flushPromises();
  const updatesBeforeUnsubscribe = updates.length;

  unsubscribeFromVideoViewCount(pointer, token);
  assert.equal(
    harness.subscriptionCount(pointerKey),
    0,
    "tearing down the final handler should close the live subscription"
  );

  harness.emit(pointerKey, {
    id: "evt-ignored",
    pubkey: "pub-unsubscribe",
    created_at: Math.floor(Date.now() / 1000),
  });

  assert.equal(
    updates.length,
    updatesBeforeUnsubscribe,
    "no handlers should fire once the final subscriber has been removed"
  );
}

async function testRecordVideoViewEmitsJsonPayload() {
  localStorage.clear();
  harness.reset();
  harness.resetMetrics();

  const pointer = {
    type: "a",
    value: `${WATCH_HISTORY_KIND}:pub:view-json`,
    relay: "wss://relay.example",
  };
  const createdAt = Math.floor(Date.now() / 1000);

  const originalPool = nostrClient.pool;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalEnsureSessionActor = nostrClient.ensureSessionActor;
  const originalSessionActor = nostrClient.sessionActor;
  const originalPubkey = nostrClient.pubkey;
  const originalWarn = console.warn;
  const originalNostrTools = window.NostrTools;

  const warnings = [];
  console.warn = (...args) => {
    warnings.push(
      args
        .map((value) => {
          if (typeof value === "string") {
            return value;
          }
          try {
            return JSON.stringify(value);
          } catch (error) {
            return String(value);
          }
        })
        .join(" ")
    );
  };

  window.NostrTools = {
    ...window.NostrTools,
    getEventHash: () => "event-hash-record", // deterministic stub for tests
    signEvent: () => "event-sig-record",
  };

  const publishCalls = [];
  nostrClient.pool = {
    publish(relayUrls, event) {
      publishCalls.push({ relays: relayUrls, event });
      return {
        on(type, handler) {
          if (type === "ok") {
            setTimeout(() => handler(), 0);
          }
          return this;
        },
      };
    },
  };
  nostrClient.relays = ["wss://relay.example"];
  nostrClient.ensureSessionActor = async () => {
    nostrClient.sessionActor = {
      pubkey: "pub-record-json",
      privateKey: "priv-record-json",
    };
    return "pub-record-json";
  };
  nostrClient.pubkey = "";


  try {
    const result = await nostrClient.recordVideoView(pointer, {
      created_at: createdAt,
    });

    assert.ok(result.ok, "recordVideoView should succeed with stubbed handlers");
    assert.equal(
      publishCalls.length,
      1,
      "publishViewEvent should be invoked once per recordVideoView call"
    );

    const emittedEvent = publishCalls[0]?.event || null;
    assert.ok(emittedEvent, "publishViewEvent should enqueue an event for relays");
    assert.equal(
      typeof emittedEvent.content,
      "string",
      "recordVideoView should provide serialized view content"
    );

    const payload = JSON.parse(emittedEvent.content);
    assert.deepEqual(
      payload,
      {
        target: {
          type: pointer.type,
          value: pointer.value,
          relay: pointer.relay,
        },
        created_at: createdAt,
      },
      "default view content should capture pointer metadata and timestamp"
    );

    assert.equal(
      result.event.content,
      emittedEvent.content,
      "serialized payload should persist on the emitted event"
    );
  } finally {
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    nostrClient.ensureSessionActor = originalEnsureSessionActor;
    nostrClient.sessionActor = originalSessionActor;
    nostrClient.pubkey = originalPubkey;
    console.warn = originalWarn;
    window.NostrTools = originalNostrTools;
  }

  const viewCounterWarnings = warnings.filter((message) =>
    message.includes("[viewCounter] Failed to ingest local view event")
  );
  assert.equal(
    viewCounterWarnings.length,
    0,
    "viewCounter.ingestLocalViewEvent should not reject JSON view payloads"
  );
}

// Cached totals older than VIEW_COUNT_CACHE_TTL_MS should be discarded and rehydrated from relays.
async function testHydrationRefreshesAfterCacheTtl() {
  harness.reset();
  harness.resetMetrics();

  assert.equal(
    localStorage.getItem(VIEW_COUNTER_STORAGE_KEY),
    null,
    "stale cache snapshot should be cleared when it exceeds the TTL"
  );

  const pointer = CACHE_TTL_TEST_POINTER;
  const pointerKey = harness.pointerKeyFromInput(pointer);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const events = [
    { id: "evt-ttl-1", pubkey: "pub-cache-ttl-1", created_at: nowSeconds - 15 },
    { id: "evt-ttl-2", pubkey: "pub-cache-ttl-2", created_at: nowSeconds - 5 },
  ];
  harness.setEvents(pointerKey, events);
  harness.setCountTotal(pointerKey, events.length);

  const updates = [];
  const token = subscribeToVideoViewCount(pointer, (state) => {
    updates.push({ ...state });
  });

  try {
    await flushPromises();
    await flushPromises();

    const initial = updates.at(0);
    assert.ok(initial, "expected initial state update for cache TTL test");
    assert.equal(
      initial.total,
      0,
      "expired cache entries should not hydrate subscribers with stale totals"
    );

    const { list: listCalls, count: countCalls } = harness.getCallCounts();
    assert.ok(
      listCalls > 0 || countCalls > 0,
      "hydration should fetch fresh data from relays once the cache TTL elapses"
    );

    const final = updates.at(-1);
    assert.ok(final, "expected final state update for cache TTL test");
    assert.equal(
      final.total,
      events.length,
      "totals should reflect fresh relay data after invalidating the expired cache"
    );
  } finally {
    unsubscribeFromVideoViewCount(pointer, token);
  }
}

await testHydrationRefreshesAfterCacheTtl();
await testDedupesWithinWindow();
await testHydrationSkipsStaleEventsAndRollsOff();
await testLocalIngestNotifiesImmediately();
await testUnsubscribeStopsCallbacks();
await testRelayCountAggregationUsesBestEstimate();
await testRecordVideoViewEmitsJsonPayload();

console.log("View counter tests completed successfully.");
