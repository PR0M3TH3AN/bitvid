import { collectVideoTags } from "./videoTags.js";

export function getVideoRootIdentifier(video) {
  if (!video || typeof video !== "object") {
    return "";
  }

  if (typeof video.videoRootId === "string" && video.videoRootId) {
    return video.videoRootId;
  }

  if (typeof video.id === "string" && video.id) {
    return video.id;
  }

  return "";
}

export function applyRootTimestampToVideosMap({
  videosMap,
  video,
  rootId = "",
  timestamp,
}) {
  if (!(videosMap instanceof Map)) {
    return;
  }

  if (video?.id) {
    const existing = videosMap.get(video.id);
    if (existing && typeof existing === "object") {
      existing.rootCreatedAt = timestamp;
    }
  }

  if (!rootId) {
    return;
  }

  for (const stored of videosMap.values()) {
    if (!stored || typeof stored !== "object") {
      continue;
    }
    if (stored === video) {
      continue;
    }
    const storedRootId = getVideoRootIdentifier(stored);
    if (storedRootId && storedRootId === rootId) {
      stored.rootCreatedAt = timestamp;
    }
  }
}

export function syncActiveVideoRootTimestamp({
  activeVideo,
  rootId = "",
  timestamp = null,
  buildModalTimestampPayload,
  videoModal,
}) {
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const normalized = Math.floor(timestamp);
  if (!activeVideo || typeof activeVideo !== "object") {
    return false;
  }

  const activeRootId = getVideoRootIdentifier(activeVideo);
  if (!activeRootId) {
    return false;
  }

  if (rootId && activeRootId !== rootId) {
    return false;
  }

  if (activeVideo.rootCreatedAt === normalized) {
    return false;
  }

  activeVideo.rootCreatedAt = normalized;
  const modalTags = collectVideoTags(activeVideo);
  activeVideo.displayTags = modalTags;

  const editedAt = Number.isFinite(activeVideo.lastEditedAt)
    ? Math.floor(activeVideo.lastEditedAt)
    : Number.isFinite(activeVideo.created_at)
      ? Math.floor(activeVideo.created_at)
      : null;

  if (
    typeof buildModalTimestampPayload === "function" &&
    videoModal &&
    typeof videoModal.updateMetadata === "function"
  ) {
    const payload = buildModalTimestampPayload({
      postedAt: normalized,
      editedAt,
    });
    videoModal.updateMetadata({ timestamps: payload, tags: modalTags });
  }

  return true;
}
