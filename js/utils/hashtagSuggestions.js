// Rank a user's previously-used hashtags by how many of their videos use each one,
// for the upload modal's one-tap suggestion chips (TODO #45). Pure + side-effect
// free so the ranking is unit-testable without the app shell.
//
// Input: an array of the user's own video objects. Each may carry hashtags as
// `nip71.hashtags` / `nip71.t` (parsed NIP-71 metadata) or as raw event `t` tags.
// Output: [{ tag, count }] sorted by count desc then alphabetically, normalized +
// deduped (a tag is counted once per video, so `count` = number of videos using it).

function normalizeTag(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/^#+/, "").toLowerCase();
}

export function extractVideoHashtags(video) {
  if (!video || typeof video !== "object") {
    return [];
  }
  const nip71 = video.nip71;
  if (nip71 && typeof nip71 === "object") {
    if (Array.isArray(nip71.hashtags)) {
      return nip71.hashtags;
    }
    if (Array.isArray(nip71.t)) {
      return nip71.t;
    }
  }
  // Fallback: raw event `t` tags, minus bitvid's fixed "video" marker tag.
  if (Array.isArray(video.tags)) {
    return video.tags
      .filter(
        (tag) =>
          Array.isArray(tag) &&
          tag[0] === "t" &&
          typeof tag[1] === "string" &&
          tag[1] &&
          tag[1] !== "video",
      )
      .map((tag) => tag[1]);
  }
  return [];
}

export function rankHashtagsByFrequency(videos, { limit } = {}) {
  const counts = new Map();
  const list = Array.isArray(videos) ? videos : [];

  for (const video of list) {
    const seenInThisVideo = new Set();
    for (const raw of extractVideoHashtags(video)) {
      const tag = normalizeTag(raw);
      if (!tag || seenInThisVideo.has(tag)) {
        continue;
      }
      seenInThisVideo.add(tag);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  const ranked = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return Number.isFinite(limit) && limit > 0 ? ranked.slice(0, limit) : ranked;
}

export default rankHashtagsByFrequency;
