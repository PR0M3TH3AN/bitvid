// js/bootstrap.js

import Application from "./app.js";
import {
  DEFAULT_TRUST_SEED_NPUBS,
  FEATURE_TRUST_SEEDS,
} from "./constants.js";
import { accessControl } from "./accessControl.js";
import moderationService from "./services/moderationService.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import { loadView } from "./viewManager.js";

function mergeSeedsWithWhitelist(source) {
  const seeds = new Set(DEFAULT_TRUST_SEED_NPUBS);

  if (source && typeof source[Symbol.iterator] === "function") {
    for (const value of source) {
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        seeds.add(trimmed);
      }
    }
  }

  return seeds;
}

async function bootstrapTrustedSeeds() {
  if (
    !(
      FEATURE_TRUST_SEEDS &&
      moderationService &&
      typeof moderationService.setTrustedSeeds === "function"
    )
  ) {
    return;
  }

  const applySeeds = (whitelist = null) => {
    try {
      const merged = mergeSeedsWithWhitelist(
        whitelist ?? accessControl?.getWhitelist?.()
      );
      moderationService.setTrustedSeeds(merged);
    } catch {
      // Swallow bootstrap errors so login flow can continue; flag enables quick rollback.
    }
  };

  try {
    if (accessControl && typeof accessControl.ensureReady === "function") {
      await accessControl.ensureReady();
    }
  } catch {
    // Swallow bootstrap errors so login flow can continue; flag enables quick rollback.
  }

  applySeeds();

  if (accessControl && typeof accessControl.onWhitelistChange === "function") {
    accessControl.onWhitelistChange((nextWhitelist) => {
      applySeeds(nextWhitelist);
    });
  }
}

bootstrapTrustedSeeds();

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
