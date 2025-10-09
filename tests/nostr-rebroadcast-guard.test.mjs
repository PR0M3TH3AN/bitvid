// Run with: node tests/nostr-rebroadcast-guard.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS } = await import(
  "../js/config.js"
);
const { nostrClient } = await import("../js/nostr.js");

const NostrClient = nostrClient.constructor;

function createRebroadcastHarness() {
  const client = new NostrClient();
  client.relays = ["wss://relay.test"];

  const publishCalls = [];
  const pool = {
    publish(urls, event) {
      publishCalls.push({ urls, event });
      return {
        on(eventName, handler) {
          if (eventName === "ok") {
            handler();
          }
          return true;
        },
      };
    },
  };
  client.pool = pool;

  const countCalls = [];
  client.countEventsAcrossRelays = async () => {
    countCalls.push(Date.now());
    return { total: 0, perRelay: [] };
  };

  return { client, publishCalls, countCalls };
}

async function testRebroadcastCooldownThrottlesUntilWindowExpires() {
  localStorage.clear();

  const { client, publishCalls, countCalls } = createRebroadcastHarness();

  const eventId = "rebroadcast-test-event";
  const pubkey = "f".repeat(64);
  const rawEvent = {
    id: eventId,
    pubkey,
    kind: 30078,
    created_at: 1_700_000_000,
    sig: "sig",
    tags: [],
    content: "{}",
  };

  client.rawEvents.set(eventId, rawEvent);
  client.allEvents.set(eventId, { id: eventId, pubkey });

  const originalNow = Date.now;
  let nowMs = 1_700_000_000_000;
  Date.now = () => nowMs;

  const cooldownMs =
    Number(ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS) * 1000;

  try {
    const first = await client.rebroadcastEvent(eventId, { pubkey });
    assert.equal(first.ok, true, "first attempt should succeed");
    assert.equal(publishCalls.length, 1, "first attempt should publish once");
    assert.equal(countCalls.length, 1, "first attempt should issue a count");

    const second = await client.rebroadcastEvent(eventId, { pubkey });
    assert.equal(
      second.throttled,
      true,
      "cooldown guard should throttle the immediate retry",
    );
    assert.equal(
      publishCalls.length,
      1,
      "throttled attempt must not publish again",
    );
    assert.equal(
      countCalls.length,
      1,
      "throttled attempt must not issue another COUNT",
    );
    assert.ok(
      Number(second?.cooldown?.remainingMs) > 0,
      "throttled response should include remaining cooldown",
    );

    nowMs += cooldownMs + 1_000;

    const third = await client.rebroadcastEvent(eventId, { pubkey });
    assert.equal(third.ok, true, "attempt after cooldown should succeed");
    assert.equal(publishCalls.length, 2, "rebroadcast should fire again after cooldown");
    assert.equal(countCalls.length, 2, "cooldown reset should allow another COUNT");
  } finally {
    Date.now = originalNow;
  }
}

await testRebroadcastCooldownThrottlesUntilWindowExpires();

console.log("nostr rebroadcast guard tests passed");
