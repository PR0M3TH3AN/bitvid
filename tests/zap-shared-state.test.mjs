import assert from "node:assert/strict";

const sharedStateModule = await import("../js/payments/zapSharedState.js");
const feeModule = await import("../js/payments/platformFee.js");

const { calculateZapShares } = sharedStateModule;
const { resolvePlatformFeePercent } = feeModule;

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
  const percent = resolvePlatformFeePercent("not-a-number");
  assert.equal(percent, 0);
})();

console.log("zap-shared-state tests passed");
