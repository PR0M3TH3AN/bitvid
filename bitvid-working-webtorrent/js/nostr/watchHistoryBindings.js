// js/nostr/watchHistoryBindings.js

import { nostrClient } from "./defaultClient.js";
import {
  updateWatchHistoryList as updateWatchHistoryListWithManager,
  removeWatchHistoryItem as removeWatchHistoryItemWithManager,
} from "./watchHistory.js";

function getWatchHistoryManager() {
  return nostrClient?.watchHistory || null;
}

function assertWatchHistoryManager(operation) {
  const manager = getWatchHistoryManager();
  if (!manager || typeof manager[operation] !== "function") {
    throw new Error("Watch history manager is unavailable in this build.");
  }
  return manager;
}

export function updateWatchHistoryList(...args) {
  const manager = assertWatchHistoryManager("updateList");
  return updateWatchHistoryListWithManager(manager, ...args);
}

export function removeWatchHistoryItem(...args) {
  const manager = assertWatchHistoryManager("removeItem");
  return removeWatchHistoryItemWithManager(manager, ...args);
}
