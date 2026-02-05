
import { createExploreDiversitySorter } from "../js/feedEngine/sorters.js";

const NUM_ITEMS = 1000; // Large enough to see the difference between N^3 and N^2
const TAG_POOL = ["cats", "dogs", "nostr", "bitcoin", "art", "music", "news", "tech", "coding", "python", "javascript", "react", "vue", "angular", "svelte", "deno", "node", "linux", "macos", "windows"];

function randomTags() {
  const count = Math.floor(Math.random() * 5) + 1;
  const tags = new Set();
  while (tags.size < count) {
    tags.add(TAG_POOL[Math.floor(Math.random() * TAG_POOL.length)]);
  }
  return Array.from(tags).map(t => ["t", t]);
}

function buildItem(i) {
  return {
    video: {
      id: `vid-${i}`,
      tags: randomTags(),
      rootCreatedAt: 1000 + i,
    },
    metadata: {
      exploreScore: Math.random(),
    },
  };
}

async function runBenchmark() {
  const items = [];
  for (let i = 0; i < NUM_ITEMS; i++) {
    items.push(buildItem(i));
  }

  const sorter = createExploreDiversitySorter({ lambda: 0.7 });

  console.log(`Sorting ${NUM_ITEMS} items...`);
  const start = performance.now();
  await sorter(items, { addWhy: () => {} });
  const end = performance.now();

  console.log(`Time: ${(end - start).toFixed(2)}ms`);
}

runBenchmark();
