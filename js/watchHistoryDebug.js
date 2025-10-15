// js/watchHistoryDebug.js

import { devLogger } from "./utils/logger.js";

const WATCH_HISTORY_DEBUG_STORAGE_KEY =
  "bitvid:debug:watch-history";

const globalScope =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
    ? window
    : typeof self !== "undefined"
    ? self
    : null;

const TRUTHY_VALUES = new Set([
  "1",
  "true",
  "yes",
  "on",
  "enable",
  "enabled",
  "debug",
  "verbose",
  "watch",
]);

const FALSY_VALUES = new Set([
  "0",
  "false",
  "no",
  "off",
  "disable",
  "disabled",
  "quiet",
  "silent",
]);

function parseFlagValue(value) {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }
  if (FALSY_VALUES.has(normalized)) {
    return false;
  }
  return null;
}

function safeReadStorageFlag(storage) {
  if (!storage || typeof storage.getItem !== "function") {
    return null;
  }
  try {
    const raw = storage.getItem(WATCH_HISTORY_DEBUG_STORAGE_KEY);
    if (raw === null || raw === undefined) {
      return null;
    }
    return parseFlagValue(String(raw));
  } catch (error) {
    return null;
  }
}

function safeWriteStorageFlag(storage, value) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }
  try {
    storage.setItem(WATCH_HISTORY_DEBUG_STORAGE_KEY, value ? "true" : "false");
  } catch (error) {
    // Ignore storage errors (e.g., quota exceeded, private mode restrictions).
  }
}

function persistFlag(scope, value) {
  if (value === null) {
    return;
  }
  safeWriteStorageFlag(scope?.sessionStorage, value);
  safeWriteStorageFlag(scope?.localStorage, value);
}

function readFlagFromUrl(scope) {
  if (!scope || typeof scope.location?.search !== "string") {
    return null;
  }
  const search = scope.location.search;
  if (!search) {
    return null;
  }
  try {
    const params = new URLSearchParams(search);
    if (!params.has("watchHistoryDebug")) {
      return null;
    }
    const parsed = parseFlagValue(params.get("watchHistoryDebug"));
    if (parsed === null) {
      return null;
    }
    persistFlag(scope, parsed);
    return parsed;
  } catch (error) {
    return null;
  }
}

function resolveExplicitFlag(scope) {
  if (!scope) {
    return null;
  }

  const runtimeFlag = scope.__BITVID_ENABLE_WATCH_HISTORY_DEBUG__;
  if (runtimeFlag === true || runtimeFlag === false) {
    return Boolean(runtimeFlag);
  }

  const altRuntimeFlag = scope.BITVID_WATCH_HISTORY_DEBUG;
  if (altRuntimeFlag === true || altRuntimeFlag === false) {
    return Boolean(altRuntimeFlag);
  }

  const urlFlag = readFlagFromUrl(scope);
  if (urlFlag !== null) {
    return urlFlag;
  }

  const sessionFlag = safeReadStorageFlag(scope.sessionStorage);
  if (sessionFlag !== null) {
    return sessionFlag;
  }

  const localFlag = safeReadStorageFlag(scope.localStorage);
  if (localFlag !== null) {
    return localFlag;
  }

  return null;
}

export function isWatchHistoryDebugEnabled() {
  const scope = globalScope;
  const explicitFlag = resolveExplicitFlag(scope);
  if (explicitFlag !== null) {
    return explicitFlag;
  }

  if (typeof process !== "undefined" && process?.env?.NODE_ENV) {
    return process.env.NODE_ENV !== "production";
  }

  return false;
}

export function logWatchHistoryDebug(namespace, level, message, details) {
  if (!isWatchHistoryDebugEnabled()) {
    return;
  }

  const methodName =
    typeof level === "string" && level && typeof devLogger[level] === "function"
      ? level
      : typeof devLogger.info === "function"
        ? "info"
        : "log";

  const prefix = namespace ? `[${namespace}] ${message}` : message;

  try {
    if (details && typeof details === "object") {
      devLogger[methodName](prefix, details);
    } else {
      devLogger[methodName](prefix);
    }
  } catch (error) {
    if (typeof devLogger.log === "function") {
      devLogger.log(prefix);
    }
  }
}
