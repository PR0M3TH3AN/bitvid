// Run with: node tests/nostr-count-fallback.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

const { VIEW_COUNT_BACKFILL_MAX_DAYS } = await import("../js/config.js");
const { nostrClient } = await import("../js/nostr.js");

const NostrClient = nostrClient.constructor;

async function withFrozenTime(timestampSeconds, callback) {
  const originalNow = Date.now;
  Date.now = () => timestampSeconds * 1000;
  try {
    return await callback();
  } finally {
    Date.now = originalNow;
  }
}

function getConfiguredHorizonDays() {
  const horizonDaysRaw = Number(VIEW_COUNT_BACKFILL_MAX_DAYS);
  return Number.isFinite(horizonDaysRaw)
    ? Math.max(0, Math.floor(horizonDaysRaw))
    : 0;
}

async function testFallbackAddsDefaultSinceWhenPoolMissing() {
  const client = new NostrClient();
  client.pool = null;

  const pointer = { type: "e", value: "count-fallback-default" };
  const calls = [];
  client.listVideoViewEvents = async (_, options = {}) => {
    calls.push({ ...options });
    return [];
  };

  const horizonDays = getConfiguredHorizonDays();

  const nowSeconds = 1_700_000_000;
  await withFrozenTime(nowSeconds, async () => {
    const result = await client.countVideoViewEvents(pointer, {});
    assert.equal(calls.length, 1, "fallback should issue a single list query");
    const [{ since }] = calls;
    if (horizonDays > 0) {
      const expectedSince = Math.max(0, nowSeconds - horizonDays * 86_400);
      assert.equal(
        since,
        expectedSince,
        "fallback list should clamp history to the configured horizon"
      );
    } else {
      assert.equal(
        Object.prototype.hasOwnProperty.call(calls[0], "since"),
        false,
        "without a configured horizon the fallback should avoid forcing a since filter"
      );
    }
    assert.equal(result.fallback, true, "fallback branch should be flagged");
  });
}

async function testFallbackHonorsCallerOverrides() {
  const client = new NostrClient();
  client.pool = null;

  const pointer = { type: "e", value: "count-fallback-overrides" };
  let receivedOptions = null;
  client.listVideoViewEvents = async (_, options = {}) => {
    receivedOptions = { ...options };
    return [];
  };

  const overrides = {
    since: 1_234_567,
    until: 1_235_000,
    limit: 42,
  };

  await client.countVideoViewEvents(pointer, overrides);

  assert.ok(receivedOptions, "fallback should forward overrides to list");
  assert.equal(
    receivedOptions.since,
    Math.floor(overrides.since),
    "caller supplied since should be preserved"
  );
  assert.equal(
    receivedOptions.until,
    Math.floor(overrides.until),
    "caller supplied until should be preserved"
  );
  assert.equal(
    receivedOptions.limit,
    Math.floor(overrides.limit),
    "caller supplied limit should be preserved"
  );
}

async function testFallbackAfterCountFailureUsesDefaultWindow() {
  const client = new NostrClient();
  client.pool = {};
  client.countEventsAcrossRelays = async () => {
    throw new Error("count failed");
  };

  const pointer = { type: "e", value: "count-fallback-error" };
  let receivedOptions = null;
  client.listVideoViewEvents = async (_, options = {}) => {
    receivedOptions = { ...options };
    return [];
  };

  const horizonDays = getConfiguredHorizonDays();

  const nowSeconds = 1_800_000_000;
  await withFrozenTime(nowSeconds, async () => {
    await client.countVideoViewEvents(pointer, {});
  });

  assert.ok(receivedOptions, "fallback should invoke the list helper");
  if (horizonDays > 0) {
    const expectedSince = Math.max(0, nowSeconds - horizonDays * 86_400);
    assert.equal(
      receivedOptions.since,
      expectedSince,
      "COUNT fallback should restrict scans to the configured horizon"
    );
  } else {
    assert.equal(
      Object.prototype.hasOwnProperty.call(receivedOptions, "since"),
      false,
      "COUNT fallback should avoid forcing a since filter when no horizon is set"
    );
  }
}

await testFallbackAddsDefaultSinceWhenPoolMissing();
await testFallbackHonorsCallerOverrides();
await testFallbackAfterCountFailureUsesDefaultWindow();

console.log("nostr COUNT fallback tests completed successfully.");
