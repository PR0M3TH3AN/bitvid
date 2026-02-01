import assert from "node:assert/strict";
import { test } from "node:test";

import { validateInstanceConfig } from "../config/validate-config.js";

test(
  "validateInstanceConfig throws when platform fee is positive without a platform override",
  () => {
    const overrides = {
      ADMIN_SUPER_NPUB:
        "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      PLATFORM_FEE_PERCENT: 5,
      PLATFORM_LUD16_OVERRIDE: "   ",
    };

    assert.throws(() => validateInstanceConfig(overrides), {
      message:
        "PLATFORM_FEE_PERCENT is positive but PLATFORM_LUD16_OVERRIDE is empty. Set PLATFORM_LUD16_OVERRIDE to the Lightning address that should receive the platform's split, or publish a lud16 value on the Super Admin profile so bitvid can route platform fees.",
    });
  }
);
