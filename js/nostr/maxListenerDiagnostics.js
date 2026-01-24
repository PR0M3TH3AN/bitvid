// js/nostr/maxListenerDiagnostics.js
// Suppresses noisy MaxListenersExceededWarning diagnostics unless verbose
// dev mode is enabled by shimming `process.emitWarning`. The EventEmitter
// polyfill used by nostr-tools surfaces listener leaks through
// `process.emitWarning`, so we intercept that hook instead of importing the
// Node `events` module (which breaks browser bundlers) or rewriting
// console.warn globally.

import { isVerboseDiagnosticsEnabled } from "./countDiagnostics.js";

const MAX_LISTENER_SNIPPETS = [
  "MaxListenersExceededWarning",
  "Possible EventEmitter memory leak detected",
];

const MAX_LISTENER_CODES = new Set(["MaxListenersExceededWarning"]);

function collectCandidateStrings(value) {
  const candidates = [];

  if (!value) {
    return candidates;
  }

  if (typeof value === "string") {
    candidates.push(value);
    return candidates;
  }

  if (typeof value === "object") {
    const fields = ["name", "message", "code", "type"];
    for (const field of fields) {
      const fieldValue = value[field];
      if (typeof fieldValue === "string") {
        candidates.push(fieldValue);
      }
    }
  }

  return candidates;
}

function shouldSuppressWarning(...args) {
  if (isVerboseDiagnosticsEnabled()) {
    return false;
  }

  const candidates = [];
  for (const arg of args) {
    candidates.push(...collectCandidateStrings(arg));
  }

  for (const candidate of candidates) {
    if (MAX_LISTENER_CODES.has(candidate)) {
      return true;
    }
    if (MAX_LISTENER_SNIPPETS.some((snippet) => candidate.includes(snippet))) {
      return true;
    }
  }

  return false;
}

function patchProcessEmitWarning() {
  const processRef =
    typeof globalThis !== "undefined" && globalThis
      ? globalThis.process
      : typeof process !== "undefined"
        ? process
        : undefined;

  if (!processRef || typeof processRef.emitWarning !== "function") {
    return;
  }

  const originalEmitWarning = processRef.emitWarning.bind(processRef);

  if (processRef.emitWarning.__BITVID_MAX_LISTENER_PATCHED__) {
    return;
  }

  function patchedEmitWarning(warning, ...rest) {
    if (shouldSuppressWarning(warning, ...rest)) {
      return;
    }

    return originalEmitWarning(warning, ...rest);
  }

  patchedEmitWarning.__BITVID_MAX_LISTENER_PATCHED__ = true;
  processRef.emitWarning = patchedEmitWarning;
}

patchProcessEmitWarning();
