// Run with: node tests/watch-history.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { WATCH_HISTORY_PAYLOAD_MAX_BYTES } = await import("../js/config.js");
const {
  getWatchHistoryV2Enabled,
  setWatchHistoryV2Enabled,
} = await import("../js/constants.js");
const {
  nostrClient,
  chunkWatchHistoryPayloadItems,
} = await import("../js/nostr.js");
const { watchHistoryService } = await import("../js/watchHistoryService.js");

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!window.crypto || !window.crypto.subtle) {
  const { webcrypto } = await import("node:crypto");
  window.crypto = webcrypto;
}

const originalFlag = getWatchHistoryV2Enabled();
setWatchHistoryV2Enabled(true);

const originalWindowNostr = window.nostr;
const originalNostrTools = window.NostrTools || {};
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
const originalEnsureSessionActor = nostrClient.ensureSessionActor;
const originalSessionActor = nostrClient.sessionActor;
const originalPubkey = nostrClient.pubkey;
const originalWatchHistoryLastCreatedAt = nostrClient.watchHistoryLastCreatedAt;
const originalRecordVideoView = nostrClient.recordVideoView;
const originalWatchHistoryCache = nostrClient.watchHistoryCache;
const originalWatchHistoryStorage = nostrClient.watchHistoryStorage;

nostrClient.watchHistoryCache = new Map();
nostrClient.watchHistoryStorage = {
  version: 2,
  actors: {},
};

function cloneEvent(event) {
  return JSON.parse(JSON.stringify(event));
}

function createFakeSimplePool() {
  let resolver = () => ({ ok: true });
  const publishedEvents = [];
  const publishLog = [];
  let callIndex = 0;

  const pool = {
    publish(relays, event) {
      const normalizedRelays = Array.isArray(relays) ? [...relays] : [];
      const clonedEvent = cloneEvent(event);
      const entry = {
        index: callIndex += 1,
        relays: normalizedRelays,
        event: clonedEvent,
        handlers: {},
      };
      publishLog.push(entry);

      const handle = {
        on(type, handler) {
          if (typeof handler === "function") {
            entry.handlers[type] = handler;
          }
          return handle;
        },
      };

      setTimeout(() => {
        let outcome;
        try {
          outcome = resolver({
            index: entry.index,
            relays: normalizedRelays,
            event: clonedEvent,
          });
        } catch (error) {
          outcome = { ok: false, error };
        }
        if (outcome && outcome.ok) {
          publishedEvents.push(cloneEvent(clonedEvent));
          if (typeof entry.handlers.ok === "function") {
            entry.handlers.ok();
          }
        } else if (typeof entry.handlers.failed === "function") {
          entry.handlers.failed(
            outcome?.error || new Error("publish failed"),
          );
        }
      }, 0);

      return handle;
    },

    list(relays, filters) {
      const matched = [];
      const listFilters = Array.isArray(filters) ? filters : [];
      for (const filter of listFilters) {
        const matches = publishedEvents.filter((event) => {
          if (
            Array.isArray(filter?.kinds) &&
            !filter.kinds.includes(event.kind)
          ) {
            return false;
          }
          if (
            Array.isArray(filter?.authors) &&
            !filter.authors.includes(event.pubkey)
          ) {
            return false;
          }
          if (Array.isArray(filter?.["#d"])) {
            const dValues = (event.tags || [])
              .filter(
                (tag) =>
                  Array.isArray(tag) &&
                  tag[0] === "d" &&
                  typeof tag[1] === "string",
              )
              .map((tag) => tag[1]);
            if (!dValues.some((value) => filter["#d"].includes(value))) {
              return false;
            }
          }
          if (Array.isArray(filter?.["#snapshot"])) {
            const snapshotValues = (event.tags || [])
              .filter(
                (tag) =>
                  Array.isArray(tag) &&
                  tag[0] === "snapshot" &&
                  typeof tag[1] === "string",
              )
              .map((tag) => tag[1]);
            if (
              !snapshotValues.some((value) => filter["#snapshot"].includes(value))
            ) {
              return false;
            }
          }
          return true;
        });
        const limited = Number.isFinite(filter?.limit)
          ? matches.slice(0, Math.max(0, Math.floor(filter.limit)))
          : matches;
        matched.push(limited.map((event) => cloneEvent(event)));
      }
      return Promise.resolve(matched);
    },

    reset() {
      publishedEvents.length = 0;
      publishLog.length = 0;
      callIndex = 0;
    },

    setResolver(fn) {
      resolver = typeof fn === "function" ? fn : () => ({ ok: true });
    },

    getEvents() {
      return publishedEvents.map((event) => cloneEvent(event));
    },

    getPublishLog() {
      return publishLog.map((entry) => ({
        index: entry.index,
        relays: [...entry.relays],
        event: cloneEvent(entry.event),
      }));
    },
  };

  return pool;
}

const poolHarness = createFakeSimplePool();
nostrClient.pool = poolHarness;
nostrClient.relays = ["wss://relay.test"];
nostrClient.readRelays = ["wss://relay.test"];
nostrClient.writeRelays = ["wss://relay.test"];

function installSessionCrypto({ privateKey }) {
  const original = window.NostrTools || {};
  let encryptCalls = 0;
  let decryptCalls = 0;
  window.NostrTools = {
    ...original,
    getEventHash: (event) =>
      `hash-${event.kind}-${event.created_at}-${event.tags?.length || 0}`,
    signEvent: (event, key) => ({
      ...event,
      id: `signed-${event.kind}-${event.created_at}-${event.tags?.length || 0}`,
      sig: `sig-${key}`,
    }),
    nip04: {
      ...(original.nip04 || {}),
      encrypt: async (secret, pub, plaintext) => {
        encryptCalls += 1;
        const payload = Buffer.from(plaintext, "utf8").toString("base64");
        return `session:${secret}:${pub}:${payload}`;
      },
      decrypt: async (secret, pub, ciphertext) => {
        decryptCalls += 1;
        const prefix = `session:${secret}:${pub}:`;
        if (!ciphertext.startsWith(prefix)) {
          throw new Error("invalid-session-ciphertext");
        }
        const encoded = ciphertext.slice(prefix.length);
        return Buffer.from(encoded, "base64").toString("utf8");
      },
    },
  };
  return {
    restore() {
      window.NostrTools = original;
    },
    getEncryptCalls: () => encryptCalls,
    getDecryptCalls: () => decryptCalls,
  };
}

function installExtensionCrypto({ actor }) {
  const originalNostr = window.nostr;
  const originalTools = window.NostrTools || {};
  let extensionEncrypts = 0;
  let extensionDecrypts = 0;
  let fallbackEncrypts = 0;
  window.nostr = {
    signEvent: async (event) => ({
      ...event,
      id: `ext-${event.kind}-${event.created_at}`,
      sig: "ext-signature",
    }),
    nip04: {
      encrypt: async (target, plaintext) => {
        extensionEncrypts += 1;
        const payload = Buffer.from(plaintext, "utf8").toString("base64");
        return `extension:${target}:${payload}`;
      },
      decrypt: async (target, ciphertext) => {
        extensionDecrypts += 1;
        const prefix = `extension:${target}:`;
        if (!ciphertext.startsWith(prefix)) {
          throw new Error("invalid-extension-ciphertext");
        }
        const encoded = ciphertext.slice(prefix.length);
        return Buffer.from(encoded, "base64").toString("utf8");
      },
    },
  };
  window.NostrTools = {
    ...originalTools,
    nip04: {
      ...(originalTools.nip04 || {}),
      encrypt: () => {
        fallbackEncrypts += 1;
        throw new Error("fallback-encrypt-used");
      },
      decrypt: async (secret, pub, ciphertext) => {
        const prefix = `session:${secret}:${pub}:`;
        if (!ciphertext.startsWith(prefix)) {
          throw new Error("invalid-session-ciphertext");
        }
        const encoded = ciphertext.slice(prefix.length);
        return Buffer.from(encoded, "base64").toString("utf8");
      },
    },
  };
  return {
    restore() {
      window.nostr = originalNostr;
      window.NostrTools = originalTools;
    },
    getExtensionEncrypts: () => extensionEncrypts,
    getExtensionDecrypts: () => extensionDecrypts,
    getFallbackEncrypts: () => fallbackEncrypts,
  };
}

function extractChunkIdentifier(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string") {
      return tag[1];
    }
  }
  return "";
}

function maxCreatedAt(events = []) {
  return events.reduce((max, event) => {
    if (!event || typeof event !== "object") {
      return max;
    }
    const created = Number.isFinite(event.created_at) ? event.created_at : 0;
    return created > max ? created : max;
  }, 0);
}

async function testPublishSnapshotCanonicalizationAndChunking() {
  poolHarness.reset();
  poolHarness.setResolver(() => ({ ok: true }));

  const actor = "session-pubkey";
  const restoreCrypto = installSessionCrypto({ privateKey: "session-priv" });

  const originalEnsure = nostrClient.ensureSessionActor;
  const originalSession = nostrClient.sessionActor;
  const originalPub = nostrClient.pubkey;
  const originalLastCreated = nostrClient.watchHistoryLastCreatedAt;
  const originalDateNow = Date.now;

  try {
    nostrClient.pubkey = "";
    nostrClient.sessionActor = { pubkey: actor, privateKey: "session-priv" };
    nostrClient.ensureSessionActor = async () => actor;
    nostrClient.watchHistoryLastCreatedAt = 0;

    let nowValue = 1_700_000_000_000;
    Date.now = () => nowValue;

    const hugeValueA = `event-${"a".repeat(35000)}`;
    const hugeValueB = `event-${"b".repeat(35000)}`;
    const rawItems = [
      { type: "e", value: hugeValueB, watchedAt: 210 },
      { type: "e", value: hugeValueA, watchedAt: 200 },
      { type: "e", value: "pointer-dup", watchedAt: 100 },
      { type: "e", value: "pointer-dup", watchedAt: 150 },
      { type: "a", value: "30023:pub:episode", relay: "wss://relay.one", watchedAt: 90 },
      { tag: ["a", "30023:pub:episode", "wss://relay.two"] },
      { type: "e", value: "pointer-small", watchedAt: 80 },
    ];

    const firstResult = await nostrClient.publishWatchHistorySnapshot(rawItems, {
      actorPubkey: actor,
      snapshotId: "session-snapshot",
    });

    assert.ok(firstResult.ok, "snapshot should succeed with session crypto");
    assert.equal(
      firstResult.items.length,
      5,
      "canonicalization should dedupe pointer entries by key",
    );
    const dupMatches = firstResult.items.filter(
      (item) => item.value === "pointer-dup",
    );
    assert.equal(
      dupMatches.length,
      1,
      "duplicate pointer should be collapsed into a single canonical entry",
    );
    assert.equal(
      dupMatches[0].watchedAt,
      150,
      "canonical pointer should retain the newest watchedAt timestamp",
    );
    const anchorPointer = firstResult.items.find(
      (item) => item.value === "30023:pub:episode",
    );
    assert.ok(anchorPointer, "address pointer should survive normalization");
    assert.equal(
      anchorPointer.relay,
      "wss://relay.one",
      "existing relay metadata should persist when deduping",
    );

    assert.equal(
      firstResult.chunkEvents.length,
      2,
      "large payload should be chunked across two encrypted events",
    );

    const decrypt = window.NostrTools?.nip04?.decrypt;
    assert.equal(
      typeof decrypt,
      "function",
      "session decrypt stub should be installed",
    );

    for (const chunkEvent of firstResult.chunkEvents) {
      assert.notEqual(
        chunkEvent.content.trim()[0],
        "{",
        "chunk content must remain encrypted and avoid plaintext fallbacks",
      );
      const plaintext = await decrypt(
        "session-priv",
        actor,
        chunkEvent.content,
      );
      const payload = JSON.parse(plaintext);
      assert.equal(payload.snapshot, "session-snapshot");
      assert(Array.isArray(payload.items), "chunk payload should include items");
      const serializedLength = plaintext.length;
      assert(
        serializedLength <= WATCH_HISTORY_PAYLOAD_MAX_BYTES,
        `chunk payload should respect WATCH_HISTORY_PAYLOAD_MAX_BYTES (observed ${serializedLength})`,
      );
    }

    const pointerAddresses = firstResult.pointerEvent.tags.filter(
      (tag) => Array.isArray(tag) && tag[0] === "a",
    );
    assert.equal(
      pointerAddresses.length,
      2,
      "pointer event should reference each published chunk",
    );

    const firstCreatedMax = maxCreatedAt([
      ...firstResult.chunkEvents,
      firstResult.pointerEvent,
    ]);

    const fingerprintOne = await nostrClient.getWatchHistoryFingerprint(
      actor,
      firstResult.items,
    );
    assert.equal(
      typeof fingerprintOne,
      "string",
      "fingerprint generation should yield a deterministic digest",
    );

    nowValue -= 120_000;
    const secondResult = await nostrClient.publishWatchHistorySnapshot(
      [{ type: "e", value: "second-pointer", watchedAt: 50 }],
      { actorPubkey: actor, snapshotId: "session-followup" },
    );
    assert.ok(
      secondResult.ok,
      "follow-up snapshot should succeed when time moves backwards",
    );
    const secondCreatedMin = maxCreatedAt([
      ...secondResult.chunkEvents,
      secondResult.pointerEvent,
    ]);
    assert(
      secondCreatedMin > firstCreatedMax,
      "created_at guard should enforce monotonic timestamps between snapshots",
    );
    const fingerprintTwo = await nostrClient.getWatchHistoryFingerprint(
      actor,
      secondResult.items,
    );
    assert.notEqual(
      fingerprintOne,
      fingerprintTwo,
      "fingerprint should change when canonical items differ",
    );

    const chunkingPreview = chunkWatchHistoryPayloadItems(
      firstResult.items,
      "preview",
      40_000,
    );
    assert.equal(
      chunkingPreview.chunks.length,
      2,
      "chunk helper should split payloads when the configured limit is smaller than the canonical snapshot",
    );
    assert.equal(
      chunkingPreview.skipped.length,
      0,
      "no canonical entries should be skipped when the limit exceeds individual pointer size",
    );
  } finally {
    restoreCrypto.restore();
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
    nostrClient.watchHistoryLastCreatedAt = originalLastCreated;
    Date.now = originalDateNow;
  }
}

async function testPublishSnapshotUsesExtensionCrypto() {
  poolHarness.reset();
  poolHarness.setResolver(() => ({ ok: true }));

  const actor = "ext-pubkey";
  const sessionRestore = installSessionCrypto({ privateKey: "session-priv" });
  const extension = installExtensionCrypto({ actor });
  const originalEnsure = nostrClient.ensureSessionActor;
  const originalSession = nostrClient.sessionActor;
  const originalPub = nostrClient.pubkey;

  try {
    nostrClient.pubkey = actor;
    nostrClient.sessionActor = null;
    nostrClient.ensureSessionActor = async () => actor;

    const result = await nostrClient.publishWatchHistorySnapshot(
      [
        { type: "e", value: "ext-pointer-1", watchedAt: 100 },
        { type: "e", value: "ext-pointer-2", watchedAt: 50 },
      ],
      { actorPubkey: actor, snapshotId: "extension" },
    );

    assert.ok(result.ok, "extension-driven snapshot should succeed");
    assert.equal(
      extension.getFallbackEncrypts(),
      0,
      "session fallback encryptor should remain unused when extension path is active",
    );
    assert(extension.getExtensionEncrypts() > 0, "extension encrypt should be invoked");

    const decrypt = window.nostr?.nip04?.decrypt;
    assert.equal(
      typeof decrypt,
      "function",
      "extension decrypt helper should be available",
    );

    const decrypted = await decrypt(actor, result.chunkEvents[0].content);
    const payload = JSON.parse(decrypted);
    assert.equal(payload.snapshot, "extension");
    assert.equal(
      payload.items.length,
      result.items.length,
      "decrypted payload should match canonical item count",
    );
  } finally {
    extension.restore();
    sessionRestore.restore();
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
  }
}

async function testPublishSnapshotFailureRetry() {
  poolHarness.reset();
  nostrClient.watchHistoryLastCreatedAt = 0;

  const actor = "retry-actor";
  const restoreCrypto = installSessionCrypto({ privateKey: "retry-priv" });
  const originalEnsure = nostrClient.ensureSessionActor;
  const originalSession = nostrClient.sessionActor;
  const originalPub = nostrClient.pubkey;

  try {
    nostrClient.pubkey = "";
    nostrClient.sessionActor = { pubkey: actor, privateKey: "retry-priv" };
    nostrClient.ensureSessionActor = async () => actor;

    let failureCount = 0;
    poolHarness.setResolver(({ event }) => {
      const identifier = extractChunkIdentifier(event);
      if (identifier.endsWith(":0")) {
        failureCount += 1;
        return { ok: false, error: new Error("relay-rejection") };
      }
      return { ok: true };
    });

    const failed = await nostrClient.publishWatchHistorySnapshot(
      [{ type: "e", value: "retry-pointer", watchedAt: 42 }],
      { actorPubkey: actor, snapshotId: "retry" },
    );

    assert.equal(failed.ok, false, "snapshot should surface relay rejections");
    assert.equal(failed.retryable, true, "chunk rejection should be retryable");
    assert.equal(
      failureCount,
      1,
      "resolver should be invoked for the failed chunk",
    );

    poolHarness.setResolver(() => ({ ok: true }));
    const succeeded = await nostrClient.publishWatchHistorySnapshot(
      [{ type: "e", value: "retry-pointer", watchedAt: 43 }],
      { actorPubkey: actor, snapshotId: "retry" },
    );
    assert.ok(succeeded.ok, "subsequent snapshot should succeed after failure");
    assert(
      poolHarness.getPublishLog().length >= 3,
      "publish harness should record chunk and pointer attempts",
    );
  } finally {
    restoreCrypto.restore();
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
  }
}

async function testWatchHistoryServiceIntegration() {
  poolHarness.reset();
  poolHarness.setResolver(() => ({ ok: true }));

  const actor = "service-actor";
  const restoreCrypto = installSessionCrypto({ privateKey: "service-priv" });
  const originalEnsure = nostrClient.ensureSessionActor;
  const originalSession = nostrClient.sessionActor;
  const originalPub = nostrClient.pubkey;
  const originalWatchHistoryCacheTtl = nostrClient.watchHistoryCacheTtlMs;

  try {
    nostrClient.pubkey = "npub-logged";
    nostrClient.sessionActor = { pubkey: actor, privateKey: "service-priv" };
    nostrClient.ensureSessionActor = async () => actor;
    nostrClient.watchHistoryLastCreatedAt = 0;
    nostrClient.watchHistoryCache.clear();
    nostrClient.watchHistoryFingerprints = new Map();
    nostrClient.watchHistoryCacheTtlMs = 60_000;

    localStorage.clear();
    watchHistoryService.resetProgress();

    let viewCreatedAt = 1_700_000_010;
    nostrClient.recordVideoView = async (_pointer, options = {}) => ({
      ok: true,
      event: {
        id: `view-${viewCreatedAt}`,
        pubkey: actor,
        created_at: options.created_at || viewCreatedAt,
      },
    });

    const beforeFingerprint = await watchHistoryService.getFingerprint(actor);
    assert.equal(
      typeof beforeFingerprint,
      "string",
      "fingerprint lookup should always return a string value",
    );

    await watchHistoryService.publishView(
      { type: "e", value: "video-one" },
      viewCreatedAt,
      { actor },
    );
    viewCreatedAt += 60;
    await watchHistoryService.publishView(
      { type: "e", value: "video-one" },
      viewCreatedAt,
      { actor },
    );
    viewCreatedAt += 30;
    await watchHistoryService.publishView(
      { type: "a", value: "30023:pub:episode" },
      viewCreatedAt,
      { actor },
    );

    const queued = watchHistoryService.getQueuedPointers(actor);
    assert.equal(queued.length, 2, "queue should dedupe repeated pointers");

    const snapshotResult = await watchHistoryService.snapshot(null, {
      actor,
      reason: "integration",
    });
    assert.ok(snapshotResult.ok, "snapshot should publish queued pointers");
    assert.equal(
      watchHistoryService.getQueuedPointers(actor).length,
      0,
      "queue should be cleared after successful snapshot",
    );

    const resolvedItems = await watchHistoryService.loadLatest(actor);
    assert.deepEqual(
      resolvedItems,
      snapshotResult.items,
      "loadLatest should return decrypted canonical pointers",
    );
    assert(resolvedItems[0].watchedAt >= resolvedItems[1].watchedAt);
    assert.equal(
      resolvedItems[0].session,
      true,
      "session flag should persist through publish and load",
    );

    const afterFingerprint = await watchHistoryService.getFingerprint(actor);
    assert.notEqual(
      afterFingerprint,
      beforeFingerprint,
      "fingerprint should update after publishing a snapshot",
    );

    const latestFingerprint = await nostrClient.getWatchHistoryFingerprint(
      actor,
      resolvedItems,
    );
    assert.equal(
      afterFingerprint,
      latestFingerprint,
      "service fingerprint cache should align with canonical digest",
    );
  } finally {
    restoreCrypto.restore();
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
    nostrClient.watchHistoryCacheTtlMs = originalWatchHistoryCacheTtl;
    nostrClient.watchHistoryCache.clear();
    nostrClient.watchHistoryFingerprints = new Map();
  }
}

await testPublishSnapshotCanonicalizationAndChunking();
await testPublishSnapshotUsesExtensionCrypto();
await testPublishSnapshotFailureRetry();
await testWatchHistoryServiceIntegration();

console.log("watch-history.test.mjs completed successfully");

window.nostr = originalWindowNostr;
window.NostrTools = originalNostrTools;
nostrClient.pool = originalPool;
nostrClient.relays = originalRelays;
nostrClient.readRelays = originalReadRelays;
nostrClient.writeRelays = originalWriteRelays;
nostrClient.ensureSessionActor = originalEnsureSessionActor;
nostrClient.sessionActor = originalSessionActor;
nostrClient.pubkey = originalPubkey;
nostrClient.watchHistoryLastCreatedAt = originalWatchHistoryLastCreatedAt;
nostrClient.recordVideoView = originalRecordVideoView;
nostrClient.watchHistoryCache = originalWatchHistoryCache;
nostrClient.watchHistoryStorage = originalWatchHistoryStorage;

if (!originalFlag) {
  setWatchHistoryV2Enabled(false);
}
