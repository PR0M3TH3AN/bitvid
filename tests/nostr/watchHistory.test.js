import "../test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWatchHistoryPayload,
  createWatchHistoryManager,
  fetchWatchHistory,
  getWatchHistoryCacheTtlMs,
  getWatchHistoryStorage,
} from "../../js/nostr/watchHistory.js";
import { WATCH_HISTORY_KIND } from "../../js/config.js";
import { NOTE_TYPES } from "../../js/nostrEventSchemas.js";
import { profileCache } from "../../js/state/profileCache.js";

const WATCH_HISTORY_STORAGE_KEY = "bitvid:watch-history:v5";

function ensureLocalStorageCleared() {
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
}

test.beforeEach(() => {
  ensureLocalStorageCleared();
  // Clear profile cache memory
  if (profileCache) {
      profileCache.activePubkey = null;
      profileCache.memoryCache.clear();
  }
});

test("buildWatchHistoryPayload enforces byte limits and records skipped entries", () => {
  const month = "2025-01";
  const maxBytes = 256;
  const oversizedPointer = {
    type: "e",
    value: "huge-pointer",
    metadata: { note: "x".repeat(400) },
  };
  const smallPointers = Array.from({ length: 5 }, (_, index) => ({
    type: "e",
    value: `pointer-${index + 1}`,
    watchedAt: index + 1,
    metadata: { note: "y".repeat(20) },
  }));
  const payloadItems = [oversizedPointer, ...smallPointers];

  const { payload, skipped, included } = buildWatchHistoryPayload(
    month,
    payloadItems,
    null,
    maxBytes,
  );

  assert.equal(skipped.length, 1, "oversized entries should be skipped");
  assert.equal(
    skipped[0]?.value,
    oversizedPointer.value,
    "skipped list should capture the oversized pointer",
  );

  assert.equal(payload.month, month, "payload should record the requested month");
  assert.equal(payload.version, 2, "payload should record the expected version");
  assert.deepStrictEqual(
    payload.items,
    smallPointers.map((item) => item.value),
    "all remaining pointers should be included in the payload",
  );
  assert.deepStrictEqual(
    payload.watchedAt,
    smallPointers.reduce((acc, pointer) => ({ ...acc, [pointer.value]: pointer.watchedAt }), {}),
    "watchedAt map should mirror included timestamps",
  );
  assert.equal(
    included.length,
    smallPointers.length,
    "included pointers should mirror the payload items",
  );
  const serializedLength = JSON.stringify(payload).length;
  assert(
    serializedLength <= maxBytes,
    `payload should respect the configured max bytes (observed ${serializedLength})`,
  );
});

test("getWatchHistoryStorage prunes entries that exceed the configured TTL", () => {
  const manager = createWatchHistoryManager({
    getActivePubkey: () => profileCache.getActiveProfile(),
  });
  const ttl = getWatchHistoryCacheTtlMs(manager);
  const originalNow = Date.now;
  const baseNow = Date.now();
  const freshActor = "1".repeat(64);
  const staleActor = "2".repeat(64);

  try {
    Date.now = () => baseNow;

    // Test Fresh Actor
    profileCache.setActiveProfile(freshActor);
    const freshPayload = {
      actor: freshActor,
      snapshotId: "snap-fresh",
      fingerprint: "fingerprint-fresh",
      savedAt: baseNow - (ttl - 1000),
      items: [{ type: "e", value: "fresh-pointer", watchedAt: 123 }],
      metadata: { status: "ok" },
    };
    const freshKey = profileCache.getStorageKey(freshActor, NOTE_TYPES.WATCH_HISTORY);
    localStorage.setItem(freshKey, JSON.stringify(freshPayload));

    const freshStorage = getWatchHistoryStorage(manager);
    const freshEntry = freshStorage.actors[freshActor];

    assert.ok(freshEntry, "fresh actor should remain present after hydration");
    assert.equal(freshEntry.snapshotId, "snap-fresh");
    assert.equal(freshEntry.fingerprint, "fingerprint-fresh");
    assert.equal(freshEntry.items.length, 1);
    assert.equal(freshEntry.items[0]?.value, "fresh-pointer");


    // Test Stale Actor
    profileCache.setActiveProfile(staleActor);
    const stalePayload = {
      actor: staleActor,
      snapshotId: "snap-stale",
      fingerprint: "fingerprint-stale",
      savedAt: baseNow - (ttl + 1000),
      items: [{ type: "e", value: "stale-pointer", watchedAt: 456 }],
      metadata: { status: "stale" },
    };
    const staleKey = profileCache.getStorageKey(staleActor, NOTE_TYPES.WATCH_HISTORY);
    localStorage.setItem(staleKey, JSON.stringify(stalePayload));

    const staleStorage = getWatchHistoryStorage(manager);
    const staleEntry = staleStorage.actors[staleActor];

    assert.strictEqual(
      staleEntry,
      undefined,
      "stale actor entry should be removed (pruned)",
    );

  } finally {
    Date.now = originalNow;
    manager.clear();
    profileCache.activePubkey = null;
  }
});

test("fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds", async () => {
  const actorHex = "3".repeat(64);
  const snapshotId = "snap-success";
  const chunkIdentifier = "chunk-success";
  const ciphertext = "YmFzZTY0LWVuY29kZWQ=?iv=YWJjZGVm";

  const pointerEvent = {
    id: "pointer-success",
    pubkey: actorHex,
    created_at: 1_700_000_000,
    content: JSON.stringify({
      version: 2,
      snapshot: snapshotId,
      items: [{ type: "e", value: "fallback-pointer", watchedAt: 1 }],
      chunkIndex: 0,
      totalChunks: 1,
    }),
    tags: [
      ["snapshot", snapshotId],
      ["a", `${WATCH_HISTORY_KIND}:${actorHex}:${chunkIdentifier}`],
    ],
  };

  const chunkEvent = {
    id: "chunk-success",
    pubkey: actorHex,
    created_at: 1_700_000_100,
    content: ciphertext,
    tags: [
      ["d", chunkIdentifier],
      ["encrypted", "nip04"],
      ["snapshot", snapshotId],
      ["chunk", "0", "1"],
    ],
  };

  const decryptCalls = [];
  const signer = {
    nip04Decrypt: async (pubkey, payload) => {
      decryptCalls.push({ pubkey, payload });
      assert.equal(pubkey, actorHex, "decrypt should target the normalized actor key");
      assert.equal(payload, ciphertext, "decrypt should receive the chunk ciphertext");
      return JSON.stringify({
        version: 2,
        snapshot: snapshotId,
        chunkIndex: 0,
        totalChunks: 1,
        items: [{ type: "e", value: "decrypted-pointer", watchedAt: 9 }],
      });
    },
  };

  let listCall = 0;
  const pool = {
    async list() {
      listCall += 1;
      if (listCall === 1) {
        return [pointerEvent];
      }
      return [chunkEvent];
    },
  };

  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorHex,
    resolveActiveSigner: () => signer,
    shouldRequestExtensionPermissions: () => false,
    getPool: () => pool,
    getReadRelays: () => ["wss://relay.example"],
  });

  try {
    const result = await fetchWatchHistory(manager, actorHex, { forceRefresh: true });

    assert.equal(decryptCalls.length, 1, "decrypt should be attempted exactly once");
    assert.deepStrictEqual(
      result.items.map((item) => item.value),
      ["decrypted-pointer"],
      "decrypted payload should replace fallback pointer items",
    );
  } finally {
    manager.clear();
  }
});

test("fetchWatchHistory falls back to pointer payload when nip04 decrypt fails", async () => {
  const actorHex = "4".repeat(64);
  const snapshotId = "snap-fallback";
  const chunkIdentifier = "chunk-fallback";
  const ciphertext = "ZmFpbC1kZWNyeXB0P2l2PWFiYw==";

  const pointerEvent = {
    id: "pointer-fallback",
    pubkey: actorHex,
    created_at: 1_700_100_000,
    content: JSON.stringify({
      version: 2,
      snapshot: snapshotId,
      items: [{ type: "e", value: "pointer-from-snapshot", watchedAt: 5 }],
      chunkIndex: 0,
      totalChunks: 1,
    }),
    tags: [
      ["snapshot", snapshotId],
      ["a", `${WATCH_HISTORY_KIND}:${actorHex}:${chunkIdentifier}`],
    ],
  };

  const chunkEvent = {
    id: "chunk-fallback",
    pubkey: actorHex,
    created_at: 1_700_100_100,
    content: ciphertext,
    tags: [
      ["d", chunkIdentifier],
      ["encrypted", "nip04"],
      ["snapshot", snapshotId],
      ["chunk", "0", "1"],
    ],
  };

  let decryptCalls = 0;
  const signer = {
    nip04Decrypt: async () => {
      decryptCalls += 1;
      throw new Error("decrypt failed");
    },
  };

  let listCall = 0;
  const pool = {
    async list() {
      listCall += 1;
      if (listCall === 1) {
        return [pointerEvent];
      }
      return [chunkEvent];
    },
  };

  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorHex,
    resolveActiveSigner: () => signer,
    shouldRequestExtensionPermissions: () => false,
    getPool: () => pool,
    getReadRelays: () => ["wss://relay.example"],
  });

  try {
    const result = await fetchWatchHistory(manager, actorHex, { forceRefresh: true });

    assert.equal(decryptCalls, 1, "decrypt should still be attempted once");
    assert.deepStrictEqual(
      result.items.map((item) => item.value),
      ["pointer-from-snapshot"],
      "fallback pointer items should be used when decrypt fails",
    );
  } finally {
    manager.clear();
  }
});

test("fetchWatchHistory decrypts encrypted pointer events with nip44 signer support", async () => {
  const actorHex = "5".repeat(64);
  const ciphertext = "nip44-ciphertext";
  const decryptCalls = [];

  const pointerEvent = {
    id: "pointer-nip44",
    pubkey: actorHex,
    created_at: 1_700_200_000,
    content: ciphertext,
    tags: [
      ["encrypted", "nip44"],
      ["a", "30078:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:fallback"],
      ["d", "watch-history-month"],
    ],
  };

  const signer = {
    nip44Decrypt: async (pubkey, payload) => {
      decryptCalls.push({ pubkey, payload });
      assert.equal(pubkey, actorHex, "nip44 decrypt should target the actor pubkey");
      assert.equal(payload, ciphertext, "nip44 decrypt should receive encrypted content");
      return JSON.stringify({
        version: 2,
        items: [{ type: "e", value: "decrypted-from-pointer", watchedAt: 33 }],
      });
    },
  };

  const pool = {
    async list() {
      return [pointerEvent];
    },
  };

  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorHex,
    resolveActiveSigner: () => signer,
    shouldRequestExtensionPermissions: () => false,
    getPool: () => pool,
    getReadRelays: () => ["wss://relay.example"],
  });

  try {
    const result = await fetchWatchHistory(manager, actorHex, { forceRefresh: true });
    assert.equal(decryptCalls.length, 1, "nip44 decrypt should be attempted once");
    assert.deepStrictEqual(
      result.items.map((item) => item.value),
      ["decrypted-from-pointer"],
      "decrypted pointer event payload should be used",
    );
    assert.equal(
      result.items[0]?.watchedAt,
      33,
      "watched timestamp from decrypted payload should be preserved",
    );
  } finally {
    manager.clear();
  }
});

test("fetchWatchHistory routes decryption by ciphertext format and never tries the non-matching family (ignores a misleading encrypted tag)", async () => {
  // A NIP-44 payload is plain base64 with NO "?iv=" marker. NIP-04 ciphertext
  // always carries "?iv=". Here the event is *mislabeled* with an
  // ["encrypted","nip04"] tag, but the ciphertext shape is authoritative.
  // Under a NIP-46 remote signer, every decrypt attempt is a published relay
  // RPC, so attempting the impossible nip04 family would be a wasted RPC that
  // burns the serial queue / risks the rate limit. The decryptor must route by
  // format and attempt ONLY nip44 — never nip04.
  const actorHex = "6".repeat(64);
  const ciphertext = "bmlwNDQtbWlzbGFiZWxlZC1wYXlsb2Fk"; // base64, no "?iv="
  let nip04Calls = 0;
  let nip44Calls = 0;

  const pointerEvent = {
    id: "pointer-mislabeled",
    pubkey: actorHex,
    created_at: 1_700_300_000,
    content: ciphertext,
    tags: [
      ["encrypted", "nip04"], // deliberately misleading
      ["a", "30078:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:fallback"],
      ["d", "watch-history-month"],
    ],
  };

  const signer = {
    // If routing were broken, the misleading tag would put nip04 first and this
    // decoy would "succeed" with the wrong data — the assertions below catch it.
    nip04Decrypt: async () => {
      nip04Calls += 1;
      return JSON.stringify({
        version: 2,
        items: [{ type: "e", value: "WRONG-nip04-decoy", watchedAt: 1 }],
      });
    },
    nip44Decrypt: async (pubkey, payload) => {
      nip44Calls += 1;
      assert.equal(pubkey, actorHex, "nip44 decrypt should target the actor pubkey");
      assert.equal(payload, ciphertext, "nip44 decrypt should receive the ciphertext");
      return JSON.stringify({
        version: 2,
        items: [{ type: "e", value: "correct-nip44-decrypt", watchedAt: 77 }],
      });
    },
  };

  const pool = {
    async list() {
      return [pointerEvent];
    },
  };

  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorHex,
    resolveActiveSigner: () => signer,
    shouldRequestExtensionPermissions: () => false,
    getPool: () => pool,
    getReadRelays: () => ["wss://relay.example"],
  });

  try {
    const result = await fetchWatchHistory(manager, actorHex, { forceRefresh: true });
    assert.equal(
      nip04Calls,
      0,
      "nip04 must NEVER be attempted for a nip44-shaped ciphertext (wasted NIP-46 RPC)",
    );
    assert.equal(nip44Calls, 1, "nip44 decrypt should be attempted exactly once");
    assert.deepStrictEqual(
      result.items.map((item) => item.value),
      ["correct-nip44-decrypt"],
      "the nip44 plaintext must be used, not the nip04 decoy",
    );
  } finally {
    manager.clear();
  }
});

test("publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt", async () => {
  const actorPubkey = "f".repeat(64);
  const sessionPrivateKey = "a".repeat(64);
  let encryptCalls = 0;
  const toolkit = {
    nip04: {
      encrypt: async (_priv, _pub, plaintext) => {
        encryptCalls += 1;
        return `encrypted:${plaintext}`;
      },
    },
  };

  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorPubkey,
    getSessionActor: () => ({ pubkey: actorPubkey, privateKey: sessionPrivateKey }),
    ensureSessionActor: async () => actorPubkey,
    resolveActiveSigner: () => null,
    shouldRequestExtensionPermissions: () => false,
    ensureExtensionPermissions: async () => ({ ok: true }),
    ensureNostrTools: async () => toolkit,
    getCachedNostrTools: () => toolkit,
    signEventWithPrivateKey: (event) => ({
      ...event,
      id: `signed-${event.kind}`,
      sig: `sig-${event.kind}`,
    }),
    getReadRelays: () => ["wss://relay.integration"],
    getWriteRelays: () => ["wss://relay.integration"],
    getRelayFallback: () => ["wss://relay.integration"],
    getPool: () => ({
      publish: () => ({
        on(eventName, handler) {
          if (eventName === "ok") {
            handler();
          }
          return this;
        },
      }),
      async list() { return []; },
    }),
  });

  try {
    const result = await manager.publishSnapshot(
      [{ type: "e", value: "pointer", watchedAt: 123 }],
      { actorPubkey, snapshotId: "snapshot-injected" },
    );

    assert.equal(
      result.ok,
      true,
      "snapshot publish should succeed with injected toolkit helpers",
    );
    assert(
      encryptCalls > 0,
      "fallback nostr-tools encrypt helper should be invoked",
    );
  } finally {
    manager.clear();
  }
});

test("publishWatchHistorySnapshot caches successful snapshot results", async () => {
  const actorPubkey = "c".repeat(64);
  profileCache.setActiveProfile(actorPubkey);

  const sessionPrivateKey = "s".repeat(64);
  const relayUrls = ["wss://relay.cache"];
  const publishCalls = [];

  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorPubkey,
    getSessionActor: () => ({ pubkey: actorPubkey, privateKey: sessionPrivateKey }),
    ensureSessionActor: async () => actorPubkey,
    resolveActiveSigner: () => null,
    shouldRequestExtensionPermissions: () => false,
    signEventWithPrivateKey: async (event, key) => ({
      ...event,
      id: `${event.kind}:${event.created_at}:${event.content?.length || 0}`,
      sig: `sig-${key}`,
    }),
    ensureNostrTools: async () => ({
      nip04: {
        encrypt: async (priv, pub, plaintext) => `enc:${priv}:${pub}:${plaintext}`,
      },
    }),
    getWriteRelays: () => relayUrls,
    getRelayFallback: () => relayUrls,
    getPool: () => ({
      publish(urls, event) {
        publishCalls.push({ urls, event });
        return {
          on(eventName, handler) {
            if (eventName === "ok") {
              setTimeout(handler, 0);
            }
            return this;
          },
        };
      },
      async list() { return []; },
    }),
  });

  try {
    const items = [{ type: "e", value: "cached-pointer", watchedAt: 234 }];
    const result = await manager.publishSnapshot(items, {
      actorPubkey,
      relays: relayUrls,
      snapshotId: "snapshot-cache",
    });

    assert.equal(result.ok, true, "snapshot publish should succeed");
    assert(publishCalls.length > 0, "publish helper should be invoked");

    const actorKey = actorPubkey.toLowerCase();
    const cacheEntry = manager.cache.get(actorKey);
    assert.ok(cacheEntry, "cache entry should be stored for the actor");
    assert.equal(cacheEntry.items.length, 1, "cache should retain canonical items");
    assert.equal(cacheEntry.items[0]?.value, "cached-pointer");
    assert.equal(cacheEntry.snapshotId, result.snapshotId);
    assert.deepStrictEqual(cacheEntry.items, result.items);

    const storage = manager.getStorage();
    assert.ok(storage.actors[actorKey], "storage should persist the cache entry");
    assert.equal(storage.actors[actorKey].snapshotId, result.snapshotId);
    assert.equal(storage.actors[actorKey].items.length, 1);

    const fingerprint = manager.fingerprints.get(actorKey);
    assert.ok(fingerprint, "fingerprint cache should be populated");
    assert.equal(fingerprint, cacheEntry.fingerprint);
  } finally {
    manager.clear();
    profileCache.activePubkey = null;
  }
});
