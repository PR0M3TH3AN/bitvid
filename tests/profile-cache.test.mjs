import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Setup JSDOM for localStorage
const dom = new JSDOM("", {
  url: "https://localhost",
});
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;
globalThis.self = dom.window;

// Mock console to suppress expected warnings
const originalConsole = globalThis.console;
globalThis.console = {
  ...originalConsole,
  warn: () => {}, // suppress warn
  error: () => {}, // suppress error
};

// Import module under test
// using dynamic import to ensure globals are set first
const { profileCache } = await import("../js/state/profileCache.js");
const { CACHE_POLICIES, STORAGE_TIERS } = await import("../js/nostr/cachePolicies.js");
const { NOTE_TYPES } = await import("../js/nostrEventSchemas.js");
const { WATCH_HISTORY_LIST_IDENTIFIER } = await import("../js/config.js");

test.beforeEach(() => {
  profileCache.reset();
  localStorage.clear();
});

test.after(() => {
  profileCache.reset();
  localStorage.clear();
  globalThis.console = originalConsole;
});

test("ProfileCache: setActiveProfile and getActiveProfile", (t) => {
  const pubkey = "a".repeat(64);

  assert.equal(profileCache.getActiveProfile(), null);

  profileCache.setActiveProfile(pubkey);
  assert.equal(profileCache.getActiveProfile(), pubkey);

  // Test normalization
  const upperPubkey = pubkey.toUpperCase();
  profileCache.setActiveProfile(upperPubkey);
  assert.equal(profileCache.getActiveProfile(), pubkey);

  // Invalid pubkey
  profileCache.setActiveProfile("invalid");
  assert.equal(profileCache.getActiveProfile(), null, "Invalid pubkey should set active profile to null");
});

test("ProfileCache: resolveAddressKey", (t) => {
  const pubkey = "b".repeat(64);
  profileCache.setActiveProfile(pubkey);

  // Test explicit parameters
  const key1 = profileCache.resolveAddressKey("watchHistory", { pubkey });
  // Dynamic regex based on config
  const expectedKey = `bitvid:profile:${pubkey}:watchHistory:${WATCH_HISTORY_LIST_IDENTIFIER}:v1`;
  assert.equal(key1, expectedKey);

  // Test implicit active pubkey
  const key2 = profileCache.resolveAddressKey("watchHistory");
  assert.equal(key2, key1);

  // Test kind:pubkey addressing (PROFILE_METADATA)
  const keyProfile = profileCache.resolveAddressKey("profile");
  // NOTE_TYPES.PROFILE_METADATA is "profileMetadata"
  const expectedProfileKey = `bitvid:profile:${pubkey}:profileMetadata:v1`;
  assert.equal(keyProfile, expectedProfileKey);

  // Test legacy fallback (if any unknown section)
  const keyUnknown = profileCache.resolveAddressKey("unknownSection");
  assert.equal(keyUnknown, `bitvid:profile:${pubkey}:unknownSection:v1`);
});

test("ProfileCache: set and get (memory and persistence)", (t) => {
  const pubkey = "c".repeat(64);
  profileCache.setActiveProfile(pubkey);

  const section = "watchHistory";
  const data = { items: [1, 2, 3], timestamp: Date.now() };

  // Initial get should be null
  assert.equal(profileCache.get(section), null);

  // Set data
  profileCache.set(section, data);

  // Get data (should be in memory)
  const retrieved = profileCache.get(section);
  assert.deepEqual(retrieved, data);

  // Check persistence
  const storageKey = profileCache.getStorageKey(pubkey, section);
  const storedRaw = localStorage.getItem(storageKey);
  assert.ok(storedRaw);
  assert.deepEqual(JSON.parse(storedRaw), data);

  // Simulate page reload (clear memory)
  profileCache.memoryCache.clear();

  // Get data (should load from persistence)
  const reloaded = profileCache.get(section);
  assert.deepEqual(reloaded, data);
});

test("ProfileCache: setProfile normalization and storage", (t) => {
  const pubkey = "d".repeat(64);
  const profileInput = {
    name: " Test User ",
    about: " Just testing ",
    picture: " https://example.com/pic.jpg ",
    nip05: "user@domain.com", // Should be ignored if not in allowed fields?
    // implementation copies specific fields
    lud16: " user@ln.address ",
  };

  const entry = profileCache.setProfile(pubkey, profileInput);

  assert.equal(entry.profile.name, "Test User");
  assert.equal(entry.profile.about, "Just testing");
  assert.equal(entry.profile.picture, "https://example.com/pic.jpg");
  assert.equal(entry.profile.lud16, "user@ln.address");
  assert.ok(entry.timestamp);

  // Verify persistence
  const storageKey = profileCache.getStorageKey(pubkey, "profile");
  const stored = JSON.parse(localStorage.getItem(storageKey));
  assert.deepEqual(stored.profile, entry.profile);
});

test("ProfileCache: TTL expiration", (t) => {
  const pubkey = "e".repeat(64);
  profileCache.setActiveProfile(pubkey);

  const section = "watchHistory";
  const ttl = CACHE_POLICIES[NOTE_TYPES.WATCH_HISTORY].ttl;

  // Create expired data
  const expiredData = {
    items: [],
    timestamp: Date.now() - ttl - 1000 // Expired by 1 second
  };

  const storageKey = profileCache.getStorageKey(pubkey, section);
  localStorage.setItem(storageKey, JSON.stringify(expiredData));

  // Should return null and log info (logger mocked/ignored)
  const result = profileCache.get(section);
  assert.equal(result, null);

  // Create valid data
  const validData = {
    items: [],
    timestamp: Date.now() - ttl + 10000 // Valid
  };
  localStorage.setItem(storageKey, JSON.stringify(validData));

  const resultValid = profileCache.get(section);
  assert.deepEqual(resultValid, validData);
});

test("ProfileCache: clearMemoryCache and clearSignerRuntime", (t) => {
  const pubkey = "f".repeat(64);
  profileCache.setActiveProfile(pubkey);

  const section = "subscriptions";
  const data = { tags: [] };

  profileCache.set(section, data);
  assert.ok(profileCache.getMemoryData(section));

  profileCache.clearSignerRuntime(pubkey);
  assert.equal(profileCache.getMemoryData(section), undefined);
});

test("ProfileCache: listeners", (t) => {
  const pubkey = "1".repeat(64); // Valid hex
  let eventCount = 0;
  let lastEvent = null;

  const unsubscribe = profileCache.subscribe((event, detail) => {
    eventCount++;
    lastEvent = { event, detail };
  });

  profileCache.setActiveProfile(pubkey);

  assert.equal(eventCount, 1);
  assert.equal(lastEvent.event, "profileChanged");
  assert.equal(lastEvent.detail.pubkey, pubkey);

  profileCache.set("watchHistory", { data: 1 });
  assert.equal(eventCount, 3); // update, partition-updated

  unsubscribe();
  profileCache.reset();
  assert.equal(eventCount, 3); // Should not increase
});
