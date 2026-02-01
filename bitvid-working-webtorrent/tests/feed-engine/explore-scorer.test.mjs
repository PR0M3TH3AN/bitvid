import test from "node:test";
import assert from "node:assert/strict";

import {
  createDisinterestFilterStage,
  createExploreScorerStage,
} from "../../js/feedEngine/index.js";

test("explore disinterest filter drops videos with disinterested tags", async () => {
  const stage = createDisinterestFilterStage();
  const items = [
    {
      video: {
        id: "keep",
        pubkey: "a".repeat(64),
        tags: [["t", "Cats"]],
      },
      metadata: {},
    },
    {
      video: {
        id: "drop",
        pubkey: "b".repeat(64),
        tags: [["t", "Dogs"]],
      },
      metadata: {},
    },
  ];

  const why = [];

  const result = await stage(items, {
    runtime: {
      tagPreferences: {
        interests: [],
        disinterests: ["dogs"],
      },
    },
    addWhy: (detail) => why.push(detail),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].video.id, "keep");
  assert.equal(why.length, 1);
  assert.equal(why[0].reason, "disinterested-tag");
  assert.equal(why[0].videoId, "drop");
});

test("explore scorer penalizes disinterest overlap and logs why metadata", async () => {
  const stage = createExploreScorerStage();

  const items = [
    {
      video: {
        id: "neutral",
        pubkey: "c".repeat(64),
        tags: [["t", "Cats"]],
        viewCount: 100,
      },
      metadata: {},
    },
    {
      video: {
        id: "disinterest",
        pubkey: "d".repeat(64),
        tags: [["t", "Dogs"]],
        viewCount: 100,
      },
      metadata: {},
    },
  ];

  const why = [];

  await stage(items, {
    runtime: {
      tagPreferences: {
        interests: [],
        disinterests: ["dogs"],
      },
      exploreWeights: {
        novelty: 0,
        freshness: 0,
        historySimilarity: 0,
        newTagFraction: 0,
        popularityNorm: 1,
        disinterestOverlap: 0.5,
      },
      explorePopularityMax: 100,
    },
    addWhy: (detail) => why.push(detail),
  });

  const neutralScore = items[0].metadata.exploreScore;
  const disinterestScore = items[1].metadata.exploreScore;

  assert.ok(neutralScore > disinterestScore);
  assert.equal(neutralScore, 1);
  assert.equal(disinterestScore, 0.5);

  const disinterestWhy = why.filter((entry) => entry.videoId === "disinterest");
  assert.ok(disinterestWhy.length >= 2);
  for (const entry of disinterestWhy) {
    assert.equal(entry.stage, "explore-scorer");
    assert.equal(entry.type, "score");
    assert.ok(entry.score >= 0);
    assert.equal(entry.videoId, "disinterest");
    assert.equal(entry.pubkey, "d".repeat(64));
  }
});

test("explore scorer rewards novelty and new tag fraction", async () => {
  const stage = createExploreScorerStage();

  const items = [
    {
      video: {
        id: "familiar",
        pubkey: "e".repeat(64),
        tags: [["t", "Cats"]],
      },
      metadata: {},
    },
    {
      video: {
        id: "novel",
        pubkey: "f".repeat(64),
        tags: [["t", "Dogs"]],
      },
      metadata: {},
    },
  ];

  await stage(items, {
    runtime: {
      watchHistoryTagCounts: {
        cats: 5,
      },
      exploreWeights: {
        novelty: 0.7,
        freshness: 0,
        historySimilarity: 0,
        newTagFraction: 0.3,
        popularityNorm: 0,
        disinterestOverlap: 0,
      },
    },
    addWhy() {},
  });

  const familiar = items[0].metadata.exploreComponents;
  const novel = items[1].metadata.exploreComponents;

  assert.equal(items[0].metadata.exploreScore, 0);
  assert.equal(items[1].metadata.exploreScore, 1);
  assert.equal(familiar.novelty, 0);
  assert.equal(familiar.newTagFraction, 0);
  assert.equal(novel.novelty, 1);
  assert.equal(novel.newTagFraction, 1);
});
