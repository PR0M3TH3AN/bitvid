// Inbound NIP-71 ingest service. Scenario-style with a virtualized nostrClient
// (in-memory activeMap/allEvents + a fake subscription manager) and a fake
// accessControl. Asserts observable outcomes: foreign videos land in the active
// store and trigger a refresh; native videos are never clobbered; the relay
// subscription is scoped to the whitelist; and FEATURE_NIP71_INGEST off makes
// the service inert.

import assert from "node:assert/strict";
import test from "node:test";
import { createNip71IngestService } from "../js/services/nip71IngestService.js";

const KINDS = [21, 22, 34235, 34236];

function activeKey(video) {
  return video.videoRootId ? `ROOT:${video.videoRootId}` : `LEGACY:${video.id}`;
}

function makeHarness({ whitelistOn = false, whitelist = [] } = {}) {
  const activeMap = new Map();
  const allEvents = new Map();
  let capturedFilters = null;
  let onEvent = null;
  let closed = false;
  let whitelistListener = null;

  const manager = {
    subscribe(opts) {
      capturedFilters = opts.filters;
      onEvent = opts.onEvent;
      return {
        close() {
          closed = true;
        },
        update() {},
      };
    },
  };

  const emitted = [];
  const nostrClient = {
    activeMap,
    allEvents,
    getActiveKey: activeKey,
    getSubscriptionManager: () => manager,
  };
  const feedListeners = new Set();
  const nostrService = {
    emit(name, detail) {
      emitted.push({ name, detail });
    },
    on(name, fn) {
      if (name === "videos:updated") {
        feedListeners.add(fn);
      }
      return () => feedListeners.delete(fn);
    },
    getFilteredActiveVideos: () => Array.from(activeMap.values()),
  };
  const accessControl = {
    whitelistMode: () => whitelistOn,
    getWhitelistPubkeys: () => whitelist,
    onWhitelistChange: (fn) => {
      whitelistListener = fn;
      return () => {
        whitelistListener = null;
      };
    },
  };

  return {
    activeMap,
    allEvents,
    emitted,
    get capturedFilters() {
      return capturedFilters;
    },
    get closed() {
      return closed;
    },
    fireEvent: (e) => onEvent?.(e),
    triggerWhitelistChange: () => whitelistListener?.(),
    triggerFeedReady: () => feedListeners.forEach((fn) => fn({})),
    nostrClient,
    nostrService,
    accessControl,
  };
}

function foreignEvent(overrides = {}) {
  return {
    id: overrides.id || "evt-1",
    pubkey: overrides.pubkey || "author-1",
    kind: overrides.kind || 21,
    created_at: overrides.created_at ?? 1000,
    content: "desc",
    tags: overrides.tags || [
      ["title", overrides.title || "Foreign"],
      ["imeta", `url ${overrides.url || "https://e/v.mp4"}`, "m video/mp4"],
    ],
  };
}

function makeService(harness, extra = {}) {
  return createNip71IngestService({
    nostrClient: harness.nostrClient,
    nostrService: harness.nostrService,
    accessControl: harness.accessControl,
    featureEnabled: true,
    flushDelayMs: 0,
    // Disable the hydration retry by default so each test is deterministic and
    // leaves no dangling timers; the retry behavior is covered explicitly below.
    maxOpenAttempts: 0,
    // Emit refreshes synchronously (no throttle timer) for deterministic tests.
    refreshThrottleMs: 0,
    ...extra,
  });
}

test("ingests a foreign NIP-71 video into the active store and signals a refresh", () => {
  const h = makeHarness();
  const svc = makeService(h);
  assert.equal(svc.start(), true);

  h.fireEvent(foreignEvent({ id: "e1", title: "Hello" }));
  const injected = svc.flush();

  assert.equal(injected, 1);
  const stored = h.activeMap.get("ROOT:e1");
  assert.ok(stored, "video present in activeMap");
  assert.equal(stored.title, "Hello");
  assert.equal(stored.source, "nip71-ingest");
  assert.ok(h.allEvents.has("e1"), "raw video cached in allEvents");

  const refresh = h.emitted.find((e) => e.name === "videos:updated");
  assert.ok(refresh, "emits videos:updated");
  assert.equal(refresh.detail.reason, "nip71-ingest");
});

test("never clobbers a native bitvid video sharing the same root", () => {
  const h = makeHarness();
  const native = { id: "native", videoRootId: "shared", source: "nostr", created_at: 500, title: "Native" };
  h.activeMap.set("ROOT:shared", native);

  const svc = makeService(h);
  svc.start();
  h.fireEvent(foreignEvent({ id: "foreign", created_at: 9999, tags: [["d", "shared"], ["title", "Foreign"], ["imeta", "url https://e/v.mp4", "m video/mp4"], ], kind: 34235 }));
  const injected = svc.flush();

  assert.equal(injected, 0, "native video is not overwritten even by a newer foreign event");
  assert.equal(h.activeMap.get("ROOT:shared"), native);
});

test("among ingested videos for one root, newest wins", () => {
  const h = makeHarness();
  const svc = makeService(h);
  svc.start();

  h.fireEvent(foreignEvent({ id: "old", kind: 34235, created_at: 100, tags: [["d", "r"], ["title", "Old"], ["imeta", "url https://e/v1.mp4", "m video/mp4"]] }));
  svc.flush();
  h.fireEvent(foreignEvent({ id: "new", kind: 34235, created_at: 200, tags: [["d", "r"], ["title", "New"], ["imeta", "url https://e/v2.mp4", "m video/mp4"]] }));
  svc.flush();

  assert.equal(h.activeMap.get("ROOT:r").title, "New");

  // An older event for the same root must not resurrect.
  h.fireEvent(foreignEvent({ id: "older", kind: 34235, created_at: 50, tags: [["d", "r"], ["title", "Older"], ["imeta", "url https://e/v3.mp4", "m video/mp4"]] }));
  svc.flush();
  assert.equal(h.activeMap.get("ROOT:r").title, "New", "older event does not override newer");
});

test("scopes the relay subscription to whitelisted authors when whitelist mode is on", () => {
  const h = makeHarness({ whitelistOn: true, whitelist: ["aa", "bb"] });
  const svc = makeService(h);
  assert.equal(svc.start(), true);

  const filters = h.capturedFilters;
  assert.ok(Array.isArray(filters) && filters.length === 1);
  assert.deepEqual(filters[0].kinds.slice().sort((a, b) => a - b), KINDS);
  assert.deepEqual(filters[0].authors, ["aa", "bb"], "subscribes only to whitelisted authors");
});

test("with whitelist on but no authors, does not open a subscription (nothing to ingest)", () => {
  const h = makeHarness({ whitelistOn: true, whitelist: [] });
  const svc = makeService(h);
  assert.equal(svc.start(), false, "no subscription opened");
  assert.equal(h.capturedFilters, null);
});

test("opens an unscoped (capped) subscription when whitelist mode is off", () => {
  const h = makeHarness({ whitelistOn: false });
  const svc = makeService(h);
  svc.start();
  const filters = h.capturedFilters;
  assert.ok(filters[0].authors === undefined, "no author scope when whitelist disabled");
  assert.ok(Number.isFinite(filters[0].limit), "still capped by a limit");
});

test("retries until the whitelist hydrates, then subscribes (no missed-emit race)", async () => {
  // Simulates the real startup race: whitelist mode is on but the hex author
  // set isn't populated yet at start(), and no change event is emitted.
  const h = makeHarness({ whitelistOn: true, whitelist: [] });
  const svc = makeService(h, { maxOpenAttempts: 5, openRetryDelayMs: 5 });
  assert.equal(svc.start(), false, "cannot open yet — authors not hydrated");
  assert.equal(h.capturedFilters, null);

  // Authors hydrate a moment later, WITHOUT firing onWhitelistChange.
  h.accessControl.getWhitelistPubkeys = () => ["aa", "bb"];

  // Wait past a retry tick.
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.ok(h.capturedFilters, "retry opened the subscription after hydration");
  assert.deepEqual(h.capturedFilters[0].authors, ["aa", "bb"]);
  svc.stop();
});

test("re-subscribes when the whitelist changes", () => {
  const h = makeHarness({ whitelistOn: true, whitelist: ["aa"] });
  const svc = makeService(h);
  svc.start();
  assert.deepEqual(h.capturedFilters[0].authors, ["aa"]);

  // Whitelist grows; the access-control change fires.
  h.accessControl.getWhitelistPubkeys = () => ["aa", "cc"];
  h.triggerWhitelistChange();
  assert.deepEqual(h.capturedFilters[0].authors, ["aa", "cc"], "subscription re-scoped after change");
});

test("startWhenFeedReady defers subscription until the native feed renders", () => {
  const h = makeHarness({ whitelistOn: true, whitelist: ["aa"] });
  const svc = makeService(h, { feedReadyFallbackMs: 100000 });

  assert.equal(svc.startWhenFeedReady(), true);
  assert.equal(h.capturedFilters, null, "does not subscribe during cold-start");

  // Native feed renders -> first videos:updated -> ingest starts now.
  h.triggerFeedReady();
  assert.ok(h.capturedFilters, "subscribes once the feed is ready");
  assert.deepEqual(h.capturedFilters[0].authors, ["aa"]);
  svc.stop();
});

test("startWhenFeedReady falls back to starting if the feed never emits", async () => {
  const h = makeHarness({ whitelistOn: true, whitelist: ["aa"] });
  const svc = makeService(h, { feedReadyFallbackMs: 5 });
  svc.startWhenFeedReady();
  assert.equal(h.capturedFilters, null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(h.capturedFilters, "fallback timer started ingest");
  svc.stop();
});

test("coalesces refresh signals so an event burst can't storm the feed", () => {
  const h = makeHarness();
  const svc = makeService(h, { refreshThrottleMs: 10000 });
  svc.start();

  h.fireEvent(foreignEvent({ id: "a", kind: 34235, tags: [["d", "ra"], ["title", "A"], ["imeta", "url https://e/a.mp4", "m video/mp4"]] }));
  svc.flush();
  h.fireEvent(foreignEvent({ id: "b", kind: 34235, tags: [["d", "rb"], ["title", "B"], ["imeta", "url https://e/b.mp4", "m video/mp4"]] }));
  svc.flush();

  const refreshes = h.emitted.filter((e) => e.name === "videos:updated");
  assert.equal(refreshes.length, 1, "only one immediate refresh within the throttle window");
  // Both videos still landed in the store regardless of the throttled signal.
  assert.ok(h.activeMap.has("ROOT:ra") && h.activeMap.has("ROOT:rb"));
  svc.stop();
});

test("FEATURE_NIP71_INGEST off makes the service completely inert", () => {
  const h = makeHarness();
  const svc = createNip71IngestService({
    nostrClient: h.nostrClient,
    nostrService: h.nostrService,
    accessControl: h.accessControl,
    featureEnabled: false,
    flushDelayMs: 0,
  });
  assert.equal(svc.isAvailable(), false);
  assert.equal(svc.start(), false);
  assert.equal(h.capturedFilters, null, "no relay subscription when ingest is disabled");
});

test("stop() closes the subscription and unhooks the whitelist listener", () => {
  const h = makeHarness({ whitelistOn: true, whitelist: ["aa"] });
  const svc = makeService(h);
  svc.start();
  svc.stop();
  assert.equal(h.closed, true, "subscription closed");
  // After stop, a whitelist change must not reopen anything.
  h.triggerWhitelistChange();
});
