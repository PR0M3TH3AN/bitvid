// js/feedEngine/utils.js

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

export function hasDisinterestedTag(video, disinterestsSet) {
  if (!video || !disinterestsSet || !(disinterestsSet instanceof Set) || disinterestsSet.size === 0) {
    return false;
  }

  // Check raw tags
  if (Array.isArray(video.tags)) {
    for (const tag of video.tags) {
      if (Array.isArray(tag) && tag[0] === "t" && typeof tag[1] === "string") {
        if (disinterestsSet.has(tag[1].toLowerCase())) {
          return true;
        }
      }
    }
  }

  // Check NIP-71 metadata hashtags if available
  if (video.nip71 && Array.isArray(video.nip71.hashtags)) {
    for (const tag of video.nip71.hashtags) {
      if (typeof tag === "string" && disinterestsSet.has(tag.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}
