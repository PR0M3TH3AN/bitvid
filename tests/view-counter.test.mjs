// Run with: node tests/view-counter.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const {
  VIEW_COUNT_DEDUPE_WINDOW_SECONDS,
  VIEW_COUNT_BACKFILL_MAX_DAYS,
} = await import("../js/config.js");

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

const { nostrClient } = await import("../js/nostr.js");

function createMockNostrHarness() {
  const storedEvents = new Map();
  const customTotals = new Map();
  const subscribers = new Map();

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
    const key = pointerKeyFromInput(pointer);
    if (customTotals.has(key)) {
      return { total: customTotals.get(key) };
    }
    const events = storedEvents.get(key) || [];
    return { total: events.length };
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
    if (Number.isFinite(total)) {
      customTotals.set(key, Number(total));
    } else {
      customTotals.delete(key);
    }
  };

  const reset = () => {
    storedEvents.clear();
    customTotals.clear();
    subscribers.clear();
  };

  const subscriptionCount = (key) => {
    const handlers = subscribers.get(key);
    return handlers ? handlers.size : 0;
  };

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

  const pointer = { type: "a", value: "30078:pk:test-hydrate" };
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

async function testLocalIngestNotifiesImmediately() {
  localStorage.clear();
  harness.reset();

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

await testDedupesWithinWindow();
await testHydrationSkipsStaleEventsAndRollsOff();
await testLocalIngestNotifiesImmediately();
await testUnsubscribeStopsCallbacks();

console.log("View counter tests completed successfully.");
