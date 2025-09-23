// js/videoEventUtils.js

/**
 * Extracts normalized fields from a Bitvid video event while
 * tolerating legacy payloads that may omit version >= 2 metadata.
 */
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
  const urlCandidates = [];

  const pushUnique = (arr, value) => {
    if (!value || typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    arr.push(trimmed);
  };

  if (typeof parsedContent.magnet === "string") {
    pushUnique(magnetCandidates, parsedContent.magnet);
  }
  if (typeof parsedContent.url === "string") {
    const parsedUrl = parsedContent.url.trim();
    if (parsedUrl && parsedUrl !== thumbnail) {
      pushUnique(urlCandidates, parsedUrl);
    }
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const urlTagKeys = new Set(["r", "url", "u"]);
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) continue;
    const key = typeof tag[0] === "string" ? tag[0] : "";
    const value = typeof tag[1] === "string" ? tag[1] : "";
    if (!value) continue;

    if (value.toLowerCase().startsWith("magnet:")) {
      pushUnique(magnetCandidates, value);
      continue;
    }

    if (urlTagKeys.has(key) && /^https?:\/\//i.test(value)) {
      pushUnique(urlCandidates, value);
    }
  }

  const magnetMatch = rawContent.match(/magnet:\?xt=urn:[^"'\s<>]+/i);
  if (magnetMatch) {
    pushUnique(magnetCandidates, magnetMatch[0]);
  }

  const magnet = magnetCandidates.find(Boolean) || "";
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
    version,
  };
}
