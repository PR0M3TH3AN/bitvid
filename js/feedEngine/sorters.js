// js/feedEngine/sorters.js

export function createChronologicalSorter({ direction = "desc" } = {}) {
  const normalizedDirection = direction === "asc" ? "asc" : "desc";

  return function chronologicalSorter(items = []) {
    if (!Array.isArray(items)) {
      return [];
    }

    const copy = [...items];
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

      const aTs = Number(a?.video?.created_at);
      const bTs = Number(b?.video?.created_at);
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
