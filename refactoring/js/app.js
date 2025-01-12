// js/app.js

import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode } from "./config.js";
import { disclaimerModal } from "./disclaimer.js";
import { videoPlayer } from "./components/VideoPlayer.js";
import { videoList } from "./components/VideoList.js";
import { formatTimeAgo } from "./utils/timeUtils.js";

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

    // Notification Containers
    this.errorContainer = document.getElementById("errorContainer");
    this.successContainer = document.getElementById("successContainer");

    this.pubkey = null;
    this.currentMagnetUri = null;

    // Private Video Checkbox
    this.isPrivateCheckbox = document.getElementById("isPrivate");
  }

  async init() {
    try {
      // Hide and reset player states
      if (this.playerSection) {
        this.playerSection.style.display = "none";
      }

      // Initialize Nostr client first
      await nostrClient.init();

      // Handle saved pubkey
      const savedPubKey = localStorage.getItem("userPubKey");
      if (savedPubKey) {
        this.login(savedPubKey, false);
      }

      // Initialize modal
      await videoPlayer.initModal();

      // Initialize video list
      await videoList.loadVideos();

      // Initialize and show disclaimer modal
      disclaimerModal.show();

      // Set up event listeners after all initializations
      this.setupEventListeners();
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
      // You might want to show this error to the user
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

  /**
   * Sets up event listeners for various UI interactions.
   */
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

    // Cleanup on page unload
    window.addEventListener("beforeunload", async () => {
      await this.cleanup();
    });
  }

  /**
   * Handles user login.
   */
  login(pubkey, saveToStorage = true) {
    this.pubkey = pubkey;
    this.loginButton.classList.add("hidden");
    this.logoutButton.classList.remove("hidden");
    this.userStatus.classList.remove("hidden");
    this.userPubKey.textContent = pubkey;
    this.videoFormContainer.classList.remove("hidden");
    this.log(`User logged in as: ${pubkey}`);

    // ADD: Update videoList pubkey
    videoList.setPubkey(pubkey);

    if (saveToStorage) {
      localStorage.setItem("userPubKey", pubkey);
    }
  }

  /**
   * Handles user logout.
   */
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

  /**
   * Cleans up video player and torrents.
   */
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
    }
  }

  /**
   * Hides the video player section.
   */
  async hideVideoPlayer() {
    await this.cleanup();
    this.playerSection.classList.add("hidden");
  }

  /**
   * Hides the video modal.
   */
  async hideModal() {
    await this.cleanup();
    this.playerModal.style.display = "none";
    this.playerModal.classList.add("hidden");
  }

  /**
   * Handles video submission (with version, private listing).
   */
  async handleSubmit(e) {
    e.preventDefault();

    if (!this.pubkey) {
      this.showError("Please login to post a video.");
      return;
    }

    const descriptionElement = document.getElementById("description");

    // ADDED FOR VERSIONING/PRIVATE/DELETE:
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

      // CHANGE: Use videoList component to refresh
      await videoList.loadVideos(); // <-- Change this line
      this.showSuccess("Video shared successfully!");
    } catch (error) {
      this.log("Failed to publish video:", error.message);
      this.showError("Failed to share video. Please try again later.");
    }
  }

  /**
   * Gets a user-friendly error message.
   */
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

  /**
   * Shows an error message to the user.
   */
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

  /**
   * Shows a success message to the user.
   */
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

  /**
   * Logs messages to console.
   */
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

      const decodedMagnet = decodeURIComponent(magnetURI);

      if (this.currentMagnetUri === decodedMagnet) {
        this.log("Same video requested - already playing");
        return;
      }
      this.currentMagnetUri = decodedMagnet;

      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");

      // Re-fetch the latest from relays
      const videos = await nostrClient.fetchVideos();
      const video = videos.find((v) => v.magnet === decodedMagnet);

      if (!video) {
        this.showError("Video data not found.");
        return;
      }

      // Decrypt only once if user owns it
      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        this.log("User owns a private video => decrypting magnet link...");
        video.magnet = fakeDecrypt(video.magnet);
        // Mark it so we don't do it again
        video.alreadyDecrypted = true;
      }

      const finalMagnet = video.magnet;

      // Profile fetch
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

        // Ensure userEvents isn't empty before accessing [0]
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
      this.videoTimestamp.textContent = formatTimeAgo(video.created_at);

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
   * We reuse the note's existing d tag via nostrClient.editVideo.
   */
  async handleEditVideo(index) {
    try {
      // CHANGE: Get videos through videoList component
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

      // Prompt for new fields or keep old
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

      // Ask user if they want the note private or public
      const wantPrivate = confirm("Make this video private? OK=Yes, Cancel=No");

      // Fallback to old if user typed nothing
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

      // Build final updated data
      const updatedData = {
        version: video.version || 2, // keep old version or set 2
        isPrivate: wantPrivate,
        title,
        magnet,
        thumbnail,
        description,
        mode: isDevMode ? "dev" : "live",
      };

      // Edit
      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        tags: video.tags,
      };
      await nostrClient.editVideo(originalEvent, updatedData, this.pubkey);
      this.showSuccess("Video updated successfully!");
      await videoList.loadVideos();
    } catch (err) {
      this.log("Failed to edit video:", err.message);
      this.showError("Failed to edit video. Please try again later.");
    }
  }

  /**
   * ADDED FOR VERSIONING/PRIVATE/DELETE:
   * Allows the user to delete (soft-delete) a video by marking it as deleted.
   */
  async handleDeleteVideo(index) {
    try {
      // CHANGE: Get videos through videoList component
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
      // CHANGE: Use videoList component to refresh
      await videoList.loadVideos();
    } catch (err) {
      this.log("Failed to delete video:", err.message);
      this.showError("Failed to delete video. Please try again later.");
    }
  }
}

export const app = new bitvidApp();
app.init();
window.app = app;
