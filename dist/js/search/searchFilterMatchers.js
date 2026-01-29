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
      const duration = Number(video.nip71?.duration);
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
