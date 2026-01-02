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
import hashtagPreferences from "./services/hashtagPreferencesService.js";
import { devLogger, userLogger } from "./utils/logger.js";

const TRUST_SEED_READY_TIMEOUT_MS = 3500;

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

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRelaysReady({ timeoutMs = TRUST_SEED_READY_TIMEOUT_MS } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (
      nostrService?.nostrClient?.relays &&
      Array.isArray(nostrService.nostrClient.relays) &&
      nostrService.nostrClient.relays.length > 0
    ) {
      return true;
    }
    await delay(125);
  }
  return false;
}

async function waitForAccessControl({ timeoutMs = TRUST_SEED_READY_TIMEOUT_MS } = {}) {
  if (!accessControl || typeof accessControl.ensureReady !== "function") {
    return { ok: true, timedOut: false };
  }

  let timedOut = false;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error("accessControl ensureReady timed out"));
    }, timeoutMs);
  });

  try {
    await Promise.race([accessControl.ensureReady(), timeoutPromise]);
    return { ok: true, timedOut: false };
  } catch (error) {
    if (timedOut) {
      devLogger.warn(
        "[bootstrap] access control hydration timed out; falling back to default trust seeds.",
        error,
      );
      return { ok: true, timedOut: true };
    }
    throw error;
  }
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
      if (
        moderationService &&
        typeof moderationService.recomputeAllSummaries === "function"
      ) {
        moderationService.recomputeAllSummaries();
      }
    } catch (error) {
      userLogger.warn("[bootstrap] Failed to apply trusted seeds", error);
    }
  };

  let attempts = 0;
  const hydrate = async () => {
    attempts += 1;
    try {
      const result = await waitForAccessControl();
      applySeeds();
      return result;
    } catch (error) {
      userLogger.warn(
        "[bootstrap] Failed to hydrate admin lists for trusted seeds",
        error,
      );
      return { ok: false, timedOut: false, error };
    }
  };

  const hydrateResult = await hydrate();

  const runAsyncRetry = async () => {
    if (hydrateResult?.ok || attempts >= 2) {
      return;
    }

    const relaysReady = await waitForRelaysReady();
    if (relaysReady) {
      await hydrate();
    } else {
      devLogger.warn(
        "[bootstrap] Skipping trusted seed retry because relays were not ready in time.",
      );
      applySeeds();
    }
  };

  runAsyncRetry().catch((error) => {
    userLogger.warn("[bootstrap] Trusted seed retry failed", error);
  });

  if (!hydrateResult?.ok) {
    applySeeds();
  }

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

export const trustedSeedsReadyPromise = bootstrapTrustedSeeds();

function mergeServices(overrides = {}) {
  const merged = { nostrService, r2Service, hashtagPreferences };

  if (overrides && typeof overrides === "object") {
    if (overrides.nostrService) {
      merged.nostrService = overrides.nostrService;
    }
    if (overrides.r2Service) {
      merged.r2Service = overrides.r2Service;
    }
    if (overrides.hashtagPreferences) {
      merged.hashtagPreferences = overrides.hashtagPreferences;
    }
  }

  return merged;
}

export async function createApplication({ services, loadView: loadViewOverride } = {}) {
  try {
    await trustedSeedsReadyPromise;
  } catch (error) {
    userLogger.warn(
      "[bootstrap] Failed to await trusted seed hydration before creating application",
      error,
    );
  }

  return new Application({
    services: mergeServices(services),
    loadView: typeof loadViewOverride === "function" ? loadViewOverride : loadView,
  });
}

export default createApplication;
