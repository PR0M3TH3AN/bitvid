import { devLogger as defaultDevLogger, userLogger as defaultUserLogger } from "./utils/logger.js";

const createLoggerFacade = (logger, fallback) => {
  if (logger && typeof logger === "object") {
    return {
      log: typeof logger.log === "function" ? logger.log.bind(logger) : fallback.log,
      warn:
        typeof logger.warn === "function" ? logger.warn.bind(logger) : fallback.warn,
      error:
        typeof logger.error === "function"
          ? logger.error.bind(logger)
          : fallback.error,
    };
  }

  return fallback;
};

const noopLogger = {
  log() {},
  warn() {},
  error() {},
};

export function createHashChangeHandler({
  getApplication,
  getApplicationReady,
  loadView,
  viewInitRegistry,
  devLogger = defaultDevLogger,
  userLogger = defaultUserLogger,
} = {}) {
  const devLog = createLoggerFacade(devLogger, noopLogger);
  const userLog = createLoggerFacade(userLogger, noopLogger);

  const getReadyPromise = () => {
    if (typeof getApplicationReady === "function") {
      return getApplicationReady();
    }
    return Promise.resolve();
  };

  const resolveIsLoggedIn = () => {
    if (typeof getApplication !== "function") {
      return false;
    }
    const app = getApplication();
    if (!app || typeof app.isUserLoggedIn !== "function") {
      return false;
    }
    return Boolean(app.isUserLoggedIn());
  };

  return async function handleHashChange() {
    const currentHash =
      typeof window !== "undefined" && window.location
        ? window.location.hash
        : undefined;
    devLog.log("handleHashChange called, current hash =", currentHash);

    try {
      await getReadyPromise();
    } catch (error) {
      userLog.warn(
        "Proceeding with hash handling despite application initialization failure:",
        error,
      );
    }

    const hash =
      typeof window !== "undefined" && window.location && window.location.hash
        ? window.location.hash
        : "";
    if (hash === "#kids") {
      window.location.hash = "#view=kids";
      return;
    }
    const match = hash.match(/^#view=([^&]+)/);

    try {
      if (!match || !match[1]) {
        const defaultViewName = resolveIsLoggedIn()
          ? "for-you"
          : "most-recent-videos";
        await loadView(`views/${defaultViewName}.html`);
        const initFn = viewInitRegistry?.[defaultViewName];
        if (typeof initFn === "function") {
          await initFn();
        }
        return;
      }

      const viewName = match[1];
      if (typeof viewName === "string" && viewName.toLowerCase() === "history") {
      }
      const viewUrl = `views/${viewName}.html`;

      await loadView(viewUrl);
      const initFn = viewInitRegistry?.[viewName];
      if (typeof initFn === "function") {
        await initFn();
      }
    } catch (error) {
      userLog.error("Failed to handle hash change:", error);
    }
  };
}
