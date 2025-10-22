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
  let hasStarted = false;
  let cachedPromise = null;

  const getOrStartOperation = () => {
    if (!hasStarted) {
      hasStarted = true;
      try {
        cachedPromise = Promise.resolve(operation());
      } catch (error) {
        hasStarted = false;
        cachedPromise = null;
        throw error;
      }
    }

    return cachedPromise;
  };

  try {
    return await withNip07Timeout(getOrStartOperation, {
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
      `[nostr] ${label} taking longer than ${timeoutMs}ms. Waiting up to ${extendedTimeout}ms for extension response.`,
    );

    return withNip07Timeout(getOrStartOperation, {
      timeoutMs: extendedTimeout,
      message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    });
  }
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
    const variantTimeoutOverrides = options
      ? {
          timeoutMs: Math.min(NIP07_LOGIN_TIMEOUT_MS, getEnableVariantTimeoutMs()),
          retryMultiplier: 1,
        }
      : { retryMultiplier: 1 };

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
