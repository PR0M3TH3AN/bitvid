// js/channelProfile.js

import { nostrClient } from "./nostr.js";
import { app } from "./app.js";
import { subscriptions } from "./subscriptions.js"; // <-- NEW import
import { initialBlacklist, initialWhitelist } from "./lists.js";
import { isWhitelistEnabled } from "./config.js";
import {
  deriveTitleFromEvent,
  parseVideoEventPayload,
  findLegacyMagnetInEvent,
} from "./videoEventUtils.js";

/**
 * Initialize the channel profile view.
 * Called when #view=channel-profile&npub=...
 */
export async function initChannelProfileView() {
  // 1) Get npub from hash
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const npub = hashParams.get("npub");
  if (!npub) {
    console.error(
      "No npub found in hash (e.g. #view=channel-profile&npub=...)"
    );
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

  // 3) If user is logged in, load subscriptions and show sub/unsub button
  if (app.pubkey) {
    await subscriptions.loadSubscriptions(app.pubkey);
    renderSubscribeButton(hexPub);
  } else {
    const btn = document.getElementById("subscribeBtnArea");
    if (btn) btn.classList.add("hidden");
  }

  // 4) Load user’s profile (banner, avatar, etc.)
  await loadUserProfile(hexPub);

  // 5) Load user’s videos (filtered + rendered like the home feed)
  await loadUserVideos(hexPub);
}

/**
 * Renders a Subscribe / Unsubscribe button with an icon,
 * using color #fe0032 and the subscribe-button-icon.svg on the left.
 */
function renderSubscribeButton(channelHex) {
  const container = document.getElementById("subscribeBtnArea");
  if (!container) return;

  container.classList.remove("hidden");
  const alreadySubscribed = subscriptions.isSubscribed(channelHex);

  // We'll use #fe0032 for both subscribe/unsubscribe,
  // and the same icon. If you prefer separate logic for unsub, you can do it here.
  container.innerHTML = `
    <button
      id="subscribeToggleBtn"
      class="flex items-center gap-2 px-4 py-2 rounded text-white
             hover:opacity-90 focus:outline-none"
      style="background-color: #fe0032;"
    >
      <img
        src="assets/svg/subscribe-button-icon.svg"
        alt="Subscribe Icon"
        class="w-5 h-5"
      />
      <span>${alreadySubscribed ? "Unsubscribe" : "Subscribe"}</span>
    </button>
  `;

  const toggleBtn = document.getElementById("subscribeToggleBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", async () => {
      if (!app.pubkey) {
        console.error("Not logged in => cannot subscribe/unsubscribe.");
        return;
      }
      try {
        if (alreadySubscribed) {
          await subscriptions.removeChannel(channelHex, app.pubkey);
        } else {
          await subscriptions.addChannel(channelHex, app.pubkey);
        }
        // Re-render the button so it toggles state
        renderSubscribeButton(channelHex);
      } catch (err) {
        console.error("Failed to update subscription:", err);
      }
    });
  }
}

/**
 * Fetches and displays the user's metadata (kind=0).
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
        lnEl.textContent =
          meta.lud16 || meta.lud06 || "No lightning address found.";
      }
    } else {
      console.warn("No metadata found for this user.");
    }
  } catch (err) {
    console.error("Failed to fetch user profile data:", err);
  }
}

/**
 * Fetches and displays this user's videos (kind=30078).
 * Filters out older overshadowed notes, blacklisted, etc.
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

    // 3) Convert to "video" objects
    let videos = [];
    for (const evt of events) {
      const vid = localConvertEventToVideo(evt);
      if (!vid.invalid && !vid.deleted) {
        videos.push(vid);
      }
    }

    // 4) Deduplicate older overshadowed versions => newest only
    videos = dedupeToNewestByRoot(videos);

    // 5) Filter out blacklisted IDs / authors
    videos = videos.filter((video) => {
      // Event-level blacklisting
      if (app.blacklistedEventIds.has(video.id)) return false;

      // Author-level
      const authorNpub = app.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (initialBlacklist.includes(authorNpub)) return false;
      if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
        return false;
      }
      return true;
    });

    // 6) Sort newest first
    videos.sort((a, b) => b.created_at - a.created_at);

    // 7) Render them
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
    const allKnownEventsArray = Array.from(nostrClient.allEvents.values());

    videos.forEach((video, index) => {
      // Decrypt if user owns a private video
      if (
        video.isPrivate &&
        video.pubkey === nostrClient.pubkey &&
        !video.alreadyDecrypted
      ) {
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      // Ensure the global videos map is kept up to date so delegated handlers
      // have the freshest metadata for this event.
      window.app?.videosMap?.set(video.id, video);

      // Check if user can edit
      const canEdit = video.pubkey === app.pubkey;
      let hasOlder = false;
      if (canEdit && video.videoRootId) {
        hasOlder = app.hasOlderVersion(video, allKnownEventsArray);
      }

      const revertButton = hasOlder
        ? `
          <button
            class="block w-full text-left px-4 py-2 text-sm text-red-400
            hover:bg-red-700 hover:text-white"
            data-revert-index="${index}"
          >
            Revert
          </button>
        `
        : "";

      let gearMenu = "";
      if (canEdit) {
        gearMenu = `
          <div class="relative inline-block ml-3 overflow-visible">
            <button
              type="button"
              class="inline-flex items-center justify-center
                    w-10 h-10 p-2
                    rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-settings-dropdown="${index}"
            >
              <img
                src="assets/svg/video-settings-gear.svg"
                alt="Settings"
                class="w-5 h-5 object-contain"
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
                ${revertButton}
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

      // Fallback thumbnail
      const fallbackThumb = "assets/jpg/video-thumbnail-fallback.jpg";
      const safeThumb = video.thumbnail || fallbackThumb;
      const safeTitle = escapeHTML(video.title);

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

      const trimmedMagnet =
        typeof video.magnet === "string" ? video.magnet.trim() : "";
      const legacyInfoHash =
        typeof video.infoHash === "string" ? video.infoHash.trim() : "";
      const magnetCandidate = trimmedMagnet || legacyInfoHash;
      const playbackUrl =
        typeof video.url === "string" ? video.url : "";
      const playbackMagnet = magnetCandidate || "";

      cardEl.innerHTML = `
        <div
          class="cursor-pointer relative group"
          data-video-id="${video.id}"
          data-play-url=""
          data-play-magnet=""
        >
          <div class="ratio-16-9">
            <img
              src="${fallbackThumb}"
              data-lazy="${escapeHTML(safeThumb)}"
              alt="${safeTitle}"
            />
          </div>
        </div>
        <div class="p-4 flex items-center justify-between">
          <div>
            <h3
              class="text-lg font-bold text-white mb-2 line-clamp-2"
              data-video-id="${video.id}"
              data-play-url=""
              data-play-magnet=""
            >
              ${safeTitle}
            </h3>
            <p class="text-sm text-gray-500">
              ${new Date(video.created_at * 1000).toLocaleString()}
            </p>
          </div>
          ${gearMenu}
        </div>
      `;

      const interactiveEls = cardEl.querySelectorAll("[data-video-id]");
      interactiveEls.forEach((el) => {
        if (!el.dataset) return;
        el.dataset.playUrl = playbackUrl || "";
        el.dataset.playMagnet = playbackMagnet || "";
      });

      fragment.appendChild(cardEl);
    });

    container.appendChild(fragment);

    window.app.videoList = container;
    window.app.attachVideoListHandler();

    // Lazy-load images
    const lazyEls = container.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => app.mediaLoader.observe(el));

    // Gear menu toggles
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

    // Edit handler
    const editBtns = container.querySelectorAll("[data-edit-index]");
    editBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-edit-index"), 10);
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) dropdown.classList.add("hidden");
        app.handleEditVideo(idx);
      });
    });

    // Revert handler
    const revertBtns = container.querySelectorAll("[data-revert-index]");
    revertBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-revert-index"), 10);
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) dropdown.classList.add("hidden");
        app.handleRevertVideo(idx);
      });
    });

    // Delete All handler
    const deleteAllBtns = container.querySelectorAll("[data-delete-all-index]");
    deleteAllBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = parseInt(btn.getAttribute("data-delete-all-index"), 10);
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) dropdown.classList.add("hidden");
        app.handleFullDeleteVideo(idx);
      });
    });
  } catch (err) {
    console.error("Error loading user videos:", err);
  }
}

/**
 * Minimal placeholder for private video decryption.
 */
function fakeDecrypt(str) {
  return str.split("").reverse().join("");
}

/**
 * Keep only the newest version of each video root.
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
 * Convert raw event => "video" object.
 */
function localConvertEventToVideo(event) {
  const {
    parsedContent,
    parseError,
    title,
    url,
    magnet,
    infoHash,
    version,
  } = parseVideoEventPayload(event);

  const trimmedUrl = typeof url === "string" ? url.trim() : "";
  const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
  const legacyMagnet = findLegacyMagnetInEvent(event);
  const trimmedLegacyMagnet =
    typeof legacyMagnet === "string" ? legacyMagnet.trim() : "";
  const trimmedInfoHash = typeof infoHash === "string" ? infoHash.trim() : "";
  const playbackMagnet =
    trimmedMagnet || trimmedLegacyMagnet || trimmedInfoHash;
  const parsedVersion =
    typeof version === "number"
      ? version
      : typeof version === "string"
        ? Number.parseInt(version, 10)
        : Number.NaN;
  const numericVersion = Number.isFinite(parsedVersion)
    ? parsedVersion
    : 0;

  const hasPlayableSource = Boolean(trimmedUrl) || Boolean(playbackMagnet);
  if (!hasPlayableSource) {
    return { id: event.id, invalid: true, reason: "missing playable source" };
  }

  const derivedTitle = deriveTitleFromEvent({
    parsedContent,
    tags: event.tags,
    primaryTitle: title,
  });

  let resolvedTitle = derivedTitle;
  if (!resolvedTitle && numericVersion < 2 && playbackMagnet) {
    resolvedTitle = trimmedInfoHash
      ? `Legacy Video ${trimmedInfoHash.slice(0, 8)}`
      : "Legacy BitTorrent Video";
  }

  if (!resolvedTitle) {
    const reason = parseError
      ? "missing title (json parse error)"
      : "missing title";
    return { id: event.id, invalid: true, reason };
  }

  return {
    id: event.id,
    videoRootId: parsedContent.videoRootId || event.id,
    version: numericVersion,
    isPrivate: parsedContent.isPrivate ?? false,
    title: resolvedTitle,
    url: trimmedUrl,
    magnet: playbackMagnet,
    rawMagnet: trimmedMagnet || trimmedLegacyMagnet,
    infoHash: trimmedInfoHash,
    thumbnail: parsedContent.thumbnail ?? "",
    description: parsedContent.description ?? "",
    mode: parsedContent.mode ?? "live",
    deleted: parsedContent.deleted === true,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags: event.tags,
    invalid: false,
  };
}

/**
 * Basic escaping to avoid XSS.
 */
function escapeHTML(unsafe = "") {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
