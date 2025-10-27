// js/nostr/maxListenerDiagnostics.js
// Applies verbose-dev-mode-aware defaults to EventEmitter listener limits so
// high-volume MaxListeners warnings stay hidden unless explicitly requested.

import EventEmitter from "events";

import { isVerboseDiagnosticsEnabled } from "./countDiagnostics.js";

const DEFAULT_WARNING_THRESHOLD = 10;

function getTargetMaxListeners() {
  return isVerboseDiagnosticsEnabled() ? DEFAULT_WARNING_THRESHOLD : 0;
}

function applyMaxListenerPreference() {
  try {
    const targetLimit = getTargetMaxListeners();
    if (typeof EventEmitter.defaultMaxListeners === "number") {
      if (EventEmitter.defaultMaxListeners !== targetLimit) {
        EventEmitter.defaultMaxListeners = targetLimit;
      }
      return;
    }

    EventEmitter.defaultMaxListeners = targetLimit;
  } catch (error) {
    // Swallow errors silently — diagnostics are best-effort and shouldn't
    // interfere with runtime behavior if the events shim is unavailable.
  }
}

applyMaxListenerPreference();

export function refreshMaxListenerPreference() {
  applyMaxListenerPreference();
}
