// js/nostr.js

import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr/defaultClient.js";

export { nostrClient, requestDefaultExtensionPermissions };

export {
  recordVideoView,
  listVideoViewEvents,
  subscribeVideoViewEvents,
  countVideoViewEvents,
} from "./nostr/viewEventBindings.js";

export {
  updateWatchHistoryList,
  removeWatchHistoryItem,
} from "./nostr/watchHistoryBindings.js";

export * from "./nostr/index.js";
