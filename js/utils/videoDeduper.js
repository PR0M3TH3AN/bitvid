// js/utils/videoDeduper.js

/**
 * Given an array of video objects, return only the newest (by created_at) for
 * each videoRootId. If no videoRootId is present, treat the video’s own ID as
 * its root.
 */
export function dedupeToNewestByRoot(videos) {
  const map = new Map();

  const normalizeTimestamp = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : -Infinity;
  };

  for (const vid of videos || []) {
    if (!vid) {
      continue;
    }
    const rootId = vid.videoRootId || vid.id;
    if (!rootId) {
      continue;
    }

    const existing = map.get(rootId);
    if (
      !existing ||
      normalizeTimestamp(vid.created_at) > normalizeTimestamp(existing.created_at)
    ) {
      map.set(rootId, vid);
    }
  }

  return Array.from(map.values());
}

// Identity keys that mark two events as "the same video" across ecosystems
// (bitvid kind-30078 vs a NIP-71 mirror/original). Scoped per author. Content
// hashes + infohash are the reliable signals; `importedFrom` (Phase 2 on-board
// provenance) links an on-boarded bitvid note to the original foreign event via a
// shared "eid" namespace. Videos with none of these only ever match themselves.
function crossEcosystemIdentityKeys(video) {
  const author =
    typeof video?.pubkey === "string" ? video.pubkey.trim().toLowerCase() : "";
  if (!author) {
    return [];
  }
  const keys = [];
  const push = (ns, value) => {
    const s = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (s) {
      keys.push(`${author}|${ns}|${s}`);
    }
  };
  push("sha", video.fileSha256);
  push("ox", video.originalFileSha256);
  push("ih", video.infoHash);
  push("eid", video.id);
  push("eid", video.importedFrom);
  return keys;
}

function isBitvidNative(video) {
  return video?.source !== "nip71-ingest" && video?.foreign !== true;
}

// Within a group of same-video events, prefer the bitvid-native (kind-30078)
// version; among the same kind, the newest (tie: higher id) for determinism.
function pickPreferredVideo(group) {
  let best = null;
  for (const video of group) {
    if (!best) {
      best = video;
      continue;
    }
    const nativeV = isBitvidNative(video);
    const nativeBest = isBitvidNative(best);
    if (nativeV !== nativeBest) {
      if (nativeV) best = video;
      continue;
    }
    const tV = Number(video.created_at);
    const tBest = Number(best.created_at);
    const cV = Number.isFinite(tV) ? tV : -Infinity;
    const cBest = Number.isFinite(tBest) ? tBest : -Infinity;
    if (cV > cBest || (cV === cBest && String(video.id) > String(best.id))) {
      best = video;
    }
  }
  return best;
}

/**
 * Collapse duplicates of the same video that appear in BOTH ecosystems (a bitvid
 * kind-30078 note and a NIP-71 mirror/original) so a grid never shows both.
 * Always prefers the bitvid version. Same-ecosystem, distinct videos are
 * untouched. Pure.
 */
export function collapseCrossEcosystem(videos) {
  const list = Array.isArray(videos) ? videos.filter(Boolean) : [];
  if (list.length < 2) {
    return list.slice();
  }

  // Union-find: merge any videos that share an identity key.
  const parent = list.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) {
      const next = parent[i];
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const keyToIndex = new Map();
  list.forEach((video, i) => {
    for (const key of crossEcosystemIdentityKeys(video)) {
      if (keyToIndex.has(key)) {
        union(keyToIndex.get(key), i);
      } else {
        keyToIndex.set(key, i);
      }
    }
  });

  const groups = new Map();
  list.forEach((video, i) => {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(video);
    else groups.set(root, [video]);
  });

  const result = [];
  for (const group of groups.values()) {
    result.push(group.length === 1 ? group[0] : pickPreferredVideo(group));
  }
  return result;
}

/**
 * The shared grid dedupe: collapse to newest-per-root, THEN collapse
 * cross-ecosystem duplicates (prefer bitvid). Use this everywhere a video list is
 * built so every grid behaves identically.
 */
export function dedupeVideos(videos) {
  return collapseCrossEcosystem(dedupeToNewestByRoot(videos));
}

export default dedupeToNewestByRoot;
