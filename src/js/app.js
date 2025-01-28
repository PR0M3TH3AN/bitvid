// js/app.js

import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode } from "./config.js";
import { disclaimerModal } from "./disclaimer.js";

/**
 * Dummy "decryption" for private videos
 */
function fakeDecrypt(str) {
  return str.split("").reverse().join("");
}

class bitvidApp {
  constructor() {
    // Basic elements
    this.loginButton = document.getElementById("loginButton");
    this.logoutButton = document.getElementById("logoutButton");
    this.userStatus = document.getElementById("userStatus");
    this.userPubKey = document.getElementById("userPubKey");

    // Form elements
    this.submitForm = document.getElementById("submitForm");
    this.videoFormContainer = document.getElementById("videoFormContainer");

    // Listing + small player
    this.videoList = document.getElementById("videoList");
    this.playerSection = document.getElementById("playerSection");
    this.videoElement = document.getElementById("video");
    this.status = document.getElementById("status");
    this.progressBar = document.getElementById("progress");
    this.peers = document.getElementById("peers");
    this.speed = document.getElementById("speed");
    this.downloaded = document.getElementById("downloaded");

    // Modal references (populated after initModal)
    this.playerModal = null;
    this.modalVideo = null;
    this.modalStatus = null;
    this.modalProgress = null;
    this.modalPeers = null;
    this.modalSpeed = null;
    this.modalDownloaded = null;
    this.closePlayerBtn = null;
    this.videoTitle = null;
    this.videoDescription = null;
    this.videoTimestamp = null;
    this.creatorAvatar = null;
    this.creatorName = null;
    this.creatorNpub = null;

    // Buttons for magnet copy/share in modal
    this.copyMagnetBtn = null;
    this.shareBtn = null;

    // Notification containers
    this.errorContainer = document.getElementById("errorContainer");
    this.successContainer = document.getElementById("successContainer");

    // Auth state
    this.pubkey = null;
    // Currently playing magnet
    this.currentMagnetUri = null;

    // Private checkbox
    this.isPrivateCheckbox = document.getElementById("isPrivate");

    // The active video object
    this.currentVideo = null;

    // Subscription reference
    this.videoSubscription = null;

    /**
     * Replaces the old `this.videos = []` with a Map,
     * keyed by `video.id` for O(1) lookups.
     */
    this.videosMap = new Map();

    // A simple cache for user profiles
    this.profileCache = new Map();
  }

  async init() {
    try {
      // Hide any small player at first
      if (this.playerSection) {
        this.playerSection.style.display = "none";
      }

      // Initialize the modal
      await this.initModal();
      this.updateModalElements();

      // Connect to Nostr
      await nostrClient.init();
      const savedPubKey = localStorage.getItem("userPubKey");
      if (savedPubKey) {
        this.login(savedPubKey, false);
      }

      // Setup event listeners, disclaimers
      this.setupEventListeners();
      disclaimerModal.show();

      // Subscribe for videos
      await this.loadVideos();

      // If there's a ?v= param, handle it
      this.checkUrlParams();
    } catch (error) {
      console.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  async initModal() {
    try {
      console.log("Starting modal initialization...");
      const resp = await fetch("components/video-modal.html");
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();
      console.log("Modal HTML loaded successfully");

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }

      modalContainer.innerHTML = html;
      console.log("Modal HTML inserted into DOM");

      // Navigation
      const closeButton = document.getElementById("closeModal");
      if (!closeButton) {
        throw new Error("Close button not found!");
      }
      closeButton.addEventListener("click", () => {
        this.hideModal();
      });

      // Scroll-based nav hide
      const modalNav = document.getElementById("modalNav");
      const playerModal = document.getElementById("playerModal");
      if (!modalNav || !playerModal) {
        throw new Error("Modal nav elements not found!");
      }

      let lastScrollY = 0;
      playerModal.addEventListener("scroll", (e) => {
        const currentScrollY = e.target.scrollTop;
        const shouldShowNav =
          currentScrollY <= lastScrollY || currentScrollY < 50;
        modalNav.style.transform = shouldShowNav
          ? "translateY(0)"
          : "translateY(-100%)";
        lastScrollY = currentScrollY;
      });

      console.log("Modal initialization completed successfully");
      return true;
    } catch (error) {
      console.error("Modal initialization failed:", error);
      this.showError(`Failed to initialize video player: ${error.message}`);
      return false;
    }
  }

  updateModalElements() {
    this.playerModal = document.getElementById("playerModal");
    this.modalVideo = document.getElementById("modalVideo");
    this.modalStatus = document.getElementById("modalStatus");
    this.modalProgress = document.getElementById("modalProgress");
    this.modalPeers = document.getElementById("modalPeers");
    this.modalSpeed = document.getElementById("modalSpeed");
    this.modalDownloaded = document.getElementById("modalDownloaded");
    this.closePlayerBtn = document.getElementById("closeModal");

    this.videoTitle = document.getElementById("videoTitle");
    this.videoDescription = document.getElementById("videoDescription");
    this.videoTimestamp = document.getElementById("videoTimestamp");

    this.creatorAvatar = document.getElementById("creatorAvatar");
    this.creatorName = document.getElementById("creatorName");
    this.creatorNpub = document.getElementById("creatorNpub");

    this.copyMagnetBtn = document.getElementById("copyMagnetBtn");
    this.shareBtn = document.getElementById("shareBtn");
  }

  setupEventListeners() {
    // Login
    this.loginButton.addEventListener("click", async () => {
      try {
        const pubkey = await nostrClient.login();
        this.login(pubkey, true);
      } catch (err) {
        this.log("Login failed:", err);
        this.showError("Failed to login. Please try again.");
      }
    });

    // Logout
    this.logoutButton.addEventListener("click", () => {
      this.logout();
    });

    // Submit new video form
    this.submitForm.addEventListener("submit", (e) => this.handleSubmit(e));

    // Close modal by X
    if (this.closePlayerBtn) {
      this.closePlayerBtn.addEventListener("click", async () => {
        await this.hideModal();
      });
    }

    // Close modal by clicking outside container
    if (this.playerModal) {
      this.playerModal.addEventListener("click", async (e) => {
        if (e.target === this.playerModal) {
          await this.hideModal();
        }
      });
    }

    // Error handling for the small inline player (if used)
    if (this.videoElement) {
      this.videoElement.addEventListener("error", (e) => {
        const error = e.target.error;
        if (error) {
          this.showError(
            `Video playback error: ${error.message || "Unknown error"}`
          );
        }
      });
    }

    // Modal video error
    if (this.modalVideo) {
      this.modalVideo.addEventListener("error", (e) => {
        const error = e.target.error;
        if (error) {
          this.showError(
            `Video playback error: ${error.message || "Unknown error"}`
          );
        }
      });
      this.modalVideo.addEventListener("loadstart", () => {
        this.log("Video loadstart event fired");
      });
      this.modalVideo.addEventListener("loadedmetadata", () => {
        this.log("Video loadedmetadata event fired");
      });
      this.modalVideo.addEventListener("canplay", () => {
        this.log("Video canplay event fired");
      });
    }

    // Copy magnet
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", () => {
        if (this.currentMagnetUri) {
          navigator.clipboard
            .writeText(this.currentMagnetUri)
            .then(() => this.showSuccess("Magnet link copied!"))
            .catch(() => this.showError("Failed to copy magnet link."));
        }
      });
    }

    // Share button
    if (this.shareBtn) {
      this.shareBtn.addEventListener("click", () => {
        if (!this.currentVideo) {
          this.showError("No video is loaded to share.");
          return;
        }
        try {
          const nevent = window.NostrTools.nip19.neventEncode({
            id: this.currentVideo.id,
          });
          const shareUrl = `${window.location.origin}${window.location.pathname}?v=${nevent}`;
          navigator.clipboard
            .writeText(shareUrl)
            .then(() => this.showSuccess("Video link copied to clipboard!"))
            .catch(() => this.showError("Failed to copy the link."));
        } catch (err) {
          console.error("Error generating share link:", err);
          this.showError("Could not generate link.");
        }
      });
    }

    // Cleanup on page unload
    window.addEventListener("beforeunload", async () => {
      await this.cleanup();
    });

    // Back/forward navigation
    window.addEventListener("popstate", async () => {
      console.log("[popstate] user navigated back/forward; cleaning modal...");
      await this.hideModal();
    });
  }

  login(pubkey, saveToStorage = true) {
    this.pubkey = pubkey;
    this.loginButton.classList.add("hidden");
    this.logoutButton.classList.remove("hidden");
    this.userStatus.classList.remove("hidden");
    this.userPubKey.textContent = pubkey;
    this.videoFormContainer.classList.remove("hidden");

    if (saveToStorage) {
      localStorage.setItem("userPubKey", pubkey);
    }
  }

  logout() {
    nostrClient.logout();
    this.pubkey = null;
    this.loginButton.classList.remove("hidden");
    this.logoutButton.classList.add("hidden");
    this.userStatus.classList.add("hidden");
    this.userPubKey.textContent = "";
    this.videoFormContainer.classList.add("hidden");
    localStorage.removeItem("userPubKey");
  }

  async cleanup() {
    try {
      // Stop playing any small player or modal video
      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.src = "";
        this.videoElement.load();
      }
      if (this.modalVideo) {
        this.modalVideo.pause();
        this.modalVideo.src = "";
        this.modalVideo.load();
      }
      // Cleanup torrent client
      await torrentClient.cleanup();
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  }

  async hideVideoPlayer() {
    await this.cleanup();
    if (this.playerSection) {
      this.playerSection.classList.add("hidden");
    }
  }

  async hideModal() {
    await this.cleanup();
    if (this.playerModal) {
      this.playerModal.style.display = "none";
      this.playerModal.classList.add("hidden");
    }
    this.currentMagnetUri = null;

    // Optionally revert ?v=... from the URL
    window.history.replaceState({}, "", window.location.pathname);
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return;
    }

    const descEl = document.getElementById("description");
    const isPrivate = this.isPrivateCheckbox
      ? this.isPrivateCheckbox.checked
      : false;

    const formData = {
      version: 2,
      title: document.getElementById("title")?.value.trim() || "",
      magnet: document.getElementById("magnet")?.value.trim() || "",
      thumbnail: document.getElementById("thumbnail")?.value.trim() || "",
      description: descEl?.value.trim() || "",
      mode: isDevMode ? "dev" : "live",
      isPrivate,
    };

    if (!formData.title || !formData.magnet) {
      this.showError("Title and Magnet are required.");
      return;
    }

    try {
      await nostrClient.publishVideo(formData, this.pubkey);
      this.submitForm.reset();
      if (this.isPrivateCheckbox) {
        this.isPrivateCheckbox.checked = false;
      }
      await this.loadVideos();
      this.showSuccess("Video shared successfully!");
    } catch (err) {
      console.error("Failed to publish video:", err);
      this.showError("Failed to share video. Please try again later.");
    }
  }

  /**
   * Subscribe to new videos & re-render the list.
   * Now we store them in `this.videosMap`, keyed by `video.id`.
   */
  async loadVideos() {
    console.log("Starting loadVideos (subscription approach)...");

    if (this.videoSubscription) {
      // unsub old sub if present
      this.videoSubscription.unsub();
      this.videoSubscription = null;
    }

    // Clear the listing
    this.videoList.innerHTML = `
      <p class="text-center text-gray-500">
        Loading videos...
      </p>`;

    // Clear the Map so we start fresh
    this.videosMap.clear();

    try {
      // Subscribe to new events
      this.videoSubscription = nostrClient.subscribeVideos((video) => {
        // Skip private videos not owned
        if (video.isPrivate && video.pubkey !== this.pubkey) {
          return;
        }

        // Only store if we haven’t seen this event ID yet
        if (!this.videosMap.has(video.id)) {
          this.videosMap.set(video.id, video);
          // Then re-render from the map
          const allVideos = Array.from(this.videosMap.values());
          this.renderVideoList(allVideos);
        }
      });
    } catch (err) {
      console.error("Subscription error:", err);
      this.showError("Could not load videos via subscription.");
      this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          No videos available at this time.
        </p>`;
    }
  }

  /**
   * Convert the values of our videosMap to an array & render them.
   */
  async renderVideoList(videos) {
    console.log("RENDER VIDEO LIST - Start", {
      videosReceived: videos,
      videosCount: videos.length,
    });

    if (!videos || videos.length === 0) {
      this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          No public videos available yet. Be the first to upload one!
        </p>`;
      return;
    }

    // Sort newest first
    videos.sort((a, b) => b.created_at - a.created_at);

    const htmlList = videos.map((video, index) => {
      if (!video.id || !video.title) {
        console.error("Video missing ID/title:", video);
        return "";
      }

      const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
      const shareUrl = `${window.location.pathname}?v=${encodeURIComponent(
        nevent
      )}`;

      const canEdit = video.pubkey === this.pubkey;
      const highlightClass =
        video.isPrivate && canEdit
          ? "border-2 border-yellow-500"
          : "border-none";
      const timeAgo = this.formatTimeAgo(video.created_at);

      // Gear menu
      const gearMenu = canEdit
        ? `
          <div class="relative inline-block ml-3 overflow-visible">
            <button
              type="button"
              class="inline-flex items-center p-2 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onclick="document.getElementById('settingsDropdown-${index}').classList.toggle('hidden')"
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
                  onclick="app.handleEditVideo(${index}); document.getElementById('settingsDropdown-${index}').classList.add('hidden');"
                >
                  Edit
                </button>
                <button
                  class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
                  onclick="app.handleDeleteVideo(${index}); document.getElementById('settingsDropdown-${index}').classList.add('hidden');"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        `
        : "";

      // Build the card
      const cardHtml = `
      <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass}">
        <a
          href="${shareUrl}"
          target="_blank"
          rel="noopener noreferrer"
          class="block cursor-pointer relative group"
          onclick="if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            app.playVideo('${encodeURIComponent(video.magnet)}');
          }"
        >
          <div class="ratio-16-9">
            <img
              src="assets/jpg/video-thumbnail-fallback.jpg"
              data-real-src="${this.escapeHTML(video.thumbnail)}"
              alt="${this.escapeHTML(video.title)}"
              onload="
                const realSrc = this.getAttribute('data-real-src');
                if (realSrc) {
                  const that = this;
                  const testImg = new Image();
                  testImg.onload = function() {
                    that.src = realSrc;
                  };
                  testImg.src = realSrc;
                }
              "
            />
          </div>
        </a>
        <div class="p-4">
          <h3
            class="text-lg font-bold text-white line-clamp-2 hover:text-blue-400 cursor-pointer mb-3"
            onclick="app.playVideo('${encodeURIComponent(video.magnet)}')"
          >
            ${this.escapeHTML(video.title)}
          </h3>
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden flex items-center justify-center">
                <img
                  class="author-pic"
                  data-pubkey="${video.pubkey}"
                  src="assets/jpg/default-profile.jpg"
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

      // Kick off background fetch for profile
      this.fetchAndRenderProfile(video.pubkey);

      return cardHtml;
    });

    const valid = htmlList.filter((x) => x.length > 0);
    if (valid.length === 0) {
      this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          No valid videos to display.
        </p>`;
      return;
    }

    this.videoList.innerHTML = valid.join("");
    console.log("Videos rendered successfully (subscription approach).");
  }

  async fetchAndRenderProfile(pubkey) {
    if (this.profileCache.has(pubkey)) {
      this.updateProfileInDOM(pubkey, this.profileCache.get(pubkey));
      return;
    }
    try {
      const userEvents = await nostrClient.pool.list(nostrClient.relays, [
        { kinds: [0], authors: [pubkey], limit: 1 },
      ]);
      if (userEvents.length > 0 && userEvents[0].content) {
        const data = JSON.parse(userEvents[0].content);
        const profile = {
          name: data.name || data.display_name || "Unknown",
          picture: data.picture || "assets/png/default-avatar.png",
        };
        this.profileCache.set(pubkey, profile);
        this.updateProfileInDOM(pubkey, profile);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  }

  updateProfileInDOM(pubkey, profile) {
    const picEls = document.querySelectorAll(
      `.author-pic[data-pubkey="${pubkey}"]`
    );
    for (const el of picEls) {
      el.src = profile.picture;
    }
    const nameEls = document.querySelectorAll(
      `.author-name[data-pubkey="${pubkey}"]`
    );
    for (const el of nameEls) {
      el.textContent = profile.name;
    }
  }

  /**
   * Actually plays a video, using magnet lookups.
   * We search our Map’s values by magnet. If not found, fallback fetch.
   */
  async playVideo(magnetURI) {
    try {
      if (!magnetURI) {
        this.showError("Invalid Magnet URI.");
        return;
      }
      const decodedMagnet = decodeURIComponent(magnetURI);
      if (this.currentMagnetUri === decodedMagnet) {
        this.log("Same video requested - already playing");
        return;
      }
      this.currentMagnetUri = decodedMagnet;

      // "Please stand by" poster
      this.modalVideo.poster = "assets/gif/please-stand-by.gif";
      // Show modal
      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");

      // 1) Convert the map’s values to an array and find by magnet
      let video = Array.from(this.videosMap.values()).find(
        (v) => v.magnet === decodedMagnet
      );

      // 2) Fallback fetch if not found
      if (!video) {
        const allVideos = await nostrClient.fetchVideos();
        video = allVideos.find((v) => v.magnet === decodedMagnet);
      }

      if (!video) {
        this.showError("Video data not found.");
        return;
      }

      this.currentVideo = video;

      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        this.log("Decrypting private magnet link...");
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }
      const finalMagnet = video.magnet;

      // Update URL
      try {
        const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
        const newUrl =
          window.location.pathname + `?v=${encodeURIComponent(nevent)}`;
        window.history.pushState({}, "", newUrl);
      } catch (err) {
        console.error("Error pushing new URL state:", err);
      }

      // optional: fetch a single author profile
      let creatorProfile = {
        name: "Unknown",
        picture: `https://robohash.org/${video.pubkey}`,
      };
      try {
        const userEvents = await nostrClient.pool.list(nostrClient.relays, [
          { kinds: [0], authors: [video.pubkey], limit: 1 },
        ]);
        if (userEvents.length > 0 && userEvents[0]?.content) {
          const data = JSON.parse(userEvents[0].content);
          creatorProfile = {
            name: data.name || data.display_name || "Unknown",
            picture: data.picture || `https://robohash.org/${video.pubkey}`,
          };
        }
      } catch (error) {
        this.log("Error fetching creator profile:", error);
      }

      let creatorNpub = "Unknown";
      try {
        creatorNpub = window.NostrTools.nip19.npubEncode(video.pubkey);
      } catch (error) {
        this.log("Error converting pubkey to npub:", error);
        creatorNpub = video.pubkey;
      }

      // Fill modal
      this.videoTitle.textContent = video.title || "Untitled";
      this.videoDescription.textContent =
        video.description || "No description available.";
      this.videoTimestamp.textContent = this.formatTimeAgo(video.created_at);

      this.creatorName.textContent = creatorProfile.name;
      this.creatorNpub.textContent = `${creatorNpub.slice(
        0,
        8
      )}...${creatorNpub.slice(-4)}`;
      this.creatorAvatar.src = creatorProfile.picture;
      this.creatorAvatar.alt = creatorProfile.name;

      this.log("Starting video stream with:", finalMagnet);
      await torrentClient.streamVideo(finalMagnet, this.modalVideo);

      this.modalVideo.addEventListener("canplay", () => {
        this.modalVideo.removeAttribute("poster");
      });

      // Mirror stats from the small player
      const updateInterval = setInterval(() => {
        if (!document.body.contains(this.modalVideo)) {
          clearInterval(updateInterval);
          return;
        }
        const status = document.getElementById("status");
        const progress = document.getElementById("progress");
        const peers = document.getElementById("peers");
        const speed = document.getElementById("speed");
        const downloaded = document.getElementById("downloaded");

        if (status) this.modalStatus.textContent = status.textContent;
        if (progress) this.modalProgress.style.width = progress.style.width;
        if (peers) this.modalPeers.textContent = peers.textContent;
        if (speed) this.modalSpeed.textContent = speed.textContent;
        if (downloaded) {
          this.modalDownloaded.textContent = downloaded.textContent;
        }
      }, 1000);
    } catch (error) {
      this.log("Error in playVideo:", error);
      this.showError(`Playback error: ${error.message}`);
    }
  }

  updateTorrentStatus(torrent) {
    if (!torrent) return;
    this.modalStatus.textContent = torrent.status;
    this.modalProgress.style.width = `${(torrent.progress * 100).toFixed(2)}%`;
    this.modalPeers.textContent = `Peers: ${torrent.numPeers}`;
    this.modalSpeed.textContent = `${(torrent.downloadSpeed / 1024).toFixed(
      2
    )} KB/s`;
    this.modalDownloaded.textContent = `${(
      torrent.downloaded /
      (1024 * 1024)
    ).toFixed(2)} MB / ${(torrent.length / (1024 * 1024)).toFixed(2)} MB`;
    if (torrent.ready) {
      this.modalStatus.textContent = "Ready to play";
    } else {
      setTimeout(() => this.updateTorrentStatus(torrent), 1000);
    }
  }

  async handleEditVideo(index) {
    try {
      // We do a fallback fetch to get a list of videos by index
      const all = await nostrClient.fetchVideos();
      const video = all[index];
      if (!this.pubkey) {
        this.showError("Please login to edit videos.");
        return;
      }
      if (!video || video.pubkey !== this.pubkey) {
        this.showError("You do not own this video.");
        return;
      }

      const newTitle = prompt("New Title? (blank=keep existing)", video.title);
      const newMagnet = prompt(
        "New Magnet? (blank=keep existing)",
        video.magnet
      );
      const newThumb = prompt(
        "New Thumbnail? (blank=keep existing)",
        video.thumbnail
      );
      const newDesc = prompt(
        "New Description? (blank=keep existing)",
        video.description
      );

      const wantPrivate = confirm("Make this video private? OK=Yes, Cancel=No");
      const title =
        !newTitle || !newTitle.trim() ? video.title : newTitle.trim();
      const magnet =
        !newMagnet || !newMagnet.trim() ? video.magnet : newMagnet.trim();
      const thumbnail =
        !newThumb || !newThumb.trim() ? video.thumbnail : newThumb.trim();
      const description =
        !newDesc || !newDesc.trim() ? video.description : newDesc.trim();

      const updatedData = {
        version: video.version || 2,
        isPrivate: wantPrivate,
        title,
        magnet,
        thumbnail,
        description,
        mode: isDevMode ? "dev" : "live",
      };

      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        tags: video.tags,
      };
      await nostrClient.editVideo(originalEvent, updatedData, this.pubkey);
      this.showSuccess("Video updated successfully!");
      await this.loadVideos(); // re-subscribe and re-render
    } catch (err) {
      this.log("Failed to edit video:", err.message);
      this.showError("Failed to edit video. Please try again.");
    }
  }

  async handleDeleteVideo(index) {
    try {
      const all = await nostrClient.fetchVideos();
      const video = all[index];
      if (!this.pubkey) {
        this.showError("Please login to delete videos.");
        return;
      }
      if (!video || video.pubkey !== this.pubkey) {
        this.showError("You do not own this video.");
        return;
      }
      if (!confirm(`Delete "${video.title}"? This can't be undone.`)) {
        return;
      }

      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        tags: video.tags,
      };
      await nostrClient.deleteVideo(originalEvent, this.pubkey);
      this.showSuccess("Video deleted successfully!");
      await this.loadVideos();
    } catch (err) {
      this.log("Failed to delete video:", err.message);
      this.showError("Failed to delete video. Please try again.");
    }
  }

  /**
   * Checks URL params for ?v=... and tries to open the video by ID.
   */
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const maybeNevent = urlParams.get("v");
    if (maybeNevent) {
      try {
        const decoded = window.NostrTools.nip19.decode(maybeNevent);
        if (decoded.type === "nevent" && decoded.data.id) {
          const eventId = decoded.data.id;

          // 1) Check local Map first
          let localMatch = this.videosMap.get(eventId);
          if (localMatch) {
            this.playVideoByEventId(eventId);
          } else {
            // 2) fallback fetch
            nostrClient
              .fetchVideos()
              .then((all) => {
                const matched = all.find((v) => v.id === eventId);
                if (matched) {
                  this.playVideoByEventId(eventId);
                } else {
                  this.showError("No matching video found for that link.");
                }
              })
              .catch((err) => {
                console.error("Error re-fetching videos:", err);
                this.showError("Could not load videos for the share link.");
              });
          }
        }
      } catch (err) {
        console.error("Error decoding nevent:", err);
        this.showError("Invalid share link.");
      }
    }
  }

  /**
   * Plays a video given an event ID. Looks up in the Map if possible, else fallback.
   */
  async playVideoByEventId(eventId) {
    try {
      // 1) Check local subscription map first
      let video = this.videosMap.get(eventId);

      // 2) Fallback fetch if not found
      if (!video) {
        const all = await nostrClient.fetchVideos();
        video = all.find((v) => v.id === eventId);
      }

      if (!video) {
        this.showError("Video not found.");
        return;
      }
      this.currentVideo = video;

      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        this.log("Decrypting private magnet link...");
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      const finalMagnet = video.magnet;
      this.currentMagnetUri = finalMagnet;

      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");

      const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
      const newUrl =
        window.location.pathname + `?v=${encodeURIComponent(nevent)}`;
      window.history.pushState({}, "", newUrl);

      // optional: fetch single author profile
      let creatorProfile = {
        name: "Unknown",
        picture: `https://robohash.org/${video.pubkey}`,
      };
      try {
        const userEvents = await nostrClient.pool.list(nostrClient.relays, [
          { kinds: [0], authors: [video.pubkey], limit: 1 },
        ]);
        if (userEvents.length > 0 && userEvents[0]?.content) {
          const data = JSON.parse(userEvents[0].content);
          creatorProfile = {
            name: data.name || data.display_name || "Unknown",
            picture: data.picture || `https://robohash.org/${video.pubkey}`,
          };
        }
      } catch (error) {
        this.log("Error fetching creator profile:", error);
      }

      let creatorNpub = "Unknown";
      try {
        creatorNpub = window.NostrTools.nip19.npubEncode(video.pubkey);
      } catch (error) {
        this.log("Error converting pubkey to npub:", error);
        creatorNpub = video.pubkey;
      }

      this.videoTitle.textContent = video.title || "Untitled";
      this.videoDescription.textContent =
        video.description || "No description available.";
      this.videoTimestamp.textContent = this.formatTimeAgo(video.created_at);

      this.creatorName.textContent = creatorProfile.name;
      this.creatorNpub.textContent = `${creatorNpub.slice(
        0,
        8
      )}...${creatorNpub.slice(-4)}`;
      this.creatorAvatar.src = creatorProfile.picture;
      this.creatorAvatar.alt = creatorProfile.name;

      this.log("Starting video stream with:", finalMagnet);
      await torrentClient.streamVideo(finalMagnet, this.modalVideo);

      const updateInterval = setInterval(() => {
        if (!document.body.contains(this.modalVideo)) {
          clearInterval(updateInterval);
          return;
        }
        const status = document.getElementById("status");
        const progress = document.getElementById("progress");
        const peers = document.getElementById("peers");
        const speed = document.getElementById("speed");
        const downloaded = document.getElementById("downloaded");

        if (status) this.modalStatus.textContent = status.textContent;
        if (progress) this.modalProgress.style.width = progress.style.width;
        if (peers) this.modalPeers.textContent = peers.textContent;
        if (speed) this.modalSpeed.textContent = speed.textContent;
        if (downloaded) {
          this.modalDownloaded.textContent = downloaded.textContent;
        }
      }, 1000);
    } catch (error) {
      this.log("Error in playVideoByEventId:", error);
      this.showError(`Playback error: ${error.message}`);
    }
  }

  // Utility helpers
  formatTimeAgo(timestamp) {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };
    for (const [unit, secInUnit] of Object.entries(intervals)) {
      const int = Math.floor(seconds / secInUnit);
      if (int >= 1) {
        return `${int} ${unit}${int === 1 ? "" : "s"} ago`;
      }
    }
    return "just now";
  }

  escapeHTML(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  showError(msg) {
    console.error(msg);
    if (this.errorContainer) {
      this.errorContainer.textContent = msg;
      this.errorContainer.classList.remove("hidden");
      setTimeout(() => {
        this.errorContainer.classList.add("hidden");
        this.errorContainer.textContent = "";
      }, 5000);
    } else {
      alert(msg);
    }
  }

  showSuccess(msg) {
    console.log(msg);
    if (this.successContainer) {
      this.successContainer.textContent = msg;
      this.successContainer.classList.remove("hidden");
      setTimeout(() => {
        this.successContainer.classList.add("hidden");
        this.successContainer.textContent = "";
      }, 5000);
    } else {
      alert(msg);
    }
  }

  log(msg) {
    console.log(msg);
  }
}

export const app = new bitvidApp();
app.init();
window.app = app;
