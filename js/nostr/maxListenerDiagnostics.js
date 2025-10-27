// js/nostr/maxListenerDiagnostics.js
// Suppresses noisy MaxListenersExceededWarning diagnostics unless verbose
// dev mode is enabled. We hook into process.emitWarning because Node's
// EventEmitter implementation routes listener-limit warnings through that
// API, even in the browser bundles pulled in by WebTorrent.

import { isVerboseDiagnosticsEnabled } from "./countDiagnostics.js";

let originalEmitWarning;
let isPatched = false;

function extractWarningName(warning, rest) {
  if (warning && typeof warning === "object" && typeof warning.name === "string") {
    return warning.name;
  }

  if (typeof warning === "string") {
    return rest && rest.length > 0 && typeof rest[0] === "string"
      ? rest[0]
      : undefined;
  }

  if (rest && rest.length > 0) {
    const [firstArg] = rest;
    if (typeof firstArg === "string") {
      return firstArg;
    }
    if (firstArg && typeof firstArg === "object" && typeof firstArg.name === "string") {
      return firstArg.name;
    }
  }

  return undefined;
}

function shouldSuppressWarning(warning, rest) {
  if (isVerboseDiagnosticsEnabled()) {
    return false;
  }

  const warningName = extractWarningName(warning, rest);
  if (warningName === "MaxListenersExceededWarning") {
    return true;
  }

  if (typeof warning === "string") {
    return warning.includes("MaxListenersExceededWarning");
  }

  if (warning && typeof warning.message === "string") {
    return warning.message.includes("MaxListenersExceededWarning");
  }

  return false;
}

function applyMaxListenerWarningFilter() {
  if (isPatched) {
    return;
  }

  const processRef = typeof process !== "undefined" ? process : undefined;
  if (!processRef || typeof processRef.emitWarning !== "function") {
    return;
  }

  originalEmitWarning = processRef.emitWarning.bind(processRef);
  processRef.emitWarning = function patchedEmitWarning(warning, ...rest) {
    if (shouldSuppressWarning(warning, rest)) {
      return;
    }
    return originalEmitWarning(warning, ...rest);
  };

  isPatched = true;
}

applyMaxListenerWarningFilter();

export function refreshMaxListenerPreference() {
  // No-op for now; retained for API parity in case verbose mode toggles at
  // runtime and we need to evolve this helper later.
}
