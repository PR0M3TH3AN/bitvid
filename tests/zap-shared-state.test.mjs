import assert from "node:assert/strict";

const sharedStateModule = await import("../js/payments/zapSharedState.js");
const feeModule = await import("../js/payments/platformFee.js");

const { calculateZapShares } = sharedStateModule;
const { resolvePlatformFeePercent, getDefaultPlatformFeePercent } = feeModule;

(function testCalculateZapSharesSupportsRatioOverride() {
  const result = calculateZapShares(35, "70/30");
  assert.equal(result.total, 35);
  assert.equal(result.platformShare, 10);
  assert.equal(result.creatorShare, 25);
  assert.equal(result.feePercent, 30);
})();

(function testCalculateZapSharesHandlesPercentStrings() {
  const result = calculateZapShares(200, "30% ");
  assert.equal(result.platformShare, 60);
  assert.equal(result.creatorShare, 140);
  assert.equal(result.feePercent, 30);
})();

(function testResolvePlatformFeePercentFallsBackToDefault() {
  // An UNPARSEABLE override must fall back to the configured platform default
  // (getDefaultPlatformFeePercent), NOT to 0. Falling back to 0 would let a
  // garbage override silently DISABLE the platform fee (a bypass). Assert the
  // contract against the configured default rather than a hard-coded number so
  // the test stays correct if PLATFORM_FEE_PERCENT changes.
  const expected = getDefaultPlatformFeePercent();
  const percent = resolvePlatformFeePercent("not-a-number");
  assert.equal(percent, expected);
  // Sanity: with the platform fee configured (>0), the fallback must be non-zero
  // (i.e. a junk override cannot zero out the fee).
  assert.ok(expected > 0, "platform fee default should be configured > 0");
  assert.ok(percent > 0, "junk override must not disable the platform fee");
})();

console.log("zap-shared-state tests passed");
