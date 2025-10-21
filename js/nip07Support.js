// js/nip07Support.js

import { isDevMode } from "./config.js";

export const NIP07_LOGIN_TIMEOUT_MS = 60_000; // 60 seconds
export const NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE =
  "Timed out waiting for the NIP-07 extension. Confirm the extension prompt in your browser toolbar and try again.";

const DEFAULT_ENABLE_VARIANT_TIMEOUT_MS = 7000;

export const DEFAULT_NIP07_PERMISSION_METHODS = Object.freeze([
  "get_public_key",
  "sign_event",
  "nip04.encrypt",
  "nip04.decrypt",
  "read_relays",
  "write_relays",
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

function withNip07Timeout(
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

    if (isDevMode) {
      console.warn(
        `[nostr] ${label} taking longer than ${timeoutMs}ms. Waiting up to ${extendedTimeout}ms for extension response.`,
      );
    }

    return withNip07Timeout(getOrStartOperation, {
      timeoutMs: extendedTimeout,
      message: NIP07_LOGIN_TIMEOUT_ERROR_MESSAGE,
    });
  }
}

export const __testExports = { runNip07WithRetry };
