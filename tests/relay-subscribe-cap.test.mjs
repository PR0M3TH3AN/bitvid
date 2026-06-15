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
const { DEFAULT_RELAY_URLS, RESERVED_DEFAULT_RELAY_SLOTS } = await import(
  "../js/nostr/toolkit.js"
);

test("subscribe/read relays are capped and ALWAYS include defaults; writes are not", () => {
  // A user's NIP-65 list of dead relays that contains NONE of the bundled
  // defaults — the real-env failure mode that starved decryption.
  const deadList = [
    "wss://dead1.example",
    "wss://dead2.example",
    "wss://dead3.example",
    "wss://dead4.example",
    "wss://dead5.example",
    "wss://dead6.example",
    "wss://dead7.example",
    "wss://dead8.example",
    "wss://dead9.example",
    "wss://dead10.example",
  ];

  nostrClient.applyRelayPreferences({ all: deadList, write: deadList });

  // Read/subscribe set is bounded.
  assert.ok(
    nostrClient.relays.length <= 8,
    `read set should be capped (<=8), got ${nostrClient.relays.length}`,
  );

  // Reliable defaults must be present EVEN THOUGH none were in the user's list —
  // otherwise reads point only at the user's dead relays and decryption starves.
  // The cap reserves a small guaranteed core for defaults (the rest of the set
  // stays the user's own relays, which is where their data authoritatively
  // lives), so at least RESERVED_DEFAULT_RELAY_SLOTS defaults must survive.
  const survivingDefaults = DEFAULT_RELAY_URLS.filter((url) =>
    nostrClient.relays.includes(url),
  );
  assert.ok(
    survivingDefaults.length >= RESERVED_DEFAULT_RELAY_SLOTS,
    `read set must keep >=${RESERVED_DEFAULT_RELAY_SLOTS} reliable defaults, got ${survivingDefaults.length}`,
  );

  // Writes are NOT capped and must NOT be forced to include defaults.
  assert.equal(
    nostrClient.writeRelays.length,
    new Set(deadList).size,
    "write set must be the full configured set (publish reach preserved)",
  );
  assert.ok(
    !nostrClient.writeRelays.includes(DEFAULT_RELAY_URLS[0]),
    "defaults must not be injected into the write set",
  );
});
