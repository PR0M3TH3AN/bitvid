// js/app.js

import { loadView } from "./viewManager.js";
import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode } from "./config.js";
import { disclaimerModal } from "./disclaimer.js";

/**
 * Simple "decryption" placeholder for private videos.
 */
function fakeDecrypt(str) {
  return str.split("").reverse().join("");
}

class bitvidApp {
  constructor() {
    // Basic auth/display elements
    this.loginButton = document.getElementById("loginButton") || null;
    this.logoutButton = document.getElementById("logoutButton") || null;
    this.userStatus = document.getElementById("userStatus") || null;
    this.userPubKey = document.getElementById("userPubKey") || null;

    // Optional: a "profile" button or avatar (if used)
    this.profileButton = document.getElementById("profileButton") || null;
    this.profileAvatar = document.getElementById("profileAvatar") || null;

    // Profile modal references (if used in profile-modal.html)
    this.profileModal = null;
    this.closeProfileModal = null;
    this.profileLogoutBtn = null;
    this.profileModalAvatar = null;
    this.profileModalName = null;

    // Upload modal elements
    this.uploadButton = document.getElementById("uploadButton") || null;
    this.uploadModal = document.getElementById("uploadModal") || null;
    this.closeUploadModalBtn =
      document.getElementById("closeUploadModal") || null;
    this.uploadForm = document.getElementById("uploadForm") || null;

    // Optional small inline player stats
    this.status = document.getElementById("status") || null;
    this.progressBar = document.getElementById("progress") || null;
    this.peers = document.getElementById("peers") || null;
    this.speed = document.getElementById("speed") || null;
    this.downloaded = document.getElementById("downloaded") || null;

    // Video player modal references (loaded via video-modal.html)
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
    this.copyMagnetBtn = null;
    this.shareBtn = null;

    // Notification containers
    this.errorContainer = document.getElementById("errorContainer") || null;
    this.successContainer = document.getElementById("successContainer") || null;

    // Auth state
    this.pubkey = null;
    // Currently playing magnet
    this.currentMagnetUri = null;
    // The active video object
    this.currentVideo = null;
    // Subscription reference (for unsubscribing)
    this.videoSubscription = null;

    // Videos stored as a Map (key=event.id)
    this.videosMap = new Map();
    // Simple cache for user profiles
    this.profileCache = new Map();
  }

  async init() {
    try {
      // 1. Initialize the video modal (components/video-modal.html)
      await this.initModal();
      this.updateModalElements();

      // 2. Initialize the upload modal (components/upload-modal.html)
      await this.initUploadModal();

      // 3. (Optional) Initialize the profile modal (components/profile-modal.html)
      await this.initProfileModal();

      // 4. Connect to Nostr
      await nostrClient.init();
      const savedPubKey = localStorage.getItem("userPubKey");
      if (savedPubKey) {
        // Auto-login if a pubkey was saved
        this.login(savedPubKey, false);
      }

      // 5. Setup general event listeners, show disclaimers
      this.setupEventListeners();
      disclaimerModal.show();

      // 6. Load the default view
      await loadView("views/most-recent-videos.html");

      // 7. Once loaded, get a reference to #videoList
      this.videoList = document.getElementById("videoList");

      // 8. Subscribe or fetch videos
      await this.loadVideos();

      // 9. Check URL ?v= param
      this.checkUrlParams();

      // (Recommended) Keep an array of active interval IDs
      // so we can clear them when the modal closes:
      this.activeIntervals = [];
    } catch (error) {
      console.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  /**
   * Initialize the main video modal (video-modal.html).
   */
  async initModal() {
    try {
      const resp = await fetch("components/video-modal.html");
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }
      modalContainer.innerHTML = html;

      // Confirm we have a close button, etc.
      const closeButton = document.getElementById("closeModal");
      if (!closeButton) {
        throw new Error("Close button not found in video-modal!");
      }
      closeButton.addEventListener("click", () => {
        this.hideModal();
      });

      // Setup scroll-based nav hide
      const modalNav = document.getElementById("modalNav");
      const playerModal = document.getElementById("playerModal");
      if (!modalNav || !playerModal) {
        throw new Error("Modal nav (#modalNav) or #playerModal not found!");
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

      console.log("Video modal initialization successful");
      return true;
    } catch (error) {
      console.error("initModal failed:", error);
      this.showError(`Failed to initialize video modal: ${error.message}`);
      return false;
    }
  }

  /**
   * After we load the video modal, store references in `this.*`.
   */
  updateModalElements() {
    this.playerModal = document.getElementById("playerModal") || null;
    this.modalVideo = document.getElementById("modalVideo") || null;
    this.modalStatus = document.getElementById("modalStatus") || null;
    this.modalProgress = document.getElementById("modalProgress") || null;
    this.modalPeers = document.getElementById("modalPeers") || null;
    this.modalSpeed = document.getElementById("modalSpeed") || null;
    this.modalDownloaded = document.getElementById("modalDownloaded") || null;
    this.closePlayerBtn = document.getElementById("closeModal") || null;

    this.videoTitle = document.getElementById("videoTitle") || null;
    this.videoDescription = document.getElementById("videoDescription") || null;
    this.videoTimestamp = document.getElementById("videoTimestamp") || null;
    this.creatorAvatar = document.getElementById("creatorAvatar") || null;
    this.creatorName = document.getElementById("creatorName") || null;
    this.creatorNpub = document.getElementById("creatorNpub") || null;
    this.copyMagnetBtn = document.getElementById("copyMagnetBtn") || null;
    this.shareBtn = document.getElementById("shareBtn") || null;

    // Attach the event listeners for the copy/share buttons
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", () => {
        this.handleCopyMagnet();
      });
    }

    // UPDATED: This share button just copies the ?v= URL to the clipboard:
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
  }

  /**
   * Show the modal and set the "Please stand by" poster on the video.
   */
  showModalWithPoster() {
    if (this.playerModal) {
      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");
    }
    if (this.modalVideo) {
      this.modalVideo.poster = "assets/gif/please-stand-by.gif";
    }
  }

  /**
   * Initialize the upload modal (upload-modal.html).
   */
  async initUploadModal() {
    try {
      const resp = await fetch("components/upload-modal.html");
      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }
      // Append the upload modal markup
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      modalContainer.appendChild(wrapper);

      // Grab references
      this.uploadModal = document.getElementById("uploadModal") || null;
      this.closeUploadModalBtn =
        document.getElementById("closeUploadModal") || null;
      this.uploadForm = document.getElementById("uploadForm") || null;

      // Optional: if close button found, wire up
      if (this.closeUploadModalBtn) {
        this.closeUploadModalBtn.addEventListener("click", () => {
          if (this.uploadModal) {
            this.uploadModal.classList.add("hidden");
          }
        });
      }
      // If the form is found, wire up
      if (this.uploadForm) {
        this.uploadForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.handleUploadSubmit();
        });
      }

      console.log("Upload modal initialization successful");
      return true;
    } catch (error) {
      console.error("initUploadModal failed:", error);
      this.showError(`Failed to initialize upload modal: ${error.message}`);
      return false;
    }
  }

  /**
   * (Optional) Initialize a separate profile modal (profile-modal.html).
   */
  async initProfileModal() {
    try {
      console.log("Starting profile modal initialization...");
      const resp = await fetch("components/profile-modal.html");
      if (!resp.ok) {
        // If you don't have a profile modal, comment this entire method out.
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const html = await resp.text();

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      modalContainer.appendChild(wrapper);

      // Now references
      this.profileModal = document.getElementById("profileModal") || null;
      this.closeProfileModal =
        document.getElementById("closeProfileModal") || null;
      this.profileLogoutBtn =
        document.getElementById("profileLogoutBtn") || null;
      this.profileModalAvatar =
        document.getElementById("profileModalAvatar") || null;
      this.profileModalName =
        document.getElementById("profileModalName") || null;

      // Wire up
      if (this.closeProfileModal) {
        this.closeProfileModal.addEventListener("click", () => {
          this.profileModal.classList.add("hidden");
        });
      }
      if (this.profileLogoutBtn) {
        this.profileLogoutBtn.addEventListener("click", () => {
          // On "Logout" inside the profile modal
          this.logout();
          this.profileModal.classList.add("hidden");
        });
      }

      console.log("Profile modal initialization successful");
      return true;
    } catch (error) {
      console.error("initProfileModal failed:", error);
      // Not critical if missing
      return false;
    }
  }

  /**
   * Setup general event listeners for login, logout, modals, etc.
   */
  setupEventListeners() {
    // Login
    if (this.loginButton) {
      this.loginButton.addEventListener("click", async () => {
        try {
          const pubkey = await nostrClient.login();
          this.login(pubkey, true);
        } catch (err) {
          this.showError("Failed to login. Please try again.");
        }
      });
    }

    // Logout
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => {
        this.logout();
      });
    }

    // Profile button (if used)
    if (this.profileButton) {
      this.profileButton.addEventListener("click", () => {
        if (this.profileModal) {
          this.profileModal.classList.remove("hidden");
        }
      });
    }

    // Upload button => show upload modal
    if (this.uploadButton) {
      this.uploadButton.addEventListener("click", () => {
        if (this.uploadModal) {
          this.uploadModal.classList.remove("hidden");
        }
      });
    }

    // Cleanup on page unload
    window.addEventListener("beforeunload", async () => {
      await this.cleanup();
    });

    // Handle back/forward navigation => hide video modal
    window.addEventListener("popstate", async () => {
      console.log("[popstate] user navigated back/forward; cleaning modal...");
      await this.hideModal();
    });
  }

  /**
   * Attempt to load the user's own profile from Nostr (kind:0).
   */
  async loadOwnProfile(pubkey) {
    try {
      const events = await nostrClient.pool.list(nostrClient.relays, [
        { kinds: [0], authors: [pubkey], limit: 1 },
      ]);
      let displayName = "User";
      let picture = "assets/jpg/default-profile.jpg";

      if (events.length && events[0].content) {
        const data = JSON.parse(events[0].content);
        displayName = data.name || data.display_name || "User";
        picture = data.picture || "assets/jpg/default-profile.jpg";
      }

      // If you have a top-bar avatar (profileAvatar)
      if (this.profileAvatar) {
        this.profileAvatar.src = picture;
      }
      // If you want to show name somewhere
      if (this.profileModalName) {
        this.profileModalName.textContent = displayName;
      }
      if (this.profileModalAvatar) {
        this.profileModalAvatar.src = picture;
      }
    } catch (error) {
      console.error("loadOwnProfile error:", error);
    }
  }

  /**
   * Actually handle the upload form submission.
   */
  async handleUploadSubmit() {
    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return;
    }

    const titleEl = document.getElementById("uploadTitle");
    const magnetEl = document.getElementById("uploadMagnet");
    const thumbEl = document.getElementById("uploadThumbnail");
    const descEl = document.getElementById("uploadDescription");
    const privEl = document.getElementById("uploadIsPrivate");

    const formData = {
      version: 2,
      title: titleEl?.value.trim() || "",
      magnet: magnetEl?.value.trim() || "",
      thumbnail: thumbEl?.value.trim() || "",
      description: descEl?.value.trim() || "",
      mode: isDevMode ? "dev" : "live",
      isPrivate: privEl?.checked || false,
    };

    if (!formData.title || !formData.magnet) {
      this.showError("Title and Magnet are required.");
      return;
    }

    try {
      await nostrClient.publishVideo(formData, this.pubkey);

      // Clear fields
      if (titleEl) titleEl.value = "";
      if (magnetEl) magnetEl.value = "";
      if (thumbEl) thumbEl.value = "";
      if (descEl) descEl.value = "";
      if (privEl) privEl.checked = false;

      // Hide the modal
      if (this.uploadModal) {
        this.uploadModal.classList.add("hidden");
      }

      // Refresh the video list
      await this.loadVideos();
      this.showSuccess("Video shared successfully!");
    } catch (err) {
      console.error("Failed to publish video:", err);
      this.showError("Failed to share video. Please try again later.");
    }
  }

  /**
   * Called upon successful login.
   */
  login(pubkey, saveToStorage = true) {
    this.pubkey = pubkey;

    // Hide login button if present
    if (this.loginButton) {
      this.loginButton.classList.add("hidden");
    }
    // We can hide logout or userStatus if we want (or they might not exist)
    if (this.logoutButton) {
      this.logoutButton.classList.add("hidden");
    }
    if (this.userStatus) {
      this.userStatus.classList.add("hidden");
    }

    // Show the upload button, profile button, etc.
    if (this.uploadButton) {
      this.uploadButton.classList.remove("hidden");
    }
    if (this.profileButton) {
      this.profileButton.classList.remove("hidden");
    }

    // If you want to fetch your own profile to update UI
    this.loadOwnProfile(pubkey);

    if (saveToStorage) {
      localStorage.setItem("userPubKey", pubkey);
    }
  }

  /**
   * Logout logic
   */
  logout() {
    nostrClient.logout();
    this.pubkey = null;
    // Show login again (if it exists)
    if (this.loginButton) {
      this.loginButton.classList.remove("hidden");
    }
    // Hide logout or userStatus
    if (this.logoutButton) {
      this.logoutButton.classList.add("hidden");
    }
    if (this.userStatus) {
      this.userStatus.classList.add("hidden");
    }
    if (this.userPubKey) {
      this.userPubKey.textContent = "";
    }
    // Hide upload & profile
    if (this.uploadButton) {
      this.uploadButton.classList.add("hidden");
    }
    if (this.profileButton) {
      this.profileButton.classList.add("hidden");
    }
    // Clear localStorage
    localStorage.removeItem("userPubKey");
  }

  /**
   * Cleanup resources on unload or modal close.
   */
  async cleanup() {
    try {
      // If there's a small inline player
      if (this.videoElement) {
        this.videoElement.pause();
        this.videoElement.src = "";
        this.videoElement.load();
      }
      // If there's a modal video
      if (this.modalVideo) {
        this.modalVideo.pause();
        this.modalVideo.src = "";
        this.modalVideo.load();
      }
      // Tell webtorrent to cleanup
      await torrentClient.cleanup();
    } catch (err) {
      console.error("Cleanup error:", err);
    }
  }

  /**
   * Hide the video modal.
   */
  async hideModal() {
    // 1) Clear intervals
    if (this.activeIntervals && this.activeIntervals.length) {
      this.activeIntervals.forEach((id) => clearInterval(id));
      this.activeIntervals = [];
    }

    // 2) Cleanup resources (this stops the torrent, etc.)
    await this.cleanup();

    // 3) Hide the modal
    if (this.playerModal) {
      this.playerModal.style.display = "none";
      this.playerModal.classList.add("hidden");
    }
    this.currentMagnetUri = null;

    // 4) Revert ?v= param in the URL
    window.history.replaceState({}, "", window.location.pathname);
  }

  /**
   * Subscribe to new videos & render them.
   */
  // js/app.js

  async loadVideos() {
    console.log("Starting loadVideos (subscription approach)...");

    // If you had an existing subscription, unsubscribe first:
    if (this.videoSubscription) {
      this.videoSubscription.unsub();
      this.videoSubscription = null;
    }

    // Optionally show "loading videos..." message
    if (this.videoList) {
      this.videoList.innerHTML = `
      <p class="text-center text-gray-500">
        Loading videos...
      </p>`;
    }

    // Clear your local map
    this.videosMap.clear();

    try {
      // Subscribe to new events from nostrClient
      this.videoSubscription = nostrClient.subscribeVideos((video) => {
        // If the video is marked deleted, remove it from your local collection
        if (video.deleted) {
          if (this.videosMap.has(video.id)) {
            this.videosMap.delete(video.id);
            // Now rebuild the list
            const allVideos = Array.from(this.videosMap.values());
            const newestPerRoot = dedupeToNewestByRoot(allVideos);
            this.renderVideoList(newestPerRoot);
          }
          return;
        }

        // Skip private videos if they do not belong to the current user
        if (video.isPrivate && video.pubkey !== this.pubkey) {
          return;
        }

        // Only add if it's not in the map
        if (!this.videosMap.has(video.id)) {
          this.videosMap.set(video.id, video);
          // Re-run the dedupe logic
          const allVideos = Array.from(this.videosMap.values());
          const newestPerRoot = dedupeToNewestByRoot(allVideos);
          this.renderVideoList(newestPerRoot);
        }
      });
    } catch (err) {
      console.error("Subscription error:", err);
      this.showError("Could not load videos via subscription.");
      if (this.videoList) {
        this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          No videos available at this time.
        </p>`;
      }
    }
  }

  /**
   * Build the DOM for the video list.
   */
  async renderVideoList(videos) {
    if (!this.videoList) return;

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

      // Gear menu if canEdit
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

      // Build card
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

      // Kick off a background fetch for the profile
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
  }

  /**
   * Retrieve the profile for a given pubkey (kind:0) and update the DOM.
   */
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
          picture: data.picture || "assets/jpg/default-profile.jpg",
        };
        this.profileCache.set(pubkey, profile);
        this.updateProfileInDOM(pubkey, profile);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  }

  /**
   * Update all DOM elements that match this pubkey, e.g. .author-pic[data-pubkey=...]
   */
  updateProfileInDOM(pubkey, profile) {
    const picEls = document.querySelectorAll(
      `.author-pic[data-pubkey="${pubkey}"]`
    );
    picEls.forEach((el) => {
      el.src = profile.picture;
    });
    const nameEls = document.querySelectorAll(
      `.author-name[data-pubkey="${pubkey}"]`
    );
    nameEls.forEach((el) => {
      el.textContent = profile.name;
    });
  }

  /**
   * Plays a video given its magnet URI.
   * We simply look up which event has this magnet
   * and then delegate to playVideoByEventId for
   * consistent modal and metadata handling.
   */
  async playVideo(magnetURI) {
    try {
      if (!magnetURI) {
        this.showError("Invalid Magnet URI.");
        return;
      }

      const decodedMagnet = decodeURIComponent(magnetURI);

      // If we are already playing this exact magnet, do nothing.
      if (this.currentMagnetUri === decodedMagnet) {
        this.log("Same video requested - already playing");
        return;
      }

      // Look up the video in our subscription map
      let matchedVideo = Array.from(this.videosMap.values()).find(
        (v) => v.magnet === decodedMagnet
      );

      // If not found in the map, do a fallback fetch
      if (!matchedVideo) {
        const allVideos = await nostrClient.fetchVideos();
        matchedVideo = allVideos.find((v) => v.magnet === decodedMagnet);
      }

      if (!matchedVideo) {
        this.showError("No matching video found.");
        return;
      }

      // Update our tracking
      this.currentMagnetUri = decodedMagnet;

      // Hand off to the method that already sets modal fields and streams
      await this.playVideoByEventId(matchedVideo.id);
    } catch (error) {
      console.error("Error in playVideo:", error);
      this.showError(`Playback error: ${error.message}`);
    }
  }

  /**
   * Updates the modal to reflect current torrent stats.
   * We remove the unused torrent.status references,
   * and do not re-trigger recursion here (no setTimeout).
   */
  updateTorrentStatus(torrent) {
    console.log("[DEBUG] updateTorrentStatus called with torrent:", torrent);

    if (!torrent) {
      console.log("[DEBUG] torrent is null/undefined!");
      return;
    }

    // Log only fields that actually exist on the torrent:
    console.log("[DEBUG] torrent.progress =", torrent.progress);
    console.log("[DEBUG] torrent.numPeers =", torrent.numPeers);
    console.log("[DEBUG] torrent.downloadSpeed =", torrent.downloadSpeed);
    console.log("[DEBUG] torrent.downloaded =", torrent.downloaded);
    console.log("[DEBUG] torrent.length =", torrent.length);
    console.log("[DEBUG] torrent.ready =", torrent.ready);

    // Use "Complete" vs. "Downloading" as the textual status.
    if (this.modalStatus) {
      const fullyDownloaded = torrent.progress >= 1;
      this.modalStatus.textContent = fullyDownloaded
        ? "Complete"
        : "Downloading";
    }

    // Update the progress bar
    if (this.modalProgress) {
      const percent = (torrent.progress * 100).toFixed(2);
      this.modalProgress.style.width = `${percent}%`;
    }

    // Update peers count
    if (this.modalPeers) {
      this.modalPeers.textContent = `Peers: ${torrent.numPeers}`;
    }

    // Update speed in KB/s
    if (this.modalSpeed) {
      const kb = (torrent.downloadSpeed / 1024).toFixed(2);
      this.modalSpeed.textContent = `${kb} KB/s`;
    }

    // Update downloaded / total
    if (this.modalDownloaded) {
      const downloadedMb = (torrent.downloaded / (1024 * 1024)).toFixed(2);
      const lengthMb = (torrent.length / (1024 * 1024)).toFixed(2);
      this.modalDownloaded.textContent = `${downloadedMb} MB / ${lengthMb} MB`;
    }

    // If you want to show a different text at 100% or if "ready"
    // you can do it here:
    if (torrent.ready && this.modalStatus) {
      this.modalStatus.textContent = "Ready to play";
    }
  }

  /**
   * Handle "Edit Video" from gear menu.
   */
  async handleEditVideo(index) {
    try {
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

      // Prompt for updated fields
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

      // Build updated data, falling back to old values
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

      // IMPORTANT: we only pass id and pubkey to avoid reusing the old d-tag
      // (Do NOT pass video.tags!)
      const originalEvent = video;

      await nostrClient.editVideo(originalEvent, updatedData, this.pubkey);

      this.showSuccess("Video updated successfully!");
      await this.loadVideos();
    } catch (err) {
      this.log("Failed to edit video:", err.message);
      this.showError("Failed to edit video. Please try again.");
    }
  }

  /**
   * Handle "Delete Video" from gear menu.
   */
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

      // Only id and pubkey (omit old tags), so that delete doesn't overshadow the old d-tag
      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
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
   * If there's a ?v= param in the URL, auto-open that video.
   */
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const maybeNevent = urlParams.get("v");
    if (!maybeNevent) return; // no link param

    try {
      const decoded = window.NostrTools.nip19.decode(maybeNevent);
      if (decoded.type === "nevent" && decoded.data.id) {
        const eventId = decoded.data.id;
        // 1) check local map
        let localMatch = this.videosMap.get(eventId);
        if (localMatch) {
          this.playVideoByEventId(eventId);
        } else {
          // 2) fallback => getOldEventById
          this.getOldEventById(eventId)
            .then((video) => {
              if (video) {
                this.playVideoByEventId(eventId);
              } else {
                this.showError("No matching video found for that link.");
              }
            })
            .catch((err) => {
              console.error("Error fetching older event by ID:", err);
              this.showError("Could not load videos for the share link.");
            });
        }
      }
    } catch (err) {
      console.error("Error decoding nevent:", err);
      this.showError("Invalid share link.");
    }
  }

  /**
   * Helper to open a video by event ID (like ?v=...).
   */
  async playVideoByEventId(eventId) {
    try {
      // 1) Check local subscription map
      let video = this.videosMap.get(eventId);

      // 2) If not in local map, attempt fallback fetch from getOldEventById
      if (!video) {
        video = await this.getOldEventById(eventId);
      }

      // 3) If still no luck, show error and return
      if (!video) {
        this.showError("Video not found.");
        return;
      }

      // 4) Decrypt magnet if private & owned
      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        this.log("Decrypting private magnet link...");
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      // 5) Show the modal
      this.currentVideo = video;
      this.currentMagnetUri = video.magnet;
      this.showModalWithPoster();

      // 6) Update ?v= param in the URL
      const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
      const newUrl =
        window.location.pathname + `?v=${encodeURIComponent(nevent)}`;
      window.history.pushState({}, "", newUrl);

      // 7) Optionally fetch the author profile
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

      // 8) Render video details in modal
      const creatorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (this.videoTitle)
        this.videoTitle.textContent = video.title || "Untitled";
      if (this.videoDescription) {
        this.videoDescription.textContent =
          video.description || "No description available.";
      }
      if (this.videoTimestamp) {
        this.videoTimestamp.textContent = this.formatTimeAgo(video.created_at);
      }
      if (this.creatorName) {
        this.creatorName.textContent = creatorProfile.name;
      }
      if (this.creatorNpub) {
        this.creatorNpub.textContent = `${creatorNpub.slice(
          0,
          8
        )}...${creatorNpub.slice(-4)}`;
      }
      if (this.creatorAvatar) {
        this.creatorAvatar.src = creatorProfile.picture;
        this.creatorAvatar.alt = creatorProfile.name;
      }

      // 9) Stream torrent
      this.log("Starting video stream with:", video.magnet);
      const realTorrent = await torrentClient.streamVideo(
        video.magnet,
        this.modalVideo
      );

      // 10) Start intervals to update stats
      const updateInterval = setInterval(() => {
        if (!document.body.contains(this.modalVideo)) {
          clearInterval(updateInterval);
          return;
        }
        this.updateTorrentStatus(realTorrent);
      }, 1000);
      this.activeIntervals.push(updateInterval);

      // (Optional) Mirror small inline stats into the modal
      const mirrorInterval = setInterval(() => {
        if (!document.body.contains(this.modalVideo)) {
          clearInterval(mirrorInterval);
          return;
        }
        const status = document.getElementById("status");
        const progress = document.getElementById("progress");
        const peers = document.getElementById("peers");
        const speed = document.getElementById("speed");
        const downloaded = document.getElementById("downloaded");

        if (status && this.modalStatus) {
          this.modalStatus.textContent = status.textContent;
        }
        if (progress && this.modalProgress) {
          this.modalProgress.style.width = progress.style.width;
        }
        if (peers && this.modalPeers) {
          this.modalPeers.textContent = peers.textContent;
        }
        if (speed && this.modalSpeed) {
          this.modalSpeed.textContent = speed.textContent;
        }
        if (downloaded && this.modalDownloaded) {
          this.modalDownloaded.textContent = downloaded.textContent;
        }
      }, 1000);
      this.activeIntervals.push(mirrorInterval);
    } catch (error) {
      this.log("Error in playVideoByEventId:", error);
      this.showError(`Playback error: ${error.message}`);
    }
  }

  /**
   * Simple helper to safely encode an npub.
   */
  safeEncodeNpub(pubkey) {
    try {
      return window.NostrTools.nip19.npubEncode(pubkey);
    } catch (err) {
      return null;
    }
  }

  /**
   * Attempts to fetch an older event by its ID if we can't find it in
   * this.videosMap or from a bulk fetch. Uses nostrClient.getEventById.
   */
  async getOldEventById(eventId) {
    // 1) Already in our local videosMap?
    let video = this.videosMap.get(eventId);
    if (video) {
      return video;
    }

    // 2) Bulk fetch from relays
    const allFromBulk = await nostrClient.fetchVideos();

    // 2a) Deduplicate so we only keep newest version per root
    const newestPerRoot = dedupeToNewestByRoot(allFromBulk);

    // 2b) Find the requested ID within the deduplicated set
    video = newestPerRoot.find((v) => v.id === eventId);
    if (video) {
      // Store it in our local map, so we can open it instantly next time
      this.videosMap.set(video.id, video);
      return video;
    }

    // 3) Final fallback: direct single-event fetch
    const single = await nostrClient.getEventById(eventId);
    if (single && !single.deleted) {
      this.videosMap.set(single.id, single);
      return single;
    }

    // Not found or was deleted
    return null;
  }

  /**
   * Format "time ago" for a given timestamp (in seconds).
   */
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
        return `${int} ${unit}${int > 1 ? "s" : ""} ago`;
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
    if (!msg) {
      // Remove any content, then hide
      this.errorContainer.textContent = "";
      this.errorContainer.classList.add("hidden");
      return;
    }

    // If there's a message, show it
    this.errorContainer.textContent = msg;
    this.errorContainer.classList.remove("hidden");

    // Optional auto-hide after 5 seconds
    setTimeout(() => {
      this.errorContainer.textContent = "";
      this.errorContainer.classList.add("hidden");
    }, 5000);
  }

  showSuccess(msg) {
    if (!msg) {
      this.successContainer.textContent = "";
      this.successContainer.classList.add("hidden");
      return;
    }

    this.successContainer.textContent = msg;
    this.successContainer.classList.remove("hidden");

    setTimeout(() => {
      this.successContainer.textContent = "";
      this.successContainer.classList.add("hidden");
    }, 5000);
  }

  log(msg) {
    console.log(msg);
  }

  /**
   * Copies the current video's magnet link to the clipboard.
   */
  handleCopyMagnet() {
    if (!this.currentVideo || !this.currentVideo.magnet) {
      this.showError("No magnet link to copy.");
      return;
    }
    try {
      navigator.clipboard.writeText(this.currentVideo.magnet);
      this.showSuccess("Magnet link copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy magnet link:", err);
      this.showError("Could not copy magnet link. Please copy it manually.");
    }
  }
}

/**
 * Given an array of video objects,
 * return only the newest (by created_at) for each videoRootId.
 * If no videoRootId is present, treat the video’s own ID as its root.
 */
function dedupeToNewestByRoot(videos) {
  const map = new Map(); // key = rootId, value = newest video for that root

  for (const vid of videos) {
    // If there's no videoRootId, fall back to vid.id (treat it as its own "root")
    const rootId = vid.videoRootId || vid.id;

    const existing = map.get(rootId);
    if (!existing || vid.created_at > existing.created_at) {
      map.set(rootId, vid);
    }
  }

  // Return just the newest from each group
  return Array.from(map.values());
}

export const app = new bitvidApp();
app.init();
window.app = app;
