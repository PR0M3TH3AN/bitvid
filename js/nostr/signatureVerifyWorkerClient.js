// Client for signatureVerifyWorker. Verifies event batches off the main thread
// and resolves with the Set of valid event ids. Falls back to main-thread
// verification only when Web Workers are unavailable, so signatures are still
// checked (never silently trusted) in that degraded case.

import { devLogger } from "../utils/logger.js";
import { ensureNostrTools, getCachedNostrTools } from "./toolkit.js";

const DEFAULT_TIMEOUT_MS = 10000;

let workerInstance = null;
let workerReady = false;
let requestId = 0;
const pending = new Map();

function attachWorkerListeners(worker) {
  if (!worker || workerReady) return;

  worker.addEventListener("message", (event) => {
    const data = event?.data || {};
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timeoutId);
    if (data.ok && Array.isArray(data.validIds)) {
      entry.resolve(new Set(data.validIds));
    } else {
      entry.reject(new Error(data?.error?.message || "verify-worker-error"));
    }
  });

  worker.addEventListener("error", (error) => {
    devLogger.warn("[signatureVerifyWorkerClient] Worker error", error);
    for (const entry of pending.values()) {
      clearTimeout(entry.timeoutId);
      entry.reject(error instanceof Error ? error : new Error("verify-worker-error"));
    }
    pending.clear();
  });

  workerReady = true;
}

function ensureWorker() {
  if (workerInstance) return workerInstance;
  if (typeof Worker === "undefined") return null;
  try {
    workerInstance = new Worker(new URL("./signatureVerifyWorker.js", import.meta.url), {
      type: "module",
    });
    attachWorkerListeners(workerInstance);
  } catch (error) {
    devLogger.warn("[signatureVerifyWorkerClient] Failed to create worker", error);
    workerInstance = null;
  }
  return workerInstance;
}

// Main-thread fallback used only when Workers are unavailable. Preserves the
// security guarantee (still verifies) at the cost of main-thread time.
async function verifyOnMainThread(events) {
  const tools = getCachedNostrTools() || (await ensureNostrTools());
  const valid = new Set();
  if (!tools || typeof tools.verifyEvent !== "function") {
    // Cannot verify at all — fail closed by returning no valid ids.
    return valid;
  }
  for (const event of events) {
    try {
      if (!event || !event.id) continue;
      if (typeof tools.validateEvent === "function" && !tools.validateEvent(event)) continue;
      if (tools.verifyEvent(event) === true) valid.add(event.id);
    } catch (_) {
      // skip
    }
  }
  return valid;
}

/**
 * Verify a batch of events. Resolves with a Set of valid event ids.
 * @param {Array<object>} events
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<Set<string>>}
 */
export function verifyEventsInWorker(events, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const list = Array.isArray(events) ? events.filter((e) => e && e.id) : [];
  if (!list.length) return Promise.resolve(new Set());

  const worker = ensureWorker();
  if (!worker) {
    return verifyOnMainThread(list);
  }

  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error("verify-worker-timeout"));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeoutId });
    try {
      worker.postMessage({ id, events: list });
    } catch (error) {
      clearTimeout(timeoutId);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error("verify-worker-post-failed"));
    }
  }).catch(async (error) => {
    // On worker failure/timeout, fall back to main-thread verification rather
    // than dropping events or trusting them blindly.
    devLogger.warn("[signatureVerifyWorkerClient] Falling back to main-thread verify:", error?.message || error);
    return verifyOnMainThread(list);
  });
}

// Test/diagnostic helpers.
export const __signatureVerifyInternals = { verifyOnMainThread };
