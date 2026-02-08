
import { createChronologicalSorter } from "../js/feedEngine/sorters.js";
import { performance } from "perf_hooks";

const NUM_ITEMS = 100000;

function buildItem(i) {
  return {
    video: {
      id: `vid-${i}`,
      rootCreatedAt: 1000 + i,
    },
    metadata: {},
  };
}

async function runBenchmark() {
  const items = [];
  for (let i = 0; i < NUM_ITEMS; i++) {
    items.push(buildItem(i));
  }

  // Mock context with hooks to trigger the candidate lookup loop
  const context = {
    hooks: {
      timestamps: {
        getKnownVideoPostedAt: () => null,
        getKnownPostedAt: () => null,
        getVideoPostedAt: () => null,
        resolveVideoPostedAt: () => null,
      }
    }
  };

  const sorter = createChronologicalSorter({ direction: "desc" });

  console.log(`Sorting ${NUM_ITEMS} items with hooks...`);

  const iterations = 20; // Increased iterations for stability
  let totalTime = 0;

  // Warmup
  for (let i = 0; i < 5; i++) sorter(items, context);

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    sorter(items, context);
    const end = performance.now();
    totalTime += (end - start);
    if (i % 5 === 0) process.stdout.write(".");
  }

  const avgTime = totalTime / iterations;
  console.log("\n");
  console.log(`Average time per sort: ${avgTime.toFixed(2)}ms`);
}

runBenchmark();
