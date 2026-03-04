function toFiniteTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.floor(numeric));
}

function normalizeEventId(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

export function compareListEventsDesc(a, b, options = {}) {
  const timestampA = toFiniteTimestamp(a?.created_at);
  const timestampB = toFiniteTimestamp(b?.created_at);
  if (timestampA !== timestampB) {
    return timestampB - timestampA;
  }

  const preferredKinds = Array.isArray(options.preferredKinds)
    ? options.preferredKinds
    : [];
  if (preferredKinds.length) {
    const rank = new Map(
      preferredKinds.map((kind, index) => [Number(kind), index]),
    );
    const rankA = rank.has(Number(a?.kind)) ? rank.get(Number(a?.kind)) : Number.MAX_SAFE_INTEGER;
    const rankB = rank.has(Number(b?.kind)) ? rank.get(Number(b?.kind)) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
  }

  const idA = normalizeEventId(a?.id);
  const idB = normalizeEventId(b?.id);
  if (idA !== idB) {
    return idA < idB ? 1 : -1;
  }

  return 0;
}

export function selectNewestListEvent(events, options = {}) {
  if (!Array.isArray(events) || !events.length) {
    return null;
  }

  let newest = null;
  for (const event of events) {
    if (!event || typeof event !== "object") {
      continue;
    }
    if (!newest || compareListEventsDesc(event, newest, options) < 0) {
      newest = event;
    }
  }

  return newest;
}

export function computeIncrementalSinceWithOverlap(createdAt, overlapSeconds = 1) {
  const normalizedCreatedAt = toFiniteTimestamp(createdAt);
  const normalizedOverlap = Number.isFinite(overlapSeconds)
    ? Math.max(0, Math.floor(overlapSeconds))
    : 0;
  return Math.max(0, normalizedCreatedAt - normalizedOverlap);
}
