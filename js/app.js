// js/app.js

import { loadView } from "./viewManager.js";
import { nostrClient } from "./nostr.js";
import { torrentClient } from "./webtorrent.js";
import { isDevMode } from "./config.js";
import disclaimerModal from "./disclaimer.js";
import { isWhitelistEnabled } from "./config.js";
import {
  initialWhitelist,
  initialBlacklist,
  initialEventBlacklist,
} from "./lists.js";

/**
 * Simple "decryption" placeholder for private videos.
 */
function fakeDecrypt(str) {
  return str.split("").reverse().join("");
}

/**
 * Simple IntersectionObserver-based lazy loader for images (or videos).
 *
 * Usage:
 *   const mediaLoader = new MediaLoader();
 *   mediaLoader.observe(imgElement);
 *
 * This will load the real image source from `imgElement.dataset.lazy`
 * once the image enters the viewport.
 */
class MediaLoader {
  constructor(rootMargin = "50px") {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target;
            const lazySrc = el.dataset.lazy;
            if (lazySrc) {
              el.src = lazySrc;
              delete el.dataset.lazy;
            }
            // Stop observing once loaded
            this.observer.unobserve(el);
          }
        }
      },
      { rootMargin }
    );
  }

  observe(el) {
    if (el.dataset.lazy) {
      this.observer.observe(el);
    }
  }

  disconnect() {
    this.observer.disconnect();
  }
}

class bitvidApp {
  constructor() {
    // Basic auth/display elements
    this.loginButton = document.getElementById("loginButton") || null;
    this.logoutButton = document.getElementById("logoutButton") || null;
    this.userStatus = document.getElementById("userStatus") || null;
    this.userPubKey = document.getElementById("userPubKey") || null;

    // Lazy-loading helper for images
    this.mediaLoader = new MediaLoader();

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

    // Hide/Show Subscriptions Link
    this.subscriptionsLink = null;

    // Notification containers
    this.errorContainer = document.getElementById("errorContainer") || null;
    this.successContainer = document.getElementById("successContainer") || null;

    // Auth state
    this.pubkey = null;
    this.currentMagnetUri = null;
    this.currentVideo = null;
    this.videoSubscription = null;

    // Videos stored as a Map (key=event.id)
    this.videosMap = new Map();
    // Simple cache for user profiles
    this.profileCache = new Map();

    // NEW: reference to the login modal's close button
    this.closeLoginModalBtn =
      document.getElementById("closeLoginModal") || null;

    // Build a set of blacklisted event IDs (hex) from nevent strings, skipping empties
    this.blacklistedEventIds = new Set();
    for (const neventStr of initialEventBlacklist) {
      // Skip any empty or obviously invalid strings
      if (!neventStr || neventStr.trim().length < 8) {
        continue;
      }
      try {
        const decoded = window.NostrTools.nip19.decode(neventStr);
        if (decoded.type === "nevent" && decoded.data.id) {
          this.blacklistedEventIds.add(decoded.data.id);
        }
      } catch (err) {
        console.error(
          "[bitvidApp] Invalid nevent in blacklist:",
          neventStr,
          err
        );
      }
    }
  }

  forceRefreshAllProfiles() {
    // 1) Grab the newest set of videos from nostrClient
    const activeVideos = nostrClient.getActiveVideos();

    // 2) Build a unique set of pubkeys
    const uniqueAuthors = new Set(activeVideos.map((v) => v.pubkey));

    // 3) For each author, fetchAndRenderProfile with forceRefresh = true
    for (const authorPubkey of uniqueAuthors) {
      this.fetchAndRenderProfile(authorPubkey, true);
    }
  }

  async init() {
    try {
      // Force update of any registered service workers to ensure latest code is used.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => registration.update());
        });
      }

      // 1. Initialize the video modal (components/video-modal.html)
      await this.initModal();
      this.updateModalElements();

      // 2. Initialize the upload modal (components/upload-modal.html)
      await this.initUploadModal();

      // 3. (Optional) Initialize the profile modal (components/profile-modal.html)
      await this.initProfileModal();

      // 4. Connect to Nostr
      await nostrClient.init();

      // Grab the "Subscriptions" link by its id in the sidebar
      this.subscriptionsLink = document.getElementById("subscriptionsLink");

      const savedPubKey = localStorage.getItem("userPubKey");
      if (savedPubKey) {
        // Auto-login if a pubkey was saved
        this.login(savedPubKey, false);

        // If the user was already logged in, show the Subscriptions link
        if (this.subscriptionsLink) {
          this.subscriptionsLink.classList.remove("hidden");
        }
      }

      // 5. Setup general event listeners, show disclaimers
      this.setupEventListeners();
      disclaimerModal.show();

      // 6) Load the default view ONLY if there's no #view= already
      if (!window.location.hash || !window.location.hash.startsWith("#view=")) {
        console.log(
          "[app.init()] No #view= in the URL, loading default home view"
        );
        await loadView("views/most-recent-videos.html");
      } else {
        console.log(
          "[app.init()] Found hash:",
          window.location.hash,
          "so skipping default load"
        );
      }

      // 7. Once loaded, get a reference to #videoList
      this.videoList = document.getElementById("videoList");

      // 8. Subscribe or fetch videos
      await this.loadVideos();

      // 9. Check URL ?v= param
      this.checkUrlParams();

      // Keep an array of active interval IDs so we can clear them on modal close
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

      // Instead of overwriting, we append a new DIV with the fetched HTML
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html; // set the markup
      modalContainer.appendChild(wrapper); // append the markup

      // Now we can safely find elements inside:
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

  updateModalElements() {
    // Existing references
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

    // The two elements we want to make clickable
    this.creatorAvatar = document.getElementById("creatorAvatar") || null;
    this.creatorName = document.getElementById("creatorName") || null;
    this.creatorNpub = document.getElementById("creatorNpub") || null;

    // Copy/Share buttons
    this.copyMagnetBtn = document.getElementById("copyMagnetBtn") || null;
    this.shareBtn = document.getElementById("shareBtn") || null;

    // Attach existing event listeners for copy/share
    if (this.copyMagnetBtn) {
      this.copyMagnetBtn.addEventListener("click", () => {
        this.handleCopyMagnet();
      });
    }
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

    // Add click handlers for avatar and name => channel profile
    if (this.creatorAvatar) {
      this.creatorAvatar.style.cursor = "pointer";
      this.creatorAvatar.addEventListener("click", () => {
        this.openCreatorChannel();
      });
    }
    if (this.creatorName) {
      this.creatorName.style.cursor = "pointer";
      this.creatorName.addEventListener("click", () => {
        this.openCreatorChannel();
      });
    }
  }

  goToProfile(pubkey) {
    if (!pubkey) {
      this.showError("No creator info available.");
      return;
    }
    try {
      const npub = window.NostrTools.nip19.npubEncode(pubkey);
      // Switch to channel profile view
      window.location.hash = `#view=channel-profile&npub=${npub}`;
    } catch (err) {
      console.error("Failed to go to channel:", err);
      this.showError("Could not open channel.");
    }
  }

  openCreatorChannel() {
    if (!this.currentVideo || !this.currentVideo.pubkey) {
      this.showError("No creator info available.");
      return;
    }

    try {
      // Encode the hex pubkey to npub
      const npub = window.NostrTools.nip19.npubEncode(this.currentVideo.pubkey);

      // Close the video modal
      this.hideModal();

      // Switch to channel profile view
      window.location.hash = `#view=channel-profile&npub=${npub}`;
    } catch (err) {
      console.error("Failed to open creator channel:", err);
      this.showError("Could not open channel.");
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
   * Setup general event listeners for logout, modals, etc.
   */
  setupEventListeners() {
    // 1) Logout button
    if (this.logoutButton) {
      this.logoutButton.addEventListener("click", () => {
        this.logout();
      });
    }

    // 2) Profile button
    if (this.profileButton) {
      this.profileButton.addEventListener("click", () => {
        if (this.profileModal) {
          this.profileModal.classList.remove("hidden");
        }
      });
    }

    // 3) Upload button => show upload modal
    if (this.uploadButton) {
      this.uploadButton.addEventListener("click", () => {
        if (this.uploadModal) {
          this.uploadModal.classList.remove("hidden");
        }
      });
    }

    // 4) Login button => show the login modal
    if (this.loginButton) {
      this.loginButton.addEventListener("click", () => {
        console.log("Login button clicked!");
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.remove("hidden");
        }
      });
    }

    // 5) Close login modal button => hide modal
    if (this.closeLoginModalBtn) {
      this.closeLoginModalBtn.addEventListener("click", () => {
        console.log("[app.js] closeLoginModal button clicked!");
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.add("hidden");
        }
      });
    }

    // 6) NIP-07 button inside the login modal => call the extension & login
    const nip07Button = document.getElementById("loginNIP07");
    if (nip07Button) {
      nip07Button.addEventListener("click", async () => {
        console.log(
          "[app.js] loginNIP07 clicked! Attempting extension login..."
        );
        try {
          const pubkey = await nostrClient.login(); // call the extension
          console.log("[NIP-07] login returned pubkey:", pubkey);
          this.login(pubkey, true);

          // Hide the login modal
          const loginModal = document.getElementById("loginModal");
          if (loginModal) {
            loginModal.classList.add("hidden");
          }
        } catch (err) {
          console.error("[NIP-07 login error]", err);
          this.showError("Failed to login with NIP-07. Please try again.");
        }
      });
    }

    // 7) Cleanup on page unload
    window.addEventListener("beforeunload", async () => {
      await this.cleanup();
    });

    // 8) Handle back/forward navigation => hide video modal
    window.addEventListener("popstate", async () => {
      console.log("[popstate] user navigated back/forward; cleaning modal...");
      await this.hideModal();
    });

    // 9) Event delegation on the video list container for playing videos
    if (this.videoList) {
      this.videoList.addEventListener("click", (event) => {
        const magnetTrigger = event.target.closest("[data-play-magnet]");
        if (magnetTrigger) {
          // For a normal left-click (button 0, no Ctrl/Cmd), prevent navigation:
          if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault(); // Stop browser from following the href
            const magnet = magnetTrigger.dataset.playMagnet;
            this.playVideo(magnet);
          }
        }
      });
    }

    // 10) Event delegation for the “Application Form” button inside the login modal
    document.addEventListener("click", (event) => {
      if (event.target && event.target.id === "openApplicationModal") {
        // Hide the login modal
        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.classList.add("hidden");
        }
        // Show the application modal
        const appModal = document.getElementById("nostrFormModal");
        if (appModal) {
          appModal.classList.remove("hidden");
        }
      }
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
      let picture = "assets/svg/default-profile.svg";

      if (events.length && events[0].content) {
        const data = JSON.parse(events[0].content);
        displayName = data.name || data.display_name || "User";
        picture = data.picture || "assets/svg/default-profile.svg";
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

  async fetchAndRenderProfile(pubkey, forceRefresh = false) {
    const now = Date.now();

    // 1) Check if we have a cached entry
    const cacheEntry = this.profileCache.get(pubkey);
    if (!forceRefresh && cacheEntry && now - cacheEntry.timestamp < 60000) {
      // If it's less than 60 seconds old, just update DOM with it
      this.updateProfileInDOM(pubkey, cacheEntry.profile);
      return;
    }

    // 2) Otherwise, fetch from Nostr
    try {
      const userEvents = await nostrClient.pool.list(nostrClient.relays, [
        { kinds: [0], authors: [pubkey], limit: 1 },
      ]);
      if (userEvents.length > 0 && userEvents[0].content) {
        const data = JSON.parse(userEvents[0].content);
        const profile = {
          name: data.name || data.display_name || "Unknown",
          picture: data.picture || "assets/svg/default-profile.svg",
        };

        // Cache it
        this.profileCache.set(pubkey, { profile, timestamp: now });
        // Update DOM
        this.updateProfileInDOM(pubkey, profile);
      }
    } catch (err) {
      console.error("Profile fetch error:", err);
    }
  }

  async batchFetchProfiles(authorSet) {
    const pubkeys = Array.from(authorSet);
    if (!pubkeys.length) return;

    const filter = {
      kinds: [0],
      authors: pubkeys,
      limit: pubkeys.length,
    };

    try {
      // Query each relay
      const results = await Promise.all(
        nostrClient.relays.map((relayUrl) =>
          nostrClient.pool.list([relayUrl], [filter])
        )
      );
      const allProfileEvents = results.flat();

      // Keep only the newest per author
      const newestEvents = new Map();
      for (const evt of allProfileEvents) {
        if (
          !newestEvents.has(evt.pubkey) ||
          evt.created_at > newestEvents.get(evt.pubkey).created_at
        ) {
          newestEvents.set(evt.pubkey, evt);
        }
      }

      // Update the cache & DOM
      for (const [pubkey, evt] of newestEvents.entries()) {
        try {
          const data = JSON.parse(evt.content);
          const profile = {
            name: data.name || data.display_name || "Unknown",
            picture: data.picture || "assets/svg/default-profile.svg",
          };
          this.profileCache.set(pubkey, { profile, timestamp: Date.now() });
          this.updateProfileInDOM(pubkey, profile);
        } catch (err) {
          console.error("Profile parse error:", err);
        }
      }
    } catch (err) {
      console.error("Batch profile fetch error:", err);
    }
  }

  updateProfileInDOM(pubkey, profile) {
    // For any .author-pic[data-pubkey=...]
    const picEls = document.querySelectorAll(
      `.author-pic[data-pubkey="${pubkey}"]`
    );
    picEls.forEach((el) => {
      el.src = profile.picture;
    });
    // For any .author-name[data-pubkey=...]
    const nameEls = document.querySelectorAll(
      `.author-name[data-pubkey="${pubkey}"]`
    );
    nameEls.forEach((el) => {
      el.textContent = profile.name;
    });
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
      // isPrivate: privEl?.checked || false,
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

      // *** Refresh to show the newly uploaded video in the grid ***
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
  async login(pubkey, saveToStorage = true) {
    console.log("[app.js] login() called with pubkey =", pubkey);

    this.pubkey = pubkey;

    // Hide login button if present
    if (this.loginButton) {
      this.loginButton.classList.add("hidden");
    }
    // Optionally hide logout or userStatus
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

    // Show the "Subscriptions" link if it exists
    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.remove("hidden");
    }

    // (Optional) load the user's own Nostr profile
    this.loadOwnProfile(pubkey);

    // Save pubkey locally if requested
    if (saveToStorage) {
      localStorage.setItem("userPubKey", pubkey);
    }

    // Refresh the video list so the user sees any private videos, etc.
    await this.loadVideos();

    // Force a fresh fetch of all profile pictures/names
    this.forceRefreshAllProfiles();
  }

  /**
   * Logout logic
   */
  async logout() {
    nostrClient.logout();
    this.pubkey = null;

    // Show the login button again
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

    // Hide the Subscriptions link
    if (this.subscriptionsLink) {
      this.subscriptionsLink.classList.add("hidden");
    }

    // Clear localStorage
    localStorage.removeItem("userPubKey");

    // Refresh the video list so user sees only public videos again
    await this.loadVideos();

    // Force a fresh fetch of all profile pictures/names (public ones in this case)
    this.forceRefreshAllProfiles();
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
    // 1) Clear intervals, cleanup, etc. (unchanged)
    if (this.activeIntervals && this.activeIntervals.length) {
      this.activeIntervals.forEach((id) => clearInterval(id));
      this.activeIntervals = [];
    }

    try {
      await fetch("/webtorrent/cancel/", { mode: "no-cors" });
    } catch (err) {
      // ignore
    }
    await this.cleanup();

    // 2) Hide the modal
    if (this.playerModal) {
      this.playerModal.style.display = "none";
      this.playerModal.classList.add("hidden");
    }
    this.currentMagnetUri = null;

    // 3) Remove only `?v=` but **keep** the hash
    const url = new URL(window.location.href);
    url.searchParams.delete("v"); // remove ?v= param
    const newUrl = url.pathname + url.search + url.hash;
    window.history.replaceState({}, "", newUrl);
  }

  /**
   * Subscribe to videos (older + new) and render them as they come in.
   */
  async loadVideos(forceFetch = false) {
    console.log("Starting loadVideos... (forceFetch =", forceFetch, ")");

    // If forceFetch is true, unsubscribe from the old subscription to start fresh
    if (forceFetch && this.videoSubscription) {
      // Call unsubscribe on the subscription object directly.
      this.videoSubscription.unsub();
      this.videoSubscription = null;
    }

    // The rest of your existing logic:
    if (!this.videoSubscription) {
      if (this.videoList) {
        this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
          Loading videos as they arrive...
        </p>`;
      }

      // Create a new subscription
      this.videoSubscription = nostrClient.subscribeVideos(() => {
        const updatedAll = nostrClient.getActiveVideos();

        // Filter out blacklisted authors & blacklisted event IDs
        const filteredVideos = updatedAll.filter((video) => {
          // 1) If the event ID is in our blacklistedEventIds set, skip
          if (this.blacklistedEventIds.has(video.id)) {
            return false;
          }

          // 2) Check if the author's npub is in initialBlacklist
          const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
          if (initialBlacklist.includes(authorNpub)) {
            return false;
          }

          // 3) If whitelist mode is enabled, only keep authors in initialWhitelist
          if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
            return false;
          }

          return true;
        });

        this.renderVideoList(filteredVideos);
      });

      if (this.videoSubscription) {
        console.log(
          "[loadVideos] subscription remains open to get live updates."
        );
      }
    } else {
      // Already subscribed: just show what's cached
      const allCached = nostrClient.getActiveVideos();

      const filteredCached = allCached.filter((video) => {
        if (this.blacklistedEventIds.has(video.id)) {
          return false;
        }

        const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
        if (initialBlacklist.includes(authorNpub)) {
          return false;
        }

        if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
          return false;
        }

        return true;
      });

      this.renderVideoList(filteredCached);
    }
  }

  async loadOlderVideos(lastTimestamp) {
    // 1) Use nostrClient to fetch older slices
    const olderVideos = await nostrClient.fetchOlderVideos(lastTimestamp);

    if (!olderVideos || olderVideos.length === 0) {
      this.showSuccess("No more older videos found.");
      return;
    }

    // 2) Merge them into the client’s allEvents / activeMap
    for (const v of olderVideos) {
      nostrClient.allEvents.set(v.id, v);
      // If it’s the newest version for its root, update activeMap
      const rootKey = v.videoRootId || v.id;
      // You can call getActiveKey(v) if you want to match your code’s approach.
      // Then re-check if this one is newer than what’s stored, etc.
    }

    // 3) Re-render
    const all = nostrClient.getActiveVideos();
    this.renderVideoList(all);
  }

  /**
   * Returns true if there's at least one strictly older version
   * (same videoRootId, created_at < current) which is NOT deleted.
   */
  hasOlderVersion(video, allEvents) {
    if (!video || !video.videoRootId) return false;

    const rootId = video.videoRootId;
    const currentTs = video.created_at;

    // among ALL known events (including overshadowed), find older, not deleted
    const olderMatches = allEvents.filter(
      (v) => v.videoRootId === rootId && v.created_at < currentTs && !v.deleted
    );
    return olderMatches.length > 0;
  }

  async renderVideoList(videos) {
    if (!this.videoList) return;

    // 1) If no videos
    if (!videos || videos.length === 0) {
      this.videoList.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-gray-500">
          No public videos available yet. Be the first to upload one!
        </p>`;
      return;
    }

    // 2) Sort newest first
    videos.sort((a, b) => b.created_at - a.created_at);

    const fullAllEventsArray = Array.from(nostrClient.allEvents.values());
    const fragment = document.createDocumentFragment();
    const authorSet = new Set();

    // 3) Build each card
    videos.forEach((video, index) => {
      if (!video.id || !video.title) {
        console.error("Video missing ID/title:", video);
        return;
      }

      authorSet.add(video.pubkey);

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

      // Check if there's an older version
      let hasOlder = false;
      if (canEdit && video.videoRootId) {
        hasOlder = this.hasOlderVersion(video, fullAllEventsArray);
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

      const cardHtml = `
        <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass}">
          <!-- The clickable link to play video -->
          <a
            href="${shareUrl}"
            data-play-magnet="${encodeURIComponent(video.magnet)}"
            class="block cursor-pointer relative group"
          >
            <div class="ratio-16-9">
              <img
                src="assets/jpg/video-thumbnail-fallback.jpg"
                data-lazy="${this.escapeHTML(video.thumbnail)}"
                alt="${this.escapeHTML(video.title)}"
              />
            </div>
          </a>
          <div class="p-4">
            <!-- Title triggers the video modal as well -->
            <h3
              class="text-lg font-bold text-white line-clamp-2 hover:text-blue-400 cursor-pointer mb-3"
              data-play-magnet="${encodeURIComponent(video.magnet)}"
            >
              ${this.escapeHTML(video.title)}
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
                    <!-- We removed the 'Channel' button here -->
                  </div>
                </div>
              </div>
              ${gearMenu}
            </div>
          </div>
        </div>
      `;

      const template = document.createElement("template");
      template.innerHTML = cardHtml.trim();
      const cardEl = template.content.firstElementChild;
      fragment.appendChild(cardEl);
    });

    // Clear old content, add new
    this.videoList.innerHTML = "";
    this.videoList.appendChild(fragment);

    // Lazy-load images
    const lazyEls = this.videoList.querySelectorAll("[data-lazy]");
    lazyEls.forEach((el) => this.mediaLoader.observe(el));

    // GEAR MENU / button event listeners...
    const gearButtons = this.videoList.querySelectorAll(
      "[data-settings-dropdown]"
    );
    gearButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = button.getAttribute("data-settings-dropdown");
        const dropdown = document.getElementById(`settingsDropdown-${index}`);
        if (dropdown) {
          dropdown.classList.toggle("hidden");
        }
      });
    });

    // Edit button
    const editButtons = this.videoList.querySelectorAll("[data-edit-index]");
    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = button.getAttribute("data-edit-index");
        const dropdown = document.getElementById(`settingsDropdown-${index}`);
        if (dropdown) dropdown.classList.add("hidden");
        this.handleEditVideo(index);
      });
    });

    // Revert button
    const revertButtons = this.videoList.querySelectorAll(
      "[data-revert-index]"
    );
    revertButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = button.getAttribute("data-revert-index");
        const dropdown = document.getElementById(`settingsDropdown-${index}`);
        if (dropdown) dropdown.classList.add("hidden");
        this.handleRevertVideo(index);
      });
    });

    // Delete All button
    const deleteAllButtons = this.videoList.querySelectorAll(
      "[data-delete-all-index]"
    );
    deleteAllButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = button.getAttribute("data-delete-all-index");
        const dropdown = document.getElementById(`settingsDropdown-${index}`);
        if (dropdown) dropdown.classList.add("hidden");
        this.handleFullDeleteVideo(index);
      });
    });

    // 2) After building cards, do one batch profile fetch
    this.batchFetchProfiles(authorSet);

    // === NEW: attach click listeners to .author-pic and .author-name
    const authorPics = this.videoList.querySelectorAll(".author-pic");
    authorPics.forEach((pic) => {
      pic.style.cursor = "pointer";
      pic.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation(); // avoids playing the video
        const pubkey = pic.getAttribute("data-pubkey");
        this.goToProfile(pubkey);
      });
    });

    const authorNames = this.videoList.querySelectorAll(".author-name");
    authorNames.forEach((nameEl) => {
      nameEl.style.cursor = "pointer";
      nameEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation(); // avoids playing the video
        const pubkey = nameEl.getAttribute("data-pubkey");
        this.goToProfile(pubkey);
      });
    });
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
      // 1) Fetch the current list of videos (the newest versions)
      const all = await nostrClient.fetchVideos();
      const video = all[index];

      // 2) Basic ownership checks
      if (!this.pubkey) {
        this.showError("Please login to edit videos.");
        return;
      }
      if (!video || video.pubkey !== this.pubkey) {
        this.showError("You do not own this video.");
        return;
      }

      // 3) Prompt the user for updated fields
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
      // const wantPrivate = confirm("Make this video private? OK=Yes, Cancel=No");

      // 4) Build final updated fields (or fallback to existing)
      const title =
        !newTitle || !newTitle.trim() ? video.title : newTitle.trim();
      const magnet =
        !newMagnet || !newMagnet.trim() ? video.magnet : newMagnet.trim();
      const thumbnail =
        !newThumb || !newThumb.trim() ? video.thumbnail : newThumb.trim();
      const description =
        !newDesc || !newDesc.trim() ? video.description : newDesc.trim();

      // 5) Create an object with the new data
      const updatedData = {
        version: video.version || 2,
        // isPrivate: wantPrivate,
        title,
        magnet,
        thumbnail,
        description,
        mode: isDevMode ? "dev" : "live",
      };

      // 6) Build the originalEvent stub, now including videoRootId to avoid extra fetch
      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        videoRootId: video.videoRootId, // <-- pass this if it exists
      };

      // 7) Call the editVideo method
      await nostrClient.editVideo(originalEvent, updatedData, this.pubkey);

      // 8) Refresh local UI
      await this.loadVideos();

      // 8.1) Purge the outdated cache
      this.videosMap.clear();

      this.showSuccess("Video updated successfully!");

      // 9) Also refresh all profile caches so any new name/pic changes are reflected
      this.forceRefreshAllProfiles();
    } catch (err) {
      console.error("Failed to edit video:", err);
      this.showError("Failed to edit video. Please try again.");
    }
  }

  async handleRevertVideo(index) {
    try {
      // 1) Still use fetchVideos to get the video in question
      const activeVideos = await nostrClient.fetchVideos();
      const video = activeVideos[index];

      if (!this.pubkey) {
        this.showError("Please login to revert.");
        return;
      }
      if (!video || video.pubkey !== this.pubkey) {
        this.showError("You do not own this video.");
        return;
      }

      // 2) Grab all known events so older overshadowed ones are included
      const allEvents = Array.from(nostrClient.allEvents.values());

      // 3) Check for older versions among *all* events, not just the active ones
      if (!this.hasOlderVersion(video, allEvents)) {
        this.showError("No older version exists to revert to.");
        return;
      }

      if (!confirm(`Revert current version of "${video.title}"?`)) {
        return;
      }

      const originalEvent = {
        id: video.id,
        pubkey: video.pubkey,
        tags: video.tags,
      };

      await nostrClient.revertVideo(originalEvent, this.pubkey);

      await this.loadVideos();
      this.showSuccess("Current version reverted successfully!");
      this.forceRefreshAllProfiles();
    } catch (err) {
      console.error("Failed to revert video:", err);
      this.showError("Failed to revert video. Please try again.");
    }
  }

  /**
   * Handle "Delete Video" from gear menu.
   */
  async handleFullDeleteVideo(index) {
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
      // Make sure the user is absolutely sure:
      if (
        !confirm(
          `Delete ALL versions of "${video.title}"? This action is permanent.`
        )
      ) {
        return;
      }

      // We assume video.videoRootId is not empty, or fallback to video.id if needed
      const rootId = video.videoRootId || video.id;

      await nostrClient.deleteAllVersions(rootId, this.pubkey);

      // Reload
      await this.loadVideos();
      this.showSuccess("All versions deleted successfully!");
      this.forceRefreshAllProfiles();
    } catch (err) {
      console.error("Failed to delete all versions:", err);
      this.showError("Failed to delete all versions. Please try again.");
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
    // 1) Event-level blacklist check
    if (this.blacklistedEventIds.has(eventId)) {
      this.showError("This content has been removed or is not allowed.");
      return;
    }

    try {
      // Attempt to get the video from local cache or fetch
      let video = this.videosMap.get(eventId);
      if (!video) {
        video = await this.getOldEventById(eventId);
      }
      if (!video) {
        this.showError("Video not found.");
        return;
      }

      // 2) Author-level blacklist check
      const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (initialBlacklist.includes(authorNpub)) {
        this.showError("This content has been removed or is not allowed.");
        return;
      }

      // 3) Whitelist check if enabled
      if (isWhitelistEnabled && !initialWhitelist.includes(authorNpub)) {
        this.showError("This content is not from a whitelisted author.");
        return;
      }

      // Handle private videos (decrypt if owner is the current user)
      if (
        video.isPrivate &&
        video.pubkey === this.pubkey &&
        !video.alreadyDecrypted
      ) {
        video.magnet = fakeDecrypt(video.magnet);
        video.alreadyDecrypted = true;
      }

      this.currentVideo = video;
      this.currentMagnetUri = video.magnet;
      this.showModalWithPoster();

      // Update ?v= param in the URL
      const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
      const newUrl = `${window.location.pathname}?v=${encodeURIComponent(
        nevent
      )}`;
      window.history.pushState({}, "", newUrl);

      // Fetch author profile
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

      // Update UI fields
      const creatorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (this.videoTitle) {
        this.videoTitle.textContent = video.title || "Untitled";
      }
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

      // Cleanup any previous WebTorrent streams, then start a fresh one
      await torrentClient.cleanup();
      const cacheBustedMagnet = video.magnet + "&ts=" + Date.now();
      this.log("Starting video stream with:", cacheBustedMagnet);

      // Autoplay preferences
      const storedUnmuted = localStorage.getItem("unmutedAutoplay");
      const userWantsUnmuted = storedUnmuted === "true";
      this.modalVideo.muted = !userWantsUnmuted;

      this.modalVideo.addEventListener("volumechange", () => {
        localStorage.setItem(
          "unmutedAutoplay",
          (!this.modalVideo.muted).toString()
        );
      });

      const realTorrent = await torrentClient.streamVideo(
        cacheBustedMagnet,
        this.modalVideo
      );

      // Try playing; if autoplay fails, fallback to muted
      this.modalVideo.play().catch((err) => {
        this.log("Autoplay failed:", err);
        if (!this.modalVideo.muted) {
          this.log("Falling back to muted autoplay.");
          this.modalVideo.muted = true;
          this.modalVideo.play().catch((err2) => {
            this.log("Muted autoplay also failed:", err2);
          });
        }
      });

      // Update torrent stats every 3s
      const updateInterval = setInterval(() => {
        if (!document.body.contains(this.modalVideo)) {
          clearInterval(updateInterval);
          return;
        }
        this.updateTorrentStatus(realTorrent);
      }, 3000);
      this.activeIntervals.push(updateInterval);

      // Mirror stats into the modal if needed
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
      }, 3000);
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

    // 2) Already in nostrClient.allEvents?
    //    (assuming nostrClient.allEvents is a Map of id => video)
    const fromAll = nostrClient.allEvents.get(eventId);
    if (fromAll && !fromAll.deleted) {
      this.videosMap.set(eventId, fromAll);
      return fromAll;
    }

    // 3) Direct single-event fetch (fewer resources than full fetchVideos)
    const single = await nostrClient.getEventById(eventId);
    if (single && !single.deleted) {
      this.videosMap.set(single.id, single);
      return single;
    }

    // 4) If you wanted a final fallback, you could do it here:
    //    But it's typically better to avoid repeated full fetches
    // console.log("Falling back to full fetchVideos...");
    // const allFetched = await nostrClient.fetchVideos();
    // video = allFetched.find(v => v.id === eventId && !v.deleted);
    // if (video) {
    //   this.videosMap.set(video.id, video);
    //   return video;
    // }

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
