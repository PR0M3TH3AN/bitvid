// js/searchView.js

import { nostrClient } from "./nostrClientFacade.js";
import { getApplication } from "./applicationContext.js";
import { renderChannelVideosFromList } from "./channelProfile.js";
import { escapeHTML } from "./utils/domUtils.js";
import { formatShortNpub, truncateMiddle } from "./utils/formatters.js";
import { sanitizeProfileMediaUrl } from "./utils/profileMedia.js";
import { devLogger } from "./utils/logger.js";
import { attachFeedInfoPopover } from "./ui/components/FeedInfoPopover.js";
import { setHashView } from "./hashView.js";
import {
  buildSearchHashFromState,
  getSearchFilterState,
  resetSearchFilters,
  setSearchFilterState,
  syncSearchFilterStateFromHash,
} from "./search/searchFilterState.js";
import { buildVideoSearchFilterMatcher } from "./search/searchFilterMatchers.js";

function getApp() {
  return getApplication();
}

const FALLBACK_AVATAR = "assets/svg/default-profile.svg";
const EMPTY_FACET_COUNTS = { tags: [], authors: [], relays: [] };
const MAX_FACET_RESULTS = {
  tags: 8,
  authors: 6,
  relays: 6,
};

const normalizeFacetText = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const resolveShortPubkeyLabel = (pubkey) => {
  const trimmed = normalizeFacetText(pubkey);
  if (!trimmed) {
    return "";
  }
  let npub = "";
  try {
    if (window.NostrTools && window.NostrTools.nip19) {
      npub = window.NostrTools.nip19.npubEncode(trimmed);
    }
  } catch (error) {
    // ignore
  }
  const formattedNpub = formatShortNpub(npub);
  if (formattedNpub) {
    return formattedNpub;
  }
  return truncateMiddle(trimmed, 18);
};

const resolveAuthorFacetLabel = (video) => {
  const name = normalizeFacetText(video?.authorName);
  if (name) {
    return name;
  }
  const npub = normalizeFacetText(video?.authorNpub);
  if (npub) {
    return formatShortNpub(npub) || npub;
  }
  return resolveShortPubkeyLabel(video?.pubkey);
};

const extractRelayHints = (event) => {
  if (!event || typeof event !== "object") {
    return [];
  }
  const relayCandidates = [];
  const relayCollections = [event.relays, event.seenOn, event.seen_on];
  relayCollections.forEach((collection) => {
    if (Array.isArray(collection)) {
      relayCandidates.push(...collection);
    }
  });
  if (typeof event.relay === "string") {
    relayCandidates.push(event.relay);
  }
  return Array.from(
    new Set(
      relayCandidates
        .map((value) => normalizeFacetText(String(value)))
        .filter(Boolean),
    ),
  );
};

const normalizeTagFacetValue = (value) =>
  normalizeFacetText(value)
    .replace(/^#/, "")
    .toLowerCase();

const buildFacetEntries = (map, limit) => {
  if (!map.size) {
    return [];
  }
  return Array.from(map.values())
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label))
    .slice(0, limit);
};

const buildSearchFacetCounts = (videos = []) => {
  const tagCounts = new Map();
  const authorCounts = new Map();
  const relayCounts = new Map();

  videos.forEach((video) => {
    if (!video) {
      return;
    }

    const authorKey = normalizeFacetText(video.pubkey || "");
    if (authorKey) {
      const label = resolveAuthorFacetLabel(video) || authorKey;
      const entry = authorCounts.get(authorKey) || {
        value: authorKey,
        label,
        count: 0,
      };
      entry.count += 1;
      if (!entry.label && label) {
        entry.label = label;
      }
      authorCounts.set(authorKey, entry);
    }

    const tagSet = new Set();
    if (Array.isArray(video.tags)) {
      video.tags.forEach((tag) => {
        if (Array.isArray(tag)) {
          if (tag[0] === "t") {
            const normalized = normalizeTagFacetValue(tag[1] || "");
            if (normalized) {
              tagSet.add(normalized);
            }
          }
          return;
        }
        const normalized = normalizeTagFacetValue(tag);
        if (normalized) {
          tagSet.add(normalized);
        }
      });
    }
    tagSet.forEach((tag) => {
      const label = `#${tag}`;
      const entry = tagCounts.get(tag) || { value: tag, label, count: 0 };
      entry.count += 1;
      tagCounts.set(tag, entry);
    });

    const relaySet = new Set();
    if (Array.isArray(video.relays)) {
      video.relays.forEach((relay) => {
        const normalized = normalizeFacetText(relay);
        if (normalized) {
          relaySet.add(normalized);
        }
      });
    }
    if (Array.isArray(video.relayHints)) {
      video.relayHints.forEach((relay) => {
        const normalized = normalizeFacetText(relay);
        if (normalized) {
          relaySet.add(normalized);
        }
      });
    }
    const relayField = normalizeFacetText(video.relay || video.eventRelay || "");
    if (relayField) {
      relaySet.add(relayField);
    }
    relaySet.forEach((relay) => {
      const entry = relayCounts.get(relay) || {
        value: relay,
        label: relay,
        count: 0,
      };
      entry.count += 1;
      relayCounts.set(relay, entry);
    });
  });

  return {
    tags: buildFacetEntries(tagCounts, MAX_FACET_RESULTS.tags),
    authors: buildFacetEntries(authorCounts, MAX_FACET_RESULTS.authors),
    relays: buildFacetEntries(relayCounts, MAX_FACET_RESULTS.relays),
  };
};

function renderProfileCards(profiles, container) {
  if (!container) return;
  container.innerHTML = "";

  // Reset the "Show More" button and container limit state
  const showMoreContainer = document.getElementById("searchChannelShowMore");
  if (showMoreContainer) {
    showMoreContainer.classList.add("hidden");
  }
  container.classList.remove("channel-grid-limit");

  if (!profiles || profiles.length === 0) {
    container.innerHTML = `<p class="text-sm text-muted col-span-full">No matching channels found.</p>`;
    return;
  }

  // If we have more than 5 results (the smallest limit), we might need to show the button
  // depending on screen size, but for simplicity we just enable it if > 5.
  if (profiles.length > 5) {
    container.classList.add("channel-grid-limit");
    if (showMoreContainer) {
      showMoreContainer.classList.remove("hidden");
      const btn = showMoreContainer.querySelector("button");
      if (btn) {
        btn.onclick = () => {
          container.classList.remove("channel-grid-limit");
          showMoreContainer.classList.add("hidden");
        };
      }
    }
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
  const parsedQuery = syncSearchFilterStateFromHash(window.location.hash);
  if (parsedQuery.errors.length > 0) {
    devLogger.warn("[Search] Filter parsing errors", parsedQuery.errors);
  }
  const query = parsedQuery.text || "";

  renderActiveFilters(parsedQuery.filters);

  const titleEl = document.getElementById("searchTitle");
  if (titleEl) {
    titleEl.textContent = query ? `Search Results for "${query}"` : "Search Results";
  }

  const infoTrigger = document.getElementById("searchInfoTrigger");
  if (infoTrigger) {
    attachFeedInfoPopover(
      infoTrigger,
      "Results matching your search query. Use tokens like author:, tag:, kind:, relay:, after:, before:, duration:<, and has:magnet/url."
    );
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
    setSearchFacetCounts(EMPTY_FACET_COUNTS);
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
  performVideoSearch(query, searchToken, parsedQuery.filters).then(videos => {
    if (searchToken !== currentSearchToken) return;
    const app = getApp();
    setSearchFacetCounts(buildSearchFacetCounts(videos));
    renderSearchVideos(videos, videoList, app);
  }).catch(err => {
    devLogger.warn("[Search] Video search failed", err);
    if (videoList && searchToken === currentSearchToken) {
        videoList.innerHTML = `<p class="text-sm text-critical col-span-full">Failed to load videos.</p>`;
    }
    if (searchToken === currentSearchToken) {
      setSearchFacetCounts(EMPTY_FACET_COUNTS);
    }
  });
}

const formatDateLabel = (timestampSeconds) => {
  if (!Number.isFinite(timestampSeconds)) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(timestampSeconds * 1000));
};

const formatDurationLabel = (seconds) => {
  if (!Number.isFinite(seconds)) return "";
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
};

function buildNextFilters() {
  const current = getSearchFilterState();
  const filters = current.filters || {};
  return {
    ...filters,
    dateRange: { ...filters.dateRange },
    duration: { ...filters.duration },
    authorPubkeys: Array.isArray(filters.authorPubkeys)
      ? [...filters.authorPubkeys]
      : [],
    tags: Array.isArray(filters.tags) ? [...filters.tags] : [],
  };
}

function applyFiltersAndRefresh(nextFilters) {
  const current = getSearchFilterState();
  const nextState = {
    text: current.text || "",
    filters: nextFilters,
  };
  setSearchFilterState(nextState);
  setHashView(buildSearchHashFromState(nextState));
}

function renderActiveFilters(filters) {
  const wrapper = document.getElementById("searchActiveFilters");
  const list = document.getElementById("searchActiveFiltersList");
  const clearBtn = document.getElementById("searchActiveFiltersClear");
  if (!wrapper || !list || !clearBtn) {
    return;
  }

  list.innerHTML = "";
  const pills = [];

  filters.authorPubkeys?.forEach((author) => {
    pills.push({
      label: `Author: ${author}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.authorPubkeys = nextFilters.authorPubkeys.filter(
          (value) => value !== author,
        );
        applyFiltersAndRefresh(nextFilters);
      },
    });
  });

  filters.tags?.forEach((tag) => {
    pills.push({
      label: `#${tag}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.tags = nextFilters.tags.filter((value) => value !== tag);
        applyFiltersAndRefresh(nextFilters);
      },
    });
  });

  if (Number.isFinite(filters.kind)) {
    pills.push({
      label: `Kind: ${filters.kind}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.kind = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (filters.relay) {
    pills.push({
      label: `Relay: ${filters.relay}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.relay = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (Number.isFinite(filters.dateRange?.after)) {
    pills.push({
      label: `After: ${formatDateLabel(filters.dateRange.after)}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.dateRange.after = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (Number.isFinite(filters.dateRange?.before)) {
    pills.push({
      label: `Before: ${formatDateLabel(filters.dateRange.before)}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.dateRange.before = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (Number.isFinite(filters.duration?.minSeconds)) {
    pills.push({
      label: `Min duration: ${formatDurationLabel(filters.duration.minSeconds)}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.duration.minSeconds = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (Number.isFinite(filters.duration?.maxSeconds)) {
    pills.push({
      label: `Max duration: ${formatDurationLabel(filters.duration.maxSeconds)}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.duration.maxSeconds = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (filters.hasMagnet === true) {
    pills.push({
      label: "Has magnet",
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.hasMagnet = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (filters.hasUrl === true) {
    pills.push({
      label: "Has URL",
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.hasUrl = null;
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (filters.nsfw && filters.nsfw !== "any") {
    pills.push({
      label: `NSFW: ${filters.nsfw}`,
      onRemove: () => {
        const nextFilters = buildNextFilters();
        nextFilters.nsfw = "any";
        applyFiltersAndRefresh(nextFilters);
      },
    });
  }

  if (!pills.length) {
    wrapper.classList.add("hidden");
    return;
  }

  const fragment = document.createDocumentFragment();
  pills.forEach((pill) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "search-filter-chip inline-flex items-center gap-2 text-xs";
    const label = document.createElement("span");
    label.textContent = pill.label;
    const remove = document.createElement("span");
    remove.setAttribute("aria-hidden", "true");
    remove.textContent = "✕";
    button.append(label, remove);
    button.addEventListener("click", pill.onRemove);
    fragment.appendChild(button);
  });
  list.appendChild(fragment);

  wrapper.classList.remove("hidden");
  clearBtn.onclick = () => {
    resetSearchFilters();
    const nextState = getSearchFilterState();
    setHashView(buildSearchHashFromState(nextState));
  };
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
    if (!query) return [];

    const normalizedQuery = query.toLowerCase();
    const uniqueProfiles = new Map();

    // 1. Local Search (Scan known authors in cache)
    if (nostrClient?.activeMap instanceof Map) {
        const app = getApp();
        if (app && typeof app.getProfileCacheEntry === 'function') {
             const seenPubkeys = new Set();
             for (const video of nostrClient.activeMap.values()) {
                 if (!video || !video.pubkey || seenPubkeys.has(video.pubkey)) continue;

                 seenPubkeys.add(video.pubkey);
                 const entry = app.getProfileCacheEntry(video.pubkey);
                 if (entry?.profile) {
                     const name = entry.profile.name || entry.profile.display_name || "";
                     const about = entry.profile.about || "";
                     const nip05 = entry.profile.nip05 || "";
                     const lightning = entry.profile.lightningAddress || "";

                     if (name.toLowerCase().includes(normalizedQuery) ||
                         about.toLowerCase().includes(normalizedQuery) ||
                         nip05.toLowerCase().includes(normalizedQuery) ||
                         lightning.toLowerCase().includes(normalizedQuery)) {

                         uniqueProfiles.set(video.pubkey, {
                             pubkey: video.pubkey,
                             metadata: entry.profile,
                             created_at: entry.event?.created_at || 0
                         });
                     }
                 } else if (video.authorName && video.authorName.toLowerCase().includes(normalizedQuery)) {
                     // Fallback to video metadata if profile cache missing
                     uniqueProfiles.set(video.pubkey, {
                         pubkey: video.pubkey,
                         metadata: {
                             name: video.authorName,
                             picture: video.authorPicture,
                             nip05: video.authorNip05
                         },
                         created_at: 0
                     });
                 }
             }
        }
    }

    if (currentSearchToken !== token) return [];

    // 2. Relay Search (NIP-50)
    if (nostrClient && nostrClient.pool) {
        const relays = nostrClient.relays || [];
        if (relays.length > 0) {
            const filter = {
                kinds: [0],
                search: query,
                limit: 20
            };

            try {
                const events = await nostrClient.pool.list(relays, [filter]);

                if (currentSearchToken === token) {
                    for (const event of events) {
                        try {
                            const metadata = JSON.parse(event.content);
                            // Merge/Overwrite with newer
                            const existing = uniqueProfiles.get(event.pubkey);
                            if (!existing || existing.created_at < event.created_at) {
                                uniqueProfiles.set(event.pubkey, {
                                    pubkey: event.pubkey,
                                    metadata,
                                    created_at: event.created_at
                                });
                            }
                        } catch (e) {
                            // ignore invalid content
                        }
                    }
                }
            } catch (e) {
                devLogger.warn("Profile relay search error", e);
            }
        }
    }

    if (currentSearchToken !== token) return [];

    // Convert map to array and sort by something relevant (maybe creation time or exact match?)
    return Array.from(uniqueProfiles.values());
}

async function performVideoSearch(query, token, filters = {}) {
    if (!nostrClient) return [];

    const isHashtag = query.startsWith("#");
    const term = isHashtag ? query.slice(1) : query;
    const lowerTerm = term.toLowerCase();
    const app = getApp();
    const nostrService = app?.nostrService;
    const filterOptions = {
        blacklistedEventIds:
            app?.blacklistedEventIds instanceof Set ? new Set(app.blacklistedEventIds) : new Set(),
        isAuthorBlocked:
            typeof app?.isAuthorBlocked === "function" ? (pubkey) => app.isAuthorBlocked(pubkey) : () => false
    };
    const applyAccessFilters = (videos) =>
        nostrService?.filterVideos ? nostrService.filterVideos(videos, filterOptions) : videos;

    const matchesCustomFilters = buildVideoSearchFilterMatcher(filters);

    // 1. Local Search (Cache)
    const localMatches = [];
    if (nostrClient.activeMap instanceof Map) {
        for (const video of nostrClient.activeMap.values()) {
            if (!video || video.deleted) continue;

            let matches = false;
            if (isHashtag) {
                // Check tags for 't'
                if (Array.isArray(video.tags)) {
                    matches = video.tags.some(t => Array.isArray(t) && t[0] === "t" && t[1].toLowerCase() === lowerTerm);
                }
            } else {
                // Check title/description
                const title = video.title ? video.title.toLowerCase() : "";
                const desc = video.description ? video.description.toLowerCase() : "";
                if (title.includes(lowerTerm) || desc.includes(lowerTerm)) {
                    matches = true;
                }
            }

            if (matches) {
                localMatches.push(video);
            }
        }
    }

    if (currentSearchToken !== token) return [];

    const filteredLocalMatches = applyAccessFilters(localMatches).filter(matchesCustomFilters);

    // 2. Relay Search
    let relayVideos = [];
    const relays = nostrClient.relays || [];

    if (relays.length > 0 && nostrClient.pool) {
        const filter = {
            kinds: [30078],
            limit: 50
        };

        if (isHashtag) {
            filter["#t"] = [term];
        } else {
            filter.search = term;
        }

        try {
            const events = await nostrClient.pool.list(relays, [filter]);

            if (currentSearchToken === token) {
                const { convertEventToVideo } = await import("./nostr/index.js");
                relayVideos = events.map(evt => {
                    const vid = convertEventToVideo(evt);
                    if (vid.invalid) return null;
                    const relayHints = extractRelayHints(evt);
                    if (relayHints.length) {
                        return { ...vid, relayHints };
                    }
                    return vid;
                }).filter(Boolean);
            }
        } catch (e) {
            devLogger.warn("Video search error", e);
            // Continue with local matches if relay search fails
        }
    }

    if (currentSearchToken !== token) return [];

    const filteredRelayVideos = applyAccessFilters(relayVideos).filter(matchesCustomFilters);

    // Deduplicate by ID
    const unique = new Map();

    // Add local matches first
    for (const v of filteredLocalMatches) {
        if (!unique.has(v.id)) unique.set(v.id, v);
    }

    // Add relay matches (overwriting local if needed, or ignoring duplicates)
    for (const v of filteredRelayVideos) {
        if (!unique.has(v.id)) unique.set(v.id, v);
    }

    // Sort by creation date (newest first)
    return Array.from(unique.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
}
