// js/utils/videoDeduper.js

/**
 * Given an array of video objects, return only the newest (by created_at) for
 * each videoRootId. If no videoRootId is present, treat the video’s own ID as
 * its root.
 */
export function dedupeToNewestByRoot(videos) {
  const map = new Map();

  for (const vid of videos || []) {
    if (!vid) {
      continue;
    }
    const rootId = vid.videoRootId || vid.id;
    if (!rootId) {
      continue;
    }

    const existing = map.get(rootId);
    if (!existing || vid.created_at > existing.created_at) {
      map.set(rootId, vid);
    }
  }

  return Array.from(map.values());
}

export default dedupeToNewestByRoot;
