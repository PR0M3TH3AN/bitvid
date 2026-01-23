// js/feedEngine/kidsScoring.js

import { normalizeHashtag } from "../utils/hashtagNormalization.js";
import { isPlainObject, toSet } from "./utils.js";

const DEFAULT_WEIGHTS = Object.freeze({
  w_age: 0.35,
  w_edu: 0.25,
  w_author: 0.15,
  w_pop: 0.1,
  w_fresh: 0.1,
  w_risk: 0.6,
});

const DEFAULT_FRESHNESS_HALF_LIFE_DAYS = 14;

const AGE_GROUP_DEFAULTS = Object.freeze({
  toddler: {
    maxDurationSeconds: 5 * 60,
    preferredTags: ["toddler", "baby", "nursery", "colors", "shapes", "lullaby"],
    educationalTags: ["abc", "numbers", "counting", "learning", "alphabet"],
  },
  preschool: {
    maxDurationSeconds: 10 * 60,
    preferredTags: ["preschool", "kindergarten", "storytime", "letters", "phonics"],
    educationalTags: ["counting", "alphabet", "reading", "learning", "math"],
  },
  early: {
    maxDurationSeconds: 15 * 60,
    preferredTags: ["early", "kids", "reading", "science", "animals", "art"],
    educationalTags: ["science", "math", "reading", "history", "geography"],
  },
  older: {
    maxDurationSeconds: 20 * 60,
    preferredTags: ["tween", "teens", "tutorial", "stem", "coding", "music"],
    educationalTags: ["stem", "coding", "history", "geography", "tutorial"],
  },
});

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

function normalizeTagSetFromVideo(video) {
  const normalized = new Set();
  if (!video || typeof video !== "object") {
    return normalized;
  }

  const addTag = (rawTag) => {
    if (typeof rawTag !== "string") {
      return;
    }
    const tag = normalizeHashtag(rawTag);
    if (tag) {
      normalized.add(tag);
    }
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

  return normalized;
}

function normalizeTagSet(values) {
  const normalized = new Set();
  if (!values) {
    return normalized;
  }

  for (const value of toSet(values)) {
    if (typeof value !== "string") {
      continue;
    }
    const tag = normalizeHashtag(value);
    if (tag) {
      normalized.add(tag);
    }
  }

  return normalized;
}

function resolveAgeProfile(ageGroup) {
  const key = typeof ageGroup === "string" ? ageGroup.trim().toLowerCase() : "";
  return AGE_GROUP_DEFAULTS[key] || AGE_GROUP_DEFAULTS.preschool;
}

function resolveDuration(video) {
  const candidates = [video?.duration, video?.metadata?.duration];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function resolveWeights(options, context) {
  const weights = { ...DEFAULT_WEIGHTS };
  const overrides = [options?.weights, context?.runtime?.kidsWeights];
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
  const candidates = [options?.freshnessHalfLifeDays, context?.runtime?.kidsFreshnessHalfLifeDays];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return DEFAULT_FRESHNESS_HALF_LIFE_DAYS;
}

function resolvePopularityMax(options, context) {
  const candidates = [
    options?.popularityMax,
    context?.runtime?.kidsPopularityMax,
    context?.runtime?.explorePopularityMax,
  ];
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

function resolveKidsPopularityValue(video, item) {
  const candidates = [
    video?.kidsViews,
    video?.stats?.kidsViews,
    video?.metrics?.kidsViews,
    item?.metadata?.kidsViews,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return null;
}

function resolveGlobalPopularityValue(video, item) {
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

function resolveSafetyScore(item) {
  const moderation = item?.metadata?.moderation || item?.video?.moderation || {};
  if (moderation.hidden === true) {
    return 0;
  }

  const trustedMuted = moderation.trustedMuted === true;
  const trustedCount = Number(moderation.trustedCount ?? moderation.trustedReportCount);
  let penalty = 0;

  if (Number.isFinite(trustedCount) && trustedCount > 0) {
    penalty = Math.min(1, trustedCount / 3) * 0.7;
  }

  if (trustedMuted) {
    penalty = Math.max(penalty, 0.9);
  }

  return clamp01(1 - penalty);
}

function computeTagMatchScore(tags, preferredTags) {
  if (!tags || tags.size === 0 || preferredTags.size === 0) {
    return 0.4;
  }

  let matches = 0;
  for (const tag of preferredTags) {
    if (tags.has(tag)) {
      matches += 1;
    }
  }

  const divisor = Math.min(3, preferredTags.size);
  return clamp01(matches / divisor);
}

export function createKidsScorerStage({
  stageName = "kids-scorer",
  ageGroup = "preschool",
  educationalTags,
  weights,
  ...options
} = {}) {
  return async function kidsScorerStage(items = [], context = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      return items;
    }

    const ageProfile = resolveAgeProfile(ageGroup);
    const preferredTags = normalizeTagSet(ageProfile.preferredTags);
    const defaultEducationalTags = normalizeTagSet(ageProfile.educationalTags);
    const educationalTagSet = educationalTags ? normalizeTagSet(educationalTags) : defaultEducationalTags;
    const resolvedWeights = resolveWeights({ weights, ...options }, context);
    const freshnessHalfLifeDays = resolveFreshnessHalfLife(options, context);
    const popularityMax = resolvePopularityMax(options, context);
    const now = resolveNow(context);

    const trustedAuthors = toSet(context?.runtime?.trustedAuthors);
    const trustedAuthorSet = new Set();
    for (const author of trustedAuthors) {
      if (typeof author === "string") {
        trustedAuthorSet.add(author.toLowerCase());
      }
    }

    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const video = item.video;
      if (!video || typeof video !== "object") {
        continue;
      }

      const tags = normalizeTagSetFromVideo(video);
      const duration = resolveDuration(video);
      let durationScore = 0.5;
      if (Number.isFinite(duration) && duration > 0) {
        const ratio = duration / ageProfile.maxDurationSeconds;
        durationScore = ratio <= 1 ? 1 : clamp01(1 / ratio);
      }

      const tagScore = computeTagMatchScore(tags, preferredTags);
      const ageAppropriateness = clamp01(0.6 * durationScore + 0.4 * tagScore);

      let educationalBoost = 0;
      if (educationalTagSet.size > 0 && tags.size > 0) {
        let matches = 0;
        for (const tag of educationalTagSet) {
          if (tags.has(tag)) {
            matches += 1;
          }
        }
        const divisor = Math.min(3, educationalTagSet.size);
        educationalBoost = clamp01(matches / divisor);
      }

      let authorTrust = 0;
      if (trustedAuthorSet.size > 0 && typeof video.pubkey === "string") {
        authorTrust = trustedAuthorSet.has(video.pubkey.toLowerCase()) ? 1 : 0;
      }

      let popularityWithinKids = 0;
      const kidsViews = resolveKidsPopularityValue(video, item);
      const popularityValue = kidsViews === null ? resolveGlobalPopularityValue(video, item) : kidsViews;
      if (popularityMax > 0) {
        const normalized = Math.log1p(popularityValue) / Math.log1p(popularityMax);
        popularityWithinKids = clamp01(normalized);
      } else if (popularityValue > 0) {
        popularityWithinKids = clamp01(Math.log1p(popularityValue) / Math.log1p(popularityValue + 100));
      }

      let freshness = 0;
      const createdAt = Number(video?.rootCreatedAt ?? video?.nip71Source?.created_at ?? video?.created_at);
      if (Number.isFinite(createdAt) && createdAt > 0 && freshnessHalfLifeDays > 0) {
        const ageSeconds = Math.max(0, now - Math.floor(createdAt));
        const ageDays = ageSeconds / 86400;
        const decay = Math.exp(-ageDays / freshnessHalfLifeDays);
        freshness = clamp01(decay);
      }

      const safetyScore = resolveSafetyScore(item);

      const baseScore =
        resolvedWeights.w_age * ageAppropriateness +
        resolvedWeights.w_edu * educationalBoost +
        resolvedWeights.w_author * authorTrust +
        resolvedWeights.w_pop * popularityWithinKids +
        resolvedWeights.w_fresh * freshness;

      const riskMultiplier = clamp01(1 - resolvedWeights.w_risk * (1 - safetyScore));
      const kidsScore = clamp01(baseScore * riskMultiplier);

      if (!isPlainObject(item.metadata)) {
        item.metadata = {};
      }

      item.metadata.kidsScore = kidsScore;
      item.metadata.kidsScoreComponents = {
        ageAppropriateness,
        educationalBoost,
        authorTrust,
        popularityWithinKids,
        freshness,
        safetyScore,
      };

      const videoId = typeof video.id === "string" ? video.id : null;
      const pubkey = typeof video.pubkey === "string" ? video.pubkey : null;

      const positiveComponents = [
        { key: "age-appropriateness", value: ageAppropriateness },
        { key: "educational-boost", value: educationalBoost },
        { key: "author-trust", value: authorTrust },
        { key: "popularity", value: popularityWithinKids },
        { key: "freshness", value: freshness },
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
          score: kidsScore,
          videoId,
          pubkey,
        });
      }
    }

    return items;
  };
}
