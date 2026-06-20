// Regression test for the first-load feed race + the dead-relay liveness
// backstop.
//
// Scenario (SCN-subscribe-videos-empty-relay-fallback):
//   Given the initial relay connect probe timed out on a cold first load, so no
//     relays are currently marked healthy,
//   When the feed subscription is created via subscribeVideos,
//   Then it must subscribe to the default relay set (not an empty relay list),
//     because a zero-relay subscription silently never delivers events and never
//     self-heals when relays reconnect — forcing the user to refresh the page.
//
// Scenario (SCN-feed-reserve-live-defaults):
//   Given the user has healthy-looking relays that may actually be dead,
//   When the feed subscription is created,
//   Then it must include the user's healthy relays AND reserve known-good default
//     aggregators, so the feed reaches a live relay regardless of the user's list.
//
// Observable outcome asserted at the boundary: the relay list passed to
// pool.sub().

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { NostrClient } from "../../js/nostr/client.js";
import {
  DEFAULT_RELAY_URLS,
  MAX_SUBSCRIBE_RELAYS,
} from "../../js/nostr/toolkit.js";

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

  // Spec correction (SCN-feed-reserve-live-defaults): the feed no longer
  // subscribes to ONLY the currently-healthy relays. A user's relays can pass
  // the liveness filter yet still be dead (not actually probed this session), in
  // which case a healthy-only set would hang the feed forever on "Fetching…".
  // The feed now always reserves a couple of known-good default aggregators
  // alongside the user's relays (see buildFeedRelaySet). The user's healthy
  // relays must still be present (original intent preserved) AND at least one
  // default must be reserved (new liveness guarantee), bounded to the read cap.
  it("uses the healthy relays AND reserves live default aggregators", () => {
    const healthy = ["wss://relay.example.com"];
    client.getHealthyRelays = () => healthy;

    client.subscribeVideos(() => {});

    assert.equal(mockPool.sub.mock.callCount(), 1);
    assert.ok(Array.isArray(subRelayArgs), "pool.sub must receive a relay array");

    // Original intent: the user's healthy relays are not ignored.
    for (const url of healthy) {
      assert.ok(
        subRelayArgs.includes(url),
        `healthy relay ${url} must remain in the feed set`,
      );
    }
    // New guarantee: at least one reliable default is always reserved, so the
    // feed can reach a live relay even if the user's own relays are dead.
    assert.ok(
      subRelayArgs.some((url) => DEFAULT_RELAY_URLS.includes(url)),
      "must reserve at least one default aggregator alongside healthy relays",
    );
    // Still bounded so a huge user list can't flood REQ fan-out.
    assert.ok(
      subRelayArgs.length <= MAX_SUBSCRIBE_RELAYS,
      `feed set must stay within the read cap (${MAX_SUBSCRIBE_RELAYS})`,
    );
  });
});
