export const PRIORITY_BASELINE = 1_000_000;

export function getViewportCenter() {
  if (typeof window === "undefined") {
    return null;
  }
  const width = Number(window.innerWidth) || 0;
  const height = Number(window.innerHeight) || 0;
  if (width <= 0 && height <= 0) {
    return null;
  }
  return {
    x: width > 0 ? width / 2 : 0,
    y: height > 0 ? height / 2 : 0,
  };
}

export function getIntersectionRect(entry) {
  if (!entry) {
    return null;
  }
  const rect = entry.intersectionRect;
  if (rect && rect.width > 0 && rect.height > 0) {
    return rect;
  }
  const fallback = entry.boundingClientRect;
  if (fallback && fallback.width > 0 && fallback.height > 0) {
    return fallback;
  }
  return null;
}

export function prioritizeEntries(entries, viewportCenter) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  const filtered = entries
    .filter((entry) => entry.isIntersecting && entry.target instanceof HTMLElement)
    .map((entry) => {
      const rect = getIntersectionRect(entry);
      if (!rect) {
        return null;
      }
      const ratio =
        typeof entry.intersectionRatio === "number" ? entry.intersectionRatio : 0;
      const centerY = rect.top + rect.height / 2;
      const verticalDistance = viewportCenter
        ? Math.abs(centerY - viewportCenter.y)
        : Number.POSITIVE_INFINITY;
      return { entry, ratio, centerY, verticalDistance };
    })
    .filter(Boolean);

  if (filtered.length === 0) {
    return [];
  }

  if (!viewportCenter) {
    return filtered
      .sort((a, b) => {
        if (b.ratio !== a.ratio) {
          return b.ratio - a.ratio;
        }
        return a.centerY - b.centerY;
      })
      .map((item, index) => ({
        entry: item.entry,
        priority: PRIORITY_BASELINE - index,
      }));
  }

  const ordered = filtered
    .slice()
    .sort((a, b) => a.centerY - b.centerY);

  let centerIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ordered.length; i += 1) {
    const candidate = ordered[i];
    if (candidate.verticalDistance < minDistance) {
      minDistance = candidate.verticalDistance;
      centerIndex = i;
    }
  }

  const prioritized = [];
  const pushCandidate = (candidate) => {
    if (!candidate) {
      return;
    }
    prioritized.push(candidate);
  };

  pushCandidate(ordered[centerIndex]);

  let left = centerIndex - 1;
  let right = centerIndex + 1;
  while (left >= 0 || right < ordered.length) {
    const leftCandidate = left >= 0 ? ordered[left] : null;
    const rightCandidate = right < ordered.length ? ordered[right] : null;

    if (leftCandidate && rightCandidate) {
      const leftDistance = leftCandidate.verticalDistance;
      const rightDistance = rightCandidate.verticalDistance;
      const distanceDelta = Math.abs(leftDistance - rightDistance);
      if (distanceDelta <= 0.5) {
        if (rightCandidate.ratio > leftCandidate.ratio) {
          pushCandidate(rightCandidate);
          right += 1;
        } else {
          pushCandidate(leftCandidate);
          left -= 1;
        }
      } else if (leftDistance < rightDistance) {
        pushCandidate(leftCandidate);
        left -= 1;
      } else {
        pushCandidate(rightCandidate);
        right += 1;
      }
    } else if (rightCandidate) {
      pushCandidate(rightCandidate);
      right += 1;
    } else if (leftCandidate) {
      pushCandidate(leftCandidate);
      left -= 1;
    }
  }

  return prioritized.map((candidate, index) => ({
    entry: candidate.entry,
    priority: PRIORITY_BASELINE - index,
  }));
}
