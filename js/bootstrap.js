// js/bootstrap.js

import Application from "./app.js";
import {
  DEFAULT_TRUST_SEED_NPUBS,
  FEATURE_TRUST_SEEDS,
} from "./constants.js";
import { ADMIN_SUPER_NPUB } from "./config.js";
import { accessControl } from "./accessControl.js";
import moderationService from "./services/moderationService.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import { loadView } from "./viewManager.js";

function normalizeNpub(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildTrustedSeeds({ superAdmin, editors, fallbackSeeds }) {
  const seeds = new Set();

  const addSeed = (value) => {
    const normalized = normalizeNpub(value);
    if (normalized) {
      seeds.add(normalized);
    }
  };

  addSeed(superAdmin);

  if (editors && typeof editors[Symbol.iterator] === "function") {
    for (const value of editors) {
      addSeed(value);
    }
  }

  if (!seeds.size && fallbackSeeds && typeof fallbackSeeds[Symbol.iterator] === "function") {
    for (const value of fallbackSeeds) {
      addSeed(value);
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

  const applySeeds = () => {
    try {
      const editors =
        accessControl && typeof accessControl.getEditors === "function"
          ? accessControl.getEditors()
          : [];
      const seeds = buildTrustedSeeds({
        superAdmin: ADMIN_SUPER_NPUB,
        editors,
        fallbackSeeds: DEFAULT_TRUST_SEED_NPUBS,
      });
      moderationService.setTrustedSeeds(seeds);
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

  const applyOnChange = () => {
    applySeeds();
  };

  if (accessControl && typeof accessControl.onWhitelistChange === "function") {
    accessControl.onWhitelistChange(applyOnChange);
  }

  if (accessControl && typeof accessControl.onEditorsChange === "function") {
    accessControl.onEditorsChange(applyOnChange);
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
