import { createWatchHistoryManager } from "../js/nostr/watchHistory.js";
import { performance } from "node:perf_hooks";

// Mock globals if needed (browser specific stuff)
if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}
if (!globalThis.devLogger) {
    globalThis.devLogger = { info: () => {}, warn: () => {}, error: () => {} };
}

async function benchmark() {
  const manager = createWatchHistoryManager({});

  // Mock publishMonthRecord to simulate latency
  const LATENCY = 100; // 100ms per request
  manager.publishMonthRecord = async (month, items, options) => {
    await new Promise(resolve => setTimeout(resolve, LATENCY));
    return { ok: true, month };
  };

  // Generate data for 10 months
  const records = {};
  for (let i = 0; i < 10; i++) {
    const month = `2023-${String(i + 1).padStart(2, '0')}`;
    records[month] = [{ type: 'e', value: `item-${i}`, watchedAt: Date.now() }];
  }

  console.log("Starting benchmark with 10 months of records (simulated 100ms latency each)...");
  const start = performance.now();
  await manager.publishRecords(records, {});
  const end = performance.now();

  const duration = end - start;
  console.log(`Duration: ${duration.toFixed(2)}ms`);

  if (duration >= 1000) {
      console.log("Result: Serial execution detected (Expected ~1000ms)");
  } else if (duration <= 500) {
      console.log("Result: Parallel execution detected (Expected ~400ms)");
  } else {
      console.log("Result: Inconclusive");
  }
}

benchmark().catch(console.error);
