import test from "node:test";
import assert from "node:assert/strict";

// Adjust imports for location in examples/reproducers/issue-hashtag-prefs/
const hashtagPreferencesModule = await import(
  "../../../js/services/hashtagPreferencesService.js"
);
const hashtagPreferences = hashtagPreferencesModule.default;
const [{ nostrClient }, { setActiveSigner, clearActiveSigner }] =
  await Promise.all([
    import("../../../js/nostrClientFacade.js"),
    import("../../../js/nostr/client.js"),
  ]);
const { relayManager } = await import("../../../js/relayManager.js");

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

  setActiveSigner({
    signEvent: async (e) => ({ ...e, id: "fake" }),
    nip44Encrypt: async () => "encrypted",
    nip04Encrypt: async () => "encrypted",
  });

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

  nostrClient.writeRelays = ["wss://mock.relay"];
  await hashtagPreferences.load("0".repeat(64));

  if (nostrClient.extensionPermissionCache) {
    nostrClient.extensionPermissionCache.clear();
  }
});

test.after(() => {
  restoreNostrClient();
  restoreRelayManager();
  window.nostr = originalWindowNostr;
  clearActiveSigner();
  setTimeout(() => process.exit(0), 100);
});

test(
  "REPRO: load defers permission-required decrypts until explicitly enabled",
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

    let fetchCalls = 0;

    const event = {
      id: "pref-permission",
      created_at: 400,
      pubkey,
      content: "cipher-permission",
      tags: [["encrypted", "nip04"]],
    };

    fetchCalls = 0;
    nostrClient.fetchListIncrementally = async () => {
      fetchCalls += 1;
      return fetchCalls <= 4 ? [event] : [];
    };
    nostrClient.relays = relayUrls;
    nostrClient.writeRelays = relayUrls;

    const decryptCalls = [];
    const permissionState = { enabled: false };

    window.nostr = {
      enable: async () => {},
      getPublicKey: async () => pubkey,
      nip04: {
        decrypt: async () => {
          if (!permissionState.enabled) throw new Error("permission denied");
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

      // Uncommented flaky part
      permissionState.enabled = true;
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
