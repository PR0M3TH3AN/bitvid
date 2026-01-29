// js/utils/videoTags.js

/**
 * @module utils/videoTags
 * @description Helpers for collecting and formatting normalized video tags from
 *               various metadata sources.
 */

const HASH_PREFIX_PATTERN = /^#+/;

function isObject(value) {
  return Boolean(value) && typeof value === "object";
}

function asIterableStrings(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function normalizeTagValue(rawValue) {
  if (typeof rawValue !== "string") {
    return "";
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  const withoutHashes = trimmed.replace(HASH_PREFIX_PATTERN, "").trim();

  return withoutHashes;
}

/**
 * Prefix a tag with `#` for display purposes, ensuring a single leading hash.
 *
 * @param {string} tag - The normalized tag to format.
 * @returns {string} The tag prefixed with `#` when a tag exists, otherwise an
 *                   empty string.
 */
export function formatTagDisplay(tag) {
  if (typeof tag !== "string") {
    return "";
  }

  const trimmed = tag.trim();
  if (!trimmed) {
    return "";
  }

  return `#${trimmed.replace(HASH_PREFIX_PATTERN, "").trim()}`;
}

/**
 * Collect normalized hashtags from a video object, deduping across NIP-71
 * metadata and traditional Nostr tag arrays. Results are sorted alphabetically
 * in a case-insensitive manner while preserving the first-seen casing.
 *
 * @param {object} video - Video metadata that may contain NIP-71 structured
 *                         fields or Nostr tag arrays.
 * @param {object} [options]
 * @param {boolean} [options.includeHashes=false] - When true, prefix `#` on the
 *                                                  returned tag strings.
 * @returns {string[]} Sorted list of unique tag strings.
 */
export function collectVideoTags(video, { includeHashes = false } = {}) {
  if (!isObject(video)) {
    return [];
  }

  const deduped = new Set();
  const collected = [];

  const pushTag = (rawValue) => {
    const normalized = normalizeTagValue(rawValue);
    if (!normalized) {
      return;
    }

    const lower = normalized.toLowerCase();
    if (deduped.has(lower)) {
      return;
    }

    deduped.add(lower);
    collected.push(normalized);
  };

  if (isObject(video.nip71)) {
    const { hashtags, t } = video.nip71;
    for (const candidate of asIterableStrings(hashtags)) {
      pushTag(candidate);
    }
    for (const candidate of asIterableStrings(t)) {
      pushTag(candidate);
    }
  }

  if (Array.isArray(video.tags)) {
    for (const tagTuple of video.tags) {
      if (!Array.isArray(tagTuple) || tagTuple.length < 2) {
        continue;
      }

      const [marker, value] = tagTuple;
      if (typeof marker !== "string" || marker.toLowerCase() !== "t") {
        continue;
      }

      pushTag(value);
    }
  }

  collected.sort((a, b) => {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if (lowerA === lowerB) {
      return a.localeCompare(b);
    }
    return lowerA.localeCompare(lowerB);
  });

  if (!includeHashes) {
    return collected;
  }

  return collected.map((tag) => formatTagDisplay(tag));
}

export default collectVideoTags;
