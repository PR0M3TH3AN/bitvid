// js/app.js

import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode } from "./config.js";
import { disclaimerModal } from "./disclaimer.js";

class bitvidApp {
  constructor() {
    // Authentication Elements
    this.loginButton = document.getElementById("loginButton");
    this.logoutButton = document.getElementById("logoutButton");
    this.userStatus = document.getElementById("userStatus");
    this.userPubKey = document.getElementById("userPubKey");

    // Form Elements
    this.submitForm = document.getElementById("submitForm");
    this.videoFormContainer = document.getElementById("videoFormContainer");

    // Video List Element
    this.videoList = document.getElementById("videoList");

    // Video Player Elements
    this.playerSection = document.getElementById("playerSection");
    this.videoElement = document.getElementById("video");
    this.status = document.getElementById("status");
    this.progressBar = document.getElementById("progress");
    this.peers = document.getElementById("peers");
    this.speed = document.getElementById("speed");
    this.downloaded = document.getElementById("downloaded");

    // Initialize these as null - they'll be set after modal loads
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

    // New buttons for magnet copy and share
    this.copyMagnetBtn = null;
    this.shareBtn = null;

    // Notification Containers
    this.errorContainer = document.getElementById("errorContainer");
    this.successContainer = document.getElementById("successContainer");

    this.pubkey = null;
    this.currentMagnetUri = null;

    // Private Video Checkbox
    this.isPrivateCheckbox = document.getElementById("isPrivate");

    // NEW: Store the currently loaded/playing video object
    this.currentVideo = null;
  }

  async init() {
    try {
      // Hide and reset player states
      if (this.playerSection) {
        this.playerSection.style.display = "none";
      }

      // Initialize modal first
      await this.initModal();

      // Then update modal element references
      this.updateModalElements();

      // Initialize Nostr and check login
      await nostrClient.init();
      const savedPubKey = localStorage.getItem("userPubKey");
      if (savedPubKey) {
        this.login(savedPubKey, false);
      }

      this.setupEventListeners();
      disclaimerModal.show();
      await this.loadVideos();

      // NEW: Parse ?v=nevent after videos are loaded
      this.checkUrlParams();
    } catch (error) {
      console.error("Init failed:", error);
      this.showError("Failed to connect to Nostr relay");
    }
  }

  async initModal() {
    try {
      console.log("Starting modal initialization...");
      const response = await fetch("components/video-modal.html");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      console.log("Modal HTML loaded successfully");

      const modalContainer = document.getElementById("modalContainer");
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }

      modalContainer.innerHTML = html;
      console.log("Modal HTML inserted into DOM");

      // Set up modal close handler
      const closeButton = document.getElementById("closeModal");
      if (!closeButton) {
        throw new Error("Close button element not found!");
      }

      closeButton.addEventListener("click", () => {
        this.hideModal();
      });

      // Set up scroll handler for nav show/hide
      let lastScrollY = 0;
      const modalNav = document.getElementById("modalNav");
      const playerModal = document.getElementById("playerModal");

      if (!modalNav || !playerModal) {
        throw new Error("Modal navigation elements not found!");
      }

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
    // Update Modal Elements
    this.playerModal = document.getElementById("playerModal");
    this.modalVideo = document.getElementById("modalVideo");
    this.modalStatus = document.getElementById("modalStatus");
    this.modalProgress = document.getElementById("modalProgress");
    this.modalPeers = document.getElementById("modalPeers");
    this.modalSpeed = document.getElementById("modalSpeed");
    this.modalDownloaded = document.getElementById("modalDownloaded");
    this.closePlayerBtn = document.getElementById("closeModal");

    // Update Video Info Elements
    this.videoTitle = document.getElementById("videoTitle");
    this.videoDescription = document.getElementById("videoDescription");
    this.videoTimestamp = document.getElementById("videoTimestamp");

    // Update Creator Info Elements
    this.creatorAvatar = document.getElementById("creatorAvatar");
    this.creatorName = document.getElementById("creatorName");
    this.creatorNpub = document.getElementById("creatorNpub");

    // New icons for magnet copy and share
    this.copyMagnetBtn = document.getElementById("copyMagnetBtn");
    this.shareBtn = document.getElementById("shareBtn");

    // Add scroll behavior for nav
    let lastScrollY = 0;
    const modalNav = document.getElementById("modalNav");

    if (this.playerModal && modalNav) {
      this.playerModal.addEventListener("scroll", (e) => {
        const currentScrollY = e.target.scrollTop;
        const shouldShowNav =
          currentScrollY <= lastScrollY || currentScrollY < 50;
        modalNav.style.transform = shouldShowNav
          ? "translateY(0)"
          : "translateY(-100%)";
        lastScrollY = currentScrollY;
      });
    }
  }

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

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval === 1 ? "" : "s"} ago`;
      }
    }

    return "just now";
  }

  setupEventListeners() {
    // Login Button
    this.loginButton.addEventListener("click", async () => {
      try {
        const pubkey = await nostrClient.login();
        this.login(pubkey, true);
      } catch (error) {
        this.log("Login failed:", error);
        this.showError("Failed to login. Please try again.");
      }
    });

    // Logout Button
    this.logoutButton.addEventListener("click", () => {
      this.logout();
    });

    // Form submission
    this.submitForm.addEventListener("submit", (e) => this.handleSubmit(e));

    // Close Modal Button
    if (this.closePlayerBtn) {
      this.closePlayerBtn.addEventListener("click", async () => {
        await this.hideModal();
      });
    }

    // Close Modal by clicking outside content
    if (this.playerModal) {
      this.playerModal.addEventListener("click", async (e) => {
        if (e.target === this.playerModal) {
          await this.hideModal();
        }
      });
    }

    // Video error handling
    this.videoElement.addEventListener("error", (e) => {
      const error = e.target.error;
      this.log("Video error:", error);
      if (error) {
        this.showError(
          `Video playback error: ${error.message || "Unknown error"}`
        );
      }
    });

    // Detailed Modal Video Event Listeners
    if (this.modalVideo) {
      this.modalVideo.addEventListener("error", (e) => {
        const error = e.target.error;
        this.log("Modal video error:", error);
        if (error) {
          this.log("Error code:", error.code);
          this.log("Error message:", error.message);
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

    // Copy magnet link
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", () => {
        if (this.currentMagnetUri) {
          navigator.clipboard
            .writeText(this.currentMagnetUri)
            .then(() => this.showSuccess("Magnet link copied to clipboard!"))
            .catch(() => this.showError("Failed to copy magnet link."));
        }
      });
    }

    // SHARE BUTTON
    if (this.shareBtn) {
      this.shareBtn.addEventListener("click", () => {
        if (!this.currentVideo) {
          this.showError("No video is loaded to share.");
          return;
        }

        try {
          // Encode the raw hex event ID into 'nevent'
          const nevent = window.NostrTools.nip19.neventEncode({
            id: this.currentVideo.id,
          });

          // Build a URL that includes ?v=<nevent>
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

    // Popstate event for back/forward navigation
    window.addEventListener("popstate", async (event) => {
      console.log("[popstate] Back or forward button detected. Cleaning up...");
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
    this.log(`User logged in as: ${pubkey}`);

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
    this.log("User logged out.");
  }

  async cleanup() {
    try {
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
      await torrentClient.cleanup();
    } catch (error) {
      this.log("Cleanup error:", error);
    } finally {
      try {
        await fetch("./webtorrent/cancel/");
      } catch (err) {
        console.error("Failed to cancel old WebTorrent request:", err);
      }
    }
  }

  async hideVideoPlayer() {
    await this.cleanup();
    this.playerSection.classList.add("hidden");
  }

  /**
   * OPTIONAL: Reset the URL after hiding the modal so that ?v=nevent
   * disappears. Remove this if you’d prefer the URL to remain set.
   */
  async hideModal() {
    await this.cleanup();
    this.playerModal.style.display = "none";
    this.playerModal.classList.add("hidden");
    // Clear out the old magnet so "same video requested" doesn't block re-loading
    this.currentMagnetUri = null;

    // Optionally revert the URL if you want to remove ?v=...
    window.history.replaceState({}, "", window.location.pathname);

    // Cancel any lingering torrent requests again
    try {
      await fetch("./webtorrent/cancel/");
    } catch (err) {
      console.error("Failed to cancel old WebTorrent request:", err);
    }
  }

  async handleSubmit(e) {
    e.preventDefault();

    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return;
    }

    const descriptionElement = document.getElementById("description");

    // If you have a checkbox with id="isPrivate" in HTML
    const isPrivate = this.isPrivateCheckbox
      ? this.isPrivateCheckbox.checked
      : false;

    const formData = {
      version: 2, // We set the version to 2 for new posts
      title: document.getElementById("title")?.value.trim() || "",
      magnet: document.getElementById("magnet")?.value.trim() || "",
      thumbnail: document.getElementById("thumbnail")?.value.trim() || "",
      description: descriptionElement?.value.trim() || "",
      mode: isDevMode ? "dev" : "live",
      isPrivate, // new field to handle private listings
    };

    this.log("Form Data Collected:", formData);

    if (!formData.title || !formData.magnet) {
      this.showError("Title and Magnet URI are required.");
      return;
    }

    try {
      await nostrClient.publishVideo(formData, this.pubkey);
      this.submitForm.reset();

      // If the private checkbox was checked, reset it
      if (this.isPrivateCheckbox) {
        this.isPrivateCheckbox.checked = false;
      }

      await this.loadVideos();
      this.showSuccess("Video shared successfully!");
    } catch (error) {
      this.log("Failed to publish video:", error.message);
      this.showError("Failed to share video. Please try again later.");
    }
  }

  async loadVideos() {
    console.log("Starting loadVideos...");
    try {
      const videos = await nostrClient.fetchVideos();
      console.log("Raw videos from nostrClient:", videos);

      if (!videos) {
        this.log("No videos received");
        throw new Error("No videos received from relays");
      }

      const videosArray = Array.isArray(videos) ? videos : [videos];

      // Filter so we only show:
      // - isPrivate === false (public videos)
      // - or isPrivate === true but pubkey === this.pubkey
      const displayedVideos = videosArray.filter((video) => {
        if (!video.isPrivate) {
          return true; // public
        }
        // It's private; only show if user is the owner
        return this.pubkey && video.pubkey === this.pubkey;
      });

      if (displayedVideos.length === 0) {
        this.log("No valid videos found after filtering.");
        this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          No public videos available yet. Be the first to upload one!
        </p>`;
        return;
      }

      this.log("Processing filtered videos:", displayedVideos);

      displayedVideos.forEach((video, index) => {
        this.log(`Video ${index} details:`, {
          id: video.id,
          title: video.title,
          magnet: video.magnet,
          isPrivate: video.isPrivate,
          pubkey: video.pubkey,
          created_at: video.created_at,
        });
      });

      await this.renderVideoList(displayedVideos);
      this.log(`Rendered ${displayedVideos.length} videos successfully`);
    } catch (error) {
      this.log("Failed to fetch videos:", error);
      this.showError(
        "An error occurred while loading videos. Please try again later."
      );
      this.videoList.innerHTML = `
      <p class="text-center text-gray-500">
        No videos available at the moment. Please try again later.
      </p>`;
    }
  }

  async renderVideoList(videos) {
    try {
      console.log("RENDER VIDEO LIST - Start", {
        videosReceived: videos,
        videosCount: videos ? videos.length : "N/A",
        videosType: typeof videos,
      });

      if (!videos) {
        console.error("NO VIDEOS RECEIVED");
        this.videoList.innerHTML = `<p class="text-center text-gray-500">No videos found.</p>`;
        return;
      }

      const videoArray = Array.isArray(videos) ? videos : [videos];

      if (videoArray.length === 0) {
        console.error("VIDEO ARRAY IS EMPTY");
        this.videoList.innerHTML = `<p class="text-center text-gray-500">No videos available.</p>`;
        return;
      }

      // Sort by creation date
      videoArray.sort((a, b) => b.created_at - a.created_at);

      // Prepare to fetch user profiles
      const userProfiles = new Map();
      const uniquePubkeys = [...new Set(videoArray.map((v) => v.pubkey))];

      for (const pubkey of uniquePubkeys) {
        try {
          const userEvents = await nostrClient.pool.list(nostrClient.relays, [
            {
              kinds: [0],
              authors: [pubkey],
              limit: 1,
            },
          ]);

          if (userEvents[0]?.content) {
            const profile = JSON.parse(userEvents[0].content);
            userProfiles.set(pubkey, {
              name: profile.name || profile.display_name || "Unknown",
              picture: profile.picture || `https://robohash.org/${pubkey}`,
            });
          } else {
            userProfiles.set(pubkey, {
              name: "Unknown",
              picture: `https://robohash.org/${pubkey}`,
            });
          }
        } catch (error) {
          console.error(`Profile fetch error for ${pubkey}:`, error);
          userProfiles.set(pubkey, {
            name: "Unknown",
            picture: `https://robohash.org/${pubkey}`,
          });
        }
      }

      // Build HTML for each video
      const renderedVideos = videoArray
        .map((video, index) => {
          try {
            if (!this.validateVideo(video, index)) {
              console.error(`Invalid video: ${video.title}`);
              return "";
            }

            // First, create a ?v=... link for middle-click / ctrl+click
            const nevent = window.NostrTools.nip19.neventEncode({
              id: video.id,
            });
            const shareUrl = `${
              window.location.pathname
            }?v=${encodeURIComponent(nevent)}`;

            const profile = userProfiles.get(video.pubkey) || {
              name: "Unknown",
              picture: `https://robohash.org/${video.pubkey}`,
            };
            const timeAgo = this.formatTimeAgo(video.created_at);

            // If user is the owner
            const canEdit = video.pubkey === this.pubkey;

            // If it's private + user owns it => highlight with a special border
            const highlightClass =
              video.isPrivate && canEdit
                ? "border-2 border-yellow-500"
                : "border-none"; // normal case

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
                  <!-- The dropdown appears above the gear (bottom-full) -->
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

            // Instead of a <div onclick="..."> for the thumbnail, we use <a>
            // This allows middle-click or ctrl+click to open shareUrl in a new tab,
            // while left-click is prevented => opens modal
            return `
              <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass}">
                  
                  <!-- VIDEO THUMBNAIL via <a> -->
                  <a
                    href="${shareUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="aspect-w-16 aspect-h-9 bg-gray-800 cursor-pointer relative group block"
                    style="display: block;"
                    onclick="if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
                      event.preventDefault();
                      app.playVideo('${encodeURIComponent(video.magnet)}');
                    }"
                  >
                    ${
                      video.thumbnail
                        ? `<img
                            src="${this.escapeHTML(video.thumbnail)}"
                            alt="${this.escapeHTML(video.title)}"
                            class="w-full h-full object-cover"
                          >`
                        : `<div class="flex items-center justify-center h-full bg-gray-800">
                             <svg class="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                     d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                     d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                             </svg>
                           </div>`
                    }
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300"></div>
                  </a>
  
                  <!-- CARD INFO -->
                  <div class="p-4">
                      <!-- TITLE -->
                      <h3
                        class="text-lg font-bold text-white line-clamp-2 hover:text-blue-400 cursor-pointer mb-3"
                        onclick="app.playVideo('${encodeURIComponent(
                          video.magnet
                        )}')"
                      >
                        ${this.escapeHTML(video.title)}
                      </h3>
  
                      <!-- CREATOR info + gear icon -->
                      <div class="flex items-center justify-between">
                          <!-- Left: Avatar & user/time -->
                          <div class="flex items-center space-x-3">
                              <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                  <img
                                    src="${this.escapeHTML(profile.picture)}"
                                    alt="${profile.name}"
                                    class="w-full h-full object-cover"
                                  >
                              </div>
                              <div class="min-w-0">
                                  <p class="text-sm text-gray-400 hover:text-gray-300 cursor-pointer">
                                      ${this.escapeHTML(profile.name)}
                                  </p>
                                  <div class="flex items-center text-xs text-gray-500 mt-1">
                                      <span>${timeAgo}</span>
                                  </div>
                              </div>
                          </div>
                          <!-- Right: gearMenu if user owns the video -->
                          ${gearMenu}
                      </div>
                  </div>
              </div>
            `;
          } catch (error) {
            console.error(`Error processing video ${index}:`, error);
            return "";
          }
        })
        .filter((html) => html.length > 0);

      console.log("Rendered videos:", renderedVideos.length);

      if (renderedVideos.length === 0) {
        this.videoList.innerHTML = `<p class="text-center text-gray-500">No valid videos to display.</p>`;
        return;
      }

      this.videoList.innerHTML = renderedVideos.join("");
      console.log("Videos rendered successfully");
    } catch (error) {
      console.error("Rendering error:", error);
      this.videoList.innerHTML = `<p class="text-center text-gray-500">Error loading videos.</p>`;
    }
  }

  validateVideo(video, index) {
    const validationResults = {
      hasId: Boolean(video?.id),
      isValidId: typeof video?.id === "string" && video.id.trim().length > 0,
      hasVideo: Boolean(video),
      hasTitle: Boolean(video?.title),
      hasMagnet: Boolean(video?.magnet),
      hasMode: Boolean(video?.mode),
      hasPubkey: Boolean(video?.pubkey),
      isValidTitle: typeof video?.title === "string" && video.title.length > 0,
      isValidMagnet:
        typeof video?.magnet === "string" && video.magnet.length > 0,
      isValidMode:
        typeof video?.mode === "string" && ["dev", "live"].includes(video.mode),
    };

    const passed = Object.values(validationResults).every(Boolean);
    console.log(
      `Video ${video?.title} validation results:`,
      validationResults,
      passed ? "PASSED" : "FAILED"
    );

    return passed;
  }

  getErrorMessage(error) {
    if (error.message.includes("404")) {
      return "Service worker not found. Please check server configuration.";
    } else if (error.message.includes("Brave")) {
      return "Please disable Brave Shields for this site to play videos.";
    } else if (error.message.includes("timeout")) {
      return "Connection timeout. Please check your internet connection.";
    } else {
      return "Failed to play video. Please try again.";
    }
  }

  showError(message) {
    if (this.errorContainer) {
      this.errorContainer.textContent = message;
      this.errorContainer.classList.remove("hidden");
      setTimeout(() => {
        this.errorContainer.classList.add("hidden");
        this.errorContainer.textContent = "";
      }, 5000);
    } else {
      alert(message);
    }
  }

  showSuccess(message) {
    if (this.successContainer) {
      this.successContainer.textContent = message;
      this.successContainer.classList.remove("hidden");
      setTimeout(() => {
        this.successContainer.classList.add("hidden");
        this.successContainer.textContent = "";
      }, 5000);
    } else {
      alert(message);
    }
  }

  escapeHTML(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  log(message) {
    console.log(message);
  }

  /**
   * Plays a video given its magnet URI.
   * This method handles the logic to initiate torrent download and play the video.
   */
  async playVideo(magnetURI) {
    try {
      if (!magnetURI) {
        this.showError("Invalid Magnet URI.");
        return;
      }

      // Decode in case the magnet was URI-encoded
      const decodedMagnet = decodeURIComponent(magnetURI);

      // Prevent re-invoking the exact same magnet link if it's already in use
      if (this.currentMagnetUri === decodedMagnet) {
        this.log("Same video requested - already playing");
        return;
      }
      this.currentMagnetUri = decodedMagnet;

      // Set a looping "please stand by" GIF as a temporary placeholder
      this.modalVideo.poster = "assets/gif/please-stand-by.gif";

      // Show the modal
      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");

      // Fetch (or re-fetch) videos from relays
      const videos = await nostrClient.fetchVideos();
      const video = videos.find((v) => v.magnet === decodedMagnet);
      if (!video) {
        this.showError("Video data not found.");
        return;
      }

      // Keep a reference to the current video
      this.currentVideo = video;

      // If the user owns a private video, decrypt it just once
      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        this.log("User owns a private video => decrypting magnet link...");
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      const finalMagnet = video.magnet;

      // Update the URL so the service worker has a consistent scope
      try {
        const nevent = window.NostrTools.nip19.neventEncode({ id: video.id });
        const newUrl =
          window.location.pathname + `?v=${encodeURIComponent(nevent)}`;
        window.history.pushState({}, "", newUrl);
      } catch (err) {
        console.error("Error pushing new URL state:", err);
      }

      // Fetch creator profile
      let creatorProfile = {
        name: "Unknown",
        picture: `https://robohash.org/${video.pubkey}`,
      };
      try {
        const userEvents = await nostrClient.pool.list(nostrClient.relays, [
          { kinds: [0], authors: [video.pubkey], limit: 1 },
        ]);
        if (userEvents.length > 0 && userEvents[0]?.content) {
          const profile = JSON.parse(userEvents[0].content);
          creatorProfile = {
            name: profile.name || profile.display_name || "Unknown",
            picture: profile.picture || `https://robohash.org/${video.pubkey}`,
          };
        }
      } catch (error) {
        this.log("Error fetching creator profile:", error);
      }

      // Derive a short display of the pubkey
      let creatorNpub = "Unknown";
      try {
        creatorNpub = window.NostrTools.nip19.npubEncode(video.pubkey);
      } catch (error) {
        this.log("Error converting pubkey to npub:", error);
        creatorNpub = video.pubkey;
      }

      // Populate modal fields
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

      // Start streaming
      this.log("Starting video stream with:", finalMagnet);
      await torrentClient.streamVideo(finalMagnet, this.modalVideo);

      // Remove the loading GIF once the video can play
      this.modalVideo.addEventListener("canplay", () => {
        this.modalVideo.removeAttribute("poster");
      });

      // Periodically mirror main player stats into the modal
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

  /**
   * Allows the user to edit a video note (only if they are the owner).
   */
  async handleEditVideo(index) {
    try {
      const videos = await nostrClient.fetchVideos();
      const video = videos[index];

      if (!this.pubkey) {
        this.showError("Please login to edit videos.");
        return;
      }
      if (video.pubkey !== this.pubkey) {
        this.showError("You do not own this video.");
        return;
      }

      const newTitle = prompt(
        "New Title? (Leave blank to keep existing)",
        video.title
      );
      const newMagnet = prompt(
        "New Magnet? (Leave blank to keep existing)",
        video.magnet
      );
      const newThumbnail = prompt(
        "New Thumbnail? (Leave blank to keep existing)",
        video.thumbnail
      );
      const newDescription = prompt(
        "New Description? (Leave blank to keep existing)",
        video.description
      );

      const wantPrivate = confirm("Make this video private? OK=Yes, Cancel=No");

      const title =
        newTitle === null || newTitle.trim() === ""
          ? video.title
          : newTitle.trim();
      const magnet =
        newMagnet === null || newMagnet.trim() === ""
          ? video.magnet
          : newMagnet.trim();
      const thumbnail =
        newThumbnail === null || newThumbnail.trim() === ""
          ? video.thumbnail
          : newThumbnail.trim();
      const description =
        newDescription === null || newDescription.trim() === ""
          ? video.description
          : newDescription.trim();

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
      await this.loadVideos();
    } catch (err) {
      this.log("Failed to edit video:", err.message);
      this.showError("Failed to edit video. Please try again later.");
    }
  }

  /**
   * Allows the user to delete (soft-delete) a video by marking it as deleted.
   */
  async handleDeleteVideo(index) {
    try {
      const videos = await nostrClient.fetchVideos();
      const video = videos[index];

      if (!this.pubkey) {
        this.showError("Please login to delete videos.");
        return;
      }
      if (video.pubkey !== this.pubkey) {
        this.showError("You do not own this video.");
        return;
      }

      if (
        !confirm(
          `Are you sure you want to delete "${video.title}"? This action cannot be undone.`
        )
      ) {
        return;
      }

      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        tags: video.tags,
      };

      await nostrClient.deleteVideo(originalEvent, this.pubkey);
      this.showSuccess("Video deleted (hidden) successfully!");
      await this.loadVideos();
    } catch (err) {
      this.log("Failed to delete video:", err.message);
      this.showError("Failed to delete video. Please try again later.");
    }
  }

  // NEW: Parse ?v=nevent after videos are loaded
  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const maybeNevent = urlParams.get("v");

    if (maybeNevent) {
      try {
        const decoded = window.NostrTools.nip19.decode(maybeNevent);
        if (decoded.type === "nevent" && decoded.data.id) {
          const eventId = decoded.data.id;

          // Fetch videos again (or rely on in-memory) and find a match
          nostrClient
            .fetchVideos()
            .then((allVideos) => {
              const matched = allVideos.find((v) => v.id === eventId);
              if (matched) {
                // We could directly call this.playVideo(matched.magnet),
                // but that can fail if magnet changed or is encrypted.
                // Instead, let's do a dedicated method:
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
      } catch (err) {
        console.error("Error decoding nevent:", err);
        this.showError("Invalid share link.");
      }
    }
  }

  // NEW: A helper to play by event ID so we don't rely on magnet string
  async playVideoByEventId(eventId) {
    try {
      const videos = await nostrClient.fetchVideos();
      const video = videos.find((v) => v.id === eventId);
      if (!video) {
        this.showError("Video not found.");
        return;
      }

      // Store as current video for sharing, etc.
      this.currentVideo = video;

      // If private + user owns it => decrypt once
      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        this.log("User owns a private video => decrypting magnet link...");
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      const finalMagnet = video.magnet;
      this.currentMagnetUri = finalMagnet;

      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");

      // Update the browser URL to keep the same path, just add ?v=...
      const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
      const newUrl =
        window.location.pathname + `?v=${encodeURIComponent(nevent)}`;
      window.history.pushState({}, "", newUrl);

      // Fetch creator profile
      let creatorProfile = {
        name: "Unknown",
        picture: `https://robohash.org/${video.pubkey}`,
      };
      try {
        const userEvents = await nostrClient.pool.list(nostrClient.relays, [
          {
            kinds: [0],
            authors: [video.pubkey],
            limit: 1,
          },
        ]);
        if (userEvents.length > 0 && userEvents[0]?.content) {
          const profile = JSON.parse(userEvents[0].content);
          creatorProfile = {
            name: profile.name || profile.display_name || "Unknown",
            picture: profile.picture || `https://robohash.org/${video.pubkey}`,
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
        if (downloaded)
          this.modalDownloaded.textContent = downloaded.textContent;
      }, 1000);
    } catch (error) {
      this.log("Error in playVideoByEventId:", error);
      this.showError(`Playback error: ${error.message}`);
    }
  }
}

export const app = new bitvidApp();
app.init();
window.app = app;
