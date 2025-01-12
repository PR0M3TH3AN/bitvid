// js/components/VideoList.js
import { nostrClient } from "../nostr.js";
import { formatTimeAgo } from "../utils/timeUtils.js";
import { escapeHTML } from "../utils/htmlUtils.js";

export class VideoList {
  constructor() {
    this.videoList = document.getElementById("videoList");
    this.pubkey = null; // We'll need this for private video filtering
  }

  setPubkey(pubkey) {
    this.pubkey = pubkey;
  }

  async loadVideos() {
    console.log("Starting loadVideos...");
    try {
      const videos = await nostrClient.fetchVideos();
      console.log("Raw videos from nostrClient:", videos);

      if (!videos) {
        console.log("No videos received");
        throw new Error("No videos received from relays");
      }

      // Convert to array if not already
      const videosArray = Array.isArray(videos) ? videos : [videos];

      // Filter private videos
      const displayedVideos = videosArray.filter((video) => {
        if (!video.isPrivate) {
          return true;
        }
        return this.pubkey && video.pubkey === this.pubkey;
      });

      if (displayedVideos.length === 0) {
        console.log("No valid videos found after filtering.");
        this.renderEmptyState(
          "No public videos available yet. Be the first to upload one!"
        );
        return;
      }

      console.log("Processing filtered videos:", displayedVideos);
      await this.renderVideoList(displayedVideos);
      console.log(`Rendered ${displayedVideos.length} videos successfully`);
    } catch (error) {
      console.log("Failed to fetch videos:", error);
      this.renderEmptyState(
        "No videos available at the moment. Please try again later."
      );
    }
  }

  renderEmptyState(message) {
    if (this.videoList) {
      this.videoList.innerHTML = `
        <p class="text-center text-gray-500">
            ${escapeHTML(message)}
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

      if (!videos || videos.length === 0) {
        this.renderEmptyState("No videos found.");
        return;
      }

      // Sort by creation date
      const videoArray = [...videos].sort(
        (a, b) => b.created_at - a.created_at
      );

      // Fetch user profiles
      const userProfiles = await this.fetchUserProfiles(videoArray);

      // Build HTML for each video
      const renderedVideos = videoArray
        .map((video, index) => this.renderVideoCard(video, index, userProfiles))
        .filter(Boolean);

      if (renderedVideos.length === 0) {
        this.renderEmptyState("No valid videos to display.");
        return;
      }

      this.videoList.innerHTML = renderedVideos.join("");
      console.log("Videos rendered successfully");
    } catch (error) {
      console.error("Rendering error:", error);
      this.renderEmptyState("Error loading videos.");
    }
  }

  async fetchUserProfiles(videos) {
    const userProfiles = new Map();
    const uniquePubkeys = [...new Set(videos.map((v) => v.pubkey))];

    for (const pubkey of uniquePubkeys) {
      try {
        const profile = await nostrClient.fetchUserProfile(pubkey);
        userProfiles.set(pubkey, profile);
      } catch (error) {
        console.error(`Profile fetch error for ${pubkey}:`, error);
        userProfiles.set(pubkey, {
          name: "Unknown",
          picture: `https://robohash.org/${pubkey}`,
        });
      }
    }

    return userProfiles;
  }

  renderVideoCard(video, index, userProfiles) {
    try {
      if (!this.validateVideo(video, index)) {
        console.error(`Invalid video: ${video.title}`);
        return "";
      }

      const profile = userProfiles.get(video.pubkey) || {
        name: "Unknown",
        picture: `https://robohash.org/${video.pubkey}`,
      };

      const canEdit = video.pubkey === this.pubkey;
      const highlightClass =
        video.isPrivate && canEdit
          ? "border-2 border-yellow-500"
          : "border-none";

      return `
        <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${highlightClass}">
            ${this.renderThumbnail(video)}
            ${this.renderCardInfo(video, profile)}
        </div>
      `;
    } catch (error) {
      console.error(`Error processing video ${index}:`, error);
      return "";
    }
  }

  renderThumbnail(video) {
    return `
      <div 
        class="aspect-w-16 aspect-h-9 bg-gray-800 cursor-pointer relative group"
        onclick="window.app.playVideo('${encodeURIComponent(video.magnet)}')"
      >
        ${
          video.thumbnail
            ? this.renderThumbnailImage(video)
            : this.renderPlaceholderThumbnail()
        }
        <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300"></div>
      </div>
    `;
  }

  renderThumbnailImage(video) {
    return `
      <img
        src="${escapeHTML(video.thumbnail)}"
        alt="${escapeHTML(video.title)}"
        class="w-full h-full object-cover"
      >
    `;
  }

  renderPlaceholderThumbnail() {
    return `
      <div class="flex items-center justify-center h-full bg-gray-800">
        <svg class="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    `;
  }

  renderCardInfo(video, profile) {
    const timeAgo = formatTimeAgo(video.created_at);
    const canEdit = video.pubkey === this.pubkey;

    return `
      <div class="p-4">
        <h3 class="text-lg font-bold text-white line-clamp-2 hover:text-blue-400 cursor-pointer mb-3"
            onclick="window.app.playVideo('${encodeURIComponent(
              video.magnet
            )}')">
          ${escapeHTML(video.title)}
        </h3>
        
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
              <img src="${escapeHTML(profile.picture)}"
                   alt="${profile.name}"
                   class="w-full h-full object-cover">
            </div>
            <div class="min-w-0">
              <p class="text-sm text-gray-400 hover:text-gray-300 cursor-pointer">
                ${escapeHTML(profile.name)}
              </p>
              <div class="flex items-center text-xs text-gray-500 mt-1">
                <span>${timeAgo}</span>
              </div>
            </div>
          </div>
          ${this.renderGearMenu(video, canEdit)}
        </div>
      </div>
    `;
  }

  renderGearMenu(video, canEdit) {
    if (!canEdit) return "";

    return `
      <div class="relative inline-block ml-3 overflow-visible">
        <button type="button"
                class="inline-flex items-center p-2 rounded-full text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onclick="document.getElementById('settingsDropdown-${video.id}').classList.toggle('hidden')">
          <img src="assets/svg/video-settings-gear.svg" 
               alt="Settings"
               class="w-5 h-5"/>
        </button>
        <div id="settingsDropdown-${video.id}"
             class="hidden absolute right-0 bottom-full mb-2 w-32 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 z-50">
          <div class="py-1">
            <button class="block w-full text-left px-4 py-2 text-sm text-gray-100 hover:bg-gray-700"
                    onclick="app.handleEditVideo('${video.id}'); document.getElementById('settingsDropdown-${video.id}').classList.add('hidden');">
              Edit
            </button>
            <button class="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-700 hover:text-white"
                    onclick="app.handleDeleteVideo('${video.id}'); document.getElementById('settingsDropdown-${video.id}').classList.add('hidden');">
              Delete
            </button>
          </div>
        </div>
      </div>
    `;
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
}

export const videoList = new VideoList();
