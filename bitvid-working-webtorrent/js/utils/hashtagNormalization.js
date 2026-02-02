// js/utils/hashtagNormalization.js

const HASH_PREFIX_PATTERN = /^#+/;

/**
 * Normalize hashtags consistently across storage, matching, and UI validation.
 *
 * Normalization rules:
 * 1) Trim surrounding whitespace.
 * 2) Strip leading "#" characters.
 * 3) Lowercase the remaining value.
 *
 * Note: We do not strip punctuation today. Only add punctuation stripping if
 * product explicitly decides to change the rules.
 *
 * @param {string} value
 * @returns {string} normalized hashtag or empty string when invalid.
 */
export function normalizeHashtag(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const withoutHashes = trimmed.replace(HASH_PREFIX_PATTERN, "").trim();
  if (!withoutHashes) {
    return "";
  }

  return withoutHashes.toLowerCase();
}

/**
 * Format a hashtag for display, ensuring a single leading hash.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatHashtag(value) {
  const normalized = normalizeHashtag(value);
  if (!normalized) {
    return "";
  }

  return `#${normalized}`;
}
