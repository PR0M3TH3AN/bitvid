import test from "node:test";
import assert from "node:assert/strict";

import { createExploreDiversitySorter } from "../../js/feedEngine/index.js";

const buildItem = ({ id, score, tags }) => ({
  video: {
    id,
    tags: tags.map((tag) => ["t", tag]),
    rootCreatedAt: 1000,
  },
  metadata: {
    exploreScore: score,
  },
});

test("explore diversity sorter increases tag diversity in the top results", async () => {
  const sorter = createExploreDiversitySorter({ lambda: 0.6 });

  const items = [
    buildItem({ id: "a", score: 0.9, tags: ["cats"] }),
    buildItem({ id: "b", score: 0.85, tags: ["cats"] }),
    buildItem({ id: "c", score: 0.83, tags: ["dogs"] }),
  ];

  const sorted = await sorter(items, {
    addWhy() {},
  });

  assert.equal(sorted[0].video.id, "a");
  assert.equal(sorted[1].video.id, "c");

  const topTags = new Set(
    sorted
      .slice(0, 2)
      .flatMap((item) => item.video.tags.map((tag) => tag[1].toLowerCase())),
  );
  assert.equal(topTags.size, 2);
});

test("explore diversity sorter logs why when MMR re-orders similar candidates", async () => {
  const sorter = createExploreDiversitySorter({ lambda: 0.7 });

  const items = [
    buildItem({ id: "a", score: 0.9, tags: ["cats", "dogs"] }),
    buildItem({ id: "b", score: 0.88, tags: ["cats"] }),
    buildItem({
      id: "c",
      score: 0.86,
      tags: [
        "cats",
        "birds",
        "foxes",
        "lions",
        "otters",
        "pandas",
        "bears",
        "mice",
        "horses",
        "snakes",
        "geckos",
        "whales",
        "turtles",
      ],
    }),
    buildItem({ id: "d", score: 0.5, tags: ["neon"] }),
  ];

  const why = [];
  const sorted = await sorter(items, {
    addWhy: (detail) => why.push(detail),
  });

  assert.equal(sorted[0].video.id, "a");
  assert.equal(sorted[1].video.id, "c");

  assert.ok(why.length >= 1);
  const entry = why[0];
  assert.equal(entry.stage, "explore-diversity-sorter");
  assert.equal(entry.type, "diversity");
  assert.equal(entry.reason, "explore-diversity");
  assert.ok(Array.isArray(entry.competitorIds));
  assert.ok(entry.selectedId);
  assert.ok(Number.isFinite(entry.similarity));
});
