// config/validate-config.js
// -----------------------------------------------------------------------------
// Runtime validation helpers for instance-level configuration
// -----------------------------------------------------------------------------

import { ADMIN_SUPER_NPUB, PLATFORM_FEE_PERCENT } from "./instance-config.js";

function assertSuperAdminConfigured() {
  if (typeof ADMIN_SUPER_NPUB !== "string") {
    throw new Error(
      "ADMIN_SUPER_NPUB must be a string exported from config/instance-config.js."
    );
  }

  const trimmed = ADMIN_SUPER_NPUB.trim();
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
}

function assertPlatformFeeInRange() {
  const value =
    typeof PLATFORM_FEE_PERCENT === "number"
      ? PLATFORM_FEE_PERCENT
      : Number.parseFloat(PLATFORM_FEE_PERCENT);

  if (!Number.isFinite(value)) {
    throw new Error(
      "PLATFORM_FEE_PERCENT must be a finite number between 0 and 100."
    );
  }

  if (value < 0 || value > 100) {
    throw new Error("PLATFORM_FEE_PERCENT must be between 0 and 100 inclusive.");
  }
}

export function validateInstanceConfig() {
  assertSuperAdminConfigured();
  assertPlatformFeeInRange();
}
