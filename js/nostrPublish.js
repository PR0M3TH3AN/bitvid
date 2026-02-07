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
    const finalize = (success, error = null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ url, success, error });
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

    clearTimeout(timeoutId);
    finalize(true);
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
