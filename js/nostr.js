// js/nostr.js
//
// Compatibility shim that forwards legacy imports to the new domain-specific
// facades. Prefer importing from the facades directly in new modules so the
// wiring between the default client and helper layers stays explicit.

import {
  nostrClient as defaultNostrClient,
  requestDefaultExtensionPermissions,
} from "./nostrClientFacade.js";

export { requestDefaultExtensionPermissions };
export { defaultNostrClient as nostrClient };

export const publishVideoReaction = (...args) => {
  if (
    !defaultNostrClient ||
    typeof defaultNostrClient.publishVideoReaction !== "function"
  ) {
    throw new Error("Video reaction publishing is unavailable in this build.");
  }
  return defaultNostrClient.publishVideoReaction(...args);
};

export const publishVideoComment = (...args) => {
  if (
    !defaultNostrClient ||
    typeof defaultNostrClient.publishVideoComment !== "function"
  ) {
    throw new Error("Video comment publishing is unavailable in this build.");
  }
  return defaultNostrClient.publishVideoComment(...args);
};

export const fetchVideoComments = (...args) => {
  if (
    !defaultNostrClient ||
    typeof defaultNostrClient.fetchVideoComments !== "function"
  ) {
    throw new Error("Video comment fetching is unavailable in this build.");
  }
  return defaultNostrClient.fetchVideoComments(...args);
};

export const subscribeVideoComments = (...args) => {
  if (
    !defaultNostrClient ||
    typeof defaultNostrClient.subscribeVideoComments !== "function"
  ) {
    throw new Error("Video comment subscriptions are unavailable in this build.");
  }
  return defaultNostrClient.subscribeVideoComments(...args);
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
  convertEventToVideo,
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
  recordVideoViewWithDefaultClient,
  listVideoViewEventsWithDefaultClient,
  subscribeVideoViewEventsWithDefaultClient,
  countVideoViewEventsWithDefaultClient,
} from "./nostrViewEventsFacade.js";

export {
  VIEW_EVENT_KIND,
  createVideoViewEventFilters,
  deriveViewEventBucketIndex,
  deriveViewEventPointerScope,
  getViewEventGuardWindowMs,
  hasRecentViewPublish,
  rememberViewPublish,
  publishViewEvent,
  recordVideoView as recordVideoViewWithClient,
  listVideoViewEvents as listVideoViewEventsWithClient,
  subscribeVideoViewEvents as subscribeVideoViewEventsWithClient,
  countVideoViewEvents as countVideoViewEventsWithClient,
} from "./nostrViewEventsFacade.js";

export {
  updateWatchHistoryListWithDefaultClient,
  removeWatchHistoryItemWithDefaultClient,
} from "./nostrWatchHistoryFacade.js";

export {
  updateWatchHistoryListWithDefaultClient as updateWatchHistoryList,
  removeWatchHistoryItemWithDefaultClient as removeWatchHistoryItem,
} from "./nostrWatchHistoryFacade.js";

export {
  recordVideoViewWithDefaultClient as recordVideoView,
  listVideoViewEventsWithDefaultClient as listVideoViewEvents,
  subscribeVideoViewEventsWithDefaultClient as subscribeVideoViewEvents,
  countVideoViewEventsWithDefaultClient as countVideoViewEvents,
} from "./nostrViewEventsFacade.js";

// Legacy modules should import from the specific facades above instead of this
// shim. The wildcard export that previously forwarded the entire
// "./nostr/index.js" barrel has intentionally been removed so bundlers can tree
// shake unused helpers.
