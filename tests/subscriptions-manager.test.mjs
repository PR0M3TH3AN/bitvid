import { test } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import { nostrClient } from "../js/nostrClientFacade.js";
import { getActiveSigner, setActiveSigner } from "../js/nostr/client.js";
import { subscriptions } from "../js/subscriptions.js";
import { setApplication } from "../js/applicationContext.js";
import nostrService from "../js/services/nostrService.js";
import moderationService from "../js/services/moderationService.js";
import { getNostrEventSchema, NOTE_TYPES } from "../js/nostrEventSchemas.js";

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
    list(urls, _filters) {
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
          return JSON.stringify([["p", "pub-new"]]);
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
    localStorage.clear();
  }
});

test("loadSubscriptions queries the correct subscription list kind", async () => {
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

  const relayUrls = ["wss://relay-legacy.example"];
  nostrClient.relays = relayUrls;
  nostrClient.writeRelays = relayUrls;

  const capturedFilters = [];
  nostrClient.pool = {
    list(urls, filters) {
      const filterArray = Array.isArray(filters) ? filters : [];
      if (filterArray.length) {
        capturedFilters.push(filterArray[0]);
      }
      return Promise.resolve([]);
    },
  };

  nostrClient.ensureExtensionPermissions = async () => ({ ok: true });

  try {
    await manager.loadSubscriptions("user-pubkey-legacy");

    assert.ok(
      capturedFilters.length > 0,
      "loadSubscriptions should pass subscription filters to pool.list",
    );

    const schemaKind =
      getNostrEventSchema(NOTE_TYPES.SUBSCRIPTION_LIST)?.kind ?? 30000;

    for (const filter of capturedFilters) {
      const kinds = Array.isArray(filter?.kinds) ? filter.kinds : [];
      assert.ok(
        kinds.includes(schemaKind),
        "filter should include the active follow-set kind",
      );
      assert.equal(
        kinds.length,
        1,
        "filter should only query the active follow-set kind",
      );
      assert.ok(
        !kinds.includes(30002),
        "filter should not include the legacy kind",
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
    localStorage.clear();
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
        return JSON.stringify([["p", "pub-nip44", ciphertext]]);
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
    localStorage.clear();
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
        return JSON.stringify([["p", "pub-nip44-v2"], ["t", ciphertext]]);
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
    localStorage.clear();
  }
});

test("loadSubscriptions prefers nip44 decryptors when both are available", async () => {
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

  const relayUrls = ["wss://relay-nip44-pref.example"];
  nostrClient.relays = relayUrls;
  nostrClient.writeRelays = relayUrls;

  const event = {
    id: "event-nip44-pref",
    created_at: 700,
    content: "cipher-nip44-pref",
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
        return JSON.stringify([["p", "pub-nip04"]]);
      },
    },
    nip44: {
      v2: {
        async decrypt(_pubkey, ciphertext) {
          decryptCalls.nip44 += 1;
          return JSON.stringify([["p", "pub-nip44-pref", ciphertext]]);
        },
      },
    },
  };

  try {
    await manager.loadSubscriptions("user-pubkey-123");

    assert.deepEqual(
      Array.from(manager.subscribedPubkeys),
      ["pub-nip44-pref"],
      "nip44 decrypted subscriptions should populate the set",
    );
    assert.equal(decryptCalls.nip44, 1, "nip44 decryptor should be used");
    assert.equal(decryptCalls.nip04, 0, "nip04 decryptor should be skipped");
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
    localStorage.clear();
  }
});

test(
  "loadSubscriptions uses active signer decryptors without requesting extension permissions",
  async () => {
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
    const originalSigner = getActiveSigner();

    const hadWindow = typeof globalThis.window !== "undefined";
    if (!hadWindow) {
      globalThis.window = {};
    }
    const originalWindowNostr = globalThis.window.nostr;
    delete globalThis.window.nostr;

    const relayUrls = ["wss://relay-direct.example"];
    nostrClient.relays = relayUrls;
    nostrClient.writeRelays = relayUrls;

    const event = {
      id: "event-direct",
      created_at: 600,
      content: "cipher-direct",
    };

    nostrClient.pool = {
      list() {
        return Promise.resolve([event]);
      },
    };

    let permissionCalls = 0;
    nostrClient.ensureExtensionPermissions = async () => {
      permissionCalls += 1;
      return { ok: true };
    };

    const decryptCalls = [];
    setActiveSigner({
      pubkey: "user-pubkey-123",
      async nip04Decrypt(pubkey, ciphertext) {
        decryptCalls.push({ pubkey, ciphertext });
        return JSON.stringify([["p", "pub-direct"]]);
      },
    });

    try {
      await manager.loadSubscriptions("user-pubkey-123");

      assert.equal(permissionCalls, 0, "should not request extension permissions");
      assert.equal(decryptCalls.length, 1, "signer decrypt should be invoked once");
      assert.deepEqual(
        decryptCalls[0],
        { pubkey: "user-pubkey-123", ciphertext: "cipher-direct" },
        "signer decrypt should receive the expected arguments",
      );
      assert.deepEqual(
        Array.from(manager.subscribedPubkeys),
        ["pub-direct"],
        "direct signer decrypt should populate subscriptions",
      );
    } finally {
      nostrClient.relays = originalRelays;
      nostrClient.writeRelays = originalWriteRelays;
      nostrClient.pool = originalPool;
      nostrClient.ensureExtensionPermissions = originalEnsurePermissions;
      setActiveSigner(originalSigner);
      if (typeof originalWindowNostr === "undefined") {
        delete globalThis.window.nostr;
      } else {
        globalThis.window.nostr = originalWindowNostr;
      }
      if (!hadWindow) {
        delete globalThis.window;
      }
      localStorage.clear();
    }
  },
);

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

    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      writable: true,
      configurable: true,
    });

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
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }
  },
);

test("ensureLoaded memoizes concurrent loads", async () => {
  const SubscriptionsManager = subscriptions.constructor;
  const manager = new SubscriptionsManager();

  let loadCount = 0;
  manager.loadSubscriptions = async () => {
    loadCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 0));
    manager.loaded = true;
  };

  const actorHex = "f".repeat(64);

  await Promise.all([
    manager.ensureLoaded(actorHex),
    manager.ensureLoaded(actorHex),
  ]);

  assert.equal(loadCount, 1, "loadSubscriptions should only run once");
  assert.equal(manager.loaded, true, "manager should be marked as loaded");
});

test(
  "publishSubscriptionList succeeds with direct signer without requesting extension permissions",
  async () => {
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
    const originalSigner = getActiveSigner();

    const relayUrls = ["wss://relay-direct.example"];
    nostrClient.relays = relayUrls;
    nostrClient.writeRelays = relayUrls;

    let permissionCalls = 0;
    nostrClient.ensureExtensionPermissions = async () => {
      permissionCalls += 1;
      return { ok: true };
    };

    const publishCalls = [];
    nostrClient.pool = {
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

    const encryptCalls = [];
    const signCalls = [];
    setActiveSigner({
      type: "nsec",
      pubkey: "user-pubkey-123",
      async nip04Encrypt(pubkey, plaintext) {
        encryptCalls.push({ pubkey, plaintext });
        return "cipher-direct";
      },
      async signEvent(event) {
        signCalls.push(event);
        return { ...event, id: "signed-direct-event" };
      },
    });

    manager.subscribedPubkeys = new Set(["pub-direct"]);

    try {
      await manager.publishSubscriptionList("user-pubkey-123");

      assert.equal(permissionCalls, 0, "should not request extension permissions");
      assert.equal(encryptCalls.length, 1, "nip04Encrypt should be called once");
      assert.equal(signCalls.length, 1, "signEvent should be called once");
      assert.deepEqual(
        encryptCalls[0],
        {
          pubkey: "user-pubkey-123",
          plaintext: JSON.stringify([["p", "pub-direct"]]),
        },
        "nip04Encrypt should receive the serialized subscription list",
      );
      assert.equal(
        signCalls[0].content,
        "cipher-direct",
        "signEvent should receive the encrypted content",
      );
      assert.equal(publishCalls.length, relayUrls.length, "should publish to each relay");
      assert.equal(manager.subsEventId, "signed-direct-event");
    } finally {
      nostrClient.relays = originalRelays;
      nostrClient.writeRelays = originalWriteRelays;
      nostrClient.pool = originalPool;
      nostrClient.ensureExtensionPermissions = originalEnsurePermissions;
      setActiveSigner(originalSigner);
    }
  },
);

test("publishSubscriptionList prefers nip44 encryption when available", async () => {
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
  const originalSigner = getActiveSigner();

  const relayUrls = ["wss://relay-prefer-nip44.example"];
  nostrClient.relays = relayUrls;
  nostrClient.writeRelays = relayUrls;

  let permissionCalls = 0;
  nostrClient.ensureExtensionPermissions = async () => {
    permissionCalls += 1;
    return { ok: true };
  };

  const publishCalls = [];
  nostrClient.pool = {
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

  const encryptCalls = { nip44: 0, nip04: 0 };
  const signedEvents = [];
  setActiveSigner({
    type: "nsec",
    pubkey: "user-pubkey-123",
    async nip44Encrypt(pubkey, plaintext) {
      encryptCalls.nip44 += 1;
      assert.equal(pubkey, "user-pubkey-123");
      assert.equal(
        plaintext,
        JSON.stringify([["p", "pub-one"], ["p", "pub-two"]]),
      );
      return "cipher-nip44";
    },
    async nip04Encrypt() {
      encryptCalls.nip04 += 1;
      throw new Error("nip04 should not be used when nip44 is available");
    },
    async signEvent(event) {
      signedEvents.push(event);
      return { ...event, id: "signed-nip44-event" };
    },
  });

  manager.subscribedPubkeys = new Set(["pub-one", "pub-two"]);

  try {
    await manager.publishSubscriptionList("user-pubkey-123");

    assert.equal(permissionCalls, 0, "should not request extension permissions");
    assert.equal(encryptCalls.nip44, 1, "nip44Encrypt should be used once");
    assert.equal(encryptCalls.nip04, 0, "nip04Encrypt should not be invoked");
    assert.equal(signedEvents.length, 1, "signEvent should be called once");
    const signedEvent = signedEvents[0];
    const encryptedTags = signedEvent.tags.filter((tag) => tag[0] === "encrypted");
    assert.deepEqual(
      encryptedTags,
      [["encrypted", "nip44_v2"]],
      "signed event should advertise nip44_v2 encryption",
    );
    assert.equal(publishCalls.length, relayUrls.length, "event should publish to relays");
    assert.equal(manager.subsEventId, "signed-nip44-event");
  } finally {
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.pool = originalPool;
    nostrClient.ensureExtensionPermissions = originalEnsurePermissions;
    setActiveSigner(originalSigner);
  }
});

test("publishSubscriptionList falls back to nip04 when nip44 fails", async () => {
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
  const originalSigner = getActiveSigner();

  const relayUrls = ["wss://relay-fallback-nip04.example"];
  nostrClient.relays = relayUrls;
  nostrClient.writeRelays = relayUrls;

  nostrClient.ensureExtensionPermissions = async () => ({ ok: true });

  const publishCalls = [];
  nostrClient.pool = {
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

  const encryptCalls = { nip44: 0, nip04: 0 };
  const signedEvents = [];
  setActiveSigner({
    type: "nsec",
    pubkey: "user-pubkey-123",
    async nip44Encrypt() {
      encryptCalls.nip44 += 1;
      throw new Error("simulated nip44 failure");
    },
    async nip04Encrypt(pubkey, plaintext) {
      encryptCalls.nip04 += 1;
      assert.equal(pubkey, "user-pubkey-123");
      assert.equal(
      plaintext,
      JSON.stringify([["p", "pub-three"]]),
      );
      return "cipher-nip04";
    },
    async signEvent(event) {
      signedEvents.push(event);
      return { ...event, id: "signed-nip04-event" };
    },
  });

  manager.subscribedPubkeys = new Set(["pub-three"]);

  try {
    await manager.publishSubscriptionList("user-pubkey-123");

    assert.ok(
      encryptCalls.nip44 >= 1,
      "nip44Encrypt should be attempted before falling back",
    );
    assert.equal(encryptCalls.nip04, 1, "nip04Encrypt should handle fallback");
    const signedEvent = signedEvents[0];
    const encryptedTags = signedEvent.tags.filter((tag) => tag[0] === "encrypted");
    assert.deepEqual(
      encryptedTags,
      [["encrypted", "nip04"]],
      "fallback nip04 encryption should advertise nip04",
    );
    assert.equal(publishCalls.length, relayUrls.length, "event should publish to relays");
    assert.equal(manager.subsEventId, "signed-nip04-event");
  } finally {
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.pool = originalPool;
    nostrClient.ensureExtensionPermissions = originalEnsurePermissions;
    setActiveSigner(originalSigner);
  }
});

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

test(
  "renderSameGridStyle forwards moderation badge actions to the application",
  async () => {
    const SubscriptionsManager = subscriptions.constructor;

    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;

    const dom = new JSDOM(
      "<!doctype html><div id=\"subscriptionsVideoList\"></div>",
      { url: "https://example.test/" },
    );

    globalThis.window = dom.window;
    globalThis.document = dom.window.document;

    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      writable: true,
      configurable: true,
    });

    const manager = new SubscriptionsManager();

    const overrideCalls = [];
    const blockCalls = [];

    const app = {
      videosMap: new Map(),
      handleModerationOverride(detail) {
        overrideCalls.push(detail);
        return true;
      },
      handleModerationBlock(detail) {
        blockCalls.push(detail);
        return true;
      },
      ensureGlobalMoreMenuHandlers() {},
      closeAllMoreMenus() {},
      handleMoreMenuAction() {},
    };

    setApplication(app);

    const video = {
      id: "video-moderated-1",
      pubkey: "author-1",
      title: "Moderated clip",
      created_at: 1,
      moderation: {
        original: { hidden: true },
        trustedMuted: true,
        trustedMuteCount: 2,
        summary: { types: { nudity: { trusted: 1 } } },
      },
    };

    manager.renderSameGridStyle(
      { items: [{ video }] },
      "subscriptionsVideoList",
    );

    const container = dom.window.document.getElementById(
      "subscriptionsVideoList",
    );
    const overrideButton = container.querySelector(
      '[data-moderation-action="override"]',
    );
    assert.ok(overrideButton, "override button should render for moderated video");

    overrideButton.click();
    await Promise.resolve();

    assert.equal(
      overrideCalls.length,
      1,
      "app.handleModerationOverride should receive one call",
    );
    const overrideDetail = overrideCalls[0];
    assert.equal(overrideDetail.video, video);
    assert.equal(overrideDetail.card?.video, video);
    assert.equal(
      overrideDetail.context,
      "subscriptions",
      "override payload should include the subscriptions context",
    );
    assert.equal(overrideDetail.trigger, overrideButton);

    const blockButton = container.querySelector('[data-moderation-action="block"]');
    assert.ok(blockButton, "block button should render for moderated video");

    blockButton.click();
    await Promise.resolve();

    assert.equal(
      blockCalls.length,
      1,
      "app.handleModerationBlock should receive one call",
    );
    const blockDetail = blockCalls[0];
    assert.equal(blockDetail.video, video);
    assert.equal(blockDetail.card?.video, video);
    assert.equal(
      blockDetail.context,
      "subscriptions",
      "block payload should include the subscriptions context",
    );
    assert.equal(blockDetail.trigger, blockButton);

    if (manager.subscriptionListView?.destroy) {
      manager.subscriptionListView.destroy();
      manager.subscriptionListView = null;
    }

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
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }

    setApplication(null);
  },
);
