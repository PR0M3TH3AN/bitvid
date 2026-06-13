// Web Worker: verifies Nostr event signatures off the main thread.
//
// The relay SimplePool is constructed with `verifyEvent: () => true` so it never
// blocks the main thread verifying incoming events (profiling showed ~1.2s of
// schnorr work during feed load). Instead, batches of events are verified here,
// in parallel with the UI, and the caller commits only the ids reported valid.
//
// Message protocol:
//   in:  { id, events: Array<NostrEvent> }
//   out: { id, ok: true, validIds: string[] } | { id, ok: false, error }

import { ensureNostrTools, getCachedNostrTools } from "./toolkit.js";

async function resolveTools() {
  const cached = getCachedNostrTools();
  if (cached && typeof cached.verifyEvent === "function") {
    return cached;
  }
  return (await ensureNostrTools()) || cached;
}

function verifyOne(tools, event) {
  try {
    if (!event || typeof event !== "object") return false;
    if (typeof tools.validateEvent === "function" && !tools.validateEvent(event)) {
      return false;
    }
    return tools.verifyEvent(event) === true;
  } catch (_) {
    return false;
  }
}

self.addEventListener("message", async (msg) => {
  const data = msg?.data || {};
  const { id, events } = data;
  try {
    const tools = await resolveTools();
    if (!tools || typeof tools.verifyEvent !== "function") {
      throw new Error("signature-verification-unavailable");
    }
    const validIds = [];
    for (const event of Array.isArray(events) ? events : []) {
      if (event && event.id && verifyOne(tools, event)) {
        validIds.push(event.id);
      }
    }
    self.postMessage({ id, ok: true, validIds });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: { name: error?.name || "Error", message: error?.message || "verify-worker-error" },
    });
  }
});
