import { isDevMode } from "./config.js";
import { devLogger } from "./utils/logger.js";

export const RELAY_PUBLISH_TIMEOUT_MS = 10_000;

function normalizeReason(error) {
  if (error instanceof Error) {
    return error.message || "publish failed";
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error === undefined || error === null) {
    return "publish failed";
  }
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

export class RelayPublishError extends Error {
  constructor(message, results = [], options = {}) {
    const finalMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "Failed to publish event to any relay.";
    super(finalMessage);
    this.name = "RelayPublishError";

    const contextValue =
      typeof options.context === "string" && options.context.trim()
        ? options.context.trim()
        : null;
    if (contextValue) {
      this.context = contextValue;
    }

    this.relayResults = Array.isArray(results)
      ? results.map((result) => ({
          url: result?.url || "",
          success: !!result?.success,
          error: result?.error || null,
          reason: normalizeReason(result?.error),
        }))
      : [];

    this.relayFailures = this.relayResults
      .filter((entry) => !entry.success)
      .map((entry) => ({
        url: entry.url,
        error: entry.error,
        reason: entry.reason,
      }));

    this.acceptedRelays = this.relayResults
      .filter((entry) => entry.success)
      .map((entry) => entry.url);
  }
}

export function publishEventToRelay(pool, url, event, options = {}) {
  const timeoutMs =
    typeof options.timeoutMs === "number" && options.timeoutMs > 0
      ? options.timeoutMs
      : RELAY_PUBLISH_TIMEOUT_MS;

  return new Promise((resolve) => {
    let settled = false;
    const finalize = (success, error = null, optimistic = false) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ url, success, error, optimistic });
    };

    const timeoutId = setTimeout(() => {
      finalize(false, new Error("publish timeout"));
    }, timeoutMs);

    try {
      const pub = pool?.publish?.([url], event);

      if (pub && typeof pub.on === "function") {
        const registerHandler = (eventName, handler) => {
          try {
            pub.on(eventName, handler);
            return true;
          } catch (error) {
            devLogger.warn(
            `[nostrPublish] Relay publish handle rejected ${eventName} listener:`,
            error,
            );
            return false;
          }
        };

        const handleSuccess = () => {
          clearTimeout(timeoutId);
          finalize(true);
        };

        const handleFailure = (reason) => {
          clearTimeout(timeoutId);
          const err =
            reason instanceof Error
              ? reason
              : new Error(String(reason || "publish failed"));
          finalize(false, err);
        };

        let handlerRegistered = false;
        handlerRegistered =
          registerHandler("ok", handleSuccess) || handlerRegistered;
        handlerRegistered =
          registerHandler("failed", handleFailure) || handlerRegistered;

        // nostr-tools@1.8 removed the optional "seen" callback from relay
        // publish handles. Attempting to register it now produces an
        // asynchronous TypeError that bubbles up as an unhandled rejection and
        // prevents watch-history snapshots from ever resolving. We therefore
        // skip registering a "seen" listener and rely on "ok" (per NIP-20) for
        // success notifications. Legacy relays that only emit "seen" fall back
        // to the optimistic success path below because no handlers end up
        // registered.

        if (handlerRegistered) {
          return;
        }
      }

      // nostr-tools SimplePool.publish(relays, event) returns an ARRAY of
      // per-relay promises (one per url). Each MUST be consumed or a relay that
      // rejects ("blocked", "auth-required", "publish timed out", websocket
      // error, …) surfaces as an uncaught promise rejection. With a large/flaky
      // relay list that floods the event loop and can freeze the tab. We pass a
      // single [url], so the array has one promise; allSettled never rejects, so
      // every rejection is consumed here.
      if (Array.isArray(pub)) {
        Promise.allSettled(pub).then((settled) => {
          clearTimeout(timeoutId);
          const anyOk = settled.some((entry) => entry.status === "fulfilled");
          if (anyOk) {
            finalize(true);
            return;
          }
          const firstRejection = settled.find(
            (entry) => entry.status === "rejected",
          );
          finalize(
            false,
            firstRejection?.reason instanceof Error
              ? firstRejection.reason
              : new Error(String(firstRejection?.reason || "publish failed")),
          );
        });
        return;
      }

      if (pub && typeof pub.then === "function") {
        pub
          .then(() => {
            clearTimeout(timeoutId);
            finalize(true);
          })
          .catch((error) => {
            clearTimeout(timeoutId);
            finalize(false, error);
          });
        return;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      finalize(false, error);
      return;
    }

    // No confirmation channel: the relay handle exposed neither an ok/failed
    // event nor a thenable. We still optimistically report success for legacy
    // "seen"-only relays, but mark the result `optimistic` and log it so a
    // silently-unconfirmed publish is traceable rather than indistinguishable
    // from a real relay ack (publish audit #3).
    clearTimeout(timeoutId);
    devLogger.warn(
      `[nostrPublish] Optimistic (unconfirmed) publish success for ${url}: relay gave no ok/failed/then signal.`,
    );
    finalize(true, null, true);
  });
}

export function publishEventToRelays(pool, urls, event, options = {}) {
  const list = Array.isArray(urls) ? urls : [];

  if (list.length === 0) {
    return Promise.resolve([]);
  }

  const promises = list.map((url) =>
    publishEventToRelay(pool, url, event, options),
  );

  if (options.waitForAll === true) {
    return Promise.all(promises);
  }

  return new Promise((resolve) => {
    let resolved = false;
    let pending = promises.length;
    const results = [];

    promises.forEach((p) => {
      p.then(
        (result) => {
          // If we already resolved, we don't need to track further results
          // for the return value, but the promises will still settle in background.
          if (resolved) {
            return;
          }

          results.push(result);
          pending--;

          if (result.success) {
            resolved = true;
            resolve(results);
          } else if (pending === 0) {
            resolved = true;
            resolve(results);
          }
        },
        (error) => {
          if (resolved) {
            return;
          }
          // Treat rejection as a failure result so we don't hang
          results.push({ success: false, error });
          pending--;

          if (pending === 0) {
            resolved = true;
            resolve(results);
          }
        },
      );
    });
  });
}

export function summarizePublishResults(results = []) {
  const accepted = [];
  const failed = [];

  for (const result of results) {
    if (result?.success) {
      accepted.push(result);
    } else {
      failed.push(result);
    }
  }

  return { accepted, failed };
}

// Non-enumerable key so the tally rides along with a signed event without ever
// polluting JSON.stringify / relay payloads.
export const RELAY_PUBLISH_SUMMARY_KEY = "__relayPublishSummary";

/**
 * Reduce a {accepted, failed} publish summary to a compact {accepted, total}
 * tally and stash it on the event (non-enumerable). Best-effort: a frozen or
 * non-object event is left untouched.
 */
export function attachRelayPublishSummary(event, summary) {
  if (!event || typeof event !== "object") {
    return event;
  }
  const accepted = Array.isArray(summary?.accepted) ? summary.accepted.length : 0;
  const failed = Array.isArray(summary?.failed) ? summary.failed.length : 0;
  try {
    Object.defineProperty(event, RELAY_PUBLISH_SUMMARY_KEY, {
      value: { accepted, total: accepted + failed },
      enumerable: false,
      configurable: true,
      writable: true,
    });
  } catch (_) {
    // ignore — the tally is purely informational.
  }
  return event;
}

/** Read back the compact tally attached by attachRelayPublishSummary, if any. */
export function readRelayPublishSummary(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const tally = event[RELAY_PUBLISH_SUMMARY_KEY];
  return tally && typeof tally === "object" ? tally : null;
}

/**
 * Turn a relay-publish tally into a user-facing message + tone, so the UI can
 * tell the user how many relays actually accepted their video instead of an
 * opaque "shared successfully" that hides partial/total failure.
 *
 * @param {{ accepted?: number, total?: number }} tally
 * @returns {{ tone: "success"|"warning"|"error", message: string }}
 */
export function describePublishOutcome({ accepted = 0, total = 0 } = {}) {
  const a = Number.isFinite(accepted) ? Math.max(0, Math.floor(accepted)) : 0;
  const t = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;

  // No relay count available — fall back to the generic confirmation.
  if (t <= 0) {
    return { tone: "success", message: "Video shared successfully!" };
  }
  if (a <= 0) {
    return {
      tone: "error",
      message:
        "Video could not be published to any relay. Check your relay list and try again.",
    };
  }
  if (a < t) {
    return {
      tone: "warning",
      message: `Video published to ${a} of ${t} relays — some relays rejected it.`,
    };
  }
  return {
    tone: "success",
    message: `Video published to ${a} ${a === 1 ? "relay" : "relays"}!`,
  };
}

export function assertAnyRelayAccepted(results = [], options = {}) {
  const summary = summarizePublishResults(results);
  if (summary.accepted.length > 0) {
    return summary;
  }

  const contextValue =
    typeof options.context === "string" && options.context.trim()
      ? options.context.trim()
      : "";
  const messageOverride =
    typeof options.message === "string" && options.message.trim()
      ? options.message.trim()
      : "";

  const message =
    messageOverride ||
    (contextValue
      ? `Failed to publish ${contextValue} to any relay.`
      : "Failed to publish event to any relay.");

  throw new RelayPublishError(message, results, { context: contextValue });
}
