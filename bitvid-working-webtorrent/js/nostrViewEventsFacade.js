// js/nostrViewEventsFacade.js
//
// Central export for NIP-71 view event helpers. Consumers can choose between
// helpers that accept an explicit Nostr client and thin wrappers that call the
// default client instance configured by the app shell.

export {
  recordVideoView as recordVideoViewWithDefaultClient,
  listVideoViewEvents as listVideoViewEventsWithDefaultClient,
  subscribeVideoViewEvents as subscribeVideoViewEventsWithDefaultClient,
  countVideoViewEvents as countVideoViewEventsWithDefaultClient,
} from "./nostr/viewEventBindings.js";

export {
  VIEW_EVENT_KIND,
  createVideoViewEventFilters,
  deriveViewEventBucketIndex,
  deriveViewEventPointerScope,
  getViewEventGuardWindowMs,
  hasRecentViewPublish,
  rememberViewPublish,
  publishViewEvent,
  recordVideoView,
  listVideoViewEvents,
  subscribeVideoViewEvents,
  countVideoViewEvents,
} from "./nostr/viewEvents.js";
