// Run with: node scripts/run-targeted-tests.mjs tests/state/profile-cache.test.mjs

import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { profileCache } from "../../js/state/profileCache.js";

beforeEach(() => {
  if (globalThis.localStorage && typeof globalThis.localStorage.clear === "function") {
    globalThis.localStorage.clear();
  }
  // Reset singleton state
  if (profileCache.activePubkey) {
    profileCache.clearMemoryCache(profileCache.activePubkey);
    profileCache.activePubkey = null;
  }
  profileCache.memoryCache.clear();
});

test("ProfileCache: normalizeHexPubkey validates and cleans inputs", () => {
  assert.equal(profileCache.normalizeHexPubkey(null), null);
  assert.equal(profileCache.normalizeHexPubkey("invalid"), null);

  const valid = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  assert.equal(profileCache.normalizeHexPubkey(valid), valid);
  assert.equal(profileCache.normalizeHexPubkey(`  ${valid.toUpperCase()}  `), valid);
});

test("ProfileCache: resolves storage keys correctly", () => {
  const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  // Test watchHistory (kind:pubkey:d)
  const historyKey = profileCache.resolveAddressKey("watchHistory", { pubkey });
  assert.match(historyKey, new RegExp(`bitvid:profile:${pubkey}:watchHistory:watch-history:v1`));

  // Test profile (simple)
  const profileKey = profileCache.resolveAddressKey("profile", { pubkey });
  assert.match(profileKey, new RegExp(`bitvid:profile:${pubkey}:profileMetadata:v1`));
});

test("ProfileCache: persists data to localStorage and memory", () => {
  const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const data = { foo: "bar" };

  profileCache.setProfileData(pubkey, "test-section", data);

  // Check memory
  const memData = profileCache.getProfileData(pubkey, "test-section");
  assert.deepEqual(memData, data);

  // Check storage
  const key = profileCache.getStorageKey(pubkey, "test-section");
  const stored = globalThis.localStorage.getItem(key);
  assert.ok(stored);
  assert.deepEqual(JSON.parse(stored), data);
});

test("ProfileCache: loads from localStorage if memory miss", () => {
  const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const data = { loaded: true };
  const key = profileCache.getStorageKey(pubkey, "test-load");

  // Pre-seed storage
  globalThis.localStorage.setItem(key, JSON.stringify(data));

  // Clear memory to force load
  profileCache.clearMemoryCache(pubkey);

  const result = profileCache.getProfileData(pubkey, "test-load");
  assert.deepEqual(result, data);
});

test("ProfileCache: handles active profile switching", () => {
  const pubkey1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const pubkey2 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  profileCache.setActiveProfile(pubkey1);
  profileCache.set("section", { p: 1 });

  assert.deepEqual(profileCache.get("section"), { p: 1 });

  profileCache.setActiveProfile(pubkey2);

  // Should not access pubkey1's data via active convenience methods
  assert.equal(profileCache.get("section"), null);

  // But pubkey1 data should still exist in persistence if saved
  const p1Data = profileCache.getProfileData(pubkey1, "section");
  assert.deepEqual(p1Data, { p: 1 });
});

test("ProfileCache: setProfile normalizes and saves", () => {
  const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const rawProfile = {
    name: "  Tester  ",
    picture: "https://example.com/pic.jpg",
    about: "I am a tester",
  };

  const entry = profileCache.setProfile(pubkey, rawProfile);

  assert.equal(entry.profile.name, "Tester");
  assert.equal(entry.profile.picture, "https://example.com/pic.jpg");
  assert.ok(entry.timestamp);

  const stored = profileCache.getProfile(pubkey);
  assert.deepEqual(stored, entry.profile);
});

test("ProfileCache: emits events on active profile change", () => {
  let eventDetail = null;
  const pubkey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const unsubscribe = profileCache.subscribe((event, detail) => {
    if (event === "profileChanged") {
      eventDetail = detail;
    }
  });

  profileCache.setActiveProfile(pubkey);
  assert.deepEqual(eventDetail, { pubkey });
  unsubscribe();
});

test("ProfileCache: respects TTL expiration", () => {
  const pubkey = "1111111111111111111111111111111111111111111111111111111111111111";
  const section = "watchHistory"; // 24h TTL
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Create expired data
  const data = { history: [], savedAt: Date.now() - (ONE_DAY_MS + 1000) };
  const key = profileCache.getStorageKey(pubkey, section);
  globalThis.localStorage.setItem(key, JSON.stringify(data));

  // Ensure memory is empty
  profileCache.clearMemoryCache(pubkey);

  const result = profileCache.getProfileData(pubkey, section);
  assert.equal(result, null);
});

test("ProfileCache: setProfile sanitizes XSS in media URLs", () => {
  const pubkey = "2222222222222222222222222222222222222222222222222222222222222222";
  const rawProfile = {
    name: "Hacker",
    picture: "javascript:alert(1)",
    banner: "javascript:alert(2)",
  };

  const entry = profileCache.setProfile(pubkey, rawProfile);

  // sanitizeProfileMediaUrl returns null or fallback for invalid schemes
  // "assets/svg/default-profile.svg" is default for picture
  assert.equal(entry.profile.picture, "assets/svg/default-profile.svg");

  // banner might be undefined if invalid
  assert.equal(entry.profile.banner, undefined);
});
