import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (typeof globalThis.localStorage === "undefined") {
  const storage = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(String(key), String(value));
    },
    removeItem(key) {
      storage.delete(String(key));
    },
    clear() {
      storage.clear();
    },
  };
}

if (typeof window.localStorage === "undefined") {
  window.localStorage = globalThis.localStorage;
}

const nostrToolsStub = {
  getEventHash() {
    return "0".repeat(64);
  },
  nip19: {
    decode(value) {
      if (typeof value === "string" && value.startsWith("npub")) {
        return { type: "npub", data: "f".repeat(64) };
      }
      return null;
    },
  },
  SimplePool: class {
    async list() {
      return [];
    }
  },
};

window.NostrTools = nostrToolsStub;
globalThis.NostrTools = nostrToolsStub;

const {
  parsePercentValue,
  clampPercent,
  getDefaultPlatformFeePercent,
  resolvePlatformFeePercent,
} = await import("../js/payments/platformFee.js");

// ---------------------------------------------------------------------------
// parsePercentValue
// ---------------------------------------------------------------------------

(function testParsePercentValueWithIntegers() {
  assert.equal(parsePercentValue(0), 0);
  assert.equal(parsePercentValue(50), 50);
  assert.equal(parsePercentValue(100), 100);
  assert.equal(parsePercentValue(-10), -10);
})();

(function testParsePercentValueWithFloats() {
  assert.equal(parsePercentValue(2.5), 2.5);
  assert.equal(parsePercentValue(99.9), 99.9);
  assert.equal(parsePercentValue(0.001), 0.001);
})();

(function testParsePercentValueWithInfinity() {
  assert(Number.isNaN(parsePercentValue(Infinity)));
  assert(Number.isNaN(parsePercentValue(-Infinity)));
})();

(function testParsePercentValueWithNaN() {
  assert(Number.isNaN(parsePercentValue(NaN)));
})();

(function testParsePercentValueWithBigint() {
  assert.equal(parsePercentValue(50n), 50);
  assert.equal(parsePercentValue(0n), 0);
  assert.equal(parsePercentValue(100n), 100);
})();

(function testParsePercentValueWithPercentStrings() {
  assert.equal(parsePercentValue("50%"), 50);
  assert.equal(parsePercentValue("2.5%"), 2.5);
  assert.equal(parsePercentValue("100%"), 100);
  assert.equal(parsePercentValue("0%"), 0);
  assert.equal(parsePercentValue(" 30% "), 30);
})();

(function testParsePercentValueWithFractionStrings() {
  // Note: the implementation treats "a/b" as second / (first + second) * 100
  const result = parsePercentValue("70/30");
  assert.equal(result, 30);

  const halfResult = parsePercentValue("50/50");
  assert.equal(halfResult, 50);

  const fullResult = parsePercentValue("0/100");
  assert.equal(fullResult, 100);

  const noneResult = parsePercentValue("100/0");
  assert.equal(noneResult, 0);
})();

(function testParsePercentValueFractionDivisionByZero() {
  // When both parts are 0, total is 0 so it can't divide
  const result = parsePercentValue("0/0");
  // Falls through to direct numeric parse which gives NaN for "0/0"
  // Then fallback regex: matches "0", returns 0
  assert.equal(result, 0);
})();

(function testParsePercentValueWithNumericStrings() {
  assert.equal(parsePercentValue("42"), 42);
  assert.equal(parsePercentValue(" 10 "), 10);
  assert.equal(parsePercentValue("0"), 0);
})();

(function testParsePercentValueExtractsFromMixed() {
  // "50abc" -> strip %, get "50abc" -> Number("50abc") = NaN -> regex extracts "50"
  assert.equal(parsePercentValue("50abc"), 50);
})();

(function testParsePercentValueEmptyAndWhitespace() {
  assert(Number.isNaN(parsePercentValue("")));
  assert(Number.isNaN(parsePercentValue("   ")));
})();

(function testParsePercentValueNonNumericString() {
  assert(Number.isNaN(parsePercentValue("abc")));
  assert(Number.isNaN(parsePercentValue("no-numbers-here!")));
})();

(function testParsePercentValueNonFiniteTypes() {
  assert(Number.isNaN(parsePercentValue(null)));
  assert(Number.isNaN(parsePercentValue(undefined)));
  assert(Number.isNaN(parsePercentValue({})));
  assert(Number.isNaN(parsePercentValue([])));
  assert(Number.isNaN(parsePercentValue(true)));
})();

// ---------------------------------------------------------------------------
// clampPercent
// ---------------------------------------------------------------------------

(function testClampPercentNormalValues() {
  assert.equal(clampPercent(0), 0);
  assert.equal(clampPercent(50), 50);
  assert.equal(clampPercent(100), 100);
})();

(function testClampPercentAbove100() {
  assert.equal(clampPercent(150), 100);
  assert.equal(clampPercent(999), 100);
})();

(function testClampPercentBelowZero() {
  assert.equal(clampPercent(-10), 0);
  assert.equal(clampPercent(-999), 0);
})();

(function testClampPercentNaN() {
  assert.equal(clampPercent(NaN), 0);
  assert.equal(clampPercent("not-a-number"), 0);
})();

(function testClampPercentNonFinite() {
  assert.equal(clampPercent(Infinity), 0);
  assert.equal(clampPercent(-Infinity), 0);
})();

(function testClampPercentNull() {
  assert.equal(clampPercent(null), 0);
  assert.equal(clampPercent(undefined), 0);
})();

(function testClampPercentWithStrings() {
  assert.equal(clampPercent("50%"), 50);
  assert.equal(clampPercent("200%"), 100);
  assert.equal(clampPercent("-5%"), 0);
  assert.equal(clampPercent("70/30"), 30);
})();

// ---------------------------------------------------------------------------
// getDefaultPlatformFeePercent
// ---------------------------------------------------------------------------

(function testGetDefaultPlatformFeePercentReturnsConfiguredValue() {
  // The config has PLATFORM_FEE_PERCENT = 30
  const result = getDefaultPlatformFeePercent();
  assert.equal(result, 30);
})();

// ---------------------------------------------------------------------------
// resolvePlatformFeePercent
// ---------------------------------------------------------------------------

(function testResolvePlatformFeePercentWithOverride() {
  assert.equal(resolvePlatformFeePercent(15), 15);
  assert.equal(resolvePlatformFeePercent(0), 0);
  assert.equal(resolvePlatformFeePercent(100), 100);
  assert.equal(resolvePlatformFeePercent("25%"), 25);
  assert.equal(resolvePlatformFeePercent("70/30"), 30);
})();

(function testResolvePlatformFeePercentWithOverrideClamped() {
  assert.equal(resolvePlatformFeePercent(200), 100);
  assert.equal(resolvePlatformFeePercent(-5), 0);
})();

(function testResolvePlatformFeePercentWithoutOverride() {
  const result = resolvePlatformFeePercent(undefined);
  assert.equal(result, 30, "should fall back to config default (30)");

  const resultNull = resolvePlatformFeePercent(null);
  assert.equal(resultNull, 30, "null should also fall back to default");
})();

(function testResolvePlatformFeePercentInvalidOverride() {
  const result = resolvePlatformFeePercent("not-a-number");
  assert.equal(result, 30, "invalid override should fall back to default");
})();

console.log("platform-fee tests passed");
