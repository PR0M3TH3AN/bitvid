import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import ProfileModalController from "../js/ui/profileModalController.js";
import { createWatchHistoryRenderer } from "../js/historyView.js";
import WatchHistoryController from "../js/ui/watchHistoryController.js";
import watchHistoryService from "../js/watchHistoryService.js";
import { nostrClient } from "../js/nostrClientFacade.js";
import { getApplication, setApplication } from "../js/applicationContext.js";

const markup = await readFile(
  new URL("../components/profile-modal.html", import.meta.url),
  "utf8"
);
const flush = () => new Promise((resolve) => setImmediate(resolve));
let actorSequence = 100;

async function fixture(t, { synced = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${markup}</body>`, {
    url: "https://example.invalid"
  });
  const globals = [
    "window",
    "document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLImageElement",
    "HTMLButtonElement",
    "Node",
    "Event",
    "CustomEvent",
    "MutationObserver",
    "localStorage",
    "fetch",
    "WebSocket",
    "IntersectionObserver"
  ];
  const savedGlobals = globals.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ]);
  for (const key of globals.slice(0, 10)) {
    globalThis[key] =
      key === "window"
        ? dom.window
        : key === "document"
          ? dom.window.document
          : dom.window[key];
  }
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  let networkAttempts = 0;
  globalThis.fetch = dom.window.fetch = () => {
    networkAttempts++;
    throw new Error("Unexpected history fixture network request");
  };
  globalThis.WebSocket = dom.window.WebSocket = class {
    constructor() {
      networkAttempts++;
      throw new Error("Unexpected history fixture socket");
    }
  };

  const actor = (++actorSequence).toString(16).padStart(64, "0");
  const clientKeys = [
    "pubkey",
    "sessionActor",
    "updateWatchHistoryList",
    "resolveWatchHistory",
    "getWatchHistoryFingerprint"
  ];
  const savedClient = clientKeys.map((key) => [key, nostrClient[key]]);
  const previousApp = getApplication();
  const seed = [
    { type: "e", value: "profile-first", watchedAt: 1700000000 },
    { type: "e", value: "profile-keep", watchedAt: 1700000001 }
  ];
  let publishedItems = structuredClone(seed);
  const publishes = [],
    errors = [],
    noops = [];
  nostrClient.pubkey = synced ? actor : "";
  nostrClient.sessionActor = synced ? null : { pubkey: actor };
  // Publish/read IO twin honors merge vs replace so a lost replace flag cannot
  // look successful merely because the fake publisher always replaces its list.
  nostrClient.updateWatchHistoryList = async (items, options = {}) => {
    publishes.push({ items: structuredClone(items), options: { ...options } });
    publishedItems =
      options.replace === true
        ? structuredClone(items)
        : [
            ...new Map(
              [...publishedItems, ...items].map((item) => [
                `${item.type}:${item.value}`,
                structuredClone(item)
              ])
            ).values()
          ];
    return { ok: true, items: structuredClone(publishedItems) };
  };
  nostrClient.resolveWatchHistory = async () => structuredClone(publishedItems);
  nostrClient.getWatchHistoryFingerprint = async () =>
    JSON.stringify(publishedItems);
  const historyController = new WatchHistoryController({
    watchHistoryService,
    nostrClient,
    getActivePubkey: () => actor,
    showError: (message) => errors.push(message)
  });
  setApplication({
    watchHistoryController: historyController,
    showSuccess() {},
    showError: (message) => errors.push(message),
    isAuthorBlocked: () => false,
    getHashtagPreferences: () => ({ interests: [], disinterests: [] })
  });
  let renderer;
  const profile = new ProfileModalController({
    services: {
      relayManager: {},
      userBlocks: {},
      accessControl: {},
      nostrClient
    },
    callbacks: {
      onHistoryReady(payload) {
        noops.push(payload);
        return null;
      }
    },
    createWatchHistoryRenderer: (config) =>
      createWatchHistoryRenderer({
        ...config,
        getActor: () => actor,
        fetchHistory: async () => ({
          items: await watchHistoryService.loadLatest(actor, {
            allowStale: false,
            forceRefresh: true
          })
        })
      })
  });
  profile.profileModalPanel = document.body;
  profile.profileModalRoot = document.body;
  t.after(() => {
    try {
      renderer?.destroy();
      watchHistoryService.resetProgress(actor);
      assert.deepEqual(
        watchHistoryService.getQueuedPointers(actor),
        [],
        "fixture must release its local queue"
      );
    } finally {
      setApplication(previousApp);
      for (const [key, value] of savedClient) nostrClient[key] = value;
      dom.window.close();
      for (const [key, descriptor] of savedGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    }
    assert.equal(
      networkAttempts,
      0,
      "no network or relay activity is permitted"
    );
  });
  if (!synced)
    await watchHistoryService.snapshot(seed, { actor, replace: true });
  renderer = profile.ensureProfileHistoryRenderer();
  await renderer.init({ actor, force: true });
  const values = () =>
    renderer
      .getState()
      .items.map((item) => item.pointer.value)
      .sort();
  const persisted = async () =>
    (
      await watchHistoryService.loadLatest(actor, {
        allowStale: false,
        forceRefresh: true
      })
    )
      .map((item) => item.value)
      .sort();
  const grid = document.querySelector("#profileHistoryGrid");
  assert.deepEqual(values(), ["profile-first", "profile-keep"]);
  assert.equal(grid.querySelectorAll("[data-history-card]").length, 2);

  async function remove(value) {
    // Observe completion of the actual method invoked by the real DOM listener;
    // no remove/controller/service implementation is replaced by this wrapper.
    let pending;
    const original = renderer.handleRemove.bind(renderer);
    renderer.handleRemove = (...args) => {
      pending = original(...args);
      return pending;
    };
    try {
      const trigger = grid.querySelector(
        `[data-history-action="remove"][data-pointer-key="e:${value}"]`
      );
      assert.ok(trigger, "profile pane must render an actual removal control");
      trigger.click();
      assert.ok(
        pending instanceof Promise,
        "DOM click must invoke renderer removal"
      );
      await pending;
      await flush();
    } finally {
      renderer.handleRemove = original;
    }
  }
  async function recreate() {
    renderer.destroy();
    profile.profileHistoryRenderer = null;
    renderer = profile.ensureProfileHistoryRenderer();
    await renderer.init({ actor, force: true });
    await flush();
  }
  return {
    actor,
    profile,
    values,
    persisted,
    remove,
    recreate,
    grid,
    publishes,
    errors,
    noops
  };
}

test("real profile local removal persists through recreation and removing the last item", async (t) => {
  const f = await fixture(t);
  await f.remove("profile-first");
  assert.deepEqual(await f.persisted(), ["profile-keep"]);
  assert.deepEqual(f.values(), ["profile-keep"]);
  assert.equal(
    f.grid.querySelector('[data-pointer-key="e:profile-first"]'),
    null
  );
  await f.recreate();
  assert.deepEqual(f.values(), ["profile-keep"]);
  await f.remove("profile-keep");
  assert.deepEqual(await f.persisted(), []);
  await f.recreate();
  assert.deepEqual(f.values(), []);
  assert.equal(f.grid.querySelectorAll("[data-history-card]").length, 0);
  assert.equal(f.publishes.length, 0, "local-only removal must never publish");
  assert.equal(
    f.noops.length,
    0,
    "historical onHistoryReady no-op must not handle removal"
  );
  assert.deepEqual(f.errors, []);
});

test("real profile Clear local history empties the queue and remains empty after recreation", async (t) => {
  const f = await fixture(t);
  const clear = document.querySelector("#profileHistoryClear");
  assert.ok(clear);
  clear.click();
  await flush();
  assert.deepEqual(await f.persisted(), []);
  assert.deepEqual(f.values(), []);
  await f.recreate();
  assert.deepEqual(f.values(), []);
  assert.equal(f.grid.querySelectorAll("[data-history-card]").length, 0);
  assert.equal(f.publishes.length, 0);
  assert.deepEqual(f.errors, []);
});

test("real profile synced removal publishes reduced replacement and empty final replacement through fake IO", async (t) => {
  const f = await fixture(t, { synced: true });
  await f.remove("profile-first");
  assert.deepEqual(await f.persisted(), ["profile-keep"]);
  assert.ok(f.publishes.length > 0, "synced removal must reach publish IO");
  for (const { items, options } of f.publishes) {
    assert.deepEqual(
      items.map((item) => item.value),
      ["profile-keep"]
    );
    assert.equal(options.replace, true);
    assert.equal(options.actorPubkey, f.actor);
  }
  const firstPublishCount = f.publishes.length;
  await f.recreate();
  assert.deepEqual(f.values(), ["profile-keep"]);
  await f.remove("profile-keep");
  assert.deepEqual(await f.persisted(), []);
  assert.ok(
    f.publishes.length > firstPublishCount,
    "last removal must publish an empty replacement"
  );
  for (const { items, options } of f.publishes.slice(firstPublishCount)) {
    assert.deepEqual(items, []);
    assert.equal(options.replace, true);
    assert.equal(options.actorPubkey, f.actor);
  }
  await f.recreate();
  assert.deepEqual(f.values(), []);
  assert.equal(f.grid.querySelectorAll("[data-history-card]").length, 0);
  assert.equal(f.noops.length, 0);
  assert.deepEqual(f.errors, []);
});
