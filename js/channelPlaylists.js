// js/channelPlaylists.js
//
// Channel-page "Playlists" section (#37). Fetches the creator's playlists and
// renders a row of cards linking to the playlist view. Kept out of
// channelProfile.js (that file is at its size cap) and wired in via a one-line
// hook, mirroring channelZapTotal.js. Gated by FEATURE_PLAYLISTS — with the flag
// off it renders nothing and does no fetch.
//
// Also listens for `bitvid:playlists-changed` (dispatched by the "Add to
// playlist" picker) so the section refreshes right after you add/create a
// playlist, instead of needing a manual page reload.

import { fetchCreatorPlaylists } from "./playlists/playlistFacade.js";
import { FEATURE_PLAYLISTS } from "./constants.js";
import { devLogger } from "./utils/logger.js";

let currentToken = 0;
let currentHex = "";
let currentClient;
let currentDoc = null;
let listenerAttached = false;

function clearChildren(el) {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function playlistHref(playlist) {
  const params = new URLSearchParams({
    view: "playlist",
    pubkey: playlist.pubkey,
    id: playlist.id,
  });
  return `#${params.toString()}`;
}

function renderPlaylistCard(doc, playlist) {
  const card = doc.createElement("a");
  card.href = playlistHref(playlist);
  card.className = "playlist-card";
  card.setAttribute(
    "aria-label",
    `Playlist: ${playlist.title} (${playlist.items.length} videos)`,
  );

  const thumb = doc.createElement("div");
  thumb.className = "playlist-card__thumb";
  if (playlist.image) {
    const img = doc.createElement("img");
    img.src = playlist.image;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.className = "playlist-card__image";
    thumb.appendChild(img);
  }
  const count = doc.createElement("span");
  count.className = "playlist-card__count";
  const n = playlist.items.length;
  count.textContent = `${n} ${n === 1 ? "video" : "videos"}`;
  thumb.appendChild(count);
  card.appendChild(thumb);

  const title = doc.createElement("p");
  title.className = "playlist-card__title";
  title.textContent = playlist.title;
  card.appendChild(title);

  return card;
}

// Fetch + render the currently-wired channel's playlists. Safe to call any time
// (event refresh, initial wire); a nav token drops a stale fetch.
async function refresh() {
  const doc = currentDoc || globalThis.document;
  const section =
    doc && typeof doc.getElementById === "function"
      ? doc.getElementById("channelPlaylistsSection")
      : null;
  const grid = doc?.getElementById?.("channelPlaylistsGrid") || null;
  if (!section || !grid) {
    return;
  }

  if (!FEATURE_PLAYLISTS || !currentHex) {
    section.classList.add("hidden");
    return;
  }

  const token = currentToken;
  let playlists = [];
  try {
    playlists = await fetchCreatorPlaylists(
      currentHex,
      currentClient ? { client: currentClient } : {},
    );
  } catch (error) {
    devLogger.warn("[channelPlaylists] Failed to load playlists:", error);
    playlists = [];
  }

  // A newer navigation superseded this fetch.
  if (token !== currentToken) {
    return;
  }

  if (!playlists.length) {
    section.classList.add("hidden");
    return;
  }

  clearChildren(grid);
  const frag = doc.createDocumentFragment();
  for (const playlist of playlists) {
    frag.appendChild(renderPlaylistCard(doc, playlist));
  }
  grid.appendChild(frag);
  section.classList.remove("hidden");
}

function onPlaylistsChanged(event) {
  const changed = (event?.detail?.pubkey || "").trim().toLowerCase();
  if (!currentHex || changed !== currentHex) {
    return;
  }
  // Refresh now, then again shortly after — relays need a beat to serve the
  // event we just published back, so the first fetch can miss it.
  refresh();
  setTimeout(() => {
    refresh();
  }, 2000);
}

export function teardownChannelPlaylists() {
  currentToken += 1;
  currentHex = "";
}

/**
 * Populate the channel "Playlists" section for a creator. Hidden when the flag
 * is off, the container is missing, or the creator has no playlists.
 * @param {string} pubkey  the channel's hex pubkey
 * @param {{ document?: Document, client?: any }} [opts]
 */
export async function wireChannelPlaylists(
  pubkey,
  { document: doc = globalThis.document, client } = {},
) {
  teardownChannelPlaylists();
  currentHex = typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  currentClient = client;
  currentDoc = doc || globalThis.document;

  if (!listenerAttached && currentDoc?.addEventListener) {
    currentDoc.addEventListener("bitvid:playlists-changed", onPlaylistsChanged);
    listenerAttached = true;
  }

  await refresh();
}

export default wireChannelPlaylists;
