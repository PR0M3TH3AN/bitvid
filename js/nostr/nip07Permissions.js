import { devLogger, userLogger } from "../utils/logger.js";

export const NIP07_LOGIN_TIMEOUT_MS = 20_000; // 20 seconds
export const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Confirm the extension prompt in your browser toolbar and try again.";
const NIP07_PERMISSIONS_STORAGE_KEY = "bitvid:nip07:permissions";

// Give the NIP-07 extension enough time to surface its approval prompt and let
// users unlock/authorize it. The default is tuned to keep login responsive while
// still allowing manual overrides via __BITVID_NIP07_ENABLE_VARIANT_TIMEOUT_MS__.
const DEFAULT_ENABLE_VARIANT_TIMEOUT_MS = 5_000;

export const DEFAULT_NIP07_ENCRYPTION_METHODS = Object.freeze([
  // Encryption helpers — request both legacy NIP-04 and modern NIP-44 upfront
  "nip04.encrypt",
  "nip04.decrypt",
  "nip44.encrypt",
  "nip44.decrypt",
  "nip44.v2.encrypt",
  "nip44.v2.decrypt",
]);

export const DEFAULT_NIP07_PERMISSION_METHODS = Object.freeze([
  // Core auth + relay metadata (encryption permissions requested on demand)
  "get_public_key",
  "sign_event",
  "read_relays",
  "write_relays",
]);

export const NIP07_PRIORITY = Object.freeze({
  HIGH: 10,
  NORMAL: 5,
  LOW: 1,
});

class Nip07RequestQueue {
  constructor() {
    this.queue = [];
    this.running = false;
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
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      const { task, resolve, reject } = item;

      try {
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.running = false;
  }
}

// Module-level priority queue to serialize NIP-07 extension requests.
// This prevents "message channel closed" errors caused by race conditions
// when multiple components (blocks, DMs, auth) query the extension simultaneously,
// while allowing critical tasks (e.g. blocklist decryption) to jump the line.
const requestQueue = new Nip07RequestQueue();

export function getNip07LoginTimeoutMs() {
  const overrideValue =
    typeof globalThis !== "undefined" &&
    globalThis !== null &&
    Number.isFinite(globalThis.__BITVID_NIP07_LOGIN_TIMEOUT_MS__)
      ? Math.floor(globalThis.__BITVID_NIP07_LOGIN_TIMEOUT_MS__)
      : null;

  if (overrideValue !== null && overrideValue > 0) {
    return Math.max(1_000, overrideValue);
  }

  return NIP07_LOGIN_TIMEOUT_MS;
}

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
    timeoutMs = getNip07LoginTimeoutMs(),
    message = NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
  } = {},
) {
  const numericTimeout = Number(timeoutMs);
  const effectiveTimeout =
    Number.isFinite(numericTimeout) && numericTimeout > 0
      ? numericTimeout
      : getNip07LoginTimeoutMs();

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
    timeoutMs = getNip07LoginTimeoutMs(),
    retryMultiplier = 2,
    priority = NIP07_PRIORITY.NORMAL,
  } = {},
) {
  // We wrap the entire retry logic in a queue task to ensure only one
  // request hits the extension at a time.
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

  if (typeof extension.enable !== "function") {
    return { ok: true, code: "enable-unavailable" };
  }

  const normalized = Array.isArray(outstandingMethods)
    ? outstandingMethods
        .map((method) => normalizePermissionMethod(method))
        .filter(Boolean)
    : [];

  const permissionVariants = [null];
  if (normalized.length) {
    permissionVariants.push({
      permissions: normalized.map((method) => ({ method })),
    });
    permissionVariants.push({ permissions: normalized });
  }

  const enableTimeoutMs = getEnableVariantTimeoutMs();
  const loginTimeoutMs = getNip07LoginTimeoutMs();
  const shortEnableTimeoutMs = Math.min(5_000, enableTimeoutMs);
  const explicitEnableTimeoutMs =
    enableTimeoutMs < 1000
      ? enableTimeoutMs
      : Math.max(enableTimeoutMs, Math.min(15_000, loginTimeoutMs));

  let lastError = null;
  for (const options of permissionVariants) {
    // Prefer the null enable() call with a shorter interactive window.
    // If it is rejected, try explicit-permission variants with a longer timeout
    // to accommodate extensions that require structured permissions.
    const variantTimeoutOverrides =
      options === null
        ? {
            timeoutMs: shortEnableTimeoutMs,
            retryMultiplier: 1,
          }
        : {
            timeoutMs: explicitEnableTimeoutMs,
            retryMultiplier: 1,
          };

    try {
      await runNip07WithRetry(
        () => (options ? extension.enable(options) : extension.enable()),
        { label: "extension.enable", ...variantTimeoutOverrides },
      );
      return { ok: true };
    } catch (error) {
      lastError = error;
      if (options && isDevMode) {
        userLogger.warn(
          "[nostr] extension.enable request with explicit permissions failed:",
          error,
        );
      }
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
  getNip07LoginTimeoutMs,
  readStoredNip07Permissions,
  writeStoredNip07Permissions,
  clearStoredNip07Permissions,
  normalizePermissionMethod,
};

export function waitForNip07Extension(timeoutMs = 5000) {
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
    const interval = setInterval(() => {
      if (window.nostr) {
        clearInterval(interval);
        resolve(window.nostr);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Nostr extension not found within timeout."));
      }
    }, 50);
  });
}
