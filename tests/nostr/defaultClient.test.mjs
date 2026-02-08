import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import "../test-setup.mjs";

// Mock dependencies before importing the module under test
if (!globalThis.WebSocket) {
  globalThis.WebSocket = class MockWebSocket {
    send() {}
    close() {}
  };
}

if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };
}

// Set dev mode override
globalThis.__BITVID_DEV_MODE_OVERRIDE__ = true;

// Mock console to suppress logs during tests
const originalConsole = { ...console };
globalThis.console = {
  ...console,
  log: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

// Import modules dynamically after setting up mocks
const { nostrClient } = await import("../../js/nostr/defaultClient.js");
const { DEFAULT_RELAY_URLS } = await import("../../js/nostr/toolkit.js");
const { getRegisteredNostrClient } = await import("../../js/nostrClientRegistry.js");
const { NostrClient } = await import("../../js/nostr/client.js");

describe("Default NostrClient", () => {
  after(() => {
    // Restore console
    globalThis.console = originalConsole;
    // Clean up globals if desired, though process isolation makes this optional
    delete globalThis.__BITVID_DEV_MODE_OVERRIDE__;
  });
  it("should be an instance of NostrClient", () => {
    assert.ok(nostrClient instanceof NostrClient);
  });

  it("should be configured with default relays", () => {
    const expectedRelays = Array.from(DEFAULT_RELAY_URLS);
    assert.deepEqual(nostrClient.relays, expectedRelays);
  });

  it("should be initialized with default read relays", () => {
    const expectedRelays = Array.from(DEFAULT_RELAY_URLS);
    assert.deepEqual(nostrClient.readRelays, expectedRelays);
  });

  it("should be initialized with default write relays", () => {
    const expectedRelays = Array.from(DEFAULT_RELAY_URLS);
    assert.deepEqual(nostrClient.writeRelays, expectedRelays);
  });

  it("should be registered as the default client", () => {
    const registered = getRegisteredNostrClient();
    assert.strictEqual(registered, nostrClient);
  });
});
