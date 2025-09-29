// js/channelProfile.js

import {
  nostrClient,
  convertEventToVideo as sharedConvertEventToVideo,
} from "./nostr.js";
import { app } from "./app.js";
import { subscriptions } from "./subscriptions.js"; // <-- NEW import
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";
import { accessControl } from "./accessControl.js";

let currentChannelHex = null;
let currentChannelNpub = null;

let cachedZapButton = null;

function getChannelZapButton() {
  if (cachedZapButton && !document.body.contains(cachedZapButton)) {
    cachedZapButton = null;
  }
  if (!cachedZapButton) {
    cachedZapButton = document.getElementById("zapButton");
  }
  return cachedZapButton;
}

function setChannelZapVisibility(visible) {
  const zapButton = getChannelZapButton();
  if (!zapButton) {
    return;
  }
  const shouldShow = !!visible;
  zapButton.classList.toggle("hidden", !shouldShow);
  zapButton.disabled = !shouldShow;
  zapButton.setAttribute("aria-disabled", (!shouldShow).toString());
  zapButton.setAttribute("aria-hidden", (!shouldShow).toString());
  if (shouldShow) {
    zapButton.removeAttribute("tabindex");
  } else {
    zapButton.setAttribute("tabindex", "-1");
  }
}

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

  currentChannelHex = null;
  currentChannelNpub = null;

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

  currentChannelHex = hexPub;
  currentChannelNpub = npub;

  // 3) If user is logged in, load subscriptions and show sub/unsub button
  if (app.pubkey) {
    await subscriptions.loadSubscriptions(app.pubkey);
    renderSubscribeButton(hexPub);
  } else {
    const btn = document.getElementById("subscribeBtnArea");
    if (btn) btn.classList.add("hidden");
  }

  setupZapButton();

  // 4) Load user’s profile (banner, avatar, etc.)
  await loadUserProfile(hexPub);

  // 5) Load user’s videos (filtered + rendered like the home feed)
  await loadUserVideos(hexPub);
}

function setupZapButton() {
  const zapButton = getChannelZapButton();
  if (!zapButton) {
    return;
  }

  setChannelZapVisibility(false);

  if (zapButton.dataset.initialized === "true") {
    return;
  }

  zapButton.addEventListener("click", () => {
    window.alert("Zaps coming soon.");
  });
  zapButton.dataset.initialized = "true";
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
      const lightningAddress = (meta.lud16 || meta.lud06 || "").trim();
      if (lnEl) {
        lnEl.textContent =
          lightningAddress || "No lightning address found.";
      }
      setChannelZapVisibility(!!lightningAddress);
    } else {
      console.warn("No metadata found for this user.");
      setChannelZapVisibility(false);
      const lnEl = document.getElementById("channelLightning");
      if (lnEl) {
        lnEl.textContent = "No lightning address found.";
      }
    }
  } catch (err) {
    console.error("Failed to fetch user profile data:", err);
    setChannelZapVisibility(false);
    const lnEl = document.getElementById("channelLightning");
    if (lnEl) {
      lnEl.textContent = "No lightning address found.";
    }
  }
}

/**
 * Fetches and displays this user's videos (kind=30078).
 * Filters out older overshadowed notes, blacklisted, etc.
 */
async function loadUserVideos(pubkey) {
  try {
    try {
      await accessControl.ensureReady();
    } catch (error) {
      console.warn("Failed to ensure admin lists were loaded before channel fetch:", error);
    }

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

    // 3) Convert to "video" objects and keep everything (including tombstones)
    const convertedVideos = events
      .map((evt) => sharedConvertEventToVideo(evt))
      .filter((vid) => !vid.invalid);

    // 4) Deduplicate older overshadowed versions => newest only
    const newestByRoot =
      app?.dedupeVideosByRoot?.(convertedVideos) ??
      dedupeToNewestByRoot(convertedVideos);

    // 5) Filter out tombstones, blacklisted IDs / authors
    let videos = newestByRoot.filter((video) => !video.deleted);
    videos = videos.filter((video) => {
      // Event-level blacklisting
      if (app.blacklistedEventIds.has(video.id)) return false;

      // Author-level
      if (!accessControl.canAccess(video)) return false;
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
            data-revert-event-id="${video.id}"
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
                  data-edit-event-id="${video.id}"
                >
                  Edit
                </button>
                ${revertButton}
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-red-400
                  hover:bg-red-700 hover:text-white"
                  data-delete-all-index="${index}"
                  data-delete-all-event-id="${video.id}"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        `;
      }

      const moreMenu = `
        <div class="relative inline-block ml-1 overflow-visible" data-more-menu-wrapper="true">
          <button
            type="button"
            class="inline-flex items-center justify-center w-10 h-10 p-2 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-more-dropdown="${index}"
            aria-haspopup="true"
            aria-expanded="false"
            aria-label="More options"
          >
            <img src="assets/svg/ellipsis.svg" alt="More" class="w-5 h-5 object-contain" />
          </button>
          <div
            id="moreDropdown-${index}"
            class="hidden absolute right-0 bottom-full mb-2 w-40 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
            role="menu"
            data-more-menu="true"
          >
            <div class="py-1">
              <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700" data-action="open-channel" data-author="${video.pubkey || ""}">
                Open channel
              </button>
              <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700" data-action="copy-link" data-event-id="${video.id || ""}">
                Copy link
              </button>
              <button class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white" data-action="block-author" data-author="${video.pubkey || ""}">
                Block creator
              </button>
              <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700" data-action="report" data-event-id="${video.id || ""}">
                Report
              </button>
            </div>
          </div>
        </div>
      `;

      const cardControls = `
        <div class="flex items-center">
          ${moreMenu}${gearMenu}
        </div>
      `;

      // Fallback thumbnail
      const fallbackThumb = "assets/jpg/video-thumbnail-fallback.jpg";
      const safeThumb = video.thumbnail || fallbackThumb;
      const safeTitle = escapeHTML(video.title);

      const cardEl = document.createElement("div");
      cardEl.classList.add(
        "video-card",
        "bg-gray-900",
        "rounded-lg",
        "overflow-hidden",
        "shadow-lg",
        "hover:shadow-2xl",
        "transition-all",
        "duration-300"
      );

      cardEl.dataset.ownerIsViewer = canEdit ? "true" : "false";
      if (typeof video.pubkey === "string" && video.pubkey) {
        cardEl.dataset.ownerPubkey = video.pubkey;
      } else if (cardEl.dataset.ownerPubkey) {
        delete cardEl.dataset.ownerPubkey;
      }

      const rawMagnet =
        typeof video.magnet === "string" ? video.magnet : "";
      const trimmedMagnet = rawMagnet ? rawMagnet.trim() : "";
      const legacyInfoHash =
        typeof video.infoHash === "string" ? video.infoHash.trim() : "";
      const playbackUrl =
        typeof video.url === "string" ? video.url : "";
      const trimmedUrl = playbackUrl ? playbackUrl.trim() : "";
      const playbackMagnet = trimmedMagnet || legacyInfoHash || "";
      const magnetProvided = playbackMagnet.length > 0;
      const magnetSupported = app.isMagnetUriSupported(playbackMagnet);
      const showUnsupportedTorrentBadge =
        !trimmedUrl && magnetProvided && !magnetSupported;
      const urlBadgeHtml = trimmedUrl
        ? app.getUrlHealthPlaceholderMarkup({ includeMargin: false })
        : "";
      const torrentHealthBadgeHtml =
        magnetSupported && magnetProvided
          ? app.getTorrentHealthBadgeMarkup({ includeMargin: false })
          : "";
      const connectionBadgesHtml =
        urlBadgeHtml || torrentHealthBadgeHtml
          ? `
            <div class="mt-3 flex flex-wrap items-center gap-2">
              ${urlBadgeHtml}${torrentHealthBadgeHtml}
            </div>
          `
          : "";

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
        <div class="p-4">
          <div class="flex items-center justify-between">
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
            ${cardControls}
          </div>
          ${connectionBadgesHtml}
        </div>
      `;

      if (showUnsupportedTorrentBadge) {
        cardEl.dataset.torrentSupported = "false";
      } else if (magnetProvided && magnetSupported) {
        cardEl.dataset.torrentSupported = "true";
      } else if (cardEl.dataset.torrentSupported) {
        delete cardEl.dataset.torrentSupported;
      }

      if (trimmedUrl) {
        cardEl.dataset.urlHealthState = "checking";
        if (cardEl.dataset.urlHealthReason) {
          delete cardEl.dataset.urlHealthReason;
        }
        cardEl.dataset.urlHealthEventId = video.id || "";
        cardEl.dataset.urlHealthUrl = encodeURIComponent(trimmedUrl);
      } else {
        cardEl.dataset.urlHealthState = "offline";
        cardEl.dataset.urlHealthReason = "missing-source";
        if (cardEl.dataset.urlHealthEventId) {
          delete cardEl.dataset.urlHealthEventId;
        }
        if (cardEl.dataset.urlHealthUrl) {
          delete cardEl.dataset.urlHealthUrl;
        }
      }
      if (magnetProvided && magnetSupported) {
        cardEl.dataset.streamHealthState = "checking";
        if (cardEl.dataset.streamHealthReason) {
          delete cardEl.dataset.streamHealthReason;
        }
      } else {
        cardEl.dataset.streamHealthState = "unhealthy";
        cardEl.dataset.streamHealthReason = magnetProvided
          ? "unsupported"
          : "missing-source";
      }

      if (magnetProvided) {
        cardEl.dataset.magnet = playbackMagnet;
      } else if (cardEl.dataset.magnet) {
        delete cardEl.dataset.magnet;
      }

      // Leave the data-play-* attributes empty in the template markup so the raw
      // URL/magnet strings can be assigned after parsing without HTML entity
      // escaping, keeping this renderer consistent with app.js. The stored URL is
      // encoded so it stays intact within data-* attributes, and the click
      // handler decodes it while leaving magnets untouched until
      // safeDecodeMagnet() runs.
      const interactiveEls = cardEl.querySelectorAll("[data-video-id]");
      interactiveEls.forEach((el) => {
        if (!el.dataset) return;

        if (trimmedUrl) {
          el.dataset.playUrl = encodeURIComponent(trimmedUrl);
        } else {
          delete el.dataset.playUrl;
        }

        el.dataset.playMagnet = playbackMagnet || "";
        if (magnetProvided) {
          el.dataset.torrentSupported = magnetSupported ? "true" : "false";
        } else if (el.dataset.torrentSupported) {
          delete el.dataset.torrentSupported;
        }
      });

      const badgeEl = cardEl.querySelector("[data-url-health-state]");
      if (badgeEl) {
        if (trimmedUrl) {
          badgeEl.dataset.urlHealthEventId = video.id || "";
          badgeEl.dataset.urlHealthUrl = encodeURIComponent(trimmedUrl);
        } else {
          if (badgeEl.dataset.urlHealthEventId) {
            delete badgeEl.dataset.urlHealthEventId;
          }
          if (badgeEl.dataset.urlHealthUrl) {
            delete badgeEl.dataset.urlHealthUrl;
          }
        }
      }

      fragment.appendChild(cardEl);
    });

    container.appendChild(fragment);

    attachHealthBadges(container);
    attachUrlHealthBadges(container, ({ badgeEl, url, eventId }) => {
      const video = app.videosMap.get(eventId) || { id: eventId };
      app.handleUrlHealthBadge({ video, url, badgeEl });
    });

    window.app.videoList = container;
    window.app.attachVideoListHandler();

    // Lazy-load images
    const lazyEls = container.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => app.mediaLoader.observe(el));

    app.attachMoreMenuHandlers(container);

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
        const idxAttr = btn.getAttribute("data-edit-index");
        const idx = Number.parseInt(idxAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        const eventId = btn.getAttribute("data-edit-event-id") || "";
        app.handleEditVideo({
          eventId,
          index: Number.isNaN(idx) ? null : idx,
        });
      });
    });

    // Revert handler
    const revertBtns = container.querySelectorAll("[data-revert-index]");
    revertBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idxAttr = btn.getAttribute("data-revert-index");
        const idx = Number.parseInt(idxAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        const eventId = btn.getAttribute("data-revert-event-id") || "";
        app.handleRevertVideo({
          eventId,
          index: Number.isNaN(idx) ? null : idx,
        });
      });
    });

    // Delete All handler
    const deleteAllBtns = container.querySelectorAll("[data-delete-all-index]");
    deleteAllBtns.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idxAttr = btn.getAttribute("data-delete-all-index");
        const idx = Number.parseInt(idxAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        const eventId = btn.getAttribute("data-delete-all-event-id") || "";
        app.handleFullDeleteVideo({
          eventId,
          index: Number.isNaN(idx) ? null : idx,
        });
      });
    });
  } catch (err) {
    console.error("Error loading user videos:", err);
  }
}

window.addEventListener("bitvid:access-control-updated", () => {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get("view") !== "channel-profile") {
    return;
  }

  if (!currentChannelHex) {
    return;
  }

  const activeNpub = hashParams.get("npub");
  if (currentChannelNpub && activeNpub && activeNpub !== currentChannelNpub) {
    return;
  }

  loadUserVideos(currentChannelHex).catch((error) => {
    console.error("Failed to refresh channel videos after admin update:", error);
  });
});

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
