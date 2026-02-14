
import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { NostrClient } from "../../js/nostr/client.js";

// Mock global.window if missing
if (typeof globalThis.window === "undefined") {
    globalThis.window = {};
}

test("NostrClient initialization race condition: concurrent init() calls", async (t) => {
  const client = new NostrClient();

  // Mock ensurePool to simulate a slow initialization
  let poolReady = false;

  // We mock connectionManager.ensurePool via the instance
  client.connectionManager.ensurePool = async () => {
    // Delay to simulate async work
    await new Promise(resolve => setTimeout(resolve, 50));

    // Create a fake pool
    const fakePool = {
      sub: () => ({ on: () => {}, unsub: () => {} }),
      get: async () => null,
      list: async () => [],
      ensureRelay: async () => {},
    };
    client.connectionManager.pool = fakePool;
    poolReady = true;
    return fakePool;
  };

  // Also mock connectToRelays to avoid network calls
  client.connectToRelays = async () => [];
  client.restoreLocalData = async () => true;

  // ACT: Call init() (Caller A)
  const initPromiseA = client.init();

  // ACT: Call init() again immediately (Caller B)
  const initPromiseB = client.init();

  // ASSERT: Caller B should receive a promise that resolves when initialization is complete.
  // In the buggy version, initPromiseB is undefined because it returns early.
  assert.ok(initPromiseB instanceof Promise, "Second init() call should return a Promise, not undefined");

  await initPromiseB;

  assert.equal(poolReady, true, "Pool should be ready after awaiting second init() call");

  // Verify we can use the client
  try {
    client.subscribeVideos(() => {});
  } catch (e) {
    assert.fail("Should be able to subscribe after awaiting init()");
  }
});
