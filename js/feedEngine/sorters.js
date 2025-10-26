// js/feedEngine/sorters.js

export function createChronologicalSorter({
  direction = "desc",
  postedAtResolver,
} = {}) {
  const normalizedDirection = direction === "asc" ? "asc" : "desc";

  return function chronologicalSorter(items = [], context = {}) {
    if (!Array.isArray(items)) {
      return [];
    }

    const copy = [...items];
    const getTimestamp = (entry) => {
      if (!entry || typeof entry !== "object") {
        return Number.NEGATIVE_INFINITY;
      }

      const video = entry.video;
      if (!video || typeof video !== "object") {
        return Number.NEGATIVE_INFINITY;
      }

      const resolvePostedAtHook = () => {
        if (typeof postedAtResolver === "function") {
          try {
            const resolved = postedAtResolver({ entry, context, video });
            if (Number.isFinite(resolved)) {
              return Math.floor(resolved);
            }
          } catch (error) {
            context?.log?.("[chronological-sorter] postedAtResolver threw", error);
          }
        }

        const hook = context?.hooks?.timestamps;
        if (!hook || typeof hook !== "object") {
          return null;
        }

        const candidates = [
          hook.getKnownVideoPostedAt,
          hook.getKnownPostedAt,
          hook.getVideoPostedAt,
          hook.resolveVideoPostedAt,
        ];

        for (const candidate of candidates) {
          if (typeof candidate !== "function") {
            continue;
          }

          try {
            const value = candidate(video, { entry, context });
            if (Number.isFinite(value)) {
              return Math.floor(value);
            }
          } catch (error) {
            context?.log?.(
              "[chronological-sorter] timestamps hook threw",
              error,
            );
          }
        }

        return null;
      };

      const hookTimestamp = resolvePostedAtHook();
      if (Number.isFinite(hookTimestamp)) {
        return hookTimestamp;
      }

      const rootCreatedAt = Number(video.rootCreatedAt);
      if (Number.isFinite(rootCreatedAt)) {
        return Math.floor(rootCreatedAt);
      }

      const nip71CreatedAt = Number(video?.nip71Source?.created_at);
      if (Number.isFinite(nip71CreatedAt)) {
        return Math.floor(nip71CreatedAt);
      }

      const createdAt = Number(video.created_at);
      if (Number.isFinite(createdAt)) {
        return Math.floor(createdAt);
      }

      return Number.NEGATIVE_INFINITY;
    };

    copy.sort((a, b) => {
      const aMuted =
        a?.metadata?.moderation?.trustedMuted === true ||
        a?.video?.moderation?.trustedMuted === true;
      const bMuted =
        b?.metadata?.moderation?.trustedMuted === true ||
        b?.video?.moderation?.trustedMuted === true;

      if (aMuted !== bMuted) {
        return aMuted ? 1 : -1;
      }

      const aTs = getTimestamp(a);
      const bTs = getTimestamp(b);
      const normalizedATs = Number.isFinite(aTs) ? aTs : Number.NEGATIVE_INFINITY;
      const normalizedBTs = Number.isFinite(bTs) ? bTs : Number.NEGATIVE_INFINITY;

      if (normalizedATs !== normalizedBTs) {
        const diff = normalizedATs - normalizedBTs;
        return normalizedDirection === "asc" ? diff : -diff;
      }

      const aId = typeof a?.video?.id === "string" ? a.video.id : "";
      const bId = typeof b?.video?.id === "string" ? b.video.id : "";
      return normalizedDirection === "asc"
        ? aId.localeCompare(bId)
        : bId.localeCompare(aId);
    });

    return copy;
  };
}
