import { devLogger, userLogger } from "../utils/logger.js";

export const NIP07_LOGIN_TIMEOUT_MS = 60_000; // 60 seconds
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

export const DEFAULT_NIP07_PERMISSION_METHODS = Object.freeze([
  // Core auth + relay metadata
  "get_public_key",
  "sign_event",
  "read_relays",
  "write_relays",
  ...DEFAULT_NIP07_ENCRYPTION_METHODS,
]);

// Module-level mutex to serialize NIP-07 extension requests.
// This prevents "message channel closed" errors caused by race conditions
// when multiple components (blocks, DMs, auth) query the extension simultaneously.
let nip07Queue = Promise.resolve();

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

  const queueItem = nip07Queue.then(() =>
    executeTask().then(
      (res) => ({ ok: true, value: res }),
      (err) => ({ ok: false, error: err }),
    ),
  );

  // Advance the queue pointer
  nip07Queue = queueItem.then(() => {});

  // Await the specific result for this call
  const result = await queueItem;
  if (result.ok) {
    return result.value;
  }
  throw result.error;
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

  const permissionVariants = [];
  if (normalized.length) {
    permissionVariants.push({
      permissions: normalized.map((method) => ({ method })),
    });
    permissionVariants.push({ permissions: normalized });
  }
  permissionVariants.push(null);

  let lastError = null;
  for (const options of permissionVariants) {
    // If specific permissions are requested (variants 1 & 2), fail fast (3s)
    // to avoid hanging if the extension doesn't support the structured format.
    // If we fall back to standard enable() (null), allow the full user interaction time.
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
