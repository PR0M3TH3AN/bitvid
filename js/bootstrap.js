// js/bootstrap.js

import Application from "./app.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import { loadView } from "./viewManager.js";

function mergeServices(overrides = {}) {
  const merged = { nostrService, r2Service };

  if (overrides && typeof overrides === "object") {
    if (overrides.nostrService) {
      merged.nostrService = overrides.nostrService;
    }
    if (overrides.r2Service) {
      merged.r2Service = overrides.r2Service;
    }
  }

  return merged;
}

export function createApplication({ services, loadView: loadViewOverride } = {}) {
  return new Application({
    services: mergeServices(services),
    loadView: typeof loadViewOverride === "function" ? loadViewOverride : loadView,
  });
}

export default createApplication;
