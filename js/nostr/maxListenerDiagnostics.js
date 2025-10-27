// js/nostr/maxListenerDiagnostics.js
// Suppresses noisy MaxListenersExceededWarning diagnostics unless verbose
// dev mode is enabled by filtering console.warn output. Node's EventEmitter
// polyfill emits these warnings via console.warn in browser bundles, so we
// intercept the console instead of importing the `events` module or
// patching process APIs that might vary across environments.

import { isVerboseDiagnosticsEnabled } from "./countDiagnostics.js";

const MAX_LISTENER_SNIPPETS = [
  "MaxListenersExceededWarning",
  "Possible EventEmitter memory leak detected",
];

let originalConsoleWarn;
let isPatched = false;

function extractCandidateStrings(value) {
  if (typeof value === "string") {
    return [value];
  }

  if (value && typeof value === "object") {
    const candidates = [];
    if (typeof value.name === "string") {
      candidates.push(value.name);
    }
    if (typeof value.message === "string") {
      candidates.push(value.message);
    }
    return candidates;
  }

  return [];
}

function shouldSuppressArgs(args) {
  if (isVerboseDiagnosticsEnabled()) {
    return false;
  }

  for (const arg of args) {
    const candidates = extractCandidateStrings(arg);
    for (const candidate of candidates) {
      if (MAX_LISTENER_SNIPPETS.some((snippet) => candidate.includes(snippet))) {
        return true;
      }
    }
  }

  return false;
}

function applyMaxListenerWarningFilter() {
  if (isPatched) {
    return;
  }

  const consoleRef = typeof console !== "undefined" ? console : null;
  if (!consoleRef || typeof consoleRef.warn !== "function") {
    return;
  }

  originalConsoleWarn = consoleRef.warn.bind(consoleRef);
  consoleRef.warn = function patchedConsoleWarn(...args) {
    if (shouldSuppressArgs(args)) {
      return;
    }

    return originalConsoleWarn(...args);
  };

  isPatched = true;
}

applyMaxListenerWarningFilter();

export function refreshMaxListenerPreference() {
  // No-op for now; retained for API parity in case verbose mode toggles at
  // runtime and we need to evolve this helper later.
}
