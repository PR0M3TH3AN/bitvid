import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkWatchHistoryPayloadItems,
  createWatchHistoryManager,
  fetchWatchHistory,
  getWatchHistoryCacheTtlMs,
  getWatchHistoryStorage,
} from "../../js/nostr/watchHistory.js";
import { WATCH_HISTORY_KIND } from "../../js/config.js";

const WATCH_HISTORY_STORAGE_KEY = "bitvid:watch-history:v2";

function ensureLocalStorageCleared() {
  if (typeof localStorage?.clear === "function") {
    localStorage.clear();
  }
}

test.beforeEach(() => {
  ensureLocalStorageCleared();
});

test("chunkWatchHistoryPayloadItems enforces byte limits and records skipped entries", () => {
  const snapshotId = "snapshot-chunk";
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

  const { chunks, skipped } = chunkWatchHistoryPayloadItems(
    payloadItems,
    snapshotId,
    maxBytes,
  );

  assert.equal(skipped.length, 1, "oversized entries should be skipped");
  assert.equal(
    skipped[0]?.value,
    oversizedPointer.value,
    "skipped list should capture the oversized pointer",
  );

  const flattened = chunks.flat();
  assert.deepStrictEqual(
    flattened.map((item) => item.value),
    smallPointers.map((item) => item.value),
    "all remaining pointers should be included across chunks",
  );
  assert(chunks.length > 1, "payload should be split across multiple chunks");

  chunks.forEach((chunkItems, index) => {
    const serializedLength = JSON.stringify({
      version: 2,
      snapshot: snapshotId,
      chunkIndex: index,
      totalChunks: chunks.length,
      items: chunkItems,
    }).length;
    assert(
      serializedLength <= maxBytes,
      `chunk ${index} should respect the configured max bytes (observed ${serializedLength})`,
    );
  });
});

test("getWatchHistoryStorage prunes entries that exceed the configured TTL", () => {
  const manager = createWatchHistoryManager();
  const ttl = getWatchHistoryCacheTtlMs(manager);
  const originalNow = Date.now;
  const baseNow = Date.now();
  const freshActor = "1".repeat(64);
  const staleActor = "2".repeat(64);

  try {
    Date.now = () => baseNow;

    const storagePayload = {
      version: 2,
      actors: {
        [freshActor]: {
          actor: freshActor,
          snapshotId: "snap-fresh",
          fingerprint: "fingerprint-fresh",
          savedAt: baseNow - (ttl - 1000),
          items: [{ type: "e", value: "fresh-pointer", watchedAt: 123 }],
          metadata: { status: "ok" },
        },
        [staleActor]: {
          actor: staleActor,
          snapshotId: "snap-stale",
          fingerprint: "fingerprint-stale",
          savedAt: baseNow - (ttl + 1000),
          items: [{ type: "e", value: "stale-pointer", watchedAt: 456 }],
          metadata: { status: "stale" },
        },
      },
    };
    localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, JSON.stringify(storagePayload));

    const storage = getWatchHistoryStorage(manager);

    assert.deepStrictEqual(
      Object.keys(storage.actors),
      [freshActor],
      "hydrated storage should drop actors whose savedAt exceeds the TTL",
    );

    const freshEntry = storage.actors[freshActor];
    assert.ok(freshEntry, "fresh actor should remain present after hydration");
    assert.equal(freshEntry.snapshotId, "snap-fresh");
    assert.equal(freshEntry.fingerprint, "fingerprint-fresh");
    assert.equal(freshEntry.items.length, 1);
    assert.equal(freshEntry.items[0]?.value, "fresh-pointer");
    assert.equal(freshEntry.metadata.status, "ok");
    assert.strictEqual(
      storage.actors[staleActor],
      undefined,
      "stale actor entry should be removed",
    );

    const persistedRaw = localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    assert.ok(persistedRaw, "storage rewrite should persist sanitized payload");
    const persisted = JSON.parse(persistedRaw);
    assert.deepStrictEqual(
      Object.keys(persisted.actors),
      [freshActor],
      "persisted storage should match hydrated storage",
    );
  } finally {
    Date.now = originalNow;
    manager.clear();
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
