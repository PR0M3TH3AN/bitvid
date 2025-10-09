import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

import WatchHistoryTelemetry from "../../js/services/watchHistoryTelemetry.js";

const hexPubkey = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

function createTelemetry({
  serviceOverrides = {},
  controllerOverrides = {},
  options = {},
} = {}) {
  const watchHistoryService = {
    isEnabled: () => true,
    getSettings: () => ({ metadata: { storeLocally: true } }),
    setLocalMetadata: () => {},
    removeLocalMetadata: () => {},
    clearLocalMetadata: () => {},
    publishView: async () => ({ ok: true }),
    subscribe: () => () => {},
    ...serviceOverrides,
  };

  const watchHistoryController = {
    handleWatchHistoryRemoval: async () => ({}),
    flush: async () => {},
    ...controllerOverrides,
  };

  const telemetry = new WatchHistoryTelemetry({
    watchHistoryService,
    watchHistoryController,
    nostrClient: options.nostrClient || { pubkey: hexPubkey },
    log: options.log || (() => {}),
    normalizeHexPubkey:
      options.normalizeHexPubkey || ((value) => (typeof value === "string" ? value.toLowerCase() : null)),
    getActiveUserPubkey: options.getActiveUserPubkey || (() => hexPubkey),
    ingestLocalViewEvent: options.ingestLocalViewEvent || (() => {}),
    viewThresholdSeconds: options.viewThresholdSeconds,
  });

  return { telemetry, watchHistoryService, watchHistoryController };
}

class FakeVideoElement {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.currentTime = 0;
  }

  addEventListener(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(handler);
  }

  removeEventListener(eventName, handler) {
    const set = this.listeners.get(eventName);
    if (!set) {
      return;
    }
    set.delete(handler);
    if (set.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName) {
    const set = this.listeners.get(eventName);
    if (!set) {
      return;
    }
    for (const handler of set) {
      handler({ type: eventName });
    }
  }
}

async function flushAsyncOperations() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function testMetadataPreferenceSync() {
  let subscribeTopic = null;
  let subscribeHandler = null;
  let cleared = false;

  const { telemetry } = createTelemetry({
    serviceOverrides: {
      subscribe: (topic, handler) => {
        subscribeTopic = topic;
        subscribeHandler = handler;
        return () => {};
      },
      clearLocalMetadata: () => {
        cleared = true;
      },
      getSettings: () => ({ metadata: { storeLocally: true } }),
    },
    options: {
      getActiveUserPubkey: () => null,
    },
  });

  const unsubscribe = await telemetry.initPreferenceSync();
  assert.equal(subscribeTopic, "metadata-preference");
  assert.equal(typeof unsubscribe, "function");
  assert.equal(telemetry.isMetadataPreferenceEnabled(), true);

  subscribeHandler({ enabled: false });
  assert.equal(telemetry.isMetadataPreferenceEnabled(), false);
  assert.equal(cleared, true);

  subscribeHandler({ enabled: true });
  assert.equal(telemetry.isMetadataPreferenceEnabled(), true);

}

async function testPreparePlaybackLoggingPublishesOnce() {
  const ingestEvents = [];
  const publishCalls = [];

  const pointer = { type: "e", value: "event-id" };
  const pointerKey = "event-id::relay";

  const { telemetry } = createTelemetry({
    serviceOverrides: {
      publishView: async (ptr, _relay, metadata) => {
        publishCalls.push({ ptr, metadata });
        return {
          ok: true,
          event: { pubkey: hexPubkey },
        };
      },
    },
    options: {
      ingestLocalViewEvent: (payload) => ingestEvents.push(payload),
    },
  });

  const videoA = new FakeVideoElement();
  videoA.paused = false;
  videoA.currentTime = telemetry.viewThresholdSeconds;

  telemetry.preparePlaybackLogging({
    videoElement: videoA,
    pointer,
    pointerKey,
  });
  await flushAsyncOperations();

  assert.equal(publishCalls.length, 1, "publishView should be called once");
  assert.equal(ingestEvents.length, 1, "ingestLocalViewEvent should run once");
  assert.deepEqual(publishCalls[0].ptr, pointer);
  assert.deepEqual(ingestEvents[0].pointer, pointer);

  const videoB = new FakeVideoElement();
  videoB.paused = false;
  videoB.currentTime = telemetry.viewThresholdSeconds;

  telemetry.preparePlaybackLogging({
    videoElement: videoB,
    pointer,
    pointerKey,
  });
  await flushAsyncOperations();

  assert.equal(
    publishCalls.length,
    1,
    "Repeated preparePlaybackLogging should reuse cooldown cache"
  );
}

async function testPreparePlaybackLoggingIncludesVideoMetadata() {
  const publishCalls = [];

  const pointer = { type: "e", value: "event-id" };
  const pointerKey = "event-id";

  const { telemetry } = createTelemetry({
    serviceOverrides: {
      publishView: async (ptr, _relay, metadata) => {
        publishCalls.push({ ptr, metadata });
        return {
          ok: true,
          event: { pubkey: hexPubkey },
        };
      },
    },
  });

  const videoElement = new FakeVideoElement();
  videoElement.paused = false;
  videoElement.currentTime = telemetry.viewThresholdSeconds;

  const videoMetadata = {
    id: "evt1",
    title: "Example Video",
    thumbnail: "https://example.com/thumb.jpg",
    pubkey: hexPubkey,
    rootCreatedAt: 1_700_000_000,
    url: "https://example.com/video.mp4",
  };

  telemetry.preparePlaybackLogging({
    videoElement,
    pointer,
    pointerKey,
    video: videoMetadata,
  });

  await flushAsyncOperations();

  assert.equal(publishCalls.length, 1, "publishView should be invoked once");
  assert.equal(publishCalls[0].ptr, pointer);
  assert.ok(publishCalls[0].metadata, "metadata payload should exist");
  assert.deepEqual(publishCalls[0].metadata.video, {
    id: "evt1",
    title: "Example Video",
    thumbnail: "https://example.com/thumb.jpg",
    pubkey: hexPubkey,
    created_at: 1_700_000_000,
  });
}

async function testCancelPlaybackLoggingFlushes() {
  let flushArgs = null;
  const video = new FakeVideoElement();
  const { telemetry } = createTelemetry({
    controllerOverrides: {
      flush: async (reason, context) => {
        flushArgs = { reason, context };
      },
    },
  });

  video.paused = true;
  video.currentTime = 0;

  telemetry.preparePlaybackLogging({
    videoElement: video,
    pointer: { type: "e", value: "event" },
    pointerKey: "event",
  });

  telemetry.cancelPlaybackLogging({ reason: "unit", context: "test" });
  await flushAsyncOperations();

  assert.deepEqual(flushArgs, { reason: "unit", context: "test" });
}

await testMetadataPreferenceSync();
await testPreparePlaybackLoggingPublishesOnce();
await testPreparePlaybackLoggingIncludesVideoMetadata();
await testCancelPlaybackLoggingFlushes();

console.log("watch-history-telemetry tests passed");
