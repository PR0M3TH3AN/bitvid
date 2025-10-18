// config/validate-config.js
// -----------------------------------------------------------------------------
// Runtime validation helpers for instance-level configuration
// -----------------------------------------------------------------------------

import {
  ADMIN_SUPER_NPUB,
  PLATFORM_FEE_PERCENT,
  PLATFORM_LUD16_OVERRIDE,
  THEME_ACCENT_OVERRIDES,
  BLOG_URL,
  COMMUNITY_URL,
  NOSTR_URL,
  GITHUB_URL,
  BETA_URL,
  DNS_URL,
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

const ACCENT_HEX_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;

function assertThemeAccentOverrides(overrides) {
  const source =
    overrides && typeof overrides === "object"
      ? overrides
      : THEME_ACCENT_OVERRIDES;

  const allowedThemes = new Set(["light", "dark"]);
  const allowedTokens = ["accent", "accentStrong", "accentPressed"];

  Object.entries(source).forEach(([theme, themeOverrides]) => {
    if (!allowedThemes.has(theme) || themeOverrides == null) {
      return;
    }

    if (typeof themeOverrides !== "object") {
      throw new Error(
        `THEME_ACCENT_OVERRIDES.${theme} must be an object with accent overrides.`
      );
    }

    allowedTokens.forEach((token) => {
      const rawValue = themeOverrides[token];
      if (rawValue == null || rawValue === "") {
        return;
      }

      if (typeof rawValue !== "string") {
        throw new Error(
          `THEME_ACCENT_OVERRIDES.${theme}.${token} must be a hex string (e.g., '#2563eb').`
        );
      }

      const trimmed = rawValue.trim();
      if (!ACCENT_HEX_PATTERN.test(trimmed)) {
        throw new Error(
          `THEME_ACCENT_OVERRIDES.${theme}.${token} must be a #RRGGBB hex color.`
        );
      }
    });
  });
}

function resolveConfig(overrides = {}) {
  return {
    adminSuperNpub:
      overrides.ADMIN_SUPER_NPUB ?? ADMIN_SUPER_NPUB,
    platformFeePercent:
      overrides.PLATFORM_FEE_PERCENT ?? PLATFORM_FEE_PERCENT,
    platformLud16Override:
      overrides.PLATFORM_LUD16_OVERRIDE ?? PLATFORM_LUD16_OVERRIDE,
    themeAccentOverrides:
      overrides.THEME_ACCENT_OVERRIDES ?? THEME_ACCENT_OVERRIDES,
    blogUrl: overrides.BLOG_URL ?? BLOG_URL,
    communityUrl: overrides.COMMUNITY_URL ?? COMMUNITY_URL,
    nostrUrl: overrides.NOSTR_URL ?? NOSTR_URL,
    githubUrl: overrides.GITHUB_URL ?? GITHUB_URL,
    betaUrl: overrides.BETA_URL ?? BETA_URL,
    dnsUrl: overrides.DNS_URL ?? DNS_URL,
  };
}

function assertOptionalHttpUrl(url, settingName) {
  if (url == null) {
    return null;
  }

  if (typeof url !== "string") {
    throw new Error(`${settingName} must be a string when provided.`);
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol || !/^https?:$/.test(parsed.protocol)) {
      throw new Error(`${settingName} must use http or https.`);
    }
  } catch (error) {
    throw new Error(
      `${settingName} must be a valid http(s) URL defined in config/instance-config.js.`,
      { cause: error },
    );
  }

  return trimmed;
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

  assertThemeAccentOverrides(config.themeAccentOverrides);
  assertOptionalHttpUrl(config.blogUrl, "BLOG_URL");
  assertOptionalHttpUrl(config.communityUrl, "COMMUNITY_URL");
  assertOptionalHttpUrl(config.nostrUrl, "NOSTR_URL");
  assertOptionalHttpUrl(config.githubUrl, "GITHUB_URL");
  assertOptionalHttpUrl(config.betaUrl, "BETA_URL");
  assertOptionalHttpUrl(config.dnsUrl, "DNS_URL");
}
