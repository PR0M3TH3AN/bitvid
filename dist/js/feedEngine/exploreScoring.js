// js/feedEngine/exploreScoring.js

import { normalizeHashtag } from "../utils/hashtagNormalization.js";
import { isPlainObject, toSet } from "./utils.js";

const DEFAULT_WEIGHTS = Object.freeze({
  novelty: 0.3,
  freshness: 0.25,
  historySimilarity: 0.2,
  newTagFraction: 0.1,
  popularityNorm: 0.1,
  disinterestOverlap: 0.25,
});

const DEFAULT_FRESHNESS_HALF_LIFE_DAYS = 14;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function normalizeTagSet(values) {
  const normalized = new Set();
  const source = toSet(values);

  for (const value of source) {
    const tag = normalizeHashtag(value);
    if (tag) {
      normalized.add(tag);
    }
  }

  return normalized;
}

function normalizeTagCountMap(tagCounts) {
  const normalized = new Map();
  if (tagCounts instanceof Map) {
    for (const [tag, count] of tagCounts.entries()) {
      const normalizedTag = normalizeHashtag(tag);
      if (!normalizedTag) {
        continue;
      }
      const countValue = Number(count);
      if (Number.isFinite(countValue) && countValue > 0) {
        normalized.set(normalizedTag, countValue);
      }
    }
    return normalized;
  }

  if (isPlainObject(tagCounts)) {
    for (const [tag, count] of Object.entries(tagCounts)) {
      const normalizedTag = normalizeHashtag(tag);
      if (!normalizedTag) {
        continue;
      }
      const countValue = Number(count);
      if (Number.isFinite(countValue) && countValue > 0) {
        normalized.set(normalizedTag, countValue);
      }
    }
  }

  return normalized;
}

function buildHistoryWeights(tagCounts) {
  const weights = new Map();
  if (!tagCounts || tagCounts.size === 0) {
    return weights;
  }

  let maxCount = 0;
  for (const count of tagCounts.values()) {
    if (count > maxCount) {
      maxCount = count;
    }
  }

  if (!Number.isFinite(maxCount) || maxCount <= 0) {
    return weights;
  }

  const maxScale = Math.log1p(maxCount);
  for (const [tag, count] of tagCounts.entries()) {
    const scaled = Math.log1p(count) / maxScale;
    if (Number.isFinite(scaled) && scaled > 0) {
      weights.set(tag, scaled);
    }
  }

  return weights;
}

function resolveIdfValue(idfMap, tag) {
  if (!idfMap || !tag) {
    return 1;
  }
  if (idfMap instanceof Map) {
    const value = Number(idfMap.get(tag));
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  if (isPlainObject(idfMap)) {
    const value = Number(idfMap[tag]);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  return 1;
}

function buildVideoVector(video, idfMap) {
  const vector = new Map();
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
    const idf = resolveIdfValue(idfMap, tag);
    const current = vector.get(tag) || 0;
    vector.set(tag, current + idf);
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

function combineUserVector({ interests, disinterests, historyWeights }) {
  const vector = new Map();

  if (interests && interests.size) {
    for (const tag of interests) {
      vector.set(tag, (vector.get(tag) || 0) + 1);
    }
  }

  if (disinterests && disinterests.size) {
    for (const tag of disinterests) {
      vector.set(tag, (vector.get(tag) || 0) - 2);
    }
  }

  if (historyWeights && historyWeights.size) {
    for (const [tag, weight] of historyWeights.entries()) {
      vector.set(tag, (vector.get(tag) || 0) + weight);
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

function resolvePopularityValue(video, item) {
  const candidates = [
    video?.viewCount,
    video?.views,
    video?.stats?.views,
    video?.stats?.viewCount,
    video?.metrics?.views,
    item?.metadata?.viewCount,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return 0;
}

function resolveTimestamp(video) {
  const candidates = [
    video?.rootCreatedAt,
    video?.nip71Source?.created_at,
    video?.created_at,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }

  return null;
}

function resolveWeights(options, context) {
  const weights = { ...DEFAULT_WEIGHTS };
  const overrides = [options?.weights, context?.runtime?.exploreWeights];
  for (const candidate of overrides) {
    if (!isPlainObject(candidate)) {
      continue;
    }
    for (const key of Object.keys(weights)) {
      if (Number.isFinite(candidate[key])) {
        weights[key] = candidate[key];
      }
    }
  }
  return weights;
}

function resolveFreshnessHalfLife(options, context) {
  const candidates = [options?.freshnessHalfLifeDays, context?.runtime?.exploreFreshnessHalfLifeDays];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return DEFAULT_FRESHNESS_HALF_LIFE_DAYS;
}

function resolvePopularityMax(options, context) {
  const candidates = [options?.popularityMax, context?.runtime?.explorePopularityMax];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 0;
}

function resolveNow(context) {
  const candidate = Number(context?.runtime?.now);
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.floor(candidate);
  }
  return Math.floor(Date.now() / 1000);
}

export function createExploreScorerStage({ stageName = "explore-scorer", ...options } = {}) {
  return async function exploreScorerStage(items = [], context = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      return items;
    }

    const tagPreferences = context?.runtime?.tagPreferences;
    const interests = normalizeTagSet(tagPreferences?.interests);
    const disinterests = normalizeTagSet(tagPreferences?.disinterests);
    const historyCounts = normalizeTagCountMap(context?.runtime?.watchHistoryTagCounts);
    const historyWeights = buildHistoryWeights(historyCounts);
    const userVector = combineUserVector({ interests, disinterests, historyWeights });
    const idfMap = context?.runtime?.exploreTagIdf;
    const weights = resolveWeights(options, context);
    const popularityMax = resolvePopularityMax(options, context);
    const freshnessHalfLifeDays = resolveFreshnessHalfLife(options, context);
    const now = resolveNow(context);

    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const video = item.video;
      if (!video || typeof video !== "object") {
        continue;
      }

      const videoVector = buildVideoVector(video, idfMap);
      const videoTags = new Set(videoVector.keys());
      const totalVideoWeight = Array.from(videoVector.values()).reduce(
        (sum, value) => sum + (Number.isFinite(value) ? value : 0),
        0,
      );

      const historySimilarity = cosineSimilarity(userVector, videoVector);
      const historySimilarityPositive = Math.max(0, historySimilarity);
      const novelty = historyWeights.size ? clamp01(1 - historySimilarityPositive) : 0;

      let newTagFraction = 0;
      if (videoTags.size > 0) {
        let newCount = 0;
        for (const tag of videoTags) {
          if (!historyCounts.has(tag)) {
            newCount += 1;
          }
        }
        newTagFraction = clamp01(newCount / videoTags.size);
      }

      let disinterestOverlap = 0;
      if (disinterests.size > 0 && videoVector.size > 0 && totalVideoWeight > 0) {
        let disinterestWeight = 0;
        for (const [tag, weight] of videoVector.entries()) {
          if (disinterests.has(tag)) {
            disinterestWeight += weight;
          }
        }
        disinterestOverlap = clamp01(disinterestWeight / totalVideoWeight);
      }

      let popularityNorm = 0;
      if (popularityMax > 0) {
        const viewCount = resolvePopularityValue(video, item);
        const normalized = Math.log1p(viewCount) / Math.log1p(popularityMax);
        popularityNorm = clamp01(normalized);
      }

      let freshness = 0;
      const createdAt = resolveTimestamp(video);
      if (createdAt && freshnessHalfLifeDays > 0) {
        const ageSeconds = Math.max(0, now - createdAt);
        const ageDays = ageSeconds / 86400;
        const decay = Math.exp(-ageDays / freshnessHalfLifeDays);
        freshness = clamp01(decay);
      }

      const score = clamp01(
        weights.novelty * novelty +
          weights.freshness * freshness +
          weights.historySimilarity * historySimilarityPositive +
          weights.newTagFraction * newTagFraction +
          weights.popularityNorm * popularityNorm -
          weights.disinterestOverlap * disinterestOverlap,
      );

      if (!isPlainObject(item.metadata)) {
        item.metadata = {};
      }

      item.metadata.exploreScore = score;
      item.metadata.exploreComponents = {
        novelty,
        newTagFraction,
        disinterestOverlap,
        historySimilarity,
        popularityNorm,
        freshness,
        tags: Array.from(videoTags),
      };

      const videoId = typeof video.id === "string" ? video.id : null;
      const pubkey = typeof video.pubkey === "string" ? video.pubkey : null;

      const positiveComponents = [
        { key: "novelty", value: novelty },
        { key: "freshness", value: freshness },
        { key: "history-similarity", value: historySimilarityPositive },
        { key: "new-tag-fraction", value: newTagFraction },
        { key: "popularity", value: popularityNorm },
      ];

      let dominantPositive = positiveComponents[0];
      for (const component of positiveComponents) {
        if (component.value > dominantPositive.value) {
          dominantPositive = component;
        }
      }

      if (dominantPositive.value > 0) {
        context?.addWhy?.({
          stage: stageName,
          type: "score",
          reason: dominantPositive.key,
          value: dominantPositive.value,
          score,
          videoId,
          pubkey,
        });
      }

      if (disinterestOverlap > 0) {
        context?.addWhy?.({
          stage: stageName,
          type: "score",
          reason: "disinterest-overlap",
          value: disinterestOverlap,
          score,
          videoId,
          pubkey,
        });
      }
    }

    return items;
  };
}
