// js/utils/logger.js
// Provides frozen logger channels so both modules and inline scripts share
// consistent dev-vs-user logging semantics without duplicating feature gates.
// The dev channel now exposes a `debug` helper for high-volume traces that
// should never reach production consoles.

import { isDevMode } from "../config.js";

const NOOP = () => {};

function resolveConsole() {
  if (typeof console === "undefined" || console === null) {
    return null;
  }
  return console;
}

/**
 * Returns a console shim with safe wrappers for the standard log levels.
 * Each method gracefully falls back to console.log or a noop when unavailable.
 */
function createConsoleAdapter() {
  const consoleRef = resolveConsole();
  if (!consoleRef) {
    return {
      log: NOOP,
      info: NOOP,
      debug: NOOP,
      warn: NOOP,
      error: NOOP,
    };
  }

  const fallback = typeof consoleRef.log === "function" ? consoleRef.log.bind(consoleRef) : NOOP;

  return {
    log: typeof consoleRef.log === "function" ? consoleRef.log.bind(consoleRef) : fallback,
    info: typeof consoleRef.info === "function" ? consoleRef.info.bind(consoleRef) : fallback,
    debug: typeof consoleRef.debug === "function" ? consoleRef.debug.bind(consoleRef) : fallback,
    warn: typeof consoleRef.warn === "function" ? consoleRef.warn.bind(consoleRef) : fallback,
    error: typeof consoleRef.error === "function" ? consoleRef.error.bind(consoleRef) : fallback,
  };
}

const consoleAdapter = createConsoleAdapter();
const USER_PREFIX = "[bitvid]";

function extractForceFlag(args) {
  if (args.length === 0) {
    return { args, force: false };
  }

  const last = args[args.length - 1];
  if (last && typeof last === "object" && !Array.isArray(last) && Object.prototype.hasOwnProperty.call(last, "force")) {
    const cloned = [...args];
    const options = cloned.pop();
    return { args: cloned, force: Boolean(options.force) };
  }

  return { args, force: false };
}

const devLogger = Object.freeze({
  log: (...args) => {
    if (!isDevMode) return;
    consoleAdapter.log(...args);
  },
  info: (...args) => {
    if (!isDevMode) return;
    consoleAdapter.info(...args);
  },
  debug: (...args) => {
    if (!isDevMode) return;
    consoleAdapter.debug(...args);
  },
  warn: (...args) => {
    if (!isDevMode) return;
    consoleAdapter.warn(...args);
  },
  error: (...args) => {
    if (!isDevMode) return;
    consoleAdapter.error(...args);
  },
});

const userLogger = Object.freeze({
  log: (...rawArgs) => {
    const { args, force } = extractForceFlag(rawArgs);
    if (!force && args.length === 0) {
      return;
    }

    if (force) {
      consoleAdapter.log(USER_PREFIX, ...args);
      return;
    }

    const [message, ...rest] = args;
    if (typeof message === "string" && rest.length === 0) {
      consoleAdapter.log(`${USER_PREFIX} ${message}`);
      return;
    }

    if (message !== undefined) {
      consoleAdapter.log(USER_PREFIX, message);
    }
  },
  info: (...rawArgs) => {
    const { args, force } = extractForceFlag(rawArgs);
    if (!force && args.length === 0) {
      return;
    }

    if (force) {
      consoleAdapter.info(USER_PREFIX, ...args);
      return;
    }

    const [message, ...rest] = args;
    if (typeof message === "string" && rest.length === 0) {
      consoleAdapter.info(`${USER_PREFIX} ${message}`);
      return;
    }

    if (message !== undefined) {
      consoleAdapter.info(USER_PREFIX, message);
    }
  },
  warn: (...args) => {
    consoleAdapter.warn(USER_PREFIX, ...args);
  },
  error: (...args) => {
    consoleAdapter.error(USER_PREFIX, ...args);
  },
});

const logger = Object.freeze({
  dev: devLogger,
  user: userLogger,
});

function isCompatibleLogger(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const channelRequirements = {
    dev: ["log", "info", "debug", "warn", "error"],
    user: ["log", "info", "warn", "error"],
  };

  return Object.entries(channelRequirements).every(([channel, methods]) => {
    const obj = candidate[channel];
    if (!obj || typeof obj !== "object") {
      return false;
    }
    return methods.every((method) => typeof obj[method] === "function");
  });
}

if (typeof window !== "undefined") {
  if (!isCompatibleLogger(window.bitvidLogger)) {
    window.bitvidLogger = logger;
  }
}

Object.freeze(logger);

export default logger;
export { devLogger, userLogger };
