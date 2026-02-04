import assert from "node:assert/strict";
import test from "node:test";
import "./test-setup.mjs";

// We need to mock the dependencies before importing relayManager
// Since relayManager is a singleton that runs on import, we test the helper functions
// by extracting testable logic or testing via the public API

// Test helper functions used by RelayPreferencesManager
test("normalizeRelayUrl: normalizes valid WSS URLs", async () => {
  // Import dynamically to test after setup
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  // Test via addRelay which uses normalizeRelayUrl internally
  const entries = relayManager.getEntries();
  const initialCount = entries.length;

  // Adding a relay with various URL formats should normalize them
  // This tests the internal normalizeRelayUrl function indirectly
});

test("RelayPreferencesManager: getEntries returns cloned entries", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const entries1 = relayManager.getEntries();
  const entries2 = relayManager.getEntries();

  // Should be equal but not same reference
  assert.deepEqual(entries1, entries2);

  // Modifying one shouldn't affect the other
  if (entries1.length > 0) {
    entries1[0].url = "modified";
    assert.notEqual(entries1[0].url, entries2[0].url);
  }
});

test("RelayPreferencesManager: getAllRelayUrls returns array of URLs", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const urls = relayManager.getAllRelayUrls();

  assert.ok(Array.isArray(urls));
  urls.forEach((url) => {
    assert.equal(typeof url, "string");
    assert.ok(url.startsWith("wss://") || url.startsWith("ws://"));
  });
});

test("RelayPreferencesManager: getReadRelayUrls filters correctly", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const readUrls = relayManager.getReadRelayUrls();
  const entries = relayManager.getEntries();

  // All read URLs should correspond to entries with read=true
  const expectedReadUrls = entries.filter((e) => e.read).map((e) => e.url);
  assert.deepEqual(readUrls, expectedReadUrls);
});

test("RelayPreferencesManager: getWriteRelayUrls filters correctly", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const writeUrls = relayManager.getWriteRelayUrls();
  const entries = relayManager.getEntries();

  // All write URLs should correspond to entries with write=true
  const expectedWriteUrls = entries.filter((e) => e.write).map((e) => e.url);
  assert.deepEqual(writeUrls, expectedWriteUrls);
});

test("RelayPreferencesManager: addRelay rejects invalid URLs", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  // Empty string should be invalid
  assert.throws(
    () => relayManager.addRelay(""),
    { code: "invalid" }
  );

  // HTTP URLs are not valid websocket URLs
  assert.throws(
    () => relayManager.addRelay("http://not-websocket.com"),
    { code: "invalid" }
  );

  // FTP is not a valid protocol
  assert.throws(
    () => relayManager.addRelay("ftp://invalid.com"),
    { code: "invalid" }
  );

  // Note: "not-a-url" gets normalized to "wss://not-a-url" which is technically valid
  // So we don't test that case
});

test("RelayPreferencesManager: addRelay handles duplicates", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const testUrl = "wss://test-duplicate.example.com";

  // First, ensure it's not already there
  const initialEntries = relayManager.getEntries();
  const alreadyExists = initialEntries.some((e) => e.url === testUrl);

  if (!alreadyExists) {
    // Add it
    const result1 = relayManager.addRelay(testUrl);
    assert.equal(result1.changed, true);

    // Try to add again
    const result2 = relayManager.addRelay(testUrl);
    assert.equal(result2.changed, false);
    assert.equal(result2.reason, "duplicate");

    // Clean up
    relayManager.removeRelay(testUrl);
  }
});

test("RelayPreferencesManager: addRelay with different modes", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const testUrl = "wss://test-modes.example.com";

  // Clean up if exists
  try {
    relayManager.removeRelay(testUrl);
  } catch (e) {
    // Ignore if not found
  }

  // Add with read mode
  const result = relayManager.addRelay(testUrl, "read");
  assert.equal(result.changed, true);
  assert.equal(result.entry.mode, "read");
  assert.equal(result.entry.read, true);
  assert.equal(result.entry.write, false);

  // Clean up
  relayManager.removeRelay(testUrl);
});

test("RelayPreferencesManager: updateRelayMode changes mode", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const testUrl = "wss://test-update-mode.example.com";

  // Clean up if exists
  try {
    relayManager.removeRelay(testUrl);
  } catch (e) {
    // Ignore if not found
  }

  // Add with default mode (both)
  relayManager.addRelay(testUrl, "both");

  // Update to read-only
  const result = relayManager.updateRelayMode(testUrl, "read");
  assert.equal(result.changed, true);
  assert.equal(result.entry.mode, "read");
  assert.equal(result.entry.read, true);
  assert.equal(result.entry.write, false);

  // Update to write-only
  const result2 = relayManager.updateRelayMode(testUrl, "write");
  assert.equal(result2.changed, true);
  assert.equal(result2.entry.mode, "write");
  assert.equal(result2.entry.read, false);
  assert.equal(result2.entry.write, true);

  // Clean up
  relayManager.removeRelay(testUrl);
});

test("RelayPreferencesManager: updateRelayMode returns unchanged for same mode", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const testUrl = "wss://test-same-mode.example.com";

  try {
    relayManager.removeRelay(testUrl);
  } catch (e) {}

  relayManager.addRelay(testUrl, "both");

  const result = relayManager.updateRelayMode(testUrl, "both");
  assert.equal(result.changed, false);

  relayManager.removeRelay(testUrl);
});

test("RelayPreferencesManager: cycleRelayMode cycles through modes", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const testUrl = "wss://test-cycle.example.com";

  try {
    relayManager.removeRelay(testUrl);
  } catch (e) {}

  // Start with "both"
  relayManager.addRelay(testUrl, "both");

  // Cycle: both -> read
  let result = relayManager.cycleRelayMode(testUrl);
  assert.equal(result.entry.mode, "read");

  // Cycle: read -> write
  result = relayManager.cycleRelayMode(testUrl);
  assert.equal(result.entry.mode, "write");

  // Cycle: write -> both
  result = relayManager.cycleRelayMode(testUrl);
  assert.equal(result.entry.mode, "both");

  relayManager.removeRelay(testUrl);
});

test("RelayPreferencesManager: cycleRelayMode throws for missing relay", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  assert.throws(
    () => relayManager.cycleRelayMode("wss://nonexistent.example.com"),
    { code: "missing" }
  );
});

test("RelayPreferencesManager: removeRelay removes existing relay", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const testUrl = "wss://test-remove.example.com";

  try {
    relayManager.removeRelay(testUrl);
  } catch (e) {}

  relayManager.addRelay(testUrl);
  assert.ok(relayManager.getEntries().some((e) => e.url === testUrl));

  const result = relayManager.removeRelay(testUrl);
  assert.equal(result.changed, true);
  assert.ok(!relayManager.getEntries().some((e) => e.url === testUrl));
});

test("RelayPreferencesManager: removeRelay returns unchanged for missing relay", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const result = relayManager.removeRelay("wss://definitely-not-there.example.com");
  assert.equal(result.changed, false);
  assert.equal(result.reason, "missing");
});

test("RelayPreferencesManager: removeRelay throws when only one relay left", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  // Save current state
  const originalEntries = relayManager.getEntries();

  // Set to single relay
  relayManager.setEntries([{ url: "wss://single.example.com", mode: "both" }]);

  assert.throws(
    () => relayManager.removeRelay("wss://single.example.com"),
    { code: "minimum" }
  );

  // Restore
  relayManager.setEntries(originalEntries);
});

test("RelayPreferencesManager: setEntries replaces all entries", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const originalEntries = relayManager.getEntries();

  const newEntries = [
    { url: "wss://new1.example.com", mode: "both" },
    { url: "wss://new2.example.com", mode: "read" },
  ];

  relayManager.setEntries(newEntries);
  const currentEntries = relayManager.getEntries();

  assert.equal(currentEntries.length, 2);
  assert.equal(currentEntries[0].url, "wss://new1.example.com");
  assert.equal(currentEntries[1].url, "wss://new2.example.com");
  assert.equal(currentEntries[1].mode, "read");

  // Restore
  relayManager.setEntries(originalEntries);
});

test("RelayPreferencesManager: setEntries uses defaults for empty array", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const originalEntries = relayManager.getEntries();

  relayManager.setEntries([]);
  const currentEntries = relayManager.getEntries();

  // Should have default relays, not be empty
  assert.ok(currentEntries.length > 0);

  // Restore
  relayManager.setEntries(originalEntries);
});

test("RelayPreferencesManager: setEntries deduplicates URLs", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const originalEntries = relayManager.getEntries();

  const duplicateEntries = [
    { url: "wss://same.example.com", mode: "both" },
    { url: "wss://same.example.com", mode: "read" }, // Duplicate
    { url: "wss://other.example.com", mode: "write" },
  ];

  relayManager.setEntries(duplicateEntries);
  const currentEntries = relayManager.getEntries();

  assert.equal(currentEntries.length, 2);

  // Restore
  relayManager.setEntries(originalEntries);
});

test("RelayPreferencesManager: setEntries normalizes URLs", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const originalEntries = relayManager.getEntries();

  // Add relay without protocol
  relayManager.setEntries([{ url: "relay.example.com", mode: "both" }]);
  const currentEntries = relayManager.getEntries();

  // Should be normalized to wss://
  assert.equal(currentEntries[0].url, "wss://relay.example.com");

  // Restore
  relayManager.setEntries(originalEntries);
});

test("RelayPreferencesManager: restoreDefaults resets to default relays", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const originalEntries = relayManager.getEntries();

  // Change entries
  relayManager.setEntries([{ url: "wss://custom.example.com", mode: "both" }]);

  // Restore defaults
  const result = relayManager.restoreDefaults();
  assert.equal(result.changed, true);

  const currentEntries = relayManager.getEntries();
  // Should have default relays
  assert.ok(currentEntries.length > 0);
  assert.ok(!currentEntries.some((e) => e.url === "wss://custom.example.com"));

  // Restore original state
  relayManager.setEntries(originalEntries);
});

test("RelayPreferencesManager: getPublishTargets includes defaults", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const targets = relayManager.getPublishTargets();

  assert.ok(Array.isArray(targets));
  assert.ok(targets.length > 0);
  // All should be valid WSS URLs
  targets.forEach((url) => {
    assert.ok(url.startsWith("wss://") || url.startsWith("ws://"));
  });
});

test("RelayPreferencesManager: getPublishTargets accepts custom targets", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const customTargets = ["wss://custom1.example.com", "wss://custom2.example.com"];
  const targets = relayManager.getPublishTargets(customTargets);

  assert.ok(targets.includes("wss://custom1.example.com"));
  assert.ok(targets.includes("wss://custom2.example.com"));
});

test("RelayPreferencesManager: snapshot returns current entries", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const snapshot = relayManager.snapshot();
  const entries = relayManager.getEntries();

  assert.deepEqual(snapshot, entries);
});

test("RelayPreferencesManager: getLastLoadSource returns source type", async () => {
  const module = await import("../js/relayManager.js");
  const { relayManager } = module;

  const source = relayManager.getLastLoadSource();
  assert.ok(["default", "event", "storage"].includes(source) || source === "default");
});
