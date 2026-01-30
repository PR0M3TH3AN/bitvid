// Run with: node scripts/run-targeted-tests.mjs tests/services/relay-health-service.test.mjs

import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import RelayHealthService from "../../js/services/relayHealthService.js";

// Mock SimpleEventEmitter for tests
class SimpleEventEmitter {
  constructor() {
    this.listeners = new Map();
  }
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }
  emit(event, ...args) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((handler) => handler(...args));
    }
  }
}

test("RelayHealthService: initializes with default values", () => {
  const service = new RelayHealthService();
  assert.equal(service.getTelemetryOptIn(), false);
  assert.equal(service.getRelayUrls().length, 0);
});

test("RelayHealthService: manages telemetry opt-in", () => {
  const service = new RelayHealthService();
  service.setTelemetryOptIn(true);
  assert.equal(service.getTelemetryOptIn(), true);
  assert.equal(globalThis.localStorage.getItem("bitvid:relay-health-telemetry-opt-in"), "true");

  service.setTelemetryOptIn(false);
  assert.equal(service.getTelemetryOptIn(), false);
  assert.equal(globalThis.localStorage.getItem("bitvid:relay-health-telemetry-opt-in"), "false");
});

test("RelayHealthService: getRelayUrls fetches from relayManager", () => {
  const relayManager = {
    getEntries: () => [{ url: "wss://relay1.com" }, { url: "wss://relay2.com" }],
  };
  const service = new RelayHealthService({ relayManager });
  const urls = service.getRelayUrls();
  assert.deepEqual(urls, ["wss://relay1.com", "wss://relay2.com"]);
});

test("RelayHealthService: ensureRelayState creates default state", () => {
  const service = new RelayHealthService();
  const state = service.ensureRelayState("wss://relay.com");
  assert.deepEqual(state, {
    url: "wss://relay.com",
    connected: false,
    lastLatencyMs: null,
    errorCount: 0,
    consecutiveFailures: 0,
    lastCheckedAt: null,
    lastErrorAt: null,
    lastUserLogAt: null,
  });
});

test("RelayHealthService: checkRelay success flow", async () => {
  const mockRelay = new SimpleEventEmitter();
  const nostrClient = {
    ensurePool: async () => {},
    pool: {
      ensureRelay: async (url) => {
        if (url === "wss://success.com") return mockRelay;
        return null;
      },
    },
  };

  const service = new RelayHealthService({ nostrClient });
  await service.checkRelay("wss://success.com");

  // Simulate connection
  mockRelay.emit("connect");

  const state = service.ensureRelayState("wss://success.com");
  assert.equal(state.connected, true);
  assert.notEqual(state.lastCheckedAt, null);
  assert.notEqual(state.lastLatencyMs, null);
});

test("RelayHealthService: checkRelay failure flow", async () => {
  const nostrClient = {
    ensurePool: async () => {},
    pool: {
      ensureRelay: async () => {
        throw new Error("Connection failed");
      },
    },
  };

  const service = new RelayHealthService({ nostrClient });
  await service.checkRelay("wss://fail.com");

  const state = service.ensureRelayState("wss://fail.com");
  assert.equal(state.connected, false);
  assert.equal(state.errorCount, 1);
  assert.notEqual(state.lastErrorAt, null);
});

test("RelayHealthService: checkRelay handles missing nostrClient", async () => {
  const service = new RelayHealthService(); // No client
  await service.checkRelay("wss://test.com");

  const state = service.ensureRelayState("wss://test.com");
  assert.equal(state.connected, false);
  assert.equal(state.errorCount, 1);
});

test("RelayHealthService: refresh checks all relays", async () => {
  const relayManager = {
    getEntries: () => [{ url: "wss://r1.com" }, { url: "wss://r2.com" }],
  };
  const nostrClient = {
    ensurePool: async () => {},
    pool: {
      ensureRelay: async (url) => {
        const relay = new SimpleEventEmitter();
        setTimeout(() => relay.emit("connect"), 10);
        return relay;
      },
    },
  };

  const service = new RelayHealthService({ relayManager, nostrClient });
  const snapshot = await service.refresh();

  assert.equal(snapshot.length, 2);
  assert.equal(snapshot[0].url, "wss://r1.com");
  assert.equal(snapshot[1].url, "wss://r2.com");
});

test("RelayHealthService: emits telemetry if opted in", async () => {
  let telemetryPayload = null;
  const telemetryEmitter = (event, payload) => {
    if (event === "relay_health_snapshot") {
      telemetryPayload = payload;
    }
  };

  const relayManager = {
    getEntries: () => [{ url: "wss://t1.com" }],
  };
  const nostrClient = {
    ensurePool: async () => {},
    pool: {
      ensureRelay: async () => new SimpleEventEmitter(),
    },
  };

  const service = new RelayHealthService({ relayManager, nostrClient, telemetryEmitter });
  service.setTelemetryOptIn(true);

  await service.refresh();

  assert.ok(telemetryPayload);
  assert.equal(telemetryPayload.relays.length, 1);
  assert.equal(telemetryPayload.relays[0].url, "wss://t1.com");
});
