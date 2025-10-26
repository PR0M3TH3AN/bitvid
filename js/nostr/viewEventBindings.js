// js/nostr/viewEventBindings.js

import { nostrClient } from "./defaultClient.js";

function ensureOptionalBinding(methodName, errorMessage) {
  const handler =
    nostrClient && typeof nostrClient[methodName] === "function"
      ? nostrClient[methodName]
      : null;
  if (!handler) {
    throw new Error(errorMessage);
  }
  return handler;
}

export function recordVideoView(...args) {
  return nostrClient.recordVideoView(...args);
}

export function listVideoViewEvents(...args) {
  const handler = ensureOptionalBinding(
    "listVideoViewEvents",
    "Video view listing is unavailable in this build."
  );
  return handler.apply(nostrClient, args);
}

export function subscribeVideoViewEvents(...args) {
  const handler = ensureOptionalBinding(
    "subscribeVideoViewEvents",
    "Video view subscriptions are unavailable in this build."
  );
  return handler.apply(nostrClient, args);
}

export function countVideoViewEvents(...args) {
  const handler = ensureOptionalBinding(
    "countVideoViewEvents",
    "Video view counting is unavailable in this build."
  );
  return handler.apply(nostrClient, args);
}
