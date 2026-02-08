import assert from "node:assert/strict";
import { test } from "node:test";

import { validateInstanceConfig } from "../config/validate-config.js";

// Common valid overrides to use as a base
const VALID_OVERRIDES = {
  ADMIN_SUPER_NPUB: "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
  PLATFORM_FEE_PERCENT: 5,
  PLATFORM_LUD16_OVERRIDE: "test@example.com",
};

test("validateInstanceConfig succeeds with valid configuration", () => {
  assert.doesNotThrow(() => validateInstanceConfig(VALID_OVERRIDES));
});

test(
  "validateInstanceConfig throws when platform fee is positive without a platform override",
  () => {
    const overrides = {
      ...VALID_OVERRIDES,
      PLATFORM_LUD16_OVERRIDE: "   ",
    };

    assert.throws(() => validateInstanceConfig(overrides), {
      message:
        "PLATFORM_FEE_PERCENT is positive but PLATFORM_LUD16_OVERRIDE is empty. Set PLATFORM_LUD16_OVERRIDE to the Lightning address that should receive the platform's split, or publish a lud16 value on the Super Admin profile so bitvid can route platform fees.",
    });
  }
);

test("validateInstanceConfig throws when ADMIN_SUPER_NPUB is empty", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    ADMIN_SUPER_NPUB: "   ",
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /ADMIN_SUPER_NPUB is required/,
  });
});

test("validateInstanceConfig throws when ADMIN_SUPER_NPUB does not start with npub", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    ADMIN_SUPER_NPUB: "invalid_npub",
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /ADMIN_SUPER_NPUB should be a bech32 npub/,
  });
});

test("validateInstanceConfig throws when PLATFORM_FEE_PERCENT is negative", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    PLATFORM_FEE_PERCENT: -1,
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /PLATFORM_FEE_PERCENT must be between 0 and 100 inclusive/,
  });
});

test("validateInstanceConfig throws when PLATFORM_FEE_PERCENT is greater than 100", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    PLATFORM_FEE_PERCENT: 101,
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /PLATFORM_FEE_PERCENT must be between 0 and 100 inclusive/,
  });
});

test("validateInstanceConfig throws when PLATFORM_FEE_PERCENT is not finite", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    PLATFORM_FEE_PERCENT: Infinity,
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /PLATFORM_FEE_PERCENT must be a finite number/,
  });
});

test("validateInstanceConfig throws when THEME_ACCENT_OVERRIDES has invalid hex color", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    THEME_ACCENT_OVERRIDES: {
      light: {
        accent: "invalid-hex",
      },
    },
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /must be a #RRGGBB hex color/,
  });
});

test("validateInstanceConfig throws when THEME_ACCENT_OVERRIDES structure is invalid", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    THEME_ACCENT_OVERRIDES: {
      light: "not-an-object",
    },
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /must be an object with accent overrides/,
  });
});

test("validateInstanceConfig throws when optional URL is invalid", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    BLOG_URL: "not-a-valid-url",
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /BLOG_URL must be a valid http\(s\) URL/,
  });
});

test("validateInstanceConfig throws when optional URL has invalid protocol", () => {
  const overrides = {
    ...VALID_OVERRIDES,
    BLOG_URL: "ftp://example.com",
  };

  assert.throws(() => validateInstanceConfig(overrides), {
    message: /BLOG_URL must be a valid http\(s\) URL/,
  });
});
