// Scenario (SCN-relay-subscribe-cap):
//   Given a user's NIP-65 relay list with many relays (the real-env case had
//     ~20, most dead),
//   When the client applies those relay preferences,
//   Then the SUBSCRIBE/read set is capped to a small bounded core (so query
//     fan-out can't explode and re-storm on reconnect),
//   And the WRITE set is NOT capped (publish reach is preserved),
//   And the bundled known-good defaults are prioritized into the read set.

import "./test-helpers/setup-localstorage.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { nostrClient } = await import("../js/nostrClientFacade.js");
const { DEFAULT_RELAY_URLS } = await import("../js/nostr/toolkit.js");

test("subscribe/read relays are capped; write relays are not", () => {
  const many = [
    "wss://dead1.example",
    "wss://dead2.example",
    "wss://dead3.example",
    "wss://dead4.example",
    "wss://dead5.example",
    "wss://dead6.example",
    "wss://dead7.example",
    "wss://dead8.example",
    ...DEFAULT_RELAY_URLS, // known-good, listed last on purpose
  ];

  nostrClient.applyRelayPreferences({ all: many, write: many });

  // Read/subscribe set is bounded.
  assert.ok(
    nostrClient.relays.length <= 6,
    `read set should be capped (<=6), got ${nostrClient.relays.length}`,
  );
  assert.ok(
    nostrClient.readRelays.length <= 6,
    `readRelays should be capped (<=6), got ${nostrClient.readRelays.length}`,
  );

  // Known-good defaults are prioritized into the capped read set despite being
  // listed last in the input.
  for (const url of DEFAULT_RELAY_URLS) {
    assert.ok(
      nostrClient.relays.includes(url),
      `known-good default ${url} should survive the cap`,
    );
  }

  // Writes are NOT capped — publish reach preserved.
  assert.equal(
    nostrClient.writeRelays.length,
    new Set(many).size,
    "write set must include every configured relay",
  );
});
