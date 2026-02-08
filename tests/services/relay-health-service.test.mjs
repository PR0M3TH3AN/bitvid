// Run with: node scripts/run-targeted-tests.mjs tests/services/relay-health-service.test.mjs

import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
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

test("RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  let timeoutCallback;

  // Manually mock setTimeout to capture callback
  globalThis.setTimeout = (cb, delay) => {
    if (delay === 5000) {
        timeoutCallback = cb;
        return 123; // dummy timer id
    }
    return originalSetTimeout(cb, delay);
  };

  try {
    const nostrClient = {
      ensurePool: async () => {},
      pool: {
        ensureRelay: () => new Promise(() => {}), // Never resolves
      },
    };

    const service = new RelayHealthService({ nostrClient });
    const checkPromise = service.checkRelay("wss://timeout.com");

    // Wait for the promise race to register the timeout
    await new Promise((resolve) => originalSetTimeout(resolve, 0));

    // Trigger the timeout manually
    if (timeoutCallback) {
        timeoutCallback();
    } else {
        throw new Error("setTimeout was not called with 5000ms delay");
    }

    await checkPromise;

    const state = service.ensureRelayState("wss://timeout.com");
    assert.equal(state.connected, false);
    assert.equal(state.errorCount, 1);
    assert.equal(state.consecutiveFailures, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("RelayHealthService: failure threshold triggers user warning", () => {
  const userLogger = { warn: mock.fn() };
  const devLogger = { warn: mock.fn() };
  const logger = { user: userLogger, dev: devLogger };

  const service = new RelayHealthService({ logger });
  const url = "wss://fail.com";

  // 1st failure
  service.recordRelayFailure(url, new Error("fail 1"));
  assert.equal(userLogger.warn.mock.callCount(), 0);

  // 2nd failure
  service.recordRelayFailure(url, new Error("fail 2"));
  assert.equal(userLogger.warn.mock.callCount(), 0);

  // 3rd failure (Threshold is 3)
  service.recordRelayFailure(url, new Error("fail 3"));
  assert.equal(userLogger.warn.mock.callCount(), 1);
});

test("RelayHealthService: user warning respects cooldown", () => {
  const originalDateNow = Date.now;
  let currentTime = 1000000;
  Date.now = () => currentTime;

  try {
    const userLogger = { warn: mock.fn() };
    const devLogger = { warn: mock.fn() };
    const logger = { user: userLogger, dev: devLogger };
    const service = new RelayHealthService({ logger });
    const url = "wss://cooldown.com";

    // Trigger 3 failures to reach threshold and get first warning
    service.recordRelayFailure(url, new Error("1"));
    service.recordRelayFailure(url, new Error("2"));
    service.recordRelayFailure(url, new Error("3"));
    assert.equal(userLogger.warn.mock.callCount(), 1);

    // Advance 1 minute (less than 5 mins cooldown)
    currentTime += 60 * 1000;
    service.recordRelayFailure(url, new Error("4"));
    assert.equal(userLogger.warn.mock.callCount(), 1); // Still 1

    // Advance 5 minutes (more than cooldown)
    currentTime += 5 * 60 * 1000;
    service.recordRelayFailure(url, new Error("5"));
    assert.equal(userLogger.warn.mock.callCount(), 2); // Now 2
  } finally {
    Date.now = originalDateNow;
  }
});

test("RelayHealthService: relay disconnect/error events trigger failure", () => {
  const service = new RelayHealthService();
  const url = "wss://events.com";

  // Mock relay
  const relay = new SimpleEventEmitter();

  // Attach listeners manually for this test case (usually done via checkRelay)
  service.attachRelayListeners(url, relay);

  // Simulate connect
  relay.emit("connect");
  assert.equal(service.ensureRelayState(url).connected, true);

  // Simulate disconnect
  relay.emit("disconnect");
  const stateDisconnect = service.ensureRelayState(url);
  assert.equal(stateDisconnect.connected, false);
  assert.equal(stateDisconnect.errorCount, 1);

  // Simulate connect again
  relay.emit("connect");
  assert.equal(service.ensureRelayState(url).connected, true);

  // Simulate error
  relay.emit("error", new Error("boom"));
  const stateError = service.ensureRelayState(url);
  assert.equal(stateError.connected, false);
  assert.equal(stateError.errorCount, 2);
});

test("RelayHealthService: integrates with nostrClient.markRelayUnreachable", () => {
  const markRelayUnreachable = mock.fn();
  const nostrClient = { markRelayUnreachable };
  const service = new RelayHealthService({ nostrClient });

  service.recordRelayFailure("wss://unreachable.com", new Error("fail"));

  assert.equal(markRelayUnreachable.mock.callCount(), 1);
  const args = markRelayUnreachable.mock.calls[0].arguments;
  assert.equal(args[0], "wss://unreachable.com");
  assert.equal(args[1], 60000); // Verify duration
});
