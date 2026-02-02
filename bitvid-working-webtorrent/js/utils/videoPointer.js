// js/utils/videoPointer.js

import { pointerArrayToKey } from "./pointer.js";
import { devLogger } from "./logger.js";
import { normalizeHexPubkey } from "./hex.js";

const DEFAULT_VIDEO_KIND = 30078;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveVideoPointer({
  kind,
  pubkey,
  videoRootId,
  dTag,
  fallbackEventId,
  relay,
} = {}) {
  const normalizedPubkey = normalizeString(pubkey).toLowerCase();
  const normalizedKind =
    typeof kind === "number" && Number.isFinite(kind) ? kind : DEFAULT_VIDEO_KIND;
  const pointerCandidates = [];
  const normalizedRelay = normalizeString(relay);

  const normalizedDTag = normalizeString(dTag);
  if (normalizedDTag && normalizedPubkey) {
    const ptr = ["a", `${normalizedKind}:${normalizedPubkey}:${normalizedDTag}`];
    if (normalizedRelay) ptr.push(normalizedRelay);
    pointerCandidates.push(ptr);
  }

  const rootId = normalizeString(videoRootId);
  if (rootId && normalizedPubkey) {
    const ptr = ["a", `${normalizedKind}:${normalizedPubkey}:${rootId}`];
    if (normalizedRelay) ptr.push(normalizedRelay);
    pointerCandidates.push(ptr);
  }

  const fallbackId = normalizeString(fallbackEventId);
  if (fallbackId) {
    const ptr = ["e", fallbackId];
    if (normalizedRelay) ptr.push(normalizedRelay);
    pointerCandidates.push(ptr);
  }

  for (const pointer of pointerCandidates) {
    const key = pointerArrayToKey(pointer);
    if (key) {
      const pointerEventId =
        pointer[0] === "e" && typeof pointer[1] === "string"
          ? pointer[1].trim()
          : fallbackId;
      return {
        pointer,
        key,
        eventId:
          typeof pointerEventId === "string" && pointerEventId
            ? pointerEventId
            : "",
      };
    }
  }

  return null;
}

export default resolveVideoPointer;

export function buildVideoAddressPointer(
  video,
  { defaultKind = DEFAULT_VIDEO_KIND, logger = devLogger } = {}
) {
  if (!video || typeof video !== "object") {
    return "";
  }

  const tags = Array.isArray(video.tags) ? video.tags : [];
  const dTag = tags.find(
    (tag) =>
      Array.isArray(tag) &&
      tag.length >= 2 &&
      tag[0] === "d" &&
      typeof tag[1] === "string" &&
      tag[1].trim()
  );

  if (!dTag) {
    return "";
  }

  const pubkey = normalizeHexPubkey(video.pubkey);
  if (!pubkey) {
    return "";
  }

  const identifier = dTag[1].trim();
  if (!identifier) {
    return "";
  }

  let kind = defaultKind;
  if (Number.isFinite(video.kind) && video.kind > 0) {
    kind = Math.floor(video.kind);
  } else if (typeof video.kind === "string" && video.kind.trim()) {
    const parsed = Number(video.kind);
    if (Number.isFinite(parsed) && parsed > 0) {
      kind = Math.floor(parsed);
    }
  }

  if (!Number.isFinite(kind) || kind <= 0) {
    if (logger?.warn) {
      logger.warn(
        "[videoPointer] Invalid kind detected while building video pointer; defaulting to 30078.",
        { kind: video.kind }
      );
    }
    kind = DEFAULT_VIDEO_KIND;
  }

  return `${kind}:${pubkey}:${identifier}`;
}

export { DEFAULT_VIDEO_KIND };
