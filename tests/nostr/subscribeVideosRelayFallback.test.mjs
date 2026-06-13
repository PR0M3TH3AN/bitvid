// Regression test for the first-load feed race.
//
// Scenario (SCN-subscribe-videos-empty-relay-fallback):
//   Given the initial relay connect probe timed out on a cold first load, so no
//     relays are currently marked healthy,
//   When the feed subscription is created via subscribeVideos,
//   Then it must subscribe to the default relay set (not an empty relay list),
//     because a zero-relay subscription silently never delivers events and never
//     self-heals when relays reconnect — forcing the user to refresh the page.
//
// Observable outcome asserted at the boundary: the relay list passed to
// pool.sub().

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { NostrClient } from "../../js/nostr/client.js";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = class MockWebSocket {};
}

describe("subscribeVideos relay fallback", () => {
  let client;
  let mockPool;
  let subRelayArgs;

  beforeEach(() => {
    client = new NostrClient();
    subRelayArgs = null;
    mockPool = {
      sub: mock.fn((relays) => {
        subRelayArgs = relays;
        return { on: mock.fn(), unsub: mock.fn() };
      }),
    };
    client.pool = mockPool;
    client.isInitialized = true;
    client.relays = ["wss://relay.example.com", "wss://relay2.example.com"];
  });

  afterEach(() => {
    mock.reset();
  });

  it("falls back to the default relay set when no relays are healthy", () => {
    // Simulate the cold-start race: the connect probe timed out, so every relay
    // is currently filtered out as unhealthy.
    client.getHealthyRelays = () => [];

    client.subscribeVideos(() => {});

    assert.equal(mockPool.sub.mock.callCount(), 1);
    assert.ok(Array.isArray(subRelayArgs), "pool.sub must receive a relay array");
    assert.ok(
      subRelayArgs.length > 0,
      "must never subscribe to ZERO relays when healthy relays are empty",
    );
    for (const url of subRelayArgs) {
      assert.match(
        url,
        /^wss?:\/\//,
        `fallback relay should be a websocket URL, got ${url}`,
      );
    }
  });

  it("uses the healthy relays when they are available", () => {
    const healthy = ["wss://relay.example.com"];
    client.getHealthyRelays = () => healthy;

    client.subscribeVideos(() => {});

    assert.equal(mockPool.sub.mock.callCount(), 1);
    assert.deepEqual(
      subRelayArgs,
      healthy,
      "should subscribe using the healthy relays, not the default fallback",
    );
  });
});
