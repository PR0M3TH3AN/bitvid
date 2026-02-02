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
});
