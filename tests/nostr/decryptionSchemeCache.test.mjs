import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getLastSuccessfulScheme,
  setLastSuccessfulScheme,
  clearDecryptionSchemeCache,
} from "../../js/nostr/decryptionSchemeCache.js";

describe("decryptionSchemeCache", () => {
  let originalDateNow;
  let mockTime = 1000000;

  beforeEach(() => {
    originalDateNow = Date.now;
    // We need to override the global Date.now
    Object.defineProperty(Date, "now", {
        value: () => mockTime,
        writable: true,
        configurable: true // Important to allow restoring
    });
    clearDecryptionSchemeCache();
  });

  afterEach(() => {
    if (originalDateNow) {
         Object.defineProperty(Date, "now", {
            value: originalDateNow,
            writable: true,
            configurable: true
        });
    }
    clearDecryptionSchemeCache();
    mockTime = 1000000; // Reset mock time
  });

  test("stores and retrieves a scheme", () => {
    const pubkey = "pubkey1";
    const scheme = "nip44_v2";
    setLastSuccessfulScheme(pubkey, scheme);
    assert.equal(getLastSuccessfulScheme(pubkey), scheme);
  });

  test("returns null for unknown pubkey", () => {
    assert.equal(getLastSuccessfulScheme("unknown"), null);
  });

  test("handles invalid inputs gracefully", () => {
    setLastSuccessfulScheme(null, "scheme");
    assert.equal(getLastSuccessfulScheme(null), null);

    setLastSuccessfulScheme("pubkey", null);
    assert.equal(getLastSuccessfulScheme("pubkey"), null);

    // @ts-ignore
    setLastSuccessfulScheme(123, "scheme");
    // @ts-ignore
    assert.equal(getLastSuccessfulScheme(123), null);
  });

  test("expires entries after TTL (2 hours)", () => {
    const pubkey = "pubkey_ttl";
    const scheme = "nip04";
    setLastSuccessfulScheme(pubkey, scheme);

    // Advance time by 2 hours + 1ms
    mockTime += 2 * 60 * 60 * 1000 + 1;

    assert.equal(getLastSuccessfulScheme(pubkey), null);
  });

  test("does not expire entries before TTL", () => {
    const pubkey = "pubkey_ttl_ok";
    const scheme = "nip04";
    setLastSuccessfulScheme(pubkey, scheme);

    // Advance time by 2 hours - 1ms
    mockTime += 2 * 60 * 60 * 1000 - 1;

    assert.equal(getLastSuccessfulScheme(pubkey), scheme);
  });

  test("clears cache", () => {
    const pubkey = "pubkey_clear";
    const scheme = "nip04";
    setLastSuccessfulScheme(pubkey, scheme);

    clearDecryptionSchemeCache();

    assert.equal(getLastSuccessfulScheme(pubkey), null);
  });
});
