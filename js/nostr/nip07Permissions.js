import { devLogger, userLogger } from "../utils/logger.js";
import { SHORT_TIMEOUT_MS } from "../constants.js";

export const NIP07_LOGIN_TIMEOUT_MS = 60_000; // 60 seconds
export const NIP07_EXTENSION_WAIT_TIMEOUT_MS = SHORT_TIMEOUT_MS;
export const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Confirm the extension prompt in your browser toolbar and try again.";
const NIP07_PERMISSIONS_STORAGE_KEY = "bitvid:nip07:permissions";

// Give the NIP-07 extension enough time to surface its approval prompt and let
// users unlock/authorize it. Seven seconds proved too aggressive once vendors
// started requiring an unlock step, so we extend the window substantially while
// still allowing manual overrides via __BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__.
const DEFAULT_ENABLE_VARIANT_TIMEOUT_MS = 45_000;

export const DEFAULT_NIP07_ENCRYPTION_METHODS = Object.freeze([
  // Encryption helpers — request both legacy NIP-04 and modern NIP-44 upfront
  "nip04.encrypt",
  "nip04.decrypt",
  "nip44.encrypt",
  "nip44.decrypt",
  "nip44.v2.encrypt",
  "nip44.v2.decrypt",
]);

export const DEFAULT_NIP07_CORE_METHODS = Object.freeze([
  // Core auth + relay metadata
  "get_public_key",
  "sign_event",
]);

export const DEFAULT_NIP07_PERMISSION_METHODS = Object.freeze([
  ...DEFAULT_NIP07_CORE_METHODS,
  ...DEFAULT_NIP07_ENCRYPTION_METHODS,
]);

export const NIP07_PRIORITY = Object.freeze({
  HIGH: 10,
  NORMAL: 5,
  LOW: 1,
});

class Nip07RequestQueue {
  constructor(maxConcurrent = 2) {
    this.queue = [];
    this.maxConcurrent =
      Number.isFinite(maxConcurrent) && maxConcurrent > 0 ? maxConcurrent : 2;
    this.activeCount = 0;
  }

  enqueue(task, priority = NIP07_PRIORITY.NORMAL) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        priority: Number.isFinite(priority) ? priority : NIP07_PRIORITY.NORMAL,
        resolve,
        reject,
        addedAt: Date.now(),
      });
      // Sort by priority (descending), then by insertion time (ascending) for fairness
      this.queue.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return a.addedAt - b.addedAt;
      });
      this.process();
    });
  }

  async process() {
    if (this.activeCount >= this.maxConcurrent) return;

    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      this.activeCount++;
      const { task, resolve, reject } = item;

      // We don't await the task here to allow parallelism loop to continue
      Promise.resolve()
        .then(() => task())
        .then((result) => {
          resolve(result);
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          this.activeCount--;
          this.process();
        });
    }
  }
}

// Module-level priority queue to serialize NIP-07 extension requests.
// This prevents "message channel closed" errors caused by race conditions
// when multiple components (blocks, DMs, auth) query the extension simultaneously,
// while allowing critical tasks (e.g. blocklist decryption) to jump the line.
// Stability: keep extension request concurrency conservative. Some NIP-07
// providers/content scripts drop channels under high parallel load, which
// manifests as "message channel closed" and repeated decrypt timeouts.
const requestQueue = new Nip07RequestQueue(2);

export function getEnableVariantTimeoutMs() {
  const overrideValue =
    typeof globalThis !== "undefined" &&
    globalThis !== null &&
    Number.isFinite(globalThis.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__)
      ? Math.floor(globalThis.__BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__)
      : null;

  if (overrideValue !== null && overrideValue > 0) {
    return Math.max(50, overrideValue);
  }

  return DEFAULT_ENABLE_VARIANT_TIMEOUT_MS;
}

export function normalizePermissionMethod(method) {
  return typeof method === "string" && method.trim() ? method.trim() : "";
}

function getNip07PermissionStorage() {
  const scope =
    typeof globalThis !== "undefined" && globalThis ? globalThis : undefined;
  const browserWindow =
    typeof window !== "undefined" && window ? window : undefined;

  if (browserWindow?.localStorage) {
    return browserWindow.localStorage;
  }

  if (scope?.localStorage) {
    return scope.localStorage;
  }

  return null;
}

export function readStoredNip07Permissions() {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return new Set();
  }

  let rawValue = null;
  try {
    rawValue = storage.getItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    return new Set();
  }

  if (!rawValue) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(rawValue);
    const storedMethods = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.grantedMethods)
        ? parsed.grantedMethods
        : Array.isArray(parsed?.methods)
          ? parsed.methods
          : [];
    return new Set(
      storedMethods
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean),
    );
  } catch (error) {
    clearStoredNip07Permissions();
    return new Set();
  }
}

export function writeStoredNip07Permissions(methods) {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return;
  }

  const normalized = Array.from(
    new Set(
      Array.from(methods || [])
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean),
    ),
  );

  try {
    if (!normalized.length) {
      storage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
      return;
    }

    storage.setItem(
      NIP07_PERMISSIONS_STORAGE_KEY,
      JSON.stringify({ grantedMethods: normalized }),
    );
  } catch (error) {
    // ignore persistence failures
  }
}

export function clearStoredNip07Permissions() {
  const storage = getNip07PermissionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    // ignore cleanup issues
  }
}

export function withNip07Timeout(
  operation,
  {
    timeoutMs = NIP07_LOGIN_TIMEOUT_MS,
    message = NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
  } = {},
) {
  const numericTimeout = Number(timeoutMs);
  const effectiveTimeout =
    Number.isFinite(numericTimeout) && numericTimeout > 0
      ? numericTimeout
      : NIP07_LOGIN_TIMEOUT_MS;

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, effectiveTimeout);
  });

  let operationResult;
  try {
    operationResult = operation();
  } catch (err) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    throw err;
  }

  const operationPromise = Promise.resolve(operationResult);

  return Promise.race([operationPromise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export async function runNip07WithRetry(
  operation,
  {
    label = "NIP-07 operation",
    timeoutMs = NIP07_LOGIN_TIMEOUT_MS,
    retryMultiplier = 2,
    priority = NIP07_PRIORITY.NORMAL,
  } = {},
) {
  // We wrap the entire retry logic in a queue task to ensure only one
  // request hits the extension at a time (per slot).
  const executeTask = async () => {
    // We wrap the operation invocation to ensure it returns a fresh promise each time
    // we attempt it. This is critical for retries: if the first attempt stalls (dropped
    // by extension), re-awaiting the same promise would just keep waiting on the dead request.
    const invokeOperation = () => Promise.resolve(operation());

    try {
      return await withNip07Timeout(invokeOperation, {
        timeoutMs,
        message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
      });
    } catch (error) {
      const isTimeoutError =
        error instanceof Error &&
        error.message === NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE;

      if (!isTimeoutError || retryMultiplier <= 1) {
        throw error;
      }

      const extendedTimeout = Math.max(
        timeoutMs,
        Math.round(timeoutMs * retryMultiplier),
      );

      devLogger.warn(
        `[nostr] ${label} taking longer than ${timeoutMs}ms. Retrying with ${extendedTimeout}ms timeout.`,
      );

      // On retry, we invoke operation() again to send a fresh request to the extension.
      return withNip07Timeout(invokeOperation, {
        timeoutMs: extendedTimeout,
        message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
      });
    }
  };

  return requestQueue.enqueue(executeTask, priority);
}

export async function requestEnablePermissions(
  extension,
  outstandingMethods,
  { isDevMode = false } = {},
) {
  if (!extension) {
    return { ok: false, error: new Error("extension-unavailable") };
  }

  const hasRequestPermissions = typeof extension.requestPermissions === "function";
  const hasEnable = typeof extension.enable === "function";

  const normalized = Array.isArray(outstandingMethods)
    ? outstandingMethods
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean)
    : [];

  const permissionVariants = (() => {
    const variants = [];
    if (normalized.length) {
      variants.push({
        permissions: normalized.map((method) => ({ method })),
      });
      variants.push({ permissions: normalized });
      variants.push(normalized);
    }
    variants.push(null);
    return variants;
  })();

  if (!hasRequestPermissions && !hasEnable) {
    return { ok: true, code: "enable-unavailable" };
  }

  let lastError = null;
  const runPermissionMethod = async (methodName, method) => {
    for (const options of permissionVariants) {
      // Specific permission payloads should fail fast; prompt-based no-arg calls
      // get a longer timeout so users have time to confirm in extension UI.
      const variantTimeoutOverrides = options
        ? {
            timeoutMs: Math.min(3000, getEnableVariantTimeoutMs()),
            retryMultiplier: 1,
          }
        : {
            timeoutMs: Math.min(
              NIP07_LOGIN_TIMEOUT_MS,
              getEnableVariantTimeoutMs(),
            ),
            retryMultiplier: 1,
          };

      try {
        await runNip07WithRetry(
          () =>
            options === null
              ? method()
              : methodName === "enable"
                ? method(options)
                : method(options),
          {
            label: `extension.${methodName}`,
            ...variantTimeoutOverrides,
          },
        );
        return true;
      } catch (error) {
        lastError = error;
        if (options && isDevMode) {
          userLogger.warn(
            `[nostr] extension.${methodName} permission request failed:`,
            error,
          );
        }
      }
    }
    return false;
  };

  // Compatibility-first: prefer standard NIP-07 enable() where available.
  if (hasEnable) {
    const enableSucceeded = await runPermissionMethod(
      "enable",
      extension.enable.bind(extension),
    );
    if (enableSucceeded) {
      return { ok: true };
    }
  }

  // Fallback for extensions that implement requestPermissions() but not enable(),
  // or where enable() payload handling is broken.
  if (hasRequestPermissions) {
    const requestPermissionsSucceeded = await runPermissionMethod(
      "requestPermissions",
      extension.requestPermissions.bind(extension),
    );
    if (requestPermissionsSucceeded) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    error: lastError || new Error("permission-denied"),
  };
}

export const __testExports = {
  requestEnablePermissions,
  runNip07WithRetry,
  withNip07Timeout,
  getEnableVariantTimeoutMs,
  readStoredNip07Permissions,
  writeStoredNip07Permissions,
  clearStoredNip07Permissions,
  normalizePermissionMethod,
};

export function waitForNip07Extension(timeoutMs = NIP07_EXTENSION_WAIT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.nostr) {
      resolve(window.nostr);
      return;
    }

    if (typeof window === "undefined") {
      reject(new Error("Not running in a browser environment."));
      return;
    }

    const start = Date.now();
    let resolved = false;

    const finish = (ext) => {
      if (resolved) return;
      resolved = true;
      clearInterval(interval);
      resolve(ext);
    };

    const fail = () => {
      if (resolved) return;
      resolved = true;
      clearInterval(interval);
      reject(new Error("Nostr extension not found within timeout."));
    };

    // Poll every 50ms for window.nostr injection.
    const interval = setInterval(() => {
      if (window.nostr) {
        finish(window.nostr);
      } else if (Date.now() - start > timeoutMs) {
        fail();
      }
    }, 50);

    // Additionally listen for the DOMContentLoaded event — many extensions
    // inject window.nostr during this phase, and detecting it via the event
    // can be faster than waiting for the next poll tick.
    if (typeof document !== "undefined" && document.readyState === "loading") {
      const onReady = () => {
        document.removeEventListener("DOMContentLoaded", onReady);
        if (window.nostr) {
          finish(window.nostr);
        }
      };
      document.addEventListener("DOMContentLoaded", onReady);
    }
  });
}
