// js/nostr.js

import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr/defaultClient.js";
import {
  updateWatchHistoryList as updateWatchHistoryListWithManager,
  removeWatchHistoryItem as removeWatchHistoryItemWithManager,
} from "./nostr/watchHistory.js";

export { nostrClient, requestDefaultExtensionPermissions };

export const recordVideoView = (...args) =>
  nostrClient.recordVideoView(...args);

export const updateWatchHistoryList = (...args) =>
  updateWatchHistoryListWithManager(nostrClient.watchHistory, ...args);

export const removeWatchHistoryItem = (...args) =>
  removeWatchHistoryItemWithManager(nostrClient.watchHistory, ...args);

export const listVideoViewEvents = (...args) => {
  if (typeof nostrClient.listVideoViewEvents !== "function") {
    throw new Error("Video view listing is unavailable in this build.");
  }
  return nostrClient.listVideoViewEvents(...args);
};

export const subscribeVideoViewEvents = (...args) => {
  if (typeof nostrClient.subscribeVideoViewEvents !== "function") {
    throw new Error("Video view subscriptions are unavailable in this build.");
  }
  return nostrClient.subscribeVideoViewEvents(...args);
};

export const countVideoViewEvents = (...args) => {
  if (typeof nostrClient.countVideoViewEvents !== "function") {
    throw new Error("Video view counting is unavailable in this build.");
  }
  return nostrClient.countVideoViewEvents(...args);
};

export {
  __testExports,
  NostrClient,
  getActiveSigner,
  setActiveSigner,
  clearActiveSigner,
  resolveActiveSigner,
  shouldRequestExtensionPermissions,
} from "./nostr/client.js";
export {
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
} from "./nostr/nip07Permissions.js";
export {
  buildNip71MetadataTags,
  buildNip71VideoEvent,
  collectNip71PointerRequests,
  extractNip71MetadataFromTags,
  getDTagValueFromTags,
  mergeNip71MetadataIntoVideo,
  populateNip71MetadataForVideos,
  processNip71Events,
  buildVideoPointerValue,
  stringFromInput,
} from "./nostr/nip71.js";
export {
  normalizePointerInput,
  pointerKey,
  chunkWatchHistoryPayloadItems,
  normalizeActorKey,
  parseWatchHistoryContentWithFallback,
  isNip04EncryptedWatchHistoryEvent,
  watchHistoryHelpers,
} from "./nostr/watchHistory.js";
export {
  deriveViewEventBucketIndex,
  deriveViewEventPointerScope,
  hasRecentViewPublish,
  rememberViewPublish,
  createVideoViewEventFilters,
  getViewEventGuardWindowMs,
} from "./nostr/viewEvents.js";
export { convertEventToVideo } from "./nostr/nip71.js";
