// The main video feed must never starve itself onto a fully-broken relay list.
// A user whose own relays are all dead (but not yet probed, so they still pass
// the liveness filter) would otherwise have the feed subscribe only to those
// dead relays and hang on "Fetching…" forever. buildFeedRelaySet guarantees the
// reliable default aggregators are always present so the feed can reach live
// relays regardless of how broken the user's personal list is.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFeedRelaySet,
  DEFAULT_RELAY_URLS,
  MAX_SUBSCRIBE_RELAYS,
} from "../js/nostr/toolkit.js";

const containsAnyDefault = (relays) =>
  relays.some((url) => DEFAULT_RELAY_URLS.includes(url));

test("a healthy-looking but all-dead user list still yields default aggregators", () => {
  // None of these are bitvid defaults — they're the user's own (dead) relays
  // that happened to survive the health filter because they weren't probed yet.
  const deadUserRelays = [
    "wss://dead-one.example.com",
    "wss://dead-two.example.com",
    "wss://dead-three.example.com",
  ];

  const result = buildFeedRelaySet(deadUserRelays, deadUserRelays);

  assert.ok(
    containsAnyDefault(result),
    `feed set must include at least one default aggregator; got ${JSON.stringify(result)}`,
  );
  // The user's own relays are still prioritized — they aren't discarded.
  assert.ok(
    deadUserRelays.every((url) => result.includes(url)),
    "the user's own relays should remain in the feed set",
  );
});

test("falls back to defaults when the healthy set is empty", () => {
  // Healthy is empty AND the fallback (this.relays) is empty too.
  const result = buildFeedRelaySet([], []);
  assert.ok(result.length > 0, "must never return an empty feed relay set");
  assert.ok(
    containsAnyDefault(result),
    "an empty input must fall back to default aggregators",
  );
});

test("uses the fallback list when the healthy set is empty but relays exist", () => {
  // Simulates getHealthyRelays() filtering everything out, but this.relays still
  // holds the (capped) configured set.
  const configured = ["wss://configured.example.com"];
  const result = buildFeedRelaySet([], configured);
  assert.ok(
    result.includes("wss://configured.example.com"),
    "configured relays should be used when nothing is currently healthy",
  );
  assert.ok(
    containsAnyDefault(result),
    "defaults are still reserved alongside the fallback list",
  );
});

test("bounds the feed set so a huge user list can't flood REQ fan-out", () => {
  const many = Array.from(
    { length: 30 },
    (_, i) => `wss://user-relay-${i}.example.com`,
  );
  const result = buildFeedRelaySet(many, many);
  assert.ok(
    result.length <= MAX_SUBSCRIBE_RELAYS,
    `feed set must be bounded to ${MAX_SUBSCRIBE_RELAYS}; got ${result.length}`,
  );
  assert.ok(
    containsAnyDefault(result),
    "even a full user list must reserve default aggregators",
  );
});
