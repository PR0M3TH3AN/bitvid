// js/bootstrap.js

import Application from "./app.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import s3UploadService from "./services/s3UploadService.js";
import { loadView } from "./viewManager.js";
import hashtagPreferences from "./services/hashtagPreferencesService.js";
import { userLogger } from "./utils/logger.js";

function mergeServices(overrides = {}) {
  const merged = { nostrService, r2Service, s3Service: s3UploadService, hashtagPreferences };

  if (overrides && typeof overrides === "object") {
    if (overrides.nostrService) {
      merged.nostrService = overrides.nostrService;
    }
    if (overrides.r2Service) {
      merged.r2Service = overrides.r2Service;
    }
    if (overrides.s3Service) {
      merged.s3Service = overrides.s3Service;
    }
    if (overrides.hashtagPreferences) {
      merged.hashtagPreferences = overrides.hashtagPreferences;
    }
  }

  return merged;
}

export async function createApplication({ services, loadView: loadViewOverride } = {}) {
  return new Application({
    services: mergeServices(services),
    loadView: typeof loadViewOverride === "function" ? loadViewOverride : loadView,
  });
}

export default createApplication;
