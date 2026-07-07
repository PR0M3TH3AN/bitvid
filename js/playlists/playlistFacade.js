// js/playlists/playlistFacade.js
//
// Network wiring for creator playlists (#37): fetch a creator's playlists / one
// playlist, and publish (build + sign + publish) a playlist. Kept apart from the
// pure playlistService core so that core stays hermetic. Reads route through the
// L1 SubscriptionManager (relay caps + in-flight dedupe), matching the rest of
// bitvid's read paths; writes go through nostrClient.signAndPublishEvent (active
// signer). All entry points take an injectable `client` for testing.

import { nostrClient } from "../nostrClientFacade.js";
import {
  PLAYLIST_KIND,
  parsePlaylistEvent,
  buildPlaylist,
} from "./playlistService.js";
import { devLogger } from "../utils/logger.js";

const LIST_LIMIT = 200;

function getManagerAndRelays(client) {
  const manager =
    typeof client?.getSubscriptionManager === "function"
      ? client.getSubscriptionManager()
      : null;
  const relays = Array.isArray(client?.relays) ? client.relays : [];
  return { manager, relays };
}

// Collapse to the newest event per `d` tag (NIP-33 replaceable): a flaky relay
// list can return an old + new copy of the same playlist, so keep only the
// freshest per id.
function newestPerDTag(events) {
  const byD = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || !Array.isArray(event.tags)) {
      continue;
    }
    const dTag = event.tags.find(
      (t) => Array.isArray(t) && t[0] === "d" && typeof t[1] === "string",
    );
    const id = dTag ? dTag[1] : "";
    if (!id) {
      continue;
    }
    const existing = byD.get(id);
    if (
      !existing ||
      (Number(event.created_at) || 0) > (Number(existing.created_at) || 0)
    ) {
      byD.set(id, event);
    }
  }
  return [...byD.values()];
}

/**
 * Fetch a creator's playlists, parsed, newest-per-id, sorted newest-first.
 * Empty playlists are dropped from the listing by default (a cleared playlist
 * republishes as an empty replaceable event) — pass includeEmpty to keep them.
 * @param {string} pubkey
 * @param {{ client?: any, includeEmpty?: boolean }} [opts]
 * @returns {Promise<Array>} parsed playlists
 */
export async function fetchCreatorPlaylists(
  pubkey,
  { client = nostrClient, includeEmpty = false } = {},
) {
  const author =
    typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  if (!author) {
    return [];
  }
  const { manager, relays } = getManagerAndRelays(client);
  if (!manager || typeof manager.list !== "function" || !relays.length) {
    return [];
  }

  let events = [];
  try {
    events = await manager.list({
      relays,
      filters: [{ kinds: [PLAYLIST_KIND], authors: [author], limit: LIST_LIMIT }],
    });
  } catch (error) {
    devLogger.warn("[playlists] Failed to list creator playlists:", error);
    return [];
  }

  return newestPerDTag(events)
    .map(parsePlaylistEvent)
    .filter(Boolean)
    .filter((playlist) => includeEmpty || playlist.items.length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Fetch a single playlist by (pubkey, id). Returns the newest matching event
 * parsed, or null.
 * @param {string} pubkey
 * @param {string} id
 * @param {{ client?: any }} [opts]
 * @returns {Promise<Object|null>}
 */
export async function fetchPlaylist(pubkey, id, { client = nostrClient } = {}) {
  const author =
    typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  const dTag = typeof id === "string" ? id.trim() : "";
  if (!author || !dTag) {
    return null;
  }
  const { manager, relays } = getManagerAndRelays(client);
  if (!manager || typeof manager.list !== "function" || !relays.length) {
    return null;
  }

  let events = [];
  try {
    events = await manager.list({
      relays,
      filters: [
        {
          kinds: [PLAYLIST_KIND],
          authors: [author],
          "#d": [dTag],
          limit: 20,
        },
      ],
    });
  } catch (error) {
    devLogger.warn("[playlists] Failed to fetch playlist:", error);
    return null;
  }

  const newest = newestPerDTag(events)[0];
  return newest ? parsePlaylistEvent(newest) : null;
}

/**
 * Build + sign + publish a playlist (replaces the same `d` on relays, NIP-33).
 * @param {Object} playlist  { pubkey, id, title, description, image, items }
 * @param {{ client?: any }} [opts]
 * @returns {Promise<Object>} the signed event
 */
export async function publishPlaylist(playlist, { client = nostrClient } = {}) {
  const event = buildPlaylist(playlist);
  const result = await client.signAndPublishEvent(event, {
    context: "playlist",
  });
  return result?.signedEvent || null;
}

/**
 * Delete a playlist: publishes a NIP-09 deletion (kind 5) referencing the
 * playlist's addressable coordinate (`a`) and, when known, its event id (`e`),
 * so relays that honor deletions drop it. Also republishes the playlist as an
 * empty replaceable event so readers that ignore kind 5 still see it as empty
 * (and empty playlists are dropped from listings).
 * @param {Object} playlist  parsed playlist ({ pubkey, id, address, eventId })
 * @param {{ client?: any }} [opts]
 * @returns {Promise<Object|null>} the signed deletion event
 */
export async function deletePlaylist(playlist, { client = nostrClient } = {}) {
  const pubkey =
    typeof playlist?.pubkey === "string" ? playlist.pubkey.trim().toLowerCase() : "";
  const id = typeof playlist?.id === "string" ? playlist.id.trim() : "";
  if (!pubkey || !id) {
    return null;
  }
  const address =
    typeof playlist.address === "string" && playlist.address
      ? playlist.address
      : `${PLAYLIST_KIND}:${pubkey}:${id}`;

  const tags = [["a", address]];
  if (typeof playlist.eventId === "string" && playlist.eventId) {
    tags.push(["e", playlist.eventId]);
  }
  const deletion = {
    kind: 5,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "playlist deleted",
  };

  // Best-effort: replace with an empty playlist so kind-5-ignoring readers drop it.
  try {
    await publishPlaylist(
      { pubkey, id, title: playlist.title || "", items: [] },
      { client },
    );
  } catch (error) {
    devLogger.warn("[playlists] Failed to empty playlist during delete:", error);
  }

  const result = await client.signAndPublishEvent(deletion, {
    context: "playlist-delete",
  });
  return result?.signedEvent || null;
}

export default {
  fetchCreatorPlaylists,
  fetchPlaylist,
  publishPlaylist,
};
