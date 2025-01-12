// js/components/VideoPlayer.js

export class VideoPlayer {
  constructor() {
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
    this.currentMagnetUri = null;
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

      this.updateModalElements();
      await this.setupEventListeners();

      console.log("Modal initialization completed successfully");
      return true;
    } catch (error) {
      console.error("Modal initialization failed:", error);
      throw error;
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

    this.setupScrollBehavior();
  }

  setupScrollBehavior() {
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

  async setupEventListeners() {
    // Set up modal close handler
    if (this.closePlayerBtn) {
      this.closePlayerBtn.addEventListener("click", () => this.hide());
    }

    // Close Modal by clicking outside content
    if (this.playerModal) {
      this.playerModal.addEventListener("click", async (e) => {
        if (e.target === this.playerModal) {
          await this.hide();
        }
      });
    }

    // Video error handling
    if (this.modalVideo) {
      this.setupVideoEventListeners();
    }
  }

  setupVideoEventListeners() {
    this.modalVideo.addEventListener("error", (e) => {
      const error = e.target.error;
      console.log("Modal video error:", error);
      if (error) {
        console.log("Error code:", error.code);
        console.log("Error message:", error.message);
        // You'll need to implement showError or pass it as a callback
        // this.showError(`Video playback error: ${error.message || "Unknown error"}`);
      }
    });

    this.modalVideo.addEventListener("loadstart", () => {
      console.log("Video loadstart event fired");
    });

    this.modalVideo.addEventListener("loadedmetadata", () => {
      console.log("Video loadedmetadata event fired");
    });

    this.modalVideo.addEventListener("canplay", () => {
      console.log("Video canplay event fired");
    });
  }

  async hide() {
    await this.cleanup();
    if (this.playerModal) {
      this.playerModal.style.display = "none";
      this.playerModal.classList.add("hidden");
    }
  }

  async cleanup() {
    if (this.modalVideo) {
      this.modalVideo.pause();
      this.modalVideo.src = "";
      this.modalVideo.load();
    }
  }

  show() {
    if (this.playerModal) {
      this.playerModal.style.display = "flex";
      this.playerModal.classList.remove("hidden");
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
}

export const videoPlayer = new VideoPlayer();
