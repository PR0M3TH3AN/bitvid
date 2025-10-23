// js/nostr.js

import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr/defaultClient.js";
import {
  recordVideoView,
  listVideoViewEvents,
  subscribeVideoViewEvents,
  countVideoViewEvents,
} from "./nostr/viewEventBindings.js";
import {
  updateWatchHistoryList,
  removeWatchHistoryItem,
} from "./nostr/watchHistoryBindings.js";

export { nostrClient, requestDefaultExtensionPermissions };

export { updateWatchHistoryList, removeWatchHistoryItem };

export {
  recordVideoView,
  listVideoViewEvents,
  subscribeVideoViewEvents,
  countVideoViewEvents,
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
