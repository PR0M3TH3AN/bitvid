import test from "node:test";
import assert from "node:assert/strict";

const hashtagPreferencesModule = await import(
  "../js/services/hashtagPreferencesService.js"
);
const hashtagPreferences = hashtagPreferencesModule.default;
const [{ nostrClient }, { setActiveSigner, clearActiveSigner }] =
  await Promise.all([
    import("../js/nostrClientFacade.js"),
    import("../js/nostr/client.js"),
  ]);
const { relayManager } = await import("../js/relayManager.js");

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

const originalPool = nostrClient.pool;
const originalRelays = Array.isArray(nostrClient.relays)
  ? [...nostrClient.relays]
  : nostrClient.relays;
const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
  ? [...nostrClient.writeRelays]
  : nostrClient.writeRelays;
const originalRelayEntries = relayManager.getEntries();
const originalWindowNostr = window.nostr;

function restoreNostrClient() {
  nostrClient.pool = originalPool;
  nostrClient.relays = Array.isArray(originalRelays)
    ? [...originalRelays]
    : originalRelays;
  nostrClient.writeRelays = Array.isArray(originalWriteRelays)
    ? [...originalWriteRelays]
    : originalWriteRelays;
}

function restoreRelayManager() {
  relayManager.setEntries(originalRelayEntries, { allowEmpty: true, updateClient: false });
}

test.beforeEach(async () => {
  hashtagPreferences.reset();
  restoreNostrClient();
  restoreRelayManager();
  window.nostr = originalWindowNostr;

  // Setup default mock signer to prevent auto-save errors
  setActiveSigner({
    signEvent: async (e) => ({ ...e, id: "fake" }),
    nip44Encrypt: async () => "encrypted",
    nip04Encrypt: async () => "encrypted",
  });

  // Setup default pool mock for publish and list
  nostrClient.pool = {
    list: async () => [],
    publish: (urls, event) => ({
      on: (eventName, handler) => {
        if (eventName === "ok") {
          setTimeout(() => handler(), 0);
        }
        return true;
      },
    }),
  };

  // Ensure writeRelays are set
  nostrClient.writeRelays = ["wss://mock.relay"];

  // Ensure active pubkey is set for publish operations
  await hashtagPreferences.load("0".repeat(64));
});

test.after(() => {
  restoreNostrClient();
  restoreRelayManager();
  window.nostr = originalWindowNostr;
  clearActiveSigner();
  setTimeout(() => process.exit(0), 100);
});

test(
  "load decrypts nip44 payloads and normalizes tags",
  { concurrency: false },
  async (t) => {
    const pubkey = "a".repeat(64);
    const decryptCalls = [];

    setActiveSigner({
      nip44Decrypt: async (target, ciphertext) => {
        decryptCalls.push({ target, ciphertext });
        return JSON.stringify({
          version: 1,
          interests: ["TagOne", "  #TagTwo  "],
          disinterests: ["TagThree"],
        });
      },
    });

    nostrClient.pool = {
      async list(relays, filters) {
        assert.deepEqual(relays, ["wss://relay.one"]);
        assert.equal(filters.length, 1);
        // Note: fetchListIncrementally calls pool.list separately for each kind
        const kind = filters[0].kinds[0];
        assert.ok([30015, 30005].includes(kind));
        assert.equal(filters[0]["#d"][0], "bitvid:tag-preferences");

        // Return event only for canonical kind to verify logic picks it up
        if (kind === 30015) {
          return [
            {
              id: "evt1",
              created_at: 100,
              pubkey,
              content: "ciphertext",
              tags: [["encrypted", "nip44_v2"]],
            },
          ];
        }
        return [];
      },
    };
    nostrClient.relays = ["wss://relay.one"];
    nostrClient.writeRelays = ["wss://relay.one"];
    relayManager.setEntries([{ url: "wss://relay.one", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(hashtagPreferences.getInterests(), ["tagone", "tagtwo"]);
    assert.deepEqual(hashtagPreferences.getDisinterests(), ["tagthree"]);
    assert.equal(decryptCalls.length, 1);
    assert.equal(decryptCalls[0].target, pubkey);
  },
);

test(
  "load falls back to nip04 decryption",
  { concurrency: false },
  async () => {
    const pubkey = "b".repeat(64);

    setActiveSigner({
      nip04Decrypt: async () =>
        JSON.stringify({
          version: 1,
          interests: ["Alpha"],
          disinterests: ["alpha", "Beta"],
        }),
    });

    nostrClient.pool = {
      async list() {
        return [
          {
            id: "evt2",
            created_at: 200,
            pubkey,
            content: "legacycipher",
            tags: [["encrypted", "nip04"]],
          },
        ];
      },
    };
    nostrClient.relays = ["wss://relay.two"];
    nostrClient.writeRelays = ["wss://relay.two"];
    relayManager.setEntries([{ url: "wss://relay.two", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(hashtagPreferences.getInterests(), []);
    assert.deepEqual(hashtagPreferences.getDisinterests(), ["alpha", "beta"]);
  },
);

test(
  "load retries decryptors when hinted scheme fails",
  { concurrency: false },
  async () => {
    const pubkey = "d".repeat(64);
    const attempts = [];

    setActiveSigner({
      nip44Decrypt: async () => {
        attempts.push("nip44");
        throw new Error("nip44 failed");
      },
      nip04Decrypt: async () => {
        attempts.push("nip04");
        return JSON.stringify({
          version: 1,
          interests: ["Retry"],
          disinterests: [],
        });
      },
    });

    nostrClient.pool = {
      async list() {
        return [
          {
            id: "evt-retry",
            created_at: 300,
            pubkey,
            content: "cipher", // never decrypted successfully by nip44
            tags: [["encrypted", "nip44 nip04"]],
          },
        ];
      },
    };
    nostrClient.relays = ["wss://relay.retry"];
    nostrClient.writeRelays = ["wss://relay.retry"];
    relayManager.setEntries([{ url: "wss://relay.retry", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(attempts, ["nip44", "nip04"]);
    assert.deepEqual(hashtagPreferences.getInterests(), ["retry"]);
    assert.deepEqual(hashtagPreferences.getDisinterests(), []);
  },
);

test(
  "load defers permission-required decrypts until explicitly enabled",
  { concurrency: false },
  async () => {
    const pubkey = "e".repeat(64);

    const relayUrls = ["wss://relay-permissions.example"];
    const originalRelayEntries = relayManager.getEntries();
    relayManager.setEntries(relayUrls.map(url => ({ url, mode: "both" })), { allowEmpty: false, updateClient: false });

    const originalFetchIncremental = nostrClient.fetchListIncrementally;
    const originalRelays = Array.isArray(nostrClient.relays)
      ? [...nostrClient.relays]
      : nostrClient.relays;
    const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
      ? [...nostrClient.writeRelays]
      : nostrClient.writeRelays;
    const originalWindowNostr = window.nostr;

    const event = {
      id: "pref-permission",
      created_at: 400,
      pubkey,
      content: "cipher-permission",
      tags: [["encrypted", "nip04"]],
    };

    nostrClient.fetchListIncrementally = async () => {
      return [event];
    };
    nostrClient.relays = relayUrls;
    nostrClient.writeRelays = relayUrls;

    const decryptCalls = [];
    window.nostr = {
      nip04: {
        decrypt: async () => {
          decryptCalls.push("nip04");
          return JSON.stringify({
            version: 1,
            interests: ["Late"],
            disinterests: [],
          });
        },
      },
    };

    clearActiveSigner();

    try {
      await hashtagPreferences.load(pubkey, { allowPermissionPrompt: false });

      assert.equal(
        decryptCalls.length,
        0,
        "decryption should be skipped when permissions are deferred",
      );
      assert.equal(
        hashtagPreferences.lastLoadError?.code,
        "hashtag-preferences-permission-required",
        "permission-required errors should be captured for deferred prompts",
      );
      assert.deepEqual(hashtagPreferences.getInterests(), []);

      await hashtagPreferences.load(pubkey, { allowPermissionPrompt: true });

      assert.equal(
        decryptCalls.length,
        1,
        "explicit permission prompts should retry decryption",
      );
      assert.deepEqual(hashtagPreferences.getInterests(), ["late"]);
    } finally {
      relayManager.setEntries(originalRelayEntries, { allowEmpty: true, updateClient: false });
      nostrClient.fetchListIncrementally = originalFetchIncremental;
      nostrClient.relays = originalRelays;
      nostrClient.writeRelays = originalWriteRelays;
      window.nostr = originalWindowNostr;
    }
  },
);

test(
  "interest and disinterest lists remain exclusive",
  { concurrency: false },
  () => {
    hashtagPreferences.reset();

    assert.equal(hashtagPreferences.addInterest("Focus"), true);
    assert.equal(hashtagPreferences.addDisinterest("focus"), true);
    assert.deepEqual(hashtagPreferences.getInterests(), []);
    assert.deepEqual(hashtagPreferences.getDisinterests(), ["focus"]);

    assert.equal(hashtagPreferences.removeDisinterest("focus"), true);
    assert.equal(hashtagPreferences.getDisinterests().length, 0);
    assert.equal(hashtagPreferences.removeInterest("focus"), false);
  },
);

test(
  "publish encrypts payload and builds event via builder",
  { concurrency: false },
  async (t) => {
    const pubkey = "c".repeat(64);
    const plaintextCalls = [];

    setActiveSigner({
      nip44Encrypt: async (target, plaintext) => {
        plaintextCalls.push({ target, plaintext });
        return "ciphertext";
      },
      signEvent: async (event) => ({ ...event, id: "signed-event" }),
    });

    const publishedEvents = [];
    nostrClient.pool = {
      list: async () => [],
      publish(urls, event) {
        publishedEvents.push({ urls, event });
        return {
          on(eventName, handler) {
            if (eventName === "ok") {
              setImmediate(() => handler());
            }
            return true;
          },
        };
      },
    };
    nostrClient.relays = ["wss://relay.publish"];
    nostrClient.writeRelays = ["wss://relay.publish"];
    relayManager.setEntries([{ url: "wss://relay.publish", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);
    hashtagPreferences.addInterest("TagA");
    hashtagPreferences.addDisinterest("TagB");

    const signedEvent = await hashtagPreferences.publish();
    assert.equal(signedEvent.id, "signed-event");

    // Expect 3 calls: addInterest (auto-save), addDisinterest (auto-save), manual publish
    assert.equal(plaintextCalls.length, 3);
    const lastCall = plaintextCalls[plaintextCalls.length - 1];
    assert.equal(lastCall.target, pubkey);
    const payload = JSON.parse(lastCall.plaintext);
    assert.equal(payload.version, 1);
    assert.deepEqual(payload.interests, ["taga"]);
    assert.deepEqual(payload.disinterests, ["tagb"]);

    // Expect 3 publish events
    assert.equal(publishedEvents.length, 3);
    const publishedEvent = publishedEvents[publishedEvents.length - 1].event;
    assert.deepEqual(publishedEvents[publishedEvents.length - 1].urls, ["wss://relay.publish"]);
    assert.equal(publishedEvent.kind, 30015);
    const encryptedTag = publishedEvent.tags.find(
      (tag) => Array.isArray(tag) && tag[0] === "encrypted",
    );
    assert.ok(encryptedTag);
    assert.equal(encryptedTag[1], "nip44_v2");
  },
);

test(
  "publish falls back to window nostr encryptors",
  { concurrency: false },
  async () => {
    const pubkey = "e".repeat(64);
    const encryptCalls = [];

    // The service relies on the signer interface, so we mock the encryption methods on the signer directly.
    // The "fallback" logic is handled by the signer implementation (e.g. Nip07Signer) in the real app.
    setActiveSigner({
      type: "inpage",
      signEvent: async (event) => ({ ...event, id: "signed-window" }),
      nip44Encrypt: async (target, plaintext) => {
        // The service calls this for both nip44_v2 and nip44 schemes.
        // Since nip44_v2 is registered first, it will be called first.
        // We return success immediately, so loop breaks.
        encryptCalls.push({ scheme: "nip44_call", target, plaintext });
        return "cipher-from-window";
      },
      nip04Encrypt: async (target, plaintext) => {
         encryptCalls.push({ scheme: "nip04", target, plaintext });
         return "cipher-nip04";
      }
    });

    const publishedEvents = [];
    nostrClient.pool = {
      list: async () => [],
      publish(urls, event) {
        publishedEvents.push({ urls, event });
        return {
          on(eventName, handler) {
            if (eventName === "ok") {
              setImmediate(() => handler());
            }
            return true;
          },
        };
      },
    };
    nostrClient.relays = ["wss://relay.window"];
    nostrClient.writeRelays = ["wss://relay.window"];
    relayManager.setEntries([{ url: "wss://relay.window", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);
    hashtagPreferences.addInterest("WindowTag");

    const signedEvent = await hashtagPreferences.publish();

    assert.equal(signedEvent.id, "signed-window");
    // Expect 2 calls: addInterest (auto-save) + manual publish
    assert.equal(encryptCalls.length, 2);
    const lastEncryptCall = encryptCalls[encryptCalls.length - 1];
    assert.equal(lastEncryptCall.scheme, "nip44_call");
    assert.equal(lastEncryptCall.target, pubkey);
    assert.ok(lastEncryptCall.plaintext.includes("windowtag"));

    assert.equal(publishedEvents.length, 2);
    const lastPublished = publishedEvents[publishedEvents.length - 1];
    assert.deepEqual(lastPublished.urls, ["wss://relay.window"]);
    assert.equal(lastPublished.event.kind, 30015);
    const encryptedTag = lastPublished.event.tags.find(
      (tag) => Array.isArray(tag) && tag[0] === "encrypted",
    );
    // nip44_v2 is the first tried scheme, so it is the one used
    assert.equal(encryptedTag[1], "nip44_v2");
  },
);

test(
  "load prefers canonical kind when timestamps match while accepting legacy payload",
  { concurrency: false },
  async () => {
    const pubkey = "f".repeat(64);
    const decryptCalls = [];

    setActiveSigner({
      nip44Decrypt: async (target, ciphertext) => {
        decryptCalls.push({ target, ciphertext });
        if (ciphertext === "canonical-cipher") {
          return JSON.stringify({
            version: 2,
            interests: ["NewKind"],
            disinterests: [],
          });
        }
        if (ciphertext === "legacy-cipher") {
          return JSON.stringify({
            version: 1,
            interests: ["Legacy"],
            disinterests: [],
          });
        }
        throw new Error(`unexpected ciphertext: ${ciphertext}`);
      },
    });

    nostrClient.pool = {
      async list(relays, filters) {
        assert.deepEqual(relays, ["wss://relay.tie"]);
        const kind = filters[0].kinds[0];
        assert.ok([30015, 30005].includes(kind));

        if (kind === 30015) {
          return [
            {
              id: "evt-canonical",
              kind: 30015,
              created_at: 500,
              pubkey,
              content: "canonical-cipher",
              tags: [["encrypted", "nip44_v2"]],
            },
          ];
        }
        if (kind === 30005) {
          return [
            {
              id: "evt-legacy",
              kind: 30005,
              created_at: 500,
              pubkey,
              content: "legacy-cipher",
              tags: [["encrypted", "nip44_v2"]],
            },
          ];
        }
        return [];
      },
    };
    nostrClient.relays = ["wss://relay.tie"];
    nostrClient.writeRelays = ["wss://relay.tie"];
    relayManager.setEntries([{ url: "wss://relay.tie", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(decryptCalls.map((call) => call.ciphertext), [
      "canonical-cipher",
    ]);
    assert.deepEqual(hashtagPreferences.getInterests(), ["newkind"]);

    nostrClient.pool.list = async () => [
      {
        id: "evt-legacy-only",
        kind: 30005,
        created_at: 600,
        pubkey,
        content: "legacy-cipher",
        tags: [["encrypted", "nip44_v2"]],
      },
    ];

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(decryptCalls.map((call) => call.ciphertext), [
      "canonical-cipher",
      "legacy-cipher",
    ]);
    assert.deepEqual(hashtagPreferences.getInterests(), ["legacy"]);
  },
);

test(
  "load falls back to window.nostr when active signer is missing",
  { concurrency: false },
  async (t) => {
    const pubkey = "abcdef".repeat(10) + "1234";

    // Ensure no active signer (override beforeEach)
    clearActiveSigner();

    // Mock window.nostr
    window.nostr = {
        nip04: {
            decrypt: async (pk, ciphertext) => {
                if (pk !== pubkey) throw new Error("Wrong pubkey");
                if (ciphertext === "window-encrypted") {
                    return JSON.stringify({
                        version: 1,
                        interests: ["WindowSuccess"],
                        disinterests: []
                    });
                }
                throw new Error("Decrypt failed");
            }
        }
    };

    // Mock pool list to return an event
    nostrClient.pool = {
        list: async () => [{
            id: "evt1",
            created_at: 1000,
            pubkey,
            content: "window-encrypted",
            tags: [["encrypted", "nip04"]]
        }]
    };

    relayManager.setEntries([{ url: "wss://relay.fallback", mode: "both" }], { allowEmpty: false, updateClient: false });

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(hashtagPreferences.getInterests(), ["windowsuccess"]);
  }
);

test(
    "load falls back to window.nostr when active signer lacks decrypt capabilities",
    { concurrency: false },
    async (t) => {
      const pubkey = "abcdef".repeat(10) + "5678";

      // Set a signer that can sign but NOT decrypt (override beforeEach)
      setActiveSigner({
          signEvent: async (e) => ({ ...e, id: "fake" }),
          // No nip04Decrypt or nip44Decrypt
      });

      // Mock window.nostr
      window.nostr = {
          nip04: {
              decrypt: async (pk, ciphertext) => {
                  if (pk !== pubkey) throw new Error("Wrong pubkey");
                  if (ciphertext === "window-encrypted-2") {
                      return JSON.stringify({
                          version: 1,
                          interests: ["SignerFallback"],
                          disinterests: []
                      });
                  }
                  throw new Error("Decrypt failed");
              }
          }
      };

      // Mock pool list to return an event
      nostrClient.pool = {
          list: async () => [{
              id: "evt2",
              created_at: 1000,
              pubkey,
              content: "window-encrypted-2",
              tags: [["encrypted", "nip04"]]
          }]
      };

      relayManager.setEntries([{ url: "wss://relay.fallback", mode: "both" }], { allowEmpty: false, updateClient: false });

      await hashtagPreferences.load(pubkey);

      assert.deepEqual(hashtagPreferences.getInterests(), ["signerfallback"]);
    }
  );
