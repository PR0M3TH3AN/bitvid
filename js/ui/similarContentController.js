import { devLogger } from "../utils/logger.js";
import { collectVideoTags } from "../utils/videoTags.js";
import { ALLOW_NSFW_CONTENT } from "../config.js";
import resolveVideoPointer from "../utils/videoPointer.js";

/**
 * Controller for managing "Similar Content" logic and updates for the video modal.
 */
export default class SimilarContentController {
  constructor({
    services = {},
    callbacks = {},
    ui = {},
    state = {},
    helpers = {}
  }) {
    this.services = services;
    this.callbacks = callbacks;
    this.ui = ui;
    this.state = state;
    this.helpers = helpers;
  }

  extractDTagValue(tags) {
    if (!Array.isArray(tags)) {
      return "";
    }
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      if (tag[0] === "d" && typeof tag[1] === "string") {
        return tag[1];
      }
    }
    return "";
  }

  deriveVideoPointerInfo(video) {
    if (!video || typeof video !== "object") {
      return null;
    }

    const dTagValue = (this.extractDTagValue(video.tags) || "").trim();

    return resolveVideoPointer({
      kind: video.kind,
      pubkey: video.pubkey,
      videoRootId: video.videoRootId,
      dTag: dTagValue,
      fallbackEventId: video.id,
      relay: video.relay,
    });
  }

  computeCandidates({ activeVideo, maxItems = 5 } = {}) {
    const decorateCandidate = (video) => {
      if (!video || typeof video !== "object") {
        return video;
      }
      let decoratedVideo = video;
      if (typeof this.callbacks.decorateVideoModeration === "function") {
        try {
          const decorated = this.callbacks.decorateVideoModeration(video);
          if (decorated && typeof decorated === "object") {
            decoratedVideo = decorated;
          }
        } catch (error) {
          devLogger.warn(
            "[SimilarContentController] Failed to decorate similar content candidate",
            error,
          );
        }
      }
      if (typeof this.callbacks.decorateVideoCreatorIdentity === "function") {
        try {
          const identityDecorated = this.callbacks.decorateVideoCreatorIdentity(
            decoratedVideo,
          );
          if (identityDecorated && typeof identityDecorated === "object") {
            decoratedVideo = identityDecorated;
          }
        } catch (error) {
          devLogger.warn(
            "[SimilarContentController] Failed to decorate similar content identity",
            error,
          );
        }
      }
      return decoratedVideo;
    };

    const target = activeVideo && typeof activeVideo === "object" ? decorateCandidate(activeVideo) : null;
    if (!target) {
      return [];
    }

    const activeTagsSource = Array.isArray(target.displayTags) && target.displayTags.length
      ? target.displayTags
      : collectVideoTags(target);

    const activeTagSet = new Set();
    for (const tag of activeTagsSource) {
      if (typeof tag !== "string") {
        continue;
      }
      const normalized = tag.trim().toLowerCase();
      if (normalized) {
        activeTagSet.add(normalized);
      }
    }

    if (activeTagSet.size === 0) {
      return [];
    }

    const limit = Number.isFinite(maxItems) && maxItems > 0
      ? Math.max(1, Math.floor(maxItems))
      : 5;

    let candidateSource = [];
    const videoListView = this.state.getVideoListView ? this.state.getVideoListView() : null;
    const videosMap = this.state.getVideosMap ? this.state.getVideosMap() : null;
    const nostrClient = this.services.nostrClient;

    if (videoListView && Array.isArray(videoListView.currentVideos) && videoListView.currentVideos.length) {
      candidateSource = videoListView.currentVideos;
    } else if (videosMap instanceof Map && videosMap.size) {
      candidateSource = Array.from(videosMap.values());
    } else if (nostrClient && typeof nostrClient.getActiveVideos === "function") {
      try {
        const activeVideos = nostrClient.getActiveVideos();
        if (Array.isArray(activeVideos)) {
          candidateSource = activeVideos;
        }
      } catch (error) {
        devLogger.warn("[SimilarContentController] Failed to read active videos for similar content:", error);
      }
    }

    if (!Array.isArray(candidateSource) || candidateSource.length === 0) {
      return [];
    }

    const activeId = typeof target.id === "string" ? target.id : "";
    const activePointerKey = typeof target.pointerKey === "string" ? target.pointerKey : "";
    const seenKeys = new Set();
    if (activeId) {
      const normalizedId = activeId.trim().toLowerCase();
      if (normalizedId) {
        seenKeys.add(normalizedId);
      }
    }
    if (activePointerKey) {
      const normalizedPointer = activePointerKey.trim().toLowerCase();
      if (normalizedPointer) {
        seenKeys.add(normalizedPointer);
      }
    }

    const results = [];

    for (const candidate of candidateSource) {
      const decoratedCandidate = decorateCandidate(candidate);
      if (!decoratedCandidate || typeof decoratedCandidate !== "object") {
        continue;
      }
      if (decoratedCandidate === target) {
        continue;
      }

      const candidateId = typeof decoratedCandidate.id === "string" ? decoratedCandidate.id : "";
      if (candidateId && candidateId === activeId) {
        continue;
      }
      if (decoratedCandidate.deleted === true) {
        continue;
      }
      if (decoratedCandidate.isPrivate === true) {
        continue;
      }
      if (decoratedCandidate.isNsfw === true && ALLOW_NSFW_CONTENT !== true) {
        continue;
      }

      const candidatePubkey = typeof decoratedCandidate.pubkey === "string" ? decoratedCandidate.pubkey : "";
      if (candidatePubkey && typeof this.callbacks.isAuthorBlocked === "function" && this.callbacks.isAuthorBlocked(candidatePubkey)) {
        continue;
      }

      const candidateTagsSource = Array.isArray(decoratedCandidate.displayTags) && decoratedCandidate.displayTags.length
        ? decoratedCandidate.displayTags
        : collectVideoTags(decoratedCandidate);
      if (!Array.isArray(candidateTagsSource) || candidateTagsSource.length === 0) {
        continue;
      }

      const candidateTagSet = new Set();
      for (const tag of candidateTagsSource) {
        if (typeof tag !== "string") {
          continue;
        }
        const normalized = tag.trim().toLowerCase();
        if (normalized) {
          candidateTagSet.add(normalized);
        }
      }

      if (candidateTagSet.size === 0) {
        continue;
      }

      let sharedCount = 0;
      for (const tag of candidateTagSet) {
        if (activeTagSet.has(tag)) {
          sharedCount += 1;
        }
      }

      if (sharedCount === 0) {
        continue;
      }

      const pointerInfo = this.deriveVideoPointerInfo(candidate);
      const pointerKey = typeof candidate.pointerKey === "string" && candidate.pointerKey.trim()
        ? candidate.pointerKey.trim()
        : typeof pointerInfo?.key === "string" && pointerInfo.key
          ? pointerInfo.key
          : "";

      const dedupeKeyRaw = (candidateId || pointerKey || "").trim();
      if (dedupeKeyRaw) {
        const dedupeKey = dedupeKeyRaw.toLowerCase();
        if (seenKeys.has(dedupeKey)) {
          continue;
        }
        seenKeys.add(dedupeKey);
      }

      if (!Array.isArray(candidate.displayTags) || candidate.displayTags.length === 0) {
        candidate.displayTags = Array.isArray(candidateTagsSource)
          ? candidateTagsSource.slice()
          : [];
      }

      let postedAt = null;
      if (typeof this.helpers.getKnownVideoPostedAt === "function") {
          postedAt = this.helpers.getKnownVideoPostedAt(decoratedCandidate);
      }
      if (!Number.isFinite(postedAt) && Number.isFinite(decoratedCandidate.rootCreatedAt)) {
        postedAt = Math.floor(decoratedCandidate.rootCreatedAt);
      }
      if (!Number.isFinite(postedAt) && Number.isFinite(decoratedCandidate.created_at)) {
        postedAt = Math.floor(decoratedCandidate.created_at);
      }
      if (!Number.isFinite(postedAt)) {
        postedAt = null;
      }

      let shareUrl = "";
      if (typeof decoratedCandidate.shareUrl === "string" && decoratedCandidate.shareUrl.trim()) {
        shareUrl = decoratedCandidate.shareUrl.trim();
      } else if (candidateId && typeof this.helpers.buildShareUrlFromEventId === "function") {
        shareUrl = this.helpers.buildShareUrlFromEventId(candidateId) || "";
      }

      results.push({
        video: decoratedCandidate,
        pointerInfo: pointerInfo || null,
        shareUrl,
        postedAt,
        sharedTagCount: sharedCount,
      });
    }

    if (results.length === 0) {
      return [];
    }

    results.sort((a, b) => {
      if (b.sharedTagCount !== a.sharedTagCount) {
        return b.sharedTagCount - a.sharedTagCount;
      }
      const tsA = Number.isFinite(a.postedAt) ? a.postedAt : 0;
      const tsB = Number.isFinite(b.postedAt) ? b.postedAt : 0;
      return tsB - tsA;
    });

    return results.slice(0, limit).map((entry) => {
      const normalizedPostedAt = Number.isFinite(entry.postedAt)
        ? Math.floor(entry.postedAt)
        : null;
      const timeAgo = normalizedPostedAt !== null && typeof this.helpers.formatTimeAgo === "function"
        ? this.helpers.formatTimeAgo(normalizedPostedAt)
        : "";
      return {
        video: entry.video,
        pointerInfo: entry.pointerInfo,
        shareUrl: entry.shareUrl,
        postedAt: normalizedPostedAt,
        timeAgo,
        sharedTagCount: entry.sharedTagCount,
      };
    });
  }

  updateModal({ activeVideo, maxItems } = {}) {
    if (!this.ui.videoModal) {
      return;
    }

    const target = activeVideo && typeof activeVideo === "object" ? activeVideo : null;
    if (!target) {
      if (typeof this.ui.videoModal.clearSimilarContent === "function") {
        this.ui.videoModal.clearSimilarContent();
      }
      return;
    }

    const matches = this.computeCandidates({ activeVideo: target, maxItems });
    if (matches.length > 0) {
      if (typeof this.ui.videoModal.setSimilarContent === "function") {
        this.ui.videoModal.setSimilarContent(matches);
      }
      return;
    }

    if (typeof this.ui.videoModal.clearSimilarContent === "function") {
      this.ui.videoModal.clearSimilarContent();
    }
  }
}
