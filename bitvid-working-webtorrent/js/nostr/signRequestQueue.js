import { devLogger } from "../utils/logger.js";

const DEFAULT_SIGN_TIMEOUT_MS = 20_000;
const signQueues = new WeakMap();

const SIGN_ERROR_CODES = new Set([
  "permission-denied",
  "timeout",
  "not-capable",
  "signer-disconnected",
]);

function resolveTimeoutMs(timeoutMs) {
  const candidate = Number(timeoutMs);
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.floor(candidate);
  }
  return DEFAULT_SIGN_TIMEOUT_MS;
}

function toError(value, message) {
  if (value instanceof Error) {
    return value;
  }
  const error = new Error(message);
  error.details = value;
  return error;
}

function normalizeSignError(error) {
  const normalized = toError(error, "signEvent failed");
  const existingCode = typeof normalized.code === "string" ? normalized.code : "";
  if (SIGN_ERROR_CODES.has(existingCode)) {
    return normalized;
  }

  const message = typeof normalized.message === "string"
    ? normalized.message.toLowerCase()
    : "";

  if (
    existingCode === "extension-permission-denied" ||
    message.includes("permission") ||
    message.includes("denied") ||
    message.includes("rejected")
  ) {
    normalized.code = "permission-denied";
    return normalized;
  }

  if (
    existingCode === "nostr-extension-missing" ||
    message.includes("disconnected") ||
    message.includes("not connected") ||
    message.includes("connection closed") ||
    message.includes("extension missing")
  ) {
    normalized.code = "signer-disconnected";
    return normalized;
  }

  if (existingCode === "sign-event-unavailable") {
    normalized.code = "not-capable";
    return normalized;
  }

  return normalized;
}

function createSignError(code, originalError) {
  const error = toError(
    originalError,
    originalError?.message || `signEvent failed with ${code}`,
  );
  error.code = code;
  if (originalError && originalError !== error) {
    error.details = originalError;
  }
  return error;
}

function runWithTimeout(operation, timeoutMs) {
  const resolvedTimeout = resolveTimeoutMs(timeoutMs);
  let timeoutId;
  let timedOut = false;
  const signPromise = Promise.resolve().then(operation);
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(createSignError("timeout", new Error(
        `signEvent timed out after ${resolvedTimeout}ms`,
      )));
    }, resolvedTimeout);
  });

  return Promise.race([signPromise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (timedOut) {
      void signPromise.catch((error) => {
        devLogger.warn("[nostr] signEvent resolved after timeout:", error);
      });
    }
  });
}

export async function queueSignEvent(signer, event, options = {}) {
  if (!signer || typeof signer !== "object") {
    throw createSignError("not-capable", new Error("signer-unavailable"));
  }

  if (typeof signer.signEvent !== "function") {
    throw createSignError("not-capable", new Error("sign-event-unavailable"));
  }

  const queue = signQueues.get(signer) || Promise.resolve();
  const runSign = async () => runWithTimeout(
    () => signer.signEvent(event),
    options.timeoutMs,
  );
  const queued = queue.then(runSign, runSign);
  signQueues.set(signer, queued.catch(() => {}));

  try {
    return await queued;
  } catch (error) {
    throw normalizeSignError(error);
  }
}
