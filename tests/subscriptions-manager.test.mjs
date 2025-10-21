import { test } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import { nostrClient } from "../js/nostr.js";
import { subscriptions } from "../js/subscriptions.js";
import { setApplication } from "../js/applicationContext.js";
import nostrService from "../js/services/nostrService.js";
import moderationService from "../js/services/moderationService.js";

test("loadSubscriptions aggregates relay results when one rejects", async () => {
  const SubscriptionsManager = subscriptions.constructor;
  const manager = new SubscriptionsManager();

  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
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
  nostrClient.writeRelays = relayUrls;

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
    nostrClient.writeRelays = originalWriteRelays;
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

test("loadSubscriptions falls back to nip44 when hinted", async () => {
  const SubscriptionsManager = subscriptions.constructor;
  const manager = new SubscriptionsManager();

  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalPool = nostrClient.pool;
  const originalEnsurePermissions = nostrClient.ensureExtensionPermissions;

  const hadWindow = typeof globalThis.window !== "undefined";
  if (!hadWindow) {
    globalThis.window = {};
  }
  const originalWindowNostr = globalThis.window.nostr;

  const relayUrls = ["wss://relay-nip44.example"];
  nostrClient.relays = relayUrls;
  nostrClient.writeRelays = relayUrls;

  const event = {
    id: "event-nip44",
    created_at: 400,
    content: "cipher-nip44",
    tags: [["encrypted", "nip44_v2"]],
  };

  nostrClient.pool = {
    list() {
      return Promise.resolve([event]);
    },
  };

  nostrClient.ensureExtensionPermissions = async () => ({ ok: true });

  const decryptCalls = { nip04: 0, nip44: 0 };
  globalThis.window.nostr = {
    nip04: {
      async decrypt() {
        decryptCalls.nip04 += 1;
        throw new Error("nip04 unavailable");
      },
    },
    nip44: {
      async decrypt(_pubkey, ciphertext) {
        decryptCalls.nip44 += 1;
        return JSON.stringify({ subPubkeys: ["pub-nip44"], hint: ciphertext });
      },
    },
  };

  try {
    await manager.loadSubscriptions("user-pubkey-123");

    assert.deepEqual(
      Array.from(manager.subscribedPubkeys),
      ["pub-nip44"],
      "nip44 decrypted subscriptions should populate the set",
    );
    assert.equal(manager.subsEventId, "event-nip44");
    assert.equal(manager.loaded, true);
    assert.equal(
      decryptCalls.nip44,
      1,
      "nip44 decrypt should be invoked once when hinted",
    );
    assert.equal(
      decryptCalls.nip04,
      0,
      "nip04 decrypt should be skipped when nip44 hint is present",
    );
  } finally {
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
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

test("loadSubscriptions handles nip44.v2 decryptors", async () => {
  const SubscriptionsManager = subscriptions.constructor;
  const manager = new SubscriptionsManager();

  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalPool = nostrClient.pool;
  const originalEnsurePermissions = nostrClient.ensureExtensionPermissions;

  const hadWindow = typeof globalThis.window !== "undefined";
  if (!hadWindow) {
    globalThis.window = {};
  }
  const originalWindowNostr = globalThis.window.nostr;

  const relayUrls = ["wss://relay-nip44-v2.example"];
  nostrClient.relays = relayUrls;
  nostrClient.writeRelays = relayUrls;

  const event = {
    id: "event-nip44-v2",
    created_at: 500,
    content: "cipher-nip44-v2",
    tags: [["encrypted", "nip44_v2"]],
  };

  nostrClient.pool = {
    list() {
      return Promise.resolve([event]);
    },
  };

  nostrClient.ensureExtensionPermissions = async () => ({ ok: true });

  const decryptCalls = { nip04: 0, nip44: 0, nip44_v2: 0 };
  globalThis.window.nostr = {
    nip44: {
      v2: {
        async decrypt(_pubkey, ciphertext) {
          decryptCalls.nip44_v2 += 1;
          return JSON.stringify({ subPubkeys: ["pub-nip44-v2"], hint: ciphertext });
        },
      },
    },
  };

  try {
    await manager.loadSubscriptions("user-pubkey-123");

    assert.deepEqual(
      Array.from(manager.subscribedPubkeys),
      ["pub-nip44-v2"],
      "nip44.v2 decrypted subscriptions should populate the set",
    );
    assert.equal(manager.subsEventId, "event-nip44-v2");
    assert.equal(manager.loaded, true);
    assert.equal(
      decryptCalls.nip44_v2,
      1,
      "nip44.v2 decrypt should be invoked once when provided",
    );
    assert.equal(
      decryptCalls.nip44,
      0,
      "no legacy nip44 decryptors should be invoked when only v2 exists",
    );
    assert.equal(
      decryptCalls.nip04,
      0,
      "nip04 decrypt should not be attempted when unavailable",
    );
  } finally {
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
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

test(
  "showSubscriptionVideos waits for nostrService warm-up and refreshes after updates",
  async () => {
    const SubscriptionsManager = subscriptions.constructor;

    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;

    const dom = new JSDOM(
      "<!doctype html><div id=\"subscriptionsVideoList\"></div>",
      { url: "https://example.test/" }
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.navigator = dom.window.navigator;

    const manager = new SubscriptionsManager();

    const originalAwaitInitialLoad = nostrService.awaitInitialLoad;
    const originalAwaitUserBlockRefresh = moderationService.awaitUserBlockRefresh;

    let resolveInitialLoad;
    const initialLoadPromise = new Promise((resolve) => {
      resolveInitialLoad = resolve;
    });
    nostrService.awaitInitialLoad = () => initialLoadPromise;

    moderationService.awaitUserBlockRefresh = async () => {};

    const renderCalls = [];
    manager.renderSameGridStyle = (result, containerId, options) => {
      renderCalls.push({ result, containerId, options });
    };

    manager.loadSubscriptions = async () => {
      manager.loaded = true;
      manager.subscribedPubkeys = new Set(["pub-1"]);
    };

    const feedResults = [
      { items: [] },
      { items: [{ video: { id: "video-1", pubkey: "pub-1" } }] },
    ];
    const runCalls = [];
    const feedEngine = {
      async run(name, options) {
        runCalls.push({ name, options });
        return feedResults.shift() ?? { items: [] };
      },
    };

    setApplication({
      feedEngine,
      videosMap: new Map(),
      registerSubscriptionsFeed: () => {},
      isAuthorBlocked: () => false,
      blacklistedEventIds: new Set(),
    });

    const showPromise = manager.showSubscriptionVideos(
      "viewer-pub",
      "subscriptionsVideoList"
    );

    await Promise.resolve();
    assert.equal(
      runCalls.length,
      0,
      "engine.run should not execute before nostrService initial load resolves",
    );

    resolveInitialLoad();
    await showPromise;

    assert.equal(runCalls.length, 1, "engine.run should execute after warm-up");
    assert.equal(renderCalls.length, 1, "initial render should occur once");
    assert.equal(
      renderCalls[0].options.emptyMessage.includes("No playable subscription videos"),
      true,
      "empty state should provide a descriptive message",
    );

    nostrService.emit("videos:updated", {
      reason: "subscription",
      videos: [{ id: "video-1", pubkey: "pub-1" }],
    });

    if (manager.pendingRefreshPromise) {
      await manager.pendingRefreshPromise;
    } else {
      await Promise.resolve();
    }

    assert.equal(
      runCalls.length,
      2,
      "engine.run should execute again after nostrService update",
    );
    assert.equal(renderCalls.length, 2, "render should run again after update");
    assert.equal(
      renderCalls[1].result.items[0].video.id,
      "video-1",
      "updated render should receive fresh videos",
    );
    assert.equal(
      renderCalls[1].options.emptyMessage.includes("No playable subscription videos"),
      true,
      "subsequent renders should retain the empty state message for metadata",
    );

    if (typeof manager.unsubscribeFromNostrUpdates === "function") {
      manager.unsubscribeFromNostrUpdates();
    }

    nostrService.awaitInitialLoad = originalAwaitInitialLoad;
    moderationService.awaitUserBlockRefresh = originalAwaitUserBlockRefresh;
    setApplication(null);

    dom.window.close();

    if (typeof originalWindow === "undefined") {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }

    if (typeof originalDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }

    if (typeof originalNavigator === "undefined") {
      delete globalThis.navigator;
    } else {
      globalThis.navigator = originalNavigator;
    }
  },
);

test("renderSameGridStyle shows empty state message", async () => {
  const SubscriptionsManager = subscriptions.constructor;

  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  const dom = new JSDOM(
    "<!doctype html><div id=\"subscriptionsVideoList\"></div>",
    { url: "https://example.test/" },
  );

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const manager = new SubscriptionsManager();

  manager.renderSameGridStyle(
    { items: [] },
    "subscriptionsVideoList",
    { emptyMessage: "Custom empty state copy." },
  );

  const container = dom.window.document.getElementById("subscriptionsVideoList");
  assert.match(
    container.textContent,
    /Custom empty state copy\./,
    "empty state should render the provided copy",
  );
  assert.ok(
    !container.textContent.includes("Fetching subscriptions"),
    "loading spinner should be removed when rendering the empty state",
  );

  dom.window.close();

  if (typeof originalWindow === "undefined") {
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }

  if (typeof originalDocument === "undefined") {
    delete globalThis.document;
  } else {
    globalThis.document = originalDocument;
  }
});

