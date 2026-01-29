// js/videoEventUtils.js

/**
 * Extracts normalized fields from a bitvid video event while
 * tolerating legacy payloads that may omit version >= 2 metadata.
 */
const MAGNET_URI_PATTERN = /^magnet:\?/i;
const HEX_INFO_HASH_PATTERN = /\b[0-9a-f]{40}\b/gi;

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirstString(values = []) {
  if (!Array.isArray(values)) {
    return "";
  }

  for (const value of values) {
    const trimmed = safeTrim(value);
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

export function deriveTitleFromEvent({
  parsedContent = {},
  tags = [],
  primaryTitle = "",
} = {}) {
  const initial = safeTrim(primaryTitle);
  if (initial) {
    return initial;
  }

  const directCandidates = pickFirstString([
    parsedContent?.title,
    parsedContent?.name,
    parsedContent?.filename,
    parsedContent?.fileName,
    parsedContent?.subject,
    parsedContent?.caption,
  ]);
  if (directCandidates) {
    return directCandidates;
  }

  const metaTitle = safeTrim(parsedContent?.meta?.title);
  if (metaTitle) {
    return metaTitle;
  }

  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      const key = safeTrim(tag[0]).toLowerCase();
      if (!key) {
        continue;
      }
      if (["title", "subject", "caption", "name"].includes(key)) {
        const candidate = safeTrim(tag[1]);
        if (candidate) {
          return candidate;
        }
      }
    }
  }

  return "";
}

function extractInfoHashesFromString(value, pushInfoHash) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const matches = trimmed.match(HEX_INFO_HASH_PATTERN);
  if (!matches) {
    return;
  }

  for (const match of matches) {
    const normalized = match.toLowerCase();
    pushInfoHash(normalized);
  }
}

function traverseForInfoHashes(value, pushInfoHash) {
  if (!value) {
    return;
  }
  if (typeof value === "string") {
    extractInfoHashesFromString(value, pushInfoHash);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      traverseForInfoHashes(item, pushInfoHash);
    }
    return;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value)) {
      traverseForInfoHashes(nested, pushInfoHash);
    }
  }
}
