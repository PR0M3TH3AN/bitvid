import { ALLOW_NSFW_CONTENT } from "../config.js";

export function buildVideoSearchFilterMatcher(filters = {}, options = {}) {
  const allowNsfw = options.allowNsfw ?? ALLOW_NSFW_CONTENT;
  const authorSet = new Set(
    Array.isArray(filters?.authorPubkeys)
      ? filters.authorPubkeys.map((author) => author.toLowerCase())
      : [],
  );
  const tagSet = new Set(
    Array.isArray(filters?.tags) ? filters.tags.map((tag) => tag.toLowerCase()) : [],
  );
  const afterDate = Number.isFinite(filters?.dateRange?.after)
    ? filters.dateRange.after
    : null;
  const beforeDate = Number.isFinite(filters?.dateRange?.before)
    ? filters.dateRange.before
    : null;
  const minDuration = Number.isFinite(filters?.duration?.minSeconds)
    ? filters.duration.minSeconds
    : null;
  const maxDuration = Number.isFinite(filters?.duration?.maxSeconds)
    ? filters.duration.maxSeconds
    : null;
  const hasMagnet = filters?.hasMagnet === true;
  const hasUrl = filters?.hasUrl === true;
  const nsfwFilter = typeof filters?.nsfw === "string" ? filters.nsfw : "any";

  return (video) => {
    if (!video) return false;

    if (authorSet.size > 0) {
      const pubkey = typeof video.pubkey === "string" ? video.pubkey.toLowerCase() : "";
      if (!pubkey || !authorSet.has(pubkey)) return false;
    }

    if (tagSet.size > 0) {
      const tags = Array.isArray(video.tags) ? video.tags : [];
      const hasTag = tags.some((tag) => {
        if (Array.isArray(tag)) {
          return tag[0] === "t" && tagSet.has(String(tag[1] || "").toLowerCase());
        }
        return tagSet.has(String(tag || "").toLowerCase());
      });
      if (!hasTag) return false;
    }

    if (Number.isFinite(afterDate) && (!Number.isFinite(video.created_at) || video.created_at < afterDate)) {
      return false;
    }
    if (Number.isFinite(beforeDate) && (!Number.isFinite(video.created_at) || video.created_at > beforeDate)) {
      return false;
    }

    if (hasMagnet && !video.magnet) return false;
    if (hasUrl && !video.url) return false;

    if (Number.isFinite(minDuration) || Number.isFinite(maxDuration)) {
      // Both video types carry duration differently: bitvid's kind-30078 puts
      // it top-level (captured at upload); ingested NIP-71 (21/22/34235/34236)
      // nests it in nip71 metadata. Future live (30311) / shorts use the same
      // shapes, so check both.
      const duration = Number(video.duration) || Number(video.nip71?.duration);
      if (!Number.isFinite(duration)) return false;
      if (Number.isFinite(minDuration) && duration < minDuration) return false;
      if (Number.isFinite(maxDuration) && duration > maxDuration) return false;
    }

    if (allowNsfw !== true && video.isNsfw === true) {
      return false;
    }

    if (allowNsfw === true) {
      if ((nsfwFilter === "true" || nsfwFilter === "only") && video.isNsfw !== true) {
        return false;
      }
      if (nsfwFilter === "false" && video.isNsfw === true) {
        return false;
      }
    }

    return true;
  };
}

// Sort search results per the modal's Sort By options. Pure + injectable
// (getViews) so it is unit-testable. "recent" (and the "relevance" default)
// keep newest-first; "views" ranks by the shared view-count cache; "trending"
// weights views by recency (views / age-in-days^1.5, same spirit as the
// Trending tab); "longest" ranks by duration.
export function sortSearchResults(videos, sort, { getViews, now = Date.now() } = {}) {
  const list = Array.isArray(videos) ? [...videos] : [];
  const views = (video) => {
    if (typeof getViews !== "function") return 0;
    const value = getViews(video);
    return Number.isFinite(value) ? value : 0;
  };
  const createdAt = (video) => Number(video?.created_at) || 0;
  const duration = (video) =>
    Number(video?.duration) || Number(video?.nip71?.duration) || 0;

  switch (sort) {
    case "views":
      return list.sort((a, b) => views(b) - views(a) || createdAt(b) - createdAt(a));
    case "trending": {
      const score = (video) => {
        const ageDays = Math.max((now / 1000 - createdAt(video)) / 86400, 0.25);
        return views(video) / Math.pow(ageDays, 1.5);
      };
      return list.sort((a, b) => score(b) - score(a) || createdAt(b) - createdAt(a));
    }
    case "longest":
      return list.sort((a, b) => duration(b) - duration(a) || createdAt(b) - createdAt(a));
    case "recent":
    default:
      return list.sort((a, b) => createdAt(b) - createdAt(a));
  }
}
