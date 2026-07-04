// js/feedEngine/sorters.js

import { normalizeHashtag } from "../utils/hashtagNormalization.js";
import { markAsNormalized } from "./utils.js";

// Shared count-ranked sorter: rank by an injected per-video metric (desc),
// tie-break by recency, spread authors, sink trusted-muted last. Unknown /
// not-yet-loaded counts are treated as 0, so on a cold cache the feed reads
// as recency and settles into the true ranking as counts stream in (the view
// re-runs the feed on the metric cache's debounced change signal).
//   - Trending (#27): runtime.getViewCount (viewCounter cache)
//   - Most Zapped (#47): runtime.getZapTotal (zapTotals cache)
function createCountRankedSorter(resolveMetric) {
  return function countRankedSorter(items = [], context = {}) {
    if (!Array.isArray(items)) {
      return [];
    }
    const metricFn = resolveMetric(context);
    const getViewCount = typeof metricFn === "function" ? metricFn : () => 0;

    const isMuted = (entry) =>
      entry?.metadata?.moderation?.trustedMuted === true ||
      entry?.video?.moderation?.trustedMuted === true;

    const timestampOf = (entry) => {
      const video = entry?.video;
      if (!video || typeof video !== "object") {
        return Number.NEGATIVE_INFINITY;
      }
      const root = Number(video.rootCreatedAt);
      if (Number.isFinite(root)) return Math.floor(root);
      const created = Number(video.created_at);
      return Number.isFinite(created) ? Math.floor(created) : Number.NEGATIVE_INFINITY;
    };

    // Resolve each item's view count once (avoid O(n log n) cache lookups).
    const viewsByItem = new Map();
    for (const item of items) {
      let total = 0;
      try {
        const value = getViewCount(item?.video);
        total = Number.isFinite(value) ? Number(value) : 0;
      } catch (error) {
        total = 0;
      }
      viewsByItem.set(item, total);
    }

    const compare = (a, b) => {
      const viewDiff = (viewsByItem.get(b) || 0) - (viewsByItem.get(a) || 0);
      if (viewDiff !== 0) return viewDiff;
      return timestampOf(b) - timestampOf(a);
    };

    const live = items.filter((entry) => !isMuted(entry));
    const muted = items.filter((entry) => isMuted(entry));
    // Rank by the metric, then spread authors so the tab isn't walls of one
    // creator. The top-ranked item is still chosen first, so it stays topmost.
    return [...spreadAuthors(live.sort(compare)), ...muted.sort(compare)];
  };
}

export function createTrendingSorter() {
  return createCountRankedSorter((context) => context?.runtime?.getViewCount);
}

// "Most Zapped" (#47): same ranking mechanics over sats totals.
export function createMostZappedSorter() {
  return createCountRankedSorter((context) => context?.runtime?.getZapTotal);
}

// Round-robin interleave by author: one video per creator per pass, each pass in
// the caller's pre-sorted order. Consecutive cards are from different creators,
// so a feed reads as a varied "discovery" mix instead of a chronological wall —
// used for For You's no-signal fallback and Explore's diversity.
export function interleaveByAuthor(items, { authorOf } = {}) {
  if (!Array.isArray(items) || items.length < 3) {
    return Array.isArray(items) ? [...items] : [];
  }
  const keyOf =
    typeof authorOf === "function"
      ? authorOf
      : (entry) =>
          typeof entry?.video?.pubkey === "string" ? entry.video.pubkey : "";

  const buckets = new Map();
  const order = [];
  for (const item of items) {
    const key = keyOf(item) || `__anon__${order.length}`;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key).push(item);
  }

  const result = [];
  let remaining = items.length;
  while (remaining > 0) {
    for (const key of order) {
      const bucket = buckets.get(key);
      if (bucket && bucket.length) {
        result.push(bucket.shift());
        remaining -= 1;
      }
    }
  }
  return result;
}

// Gentle author-diversity re-rank. Unlike interleaveByAuthor (full round-robin,
// which flattens the ranking), this keeps the caller's ranked order as the
// priority and only breaks up runs of the same author: at each step it takes the
// highest-ranked remaining item whose author wasn't among the last `window`
// picks, falling back to the plain top item when every remaining candidate is a
// recent author. The #1 ranked item is always chosen first, so "best/most-X on
// top" is preserved while consecutive cards stop clustering by creator.
export function spreadAuthors(items, { authorOf, window: windowSize = 1 } = {}) {
  if (!Array.isArray(items) || items.length < 3) {
    return Array.isArray(items) ? [...items] : [];
  }
  const size = Number.isFinite(windowSize) && windowSize > 0 ? Math.floor(windowSize) : 1;
  const keyOf =
    typeof authorOf === "function"
      ? authorOf
      : (entry) =>
          typeof entry?.video?.pubkey === "string" ? entry.video.pubkey : "";

  const remaining = items.map((item, index) => ({ item, key: keyOf(item), index }));
  const result = [];
  const recent = []; // authors of the last `size` picks
  while (remaining.length) {
    let pickIdx = 0; // default: the highest-ranked remaining item
    for (let i = 0; i < remaining.length; i += 1) {
      const { key } = remaining[i];
      // Anonymous/unknown authors ("") never count as a repeat.
      if (!key || !recent.includes(key)) {
        pickIdx = i;
        break;
      }
    }
    const [picked] = remaining.splice(pickIdx, 1);
    result.push(picked.item);
    if (picked.key) {
      recent.push(picked.key);
      if (recent.length > size) recent.shift();
    }
  }
  return result;
}

// Ranks the For You feed "your people first": followed authors and interest/
// watch-topic matches (forYouTier, set by the scorer) lead regardless of
// recency, then everyone else by score. When NOTHING is tiered (logged-out / no
// follows / no interests) it falls back to an author-interleaved discovery order
// so the feed never mirrors Recently-added. Trusted-muted always sinks last.
export function createForYouScoreSorter() {
  return function forYouScoreSorter(items = [], context = {}) {
    if (!Array.isArray(items)) {
      return [];
    }
    void context;

    const isMuted = (entry) =>
      entry?.metadata?.moderation?.trustedMuted === true ||
      entry?.video?.moderation?.trustedMuted === true;

    const tierOf = (entry) => {
      const tier = Number(entry?.metadata?.forYouTier);
      return Number.isFinite(tier) ? tier : 0;
    };

    const scoreOf = (entry) => {
      const score = Number(entry?.metadata?.forYouScore);
      return Number.isFinite(score) ? score : 0;
    };

    const timestampOf = (entry) => {
      const video = entry?.video;
      if (!video || typeof video !== "object") {
        return Number.NEGATIVE_INFINITY;
      }
      const root = Number(video.rootCreatedAt);
      if (Number.isFinite(root)) return Math.floor(root);
      const created = Number(video.created_at);
      return Number.isFinite(created) ? Math.floor(created) : Number.NEGATIVE_INFINITY;
    };

    const live = items.filter((entry) => !isMuted(entry));
    const muted = items.filter((entry) => isMuted(entry));

    const byScore = (a, b) => {
      const scoreDiff = scoreOf(b) - scoreOf(a);
      if (scoreDiff !== 0) return scoreDiff;
      return timestampOf(b) - timestampOf(a);
    };

    const personalized = live.some((entry) => tierOf(entry) > 0);

    let ordered;
    if (personalized) {
      // Tier desc, then score within tier. "Your people" rise to the top.
      ordered = [...live].sort((a, b) => {
        const tierDiff = tierOf(b) - tierOf(a);
        if (tierDiff !== 0) return tierDiff;
        return byScore(a, b);
      });
      // Break up per-creator clusters (a followed author's whole back-catalogue
      // would otherwise sit in one block) while keeping the best-fit item on top.
      ordered = spreadAuthors(ordered);
    } else {
      // No signals → discovery fallback: score order, then interleave authors so
      // it doesn't read as a chronological clone of Recently-added.
      ordered = interleaveByAuthor([...live].sort(byScore));
    }

    return [...ordered, ...muted.sort(byScore)];
  };
}

export function createChronologicalSorter({
  direction = "desc",
  postedAtResolver,
} = {}) {
  const normalizedDirection = direction === "asc" ? "asc" : "desc";

  return function chronologicalSorter(items = [], context = {}) {
    if (!Array.isArray(items)) {
      return [];
    }

    const copy = [...items];

    // Pre-resolve hooks to avoid allocation and property access in the hot loop
    const hook = context?.hooks?.timestamps;
    const h1 = typeof hook?.getKnownVideoPostedAt === "function" ? hook.getKnownVideoPostedAt : null;
    const h2 = typeof hook?.getKnownPostedAt === "function" ? hook.getKnownPostedAt : null;
    const h3 = typeof hook?.getVideoPostedAt === "function" ? hook.getVideoPostedAt : null;
    const h4 = typeof hook?.resolveVideoPostedAt === "function" ? hook.resolveVideoPostedAt : null;

    const getTimestamp = (entry) => {
      if (!entry || typeof entry !== "object") {
        return Number.NEGATIVE_INFINITY;
      }

      const video = entry.video;
      if (!video || typeof video !== "object") {
        return Number.NEGATIVE_INFINITY;
      }

      const resolvePostedAtHook = () => {
        if (typeof postedAtResolver === "function") {
          try {
            const resolved = postedAtResolver({ entry, context, video });
            if (Number.isFinite(resolved)) {
              return Math.floor(resolved);
            }
          } catch (error) {
            context?.log?.("[chronological-sorter] postedAtResolver threw", error);
          }
        }

        // Unrolled check for pre-resolved hooks
        if (h1) {
          try {
            const value = h1(video, { entry, context });
            if (Number.isFinite(value)) return Math.floor(value);
          } catch (error) {
            context?.log?.("[chronological-sorter] timestamps hook threw", error);
          }
        }
        if (h2) {
          try {
            const value = h2(video, { entry, context });
            if (Number.isFinite(value)) return Math.floor(value);
          } catch (error) {
            context?.log?.("[chronological-sorter] timestamps hook threw", error);
          }
        }
        if (h3) {
          try {
            const value = h3(video, { entry, context });
            if (Number.isFinite(value)) return Math.floor(value);
          } catch (error) {
            context?.log?.("[chronological-sorter] timestamps hook threw", error);
          }
        }
        if (h4) {
          try {
            const value = h4(video, { entry, context });
            if (Number.isFinite(value)) return Math.floor(value);
          } catch (error) {
            context?.log?.("[chronological-sorter] timestamps hook threw", error);
          }
        }

        return null;
      };

      const hookTimestamp = resolvePostedAtHook();
      if (Number.isFinite(hookTimestamp)) {
        return hookTimestamp;
      }

      const rootCreatedAt = Number(video.rootCreatedAt);
      if (Number.isFinite(rootCreatedAt)) {
        return Math.floor(rootCreatedAt);
      }

      const nip71CreatedAt = Number(video?.nip71Source?.created_at);
      if (Number.isFinite(nip71CreatedAt)) {
        return Math.floor(nip71CreatedAt);
      }

      const createdAt = Number(video.created_at);
      if (Number.isFinite(createdAt)) {
        return Math.floor(createdAt);
      }

      return Number.NEGATIVE_INFINITY;
    };

    copy.sort((a, b) => {
      const aMuted =
        a?.metadata?.moderation?.trustedMuted === true ||
        a?.video?.moderation?.trustedMuted === true;
      const bMuted =
        b?.metadata?.moderation?.trustedMuted === true ||
        b?.video?.moderation?.trustedMuted === true;

      if (aMuted !== bMuted) {
        return aMuted ? 1 : -1;
      }

      const aTs = getTimestamp(a);
      const bTs = getTimestamp(b);
      const normalizedATs = Number.isFinite(aTs) ? aTs : Number.NEGATIVE_INFINITY;
      const normalizedBTs = Number.isFinite(bTs) ? bTs : Number.NEGATIVE_INFINITY;

      if (normalizedATs !== normalizedBTs) {
        const diff = normalizedATs - normalizedBTs;
        return normalizedDirection === "asc" ? diff : -diff;
      }

      const aId = typeof a?.video?.id === "string" ? a.video.id : "";
      const bId = typeof b?.video?.id === "string" ? b.video.id : "";
      return normalizedDirection === "asc"
        ? aId.localeCompare(bId)
        : bId.localeCompare(aId);
    });

    return markAsNormalized(copy);
  };
}

function buildTagVector(item) {
  const vector = new Map();
  const video = item?.video;
  if (!video || typeof video !== "object") {
    return vector;
  }

  const addTag = (rawTag) => {
    if (typeof rawTag !== "string") {
      return;
    }
    const tag = normalizeHashtag(rawTag);
    if (!tag) {
      return;
    }
    vector.set(tag, (vector.get(tag) || 0) + 1);
  };

  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (Array.isArray(tag) && tag[0] === "t") {
        addTag(tag[1]);
      }
    }
  }

  if (Array.isArray(video.nip71?.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      addTag(tag);
    }
  }

  return vector;
}

function normalizeVector(vector) {
  if (!vector || vector.size === 0) {
    return vector;
  }
  let norm = 0;
  for (const value of vector.values()) {
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (const [tag, value] of vector.entries()) {
      vector.set(tag, value / norm);
    }
  }
  return vector;
}

function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA || !vectorB || vectorA.size === 0 || vectorB.size === 0) {
    return 0;
  }

  // Vectors are assumed to be normalized, so cosine similarity is just the dot product.
  let dot = 0;
  const smaller = vectorA.size <= vectorB.size ? vectorA : vectorB;
  const larger = smaller === vectorA ? vectorB : vectorA;

  for (const [tag, value] of smaller.entries()) {
    const other = larger.get(tag);
    if (Number.isFinite(other)) {
      dot += value * other;
    }
  }

  if (dot > 1) {
    return 1;
  }
  if (dot < -1) {
    return -1;
  }
  return dot;
}

function resolveItemTimestamp(item) {
  const rootCreatedAt = Number(item?.video?.rootCreatedAt);
  if (Number.isFinite(rootCreatedAt)) {
    return Math.floor(rootCreatedAt);
  }

  const createdAt = Number(item?.video?.created_at);
  if (Number.isFinite(createdAt)) {
    return Math.floor(createdAt);
  }

  return Number.NEGATIVE_INFINITY;
}

function stableVideoId(item) {
  return typeof item?.video?.id === "string" ? item.video.id : "";
}

function compareByTimestampId(a, b) {
  const aTs = resolveItemTimestamp(a);
  const bTs = resolveItemTimestamp(b);
  if (aTs !== bTs) {
    return bTs - aTs;
  }
  return stableVideoId(a).localeCompare(stableVideoId(b));
}

export function createExploreDiversitySorter({
  lambda = 0.7,
  stageName = "explore-diversity-sorter",
} = {}) {
  const normalizedLambda = Number.isFinite(lambda)
    ? Math.min(1, Math.max(0, lambda))
    : 0.7;

  return function exploreDiversitySorter(items = [], context = {}) {
    if (!Array.isArray(items)) {
      return [];
    }

    const candidates = [];
    const rest = [];

    for (const item of items) {
      const score = item?.metadata?.exploreScore;
      if (Number.isFinite(score)) {
        candidates.push(item);
      } else {
        rest.push(item);
      }
    }

    if (candidates.length === 0) {
      return [...rest].sort(compareByTimestampId);
    }

    let maxScore = Number.NEGATIVE_INFINITY;
    let minScore = Number.POSITIVE_INFINITY;
    for (const item of candidates) {
      const score = Number(item?.metadata?.exploreScore);
      if (!Number.isFinite(score)) {
        continue;
      }
      if (score > maxScore) {
        maxScore = score;
      }
      if (score < minScore) {
        minScore = score;
      }
    }

    const scoreSpan = maxScore - minScore;
    const normalizeScore = (score) => {
      const numeric = Number(score);
      if (!Number.isFinite(numeric)) {
        return 0;
      }
      if (!Number.isFinite(scoreSpan) || scoreSpan <= 0) {
        return 1;
      }
      const normalized = (numeric - minScore) / scoreSpan;
      if (normalized <= 0) {
        return 0;
      }
      if (normalized >= 1) {
        return 1;
      }
      return normalized;
    };

    const vectors = new Map();
    const scores = new Map();
    const invertedIndex = new Map();

    for (const item of candidates) {
      const vec = buildTagVector(item);
      normalizeVector(vec);
      vectors.set(item, vec);
      scores.set(item, normalizeScore(item?.metadata?.exploreScore));

      for (const tag of vec.keys()) {
        if (!invertedIndex.has(tag)) {
          invertedIndex.set(tag, new Set());
        }
        invertedIndex.get(tag).add(item);
      }
    }

    const selected = [];
    const candidateState = new Map();

    for (const candidate of candidates) {
      candidateState.set(candidate, {
        maxSimilarity: 0,
        similarItemId: "",
      });
    }

    while (candidateState.size > 0) {
      if (selected.length > 0) {
        const lastSelected = selected[selected.length - 1];
        const lastSelectedVector = vectors.get(lastSelected);
        const lastSelectedId = stableVideoId(lastSelected);

        const affectedCandidates = new Set();
        for (const tag of lastSelectedVector.keys()) {
          const tagCandidates = invertedIndex.get(tag);
          if (tagCandidates) {
            for (const candidate of tagCandidates) {
              if (candidateState.has(candidate)) {
                affectedCandidates.add(candidate);
              }
            }
          }
        }

        for (const candidate of affectedCandidates) {
          const state = candidateState.get(candidate);
          const candidateVector = vectors.get(candidate);
          const similarity = cosineSimilarity(
            candidateVector,
            lastSelectedVector,
          );

          if (similarity > state.maxSimilarity) {
            state.maxSimilarity = similarity;
            state.similarItemId = lastSelectedId;
          }
        }
      }

      let bestCandidate = null;
      let bestMmr = Number.NEGATIVE_INFINITY;
      let bestRaw = Number.NEGATIVE_INFINITY;
      let bestSimilarity = 0;
      let bestSimilarItemId = "";

      let bestRawCandidate = null;
      let bestRawScore = Number.NEGATIVE_INFINITY;

      for (const candidate of candidateState.keys()) {
        const rawScore = scores.get(candidate);

        // Track best raw score candidate (for why logging)
        if (rawScore > bestRawScore) {
          bestRawScore = rawScore;
          bestRawCandidate = candidate;
        } else if (rawScore === bestRawScore && bestRawCandidate) {
          const tie = compareByTimestampId(candidate, bestRawCandidate);
          if (tie < 0) {
            bestRawCandidate = candidate;
          }
        }

        const state = candidateState.get(candidate);
        const penalty = state.maxSimilarity;
        const similarItemId = state.similarItemId;

        const mmrScore =
          normalizedLambda * rawScore - (1 - normalizedLambda) * penalty;

        if (mmrScore > bestMmr) {
          bestCandidate = candidate;
          bestMmr = mmrScore;
          bestRaw = rawScore;
          bestSimilarity = penalty;
          bestSimilarItemId = similarItemId;
          continue;
        }

        if (mmrScore === bestMmr) {
          if (rawScore !== bestRaw) {
            if (rawScore > bestRaw) {
              bestCandidate = candidate;
              bestRaw = rawScore;
              bestSimilarity = penalty;
              bestSimilarItemId = similarItemId;
            }
            continue;
          }

          if (compareByTimestampId(candidate, bestCandidate) < 0) {
            bestCandidate = candidate;
            bestRaw = rawScore;
            bestSimilarity = penalty;
            bestSimilarItemId = similarItemId;
          }
        }
      }

      if (!bestCandidate) {
        break;
      }

      selected.push(bestCandidate);

      if (
        bestRawCandidate &&
        bestRawCandidate !== bestCandidate &&
        bestSimilarity > 0
      ) {
        const selectedId = stableVideoId(bestCandidate);
        const competitorId = stableVideoId(bestRawCandidate);
        if (selectedId && competitorId && selectedId !== competitorId) {
          context?.addWhy?.({
            stage: stageName,
            type: "diversity",
            reason: "explore-diversity",
            selectedId,
            competitorIds: [competitorId],
            similarity: bestSimilarity,
            similarItemId: bestSimilarItemId || null,
          });
        }
      }

      candidateState.delete(bestCandidate);
    }

    const orderedRest = [...rest].sort(compareByTimestampId);
    return markAsNormalized(selected.concat(orderedRest));
  };
}

export function createKidsScoreSorter({
  stageName = "kids-score-sorter",
} = {}) {
  return function kidsScoreSorter(items = [], context = {}) {
    if (!Array.isArray(items)) {
      return [];
    }

    const copy = [...items];
    copy.sort((a, b) => {
      const aScore = Number(a?.metadata?.kidsScore);
      const bScore = Number(b?.metadata?.kidsScore);
      const aHasScore = Number.isFinite(aScore);
      const bHasScore = Number.isFinite(bScore);
      const normalizedAScore = aHasScore ? aScore : Number.NEGATIVE_INFINITY;
      const normalizedBScore = bHasScore ? bScore : Number.NEGATIVE_INFINITY;

      if (normalizedAScore !== normalizedBScore) {
        return normalizedBScore - normalizedAScore;
      }

      const aRootCreatedAt = Number(a?.video?.rootCreatedAt);
      const bRootCreatedAt = Number(b?.video?.rootCreatedAt);
      const normalizedARoot =
        Number.isFinite(aRootCreatedAt) ? aRootCreatedAt : Number.NEGATIVE_INFINITY;
      const normalizedBRoot =
        Number.isFinite(bRootCreatedAt) ? bRootCreatedAt : Number.NEGATIVE_INFINITY;

      if (normalizedARoot !== normalizedBRoot) {
        return normalizedBRoot - normalizedARoot;
      }

      return stableVideoId(a).localeCompare(stableVideoId(b));
    });

    if (context?.addWhy && typeof context.addWhy === "function") {
      context.addWhy({
        stage: stageName,
        type: "sort",
        reason: "kids-score",
      });
    }

    return markAsNormalized(copy);
  };
}
