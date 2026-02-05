
import { createFeedEngine } from "../js/feedEngine/index.js";
import { performance } from "perf_hooks";

// Mock logger
const logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

// Polyfill localStorage to silence errors
if (typeof globalThis.localStorage === "undefined") {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

async function runBenchmark() {
  const engine = createFeedEngine({ logger });
  const feedName = "bench-feed";

  // Create items
  const itemCount = 100000;
  const items = [];
  for (let i = 0; i < itemCount; i++) {
    items.push({
      video: { id: `v${i}`, created_at: Date.now() },
      metadata: { some: "data" },
    });
  }

  // Define stages
  const stages = [];

  // 10 stages that return null (no change) - STRICT PASS THROUGH
  for (let i = 0; i < 10; i++) {
    stages.push(async (items) => {
      return null;
    });
  }

  // 10 stages that return the same items array (identity) - STRICT PASS THROUGH
  for (let i = 0; i < 10; i++) {
    stages.push(async (items) => {
      return items;
    });
  }

  engine.registerFeed(feedName, {
    source: async () => [...items],
    stages: stages,
  });

  console.log(`Starting benchmark with ${itemCount} items and ${stages.length} stages...`);

  const iterations = 50;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await engine.runFeed(feedName);
    if (i % 5 === 0) process.stdout.write(".");
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;

  console.log("\n");
  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per run: ${avgTime.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
