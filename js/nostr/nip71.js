import { deriveTitleFromEvent } from "../videoEventUtils.js";
import { extractMagnetHints } from "../magnetShared.js";
import { devLogger } from "../utils/logger.js";
import { getCachedNostrTools } from "./toolkit.js";

function stringFromInput(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return String(value).trim();
}

const HEX_32_BYTE_REGEX = /^[0-9a-f]{64}$/i;

function decodeNpubToHex(candidate) {
  const globalDecoder =
    typeof window !== "undefined" ? window?.NostrTools?.nip19?.decode : null;
  const toolkit = getCachedNostrTools();
  const toolkitDecoder = toolkit?.nip19?.decode;
  const decoder =
    typeof globalDecoder === "function" ? globalDecoder : toolkitDecoder;
  if (typeof decoder !== "function") {
    return null;
  }
  try {
    const decoded = decoder(candidate);
    if (decoded?.type === "npub" && typeof decoded.data === "string") {
      return decoded.data.toLowerCase();
    }
    if (decoded?.type === "npub" && typeof decoded.data?.pubkey === "string") {
      return decoded.data.pubkey.toLowerCase();
    }
  } catch (error) {
    devLogger.warn("[nostr] Failed to decode npub participant pubkey", error);
  }
  return null;
}

function normalizeNostrPubkey(candidate) {
  const value = stringFromInput(candidate);
  if (!value) {
    return null;
  }
  if (HEX_32_BYTE_REGEX.test(value)) {
    return value.toLowerCase();
  }
  if (value.toLowerCase().startsWith("npub1")) {
    const decoded = decodeNpubToHex(value);
    if (decoded && HEX_32_BYTE_REGEX.test(decoded)) {
      return decoded;
    }
    return null;
  }
  return null;
}

function normalizeUnixSeconds(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value > 1e12 ? value / 1000 : value;
    return String(Math.floor(normalized));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const normalized = numeric > 1e12 ? numeric / 1000 : numeric;
      return String(Math.floor(normalized));
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return String(Math.floor(parsed / 1000));
    }
  }
  return "";
}

function parseNonNegativeNumber(value, { allowFloat = false } = {}) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (!allowFloat && !Number.isInteger(value)) {
      return null;
    }
    return value >= 0 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    if (!allowFloat && !Number.isInteger(numeric)) {
      return null;
    }
    return numeric >= 0 ? numeric : null;
  }
  return null;
}

function formatNonNegativeNumber(value, { allowFloat = false } = {}) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return "";
    }
    if (!allowFloat && !Number.isInteger(numeric)) {
      return "";
    }
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    return allowFloat ? String(numeric) : String(Math.trunc(numeric));
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    if (!allowFloat && !Number.isInteger(value)) {
      return "";
    }
    return String(value);
  }

  return "";
}

function normalizeNip71Kind(value) {
  const numeric =
    typeof value === "string"
      ? Number(value.trim())
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (numeric === 22) {
    return 22;
  }
  return 21;
}

function trimTrailingEmpty(values) {
  const trimmed = [...values];
  while (trimmed.length && !trimmed[trimmed.length - 1]) {
    trimmed.pop();
  }
  return trimmed;
}

function buildImetaTags(variants) {
  if (!Array.isArray(variants)) {
    return [];
  }
  const tags = [];
  for (const variant of variants) {
    if (!variant || typeof variant !== "object") {
      continue;
    }
    const dim = stringFromInput(variant.dim);
    const url = stringFromInput(variant.url);
    const x = stringFromInput(variant.x);
    const rawMime = stringFromInput(variant.m);
    const mime = rawMime ? rawMime.toLowerCase() : "";
    const duration = formatNonNegativeNumber(variant.duration, {
      allowFloat: true,
    });
    const bitrate = formatNonNegativeNumber(variant.bitrate, {
      allowFloat: false,
    });
    const image = Array.isArray(variant.image)
      ? variant.image.map(stringFromInput).filter(Boolean)
      : [];
    const fallback = Array.isArray(variant.fallback)
      ? variant.fallback.map(stringFromInput).filter(Boolean)
      : [];
    const service = Array.isArray(variant.service)
      ? variant.service.map(stringFromInput).filter(Boolean)
      : [];

    if (
      !dim &&
      !url &&
      !x &&
      !mime &&
      !duration &&
      !bitrate &&
      !image.length &&
      !fallback.length &&
      !service.length
    ) {
      continue;
    }

    const entries = ["imeta"];
    if (dim) {
      entries.push(`dim ${dim}`);
    }
    if (url) {
      entries.push(`url ${url}`);
    }
    if (x) {
      entries.push(`x ${x}`);
    }
    if (mime) {
      entries.push(`m ${mime}`);
    }
    if (duration) {
      entries.push(`duration ${duration}`);
    }
    if (bitrate) {
      entries.push(`bitrate ${bitrate}`);
    }
    image.forEach((value) => entries.push(`image ${value}`));
    fallback.forEach((value) => entries.push(`fallback ${value}`));
    service.forEach((value) => entries.push(`service ${value}`));

    tags.push(entries);
  }
  return tags;
}

function buildTextTrackTag(track) {
  if (!track || typeof track !== "object") {
    return null;
  }
  const url = stringFromInput(track.url);
  const type = stringFromInput(track.type);
  const language = stringFromInput(track.language);
  if (!url && !type && !language) {
    return null;
  }
  const values = trimTrailingEmpty([url, type, language]);
  return ["text-track", ...values];
}

function buildSegmentTag(segment) {
  if (!segment || typeof segment !== "object") {
    return null;
  }
  const start = stringFromInput(segment.start);
  const end = stringFromInput(segment.end);
  const title = stringFromInput(segment.title);
  const thumbnail = stringFromInput(segment.thumbnail);
  if (!start && !end && !title && !thumbnail) {
    return null;
  }
  const values = trimTrailingEmpty([start, end, title, thumbnail]);
  return ["segment", ...values];
}

function buildParticipantTag(participant) {
  if (!participant || typeof participant !== "object") {
    return null;
  }
  const rawPubkey = participant.pubkey;
  const pubkey = normalizeNostrPubkey(rawPubkey);
  if (!pubkey) {
    const candidate = stringFromInput(rawPubkey);
    if (candidate) {
      devLogger.warn(
        "[nostr] Dropping NIP-71 participant tag with invalid pubkey",
        { pubkey: candidate }
      );
    }
    return null;
  }
  const relay = stringFromInput(participant.relay);
  // NIP-71 "Other tags" mandates 32-byte hex participant pubkeys.
  const values = ["p", pubkey];
  if (relay) {
    values.push(relay);
  }
  return values;
}

/**
 * Converts a NIP-71 metadata object into Nostr tags.
 *
 * Mapping:
 * - `title` -> `['title', ...]`
 * - `publishedAt` -> `['published_at', ...]`
 * - `imeta` -> `['imeta', 'url', ..., 'dim', ...]` (Video variants)
 * - `textTracks` -> `['text-track', ...]`
 * - `segments` -> `['segment', ...]`
 * - `hashtags` -> `['t', ...]`
 * - `participants` -> `['p', ...]`
 * - `references` -> `['r', ...]`
 *
 * @param {object} metadata - The metadata object (parsed structure).
 * @returns {string[][]} Array of tags ready for the event.
 */
export function buildNip71MetadataTags(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const tags = [];

  const normalizedTitle = stringFromInput(metadata.title);
  if (normalizedTitle) {
    tags.push(["title", normalizedTitle]);
  }

  const publishedAt = normalizeUnixSeconds(metadata.publishedAt);
  if (publishedAt) {
    tags.push(["published_at", publishedAt]);
  }

  const alt = stringFromInput(metadata.alt);
  if (alt) {
    tags.push(["alt", alt]);
  }

  const imetaTags = buildImetaTags(metadata.imeta);
  if (imetaTags.length) {
    tags.push(...imetaTags);
  }

  if (Array.isArray(metadata.textTracks)) {
    metadata.textTracks.forEach((track) => {
      const tag = buildTextTrackTag(track);
      if (tag) {
        tags.push(tag);
      }
    });
  }

  const contentWarning = stringFromInput(metadata.contentWarning);
  if (contentWarning) {
    tags.push(["content-warning", contentWarning]);
  }

  if (Array.isArray(metadata.segments)) {
    metadata.segments.forEach((segment) => {
      const tag = buildSegmentTag(segment);
      if (tag) {
        tags.push(tag);
      }
    });
  }

  if (Array.isArray(metadata.hashtags)) {
    metadata.hashtags
      .map(stringFromInput)
      .filter(Boolean)
      .forEach((value) => {
        tags.push(["t", value]);
      });
  }

  if (Array.isArray(metadata.participants)) {
    metadata.participants.forEach((participant) => {
      const tag = buildParticipantTag(participant);
      if (tag) {
        tags.push(tag);
      }
    });
  }

  if (Array.isArray(metadata.references)) {
    metadata.references
      .map(stringFromInput)
      .filter(Boolean)
      .forEach((url) => {
        tags.push(["r", url]);
      });
  }

  return tags;
}

function parseKeyValuePair(entry) {
  if (typeof entry !== "string") {
    return null;
  }
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) {
    return null;
  }
  const key = trimmed.slice(0, spaceIndex).trim().toLowerCase();
  const value = trimmed.slice(spaceIndex + 1).trim();
  if (!key || !value) {
    return null;
  }
  return { key, value };
}

function parseImetaTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "imeta") {
    return null;
  }

  const variant = {
    image: [],
    fallback: [],
    service: [],
  };

  for (let i = 1; i < tag.length; i += 1) {
    const parsed = parseKeyValuePair(tag[i]);
    if (!parsed) {
      continue;
    }

    switch (parsed.key) {
      case "dim":
        variant.dim = parsed.value;
        break;
      case "url":
        variant.url = parsed.value;
        break;
      case "x":
        variant.x = parsed.value;
        break;
      case "m":
        variant.m = parsed.value;
        break;
      case "duration": {
        const numeric = parseNonNegativeNumber(parsed.value, {
          allowFloat: true,
        });
        variant.duration = numeric ?? parsed.value;
        break;
      }
      case "bitrate": {
        const numeric = parseNonNegativeNumber(parsed.value);
        variant.bitrate = numeric ?? parsed.value;
        break;
      }
      case "image":
        variant.image.push(parsed.value);
        break;
      case "fallback":
        variant.fallback.push(parsed.value);
        break;
      case "service":
        variant.service.push(parsed.value);
        break;
      default:
        break;
    }
  }

  const hasContent =
    Boolean(variant.dim) ||
    Boolean(variant.url) ||
    Boolean(variant.x) ||
    Boolean(variant.m) ||
    (variant.duration !== undefined && variant.duration !== null && variant.duration !== "") ||
    (variant.bitrate !== undefined && variant.bitrate !== null && variant.bitrate !== "") ||
    variant.image.length > 0 ||
    variant.fallback.length > 0 ||
    variant.service.length > 0;

  if (!hasContent) {
    return null;
  }

  if (!variant.image.length) {
    delete variant.image;
  }
  if (!variant.fallback.length) {
    delete variant.fallback;
  }
  if (!variant.service.length) {
    delete variant.service;
  }
  if (variant.duration === "" || variant.duration === undefined) {
    delete variant.duration;
  }
  if (variant.bitrate === "" || variant.bitrate === undefined) {
    delete variant.bitrate;
  }

  return variant;
}

function parseTextTrackTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "text-track") {
    return null;
  }
  const url = stringFromInput(tag[1]);
  const type = stringFromInput(tag[2]);
  const language = stringFromInput(tag[3]);
  if (!url && !type && !language) {
    return null;
  }
  const track = {};
  if (url) {
    track.url = url;
  }
  if (type) {
    track.type = type;
  }
  if (language) {
    track.language = language;
  }
  return track;
}

function parseSegmentTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "segment") {
    return null;
  }

  const values = [];
  for (let i = 1; i < tag.length; i += 1) {
    const value = stringFromInput(tag[i]);
    values.push(value);
  }

  while (values.length < 4) {
    values.push("");
  }

  const [start, end, title, thumbnail] = values;
  const hasContent = start || end || title || thumbnail;
  if (!hasContent) {
    return null;
  }
  const segment = {};
  if (start) {
    segment.start = start;
  }
  if (end) {
    segment.end = end;
  }
  if (title) {
    segment.title = title;
  }
  if (thumbnail) {
    segment.thumbnail = thumbnail;
  }
  return segment;
}

function parseParticipantTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "p") {
    return null;
  }
  const pubkey = stringFromInput(tag[1]);
  if (!pubkey) {
    return null;
  }
  const participant = { pubkey };
  const relay = stringFromInput(tag[2]);
  if (relay) {
    participant.relay = relay;
  }
  return participant;
}

function parseReferenceTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "r") {
    return null;
  }
  const url = stringFromInput(tag[1]);
  return url ? url : null;
}

function parseHashtagTag(tag) {
  if (!Array.isArray(tag) || tag[0] !== "t") {
    return null;
  }
  const value = stringFromInput(tag[1]);
  return value || null;
}

/**
 * Parses a NIP-71 event (Kind 22 or 21) into a structured metadata object.
 *
 * Extracts:
 * - Standard NIP-71 tags (title, imeta, segments, etc.)
 * - Pointer references (a, e, d tags) used to link this metadata to the video.
 *
 * @param {import("nostr-tools").Event} event - The raw Nostr event.
 * @returns {{metadata: object, pointers: object, source: object}|null} The parsed structure or null if invalid.
 */
export function extractNip71MetadataFromTags(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const metadata = { kind: normalizeNip71Kind(event.kind) };

  const summary = stringFromInput(event.content);
  if (summary) {
    metadata.summary = summary;
  }

  const imeta = [];
  const textTracks = [];
  const segments = [];
  const hashtags = [];
  const participants = [];
  const references = [];

  const pointerValues = new Set();
  const videoRootIds = new Set();
  const videoEventIds = new Set();
  const dTags = new Set();

  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }

    const name = tag[0];
    switch (name) {
      case "title": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.title = value;
        }
        break;
      }
      case "published_at": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.publishedAt = value;
        }
        break;
      }
      case "alt": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.alt = value;
        }
        break;
      }
      case "duration": {
        const value = stringFromInput(tag[1]);
        if (value) {
          const parsed = Number(value);
          metadata.duration = Number.isFinite(parsed) ? parsed : value;
        }
        break;
      }
      case "content-warning": {
        const value = stringFromInput(tag[1]);
        if (value) {
          metadata.contentWarning = value;
        }
        break;
      }
      case "imeta": {
        const variant = parseImetaTag(tag);
        if (variant) {
          imeta.push(variant);
        }
        break;
      }
      case "text-track": {
        const track = parseTextTrackTag(tag);
        if (track) {
          textTracks.push(track);
        }
        break;
      }
      case "segment": {
        const segment = parseSegmentTag(tag);
        if (segment) {
          segments.push(segment);
        }
        break;
      }
      case "t": {
        const hashtag = parseHashtagTag(tag);
        if (hashtag) {
          hashtags.push(hashtag);
        }
        break;
      }
      case "p": {
        const participant = parseParticipantTag(tag);
        if (participant) {
          participants.push(participant);
        }
        break;
      }
      case "r": {
        const reference = parseReferenceTag(tag);
        if (reference) {
          references.push(reference);
        }
        break;
      }
      case "a": {
        const pointerValue = stringFromInput(tag[1]).toLowerCase();
        if (pointerValue) {
          pointerValues.add(pointerValue);
          const parts = pointerValue.split(":");
          if (parts.length === 3 && parts[0] === "30078") {
            const root = parts[2];
            if (root) {
              videoRootIds.add(root);
            }
          }
        }
        break;
      }
      case "video-root": {
        const value = stringFromInput(tag[1]);
        if (value) {
          videoRootIds.add(value);
        }
        break;
      }
      case "e": {
        const value = stringFromInput(tag[1]);
        if (value) {
          videoEventIds.add(value);
        }
        break;
      }
      case "d": {
        const value = stringFromInput(tag[1]);
        if (value) {
          dTags.add(value);
        }
        break;
      }
      default:
        break;
    }
  });

  if (imeta.length) {
    metadata.imeta = imeta;

    const legacyDuration = parseNonNegativeNumber(metadata.duration, {
      allowFloat: true,
    });

    if (legacyDuration !== null) {
      metadata.duration = legacyDuration;
    } else {
      const variantDurations = imeta
        .map((variant) => parseNonNegativeNumber(variant?.duration, { allowFloat: true }))
        .filter((value) => value !== null);

      if (variantDurations.length) {
        metadata.duration = Math.max(...variantDurations);
      }
    }
  }
  if (textTracks.length) {
    metadata.textTracks = textTracks;
  }
  if (segments.length) {
    metadata.segments = segments;
  }
  if (hashtags.length) {
    metadata.hashtags = hashtags;
    metadata.t = hashtags;
  }
  if (participants.length) {
    metadata.participants = participants;
  }
  if (references.length) {
    metadata.references = references;
  }

  return {
    metadata,
    pointers: {
      pointerValues,
      videoRootIds,
      videoEventIds,
      dTags,
    },
    source: {
      id: typeof event.id === "string" ? event.id : "",
      created_at: Number.isFinite(event.created_at) ? event.created_at : null,
      kind: Number.isFinite(event.kind) ? event.kind : normalizeNip71Kind(event.kind),
    },
  };
}

function cloneNip71Metadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch (error) {
    devLogger.warn("[nostr] Failed to clone NIP-71 metadata", error);
    return { ...metadata };
  }
}

export function getDTagValueFromTags(tags) {
  if (!Array.isArray(tags)) {
    return "";
  }
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag[0] !== "d") {
      continue;
    }
    if (typeof tag[1] === "string" && tag[1]) {
      return tag[1];
    }
  }
  return "";
}

export function buildVideoPointerValue(pubkey, videoRootId) {
  const normalizedRoot = stringFromInput(videoRootId);
  const normalizedPubkey = stringFromInput(pubkey).toLowerCase();
  if (!normalizedRoot || !normalizedPubkey) {
    return "";
  }
  return `30078:${normalizedPubkey}:${normalizedRoot}`;
}

export function buildNip71PointerTags({
  pubkey = "",
  videoRootId = "",
  videoEventId = "",
  dTag = "",
} = {}) {
  const pointerTags = [];

  const normalizedRoot = stringFromInput(videoRootId);
  const normalizedEventId = stringFromInput(videoEventId);
  const normalizedDTag = stringFromInput(dTag);

  if (normalizedRoot) {
    const pointerValue = buildVideoPointerValue(pubkey, normalizedRoot);
    if (pointerValue) {
      pointerTags.push(["a", pointerValue]);
    }
    pointerTags.push(["video-root", normalizedRoot]);
  }

  if (normalizedEventId) {
    pointerTags.push(["e", normalizedEventId]);
  }

  if (normalizedDTag) {
    pointerTags.push(["d", normalizedDTag]);
  }

  return pointerTags;
}

/**
 * Constructs a Kind 22 (Video Wrapper) or Kind 21 (Video Segment) event.
 *
 * This event holds the NIP-71 categorization and metadata, separate from the
 * playable video note (Kind 30078). It links to the video via `a` or `e` tags.
 *
 * @param {object} params
 * @param {object} params.metadata - The NIP-71 metadata object.
 * @param {string} params.pubkey - The publisher's public key.
 * @param {string} params.title - The title (required by NIP-71).
 * @param {string} [params.summaryFallback] - Fallback content if summary is missing.
 * @param {number} [params.createdAt] - Timestamp.
 * @param {object} [params.pointerIdentifiers] - Pointers to the target video ({videoRootId, eventId, dTag}).
 * @returns {import("nostr-tools").Event|null} The unsigned event object.
 */
export function buildNip71VideoEvent({
  metadata,
  pubkey = "",
  title,
  summaryFallback = "",
  createdAt = Math.floor(Date.now() / 1000),
  pointerIdentifiers = {},
} = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const normalizedTitle = stringFromInput(title);
  if (!normalizedTitle) {
    return null;
  }

  const summaryCandidates = [
    stringFromInput(metadata.summary),
    stringFromInput(summaryFallback),
    normalizedTitle,
  ];
  const summary = summaryCandidates.find((value) => Boolean(value)) || "";

  const tags = buildNip71MetadataTags({
    ...metadata,
    title: normalizedTitle,
  });

  if (!tags.length) {
    return null;
  }

  const normalizedPubkey = stringFromInput(pubkey);
  const timestamp = Number.isFinite(createdAt)
    ? Math.floor(createdAt)
    : Math.floor(Date.now() / 1000);

  const pointerTags = buildNip71PointerTags({
    pubkey,
    videoRootId: pointerIdentifiers.videoRootId,
    videoEventId: pointerIdentifiers.eventId,
    dTag: pointerIdentifiers.dTag,
  });

  if (pointerTags.length) {
    tags.push(...pointerTags);
  }

  return {
    kind: normalizeNip71Kind(metadata.kind),
    pubkey: normalizedPubkey,
    created_at: timestamp,
    tags,
    content: summary,
  };
}

export function collectNip71PointerRequests(videos = []) {
  const pointerMap = new Map();
  if (!Array.isArray(videos)) {
    return pointerMap;
  }

  videos.forEach((video) => {
    if (!video || typeof video !== "object") {
      return;
    }

    const rootId = typeof video.videoRootId === "string" ? video.videoRootId : "";
    const pubkey = typeof video.pubkey === "string" ? video.pubkey.toLowerCase() : "";
    if (!rootId || !pubkey) {
      return;
    }

    const pointerValue = buildVideoPointerValue(pubkey, rootId);
    if (!pointerValue) {
      return;
    }

    let info = pointerMap.get(pointerValue);
    if (!info) {
      info = {
        videoRootId: rootId,
        pointerValue,
        videoEventIds: new Set(),
        dTags: new Set(),
      };
      pointerMap.set(pointerValue, info);
    }

    if (typeof video.id === "string" && video.id) {
      info.videoEventIds.add(video.id);
    }

    const dTag = getDTagValueFromTags(video.tags);
    if (dTag) {
      info.dTags.add(dTag);
    }
  });

  return pointerMap;
}

function ensureNip71CacheEntry(nip71Cache, videoRootId) {
  if (!(nip71Cache instanceof Map)) {
    return null;
  }
  const rootId = typeof videoRootId === "string" ? videoRootId : "";
  if (!rootId) {
    return null;
  }

  let entry = nip71Cache.get(rootId);
  if (!entry) {
    entry = {
      byVideoEventId: new Map(),
      byDTag: new Map(),
      fallback: null,
      fetchedPointers: new Set(),
    };
    nip71Cache.set(rootId, entry);
  }
  return entry;
}

function storeNip71RecordForRoot(nip71Cache, videoRootId, parsedRecord) {
  const entry = ensureNip71CacheEntry(nip71Cache, videoRootId);
  if (!entry || !parsedRecord || !parsedRecord.metadata) {
    return;
  }

  const storedRecord = {
    metadata: cloneNip71Metadata(parsedRecord.metadata),
    nip71EventId: parsedRecord.source?.id || "",
    created_at: parsedRecord.source?.created_at || 0,
    pointerValues: new Set(parsedRecord.pointers?.pointerValues || []),
    videoEventIds: new Set(parsedRecord.pointers?.videoEventIds || []),
    dTags: new Set(parsedRecord.pointers?.dTags || []),
  };

  if (!storedRecord.metadata) {
    return;
  }

  storedRecord.pointerValues.forEach((pointerValue) => {
    if (pointerValue) {
      entry.fetchedPointers.add(pointerValue);
    }
  });

  storedRecord.videoEventIds.forEach((eventId) => {
    if (eventId) {
      entry.byVideoEventId.set(eventId, storedRecord);
    }
  });

  storedRecord.dTags.forEach((dTag) => {
    if (dTag) {
      entry.byDTag.set(dTag, storedRecord);
    }
  });

  if (
    !entry.fallback ||
    (storedRecord.created_at || 0) >= (entry.fallback.created_at || 0)
  ) {
    entry.fallback = storedRecord;
  }
}

/**
 * Processes a batch of NIP-71 events and updates the cache.
 *
 * Logic:
 * - Parses each event.
 * - Identifies which video root(s) it belongs to (via `a` tag or cache lookup).
 * - Updates `nip71Cache` with the most recent valid metadata for that root.
 *
 * @param {import("nostr-tools").Event[]} events - List of fetched events.
 * @param {object} context
 * @param {Map} context.nip71Cache - The shared metadata cache.
 * @param {Map} [context.pointerMap] - Map of pointer values to video info (optimization).
 */
export function processNip71Events(events, { nip71Cache, pointerMap = null } = {}) {
  if (!Array.isArray(events) || !events.length || !(nip71Cache instanceof Map)) {
    return;
  }

  events.forEach((event) => {
    const parsed = extractNip71MetadataFromTags(event);
    if (!parsed || !parsed.metadata) {
      return;
    }

    const rootIds = new Set(parsed.pointers?.videoRootIds || []);
    if (!rootIds.size && pointerMap instanceof Map) {
      const pointerValues = parsed.pointers?.pointerValues;
      if (pointerValues instanceof Set) {
        pointerValues.forEach((pointerValue) => {
          const info = pointerMap.get(pointerValue);
          if (info?.videoRootId) {
            rootIds.add(info.videoRootId);
          }
        });
      }
    }

    if (!rootIds.size) {
      return;
    }

    rootIds.forEach((rootId) => {
      storeNip71RecordForRoot(nip71Cache, rootId, parsed);
    });
  });
}

/**
 * Hydrates a video object with cached NIP-71 metadata.
 *
 * If metadata exists for the video's `videoRootId`, `eventId`, or `d` tag,
 * it is merged into `video.nip71` and `video.nip71Source`.
 *
 * @param {object} video - The video object to mutate.
 * @param {object} context
 * @param {Map} context.nip71Cache - The metadata cache.
 * @returns {object} The mutated video object.
 */
export function mergeNip71MetadataIntoVideo(video, { nip71Cache } = {}) {
  if (!video || typeof video !== "object") {
    return video;
  }

  const rootId = typeof video.videoRootId === "string" ? video.videoRootId : "";
  if (!rootId) {
    return video;
  }

  const cacheEntry = nip71Cache instanceof Map ? nip71Cache.get(rootId) : null;

  let appliedMetadata = null;
  let sourceEventId = "";
  let sourceCreatedAt = 0;

  if (cacheEntry) {
    let record = null;
    const eventId = typeof video.id === "string" ? video.id : "";
    if (eventId && cacheEntry.byVideoEventId.has(eventId)) {
      record = cacheEntry.byVideoEventId.get(eventId);
    }

    if (!record) {
      const dTag = getDTagValueFromTags(video.tags);
      if (dTag && cacheEntry.byDTag.has(dTag)) {
        record = cacheEntry.byDTag.get(dTag);
      }
    }

    if (!record && cacheEntry.fallback) {
      record = cacheEntry.fallback;
    }

    if (record?.metadata) {
      const cloned = cloneNip71Metadata(record.metadata);
      if (cloned) {
        appliedMetadata = cloned;
        sourceEventId = record.nip71EventId || "";
        sourceCreatedAt = Number.isFinite(record.created_at)
          ? Math.floor(record.created_at)
          : 0;
      }
    }
  }

  if (!appliedMetadata) {
    const extracted = extractNip71MetadataFromTags(video);
    if (extracted?.metadata) {
      const cloned = cloneNip71Metadata(extracted.metadata);
      if (cloned) {
        appliedMetadata = cloned;
        const extractedSource = extracted.source || {};
        const fallbackId = typeof video.id === "string" ? video.id : "";
        sourceEventId = extractedSource.id || fallbackId;
        const candidateCreatedAt = Number.isFinite(extractedSource.created_at)
          ? Math.floor(extractedSource.created_at)
          : Number.isFinite(video.created_at)
            ? Math.floor(video.created_at)
            : 0;
        sourceCreatedAt = candidateCreatedAt;
      }
    }
  }

  if (appliedMetadata && Array.isArray(video.tags)) {
    const hasVideoTopicTag = video.tags.some(
      (tag) => Array.isArray(tag) && tag[0] === "t" && tag[1] === "video",
    );
    if (hasVideoTopicTag) {
      if (Array.isArray(appliedMetadata.hashtags)) {
        const filteredHashtags = appliedMetadata.hashtags.filter((value) => {
          if (typeof value !== "string") {
            return false;
          }
          const trimmed = value.trim();
          return trimmed && trimmed.toLowerCase() !== "video";
        });
        if (filteredHashtags.length) {
          appliedMetadata.hashtags = filteredHashtags;
        } else {
          delete appliedMetadata.hashtags;
        }
      }

      if (Array.isArray(appliedMetadata.t)) {
        const filteredTopics = appliedMetadata.t.filter((value) => {
          if (typeof value !== "string") {
            return false;
          }
          const trimmed = value.trim();
          return trimmed && trimmed.toLowerCase() !== "video";
        });
        if (filteredTopics.length) {
          appliedMetadata.t = filteredTopics;
        } else {
          delete appliedMetadata.t;
        }
      }
    }
  }

  if (appliedMetadata) {
    video.nip71 = appliedMetadata;
    video.nip71Source = {
      eventId: sourceEventId,
      created_at: sourceCreatedAt,
    };
  } else {
    if (video.nip71) {
      delete video.nip71;
    }
    if (video.nip71Source) {
      delete video.nip71Source;
    }
  }

  return video;
}

export async function populateNip71MetadataForVideos(videos = [], {
  nip71Cache,
  pointerMap = null,
  fetchMetadata,
} = {}) {
  if (!Array.isArray(videos) || !videos.length || !(nip71Cache instanceof Map)) {
    return;
  }

  const effectivePointerMap =
    pointerMap instanceof Map ? pointerMap : collectNip71PointerRequests(videos);

  const pointersToFetch = [];

  effectivePointerMap.forEach((info, pointerValue) => {
    const entry = ensureNip71CacheEntry(nip71Cache, info.videoRootId);
    if (!entry) {
      return;
    }

    let needsFetch = false;

    info.videoEventIds.forEach((eventId) => {
      if (eventId && !entry.byVideoEventId.has(eventId)) {
        needsFetch = true;
      }
    });

    if (!needsFetch) {
      info.dTags.forEach((dTag) => {
        if (dTag && !entry.byDTag.has(dTag)) {
          needsFetch = true;
        }
      });
    }

    if (!needsFetch && !entry.fallback) {
      needsFetch = true;
    }

    if (needsFetch && !entry.fetchedPointers.has(pointerValue)) {
      pointersToFetch.push(pointerValue);
    } else {
      entry.fetchedPointers.add(pointerValue);
    }
  });

  if (pointersToFetch.length && typeof fetchMetadata === "function") {
    await fetchMetadata(effectivePointerMap, pointersToFetch);
  }

  effectivePointerMap.forEach((info, pointerValue) => {
    const entry = ensureNip71CacheEntry(nip71Cache, info.videoRootId);
    if (entry) {
      entry.fetchedPointers.add(pointerValue);
    }
  });

  videos.forEach((video) => {
    mergeNip71MetadataIntoVideo(video, { nip71Cache });
  });
}

const EXTENSION_MIME_MAP = Object.freeze(
  Object.fromEntries(
    Object.entries({
      mp4: "video/mp4",
      m4v: "video/x-m4v",
      webm: "video/webm",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      ogv: "video/ogg",
      ogg: "video/ogg",
      m3u8: "application/x-mpegurl",
      mpd: "application/dash+xml",
      ts: "video/mp2t",
      mpg: "video/mpeg",
      mpeg: "video/mpeg",
      flv: "video/x-flv",
      "3gp": "video/3gpp",
    }).map(([extension, mimeType]) => [
      extension,
      typeof mimeType === "string" ? mimeType.toLowerCase() : "",
    ]),
  ),
);

function inferMimeTypeFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  let pathname = "";
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname || "";
  } catch (err) {
    const sanitized = url.split("?")[0].split("#")[0];
    pathname = sanitized || "";
  }

  const lastSegment = pathname.split("/").pop() || "";
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return "";
  }

  const extension = match[1].toLowerCase();
  const mimeType = EXTENSION_MIME_MAP[extension];
  return typeof mimeType === "string" ? mimeType : "";
}

export function convertEventToVideo(event = {}) {
  const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

  const rawContent = typeof event.content === "string" ? event.content : "";
  const tags = Array.isArray(event.tags) ? event.tags : [];

  let parsedContent = {};
  let parseError = null;
  if (rawContent) {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object") {
        parsedContent = parsed;
      }
    } catch (err) {
      parseError = err;
      parsedContent = {};
    }
  }

  const directUrl = safeTrim(parsedContent.url);
  const directMagnetRaw = safeTrim(parsedContent.magnet);

  const normalizeMagnetCandidate = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.toLowerCase().startsWith("magnet:?")) {
      return trimmed;
    }
    return "";
  };

  let magnet = normalizeMagnetCandidate(directMagnetRaw);
  let rawMagnet = magnet ? directMagnetRaw : "";

  const url = directUrl;

  if (!url && !magnet) {
    return { id: event.id, invalid: true, reason: "missing playable source" };
  }

  const thumbnail = safeTrim(parsedContent.thumbnail);
  const description = safeTrim(parsedContent.description);
  const rawMode = safeTrim(parsedContent.mode);
  const mode = rawMode || "live";
  const deleted = parsedContent.deleted === true;
  const isPrivate = parsedContent.isPrivate === true;
  const isNsfw = parsedContent.isNsfw === true;
  const isForKids = parsedContent.isForKids === true && !isNsfw;
  const videoRootId = safeTrim(parsedContent.videoRootId) || event.id;
  const wsField = safeTrim(parsedContent.ws);
  const xsField = safeTrim(parsedContent.xs);
  const enableComments =
    parsedContent.enableComments === false ? false : true;

  let infoHash = "";
  const pushInfoHash = (candidate) => {
    if (typeof candidate !== "string") {
      return false;
    }
    const normalized = candidate.trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(normalized)) {
      infoHash = normalized;
      return true;
    }
    return false;
  };

  pushInfoHash(parsedContent.infoHash);

  if (!infoHash && magnet) {
    const match = magnet.match(/xt=urn:btih:([0-9a-z]+)/i);
    if (match && match[1]) {
      pushInfoHash(match[1]);
    }
  }

  let derivedTitle = typeof parsedContent.title === "string" ? parsedContent.title : "";
  if (!derivedTitle) {
    derivedTitle = deriveTitleFromEvent({
      id: event.id,
      pubkey: event.pubkey,
      content: rawContent,
      tags,
    });
  }

  let title = safeTrim(derivedTitle);

  if (!title) {
    const reason = parseError
      ? "missing title (json parse error)"
      : "missing title";
    return { id: event.id, invalid: true, reason };
  }

  const rawVersion = parsedContent.version;
  let version = rawVersion === undefined ? 2 : Number(rawVersion);
  if (!Number.isFinite(version)) {
    version = rawVersion === undefined ? 2 : 1;
  }

  if (version < 2) {
    return {
      id: event.id,
      invalid: true,
      reason: `unsupported version ${version}`,
    };
  }

  const magnetHints = magnet
    ? extractMagnetHints(magnet)
    : { ws: "", xs: "" };
  const ws = wsField || magnetHints.ws || "";
  const xs = xsField || magnetHints.xs || "";

  return {
    id: event.id,
    videoRootId,
    version,
    isPrivate,
    isNsfw,
    isForKids,
    title,
    url,
    magnet,
    rawMagnet,
    infoHash,
    thumbnail,
    description,
    mode,
    deleted,
    ws,
    xs,
    enableComments,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags,
    invalid: false,
  };
}

export { stringFromInput };
