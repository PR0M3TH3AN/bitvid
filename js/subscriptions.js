// js/subscriptions.js
import { nostrClient } from "./nostr.js";
import {
  deriveTitleFromEvent,
  parseVideoEventPayload,
} from "./videoEventUtils.js";

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

    if (!videos.length) {
      container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-gray-500">
          No videos available yet.
        </p>`;
      return;
    }

    // Sort newest first
    videos.sort((a, b) => b.created_at - a.created_at);

    const fullAllEventsArray = Array.from(nostrClient.allEvents.values());
    const fragment = document.createDocumentFragment();
    // Only declare localAuthorSet once
    const localAuthorSet = new Set();

    const encodeDataValue = (value) =>
      typeof value === "string" && value.length > 0
        ? encodeURIComponent(value)
        : "";

    videos.forEach((video, index) => {
      if (!video.id || !video.title) {
        console.error("Missing ID or title:", video);
        return;
      }

      // Keep the global videos map up to date so delegated playback handlers
      // can reuse the already fetched metadata for this event.
      window.app?.videosMap?.set(video.id, video);

      localAuthorSet.add(video.pubkey);

      const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
      const shareUrl = `${window.location.pathname}?v=${encodeURIComponent(
        nevent
      )}`;
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
                >
                  Edit
                </button>
                ${revertButton}
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
                  data-delete-all-index="${index}"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        `
        : "";

      const safeTitle = window.app?.escapeHTML(video.title) || "Untitled";
      const safeThumb = window.app?.escapeHTML(video.thumbnail) || "";
      const encodedMagnet = encodeDataValue(video.magnet);
      const encodedUrl = encodeDataValue(video.url);
      const cardHtml = `
        <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass}">
          <a
            href="${shareUrl}"
            data-video-id="${video.id}"
            data-play-url="${encodedUrl}"
            data-play-magnet="${encodedMagnet}"
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
              data-play-url="${encodedUrl}"
              data-play-magnet="${encodedMagnet}"
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
              ${gearMenu}
            </div>
          </div>
        </div>
      `;

      const t = document.createElement("template");
      t.innerHTML = cardHtml.trim();
      const cardEl = t.content.firstElementChild;
      fragment.appendChild(cardEl);
    });

    container.appendChild(fragment);

    if (window.app) {
      window.app.videoList = container;
      window.app.attachVideoListHandler?.();
    }

    // Lazy-load
    const lazyEls = container.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => window.app?.mediaLoader.observe(el));

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
        const idx = btn.getAttribute("data-edit-index");
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) dropdown.classList.add("hidden");
        window.app?.handleEditVideo(idx);
      });
    });

    // Revert
    const revertButtons = container.querySelectorAll("[data-revert-index]");
    revertButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = btn.getAttribute("data-revert-index");
        const dropdown = document.getElementById(`settingsDropdown-${idx}`);
        if (dropdown) dropdown.classList.add("hidden");
        window.app?.handleRevertVideo(idx);
      });
    });

    // Delete All
    const deleteAllButtons = container.querySelectorAll(
      "[data-delete-all-index]"
    );
    deleteAllButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = btn.getAttribute("data-delete-all-index");
        const dd = document.getElementById(`settingsDropdown-${idx}`);
        if (dd) dd.classList.add("hidden");
        window.app?.handleFullDeleteVideo(idx);
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
    const {
      parsedContent,
      parseError,
      title,
      url,
      magnet,
      infoHash,
      version,
    } = parseVideoEventPayload(evt);

    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
    const trimmedInfoHash = typeof infoHash === "string" ? infoHash.trim() : "";
    const playbackMagnet = trimmedMagnet || trimmedInfoHash;
    const numericVersion = Number.isFinite(version) ? version : 0;

    const hasPlayableSource = Boolean(trimmedUrl) || Boolean(playbackMagnet);
    if (!hasPlayableSource) {
      return {
        id: evt.id,
        invalid: true,
        reason: "missing playable source",
      };
    }

    const derivedTitle = deriveTitleFromEvent({
      parsedContent,
      tags: evt.tags,
      primaryTitle: title,
    });

    let resolvedTitle = derivedTitle;
    if (!resolvedTitle && numericVersion < 2 && playbackMagnet) {
      resolvedTitle = trimmedInfoHash
        ? `Legacy Video ${trimmedInfoHash.slice(0, 8)}`
        : "Legacy BitTorrent Video";
    }

    if (!resolvedTitle) {
      return {
        id: evt.id,
        invalid: true,
        reason: parseError
          ? "missing title (json parse error)"
          : "missing title",
      };
    }

    return {
      id: evt.id,
      pubkey: evt.pubkey,
      created_at: evt.created_at,
      videoRootId: parsedContent.videoRootId || evt.id,
      version: numericVersion,
      deleted: parsedContent.deleted === true,
      isPrivate: parsedContent.isPrivate ?? false,
      title: resolvedTitle,
      url: trimmedUrl,
      magnet: playbackMagnet,
      rawMagnet: trimmedMagnet,
      infoHash: trimmedInfoHash,
      thumbnail: parsedContent.thumbnail ?? "",
      description: parsedContent.description ?? "",
      mode: parsedContent.mode ?? "live",
      tags: evt.tags || [],
      invalid: false,
    };
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
