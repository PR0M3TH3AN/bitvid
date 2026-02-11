import { NostrClient } from "../js/nostr/client.js";
import { pMap } from "../js/utils/asyncUtils.js";

// Mock globals for Node environment
globalThis.WebSocket = class MockWebSocket {};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};
globalThis.indexedDB = {
  open: () => ({
    result: {
      createObjectStore: () => {},
      transaction: () => ({ objectStore: () => ({ get: () => {}, put: () => {} }) })
    },
    onupgradeneeded: () => {},
    onsuccess: () => {}
  })
};

// Mock dependencies
class MockPool {
  constructor() {
    this.activeRequests = 0;
    this.maxConcurrent = 0;
  }

  async list(relays, filters) {
    this.activeRequests++;
    if (this.activeRequests > this.maxConcurrent) {
      this.maxConcurrent = this.activeRequests;
    }

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 50));

    this.activeRequests--;
    return [];
  }

  async get(relays, filter) {
    return null;
  }
}

async function runBenchmark() {
  console.log("Starting Relay Concurrency Benchmark...");

  const client = new NostrClient();
  const mockPool = new MockPool();
  client.pool = mockPool;

  // Simulate 20 relays
  const relays = Array.from({ length: 20 }, (_, i) => `wss://relay${i}.example.com`);
  client.relays = relays;
  client.readRelays = relays;

  // 1. Benchmark fetchAndCacheNip71Metadata
  console.log("\nTesting fetchAndCacheNip71Metadata with 20 relays...");
  mockPool.maxConcurrent = 0;

  const pointerMap = new Map();
  pointerMap.set("e:123", { type: "e", value: "123", relays: [] });

  await client.fetchAndCacheNip71Metadata(pointerMap, ["e:123"]);

  console.log(`Max concurrent requests: ${mockPool.maxConcurrent}`);
  if (mockPool.maxConcurrent > 5) {
    console.log("FAIL: Concurrency is unbounded!");
  } else {
    console.log("PASS: Concurrency is bounded.");
  }

  // 2. Benchmark hydrateVideoHistory
  console.log("\nTesting hydrateVideoHistory with 20 relays...");
  mockPool.maxConcurrent = 0;

  const video = {
    id: "v1",
    videoRootId: "root1",
    tags: [["d", "d1"]],
    pubkey: "pub1"
  };

  // Prime local cache to force relay fetch
  // We need to simulate that we found <= 1 version locally
  client.allEvents.set("v1", video);

  await client.hydrateVideoHistory(video);

  console.log(`Max concurrent requests: ${mockPool.maxConcurrent}`);
    if (mockPool.maxConcurrent > 5) {
    console.log("FAIL: Concurrency is unbounded!");
  } else {
    console.log("PASS: Concurrency is bounded.");
  }
}

runBenchmark().catch(console.error);
