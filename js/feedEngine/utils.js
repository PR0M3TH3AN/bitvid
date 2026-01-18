// js/feedEngine/utils.js

import { normalizeHashtag } from "../utils/hashtagNormalization.js";

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function toSet(values) {
  if (values instanceof Set) {
    return new Set(values);
  }
  if (Array.isArray(values)) {
    return new Set(values);
  }
  return new Set();
}

export function toArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return [...value];
  }
  return [value];
}

export function normalizeTagSet(values) {
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

export function countMatchingTags(video, tagSet) {
  if (!video || !tagSet || !(tagSet instanceof Set) || tagSet.size === 0) {
    return 0;
  }

  const matches = new Set();

  const addMatch = (tag) => {
    const normalized = normalizeHashtag(tag);
    if (normalized && tagSet.has(normalized)) {
      matches.add(normalized);
    }
  };

  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (Array.isArray(tag) && tag[0] === "t" && typeof tag[1] === "string") {
        addMatch(tag[1]);
      }
    }
  }

  if (video.nip71 && Array.isArray(video.nip71.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      if (typeof tag === "string") {
        addMatch(tag);
      }
    }
  }

  return matches.size;
}

export function hasDisinterestedTag(video, disinterestsSet) {
  return countMatchingTags(video, disinterestsSet) > 0;
}
