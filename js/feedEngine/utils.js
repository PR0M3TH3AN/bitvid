// js/feedEngine/utils.js

import { normalizeHashtag } from "../utils/hashtagNormalization.js";

export const NORMALIZED_ARRAY_MARKER = Symbol("FeedItemsNormalized");

const videoTagCache = new WeakMap();

export function markAsNormalized(items) {
  if (Array.isArray(items)) {
    items[NORMALIZED_ARRAY_MARKER] = true;
  }
  return items;
}

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

export function getVideoTags(video) {
  if (!video || typeof video !== "object") {
    return new Set();
  }

  if (videoTagCache.has(video)) {
    return videoTagCache.get(video);
  }

  const normalized = new Set();

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
      if (Array.isArray(tag) && tag[0] === "t" && typeof tag[1] === "string") {
        addTag(tag[1]);
      }
    }
  }

  if (Array.isArray(video.nip71?.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      addTag(tag);
    }
  }

  videoTagCache.set(video, normalized);
  return normalized;
}

export function hasDisinterestedTag(video, disinterestsSet) {
  if (!video || !disinterestsSet || !(disinterestsSet instanceof Set) || disinterestsSet.size === 0) {
    return false;
  }

  const tags = getVideoTags(video);
  for (const tag of tags) {
    if (disinterestsSet.has(tag)) {
      return true;
    }
  }

  return false;
}
