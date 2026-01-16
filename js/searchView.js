// js/searchView.js

import { nostrClient } from "./nostrClientFacade.js";
import { getApplication } from "./applicationContext.js";
import { renderChannelVideosFromList } from "./channelProfile.js";
import { escapeHTML } from "./utils/domUtils.js";
import { formatShortNpub } from "./utils/formatters.js";
import { sanitizeProfileMediaUrl } from "./utils/profileMedia.js";
import { devLogger } from "./utils/logger.js";

function getApp() {
  return getApplication();
}

const FALLBACK_AVATAR = "assets/svg/default-profile.svg";

function renderProfileCards(profiles, container) {
  if (!container) return;
  container.innerHTML = "";

  if (!profiles || profiles.length === 0) {
    container.innerHTML = `<p class="text-sm text-muted col-span-full">No matching channels found.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const profile of profiles) {
    const pubkey = profile.pubkey;
    const metadata = profile.metadata || {};
    const name = metadata.name || metadata.display_name || "Unknown User";
    const picture = sanitizeProfileMediaUrl(metadata.picture) || FALLBACK_AVATAR;
    const about = metadata.about || "";

    let npub = "";
    try {
        if (window.NostrTools && window.NostrTools.nip19) {
            npub = window.NostrTools.nip19.npubEncode(pubkey);
        }
    } catch (e) {
        // ignore
    }

    const shortNpub = formatShortNpub(npub) || "";

    const card = document.createElement("a");
    card.href = `#view=channel-profile&npub=${npub || pubkey}`;
    card.className = "flex items-center gap-3 p-3 rounded-lg bg-surface hover:bg-surface-elevated transition-colors border border-border group";

    card.innerHTML = `
      <div class="relative w-12 h-12 flex-shrink-0 rounded-full overflow-hidden bg-background">
        <img
          src="${escapeHTML(picture)}"
          alt="${escapeHTML(name)}"
          class="w-full h-full object-cover"
          loading="lazy"
          onerror="this.src='${FALLBACK_AVATAR}'"
        />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-semibold text-text-strong truncate group-hover:text-primary transition-colors">
          ${escapeHTML(name)}
        </h3>
        <p class="text-xs text-muted truncate">
          ${escapeHTML(shortNpub)}
        </p>
      </div>
    `;

    fragment.appendChild(card);
  }

  container.appendChild(fragment);
}

let currentSearchToken = 0;

export async function initSearchView() {
  const hashParams = new URLSearchParams(window.location.hash.split("?")[1] || window.location.hash.slice(1));
  // The hash format is #view=search&q=...
  // URLSearchParams handles 'view=search&q=...' correctly if we pass the string after #
  const query = hashParams.get("q") || "";

  const titleEl = document.getElementById("searchTitle");
  if (titleEl) {
    titleEl.textContent = query ? `Search Results for "${query}"` : "Search Results";
  }

  const channelList = document.getElementById("searchChannelList");
  const videoList = document.getElementById("searchVideoList");

  if (channelList) {
    channelList.innerHTML = `<p class="text-sm text-muted animate-pulse col-span-full">Searching channels...</p>`;
  }
  if (videoList) {
    videoList.innerHTML = `<p class="text-sm text-muted animate-pulse col-span-full">Searching videos...</p>`;
  }

  if (!query) {
    if (channelList) channelList.innerHTML = `<p class="text-sm text-muted col-span-full">Please enter a search term.</p>`;
    if (videoList) videoList.innerHTML = `<p class="text-sm text-muted col-span-full">Please enter a search term.</p>`;
    return;
  }

  const searchToken = ++currentSearchToken;

  // 1. Search Profiles
  performProfileSearch(query, searchToken).then(profiles => {
    if (searchToken !== currentSearchToken) return;
    renderProfileCards(profiles, channelList);
  }).catch(err => {
    devLogger.warn("[Search] Profile search failed", err);
    if (channelList && searchToken === currentSearchToken) {
        channelList.innerHTML = `<p class="text-sm text-critical col-span-full">Failed to load channels.</p>`;
    }
  });

  // 2. Search Videos
  performVideoSearch(query, searchToken).then(videos => {
    if (searchToken !== currentSearchToken) return;
    const app = getApp();
    renderSearchVideos(videos, videoList, app);
  }).catch(err => {
    devLogger.warn("[Search] Video search failed", err);
    if (videoList && searchToken === currentSearchToken) {
        videoList.innerHTML = `<p class="text-sm text-critical col-span-full">Failed to load videos.</p>`;
    }
  });
}

async function renderSearchVideos(videos, container, app) {
    if (!container) return;
    container.innerHTML = "";

    if (!videos || videos.length === 0) {
        container.innerHTML = `<p class="text-sm text-muted col-span-full">No matching videos found.</p>`;
        return;
    }

    // Dynamic import VideoCard to avoid circular dependencies if any
    const { VideoCard } = await import("./ui/components/VideoCard.js");
    const { escapeHTML } = await import("./utils/domUtils.js"); // Ensure availability

    const fragment = document.createDocumentFragment();

    // We need some helpers from app or utils
    const loadedThumbnails = app?.loadedThumbnails instanceof Map ? app.loadedThumbnails : new Map();

    let index = 0;
    for (const video of videos) {
        if (!video) continue;

        // Basic decoration if needed (e.g. resolve author info if not present)
        // For search results, we might not have full author profiles loaded.
        // We will do best effort.

        const shareUrl = app?.buildShareUrlFromEventId ? app.buildShareUrlFromEventId(video.id) : "#";
        const timeAgo = new Date(video.created_at * 1000).toLocaleString();

        // Construct identity object
        const identity = {
            name: video.authorName || "",
            picture: video.authorPicture || "",
            pubkey: video.pubkey,
            npub: video.authorNpub || "",
            shortNpub: video.shortNpub || ""
        };

        // If we have access to the profile cache, we could enrich this.
        // For now, let's rely on what's in the video object or defaults.

        const videoCard = new VideoCard({
            document,
            video,
            index: index++,
            shareUrl,
            timeAgo,
            cardState: "", // default
            identity,
            capabilities: {
                canEdit: false,
                canDelete: false
            },
            nsfwContext: {
                isNsfw: video.isNsfw,
                allowNsfw: true, // or import config
                viewerIsOwner: false
            },
            helpers: {
                escapeHtml: escapeHTML,
                isMagnetSupported: (magnet) => magnet && magnet.startsWith("magnet:"),
                toLocaleString: (val) => val.toLocaleString()
            },
            assets: {
                fallbackThumbnailSrc: "assets/jpg/video-thumbnail-fallback.jpg",
                unsupportedBtihMessage: "Unsupported magnet link"
            },
            state: { loadedThumbnails },
            // Callbacks can be wired if we want full interactivity (play, etc)
            ensureGlobalMoreMenuHandlers: () => {},
            onRequestCloseAllMenus: () => {}
        });

        // Wire up Play
        videoCard.onPlay = ({ event: domEvent }) => {
             // We can reuse the global playback handler if available
             if (app?.playVideoByEventId) {
                 app.playVideoByEventId(video.id, {
                     url: video.url,
                     magnet: video.magnet,
                     title: video.title
                 });
             } else if (app?.playVideoWithFallback) {
                 app.playVideoWithFallback({
                     url: video.url,
                     magnet: video.magnet
                 });
             }
        };

        videoCard.onAuthorNavigate = ({ pubkey }) => {
            if (app?.goToProfile) {
                app.goToProfile(pubkey || video.pubkey);
            }
        };

        const el = videoCard.getRoot();
        if (el) fragment.appendChild(el);
    }

    container.appendChild(fragment);
}

async function performProfileSearch(query, token) {
    if (!nostrClient || !nostrClient.pool) return [];

    const filter = {
        kinds: [0],
        search: query,
        limit: 20
    };

    // If query looks like NIP-05 (user@domain), we could try to resolve it directly?
    // For now, reliance on NIP-50 `search` is safer for broad queries.

    // We should also search our local cache?
    // The requirement says "search nostr relays".

    const relays = nostrClient.relays || [];
    if (relays.length === 0) return [];

    let events = [];
    try {
        events = await nostrClient.pool.list(relays, [filter]);
    } catch (e) {
        devLogger.warn("Profile search error", e);
        return [];
    }

    if (currentSearchToken !== token) return [];

    const profiles = events.map(event => {
        try {
            const metadata = JSON.parse(event.content);
            return {
                pubkey: event.pubkey,
                metadata,
                created_at: event.created_at
            };
        } catch (e) {
            return null;
        }
    }).filter(Boolean);

    // Deduplicate by pubkey, keeping newest
    const map = new Map();
    for (const p of profiles) {
        if (!map.has(p.pubkey) || map.get(p.pubkey).created_at < p.created_at) {
            map.set(p.pubkey, p);
        }
    }

    return Array.from(map.values());
}

async function performVideoSearch(query, token) {
    if (!nostrClient || !nostrClient.pool) return [];

    const isHashtag = query.startsWith("#");
    const term = isHashtag ? query.slice(1) : query;

    const filter = {
        kinds: [30078],
        limit: 50
    };

    if (isHashtag) {
        filter["#t"] = [term];
    } else {
        filter.search = term;
    }

    const relays = nostrClient.relays || [];
    if (relays.length === 0) return [];

    let events = [];
    try {
        events = await nostrClient.pool.list(relays, [filter]);
    } catch (e) {
        devLogger.warn("Video search error", e);
        return [];
    }

    if (currentSearchToken !== token) return [];

    const { convertEventToVideo } = await import("./nostr/index.js");

    const videos = events.map(evt => {
        const vid = convertEventToVideo(evt);
        if (vid.invalid) return null;
        return vid;
    }).filter(Boolean);

    // Deduplicate by ID (or root)
    const unique = new Map();
    for (const v of videos) {
        if (!unique.has(v.id)) {
            unique.set(v.id, v);
        }
    }

    return Array.from(unique.values());
}
