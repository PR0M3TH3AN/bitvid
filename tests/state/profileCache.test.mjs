import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { profileCache } from "../../js/state/profileCache.js";
import { NOTE_TYPES } from "../../js/nostrEventSchemas.js";

describe("ProfileCache", () => {
  const TEST_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
  const ANOTHER_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000002";

  beforeEach(() => {
    // Reset internal state
    profileCache.activePubkey = null;
    profileCache.memoryCache.clear();
    profileCache.listeners.clear();
    // Clear mock localStorage
    if (globalThis.localStorage) {
      globalThis.localStorage.clear();
    }
  });

  test("setActiveProfile normalizes and sets active pubkey", () => {
    profileCache.setActiveProfile("  " + TEST_PUBKEY.toUpperCase() + "  ");
    assert.strictEqual(profileCache.getActiveProfile(), TEST_PUBKEY);
  });

  test("setActiveProfile clears memory cache for old profile", () => {
    profileCache.setActiveProfile(TEST_PUBKEY);
    profileCache.setMemoryDataForPubkey(TEST_PUBKEY, "test_section", { foo: "bar" });
    assert.ok(profileCache.getProfileData(TEST_PUBKEY, "test_section"));

    // Switch profile
    profileCache.setActiveProfile(ANOTHER_PUBKEY);

    // Check old data is gone from memory
    // Note: profileCache.getProfileData falls back to localStorage, so we should ensure localStorage is empty
    // or specifically check memoryCache.
    const memKey = `${TEST_PUBKEY}:test_section`;
    assert.strictEqual(profileCache.memoryCache.has(memKey), false);
  });

  test("resolveAddressKey generates correct keys based on policy", () => {
    profileCache.setActiveProfile(TEST_PUBKEY);

    // Watch History: kind:pubkey:d (dTag default)
    // NOTE_TYPES.WATCH_HISTORY is usually 30078 or similar.
    // But CACHE_POLICIES keys are the noteType string from schemas.
    // Let's rely on what the code actually does.

    const key = profileCache.resolveAddressKey("watchHistory", { pubkey: TEST_PUBKEY });
    // Expect: bitvid:profile:{pubkey}:{noteType}:{dTag}:v1
    // The code maps "watchHistory" to NOTE_TYPES.WATCH_HISTORY via SECTION_TO_NOTE_TYPE.
    const expectedPrefix = `bitvid:profile:${TEST_PUBKEY}:${NOTE_TYPES.WATCH_HISTORY}`;
    assert.ok(key.startsWith(expectedPrefix));
    assert.ok(key.includes(":v1"));
  });

  test("setProfile normalizes and persists profile data", () => {
    profileCache.setActiveProfile(TEST_PUBKEY);

    const rawProfile = {
      name: "  Test User  ",
      picture: "https://example.com/pic.jpg",
      about: "  About me  ",
      website: "  https://example.com  ",
      lud16: "user@ln.address",
    };

    profileCache.setProfile(TEST_PUBKEY, rawProfile);

    const stored = profileCache.getProfile(TEST_PUBKEY);
    assert.ok(stored);
    assert.strictEqual(stored.name, "Test User"); // Trimmed
    assert.strictEqual(stored.picture, "https://example.com/pic.jpg");
    assert.strictEqual(stored.about, "About me"); // Trimmed
    assert.strictEqual(stored.website, "https://example.com"); // Trimmed
    assert.strictEqual(stored.lud16, "user@ln.address");

    // Check persistence
    // "profile" section maps to NOTE_TYPES.PROFILE_METADATA (kind 0)
    // Policy addressing is kind:pubkey
    const storageKey = profileCache.getStorageKey(TEST_PUBKEY, "profile");
    const storedJson = localStorage.getItem(storageKey);
    assert.ok(storedJson, "Should be saved to localStorage");
    const parsed = JSON.parse(storedJson);
    assert.deepStrictEqual(parsed.profile, stored);
  });

  test("getProfileData checks TTL", (t) => {
    // Mock Date.now
    const originalDateNow = Date.now;
    let mockNow = 1000000;
    Date.now = () => mockNow;

    try {
      // NOTE_TYPES.VIDEO_POST has 10 min TTL (600,000 ms)
      // We need to use a section that maps to a policy with TTL.
      // "profile" has Infinity TTL.
      // Let's look at CACHE_POLICIES.
      // VIDEO_POST is indexedDB, so ProfileCache might not handle it via localStorage path?
      // ProfileCache.getStorageTier checks policy.
      // CACHE_POLICIES[NOTE_TYPES.VIDEO_POST].storage is INDEXED_DB.

      // We need a LOCAL_STORAGE policy with finite TTL.
      // WATCH_HISTORY is LOCAL_STORAGE and 24h TTL.

      const section = "watchHistory";
      profileCache.setActiveProfile(TEST_PUBKEY);

      const data = {
        items: [],
        timestamp: mockNow // Saved at 1000000
      };

      profileCache.set(section, data);

      // Verify immediate retrieval
      const retrieved = profileCache.get(section);
      assert.deepStrictEqual(retrieved, data);

      // Fast forward 25 hours (25 * 60 * 60 * 1000 = 90,000,000)
      mockNow += 90000000;

      // Clear memory cache to force load from storage
      profileCache.memoryCache.clear();

      const expired = profileCache.get(section);
      assert.strictEqual(expired, null, "Should return null for expired data");

    } finally {
      Date.now = originalDateNow;
    }
  });

  test("setProfile sanitizes XSS in media URLs", () => {
    const maliciousProfile = {
      name: "Hacker",
      picture: "javascript:alert(1)",
      banner: "data:image/svg+xml;base64,PHN2ZyBvbG9hZD0iYWxlcnQoMSkiPjwvc3ZnPg==", // basic svg xss vector
    };

    profileCache.setProfile(TEST_PUBKEY, maliciousProfile);
    const stored = profileCache.getProfile(TEST_PUBKEY);

    // sanitizeProfileMediaUrl returns empty string or null for invalid/dangerous schemes
    // The implementation uses `sanitizeProfileMediaUrl` from `../utils/profileMedia.js`.
    // If it detects bad schemes, it might clear it.
    // Assuming "javascript:" is stripped.
    assert.notStrictEqual(stored.picture, "javascript:alert(1)");
    // If it returns null or empty string, that's good.

    // Note: We are relying on `sanitizeProfileMediaUrl` behavior here.
    // If that function is robust, these assertions pass.
  });

  test("emit fires events on update", (t, done) => {
    profileCache.setActiveProfile(TEST_PUBKEY);

    const unsubscribe = profileCache.subscribe((event, detail) => {
      if (event === "update") {
        assert.strictEqual(detail.pubkey, TEST_PUBKEY);
        assert.strictEqual(detail.section, "test_section");
        assert.deepStrictEqual(detail.data, { foo: "bar" });
        unsubscribe();
        done();
      }
    });

    profileCache.set("test_section", { foo: "bar" });
  });
});
