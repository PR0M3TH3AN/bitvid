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

test.beforeEach(() => {
  hashtagPreferences.reset();
  restoreNostrClient();
  window.nostr = originalWindowNostr;
  clearActiveSigner();
});

test.after(() => {
  restoreNostrClient();
  window.nostr = originalWindowNostr;
  clearActiveSigner();
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

    await hashtagPreferences.load(pubkey);

    assert.deepEqual(attempts, ["nip44", "nip04"]);
    assert.deepEqual(hashtagPreferences.getInterests(), ["retry"]);
    assert.deepEqual(hashtagPreferences.getDisinterests(), []);
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

    await hashtagPreferences.load(pubkey);
    hashtagPreferences.addInterest("TagA");
    hashtagPreferences.addDisinterest("TagB");

    const signedEvent = await hashtagPreferences.publish();
    assert.equal(signedEvent.id, "signed-event");

    assert.equal(plaintextCalls.length, 1);
    assert.equal(plaintextCalls[0].target, pubkey);
    const payload = JSON.parse(plaintextCalls[0].plaintext);
    assert.equal(payload.version, 1);
    assert.deepEqual(payload.interests, ["taga"]);
    assert.deepEqual(payload.disinterests, ["tagb"]);

    assert.equal(publishedEvents.length, 1);
    const publishedEvent = publishedEvents[0].event;
    assert.deepEqual(publishedEvents[0].urls, ["wss://relay.publish"]);
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

    await hashtagPreferences.load(pubkey);
    hashtagPreferences.addInterest("WindowTag");

    const signedEvent = await hashtagPreferences.publish();

    assert.equal(signedEvent.id, "signed-window");
    // We expect 1 call since the first scheme (nip44_v2) succeeds
    assert.equal(encryptCalls.length, 1);
    assert.equal(encryptCalls[0].scheme, "nip44_call");
    assert.equal(encryptCalls[0].target, pubkey);
    assert.ok(encryptCalls[0].plaintext.includes("windowtag"));

    assert.equal(publishedEvents.length, 1);
    assert.deepEqual(publishedEvents[0].urls, ["wss://relay.window"]);
    assert.equal(publishedEvents[0].event.kind, 30015);
    const encryptedTag = publishedEvents[0].event.tags.find(
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

