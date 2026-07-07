// js/playlistView.js
//
// The playlist view (#37): #view=playlist&pubkey=<hex>&id=<playlist id>. Fetches
// the playlist, resolves its ordered `a` refs to the app's active video objects,
// and renders them into the shared #videoList grid via app.renderVideoList
// (preserveOrder so the playlist's order is kept, not re-sorted by date — #21).
// Gated by FEATURE_PLAYLISTS.

import { nostrClient } from "./nostrClientFacade.js";
import { fetchPlaylist } from "./playlists/playlistFacade.js";
import { buildVideoAddressPointer } from "./utils/videoPointer.js";
import { safeEncodeNpub } from "./utils/nostrHelpers.js";
import { FEATURE_PLAYLISTS } from "./constants.js";
import { devLogger } from "./utils/logger.js";

function readParams() {
  const params = new URLSearchParams(
    typeof window !== "undefined" && window.location
      ? window.location.hash.slice(1)
      : "",
  );
  return {
    pubkey: (params.get("pubkey") || "").trim().toLowerCase(),
    id: (params.get("id") || "").trim(),
  };
}

// Resolve the playlist's items to video objects, in playlist order, from the
// given pool. Unresolved refs (video missing) are skipped — the count line
// reflects how many resolved.
function resolveOrderedVideos(playlist, videoPool) {
  const byCoordinate = new Map();
  const byEventId = new Map();
  for (const video of videoPool) {
    const coordinate = buildVideoAddressPointer(video);
    if (coordinate && !byCoordinate.has(coordinate)) {
      byCoordinate.set(coordinate, video);
    }
    if (video && typeof video.id === "string" && video.id) {
      byEventId.set(video.id, video);
    }
  }

  const ordered = [];
  for (const item of playlist.items) {
    const video =
      item.type === "a"
        ? byCoordinate.get(item.value)
        : byEventId.get(item.value);
    if (video) {
      ordered.push(video);
    }
  }
  return ordered;
}

// The videos to resolve against. Resolve from the ALREADY-active cache first —
// when you arrive from the creator's channel (or re-visit), the videos are
// already loaded, so this is instant with no relay round-trip. Only when some
// playlist coordinates are still missing (a cold deep-link) do we fetch the
// referenced creators' videos. Without any fetch, a cold deep-link resolves
// nothing and the shared grid shows the default feed instead.
async function gatherVideoPool(playlist, app) {
  let active = [];
  try {
    active = nostrClient.getActiveVideos() || [];
  } catch (error) {
    active = [];
  }

  const covered = new Set();
  for (const video of active) {
    const coordinate = buildVideoAddressPointer(video);
    if (coordinate) {
      covered.add(coordinate);
    }
  }

  const neededCoords = playlist.items
    .filter((item) => item.type === "a")
    .map((item) => item.value);
  const allCovered = neededCoords.every((coord) => covered.has(coord));
  if (allCovered) {
    return active;
  }

  const authors = [
    ...new Set(neededCoords.map((coord) => coord.split(":")[1]).filter(Boolean)),
  ];
  let fetched = [];
  if (
    authors.length &&
    typeof app?.nostrService?.fetchVideosByAuthors === "function"
  ) {
    try {
      fetched = (await app.nostrService.fetchVideosByAuthors(authors)) || [];
    } catch (error) {
      devLogger.warn("[playlistView] Failed to fetch playlist videos:", error);
    }
  }

  return [...fetched, ...active];
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

export async function initPlaylistView({ getApp } = {}) {
  const app = typeof getApp === "function" ? getApp() : null;
  const { pubkey, id } = readParams();

  if (!FEATURE_PLAYLISTS) {
    setText("playlistTitle", "Playlists are not enabled.");
    return;
  }
  if (!pubkey || !id) {
    setText("playlistTitle", "Playlist not found.");
    return;
  }

  // Point the back link at the creator's channel.
  const back = document.getElementById("playlistBackLink");
  const npub = safeEncodeNpub(pubkey);
  if (back && npub) {
    back.setAttribute("href", `#view=channel-profile&npub=${npub}`);
  }

  let playlist = null;
  try {
    playlist = await fetchPlaylist(pubkey, id);
  } catch (error) {
    devLogger.warn("[playlistView] Failed to fetch playlist:", error);
  }

  if (!playlist) {
    setText("playlistTitle", "Playlist not found.");
    setText("playlistMeta", "");
    return;
  }

  setText("playlistTitle", playlist.title);

  const pool = await gatherVideoPool(playlist, app);
  const videos = resolveOrderedVideos(playlist, pool);
  const total = playlist.items.length;
  setText(
    "playlistMeta",
    videos.length === total
      ? `${total} ${total === 1 ? "video" : "videos"}`
      : `${videos.length} of ${total} videos available`,
  );

  // Always render into the shared grid — even an empty playlist must OVERRIDE
  // the default feed that populates #videoList, so a deep-linked playlist never
  // shows unrelated recent videos.
  if (app && typeof app.mountVideoListView === "function") {
    app.mountVideoListView({ includeTags: false });
  }
  if (app && typeof app.renderVideoList === "function") {
    try {
      await app.renderVideoList({
        videos,
        metadata: {
          reason: "playlist",
          preserveOrder: true,
          emptyStateMessage: "None of this playlist's videos could be loaded.",
        },
      });
    } catch (error) {
      devLogger.warn("[playlistView] Failed to render playlist videos:", error);
    }
  }
}

export default initPlaylistView;
