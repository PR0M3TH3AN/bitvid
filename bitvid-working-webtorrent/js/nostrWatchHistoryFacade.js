// js/nostrWatchHistoryFacade.js
//
// Wrapper exports for watch history helpers that operate on the default Nostr
// client instance. Future consumers should import from this module rather than
// reaching into the binding layer directly.

export {
  updateWatchHistoryList as updateWatchHistoryListWithDefaultClient,
  removeWatchHistoryItem as removeWatchHistoryItemWithDefaultClient,
} from "./nostr/watchHistoryBindings.js";
