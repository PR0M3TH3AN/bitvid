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

export function parseVideoEventPayload(event = {}) {
  const rawContent = typeof event.content === "string" ? event.content : "";

  let parsedContent = {};
  let parseError = null;
  if (rawContent) {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object") {
        parsedContent = parsed;
      }
    } catch (err) {
      parseError = err;
      parsedContent = {};
    }
  }

  const title = typeof parsedContent.title === "string"
    ? parsedContent.title.trim()
    : "";
  const thumbnail = typeof parsedContent.thumbnail === "string"
    ? parsedContent.thumbnail.trim()
    : "";

  const magnetCandidates = [];
  const infoHashCandidates = [];
  const urlCandidates = [];

  const pushUnique = (arr, value) => {
    if (!value || typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    arr.push(trimmed);
  };

  const pushInfoHash = (candidate) => {
    if (!candidate) return;
    const normalized = candidate.toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(normalized)) {
      return;
    }
    if (infoHashCandidates.includes(normalized)) {
      return;
    }
    infoHashCandidates.push(normalized);
  };

  const collectMagnetOrInfoHash = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    if (MAGNET_URI_PATTERN.test(trimmed)) {
      pushUnique(magnetCandidates, trimmed);
    }

    extractInfoHashesFromString(trimmed, pushInfoHash);

    const urnMatch = trimmed.match(/^urn:btih:([0-9a-z]+)$/i);
    if (urnMatch) {
      pushInfoHash(urnMatch[1]);
    }
  };

  if (typeof parsedContent.magnet === "string") {
    collectMagnetOrInfoHash(parsedContent.magnet);
  }
  if (typeof parsedContent.url === "string") {
    const parsedUrl = parsedContent.url.trim();
    if (parsedUrl && parsedUrl !== thumbnail) {
      // Keep this guard so we don't duplicate thumbnail URLs in the playable URL list.
      pushUnique(urlCandidates, parsedUrl);
    }
    // Legacy bitvid events sometimes embedded magnets/info-hashes in the URL field, so treat it accordingly.
    collectMagnetOrInfoHash(parsedUrl);
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const urlTagKeys = new Set(["r", "url", "u"]);
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    const key = typeof tag[0] === "string" ? tag[0] : "";
    const value = typeof tag[1] === "string" ? tag[1] : "";
    if (!value) continue;

    if (value.toLowerCase().startsWith("magnet:")) {
      collectMagnetOrInfoHash(value);
      continue;
    }

    if (urlTagKeys.has(key) && /^https?:\/\//i.test(value)) {
      pushUnique(urlCandidates, value);
    }

    collectMagnetOrInfoHash(value);
  }

  traverseForInfoHashes(parsedContent, pushInfoHash);

  const magnet = magnetCandidates.find(Boolean) || "";
  const infoHash = infoHashCandidates.find(Boolean) || "";
  const url =
    urlCandidates.find(
      (candidate) => candidate && !candidate.toLowerCase().startsWith("magnet:")
    ) || "";

  const rawVersion = parsedContent.version;
  let version = 0;
  if (typeof rawVersion === "number" && Number.isFinite(rawVersion)) {
    version = rawVersion;
  } else if (typeof rawVersion === "string") {
    const parsedVersion = Number(rawVersion);
    if (!Number.isNaN(parsedVersion)) {
      version = parsedVersion;
    }
  }

  return {
    parsedContent,
    parseError,
    title,
    url,
    magnet,
    infoHash,
    version,
  };
}
