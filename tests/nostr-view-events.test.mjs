// Run with: node tests/nostr-view-events.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const {
  deriveViewEventBucketIndex,
  hasRecentViewPublish,
  rememberViewPublish,
  createVideoViewEventFilters,
  getViewEventGuardWindowMs,
} = await import("../js/nostr/viewEvents.js");
<<<<<<< HEAD
=======
const {
  setViewFilterIncludeLegacyVideo,
  resetRuntimeFlags,
} = await import("../js/constants.js");
>>>>>>> origin/main

async function withMockedNow(initialMs, callback) {
  const originalNow = Date.now;
  let nowMs = initialMs;
  Date.now = () => nowMs;
  const setNow = (nextMs) => {
    nowMs = nextMs;
  };
  try {
    await callback({ setNow, getNow: () => nowMs });
  } finally {
    Date.now = originalNow;
  }
}

async function testRememberViewPublishHonorsGuardWindow() {
  localStorage.clear();

  const scope = "a:test-pointer";
  const bucket = deriveViewEventBucketIndex(1_700_000_000);
  const windowMs = getViewEventGuardWindowMs();

  await withMockedNow(1_700_000_000_000, async ({ setNow }) => {
    assert.equal(
      hasRecentViewPublish(scope, bucket),
      false,
      "guard should not report recent publish before remembering",
    );

    rememberViewPublish(scope, bucket);

    assert.equal(
      hasRecentViewPublish(scope, bucket),
      true,
      "guard should report recent publish immediately after remembering",
    );

    const halfWindow = Math.max(1, Math.floor(windowMs / 2));
    setNow(1_700_000_000_000 + halfWindow);
    assert.equal(
      hasRecentViewPublish(scope, bucket),
      true,
      "guard should continue blocking within the same window",
    );

    setNow(1_700_000_000_000 + windowMs + 5_000);
    assert.equal(
      hasRecentViewPublish(scope, bucket),
      false,
      "guard should allow publishes once the window has elapsed",
    );
  });
}

function assertPointerFilterStructure(filter, pointerValue, label) {
  assert.ok(filter, `${label} filter should be defined`);
  assert.ok(Array.isArray(filter.kinds), `${label} filter should specify kinds`);
  assert.ok(
    Number.isFinite(filter.kinds[0]),
    `${label} filter should target a numeric kind`,
  );
  assert.deepEqual(filter["#t"], ["view"], `${label} filter should require the view tag`);
  assert.deepEqual(filter["#a"] ?? filter["#e"], [pointerValue], `${label} filter should bind the pointer value`);
}

async function testCreateVideoViewEventFiltersForAddressPointer() {
  const pointerValue = "30079:abc:def";
  const pointer = { type: "a", value: pointerValue, relay: "wss://relay.example" };
  const { pointer: descriptor, filters } = createVideoViewEventFilters(pointer);

  assert.deepEqual(
    descriptor,
    { type: "a", value: pointerValue, relay: "wss://relay.example" },
    "descriptor should preserve pointer structure",
  );

  assert.ok(Array.isArray(filters) && filters.length === 1, "default filters should include only the pointer filter");
  assertPointerFilterStructure(filters[0], pointerValue, "primary");
}

<<<<<<< HEAD
async function testCreateVideoViewEventFiltersForEventPointer() {
  const pointerValue = "legacy-event";
  const { filters } = createVideoViewEventFilters({ type: "e", value: pointerValue });
  assert.ok(Array.isArray(filters) && filters.length === 1, "filters should include only the pointer filter");
  assertPointerFilterStructure(filters[0], pointerValue, "primary");
=======
async function testCreateVideoViewEventFiltersIncludeLegacyWhenEnabled() {
  const pointerValue = "legacy-event";
  resetRuntimeFlags();
  setViewFilterIncludeLegacyVideo(true);
  try {
    const { filters } = createVideoViewEventFilters({ type: "e", value: pointerValue });
    assert.ok(Array.isArray(filters) && filters.length === 2, "legacy flag should add a secondary filter");
    assertPointerFilterStructure(filters[0], pointerValue, "primary");
    const legacyFilter = filters[1];
    assert.ok(legacyFilter, "legacy filter should exist when flag enabled");
    assert.deepEqual(
      legacyFilter["#video"],
      [pointerValue],
      "legacy filter should match the pointer value via #video tag",
    );
  } finally {
    resetRuntimeFlags();
  }
>>>>>>> origin/main
}

await testRememberViewPublishHonorsGuardWindow();
await testCreateVideoViewEventFiltersForAddressPointer();
<<<<<<< HEAD
await testCreateVideoViewEventFiltersForEventPointer();
=======
await testCreateVideoViewEventFiltersIncludeLegacyWhenEnabled();
>>>>>>> origin/main

console.log("nostr view events tests passed");
