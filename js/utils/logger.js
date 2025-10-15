// js/utils/logger.js

import { isDevMode } from "../config.js";

const noop = () => {};

const globalConsole = typeof globalThis !== "undefined" ? globalThis.console : undefined;

const safeConsole = {
  log: globalConsole?.log?.bind(globalConsole) ?? noop,
  info: globalConsole?.info?.bind(globalConsole) ?? noop,
  warn: globalConsole?.warn?.bind(globalConsole) ?? noop,
  error: globalConsole?.error?.bind(globalConsole) ?? noop,
  debug: globalConsole?.debug?.bind(globalConsole) ?? noop,
  trace: globalConsole?.trace?.bind(globalConsole) ?? noop,
  group: globalConsole?.group?.bind(globalConsole) ?? noop,
  groupCollapsed: globalConsole?.groupCollapsed?.bind(globalConsole) ?? noop,
  groupEnd: globalConsole?.groupEnd?.bind(globalConsole) ?? noop,
  table: globalConsole?.table?.bind(globalConsole) ?? noop,
  assert: globalConsole?.assert?.bind(globalConsole) ?? noop,
};

function createChannel({ gateLogs, alwaysWarnError }) {
  return {
    log: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.log(...args);
      }
    },
    info: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.info(...args);
      }
    },
    debug: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.debug(...args);
      }
    },
    trace: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.trace(...args);
      }
    },
    group: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.group(...args);
      }
    },
    groupCollapsed: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.groupCollapsed(...args);
      }
    },
    groupEnd: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.groupEnd(...args);
      }
    },
    table: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.table(...args);
      }
    },
    assert: (...args) => {
      if (!gateLogs || isDevMode) {
        safeConsole.assert(...args);
      }
    },
    warn: (...args) => {
      if (!alwaysWarnError && gateLogs && !isDevMode) {
        return;
      }
      safeConsole.warn(...args);
    },
    error: (...args) => {
      if (!alwaysWarnError && gateLogs && !isDevMode) {
        return;
      }
      safeConsole.error(...args);
    },
  };
}

const devChannel = createChannel({ gateLogs: true, alwaysWarnError: false });
const userChannel = createChannel({ gateLogs: true, alwaysWarnError: true });

const logger = {
  dev: devChannel,
  user: userChannel,
};

export const devLogger = devChannel;
export const userLogger = userChannel;
export default logger;

if (typeof window !== "undefined") {
  window.bitvidLogger = logger;
}
