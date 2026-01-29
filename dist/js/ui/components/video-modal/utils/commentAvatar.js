export function normalizeCommentAvatarKey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.toLowerCase();
}

export function resolveCommentAvatarAsset({
  cache,
  failures,
  defaultAvatar,
  pubkey,
  sanitizedPicture,
}) {
  const normalizedPubkey = normalizeCommentAvatarKey(pubkey);
  const normalizedSource =
    typeof sanitizedPicture === "string" && sanitizedPicture
      ? sanitizedPicture
      : "";

  if (normalizedSource && failures?.has?.(normalizedSource)) {
    return { url: defaultAvatar, source: "" };
  }

  if (normalizedPubkey && cache?.has?.(normalizedPubkey)) {
    const cached = cache.get(normalizedPubkey);
    if (cached) {
      const cachedSource =
        typeof cached.source === "string" ? cached.source : "";
      const cachedUrl =
        typeof cached.url === "string" && cached.url
          ? cached.url
          : defaultAvatar;

      if (!normalizedSource || cachedSource === normalizedSource) {
        return { url: cachedUrl, source: cachedSource };
      }
    }
  }

  const resolvedUrl = normalizedSource || defaultAvatar;
  if (normalizedPubkey && cache) {
    cache.set(normalizedPubkey, { url: resolvedUrl, source: normalizedSource });
  }

  return { url: resolvedUrl, source: normalizedSource };
}

export function registerCommentAvatarFailure({
  cache,
  failures,
  defaultAvatar,
  sourceUrl,
}) {
  if (typeof sourceUrl !== "string") {
    return;
  }
  const trimmed = sourceUrl.trim();
  if (!trimmed || trimmed === defaultAvatar) {
    return;
  }

  if (!failures?.has?.(trimmed)) {
    failures?.add?.(trimmed);
  }

  if (!cache?.forEach) {
    return;
  }

  cache.forEach((entry, key) => {
    if (entry && entry.source === trimmed) {
      cache.set(key, { url: defaultAvatar, source: "" });
    }
  });
}
