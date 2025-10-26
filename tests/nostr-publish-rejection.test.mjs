import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!window.crypto || !window.crypto.getRandomValues) {
  const { webcrypto } = await import("node:crypto");
  window.crypto = webcrypto;
}

const originalWindowNostr = window.nostr;
const originalWindowNostrTools = window.NostrTools;
const nostrToolsModule = await import("nostr-tools");

window.nostr = {
  ...(originalWindowNostr || {}),
  signEvent: async (event) => ({
    ...event,
    id: event?.id || `stub-${Math.random().toString(36).slice(2)}`,
    sig: "stub-signature",
  }),
  nip04: {
    ...(originalWindowNostr?.nip04 || {}),
    encrypt: async () => "cipher-text",
  },
};

window.NostrTools = {
  ...(originalWindowNostrTools || {}),
  ...nostrToolsModule,
  generatePrivateKey: () => {
    const raw = nostrToolsModule.generateSecretKey();
    const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw || []);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  },
  getEventHash: nostrToolsModule.getEventHash,
  signEvent: (event, priv) => {
    const signed = nostrToolsModule.finalizeEvent(event, priv);
    return signed.sig;
  },
};

let activeSignerCleanup = null;

try {
  const { RelayPublishError } = await import("../js/nostrPublish.js");
  const { nostrClient, setActiveSigner, clearActiveSigner } = await import("../js/nostr.js");
  const { subscriptions } = await import("../js/subscriptions.js");
  const { userBlocks } = await import("../js/userBlocks.js");

  setActiveSigner({
    type: "session",
    pubkey: "f".repeat(64),
    signEvent: async (event) => ({
      ...event,
      id: event?.id || `signed-${event.kind}`,
      sig: `sig-${event.kind}`,
    }),
    nip04Encrypt: async (_pubkey, plaintext) => `cipher:${plaintext}`,
  });
  activeSignerCleanup = clearActiveSigner;

  function createRejectingPool(reason = "relay rejected") {
    const calls = [];
    return {
      calls,
      publish(urls, event) {
        calls.push({
          urls: Array.isArray(urls) ? [...urls] : [],
          event,
        });
        return {
          on(eventName, handler) {
            if (eventName === "failed") {
              handler(new Error(reason));
            }
            return this;
          },
        };
      },
    };
  }

  function snapshotRelayState(client) {
    return {
      relays: Array.isArray(client.relays) ? [...client.relays] : [],
      readRelays: Array.isArray(client.readRelays)
        ? [...client.readRelays]
        : [],
      writeRelays: Array.isArray(client.writeRelays)
        ? [...client.writeRelays]
        : [],
      pool: client.pool,
    };
  }

  function restoreRelayState(client, snapshot) {
    client.relays = [...snapshot.relays];
    client.readRelays = [...snapshot.readRelays];
    client.writeRelays = [...snapshot.writeRelays];
    client.pool = snapshot.pool;
  }

  function applyTestRelayState(client, relays, pool) {
    client.relays = [...relays];
    client.readRelays = [...relays];
    client.writeRelays = [...relays];
    client.pool = pool;
  }

  async function testPublishVideoRejectsWhenAllRelaysFail() {
    const testRelays = [
      "wss://relay-a.example",
      "wss://relay-b.example",
    ];
    const pool = createRejectingPool("video rejected");
    const relaySnapshot = snapshotRelayState(nostrClient);
    applyTestRelayState(nostrClient, testRelays, pool);

    try {
      await assert.rejects(
        nostrClient.publishVideo(
          {
            legacyFormData: {
              title: "Test video",
              magnet: "magnet:?xt=urn:btih:TESTVIDEO1234567890",
              mode: "live",
            },
            nip71: {
              imeta: [
                {
                  m: "video/mp4",
                  url: "https://cdn.example/test.mp4",
                },
              ],
            },
          },
          "f".repeat(64)
        ),
        (error) => {
          assert.ok(
            error instanceof RelayPublishError,
            "publishVideo should reject with RelayPublishError"
          );
          assert.equal(
            error.relayFailures.length,
            testRelays.length,
            "relayFailures should include every relay"
          );
          const urls = error.relayFailures
            .map((entry) => entry.url)
            .sort();
          assert.deepEqual(
            urls,
            [...testRelays].sort(),
            "relayFailures should include the rejecting relay URLs"
          );
          return true;
        }
      );

      assert.equal(
        pool.calls.length,
        testRelays.length,
        "publishVideo should attempt each relay"
      );
    } finally {
      restoreRelayState(nostrClient, relaySnapshot);
    }
  }

  async function testPublishSubscriptionListRejectsWhenAllRelaysFail() {
    const testRelays = [
      "wss://relay-a.example",
      "wss://relay-b.example",
    ];
    const pool = createRejectingPool("subscription rejected");
    const relaySnapshot = snapshotRelayState(nostrClient);
    applyTestRelayState(nostrClient, testRelays, pool);

    const originalSubs = new Set(subscriptions.subscribedPubkeys);
    const originalSubsEventId = subscriptions.subsEventId;
    subscriptions.subscribedPubkeys = new Set(["abcdef1234567890"]);
    subscriptions.subsEventId = null;

    try {
      await assert.rejects(
        subscriptions.publishSubscriptionList("f".repeat(64)),
        (error) => {
          assert.ok(
            error instanceof RelayPublishError,
            "publishSubscriptionList should reject with RelayPublishError"
          );
          assert.equal(
            error.relayFailures.length,
            testRelays.length,
            "relayFailures should include each relay for subscriptions"
          );
          const urls = error.relayFailures
            .map((entry) => entry.url)
            .sort();
          assert.deepEqual(urls, [...testRelays].sort());
          return true;
        }
      );

      assert.equal(
        pool.calls.length,
        testRelays.length,
        "publishSubscriptionList should attempt each relay"
      );
      assert.equal(
        subscriptions.subsEventId,
        null,
        "subsEventId should remain unset on failure"
      );
    } finally {
      subscriptions.subscribedPubkeys = originalSubs;
      subscriptions.subsEventId = originalSubsEventId;
      restoreRelayState(nostrClient, relaySnapshot);
    }
  }

  async function testPublishBlockListRejectsWhenAllRelaysFail() {
    const testRelays = [
      "wss://relay-a.example",
      "wss://relay-b.example",
    ];
    const pool = createRejectingPool("block list rejected");
    const relaySnapshot = snapshotRelayState(nostrClient);
    applyTestRelayState(nostrClient, testRelays, pool);

    const originalBlocked = new Set(userBlocks.blockedPubkeys);
    const originalBlockEventId = userBlocks.blockEventId;
    const originalMuteEventId = userBlocks.muteEventId;
    const originalMuteEventCreatedAt = userBlocks.muteEventCreatedAt;
    userBlocks.blockedPubkeys = new Set(["abcd".repeat(16)]);
    userBlocks.blockEventId = null;
    userBlocks.muteEventId = null;
    userBlocks.muteEventCreatedAt = null;

    try {
      await assert.rejects(
        userBlocks.publishBlockList("f".repeat(64)),
        (error) => {
          assert.ok(
            error instanceof RelayPublishError,
            "publishBlockList should reject with RelayPublishError"
          );
          assert.equal(
            error.relayFailures.length,
            testRelays.length,
            "relayFailures should include each relay for block list"
          );
          const urls = error.relayFailures
            .map((entry) => entry.url)
            .sort();
          assert.deepEqual(urls, [...testRelays].sort());
          return true;
        }
      );

      assert.equal(
        pool.calls.length,
        testRelays.length,
        "publishBlockList should attempt each relay"
      );
      assert.equal(
        userBlocks.blockEventId,
        null,
        "blockEventId should remain unset on failure"
      );
    } finally {
      userBlocks.blockedPubkeys = originalBlocked;
      userBlocks.blockEventId = originalBlockEventId;
      userBlocks.muteEventId = originalMuteEventId;
      userBlocks.muteEventCreatedAt = originalMuteEventCreatedAt;
      restoreRelayState(nostrClient, relaySnapshot);
    }
  }

  await testPublishVideoRejectsWhenAllRelaysFail();
  await testPublishSubscriptionListRejectsWhenAllRelaysFail();
  await testPublishBlockListRejectsWhenAllRelaysFail();

  console.log("nostr publish rejection tests passed");
} finally {
  if (typeof activeSignerCleanup === "function") {
    try {
      activeSignerCleanup();
    } catch (_) {
      // ignore cleanup errors
    }
  }
  if (typeof originalWindowNostr === "undefined") {
    delete window.nostr;
  } else {
    window.nostr = originalWindowNostr;
  }
  if (typeof originalWindowNostrTools === "undefined") {
    delete window.NostrTools;
  } else {
    window.NostrTools = originalWindowNostrTools;
  }
}
