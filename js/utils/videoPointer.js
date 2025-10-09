// js/utils/videoPointer.js

import { pointerArrayToKey } from "./pointer.js";

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
} = {}) {
  const normalizedPubkey = normalizeString(pubkey).toLowerCase();
  const normalizedKind =
    typeof kind === "number" && Number.isFinite(kind) ? kind : DEFAULT_VIDEO_KIND;
  const pointerCandidates = [];

  const rootId = normalizeString(videoRootId);
  if (rootId && normalizedPubkey) {
    pointerCandidates.push(["a", `${normalizedKind}:${normalizedPubkey}:${rootId}`]);
  }

  const normalizedDTag = normalizeString(dTag);
  if (normalizedDTag && normalizedPubkey) {
    pointerCandidates.push([
      "a",
      `${normalizedKind}:${normalizedPubkey}:${normalizedDTag}`,
    ]);
  }

  const fallbackId = normalizeString(fallbackEventId);
  if (fallbackId) {
    pointerCandidates.push(["e", fallbackId]);
  }

  for (const pointer of pointerCandidates) {
    const key = pointerArrayToKey(pointer);
    if (key) {
      return { pointer, key };
    }
  }

  return null;
}

export default resolveVideoPointer;
