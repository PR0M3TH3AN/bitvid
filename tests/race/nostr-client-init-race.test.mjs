import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { NostrClient } from "../../js/nostr/client.js";

// Mock global.window if missing
if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("NostrClient initialization race condition: concurrent init() calls", async (t) => {
  const client = new NostrClient();
  const relay = "wss://race.example.invalid";
  client.relays = [relay];
  const poolEntered = deferred();
  const releasePool = deferred();
  let poolReady = false;
  let subscription;
  let initPromiseA;
  const subscriptions = [];

  // Teardown runs even if an assertion fails before init or subscription setup.
  t.after(async () => {
    releasePool.resolve();
    try {
      await initPromiseA;
    } finally {
      subscription?.unsub();
      client.resetRelayReconnectState();
    }
  });

  // Virtualize the real pool transport boundary; keep init, L1 subscription
  // management and the returned feed subscription's cleanup real.
  const fakePool = {
    sub: (relays, filters) => {
      assert.equal(poolReady, true, "Subscription must use the initialized pool");
      const record = { relays, filters, closed: 0 };
      subscriptions.push(record);
      return {
        on: () => {},
        unsub: () => { record.closed += 1; },
      };
    },
    get: async () => null,
    list: async () => [],
    ensureRelay: async () => {},
  };
  t.mock.method(client.connectionManager, "ensurePool", async () => {
    poolEntered.resolve();
    await releasePool.promise;
    client.connectionManager.pool = fakePool;
    poolReady = true;
    return fakePool;
  });
  // An empty result means connection failure and starts real reconnect timers.
  // Model a successful connection at the manager boundary used by init/retry.
  t.mock.method(client.connectionManager, "connectToRelays", async () => [
    { url: relay, success: true },
  ]);
  t.mock.method(client, "restoreLocalData", async () => true);
  t.mock.method(client, "scheduleStoredRemoteSignerRestore", async () => {});

  initPromiseA = client.init();
  const initPromiseB = client.init();
  assert.ok(initPromiseB instanceof Promise, "Second init() call should return a Promise, not undefined");

  await poolEntered.promise;
  let secondInitSettled = false;
  void initPromiseB.then(() => { secondInitSettled = true; });
  await Promise.resolve();
  assert.equal(secondInitSettled, false, "Second caller must wait for pool initialization");

  releasePool.resolve();
  await initPromiseB;
  assert.equal(poolReady, true, "Pool should be ready after awaiting second init() call");
  await initPromiseA;
  assert.equal(client.connectionManager.relayReconnectTimer, null, "Successful fixture initialization must not schedule relay retries");

  try {
    subscription = client.subscribeVideos(() => {});
  } catch (e) {
    assert.fail("Should be able to subscribe after awaiting init()");
  }
  assert.equal(subscriptions.length, 1, "Post-init feed subscription must reach the pool transport");
  assert.ok(subscriptions[0].relays.length > 0, "Feed must subscribe to a nonempty relay set");
  assert.ok(subscriptions[0].filters.some((filter) =>
    filter.kinds.includes(30078) && filter["#t"].includes("video")),
  "Feed must request video events");

  subscription.unsub();
  assert.equal(subscriptions[0].closed, 1, "Feed cleanup must close its transport subscription");
  subscription.unsub();
  assert.equal(subscriptions[0].closed, 1, "Feed cleanup must be idempotent");
});
