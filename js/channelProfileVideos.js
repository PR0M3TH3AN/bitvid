// Channel-profile video sourcing: a creator's wall should show BOTH their
// bitvid-native kind-30078 videos AND the NIP-71 videos they published via other
// apps (Nostube etc.) — matching what the main feed shows via ingest. Previously
// the profile fetched only kind-30078, so cross-posted NIP-71 videos were absent.

import { convertEventToVideo as sharedConvertEventToVideo } from "./nostr/index.js";
import { buildVideoFromNip71Event, NIP71_KINDS } from "./nostr/nip71IngestAdapter.js";

// Two filters for one author: native video notes (kind 30078, tagged "video")
// and their NIP-71 videos (kinds 21/22/34235/34236).
export function buildChannelVideoFilters(pubkey, { limit = 200 } = {}) {
  return [
    { kinds: [30078], authors: [pubkey], "#t": ["video"], limit },
    { kinds: Array.from(NIP71_KINDS), authors: [pubkey], limit },
  ];
}

// Convert a raw channel event to a bitvid video object. Foreign NIP-71 kinds go
// through the ingest adapter (which also rejects bitvid's own outbound mirrors so
// they don't duplicate the canonical kind-30078 note); everything else uses the
// standard kind-30078 converter. May return an { invalid: true } object — the
// caller filters those out (same contract as convertEventToVideo).
export function convertChannelEvent(entry) {
  const kind = Number(entry?.kind);
  if (NIP71_KINDS.has(kind)) {
    return buildVideoFromNip71Event(entry);
  }
  return sharedConvertEventToVideo(entry);
}

// ---- Per-channel persisted cache (instant cold-load paint) -------------------
// Mirrors the main feed's optimistic cache: on a cold hard-refresh of a profile,
// render the last-seen videos from localStorage BEFORE relays connect, then the
// live fetch replaces them. Keyed per author; bounded so storage can't grow
// without limit.

const CHANNEL_CACHE_KEY = "bitvid:channel-videos:v1";
const MAX_CACHED_CHANNELS = 20;
const MAX_VIDEOS_PER_CHANNEL = 60;

function normPubkey(pubkey) {
  return typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
}

function readChannelCacheMap() {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(CHANNEL_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

export function loadCachedChannelVideos(pubkey) {
  const pk = normPubkey(pubkey);
  if (!pk) return [];
  const entry = readChannelCacheMap()[pk];
  return entry && Array.isArray(entry.videos) ? entry.videos : [];
}

export function saveCachedChannelVideos(pubkey, videos) {
  const pk = normPubkey(pubkey);
  if (!pk || !Array.isArray(videos) || typeof localStorage === "undefined") {
    return;
  }
  try {
    const map = readChannelCacheMap();
    // Drop the heavy raw `tags` array — the render + dedupe paths use parsed
    // top-level fields; the live fetch restores full objects moments later.
    const slim = videos.slice(0, MAX_VIDEOS_PER_CHANNEL).map(({ tags, ...rest }) => rest);
    map[pk] = { videos: slim, ts: Date.now() };
    const keys = Object.keys(map);
    if (keys.length > MAX_CACHED_CHANNELS) {
      keys
        .sort((a, b) => (map[a]?.ts || 0) - (map[b]?.ts || 0))
        .slice(0, keys.length - MAX_CACHED_CHANNELS)
        .forEach((k) => delete map[k]);
    }
    localStorage.setItem(CHANNEL_CACHE_KEY, JSON.stringify(map));
  } catch (error) {
    // best-effort; cache is non-critical
  }
}
