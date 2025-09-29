// js/subscriptions.js
import {
  nostrClient,
  convertEventToVideo as sharedConvertEventToVideo,
} from "./nostr.js";
import { attachHealthBadges } from "./gridHealth.js";
import { attachUrlHealthBadges } from "./urlHealthObserver.js";

function getAbsoluteShareUrl(nevent) {
  if (!nevent) {
    return "";
  }

  if (window.app?.buildShareUrlFromNevent) {
    const candidate = window.app.buildShareUrlFromNevent(nevent);
    if (candidate) {
      return candidate;
    }
  }

  const origin = window.location?.origin || "";
  const pathname = window.location?.pathname || "";
  let base = origin || pathname ? `${origin}${pathname}` : "";
  if (!base) {
    const href = window.location?.href || "";
    base = href ? href.split(/[?#]/)[0] : "";
  }

  if (!base) {
    return `?v=${encodeURIComponent(nevent)}`;
  }

  return `${base}?v=${encodeURIComponent(nevent)}`;
}

/**
 * Manages the user's subscription list (kind=30002) *privately*,
 * using NIP-04 encryption for the content field.
 * Also handles fetching and rendering subscribed channels' videos
 * in the same card style as your home page.
 */
class SubscriptionsManager {
  constructor() {
    this.subscribedPubkeys = new Set();
    this.subsEventId = null;
    this.loaded = false;
  }

  /**
   * Decrypt the subscription list from kind=30002 (d="subscriptions").
   */
  async loadSubscriptions(userPubkey) {
    if (!userPubkey) {
      console.warn("[SubscriptionsManager] No pubkey => cannot load subs.");
      return;
    }
    try {
      const filter = {
        kinds: [30002],
        authors: [userPubkey],
        "#d": ["subscriptions"],
        limit: 1,
      };

      const events = [];
      for (const url of nostrClient.relays) {
        try {
          const result = await nostrClient.pool.list([url], [filter]);
          if (result && result.length) {
            events.push(...result);
          }
        } catch (err) {
          console.error(`[SubscriptionsManager] Relay error at ${url}`, err);
        }
      }

      if (!events.length) {
        this.subscribedPubkeys.clear();
        this.subsEventId = null;
        this.loaded = true;
        return;
      }

      // Sort by created_at desc, pick newest
      events.sort((a, b) => b.created_at - a.created_at);
      const newest = events[0];
      this.subsEventId = newest.id;

      let decryptedStr = "";
      try {
        decryptedStr = await window.nostr.nip04.decrypt(
          userPubkey,
          newest.content
        );
      } catch (errDecrypt) {
        console.error("[SubscriptionsManager] Decryption failed:", errDecrypt);
        this.subscribedPubkeys.clear();
        this.subsEventId = null;
        this.loaded = true;
        return;
      }

      const parsed = JSON.parse(decryptedStr);
      const subArray = Array.isArray(parsed.subPubkeys)
        ? parsed.subPubkeys
        : [];
      this.subscribedPubkeys = new Set(subArray);

      this.loaded = true;
    } catch (err) {
      console.error("[SubscriptionsManager] Failed to load subs:", err);
    }
  }

  isSubscribed(channelHex) {
    return this.subscribedPubkeys.has(channelHex);
  }

  async addChannel(channelHex, userPubkey) {
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot addChannel.");
    }
    if (this.subscribedPubkeys.has(channelHex)) {
      console.log("Already subscribed to", channelHex);
      return;
    }
    this.subscribedPubkeys.add(channelHex);
    await this.publishSubscriptionList(userPubkey);
  }

  async removeChannel(channelHex, userPubkey) {
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot removeChannel.");
    }
    if (!this.subscribedPubkeys.has(channelHex)) {
      console.log("Channel not found in subscription list:", channelHex);
      return;
    }
    this.subscribedPubkeys.delete(channelHex);
    await this.publishSubscriptionList(userPubkey);
  }

  /**
   * Encrypt (NIP-04) + publish the updated subscription set
   * as kind=30002 with ["d", "subscriptions"] to be replaceable.
   */
  async publishSubscriptionList(userPubkey) {
    if (!userPubkey) {
      throw new Error("No pubkey => cannot publish subscription list.");
    }

    const plainObj = { subPubkeys: Array.from(this.subscribedPubkeys) };
    const plainStr = JSON.stringify(plainObj);

    /*
     * The subscription list is stored as a NIP-04 message to self, so both
     * encryption and decryption intentionally use the user's own pubkey.
     * Extensions are expected to support this encrypt-to-self flow; altering
     * the target would break loadSubscriptions, which decrypts with the same
     * pubkey. Any future sharing model (e.g., sharing with another user) will
     * need a parallel read path and should not overwrite this behavior.
     */
    let cipherText = "";
    try {
      cipherText = await window.nostr.nip04.encrypt(userPubkey, plainStr);
    } catch (err) {
      console.error("Encryption failed:", err);
      throw err;
    }

    const evt = {
      kind: 30002,
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", "subscriptions"]],
      content: cipherText,
    };

    try {
      const signedEvent = await window.nostr.signEvent(evt);
      await Promise.all(
        nostrClient.relays.map(async (relay) => {
          try {
            await nostrClient.pool.publish([relay], signedEvent);
          } catch (e) {
            console.error(
              `[SubscriptionsManager] Failed to publish to ${relay}`,
              e
            );
          }
        })
      );
      this.subsEventId = signedEvent.id;
      console.log("Subscription list published, event id:", signedEvent.id);
    } catch (signErr) {
      console.error("Failed to sign/publish subscription list:", signErr);
    }
  }

  /**
   * If not loaded, load subs, then fetch + render videos
   * in #subscriptionsVideoList with the same style as app.renderVideoList.
   */
  async showSubscriptionVideos(
    userPubkey,
    containerId = "subscriptionsVideoList"
  ) {
    if (!userPubkey) {
      const c = document.getElementById(containerId);
      if (c) c.innerHTML = "<p class='text-gray-500'>Please log in first.</p>";
      return;
    }
    if (!this.loaded) {
      await this.loadSubscriptions(userPubkey);
    }

    const channelHexes = Array.from(this.subscribedPubkeys);
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!channelHexes.length) {
      container.innerHTML =
        "<p class='text-gray-500'>No subscriptions found.</p>";
      return;
    }

    // Gather all videos
    const videos = await this.fetchSubscribedVideos(channelHexes);
    this.renderSameGridStyle(videos, containerId);
  }

  /**
   * Pull all events from subscribed authors, convert, dedupe => newest
   */
  async fetchSubscribedVideos(authorPubkeys) {
    try {
      const filter = {
        kinds: [30078],
        "#t": ["video"],
        authors: authorPubkeys,
        limit: 500,
      };

      const allEvents = [];
      for (const relay of nostrClient.relays) {
        try {
          const res = await nostrClient.pool.list([relay], [filter]);
          allEvents.push(...res);
        } catch (rErr) {
          console.error(`[SubscriptionsManager] Error at ${relay}`, rErr);
        }
      }

      const videos = [];
      for (const evt of allEvents) {
        const vid = this.convertEventToVideo(evt);
        if (!vid.invalid && !vid.deleted) videos.push(vid);
      }

      const deduped = this.dedupeToNewestByRoot(videos);
      deduped.sort((a, b) => b.created_at - a.created_at);
      return deduped;
    } catch (err) {
      console.error("fetchSubscribedVideos error:", err);
      return [];
    }
  }

  /**
   * Renders the feed in the same style as home.
   * This includes gear menu, time-ago, lazy load, clickable authors, etc.
   */
  renderSameGridStyle(videos, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const safeVideos = Array.isArray(videos) ? videos : [];
    const dedupedVideos =
      window.app?.dedupeVideosByRoot?.(safeVideos) ??
      this.dedupeToNewestByRoot(safeVideos);

    const filteredVideos = dedupedVideos.filter((video) => {
      if (!video || typeof video !== "object") {
        return false;
      }

      if (
        window.app?.isAuthorBlocked &&
        window.app.isAuthorBlocked(video.pubkey)
      ) {
        return false;
      }

      return true;
    });

    if (!filteredVideos.length) {
      container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-gray-500">
          No videos available yet.
        </p>`;
      return;
    }

    // Sort newest first
    filteredVideos.sort((a, b) => b.created_at - a.created_at);

    const fullAllEventsArray = Array.from(nostrClient.allEvents.values());
    const fragment = document.createDocumentFragment();
    // Only declare localAuthorSet once
    const localAuthorSet = new Set();

    filteredVideos.forEach((video, index) => {
      if (!video.id || !video.title) {
        console.error("Missing ID or title:", video);
        return;
      }

      // Keep the global videos map up to date so delegated playback handlers
      // can reuse the already fetched metadata for this event.
      window.app?.videosMap?.set(video.id, video);

      localAuthorSet.add(video.pubkey);

      const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
      const shareUrl = getAbsoluteShareUrl(nevent);
      const canEdit = window.app?.pubkey === video.pubkey;

      const highlightClass =
        video.isPrivate && canEdit
          ? "border-2 border-yellow-500"
          : "border-none";

      const timeAgo = window.app?.formatTimeAgo
        ? window.app.formatTimeAgo(video.created_at)
        : new Date(video.created_at * 1000).toLocaleString();

      let hasOlder = false;
      if (canEdit && video.videoRootId && window.app?.hasOlderVersion) {
        hasOlder = window.app.hasOlderVersion(video, fullAllEventsArray);
      }

      const revertButton = hasOlder
        ? `
          <button
            class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
            data-revert-index="${index}"
            data-revert-event-id="${video.id}"
          >
            Revert
          </button>
        `
        : "";

      const gearMenu = canEdit
        ? `
          <div class="relative inline-block ml-3 overflow-visible">
            <button
              type="button"
              class="inline-flex items-center p-2 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              class="hidden absolute right-0 bottom-full mb-2 w-32 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
            >
              <div class="py-1">
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700"
                  data-edit-index="${index}"
                  data-edit-event-id="${video.id}"
                >
                  Edit
                </button>
                ${revertButton}
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
                  data-delete-all-index="${index}"
                  data-delete-all-event-id="${video.id}"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        `
        : "";

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

      const safeTitle = window.app?.escapeHTML(video.title) || "Untitled";
      const safeThumb = window.app?.escapeHTML(video.thumbnail) || "";
      const playbackUrl =
        typeof video.url === "string" ? video.url : "";
      const trimmedUrl = playbackUrl ? playbackUrl.trim() : "";
      const trimmedMagnet =
        typeof video.magnet === "string" ? video.magnet.trim() : "";
      const legacyInfoHash =
        typeof video.infoHash === "string" ? video.infoHash.trim() : "";
      const magnetCandidate = trimmedMagnet || legacyInfoHash;
      const playbackMagnet = magnetCandidate;
      const magnetProvided = magnetCandidate.length > 0;
      const magnetSupported =
        window.app?.isMagnetUriSupported?.(magnetCandidate) ?? false;
      const urlBadgeHtml = trimmedUrl
        ? window.app?.getUrlHealthPlaceholderMarkup?.({ includeMargin: false }) ??
          ""
        : "";
      const torrentHealthBadgeHtml =
        magnetProvided && magnetSupported
          ? window.app?.getTorrentHealthBadgeMarkup?.({
              includeMargin: false,
            }) ?? ""
          : "";
      const connectionBadgesHtml =
        urlBadgeHtml || torrentHealthBadgeHtml
          ? `
            <div class="mt-3 flex flex-wrap items-center gap-2">
              ${urlBadgeHtml}${torrentHealthBadgeHtml}
            </div>
          `
          : "";
      const cardHtml = `
        <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass}">
          <a
            href="${shareUrl}"
            data-video-id="${video.id}"
            data-play-url=""
            data-play-magnet=""
            class="block cursor-pointer relative group"
          >
            <div class="ratio-16-9">
              <img
                src="assets/jpg/video-thumbnail-fallback.jpg"
                data-lazy="${safeThumb}"
                alt="${safeTitle}"
              />
            </div>
          </a>
          <div class="p-4">
            <h3
              class="text-lg font-bold text-white line-clamp-2 hover:text-blue-400 cursor-pointer mb-3"
              data-video-id="${video.id}"
              data-play-url=""
              data-play-magnet=""
            >
              ${safeTitle}
            </h3>
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                  <img
                    class="author-pic"
                    data-pubkey="${video.pubkey}"
                    src="assets/svg/default-profile.svg"
                    alt="Placeholder"
                  />
                </div>
                <div class="min-w-0">
                  <p
                    class="text-sm text-gray-400 author-name"
                    data-pubkey="${video.pubkey}"
                  >
                    Loading name...
                  </p>
                  <div class="flex items-center text-xs text-gray-500 mt-1">
                    <span>${timeAgo}</span>
                  </div>
                </div>
              </div>
              ${cardControls}
            </div>
            ${connectionBadgesHtml}
          </div>
        </div>
      `;

      const t = document.createElement("template");
      t.innerHTML = cardHtml.trim();
      const cardEl = t.content.firstElementChild;
      if (cardEl) {
        cardEl.dataset.ownerIsViewer = canEdit ? "true" : "false";
        if (typeof video.pubkey === "string" && video.pubkey) {
          cardEl.dataset.ownerPubkey = video.pubkey;
        } else if (cardEl.dataset.ownerPubkey) {
          delete cardEl.dataset.ownerPubkey;
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

        // Leave the data-play-* attributes empty in the literal markup so we can
        // assign the raw URL/magnet strings post-parsing without HTML entity
        // escaping, mirroring the approach in app.js. The URL is encoded so that
        // special characters survive storage in data-* attributes; the click
        // handler decodes it right before playback while keeping the magnet raw.
        const interactiveEls = cardEl.querySelectorAll("[data-video-id]");
        interactiveEls.forEach((el) => {
          if (!el.dataset) return;

          if (trimmedUrl) {
            el.dataset.playUrl = encodeURIComponent(trimmedUrl);
          } else {
            delete el.dataset.playUrl;
          }

          el.dataset.playMagnet = playbackMagnet || "";
        });

        if (magnetProvided) {
          cardEl.dataset.magnet = playbackMagnet;
        } else if (cardEl.dataset.magnet) {
          delete cardEl.dataset.magnet;
        }

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
      }
      fragment.appendChild(cardEl);
    });

    container.appendChild(fragment);
    attachHealthBadges(container);
    attachUrlHealthBadges(container, ({ badgeEl, url, eventId }) => {
      if (!window.app?.handleUrlHealthBadge) {
        return;
      }
      const video =
        window.app.videosMap?.get?.(eventId) || { id: eventId };
      window.app.handleUrlHealthBadge({ video, url, badgeEl });
    });

    if (window.app) {
      window.app.videoList = container;
      window.app.attachVideoListHandler?.();
    }

    // Lazy-load
    const lazyEls = container.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => window.app?.mediaLoader.observe(el));

    window.app?.attachMoreMenuHandlers?.(container);

    // Gear menus
    const gearButtons = container.querySelectorAll("[data-settings-dropdown]");
    gearButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = btn.getAttribute("data-settings-dropdown");
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) dropdown.classList.toggle("hidden");
      });
    });

    // Edit button
    const editButtons = container.querySelectorAll("[data-edit-index]");
    editButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idxAttr = btn.getAttribute("data-edit-index");
        const idx = Number.parseInt(idxAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        const eventId = btn.getAttribute("data-edit-event-id") || "";
        window.app?.handleEditVideo({
          eventId,
          index: Number.isNaN(idx) ? null : idx,
        });
      });
    });

    // Revert
    const revertButtons = container.querySelectorAll("[data-revert-index]");
    revertButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idxAttr = btn.getAttribute("data-revert-index");
        const idx = Number.parseInt(idxAttr, 10);
        const dropdown = document.getElementById(`settingsDropdown-${idxAttr}`);
        if (dropdown) dropdown.classList.add("hidden");
        const eventId = btn.getAttribute("data-revert-event-id") || "";
        window.app?.handleRevertVideo({
          eventId,
          index: Number.isNaN(idx) ? null : idx,
        });
      });
    });

    // Delete All
    const deleteAllButtons = container.querySelectorAll(
      "[data-delete-all-index]"
    );
    deleteAllButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idxAttr = btn.getAttribute("data-delete-all-index");
        const idx = Number.parseInt(idxAttr, 10);
        const dd = document.getElementById(`settingsDropdown-${idxAttr}`);
        if (dd) dd.classList.add("hidden");
        const eventId = btn.getAttribute("data-delete-all-event-id") || "";
        window.app?.handleFullDeleteVideo({
          eventId,
          index: Number.isNaN(idx) ? null : idx,
        });
      });
    });

    // Now fetch author profiles
    const authorPics = container.querySelectorAll(".author-pic");
    const authorNames = container.querySelectorAll(".author-name");

    // We only declare localAuthorSet once at the top
    // so we don't cause a "duplicate" variable error.
    authorPics.forEach((pic) => {
      localAuthorSet.add(pic.getAttribute("data-pubkey"));
    });
    authorNames.forEach((nameEl) => {
      localAuthorSet.add(nameEl.getAttribute("data-pubkey"));
    });

    if (window.app?.batchFetchProfiles && localAuthorSet.size > 0) {
      window.app.batchFetchProfiles(localAuthorSet);
    }

    // Make author name/pic clickable => open channel
    authorPics.forEach((pic) => {
      pic.style.cursor = "pointer";
      pic.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pubkey = pic.getAttribute("data-pubkey");
        window.app?.goToProfile(pubkey);
      });
    });

    authorNames.forEach((nameEl) => {
      nameEl.style.cursor = "pointer";
      nameEl.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const pubkey = nameEl.getAttribute("data-pubkey");
        window.app?.goToProfile(pubkey);
      });
    });
  }

  convertEventToVideo(evt) {
    return sharedConvertEventToVideo(evt);
  }

  dedupeToNewestByRoot(videos) {
    const map = new Map();
    for (const v of videos) {
      const rootId = v.videoRootId || v.id;
      const existing = map.get(rootId);
      if (!existing || v.created_at > existing.created_at) {
        map.set(rootId, v);
      }
    }
    return Array.from(map.values());
  }
}

export const subscriptions = new SubscriptionsManager();
