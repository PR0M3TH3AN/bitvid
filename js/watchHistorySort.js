// js/watchHistorySort.js

export function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getWatchedAtScore(video) {
  if (!video || typeof video !== "object") {
    return Number.NEGATIVE_INFINITY;
  }

  const watchedAt = toNumber(video?.watchHistory?.watchedAt, Number.NaN);
  if (Number.isFinite(watchedAt)) {
    return watchedAt;
  }

  const createdAtSeconds = toNumber(video?.created_at, Number.NaN);
  if (Number.isFinite(createdAtSeconds)) {
    return createdAtSeconds * 1000;
  }

  return Number.NEGATIVE_INFINITY;
}

export function compareByWatchedAtDesc(a, b) {
  const aScore = getWatchedAtScore(a);
  const bScore = getWatchedAtScore(b);

  if (aScore !== bScore) {
    return bScore - aScore;
  }

  const aCreated = toNumber(a?.created_at, Number.NEGATIVE_INFINITY);
  const bCreated = toNumber(b?.created_at, Number.NEGATIVE_INFINITY);

  if (aCreated !== bCreated) {
    return bCreated - aCreated;
  }

  const aId = typeof a?.id === "string" ? a.id : "";
  const bId = typeof b?.id === "string" ? b.id : "";

  return aId.localeCompare(bId);
}
