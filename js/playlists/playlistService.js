// js/playlists/playlistService.js
//
// Creator playlists (#37) — pure core. A playlist is a bitvid-native addressable
// event (kind PLAYLIST_KIND=30082): all data lives in tags (d/title/description/
// image + ordered `a` refs to videos). This module holds the pure, hermetic
// logic — parse an event into a structured playlist, build a signable event from
// one, and immutably add/remove/reorder items. Network I/O (fetch a creator's
// playlists, publish) lives in the facade that wires this to the live client, so
// this core stays fully unit-testable with no relays or signer.

import {
  buildPlaylistEvent,
  PLAYLIST_KIND,
} from "../nostrEventSchemas.js";
import { buildVideoAddressPointer } from "../utils/videoPointer.js";

export { PLAYLIST_KIND };

function firstTagValue(tags, name) {
  const tag = tags.find(
    (t) => Array.isArray(t) && t[0] === name && typeof t[1] === "string",
  );
  return tag ? tag[1] : "";
}

/**
 * A structured playlist item references one video, either by addressable
 * coordinate (`a` → "30078:pubkey:d") or raw event id (`e`).
 * @typedef {{ type: "a" | "e", value: string }} PlaylistItem
 */

export function playlistItemKey(item) {
  return item && item.type && typeof item.value === "string" && item.value
    ? `${item.type}:${item.value}`
    : "";
}

/**
 * Parse a kind-30082 event into a structured playlist. Returns null for a
 * non-playlist event or one missing a `d` identifier. Item order follows tag
 * order; duplicate refs are collapsed.
 * @param {Object} event
 * @returns {null | {
 *   id: string, pubkey: string, title: string, description: string,
 *   image: string, items: PlaylistItem[], updatedAt: number,
 *   address: string, eventId: string,
 * }}
 */
export function parsePlaylistEvent(event) {
  if (!event || typeof event !== "object" || !Array.isArray(event.tags)) {
    return null;
  }
  if (Number.isFinite(event.kind) && event.kind !== PLAYLIST_KIND) {
    return null;
  }

  const tags = event.tags;
  const id = firstTagValue(tags, "d").trim();
  if (!id) {
    return null;
  }

  const items = [];
  const seen = new Set();
  for (const tag of tags) {
    if (!Array.isArray(tag) || (tag[0] !== "a" && tag[0] !== "e")) {
      continue;
    }
    if (typeof tag[1] !== "string") {
      continue;
    }
    const value = tag[1].trim();
    const key = `${tag[0]}:${value}`;
    if (value && !seen.has(key)) {
      seen.add(key);
      items.push({ type: tag[0], value });
    }
  }

  const pubkey =
    typeof event.pubkey === "string" ? event.pubkey.trim().toLowerCase() : "";

  return {
    id,
    pubkey,
    title: firstTagValue(tags, "title").trim() || "Untitled playlist",
    description: firstTagValue(tags, "description").trim(),
    image: firstTagValue(tags, "image").trim(),
    items,
    updatedAt: Number.isFinite(event.created_at) ? event.created_at : 0,
    address: `${PLAYLIST_KIND}:${pubkey}:${id}`,
    eventId: typeof event.id === "string" ? event.id : "",
  };
}

/**
 * Immutably add a video (by addressable coordinate) to an item list. Deduped —
 * a video already present is a no-op. Appends unless a valid `position` is given.
 * @param {PlaylistItem[]} items
 * @param {string} coordinate  "30078:pubkey:d"
 * @param {{ position?: number }} [opts]
 * @returns {PlaylistItem[]} a new array
 */
export function addVideoToPlaylist(items, coordinate, { position } = {}) {
  const list = Array.isArray(items) ? items.slice() : [];
  const value = typeof coordinate === "string" ? coordinate.trim() : "";
  if (!value) {
    return list;
  }
  const item = { type: "a", value };
  const key = playlistItemKey(item);
  if (list.some((existing) => playlistItemKey(existing) === key)) {
    return list;
  }
  if (Number.isInteger(position) && position >= 0 && position < list.length) {
    list.splice(position, 0, item);
  } else {
    list.push(item);
  }
  return list;
}

/**
 * Immutably remove a video from an item list, by coordinate string (treated as
 * an `a` ref) or by a {type,value} item.
 * @param {PlaylistItem[]} items
 * @param {string | PlaylistItem} coordinateOrItem
 * @returns {PlaylistItem[]} a new array
 */
export function removeVideoFromPlaylist(items, coordinateOrItem) {
  const list = Array.isArray(items) ? items.slice() : [];
  const key =
    typeof coordinateOrItem === "string"
      ? `a:${coordinateOrItem.trim()}`
      : playlistItemKey(coordinateOrItem);
  if (!key) {
    return list;
  }
  return list.filter((item) => playlistItemKey(item) !== key);
}

/**
 * Immutably move an item from one index to another (drag-to-reorder). Out-of-
 * range indices are ignored / clamped; returns a new array.
 * @param {PlaylistItem[]} items
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {PlaylistItem[]}
 */
export function reorderPlaylistItems(items, fromIndex, toIndex) {
  const list = Array.isArray(items) ? items.slice() : [];
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return list;
  }
  if (fromIndex < 0 || fromIndex >= list.length) {
    return list;
  }
  const clampedTo = Math.max(0, Math.min(toIndex, list.length - 1));
  if (clampedTo === fromIndex) {
    return list;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(clampedTo, 0, moved);
  return list;
}

/**
 * The addressable coordinate ("30078:pubkey:d") for a video object/event, using
 * the app's canonical derivation (defaults invalid/missing kinds to 30078).
 * @param {Object} video
 * @returns {string} coordinate, or "" if it can't be derived
 */
export function videoCoordinate(video) {
  return buildVideoAddressPointer(video);
}

/**
 * Build an unsigned, signable playlist event from a structured playlist.
 * @param {{
 *   pubkey: string, id: string, title?: string, description?: string,
 *   image?: string, items?: PlaylistItem[], content?: string, created_at?: number,
 * }} playlist
 * @returns {Object} unsigned kind-30082 event
 */
export function buildPlaylist({
  pubkey,
  id,
  title = "",
  description = "",
  image = "",
  items = [],
  content = "",
  created_at,
} = {}) {
  const videoCoordinates = [];
  const eventRefs = [];
  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item.value !== "string") {
        continue;
      }
      if (item.type === "a") {
        videoCoordinates.push(item.value);
      } else if (item.type === "e") {
        eventRefs.push(item.value);
      }
    }
  }
  return buildPlaylistEvent({
    pubkey,
    created_at: Number.isFinite(created_at)
      ? created_at
      : Math.floor(Date.now() / 1000),
    dTagValue: id,
    title,
    description,
    image,
    videoCoordinates,
    eventRefs,
    content,
  });
}

/**
 * Generate a stable-ish, collision-resistant playlist id for a new playlist's
 * `d` tag (time-prefixed + random suffix, lowercase, URL/tag-safe).
 * @returns {string}
 */
export function generatePlaylistId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `pl-${time}-${rand}`;
}

export default {
  PLAYLIST_KIND,
  parsePlaylistEvent,
  playlistItemKey,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  reorderPlaylistItems,
  videoCoordinate,
  buildPlaylist,
  generatePlaylistId,
};
