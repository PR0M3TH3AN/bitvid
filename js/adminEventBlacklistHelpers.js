// Helpers for the per-event (per-video) admin block list (#25). Entries are 64-char
// hex event ids carried as `e` tags on a kind-30000 NIP-51 list — not npubs.

import { buildAdminListEvent } from "./nostrEventSchemas.js";

export const HEX_EVENT_ID_REGEX = /^[0-9a-f]{64}$/i;

// Unsigned kind-30000 event for the per-event block list (`e` tags via its schema).
export function buildEventBlacklistEvent(actorHex, eventIds) {
  return buildAdminListEvent("eventBlacklist", {
    pubkey: actorHex,
    created_at: Math.floor(Date.now() / 1000),
    hexPubkeys: sanitizeEventIdList(eventIds),
  });
}

// Deduped, lowercased hex event ids; anything malformed is dropped.
export function sanitizeEventIdList(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (HEX_EVENT_ID_REGEX.test(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function extractEventIdsFromEvent(event) {
  if (!event || !Array.isArray(event.tags)) {
    return [];
  }
  return sanitizeEventIdList(
    event.tags
      .filter((tag) => Array.isArray(tag) && tag[0] === "e" && tag[1])
      .map((tag) => tag[1]),
  );
}

// Normalize a per-event block entry to a 64-char hex event id. Accepts a raw hex id or
// a NIP-19 nevent/note string (the ⋯ menu passes the video's hex id directly).
export function normalizeEventId(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (HEX_EVENT_ID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    const tools =
      (typeof window !== "undefined" ? window?.NostrTools : null) ||
      (typeof globalThis !== "undefined" ? globalThis?.NostrTools : null);
    const decoded = tools?.nip19?.decode?.(trimmed);
    if (decoded?.type === "nevent" && HEX_EVENT_ID_REGEX.test(decoded.data?.id || "")) {
      return decoded.data.id.toLowerCase();
    }
    if (decoded?.type === "note" && HEX_EVENT_ID_REGEX.test(decoded.data || "")) {
      return decoded.data.toLowerCase();
    }
  } catch (error) {
    // not a decodable pointer
  }
  return "";
}

export function normalizeEventIdList(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const id = normalizeEventId(value);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
