import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  getPublicKey,
  nip04,
} from "nostr-tools";

const {
  nostrClient,
<<<<<<< HEAD
} = await import("../../js/nostrClientFacade.js");
const { clearActiveSigner } = await import("../../js/nostr/client.js");
=======
  clearActiveSigner,
} = await import("../../js/nostr.js");
>>>>>>> origin/main
const { accessControl } = await import("../../js/accessControl.js");
const { WATCH_HISTORY_KIND } = await import("../../js/config.js");
const { normalizeActorKey } = await import("../../js/nostr/watchHistory.js");
const { VIEW_EVENT_KIND } = await import("../../js/nostr/viewEvents.js");
const { watchHistoryService } = await import("../../js/watchHistoryService.js");

function finalizeWithKey(eventTemplate, secretKey, pubkeyOverride = null) {
  const tags = Array.isArray(eventTemplate?.tags)
    ? eventTemplate.tags.map((tag) => Array.isArray(tag) ? [...tag] : [])
    : [];
  const base = {
    kind: Number.isFinite(eventTemplate?.kind)
      ? eventTemplate.kind
      : 1,
    content: typeof eventTemplate?.content === "string"
      ? eventTemplate.content
      : "",
    created_at: Number.isFinite(eventTemplate?.created_at)
      ? Math.floor(eventTemplate.created_at)
      : Math.floor(Date.now() / 1000),
    tags,
    pubkey:
      typeof pubkeyOverride === "string" && pubkeyOverride
        ? pubkeyOverride
        : typeof eventTemplate?.pubkey === "string" && eventTemplate.pubkey
          ? eventTemplate.pubkey
          : getPublicKey(secretKey),
  };
  return finalizeEvent(base, secretKey);
}

test("nostr login + remote signing + publish + watch history integration", async (t) => {
  const originalWindow = globalThis.window;
  const windowRef = originalWindow || {};
  globalThis.window = windowRef;

  if (!windowRef.crypto || !windowRef.crypto.subtle) {
    windowRef.crypto = webcrypto;
  }

  const originalNostr = windowRef.nostr;
  const originalNostrTools = windowRef.NostrTools;
  const originalGlobalNostrTools = globalThis.NostrTools;
  const originalCanonicalTools = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const originalToolsReady = globalThis.nostrToolsReady;

  const originalPool = nostrClient.pool;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalReadRelays = Array.isArray(nostrClient.readRelays)
    ? [...nostrClient.readRelays]
    : nostrClient.readRelays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalPubkey = nostrClient.pubkey;
  const originalSessionActor = nostrClient.sessionActor;
  const originalWatchHistoryCacheEntries = Array.from(
    nostrClient.watchHistory?.cache?.entries?.() || [],
  );
  const originalWatchHistoryStorage = nostrClient.watchHistory?.storage;

  const userSecret = generateSecretKey();
  const userPubkey = getPublicKey(userSecret);

  let extensionSignCount = 0;
  let remoteSignCount = 0;
  let remoteEncryptCount = 0;

  const publishedEvents = [];
  const poolStub = {
    publish(urls, event) {
      publishedEvents.push({
        urls: Array.isArray(urls) ? [...urls] : [],
        event,
      });
      return {
        on(eventName, handler) {
          if (eventName === "ok") {
            setTimeout(() => handler(), 0);
          }
          return this;
        },
      };
    },
    sub() {
      return { on() {}, unsub() {} };
    },
    close() {},
  };

  nostrClient.pool = poolStub;
  nostrClient.relays = ["wss://relay.integration"];
  nostrClient.readRelays = [...nostrClient.relays];
  nostrClient.writeRelays = [...nostrClient.relays];
  nostrClient.watchHistory.cache?.clear?.();
  nostrClient.watchHistory.fingerprints?.clear?.();
  nostrClient.watchHistory.republishTimers?.forEach?.((entry) => {
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
  });
  nostrClient.watchHistory.republishTimers?.clear?.();
  nostrClient.watchHistory.storage = null;
  watchHistoryService.resetProgress?.();
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }

  const toolkit = {
    finalizeEvent,
    getEventHash,
    getPublicKey,
    nip04,
    nip19: {
      npubEncode: (hex) => `npub${hex}`,
    },
  };
  windowRef.NostrTools = toolkit;
  globalThis.NostrTools = toolkit;
  globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = toolkit;
  globalThis.nostrToolsReady = Promise.resolve(toolkit);

  const userNpub = toolkit.nip19.npubEncode(userPubkey);
  const originalAccessState = {
    whitelistEnabled: accessControl.whitelistEnabled,
    whitelist: new Set(accessControl.whitelist),
    blacklist: new Set(accessControl.blacklist),
    editors: new Set(accessControl.editors),
  };
  accessControl.whitelistEnabled = false;
  accessControl.whitelist = new Set([userNpub]);
  accessControl.blacklist = new Set();
  accessControl.editors = new Set([userNpub]);

  windowRef.nostr = {
    enable: () => Promise.resolve(),
    getPublicKey: () => Promise.resolve(userPubkey),
    signEvent: async (event) => {
      extensionSignCount += 1;
      return finalizeWithKey(event, userSecret, userPubkey);
    },
    nip04: {
      encrypt: (pubkey, plaintext) => nip04.encrypt(userSecret, pubkey, plaintext),
      decrypt: (pubkey, ciphertext) => nip04.decrypt(userSecret, pubkey, ciphertext),
    },
  };

  t.after(() => {
    clearActiveSigner();
    accessControl.whitelistEnabled = originalAccessState.whitelistEnabled;
    accessControl.whitelist = new Set(originalAccessState.whitelist);
    accessControl.blacklist = new Set(originalAccessState.blacklist);
    accessControl.editors = new Set(originalAccessState.editors);
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    nostrClient.readRelays = originalReadRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.pubkey = originalPubkey;
    nostrClient.sessionActor = originalSessionActor;
    nostrClient.watchHistory.cache = new Map(originalWatchHistoryCacheEntries);
    nostrClient.watchHistory.storage = originalWatchHistoryStorage || null;
    nostrClient.watchHistory.fingerprints?.clear?.();
    nostrClient.watchHistory.republishTimers?.forEach?.((entry) => {
      if (entry?.timer) {
        clearTimeout(entry.timer);
      }
    });
    nostrClient.watchHistory.republishTimers?.clear?.();
    watchHistoryService.resetProgress?.();
    if (typeof localStorage?.clear === "function") {
      localStorage.clear();
    }

    if (originalNostr === undefined) {
      delete windowRef.nostr;
    } else {
      windowRef.nostr = originalNostr;
    }

    if (originalNostrTools === undefined) {
      delete windowRef.NostrTools;
    } else {
      windowRef.NostrTools = originalNostrTools;
    }

    if (originalGlobalNostrTools === undefined) {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = originalGlobalNostrTools;
    }

    if (originalCanonicalTools === undefined) {
      delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
    } else {
      globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = originalCanonicalTools;
    }

    if (originalToolsReady === undefined) {
      delete globalThis.nostrToolsReady;
    } else {
      globalThis.nostrToolsReady = originalToolsReady;
    }

    if (!originalWindow) {
      delete globalThis.window;
    }
  });

  const loginResult = await nostrClient.login();
  assert.equal(loginResult, userPubkey);
  extensionSignCount = 0;

  const remoteSigner = {
    type: "nip46",
    pubkey: userPubkey,
    async signEvent(event) {
      remoteSignCount += 1;
      return finalizeWithKey(event, userSecret, userPubkey);
    },
    async nip04Encrypt(pubkey, plaintext) {
      remoteEncryptCount += 1;
      return nip04.encrypt(userSecret, pubkey, plaintext);
    },
    nip04Decrypt(pubkey, ciphertext) {
      return nip04.decrypt(userSecret, pubkey, ciphertext);
    },
  };

  nostrClient.installNip46Client(
    {
      getActiveSigner: () => remoteSigner,
      destroy() {},
    },
    { userPubkey },
  );

  const viewPointer = {
    type: "e",
    value: "view-event-integration",
    watchedAt: 1_700_000_123,
  };

  const viewResult = await nostrClient.recordVideoView(viewPointer, {
    created_at: 1_700_000_125,
  });
  assert.equal(viewResult.ok, true);

  const publishResult = await nostrClient.publishVideo(
    {
      legacyFormData: {
        title: "Integration Remote Video",
        description: "remote signer flow",
        magnet: "magnet:?xt=urn:btih:REMOTEINTEGRATION123456789",
        mode: "live",
      },
    },
    userPubkey,
  );
  assert.equal(typeof publishResult?.id, "string");

  const snapshotItems = [
    { type: "e", value: viewPointer.value, watchedAt: viewPointer.watchedAt },
  ];
  const snapshotResult = await nostrClient.publishWatchHistorySnapshot(
    snapshotItems,
    { actorPubkey: userPubkey, snapshotId: "integration-snapshot" },
  );
  assert.equal(snapshotResult.ok, true);

  assert.equal(extensionSignCount, 0, "extension signer should not handle publish operations");
  assert(remoteSignCount > 0, "remote signer should sign nostr events");
  assert(remoteEncryptCount > 0, "remote signer should encrypt watch history payloads");

  const publishedKinds = publishedEvents.map((entry) => entry.event?.kind);
  assert(
    publishedKinds.some((kind) => kind === VIEW_EVENT_KIND),
    "view events should be published",
  );
  assert(
    publishedKinds.some((kind) => kind === WATCH_HISTORY_KIND),
    "watch history events should be published",
  );

  const actorKey = normalizeActorKey(userPubkey);
  const cachedEntry = nostrClient.watchHistory.cache.get(actorKey);
  assert.ok(cachedEntry, "watch history cache should contain the published snapshot");
  assert.equal(cachedEntry.items.length, 1);
  assert.equal(cachedEntry.items[0]?.value, viewPointer.value);

  const latest = await watchHistoryService.loadLatest(userPubkey);
  assert(Array.isArray(latest), "watch history service should resolve an array");
});
