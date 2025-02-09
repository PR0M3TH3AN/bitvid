// js/channelProfile.js

import { nostrClient } from "./nostr.js";
import { app } from "./app.js";
import { initialBlacklist, initialWhitelist } from "./lists.js";
import { isWhitelistEnabled } from "./config.js";

/**
 * Initialize the channel profile view.
 * Called when #view=channel-profile is active.
 */
export async function initChannelProfileView() {
  // 1) Get npub from hash (e.g. #view=channel-profile&npub=...)
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const npub = hashParams.get("npub");
  if (!npub) {
    console.error("No npub found in hash. Example: #view=channel-profile&npub=npub1...");
    return;
  }

  // 2) Decode npub => hex pubkey
  let hexPub;
  try {
    const decoded = window.NostrTools.nip19.decode(npub);
    if (decoded.type === "npub" && decoded.data) {
      hexPub = decoded.data;
    } else {
      throw new Error("Invalid npub decoding result.");
    }
  } catch (err) {
    console.error("Error decoding npub:", err);
    return;
  }

  // 3) Load user’s profile (banner, avatar, etc.)
  await loadUserProfile(hexPub);

  // 4) Load user’s videos (filtered and rendered like home feed)
  await loadUserVideos(hexPub);
}

/**
 * Fetches and displays the user’s metadata (kind:0).
 */
async function loadUserProfile(pubkey) {
  try {
    const events = await nostrClient.pool.list(nostrClient.relays, [
      { kinds: [0], authors: [pubkey], limit: 1 },
    ]);

    if (events.length && events[0].content) {
      const meta = JSON.parse(events[0].content);

      // Banner
      const bannerEl = document.getElementById("channelBanner");
      if (bannerEl) {
        bannerEl.src = meta.banner || "assets/jpg/default-banner.jpg";
      }

      // Avatar
      const avatarEl = document.getElementById("channelAvatar");
      if (avatarEl) {
        avatarEl.src = meta.picture || "assets/svg/default-profile.svg";
      }

      // Channel Name
      const nameEl = document.getElementById("channelName");
      if (nameEl) {
        nameEl.textContent = meta.display_name || meta.name || "Unknown User";
      }

      // Channel npub
      const channelNpubEl = document.getElementById("channelNpub");
      if (channelNpubEl) {
        const userNpub = window.NostrTools.nip19.npubEncode(pubkey);
        channelNpubEl.textContent = userNpub;
      }

      // About/Description
      const aboutEl = document.getElementById("channelAbout");
      if (aboutEl) {
        aboutEl.textContent = meta.about || "";
      }

      // Website
      const websiteEl = document.getElementById("channelWebsite");
      if (websiteEl) {
        if (meta.website) {
          websiteEl.href = meta.website;
          websiteEl.textContent = meta.website;
        } else {
          websiteEl.textContent = "";
          websiteEl.removeAttribute("href");
        }
      }

      // Lightning Address
      const lnEl = document.getElementById("channelLightning");
      if (lnEl) {
        lnEl.textContent = meta.lud16 || meta.lud06 || "No lightning address found.";
      }
    } else {
      console.warn("No metadata found for this user.");
    }
  } catch (err) {
    console.error("Failed to fetch user profile data:", err);
  }
}

/**
 * Fetches and displays this user's videos (kind=30078),
 * filtering out older/overshadowed events and blacklisted/non‐whitelisted entries.
 * Renders the video cards using the same `.ratio-16-9` approach as the home view.
 */
async function loadUserVideos(pubkey) {
  try {
    // 1) Build filter for videos from this pubkey
    const filter = {
      kinds: [30078],
      authors: [pubkey],
      "#t": ["video"],
      limit: 200,
    };

    // 2) Collect raw events from all relays
    const events = [];
    for (const url of nostrClient.relays) {
      try {
        const result = await nostrClient.pool.list([url], [filter]);
        events.push(...result);
      } catch (relayErr) {
        console.error(`Relay error (${url}):`, relayErr);
      }
    }

    // 3) Convert events to "video" objects
    let videos = [];
    for (const evt of events) {
      const vid = localConvertEventToVideo(evt);
      if (!vid.invalid && !vid.deleted) {
        videos.push(vid);
      }
    }

    // 4) Deduplicate older overshadowed versions (newest only)
    videos = dedupeToNewestByRoot(videos);

    // 5) Filter out blacklisted event IDs and authors
    videos = videos.filter((video) => {
      // Event-level blacklisting
      if (app.blacklistedEventIds.has(video.id)) {
        return false;
      }
      // Author-level checks
      const authorNpub = app.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (initialBlacklist.includes(authorNpub)) {
        return false;
      }
      if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
        return false;
      }
      return true;
    });

    // 6) Sort videos by newest first
    videos.sort((a, b) => b.created_at - a.created_at);

    // 7) Render the videos in #channelVideoList
    const container = document.getElementById("channelVideoList");
    if (!container) {
      console.warn("channelVideoList element not found in DOM.");
      return;
    }
    container.innerHTML = "";
    if (!videos.length) {
      container.innerHTML = `<p class="text-gray-500">No videos to display.</p>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    // We'll store them in a local array so gear handlers match the indexes
    const channelVideos = videos;

    channelVideos.forEach((video, index) => {
      // If private + the user is the owner => decrypt
      if (
        video.isPrivate &&
        video.pubkey === nostrClient.pubkey &&
        !video.alreadyDecrypted
      ) {
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      // Determine if the logged-in user can edit
      const canEdit = video.pubkey === app.pubkey;
      let gearMenu = "";
      if (canEdit) {
        gearMenu = `
          <div class="relative inline-block ml-3 overflow-visible">
            <button
              type="button"
              class="inline-flex items-center p-2 rounded-full text-gray-400 
              hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 
              focus:ring-blue-500"
              data-settings-dropdown="${index}"
            >
              <img
                src="assets/svg/video-settings-gear.svg"
                alt="Settings"
                class="w-5 h-5"
              />
            </button>
            <div
              id="settingsDropdown-${index}"
              class="hidden absolute right-0 bottom-full mb-2 w-32 
              rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
            >
              <div class="py-1">
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-gray-100 
                  hover:bg-gray-700"
                  data-edit-index="${index}"
                >
                  Edit
                </button>
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-red-400 
                  hover:bg-red-700 hover:text-white"
                  data-delete-all-index="${index}"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        `;
      }

      // Reuse the `.ratio-16-9` approach from home feed
      const fallbackThumb = "assets/jpg/video-thumbnail-fallback.jpg";
      const safeThumb = video.thumbnail || fallbackThumb;

      // Build the card
      const cardEl = document.createElement("div");
      cardEl.classList.add(
        "bg-gray-900",
        "rounded-lg",
        "overflow-hidden",
        "shadow-lg",
        "hover:shadow-2xl",
        "transition-all",
        "duration-300"
      );

      // The "ratio-16-9" container ensures 16:9 cropping
      cardEl.innerHTML = `
        <div class="cursor-pointer relative group">
          <div class="ratio-16-9">
            <img
              src="${fallbackThumb}"
              data-lazy="${escapeHTML(safeThumb)}"
              alt="${escapeHTML(video.title)}"
            />
          </div>
        </div>
        <div class="p-4 flex items-center justify-between">
          <div>
            <h3 
              class="text-lg font-bold text-white mb-2 line-clamp-2"
              data-play-magnet="${encodeURIComponent(video.magnet)}"
            >
              ${escapeHTML(video.title)}
            </h3>
            <p class="text-sm text-gray-500">
              ${new Date(video.created_at * 1000).toLocaleString()}
            </p>
          </div>
          ${gearMenu}
        </div>
      `;

      // Clicking the card (except gear) => open video
      cardEl.addEventListener("click", () => {
        app.playVideoByEventId(video.id);
      });

      fragment.appendChild(cardEl);
    });

    container.appendChild(fragment);

    // Use app's lazy loader for thumbs
    const lazyEls = container.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => app.mediaLoader.observe(el));

    // Gear menus
    const gearButtons = container.querySelectorAll("[data-settings-dropdown]");
    gearButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = btn.getAttribute("data-settings-dropdown");
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) {
          dropdown.classList.toggle("hidden");
        }
      });
    });

    // "Edit" button
    const editBtns = container.querySelectorAll("[data-edit-index]");
    editBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-edit-index"), 10);
        app.handleEditVideo(idx);
      });
    });

    // "Delete All" button
    const deleteAllBtns = container.querySelectorAll("[data-delete-all-index]");
    deleteAllBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-delete-all-index"), 10);
        app.handleFullDeleteVideo(idx);
      });
    });
  } catch (err) {
    console.error("Error loading user videos:", err);
  }
}

/**
 * Minimal placeholder decryption for private videos.
 */
function fakeDecrypt(str) {
  return str.split("").reverse().join("");
}

/**
 * Deduplicate older overshadowed versions – return only the newest for each root.
 */
function dedupeToNewestByRoot(videos) {
  const map = new Map();
  for (const vid of videos) {
    const rootId = vid.videoRootId || vid.id;
    const existing = map.get(rootId);
    if (!existing || vid.created_at > existing.created_at) {
      map.set(rootId, vid);
    }
  }
  return Array.from(map.values());
}

/**
 * Convert a raw Nostr event => "video" object.
 */
function localConvertEventToVideo(event) {
  try {
    const content = JSON.parse(event.content || "{}");
    const isSupportedVersion = content.version >= 2;
    const hasRequiredFields = !!(content.title && content.magnet);

    if (!isSupportedVersion) {
      return { id: event.id, invalid: true, reason: "version <2" };
    }
    if (!hasRequiredFields) {
      return { id: event.id, invalid: true, reason: "missing title/magnet" };
    }

    return {
      id: event.id,
      videoRootId: content.videoRootId || event.id,
      version: content.version,
      isPrivate: content.isPrivate ?? false,
      title: content.title ?? "",
      magnet: content.magnet ?? "",
      thumbnail: content.thumbnail ?? "",
      description: content.description ?? "",
      mode: content.mode ?? "live",
      deleted: content.deleted === true,
      pubkey: event.pubkey,
      created_at: event.created_at,
      tags: event.tags,
      invalid: false,
    };
  } catch (err) {
    return { id: event.id, invalid: true, reason: "json parse error" };
  }
}

/**
 * Escape HTML to prevent injection or XSS.
 */
function escapeHTML(unsafe = "") {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
