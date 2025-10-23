// js/nostr.js
//
// Compatibility shim that forwards legacy imports to the new domain-specific
// facades. Prefer importing from the facades directly in new modules so the
// wiring between the default client and helper layers stays explicit.

export { nostrClient, requestDefaultExtensionPermissions } from "./nostrClientFacade.js";

export {
  recordVideoViewWithDefaultClient,
  listVideoViewEventsWithDefaultClient,
  subscribeVideoViewEventsWithDefaultClient,
  countVideoViewEventsWithDefaultClient,
} from "./nostrViewEventsFacade.js";

export {
  updateWatchHistoryListWithDefaultClient,
  removeWatchHistoryItemWithDefaultClient,
} from "./nostrWatchHistoryFacade.js";

export {
  recordVideoViewWithDefaultClient as recordVideoView,
  listVideoViewEventsWithDefaultClient as listVideoViewEvents,
  subscribeVideoViewEventsWithDefaultClient as subscribeVideoViewEvents,
  countVideoViewEventsWithDefaultClient as countVideoViewEvents,
} from "./nostrViewEventsFacade.js";

export {
  updateWatchHistoryListWithDefaultClient as updateWatchHistoryList,
  removeWatchHistoryItemWithDefaultClient as removeWatchHistoryItem,
} from "./nostrWatchHistoryFacade.js";

export * from "./nostr/index.js";
