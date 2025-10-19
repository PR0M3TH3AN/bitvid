import { devLogger, userLogger } from "../js/utils/logger.js";
import {
  initThemeController,
  setThemeAccentOverrides,
} from "../../js/themeController.js";
import { createBeaconApp } from "../app.js";

const CONFIG_MODULE_ID = "../../config/instance-config.js";

function resolveGlobalScope() {
  return (
    (typeof window !== "undefined" && window) ||
    (typeof globalThis !== "undefined" && globalThis) ||
    null
  );
}

function resolveWebTorrent() {
  const globalScope = resolveGlobalScope();

  if (globalScope && typeof globalScope.WebTorrent === "function") {
    return globalScope.WebTorrent;
  }

  throw new Error("WebTorrent runtime is not available on the global scope");
}

let appInstance = null;

const loadThemeAccentOverrides = async () => {
  try {
    const configModule = await import(CONFIG_MODULE_ID);
    if (configModule && typeof configModule.THEME_ACCENT_OVERRIDES !== "undefined") {
      return configModule.THEME_ACCENT_OVERRIDES;
    }
  } catch (error) {
    devLogger.warn(
      `[beacon] Failed to load theme accent overrides from ${CONFIG_MODULE_ID}`,
      error,
    );
  }

  return null;
};

const initializeThemeController = async () => {
  try {
    const overrides = await loadThemeAccentOverrides();
    if (overrides) {
      setThemeAccentOverrides(overrides);
    }
  } catch (error) {
    devLogger.warn("[beacon] Unable to hydrate theme accent overrides", error);
  }

  try {
    initThemeController();
  } catch (error) {
    devLogger.warn("[beacon] Failed to initialize theme controller", error);
  }
};

initializeThemeController();

function mountBeaconApp() {
  if (appInstance) {
    devLogger.info("[beacon] Reusing existing beacon app instance");
    return appInstance;
  }

  if (typeof document === "undefined") {
    throw new Error("Beacon runtime requires a document environment");
  }

  const WebTorrentCtor = resolveWebTorrent();
  devLogger.info("[beacon] Creating beacon app instance");
  appInstance = createBeaconApp({ documentRef: document, WebTorrentCtor });
  appInstance.mount();
  return appInstance;
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        mountBeaconApp();
      } catch (error) {
        userLogger.error("[beacon] Failed to mount app", error);
      }
    });
  } else {
    try {
      mountBeaconApp();
    } catch (error) {
      userLogger.error("[beacon] Failed to mount app", error);
    }
  }
}

export { createBeaconApp, mountBeaconApp };
