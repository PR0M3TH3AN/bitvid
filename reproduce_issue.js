
import { createExploreDiversitySorter } from "./js/feedEngine/sorters.js";

const buildItem = ({ id, score, tags }) => ({
  video: {
    id: String(id),
    tags: tags.map((tag) => ["t", tag]),
    rootCreatedAt: 1000,
  },
  metadata: {
    exploreScore: score,
  },
});

function generateData(count) {
  const items = [];
  const tagsPool = ["cats", "dogs", "birds", "nature", "funny", "news", "crypto", "bitcoin", "tech", "music"];
  for (let i = 0; i < count; i++) {
    const score = Math.random();
    // Assign 1-3 random tags
    const numTags = Math.floor(Math.random() * 3) + 1;
    const itemTags = [];
    for (let t = 0; t < numTags; t++) {
      itemTags.push(tagsPool[Math.floor(Math.random() * tagsPool.length)]);
    }
    items.push(buildItem({ id: i, score, tags: itemTags }));
  }
  return items;
}

async function runBenchmark() {
  const sorter = createExploreDiversitySorter({ lambda: 0.7 });
  const counts = [100, 500, 1000];

  for (const count of counts) {
    const items = generateData(count);
    const start = performance.now();
    sorter(items, { addWhy() {} });
    const end = performance.now();
    console.log(`Count: ${count}, Time: ${(end - start).toFixed(2)}ms`);
  }
}

runBenchmark();
