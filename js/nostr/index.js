export {
  NostrClient,
  getActiveSigner,
  setActiveSigner,
  clearActiveSigner,
  resolveActiveSigner,
  shouldRequestExtensionPermissions,
} from "./client.js";

export {
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
} from "./nip07Permissions.js";

export {
  buildNip71MetadataTags,
  buildNip71VideoEvent,
  collectNip71PointerRequests,
  convertEventToVideo,
  extractNip71MetadataFromTags,
  getDTagValueFromTags,
  mergeNip71MetadataIntoVideo,
  populateNip71MetadataForVideos,
  processNip71Events,
  buildVideoPointerValue,
  stringFromInput,
} from "./nip71.js";

export {
  normalizePointerInput,
  pointerKey,
  chunkWatchHistoryPayloadItems,
  normalizeActorKey,
  parseWatchHistoryContentWithFallback,
  isNip04EncryptedWatchHistoryEvent,
  watchHistoryHelpers,
  updateWatchHistoryList,
  removeWatchHistoryItem,
} from "./watchHistory.js";

export {
  deriveViewEventBucketIndex,
  deriveViewEventPointerScope,
  hasRecentViewPublish,
  rememberViewPublish,
  createVideoViewEventFilters,
  getViewEventGuardWindowMs,
  listVideoViewEvents,
  subscribeVideoViewEvents,
  countVideoViewEvents,
  publishViewEvent,
  recordVideoView,
} from "./viewEvents.js";
