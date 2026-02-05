
import { createWatchHistoryManager } from "../js/nostr/watchHistory.js";
import { performance } from "perf_hooks";

async function runBenchmark() {
  console.log("Starting benchmark for publishRecords...");

  const manager = createWatchHistoryManager({});

  // Mock publishMonthRecord to simulate latency
  const LATENCY_MS = 100;
  manager.publishMonthRecord = async (month, items, options) => {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    return { ok: true, month };
  };

  // Create a record set with 10 months
  const records = {};
  for (let i = 0; i < 10; i++) {
    const month = `2023-${String(i + 1).padStart(2, "0")}`;
    records[month] = [{ type: "e", value: `item-${i}` }];
  }

  const start = performance.now();
  await manager.publishRecords(records, { source: "benchmark" });
  const end = performance.now();

  const duration = end - start;
  console.log(`Processed 10 months in ${duration.toFixed(2)}ms`);
  console.log(`Expected serial time: ~${10 * LATENCY_MS}ms`);

  // Simple assertion
  if (duration < 10 * LATENCY_MS * 0.8) {
     console.log("RESULT: Parallel execution detected (pass)");
  } else {
     console.log("RESULT: Serial execution detected (baseline)");
  }
}

runBenchmark().catch(console.error);
