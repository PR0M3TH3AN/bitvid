// Scenario (SCN-for-you-ranked): the For You feed is inclusive + ranked.
//   Given videos, a follows set, hashtag interests, and disinterests,
//   When scored by createForYouScorerStage and sorted by createForYouScoreSorter,
//   Then a FOLLOWED author and an INTEREST match each rank above an otherwise-
//     newer item (so the boost — not just recency — decides), a DISINTERESTED
//     item is penalized below a neutral one, and nothing is filtered out (never
//     empty).
//
// Cheat-resistant: the boosted items are deliberately OLDER, so they can only
// win via the follows/affinity boost, not recency.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createForYouScorerStage } from "../js/feedEngine/exploreScoring.js";
import { createForYouScoreSorter } from "../js/feedEngine/sorters.js";

const FOLLOWED = "f".repeat(64);
const OTHER = "0".repeat(64);
const NOW = Math.floor(Date.now() / 1000);
const OLD = NOW - 100000; // ~1.16 days older

const item = (id, pubkey, tagNames = [], createdAt = NOW) => ({
  video: { id, pubkey, created_at: createdAt, tags: tagNames.map((t) => ["t", t]) },
  metadata: {},
});

async function rank(items, runtime) {
  const context = { runtime, now: NOW };
  await createForYouScorerStage()(items, context);
  return createForYouScoreSorter()(items, context).map((i) => i.video.id);
}

test("a followed author outranks a newer non-followed video", async () => {
  const items = [
    item("newer-stranger", OTHER, [], NOW),
    item("older-followed", FOLLOWED, [], OLD),
  ];
  const order = await rank(items, {
    subscriptionAuthors: [FOLLOWED],
    tagPreferences: { interests: [], disinterests: [] },
  });
  assert.equal(order[0], "older-followed", "follows-boost must beat recency");
  assert.equal(items.length, 2, "scorer must not filter (never empty)");
});

test("an interest match outranks a newer non-matching video", async () => {
  const items = [
    item("newer-sports", OTHER, ["sports"], NOW),
    item("older-music", OTHER, ["music"], OLD),
  ];
  const order = await rank(items, {
    subscriptionAuthors: [],
    tagPreferences: { interests: ["music"], disinterests: [] },
  });
  assert.equal(order[0], "older-music", "interest affinity must beat recency");
});

test("a disinterested tag is penalized below a neutral video", async () => {
  const items = [
    item("spammy", OTHER, ["spam"], NOW),
    item("neutral", OTHER, ["cooking"], NOW),
  ];
  const order = await rank(items, {
    subscriptionAuthors: [],
    tagPreferences: { interests: [], disinterests: ["spam"] },
  });
  assert.equal(order[0], "neutral", "disinterested item must rank last");
});

test("with no signals at all, falls back to recency (never empty)", async () => {
  const items = [
    item("old", OTHER, [], OLD),
    item("new", OTHER, [], NOW),
  ];
  const order = await rank(items, {
    subscriptionAuthors: [],
    tagPreferences: { interests: [], disinterests: [] },
  });
  assert.equal(order[0], "new", "no signals → newest first");
  assert.equal(order.length, 2);
});
