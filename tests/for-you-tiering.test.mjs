// Scenario (SCN-for-you-tiering): "your people first".
//   Given For You items tagged with forYouTier (2=followed author, 1=interest/
//     watch match, 0=other) and forYouScore,
//   When sorted by createForYouScoreSorter,
//   Then higher tiers lead REGARDLESS of raw score (a followed/interest video
//     outranks a higher-scoring stranger), trusted-muted sinks last, and when
//     NOTHING is tiered the order is author-interleaved (discovery) rather than a
//     straight score/recency clone of Recently-added.
//
// Cheat-resistant: tier-2/tier-1 winners are given deliberately LOWER scores than
// the tier-0 item, so they can only lead via the tier, not the score.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createForYouScoreSorter,
  interleaveByAuthor,
} from "../js/feedEngine/sorters.js";
import { createForYouScorerStage } from "../js/feedEngine/exploreScoring.js";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const item = (id, { tier = 0, score = 0, pubkey = A, muted = false } = {}) => ({
  video: { id, pubkey, created_at: 1000 },
  metadata: {
    forYouTier: tier,
    forYouScore: score,
    ...(muted ? { moderation: { trustedMuted: true } } : {}),
  },
});

const order = (items) =>
  createForYouScoreSorter()(items, {}).map((i) => i.video.id);

test("a followed (tier 2) video leads a higher-scoring stranger (tier 0)", () => {
  const items = [
    item("stranger", { tier: 0, score: 0.95, pubkey: B }),
    item("followed", { tier: 2, score: 0.1, pubkey: A }),
  ];
  assert.deepEqual(order(items), ["followed", "stranger"]);
});

test("tiers stack: follow > interest > other, regardless of score", () => {
  const items = [
    item("other", { tier: 0, score: 0.9, pubkey: C }),
    item("interest", { tier: 1, score: 0.2, pubkey: B }),
    item("followed", { tier: 2, score: 0.05, pubkey: A }),
  ];
  assert.deepEqual(order(items), ["followed", "interest", "other"]);
});

test("trusted-muted sinks last even if tiered", () => {
  const items = [
    item("muted-follow", { tier: 2, score: 0.9, pubkey: A, muted: true }),
    item("plain", { tier: 0, score: 0.1, pubkey: B }),
  ];
  assert.deepEqual(order(items), ["plain", "muted-follow"]);
});

test("no-signal fallback interleaves authors (not a chronological clone)", () => {
  // All tier 0 (no follows/interests). Author A dominates by count; a straight
  // score/recency sort would clump all A's first. Interleave must break that up.
  const items = [
    item("a1", { tier: 0, score: 0.9, pubkey: A }),
    item("a2", { tier: 0, score: 0.8, pubkey: A }),
    item("a3", { tier: 0, score: 0.7, pubkey: A }),
    item("b1", { tier: 0, score: 0.6, pubkey: B }),
    item("c1", { tier: 0, score: 0.5, pubkey: C }),
  ];
  const result = order(items);
  // First three must NOT all be author A (the clumping a pure sort would produce).
  const firstThreeAuthors = result.slice(0, 3).map((id) => id[0]);
  assert.notDeepEqual(firstThreeAuthors, ["a", "a", "a"]);
  // Highest-scored item still leads its pass.
  assert.equal(result[0], "a1");
  // No items lost.
  assert.deepEqual([...result].sort(), ["a1", "a2", "a3", "b1", "c1"]);
});

test("interleaveByAuthor is a no-op for <3 items", () => {
  const items = [item("x", { pubkey: A }), item("y", { pubkey: A })];
  assert.deepEqual(
    interleaveByAuthor(items).map((i) => i.video.id),
    ["x", "y"],
  );
});

test("scorer tags forYouTier: 2 for follows, 1 for interest, 0 for neither", async () => {
  const NOW = Math.floor(Date.now() / 1000);
  const mk = (id, pubkey, tags = []) => ({
    video: { id, pubkey, created_at: NOW, tags: tags.map((t) => ["t", t]) },
    metadata: {},
  });
  const items = [
    mk("followed", A, []),
    mk("interested", B, ["nostr"]),
    mk("neither", C, []),
  ];
  await createForYouScorerStage()(items, {
    now: NOW,
    runtime: {
      subscriptionAuthors: [A],
      tagPreferences: { interests: ["nostr"], disinterests: [] },
    },
  });
  const tierById = Object.fromEntries(
    items.map((i) => [i.video.id, i.metadata.forYouTier]),
  );
  assert.equal(tierById.followed, 2, "followed author → tier 2");
  assert.equal(tierById.interested, 1, "interest match → tier 1");
  assert.equal(tierById.neither, 0, "no signal → tier 0");
});
