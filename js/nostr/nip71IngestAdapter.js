// Adapter: converts a *foreign* NIP-71 video event (published by another Nostr
// app — kinds 21/22 regular, 34235/34236 addressable) into a bitvid video
// object shaped like the output of convertEventToVideo, so it can flow through
// the existing feed pipeline (moderation, trust, NSFW gating, rendering).
//
// This is the inverse of nip71Mirror.js (which builds bitvid → NIP-71). It reads
// the imeta variant + standard NIP-71 tags rather than bitvid's JSON content,
// and maps the `content-warning` tag to bitvid's `isNsfw` flag.
//
// Pure + dependency-free so it is cheat-resistant to test. The ingest *service*
// (nip71IngestService.js) handles subscriptions, dedup, and own-mirror skipping.

import { extractNip71MetadataFromTags } from "./nip71.js";
import { extractBtihFromMagnet, extractMagnetHints } from "../magnetShared.js";

const NIP71_KINDS = new Set([21, 22, 34235, 34236]);

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDim(dim) {
  const raw = trimString(dim);
  const match = /^(\d+)x(\d+)$/i.exec(raw);
  if (!match) {
    return { width: undefined, height: undefined };
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  return {
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
  };
}

function dTagFromEvent(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "d") {
      const value = trimString(tag[1]);
      if (value) {
        return value;
      }
    }
  }
  return "";
}

// bitvid stamps its own outbound mirrors with ["client","bitvid"]. The ingest
// service uses this to avoid re-listing our own content (which already exists as
// a canonical kind-30078 video).
export function isBitvidMirrorEvent(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  return tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === "client" &&
      trimString(tag[1]).toLowerCase() === "bitvid",
  );
}

function pickPrimaryVariant(imeta) {
  if (!Array.isArray(imeta) || !imeta.length) {
    return null;
  }
  // Prefer a variant that advertises a video mimetype and a url; fall back to
  // the first variant that has any playable source.
  const withVideoUrl = imeta.find(
    (variant) =>
      trimString(variant?.url) &&
      trimString(variant?.m).toLowerCase().startsWith("video/"),
  );
  if (withVideoUrl) {
    return withVideoUrl;
  }
  const withUrl = imeta.find((variant) => trimString(variant?.url));
  if (withUrl) {
    return withUrl;
  }
  return imeta.find((variant) => trimString(variant?.magnet)) || null;
}

function isVideoVariant(variant) {
  if (!trimString(variant?.url)) {
    return false;
  }
  const m = trimString(variant?.m).toLowerCase();
  // Accept explicit video/* and untyped variants; exclude audio/image/etc.
  return m === "" || m.startsWith("video/");
}

// All playable video URLs from a NIP-71 event's imeta variants, in order, so the
// player + liveness probe can fail over if one host is down. Audio/image
// variants are excluded. De-duplicated by url.
export function collectVideoSources(imeta) {
  const out = [];
  const seen = new Set();
  for (const variant of Array.isArray(imeta) ? imeta : []) {
    if (!isVideoVariant(variant)) {
      continue;
    }
    const url = trimString(variant.url);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    const durationNum = Number(variant.duration);
    out.push({
      url,
      mimeType: trimString(variant.m),
      sha256: trimString(variant.x),
      dim: trimString(variant.dim),
      duration:
        Number.isFinite(durationNum) && durationNum > 0 ? durationNum : undefined,
    });
  }
  return out;
}

/**
 * Convert a foreign NIP-71 event into a bitvid video object.
 *
 * @param {object} event - The raw Nostr event (kind 21/22/34235/34236).
 * @returns {object} A video object (invalid:false) or { invalid:true, reason }.
 */
export function buildVideoFromNip71Event(event = {}) {
  if (!event || typeof event !== "object") {
    return { invalid: true, reason: "missing event" };
  }
  if (!NIP71_KINDS.has(Number(event.kind))) {
    return { id: event.id, invalid: true, reason: "not a NIP-71 video kind" };
  }
  if (isBitvidMirrorEvent(event)) {
    // Our own outbound mirror — the canonical 30078 is already in the feed.
    return { id: event.id, invalid: true, reason: "bitvid-mirror" };
  }

  const parsed = extractNip71MetadataFromTags(event);
  const metadata = parsed?.metadata || {};
  const variant = pickPrimaryVariant(metadata.imeta);

  const url = trimString(variant?.url);
  const rawMagnet = trimString(variant?.magnet);
  const magnet = rawMagnet.toLowerCase().startsWith("magnet:?") ? rawMagnet : "";

  if (!url && !magnet) {
    return { id: event.id, invalid: true, reason: "missing playable source" };
  }

  const title = trimString(metadata.title);
  if (!title) {
    return { id: event.id, invalid: true, reason: "missing title" };
  }

  const { width, height } = parseDim(variant?.dim);

  const durationCandidate = Number(metadata.duration);
  const duration =
    Number.isFinite(durationCandidate) && durationCandidate > 0
      ? durationCandidate
      : undefined;

  const thumbnail =
    Array.isArray(variant?.image) && variant.image.length
      ? trimString(variant.image[0])
      : "";

  // content-warning → isNsfw so the standard NSFW gate (ALLOW_NSFW_CONTENT) and
  // blur thresholds apply to ingested content too.
  const isNsfw = Boolean(trimString(metadata.contentWarning));

  const hashtags = Array.isArray(metadata.hashtags)
    ? metadata.hashtags
        .map((value) => trimString(value))
        .filter((value) => value)
    : [];

  let infoHash = "";
  const iField = trimString(variant?.i).toLowerCase();
  if (/^[0-9a-f]{40}$/.test(iField)) {
    infoHash = iField;
  } else if (magnet) {
    infoHash = extractBtihFromMagnet(magnet) || "";
  }

  const hints = magnet ? extractMagnetHints(magnet) : { ws: "", xs: "" };

  // Addressable kinds (34235/36) are keyed by d-tag; regular kinds (21/22) use
  // the event id as the stable root.
  const dTag = dTagFromEvent(event);
  const videoRootId = dTag || trimString(event.id);

  // All playable video URLs (mirrors) for fail-over at probe + play time.
  const sources = collectVideoSources(metadata.imeta);

  // The feed's resolve-posted-at stage fetches per-video kind-30078 history when
  // a timestamp isn't already known. Foreign NIP-71 videos have no such history,
  // so without a posted-at the feed would fire a blocking history fetch per
  // ingested video (a relay storm that stalls the render). Surface the NIP-71
  // published_at (falling back to created_at) so the feed short-circuits.
  const createdAt = Number.isFinite(event.created_at) ? Math.floor(event.created_at) : 0;
  const publishedAtNum = Number(metadata.publishedAt);
  const publishedAt =
    Number.isFinite(publishedAtNum) && publishedAtNum > 0
      ? Math.floor(publishedAtNum)
      : createdAt;

  return {
    id: event.id,
    videoRootId,
    version: 3,
    isPrivate: false,
    isNsfw,
    isForKids: false,
    title,
    url,
    sources,
    magnet,
    rawMagnet: magnet ? rawMagnet : "",
    infoHash,
    fileSha256: trimString(variant?.x),
    originalFileSha256: trimString(variant?.ox),
    thumbnail,
    description: trimString(metadata.summary),
    mode: "live",
    deleted: false,
    hashtags,
    width,
    height,
    duration,
    ws: hints.ws || "",
    xs: hints.xs || "",
    storagePointer: null,
    infoJsonUrl: "",
    enableComments: true,
    pubkey: trimString(event.pubkey),
    created_at: createdAt,
    // Lets the feed's resolve-posted-at stage short-circuit instead of fetching
    // non-existent kind-30078 history for foreign videos.
    nip71: { publishedAt },
    tags: Array.isArray(event.tags) ? event.tags : [],
    // Provenance markers so the rest of the app can distinguish ingested videos
    // from native bitvid uploads (e.g. to hide WebTorrent-only affordances).
    source: "nip71-ingest",
    foreign: true,
    nip71Kind: Number(event.kind),
    invalid: false,
  };
}

export { NIP71_KINDS };
