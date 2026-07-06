// js/channelPlaylists.js
//
// Channel-page "Playlists" section (#37). Fetches the creator's playlists and
// renders a row of cards linking to the playlist view. Kept out of
// channelProfile.js (that file is at its size cap) and wired in via a one-line
// hook, mirroring channelZapTotal.js. Gated by FEATURE_PLAYLISTS — with the flag
// off (default) it renders nothing and does no fetch, so it's invisible until
// the whole playlist UI ships.

import { fetchCreatorPlaylists } from "./playlists/playlistFacade.js";
import { FEATURE_PLAYLISTS } from "./constants.js";
import { devLogger } from "./utils/logger.js";

let currentToken = 0;

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

export function teardownChannelPlaylists() {
  currentToken += 1;
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
  const token = currentToken;

  const section =
    doc && typeof doc.getElementById === "function"
      ? doc.getElementById("channelPlaylistsSection")
      : null;
  const grid = doc?.getElementById?.("channelPlaylistsGrid") || null;
  if (!section || !grid) {
    return;
  }

  const hide = () => section.classList.add("hidden");
  const show = () => section.classList.remove("hidden");

  const hex = typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  if (!FEATURE_PLAYLISTS || !hex) {
    hide();
    return;
  }

  let playlists = [];
  try {
    playlists = await fetchCreatorPlaylists(hex, client ? { client } : {});
  } catch (error) {
    devLogger.warn("[channelPlaylists] Failed to load playlists:", error);
    playlists = [];
  }

  // A newer navigation (channel switch / teardown) superseded this fetch.
  if (token !== currentToken) {
    return;
  }

  if (!playlists.length) {
    hide();
    return;
  }

  clearChildren(grid);
  const frag = doc.createDocumentFragment();
  for (const playlist of playlists) {
    frag.appendChild(renderPlaylistCard(doc, playlist));
  }
  grid.appendChild(frag);
  show();
}

export default wireChannelPlaylists;
