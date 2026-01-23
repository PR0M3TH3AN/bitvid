// js/feedEngine/sorters.js

import { normalizeHashtag } from "../utils/hashtagNormalization.js";

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

        const hook = context?.hooks?.timestamps;
        if (!hook || typeof hook !== "object") {
          return null;
        }

        const candidates = [
          hook.getKnownVideoPostedAt,
          hook.getKnownPostedAt,
          hook.getVideoPostedAt,
          hook.resolveVideoPostedAt,
        ];

        for (const candidate of candidates) {
          if (typeof candidate !== "function") {
            continue;
          }

          try {
            const value = candidate(video, { entry, context });
            if (Number.isFinite(value)) {
              return Math.floor(value);
            }
          } catch (error) {
            context?.log?.(
              "[chronological-sorter] timestamps hook threw",
              error,
            );
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

    return copy;
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

function cosineSimilarity(vectorA, vectorB) {
  if (!vectorA || !vectorB || vectorA.size === 0 || vectorB.size === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of vectorA.values()) {
    normA += value * value;
  }
  for (const value of vectorB.values()) {
    normB += value * value;
  }

  if (!Number.isFinite(normA) || !Number.isFinite(normB) || normA <= 0 || normB <= 0) {
    return 0;
  }

  const smaller = vectorA.size <= vectorB.size ? vectorA : vectorB;
  const larger = smaller === vectorA ? vectorB : vectorA;

  for (const [tag, value] of smaller.entries()) {
    const other = larger.get(tag);
    if (Number.isFinite(other)) {
      dot += value * other;
    }
  }

  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (!Number.isFinite(similarity)) {
    return 0;
  }
  if (similarity > 1) {
    return 1;
  }
  if (similarity < -1) {
    return -1;
  }
  return similarity;
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
    for (const item of candidates) {
      vectors.set(item, buildTagVector(item));
    }

    const selected = [];
    const remaining = [...candidates];

    while (remaining.length > 0) {
      let bestCandidate = null;
      let bestMmr = Number.NEGATIVE_INFINITY;
      let bestRaw = Number.NEGATIVE_INFINITY;
      let bestSimilarity = 0;
      let bestSimilarItemId = "";

      let bestRawCandidate = null;
      let bestRawScore = Number.NEGATIVE_INFINITY;

      for (const candidate of remaining) {
        const rawScore = normalizeScore(candidate?.metadata?.exploreScore);
        if (rawScore > bestRawScore) {
          bestRawScore = rawScore;
          bestRawCandidate = candidate;
        } else if (rawScore === bestRawScore && bestRawCandidate) {
          const tie = compareByTimestampId(candidate, bestRawCandidate);
          if (tie < 0) {
            bestRawCandidate = candidate;
          }
        }
      }

      for (const candidate of remaining) {
        const rawScore = normalizeScore(candidate?.metadata?.exploreScore);
        let penalty = 0;
        let similarItemId = "";

        if (selected.length > 0) {
          const candidateVector = vectors.get(candidate);
          for (const selectedItem of selected) {
            const similarity = cosineSimilarity(
              candidateVector,
              vectors.get(selectedItem),
            );
            if (similarity > penalty) {
              penalty = similarity;
              similarItemId = stableVideoId(selectedItem);
            }
          }
        }

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

      const index = remaining.indexOf(bestCandidate);
      if (index >= 0) {
        remaining.splice(index, 1);
      }
    }

    const orderedRest = [...rest].sort(compareByTimestampId);
    return selected.concat(orderedRest);
  };
}
