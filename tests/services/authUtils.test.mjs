import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderId, normalizeAuthType } from "../../js/services/authUtils.js";

test("authUtils", async (t) => {
  await t.test("normalizeProviderId", async (t) => {
    await t.test("returns trimmed string if valid", () => {
      assert.equal(normalizeProviderId("  provider123  "), "provider123");
    });

    await t.test("returns 'nip07' fallback if empty", () => {
      assert.equal(normalizeProviderId(""), "nip07");
    });

    await t.test("returns 'nip07' fallback if null", () => {
      assert.equal(normalizeProviderId(null), "nip07");
    });

    await t.test("returns 'nip07' fallback if undefined", () => {
      assert.equal(normalizeProviderId(undefined), "nip07");
    });

    await t.test("returns 'nip07' fallback if not a string", () => {
      assert.equal(normalizeProviderId(123), "nip07");
    });
  });

  await t.test("normalizeAuthType", async (t) => {
    await t.test("prioritizes authTypeCandidate", () => {
      assert.equal(normalizeAuthType("candidateType", "fallbackProvider", {}), "candidateType");
    });

    await t.test("falls back to providerResult.authType", () => {
      assert.equal(normalizeAuthType(null, "fallbackProvider", { authType: "resultAuthType" }), "resultAuthType");
    });

    await t.test("falls back to providerResult.providerId", () => {
      assert.equal(normalizeAuthType(null, "fallbackProvider", { providerId: "resultProviderId" }), "resultProviderId");
    });

    await t.test("falls back to providerId", () => {
      assert.equal(normalizeAuthType(null, "fallbackProvider", {}), "fallbackProvider");
    });

    await t.test("returns 'nip07' if all else fails", () => {
      assert.equal(normalizeAuthType(null, null, {}), "nip07");
    });

    await t.test("trims whitespace from results", () => {
      assert.equal(normalizeAuthType("  candidateType  ", "fallbackProvider", {}), "candidateType");
    });

    await t.test("ignores empty strings in candidates", () => {
      // Should skip empty candidate and use providerResult
      assert.equal(normalizeAuthType("", "fallbackProvider", { authType: "resultAuthType" }), "resultAuthType");
    });
  });
});
