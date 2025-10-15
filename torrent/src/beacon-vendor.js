import { createBeaconApp } from "../app.js";
import { userLogger } from "../../js/utils/logger.js";

function resolveWebTorrent() {
  const globalScope =
    (typeof window !== "undefined" && window) ||
    (typeof globalThis !== "undefined" && globalThis) ||
    null;

  if (globalScope && typeof globalScope.WebTorrent === "function") {
    return globalScope.WebTorrent;
  }

  throw new Error("WebTorrent runtime is not available on the global scope");
}

let appInstance = null;

function mountBeaconApp() {
  if (appInstance) {
    return appInstance;
  }

  if (typeof document === "undefined") {
    throw new Error("Beacon runtime requires a document environment");
  }

  const WebTorrentCtor = resolveWebTorrent();
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
