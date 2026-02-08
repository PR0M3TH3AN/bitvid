// benchmarks/kids_scoring_bench.js
import { createKidsScorerStage } from "../js/feedEngine/kidsScoring.js";
import { performance } from "perf_hooks";

async function runBenchmark() {
  const itemCount = 200000;
  const items = [];

  // Create mock items with diverse data to exercise different paths
  for (let i = 0; i < itemCount; i++) {
    items.push({
      video: {
        id: `v${i}`,
        pubkey: `pubkey${i % 100}`,
        duration: 300 + (i % 600), // 5 to 15 minutes
        tags: [
          ["t", "kids"],
          ["t", "learning"],
          ["t", i % 2 === 0 ? "preschool" : "science"],
        ],
        viewCount: i * 10,
        created_at: Date.now() / 1000 - (i % 10000),
        moderation: { trustedCount: i % 5 },
      },
      metadata: {},
    });
  }

  const context = {
    runtime: {
      ageGroup: "preschool",
      trustedAuthors: ["pubkey1", "pubkey2"],
    },
    addWhy: () => {}, // Mock addWhy
  };

  const scorer = createKidsScorerStage();

  console.log(`Starting kids scoring benchmark with ${itemCount} items...`);

  // Warmup
  await scorer([...items.slice(0, 1000)], context);

  const iterations = 100;
  let totalTime = 0;

  for (let i = 0; i < iterations; i++) {
    // Reset metadata for each run to be cleaner
    items.forEach(item => item.metadata = {});

    const start = performance.now();
    await scorer(items, context);
    const end = performance.now();
    totalTime += (end - start);

    if (i % 5 === 0) process.stdout.write(".");
  }

  const avgTime = totalTime / iterations;
  console.log(`\nAverage time per run: ${avgTime.toFixed(4)}ms`);
}

runBenchmark().catch(console.error);
