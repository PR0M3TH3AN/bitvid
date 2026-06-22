// Phase 0 of the NIP-71 interop plan (docs/nip71-migration-plan.md).
//
// Maps a bitvid video (the kind-30078 content shape) to an opt-in, addressable
// NIP-71 *mirror* event (kind 34235 normal / 34236 short). The 30078 stays the
// canonical record; this mirror is additive and lets the video show up on other
// Nostr video clients (Nostube, Amethyst, …).
//
// Pure / no UX wiring (gated by FEATURE_PUBLISH_NIP71 at the call sites later).
// Hard rules baked in: private videos are NEVER mirrored, and a publicly-playable
// HTTPS url is required (foreign clients can't play magnet-only). bitvid's
// WebTorrent rides standard NIP-94 imeta fields (magnet, i).

import { buildNip71MetadataTags, buildVideoPointerValue } from "./nip71.js";
import { extractBtihFromMagnet } from "../magnetShared.js";

export const NIP71_NORMAL_VIDEO_KIND = 34235;
export const NIP71_SHORT_VIDEO_KIND = 34236;

const VIDEO_MIME_BY_EXT = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  m3u8: "application/x-mpegURL",
};

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpsUrl(value) {
  return /^https:\/\//i.test(str(value));
}

// Best-effort MIME from the url extension; bitvid doesn't persist a MIME today.
export function deriveVideoMime(url) {
  const value = str(url).toLowerCase();
  if (!value) {
    return "video/mp4";
  }
  const path = value.split(/[?#]/)[0];
  const ext = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1) : "";
  return VIDEO_MIME_BY_EXT[ext] || "video/mp4";
}

function normalizePublishedAt(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Math.floor(Date.now() / 1000);
  }
  // Tolerate millisecond timestamps.
  return numeric > 10_000_000_000 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

/**
 * Build an addressable NIP-71 mirror event from a bitvid video object.
 *
 * @param {object} video - bitvid video (30078 content shape) + `pubkey`.
 * @param {object} [options]
 * @param {boolean} [options.short] - Force 34236 (short) / 34235 (normal). When
 *   omitted, inferred from dimensions (portrait => short).
 * @param {number} [options.createdAt] - Signing time (unix seconds). Default now.
 * @param {number|string} [options.publishedAt] - First-publish time for the
 *   `published_at` tag; kept stable across edits. Defaults to the video's
 *   published_at/created_at, else now.
 * @param {string} [options.watchUrl] - Canonical bitvid watch URL for `origin`.
 * @returns {{ok:true, event:object} | {ok:false, reason:string}}
 */
export function buildNip71MirrorEvent(video, options = {}) {
  if (!video || typeof video !== "object") {
    return { ok: false, reason: "invalid" };
  }

  const videoRootId = str(video.videoRootId);
  const title = str(video.title);
  const pubkey = str(video.pubkey).toLowerCase();
  if (!videoRootId || !title || !pubkey) {
    return { ok: false, reason: "invalid" };
  }

  // Hard rule 1: private videos are never mirrored (no NIP-71 encryption).
  if (video.isPrivate === true) {
    return { ok: false, reason: "private" };
  }

  // Hard rule 2: foreign clients need a hosted, publicly-playable HTTPS url.
  const url = str(video.url);
  if (!isHttpsUrl(url)) {
    return { ok: false, reason: "no-url" };
  }

  const magnet = str(video.magnet);
  const infohash =
    str(video.infoHash) || (magnet ? str(extractBtihFromMagnet(magnet)) : "");

  const width = Number(video.width);
  const height = Number(video.height);
  const hasDims =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
  const duration = Number(video.duration);

  const variant = {
    url,
    m: deriveVideoMime(url),
    image: str(video.thumbnail) ? [str(video.thumbnail)] : [],
    x: str(video.fileSha256) || undefined,
    ox: str(video.originalFileSha256) || undefined,
    magnet: magnet || undefined,
    i: infohash || undefined,
    dim: hasDims ? `${width}x${height}` : undefined,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };

  const hashtags = Array.isArray(video.hashtags)
    ? video.hashtags.map(str).filter(Boolean)
    : [];

  const metadata = {
    title,
    // Short accessibility text — NOT a dump of the full description.
    alt: title,
    publishedAt: normalizePublishedAt(
      options.publishedAt ?? video.published_at ?? video.created_at,
    ),
    imeta: [variant],
    hashtags,
    contentWarning:
      video.isNsfw === true ? str(video.nsfwReason) || "nsfw" : undefined,
  };

  const tags = buildNip71MetadataTags(metadata);

  // Addressable identity + bitvid linkage (ignored by foreign clients).
  tags.push(["d", videoRootId]);
  const aValue = buildVideoPointerValue(pubkey, videoRootId);
  if (aValue) {
    tags.push(["a", aValue]); // back-pointer to the canonical kind 30078
  }
  const origin = ["origin", "bitvid", videoRootId];
  const watchUrl = str(options.watchUrl);
  if (watchUrl) {
    origin.push(watchUrl);
  }
  tags.push(origin);
  tags.push(["client", "bitvid"]);

  const short =
    options.short === true ||
    (options.short !== false && hasDims && height > width);

  const createdAt = Number.isFinite(options.createdAt)
    ? Math.floor(options.createdAt)
    : Math.floor(Date.now() / 1000);

  const event = {
    kind: short ? NIP71_SHORT_VIDEO_KIND : NIP71_NORMAL_VIDEO_KIND,
    pubkey,
    created_at: createdAt,
    tags,
    content: str(video.description),
  };

  return { ok: true, event };
}

export default buildNip71MirrorEvent;
