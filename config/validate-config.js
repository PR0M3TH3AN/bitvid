// config/validate-config.js
// -----------------------------------------------------------------------------
// Runtime validation helpers for instance-level configuration
// -----------------------------------------------------------------------------

import {
  ADMIN_SUPER_NPUB,
  PLATFORM_FEE_PERCENT,
  PLATFORM_LUD16_OVERRIDE,
} from "./instance-config.js";

function assertSuperAdminConfigured(value) {
  if (typeof value !== "string") {
    throw new Error(
      "ADMIN_SUPER_NPUB must be a string exported from config/instance-config.js."
    );
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      "ADMIN_SUPER_NPUB is required. Populate it with the Super Admin npub in config/instance-config.js."
    );
  }

  if (!trimmed.startsWith("npub")) {
    throw new Error(
      "ADMIN_SUPER_NPUB should be a bech32 npub (e.g., starting with 'npub')."
    );
  }
  return trimmed;
}

function assertPlatformFeeInRange(value) {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(value);

  if (!Number.isFinite(numericValue)) {
    throw new Error(
      "PLATFORM_FEE_PERCENT must be a finite number between 0 and 100."
    );
  }

  if (numericValue < 0 || numericValue > 100) {
    throw new Error("PLATFORM_FEE_PERCENT must be between 0 and 100 inclusive.");
  }

  return numericValue;
}

function getPlatformLud16Override(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function resolveConfig(overrides = {}) {
  return {
    adminSuperNpub:
      overrides.ADMIN_SUPER_NPUB ?? ADMIN_SUPER_NPUB,
    platformFeePercent:
      overrides.PLATFORM_FEE_PERCENT ?? PLATFORM_FEE_PERCENT,
    platformLud16Override:
      overrides.PLATFORM_LUD16_OVERRIDE ?? PLATFORM_LUD16_OVERRIDE,
  };
}

export function validateInstanceConfig(overrides) {
  const config = resolveConfig(overrides);
  assertSuperAdminConfigured(config.adminSuperNpub);
  const platformFeePercent = assertPlatformFeeInRange(
    config.platformFeePercent
  );
  const trimmedOverride = getPlatformLud16Override(
    config.platformLud16Override
  );

  if (platformFeePercent > 0 && !trimmedOverride) {
    throw new Error(
      "PLATFORM_FEE_PERCENT is positive but PLATFORM_LUD16_OVERRIDE is empty. Set PLATFORM_LUD16_OVERRIDE to the Lightning address that should receive the platform's split, or publish a lud16 value on the Super Admin profile so bitvid can route platform fees."
    );
  }
}
