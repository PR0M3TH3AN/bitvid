import test from "node:test";
import assert from "node:assert";
import {
  loadSavedProfilesFromStorage,
  persistSavedProfiles,
  setActiveProfilePubkey,
  getSavedProfiles,
  getActiveProfilePubkey,
  setSavedProfiles,
  storeUrlHealth,
  getCachedUrlHealth,
  getModerationSettings,
  setModerationSettings,
  urlHealthConstants,
  loadModerationOverridesFromStorage,
  getModerationOverridesList,
  clearModerationOverride,
} from "../../js/state/cache.js";

// Ensure localStorage is mocked
import "../../tests/test-helpers/setup-localstorage.mjs";

test("js/state/cache.js", async (t) => {
  t.beforeEach(() => {
    localStorage.clear();
    // Reset internal state if possible, or relying on overwrites
    setSavedProfiles([]);
    setActiveProfilePubkey(null, { persist: false });
  });

  await t.test("Saved Profiles Persistence", async () => {
    const profiles = [
      { pubkey: "0000000000000000000000000000000000000000000000000000000000000001", name: "Alice" },
      { pubkey: "0000000000000000000000000000000000000000000000000000000000000002", name: "Bob" },
    ];

    setSavedProfiles(profiles, { persist: true });

    // Simulate reload
    const { profiles: loadedProfiles } = loadSavedProfilesFromStorage();
    assert.strictEqual(loadedProfiles.length, 2);
    assert.strictEqual(loadedProfiles[0].name, "Alice");
    assert.strictEqual(loadedProfiles[1].name, "Bob");
  });

  await t.test("Active Profile Pubkey", async () => {
    const pubkey = "0000000000000000000000000000000000000000000000000000000000000001";
    // We need to set saved profiles first so the active one is considered valid in some logic paths,
    // or just rely on setActiveProfilePubkey which should handle it.
    // However, looking at cache.js `loadSavedProfilesFromStorage` implementation:
    // It checks if the active candidate exists in `seenPubkeys` (from `savedProfiles`).
    // If not, it might not set it or treat it as valid if we are loading from storage.

    // Let's add the profile to saved profiles first to be safe for persistence reload check.
    setSavedProfiles([{ pubkey, name: "Alice" }]);

    setActiveProfilePubkey(pubkey);

    assert.strictEqual(getActiveProfilePubkey(), pubkey);

    // Verify persistence
    const { activePubkey } = loadSavedProfilesFromStorage();
    assert.strictEqual(activePubkey, pubkey);
  });

  await t.test("URL Health Caching", async () => {
    const eventId = "event1";
    const url = "https://example.com/video.mp4";
    const result = { status: "ok", message: "All good" };

    storeUrlHealth(eventId, url, result);

    const cached = getCachedUrlHealth(eventId, url);
    assert.ok(cached);
    assert.strictEqual(cached.status, "ok");
    assert.strictEqual(cached.url, url);
  });

  await t.test("URL Health Expiration", async (t) => {
    const eventId = "event2";
    const url = "https://example.com/expired.mp4";
    const result = { status: "checking" };

    // Store with very short TTL
    storeUrlHealth(eventId, url, result, 1); // 1ms TTL

    await new Promise((resolve) => setTimeout(resolve, 10));

    const cached = getCachedUrlHealth(eventId, url);
    assert.strictEqual(cached, null, "Should return null for expired cache");
  });

  await t.test("Moderation Settings", async () => {
    const defaults = getModerationSettings();
    assert.ok(defaults);

    const newSettings = {
      blurThreshold: 1,
      autoplayBlockThreshold: 2,
    };

    setModerationSettings(newSettings);

    const updated = getModerationSettings();
    assert.strictEqual(updated.blurThreshold, 1);
    assert.strictEqual(updated.autoplayBlockThreshold, 2);
  });

  await t.test("Legacy Moderation Overrides Support", async (t) => {
    // Reset internal state by clearing overrides
    const current = getModerationOverridesList();
    for (const entry of current) {
      clearModerationOverride(entry, { persist: false });
    }

    const VALID_HEX_ID_1 = "0000000000000000000000000000000000000000000000000000000000000001";
    const VALID_HEX_ID_2 = "0000000000000000000000000000000000000000000000000000000000000002";

    await t.test("ignores legacy v1 overrides", () => {
      const legacyData = {
        version: 1,
        entries: {
          [VALID_HEX_ID_1]: { showAnyway: true, updatedAt: 1234567890 },
        }
      };
      localStorage.setItem("bitvid:moderationOverrides:v1", JSON.stringify(legacyData));

      loadModerationOverridesFromStorage();

      const overrides = getModerationOverridesList();
      assert.strictEqual(overrides.length, 0, "Should not load legacy overrides");

      // Check if it migrated to v2 key
      const v2Data = localStorage.getItem("bitvid:moderationOverrides:v2");
      assert.strictEqual(v2Data, null, "Should not migrate/persist v2 data");

      // Check if legacy key is NOT removed
      assert.ok(localStorage.getItem("bitvid:moderationOverrides:v1"), "Should not remove legacy key");
    });

    await t.test("loads v2 overrides", () => {
      const v2Data = {
        version: 2,
        entries: [
          { eventId: VALID_HEX_ID_2, authorPubkey: "", showAnyway: true, updatedAt: 1234567890 }
        ]
      };
      localStorage.setItem("bitvid:moderationOverrides:v2", JSON.stringify(v2Data));

      loadModerationOverridesFromStorage();

      const overrides = getModerationOverridesList();
      assert.strictEqual(overrides.length, 1);
      assert.strictEqual(overrides[0].eventId, VALID_HEX_ID_2);
    });
  });
});
