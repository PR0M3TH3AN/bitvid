import { test } from "node:test";
import assert from "node:assert/strict";

import { nostrClient } from "../js/nostr.js";
import { subscriptions } from "../js/subscriptions.js";

test("loadSubscriptions aggregates relay results when one rejects", async () => {
  const SubscriptionsManager = subscriptions.constructor;
  const manager = new SubscriptionsManager();

  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalPool = nostrClient.pool;
  const originalEnsurePermissions = nostrClient.ensureExtensionPermissions;

  const hadWindow = typeof globalThis.window !== "undefined";
  if (!hadWindow) {
    globalThis.window = {};
  }
  const originalWindowNostr = globalThis.window.nostr;

  const relayUrls = [
    "wss://relay-a.example",
    "wss://relay-b.example",
    "wss://relay-c.example",
  ];
  nostrClient.relays = relayUrls;

  const eventsByRelay = {
    "wss://relay-a.example": [
      {
        id: "event-old",
        created_at: 100,
        content: "cipher-old",
      },
    ],
    "wss://relay-c.example": [
      {
        id: "event-new",
        created_at: 200,
        content: "cipher-new",
      },
    ],
  };

  const listCalls = [];
  nostrClient.pool = {
    list(urls) {
      const url = Array.isArray(urls) ? urls[0] : urls;
      listCalls.push(url);
      if (url === "wss://relay-b.example") {
        return Promise.reject(new Error("relay failed"));
      }
      return Promise.resolve(eventsByRelay[url] ?? []);
    },
  };

  nostrClient.ensureExtensionPermissions = async () => ({ ok: true });

  const decryptCalls = [];
  globalThis.window.nostr = {
    nip04: {
      async decrypt(_pubkey, ciphertext) {
        decryptCalls.push(ciphertext);
        if (ciphertext === "cipher-new") {
          return JSON.stringify({ subPubkeys: ["pub-new"] });
        }
        return JSON.stringify({ subPubkeys: ["pub-old"] });
      },
    },
  };

  try {
    await manager.loadSubscriptions("user-pubkey-123");

    assert.deepEqual(
      Array.from(manager.subscribedPubkeys),
      ["pub-new"],
      "newest subscription set should be loaded from successful relays",
    );
    assert.equal(
      manager.subsEventId,
      "event-new",
      "newest event id should be recorded despite relay failure",
    );
    assert.equal(
      decryptCalls.length,
      1,
      "only the newest subscription event should be decrypted",
    );
    assert.equal(
      decryptCalls[0],
      "cipher-new",
      "newest event content should be decrypted",
    );
    assert.equal(
      listCalls.length,
      relayUrls.length,
      "each relay should be queried even if one rejects",
    );
    for (const url of relayUrls) {
      assert.ok(
        listCalls.includes(url),
        `loadSubscriptions should query relay ${url}`,
      );
    }
  } finally {
    nostrClient.relays = originalRelays;
    nostrClient.pool = originalPool;
    nostrClient.ensureExtensionPermissions = originalEnsurePermissions;
    if (typeof originalWindowNostr === "undefined") {
      delete globalThis.window.nostr;
    } else {
      globalThis.window.nostr = originalWindowNostr;
    }
    if (!hadWindow) {
      delete globalThis.window;
    }
  }
});

