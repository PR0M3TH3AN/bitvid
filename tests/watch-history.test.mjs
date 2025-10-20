// Run with: node tests/watch-history.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const {
  WATCH_HISTORY_PAYLOAD_MAX_BYTES,
  WATCH_HISTORY_MAX_ITEMS,
  WATCH_HISTORY_CACHE_TTL_MS,
  WATCH_HISTORY_BATCH_RESOLVE,
  WATCH_HISTORY_BATCH_PAGE_SIZE,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_KIND,
} =
  await import("../js/config.js");
const {
  getWatchHistoryV2Enabled,
  setWatchHistoryV2Enabled,
} = await import("../js/constants.js");
const {
  nostrClient,
  chunkWatchHistoryPayloadItems,
  normalizeActorKey,
} = await import("../js/nostr.js");
const { watchHistoryService } = await import("../js/watchHistoryService.js");
const { buildHistoryCard } = await import("../js/historyView.js");
const { getApplication, setApplication } = await import(
  "../js/applicationContext.js"
);

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
const originalScheduleWatchHistoryRepublish =
  nostrClient.scheduleWatchHistoryRepublish;
const originalResolveWatchHistory = nostrClient.resolveWatchHistory;
const originalGetWatchHistoryFingerprint =
  nostrClient.getWatchHistoryFingerprint;
const originalExtensionPermissionCache = nostrClient.extensionPermissionCache;
const originalExtensionPermissionSnapshot = Array.isArray(
  originalExtensionPermissionCache,
)
  ? Array.from(originalExtensionPermissionCache)
  : originalExtensionPermissionCache instanceof Set
    ? Array.from(originalExtensionPermissionCache)
    : [];

const NIP07_PERMISSIONS_STORAGE_KEY = "bitvid:nip07:permissions";

function clearStoredExtensionPermissions() {
  if (typeof localStorage === "undefined" || !localStorage) {
    return;
  }
  try {
    localStorage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
  } catch (error) {
    // ignore cleanup errors in tests
  }
}

function writeStoredExtensionPermissions(methods = []) {
  if (typeof localStorage === "undefined" || !localStorage) {
    return;
  }

  const normalized = Array.from(
    new Set(
      Array.from(methods)
        .filter((method) => typeof method === "string")
        .map((method) => method.trim())
        .filter(Boolean),
    ),
  );

  try {
    if (!normalized.length) {
      localStorage.removeItem(NIP07_PERMISSIONS_STORAGE_KEY);
      return;
    }

    localStorage.setItem(
      NIP07_PERMISSIONS_STORAGE_KEY,
      JSON.stringify({ grantedMethods: normalized }),
    );
  } catch (error) {
    // ignore persistence errors in tests
  }
}

nostrClient.extensionPermissionCache = new Set();
clearStoredExtensionPermissions();

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

function extractVideoMetadataFromItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const directVideo = item.video;
  if (directVideo && typeof directVideo === "object") {
    return directVideo;
  }

  const metadataVideo =
    item.metadata && typeof item.metadata === "object"
      ? item.metadata.video
      : null;
  if (metadataVideo && typeof metadataVideo === "object") {
    return metadataVideo;
  }

  const pointer = item.pointer && typeof item.pointer === "object"
    ? item.pointer
    : null;
  if (pointer) {
    if (pointer.video && typeof pointer.video === "object") {
      return pointer.video;
    }
    const pointerMetadata =
      pointer.metadata && typeof pointer.metadata === "object"
        ? pointer.metadata.video
        : null;
    if (pointerMetadata && typeof pointerMetadata === "object") {
      return pointerMetadata;
    }
  }

  return null;
}
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
  const enableCalls = [];
  const decryptCalls = [];
  window.nostr = {
    enable: async (options) => {
      enableCalls.push(options || null);
      return { ok: true };
    },
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
        decryptCalls.push({ target, ciphertext });
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
    getEnableCalls: () => [...enableCalls],
    getDecryptCalls: () => decryptCalls.map((entry) => ({ ...entry })),
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

async function testNormalizeActorKeyShortCircuit() {
  console.log("Running normalizeActorKey short-circuit test...");

  const actorHex = "f".repeat(64);
  const actorNpub = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  if (!window.NostrTools || typeof window.NostrTools !== "object") {
    window.NostrTools = {};
  }
  const previousNip19 = window.NostrTools.nip19;
  const previousDecode =
    previousNip19 && typeof previousNip19.decode === "function"
      ? previousNip19.decode
      : null;
  const decodeCalls = [];

  window.NostrTools.nip19 = {
    ...(previousNip19 || {}),
    decode(value) {
      decodeCalls.push(value);
      if (value === actorNpub) {
        return { type: "npub", data: actorHex };
      }
      if (typeof previousDecode === "function") {
        return previousDecode(value);
      }
      throw new Error("unsupported-npub");
    },
  };

  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const upperHex = actorHex.toUpperCase();
    const normalizedHex = normalizeActorKey(upperHex);
    assert.equal(
      normalizedHex,
      actorHex,
      "hex inputs should normalize to lowercase hex",
    );
    assert.equal(
      decodeCalls.length,
      0,
      "hex inputs should not invoke nip19.decode",
    );
    assert.equal(
      warnings.length,
      0,
      "hex inputs should not emit decode warnings",
    );

    const normalizedNpub = normalizeActorKey(actorNpub);
    assert.equal(normalizedNpub, actorHex, "npub inputs should decode to hex");
    assert.equal(
      decodeCalls.length,
      1,
      "npub inputs should invoke nip19.decode",
    );
    assert.equal(
      warnings.length,
      0,
      "successful npub decode should not emit warnings",
    );
  } finally {
    console.warn = originalWarn;
    if (previousNip19) {
      window.NostrTools.nip19 = previousNip19;
    } else if (window.NostrTools) {
      delete window.NostrTools.nip19;
    }
  }
}

async function testNormalizeActorKeyManualFallback() {
  console.log("Running normalizeActorKey manual fallback test...");

  const actorHex =
    "a4a6b5849bc917b3befd5c81865ee0b88773690609c207ba6588ef3e1e05b95b";
  const actorNpub =
    "npub15jnttpymeytm80hatjqcvhhqhzrhx6gxp8pq0wn93rhnu8s9h9dsha32lx";

  if (!window.NostrTools || typeof window.NostrTools !== "object") {
    window.NostrTools = {};
  }

  const previousNip19 = window.NostrTools.nip19;
  const originalWarn = console.warn;
  const warnings = [];

  delete window.NostrTools.nip19;
  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const normalized = normalizeActorKey(actorNpub);
    assert.equal(
      normalized,
      actorHex,
      "manual fallback should decode npub values to hex",
    );
    assert.equal(
      warnings.length,
      0,
      "manual fallback decode should not emit warnings",
    );
  } finally {
    console.warn = originalWarn;
    if (previousNip19 !== undefined) {
      window.NostrTools.nip19 = previousNip19;
    } else {
      delete window.NostrTools.nip19;
    }
  }
}

async function testFetchWatchHistoryExtensionDecryptsHexAndNpub() {
  const actorHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const actorNpub =
    "npub1testextensiondecryptqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
  const snapshotId = "extension-fetch";
  const chunkIdentifier = "chunk-extension";

  const fallbackTag = ["e", "fallback-pointer"];
  const fallbackItem = { type: "e", value: "fallback-pointer", watchedAt: 1_700_800_000 };
  const chunkItem = { type: "e", value: "chunk-pointer", watchedAt: 1_700_800_100 };

  const chunkPayload = JSON.stringify({
    version: 1,
    items: [chunkItem],
    snapshot: snapshotId,
    chunkIndex: 0,
    totalChunks: 1,
  });
  const chunkCiphertext = `extension:${actorHex}:${Buffer.from(chunkPayload, "utf8").toString("base64")}`;

  const pointerEvent = {
    id: "pointer-extension",
    kind: WATCH_HISTORY_KIND,
    pubkey: actorHex,
    created_at: 1_700_800_000,
    content: JSON.stringify({
      version: 1,
      items: [fallbackItem],
      snapshot: snapshotId,
      chunkIndex: 0,
      totalChunks: 1,
    }),
    tags: [
      ["d", WATCH_HISTORY_LIST_IDENTIFIER],
      ["snapshot", snapshotId],
      ["encrypted", "nip04"],
      ["a", `${WATCH_HISTORY_KIND}:${actorHex}:${chunkIdentifier}`],
      fallbackTag,
    ],
  };

  const chunkEvent = {
    id: "chunk-extension",
    kind: WATCH_HISTORY_KIND,
    pubkey: actorHex,
    created_at: 1_700_800_060,
    content: chunkCiphertext,
    tags: [
      ["d", chunkIdentifier],
      ["snapshot", snapshotId],
      ["encrypted", "nip04"],
    ],
  };

  if (!window.NostrTools || typeof window.NostrTools !== "object") {
    window.NostrTools = {};
  }
  const previousNip19 = window.NostrTools.nip19;
  const previousDecode =
    previousNip19 && typeof previousNip19.decode === "function"
      ? previousNip19.decode
      : null;

  window.NostrTools.nip19 = {
    ...(previousNip19 || {}),
    decode: (value) => {
      if (value === actorNpub) {
        return { type: "npub", data: actorHex };
      }
      if (typeof previousDecode === "function") {
        return previousDecode(value);
      }
      throw new Error("unsupported-npub");
    },
  };

  const originalEnsure = nostrClient.ensureSessionActor;
  const originalSession = nostrClient.sessionActor;
  const originalPub = nostrClient.pubkey;
  const originalCache = nostrClient.watchHistoryCache;
  const originalStorage = nostrClient.watchHistoryStorage;

  nostrClient.watchHistoryCache = new Map();
  nostrClient.watchHistoryStorage = { version: 2, actors: {} };

  const publishEvents = async () => {
    poolHarness.reset();
    poolHarness.setResolver(() => ({ ok: true }));
    poolHarness.publish(["wss://relay.test"], pointerEvent);
    poolHarness.publish(["wss://relay.test"], chunkEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const runVariant = async (label, actorInput, pubkeyInput) => {
    await publishEvents();

    const sessionCrypto = installSessionCrypto({ privateKey: `session-${label}` });
    const extensionCrypto = installExtensionCrypto({ actor: actorHex });

    const previousEnsure = nostrClient.ensureSessionActor;
    const previousSession = nostrClient.sessionActor;
    const previousPub = nostrClient.pubkey;
    const previousStorage = nostrClient.watchHistoryStorage;

    try {
      nostrClient.pubkey = pubkeyInput;
      nostrClient.sessionActor = null;
      nostrClient.ensureSessionActor = async () => {
        throw new Error(`session fallback should not run for ${label}`);
      };
      nostrClient.watchHistoryCache.clear();
      nostrClient.watchHistoryStorage = { version: 2, actors: {} };

      const result = await nostrClient.fetchWatchHistory(actorInput, {
        forceRefresh: true,
      });

      assert.equal(
        extensionCrypto.getExtensionDecrypts(),
        1,
        `${label} actor should use extension decrypt`,
      );
      assert.equal(
        sessionCrypto.getDecryptCalls(),
        0,
        `${label} actor should not trigger session decrypt fallback`,
      );
      const decryptCalls = extensionCrypto.getDecryptCalls();
      assert.equal(
        decryptCalls.length,
        1,
        `${label} actor should invoke extension decrypt exactly once`,
      );
      assert.equal(
        decryptCalls[0]?.target,
        actorHex,
        `${label} actor should normalize npub inputs to hex for decrypt`,
      );

      assert.equal(result.items.length, 1, `${label} actor should return chunk item`);
      assert.equal(
        result.items[0]?.value,
        chunkItem.value,
        `${label} actor should surface decrypted pointer value`,
      );
    } finally {
      extensionCrypto.restore();
      sessionCrypto.restore();
      nostrClient.ensureSessionActor = previousEnsure;
      nostrClient.sessionActor = previousSession;
      nostrClient.pubkey = previousPub;
      nostrClient.watchHistoryStorage = previousStorage;
      poolHarness.reset();
    }
  };

  try {
    await runVariant("hex", actorHex, actorHex);
    await runVariant("npub", actorNpub, actorNpub);
  } finally {
    if (previousNip19) {
      window.NostrTools.nip19 = previousNip19;
    } else if (window.NostrTools) {
      delete window.NostrTools.nip19;
    }
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
    nostrClient.watchHistoryCache = originalCache;
    nostrClient.watchHistoryStorage = originalStorage;
    poolHarness.reset();
  }
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
    assert.equal(
      extension.getEnableCalls().length,
      1,
      "extension permissions should be requested once before encrypting",
    );
  } finally {
    extension.restore();
    sessionRestore.restore();
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
  }
}

async function testEnsureExtensionPermissionCaching() {
  const actor = "permission-actor";
  const extension = installExtensionCrypto({ actor });
  const previousCache = nostrClient.extensionPermissionCache;
  let previousStoredPermissions = null;
  if (typeof localStorage !== "undefined" && localStorage) {
    try {
      previousStoredPermissions = localStorage.getItem(
        NIP07_PERMISSIONS_STORAGE_KEY,
      );
    } catch (error) {
      previousStoredPermissions = null;
    }
  }
  nostrClient.extensionPermissionCache = new Set();
  clearStoredExtensionPermissions();

  try {
    const first = await nostrClient.ensureExtensionPermissions([
      "nip04.decrypt",
    ]);
    assert.equal(
      first.ok,
      true,
      "ensureExtensionPermissions should resolve when extension is available",
    );
    assert.equal(
      extension.getEnableCalls().length > 0,
      true,
      "ensureExtensionPermissions should invoke extension.enable to request access",
    );

    const callsAfterFirst = extension.getEnableCalls().length;
    const second = await nostrClient.ensureExtensionPermissions([
      "nip04.decrypt",
    ]);
    assert.equal(second.ok, true, "cached permission requests should still resolve");
    assert.equal(
      extension.getEnableCalls().length,
      callsAfterFirst,
      "cached permission requests should not trigger duplicate enable calls",
    );
  } finally {
    extension.restore();
    nostrClient.extensionPermissionCache = previousCache;
    if (typeof localStorage !== "undefined" && localStorage) {
      try {
        if (previousStoredPermissions && previousStoredPermissions.length) {
          localStorage.setItem(
            NIP07_PERMISSIONS_STORAGE_KEY,
            previousStoredPermissions,
          );
        } else {
          clearStoredExtensionPermissions();
        }
      } catch (error) {
        // ignore restore errors in tests
      }
    }
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

async function testWatchHistoryPartialRelayRetry() {
  poolHarness.reset();
  watchHistoryService.resetProgress();
  nostrClient.watchHistoryLastCreatedAt = 0;

  const actor = "partial-actor";
  const restoreCrypto = installSessionCrypto({ privateKey: "partial-priv" });
  const originalEnsure = nostrClient.ensureSessionActor;
  const originalSession = nostrClient.sessionActor;
  const originalPub = nostrClient.pubkey;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalPublishSnapshot = nostrClient.publishWatchHistorySnapshot;
  const originalSchedule = nostrClient.scheduleWatchHistoryRepublish;
  const originalRecordView = nostrClient.recordVideoView;

  try {
    nostrClient.pubkey = actor;
    nostrClient.sessionActor = { pubkey: actor, privateKey: "partial-priv" };
    nostrClient.ensureSessionActor = async () => actor;

    const relaySet = [
      "wss://relay.one",
      "wss://relay.two",
      "wss://relay.three",
    ];
    nostrClient.relays = [...relaySet];
    nostrClient.writeRelays = [...relaySet];

    let attemptIndex = 0;
    let currentAttempt = 0;
    nostrClient.publishWatchHistorySnapshot = async function publishWithTracking(
      ...args
    ) {
      attemptIndex += 1;
      currentAttempt = attemptIndex;
      return originalPublishSnapshot.apply(this, args);
    };

    nostrClient.recordVideoView = async () => ({
      ok: true,
      event: {
        id: `view-${Date.now()}`,
        pubkey: actor,
        created_at: Math.floor(Date.now() / 1000),
      },
    });

    await watchHistoryService.publishView(
      { type: "e", value: "partial-pointer" },
      Math.floor(Date.now() / 1000),
      { actor },
    );

    const queuedBefore = watchHistoryService.getQueuedPointers(actor);
    assert.equal(
      queuedBefore.length,
      1,
      "queue should contain the partial pointer before snapshot",
    );
    assert.deepEqual(
      nostrClient.writeRelays,
      relaySet,
      "write relays should include all configured endpoints",
    );

    const attemptPlans = [
      {
        "wss://relay.one": true,
        "wss://relay.two": true,
        "wss://relay.three": false,
      },
      {
        "wss://relay.one": true,
        "wss://relay.two": false,
        "wss://relay.three": true,
      },
      {
        "wss://relay.one": true,
        "wss://relay.two": true,
        "wss://relay.three": true,
      },
    ];

    poolHarness.setResolver(({ relays }) => {
      const relayUrl = Array.isArray(relays) && relays.length ? relays[0] : "";
      const index = Math.min(
        Math.max(currentAttempt, 1) - 1,
        attemptPlans.length - 1,
      );
      const plan = attemptPlans[index] || {};
      const accept = plan?.[relayUrl];
      if (accept) {
        return { ok: true };
      }
      return { ok: false, error: new Error(`reject-${relayUrl || "unknown"}`) };
    });

    const scheduledRuns = [];
    nostrClient.scheduleWatchHistoryRepublish = (snapshotId, operation) => {
      const promise = (async () => {
        let attempt = 1;
        let result = null;
        for (; attempt <= attemptPlans.length + 1; attempt += 1) {
          result = await operation(attempt);
          if (result?.ok || !result?.retryable) {
            break;
          }
        }
        return result;
      })();
      scheduledRuns.push({ snapshotId, promise });
      return { attempt: 1, delay: 0 };
    };

    let thrownError = null;
    try {
      await watchHistoryService.snapshot(null, { actor, reason: "partial-test" });
    } catch (error) {
      thrownError = error;
    }

    assert(thrownError, "snapshot should throw when partial acceptance occurs");
    assert.equal(
      thrownError?.result?.retryable,
      true,
      "partial failures should be marked retryable",
    );
    assert.equal(
      thrownError?.result?.error,
      "partial-relay-acceptance",
      "partial failures should expose the partial acceptance error code",
    );
    assert(thrownError?.result?.partial, "result should report partial acceptance");

    const initialPointerStatus =
      thrownError?.result?.publishResults?.relayStatus?.pointer || [];
    assert(
      initialPointerStatus.some((entry) => entry && entry.success === false),
      "initial relay status should capture pointer rejections",
    );

    assert(
      attemptIndex >= 1,
      "initial snapshot attempt should increment the attempt counter",
    );
    assert.equal(
      scheduledRuns.length,
      1,
      "partial failure should schedule a republish operation",
    );

    const finalResult = await scheduledRuns[0].promise;
    assert(finalResult?.ok, "republish attempts should converge to success");
    assert.equal(
      attemptIndex,
      3,
      "republish loop should retry until every relay accepts",
    );
    assert.equal(
      finalResult?.partial,
      false,
      "final result should not mark the publish as partial",
    );

    const finalPointerStatus =
      finalResult?.publishResults?.relayStatus?.pointer || [];
    assert.equal(
      finalPointerStatus.filter((entry) => entry?.success).length,
      relaySet.length,
      "final pointer publish should succeed on all relays",
    );
    for (const chunkStatus of finalResult?.publishResults?.relayStatus?.chunks || []) {
      assert.equal(
        chunkStatus.filter((entry) => entry?.success).length,
        relaySet.length,
        "final chunk publish should succeed on all relays",
      );
    }

    const remainingQueue = watchHistoryService.getQueuedPointers(actor);
    assert.equal(
      remainingQueue.length,
      0,
      "queue should remain empty after successful retries",
    );
  } finally {
    nostrClient.scheduleWatchHistoryRepublish = originalSchedule;
    nostrClient.publishWatchHistorySnapshot = originalPublishSnapshot;
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.recordVideoView = originalRecordView;
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.sessionActor = originalSession;
    nostrClient.pubkey = originalPub;
    poolHarness.setResolver(() => ({ ok: true }));
    watchHistoryService.resetProgress(actor);
    restoreCrypto.restore();
  }
}

async function testResolveWatchHistoryBatchingWindow() {
  const actor = "batch-window-actor";
  const originalEnsure = nostrClient.ensureSessionActor;
  const originalPub = nostrClient.pubkey;
  const originalFetch = nostrClient.fetchWatchHistory;
  const originalCache = nostrClient.watchHistoryCache;
  const originalStorage = nostrClient.watchHistoryStorage;

  try {
    nostrClient.pubkey = "";
    nostrClient.ensureSessionActor = async () => actor;
    nostrClient.watchHistoryCache = new Map();
    nostrClient.watchHistoryStorage = { version: 2, actors: {} };

    const syntheticItems = Array.from({ length: 24 }, (_, index) => ({
      type: "e",
      value: `pointer-${index}`,
      watchedAt: 1_700_100_000 + index,
    }));

    nostrClient.fetchWatchHistory = async () => ({
      items: syntheticItems.map((item) => ({ ...item })),
      snapshotId: "batch-snapshot",
      pointerEvent: null,
    });

    const resolved = await nostrClient.resolveWatchHistory(actor, {
      forceRefresh: true,
    });

    const batchPageSizeRaw = Number(WATCH_HISTORY_BATCH_PAGE_SIZE);
    const hasCustomBatchSize =
      Boolean(WATCH_HISTORY_BATCH_RESOLVE) &&
      Number.isFinite(batchPageSizeRaw) &&
      batchPageSizeRaw > 0;
    const expectedCount = hasCustomBatchSize
      ? Math.min(
          Math.floor(batchPageSizeRaw),
          WATCH_HISTORY_MAX_ITEMS,
          syntheticItems.length,
        )
      : Math.min(WATCH_HISTORY_MAX_ITEMS, syntheticItems.length);
    assert.equal(
      resolved.length,
      expectedCount,
      "batched resolve should honor the configured page size when batching is enabled",
    );
    assert(resolved.length > 1, "resolved history should include multiple entries");
    assert.equal(
      resolved[0]?.value,
      "pointer-23",
      "resolved items should remain sorted by newest watchedAt value",
    );
    const uniqueValues = new Set(resolved.map((item) => item?.value));
    assert.equal(
      uniqueValues.size,
      resolved.length,
      "resolved history should retain all unique pointers",
    );
  } finally {
    nostrClient.ensureSessionActor = originalEnsure;
    nostrClient.pubkey = originalPub;
    nostrClient.fetchWatchHistory = originalFetch;
    nostrClient.watchHistoryCache = originalCache;
    nostrClient.watchHistoryStorage = originalStorage;
  }
}

async function testWatchHistoryServiceIntegration() {
  poolHarness.reset();
  poolHarness.setResolver(() => ({ ok: true }));

  const actor = "service-actor";
  const pointerVideo = {
    id: "video-one",
    title: "Video One",
    url: "https://cdn.example/video-one.mp4",
    magnet:
      "magnet:?xt=urn:btih:89abcdef0123456789abcdef0123456789abcdef",
    infoHash: "89abcdef0123456789abcdef0123456789abcdef",
    legacyInfoHash: "89abcdef0123456789abcdef0123456789abcdef",
  };
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
      { actor, video: pointerVideo },
    );
    viewCreatedAt += 60;
    await watchHistoryService.publishView(
      { type: "e", value: "video-one" },
      viewCreatedAt,
      { actor, video: pointerVideo },
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
    const snapshotItems = Array.isArray(snapshotResult.items)
      ? snapshotResult.items
      : [];
    const snapshotVideo = extractVideoMetadataFromItem(
      snapshotItems.find(
        (entry) =>
          (entry?.value || entry?.pointer?.value || "") === "video-one",
      ),
    );
    assert(snapshotVideo, "snapshot should retain pointer video metadata");
    assert.equal(
      snapshotVideo?.url,
      pointerVideo.url,
      "snapshot pointer video should preserve url",
    );
    assert.equal(
      snapshotVideo?.magnet,
      pointerVideo.magnet,
      "snapshot pointer video should preserve magnet",
    );
    assert.equal(
      snapshotVideo?.infoHash,
      pointerVideo.infoHash,
      "snapshot pointer video should preserve infoHash",
    );
    assert.equal(
      snapshotVideo?.legacyInfoHash,
      pointerVideo.legacyInfoHash,
      "snapshot pointer video should preserve legacy info hash",
    );
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
    const resolvedVideo = extractVideoMetadataFromItem(
      resolvedItems.find(
        (entry) =>
          (entry?.value || entry?.pointer?.value || "") === "video-one",
      ),
    );
    assert(resolvedVideo, "decrypted history should include pointer video");
    assert.equal(
      resolvedVideo?.url,
      pointerVideo.url,
      "decrypted pointer video should expose url",
    );
    assert.equal(
      resolvedVideo?.magnet,
      pointerVideo.magnet,
      "decrypted pointer video should expose magnet",
    );
    assert.equal(
      resolvedVideo?.infoHash,
      pointerVideo.infoHash,
      "decrypted pointer video should expose infoHash",
    );
    assert.equal(
      resolvedVideo?.legacyInfoHash,
      pointerVideo.legacyInfoHash,
      "decrypted pointer video should expose legacy info hash",
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

async function testHistoryCardsUseDecryptedPlaybackMetadata() {
  console.log("Running watch history card playback metadata test...");

  const pointerVideo = {
    id: "history-card",
    title: "History Card Video",
    url: "https://cdn.example/history-card.mp4",
    magnet:
      "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
    infoHash: "0123456789abcdef0123456789abcdef01234567",
    legacyInfoHash: "0123456789abcdef0123456789abcdef01234567",
  };

  const item = {
    pointerKey: "e:history-card",
    pointer: { type: "e", value: "history-card" },
    watchedAt: 1_700_000_500,
  };

  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;

  class FakeClassList {
    constructor(element) {
      this.element = element;
    }

    _sync() {
      this.element._className = Array.from(this.element._classSet).join(" ");
    }

    add(...tokens) {
      tokens.forEach((token) => {
        if (token) {
          this.element._classSet.add(token);
        }
      });
      this._sync();
    }

    remove(...tokens) {
      tokens.forEach((token) => this.element._classSet.delete(token));
      this._sync();
    }

    toggle(token, force) {
      if (!token) {
        return false;
      }
      if (force === true) {
        this.element._classSet.add(token);
        this._sync();
        return true;
      }
      if (force === false) {
        this.element._classSet.delete(token);
        this._sync();
        return false;
      }
      if (this.element._classSet.has(token)) {
        this.element._classSet.delete(token);
        this._sync();
        return false;
      }
      this.element._classSet.add(token);
      this._sync();
      return true;
    }

    contains(token) {
      return this.element._classSet.has(token);
    }
  }

  class FakeElement {
    constructor(tagName) {
      this.tagName = typeof tagName === "string" ? tagName.toUpperCase() : "";
      this.children = [];
      this.parentNode = null;
      this.dataset = {};
      this.attributes = {};
      this.textContent = "";
      this._classSet = new Set();
      this._className = "";
      this.classList = new FakeClassList(this);
    }

    appendChild(child) {
      if (child && typeof child === "object") {
        child.parentNode = this;
      }
      this.children.push(child);
      return child;
    }

    get className() {
      return this._className;
    }

    set className(value) {
      const tokens =
        typeof value === "string"
          ? value
              .split(/\s+/)
              .map((token) => token.trim())
              .filter(Boolean)
          : [];
      this._classSet = new Set(tokens);
      this._className = tokens.join(" ");
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }
  }

  function collectElements(root, predicate, results = []) {
    if (!(root instanceof FakeElement)) {
      return results;
    }
    if (predicate(root)) {
      results.push(root);
    }
    for (const child of root.children) {
      collectElements(child, predicate, results);
    }
    return results;
  }

  const fakeDocument = {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  globalThis.document = fakeDocument;
  globalThis.HTMLElement = FakeElement;

  try {
    const card = buildHistoryCard({
      item,
      video: pointerVideo,
      profile: null,
      metadataPreference: "encrypted-only",
    });

    assert(card instanceof FakeElement);
    assert.equal(card.dataset.pointerKey, item.pointerKey);

    const playLinks = collectElements(
      card,
      (element) =>
        element.tagName === "A" &&
        element.dataset.historyAction === "play",
    );

    assert(playLinks.length >= 1, "card should expose play actions");
    assert.equal(
      playLinks[0].dataset.playUrl,
      encodeURIComponent(pointerVideo.url),
      "play action should encode url from metadata",
    );
    assert.equal(
      playLinks[0].dataset.playMagnet,
      pointerVideo.magnet,
      "play action should surface magnet from metadata",
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.HTMLElement = originalHTMLElement;
  }
}

async function testWatchHistoryStaleCacheRefresh() {
  console.log("Running watch history stale cache refresh test...");

  const actor = "stale-cache-actor";
  const originalResolve = nostrClient.resolveWatchHistory;
  const originalFingerprint = nostrClient.getWatchHistoryFingerprint;
  const originalDateNow = Date.now;

  try {
    watchHistoryService.resetProgress(actor);

    nostrClient.getWatchHistoryFingerprint = async (_actor, items) => {
      const values = (Array.isArray(items) ? items : []).map((entry) => {
        if (!entry) {
          return "";
        }
        if (typeof entry.value === "string") {
          return entry.value;
        }
        if (
          entry.pointer &&
          typeof entry.pointer.value === "string"
        ) {
          return entry.pointer.value;
        }
        return "";
      });
      return `fingerprint:${values.join("|")}`;
    };

    const firstItems = [
      { type: "e", value: "watch-history-old", watchedAt: 1_700_000_000 },
    ];

    let resolveCallCount = 0;
    nostrClient.resolveWatchHistory = async (requestedActor) => {
      resolveCallCount += 1;
      assert.equal(
        requestedActor,
        actor,
        "initial load should request the expected actor",
      );
      return firstItems;
    };

    await watchHistoryService.loadLatest(actor, { allowStale: false });

    const baseNow = originalDateNow();
    Date.now = () => baseNow + WATCH_HISTORY_CACHE_TTL_MS + 1;

    const refreshedItems = [
      { type: "e", value: "watch-history-new", watchedAt: 1_700_000_600 },
    ];

    let refreshResolve;
    const refreshGate = new Promise((resolve) => {
      refreshResolve = resolve;
    });

    resolveCallCount = 0;
    nostrClient.resolveWatchHistory = async (requestedActor) => {
      resolveCallCount += 1;
      assert.equal(
        requestedActor,
        actor,
        "refresh should continue targeting the same actor",
      );
      await refreshGate;
      return refreshedItems;
    };

    const staleResult = await watchHistoryService.loadLatest(actor, {
      allowStale: true,
    });
    assert.equal(
      resolveCallCount,
      1,
      "stale load should trigger a single background refresh",
    );
    assert.equal(
      staleResult.length,
      firstItems.length,
      "stale load should return cached entries immediately",
    );
    const staleValue =
      staleResult[0]?.value || staleResult[0]?.pointer?.value || "";
    assert.equal(
      staleValue,
      "watch-history-old",
      "stale load should surface the cached pointer value",
    );

    refreshResolve();
    await refreshGate;
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    nostrClient.resolveWatchHistory = async () => {
      throw new Error("loadLatest should rely on refreshed cache");
    };

    const freshResult = await watchHistoryService.loadLatest(actor);
    assert.equal(
      freshResult.length,
      refreshedItems.length,
      "fresh load should surface refreshed watch history entries",
    );
    const freshValue =
      freshResult[0]?.value || freshResult[0]?.pointer?.value || "";
    assert.equal(
      freshValue,
      "watch-history-new",
      "fresh load should include the updated pointer",
    );
  } finally {
    Date.now = originalDateNow;
    nostrClient.resolveWatchHistory = originalResolve;
    nostrClient.getWatchHistoryFingerprint = originalFingerprint;
    watchHistoryService.resetProgress(actor);
  }
}

async function testWatchHistoryLocalFallbackWhenDisabled() {
  console.log("Running watch history local fallback test...");

  const actor = "local-fallback-actor";
  const originalRecordView = nostrClient.recordVideoView;
  const originalPub = nostrClient.pubkey;
  const originalSession = nostrClient.sessionActor;

  try {
    setWatchHistoryV2Enabled(false);
    localStorage.clear();
    watchHistoryService.resetProgress();
    nostrClient.pubkey = "";
    nostrClient.sessionActor = { pubkey: actor, privateKey: "local-priv" };
    nostrClient.recordVideoView = async (_pointer, options = {}) => ({
      ok: true,
      event: {
        id: "local-view",
        pubkey: actor,
        created_at: options.created_at || 1_700_500_000,
      },
    });

    const supported =
      typeof watchHistoryService.supportsLocalHistory === "function"
        ? watchHistoryService.supportsLocalHistory(actor)
        : true;
    const localOnly =
      typeof watchHistoryService.isLocalOnly === "function"
        ? watchHistoryService.isLocalOnly(actor)
        : true;
    const enabled =
      typeof watchHistoryService.isEnabled === "function"
        ? watchHistoryService.isEnabled(actor)
        : false;
    assert.equal(
      supported,
      true,
      "service should report local history support while sync disabled",
    );
    assert.equal(localOnly, true, "guest session should be treated as local only");
    assert.equal(
      enabled,
      false,
      "sync should be disabled for session actors when feature flag is off",
    );

    const createdAt = 1_700_500_000;
    await watchHistoryService.publishView(
      { type: "e", value: "local-pointer" },
      createdAt,
      { actor },
    );

    const queued = watchHistoryService.getQueuedPointers(actor);
    assert.equal(
      queued.length,
      1,
      "local queue should retain pointer when sync is disabled",
    );

    const latest = await watchHistoryService.loadLatest(actor);
    assert.equal(
      latest.length,
      1,
      "loadLatest should surface session queue entries when sync disabled",
    );
    assert.equal(latest[0]?.value, "local-pointer");
    assert.equal(latest[0]?.type, "e");
    assert(
      Number.isFinite(latest[0]?.watchedAt) && latest[0].watchedAt > 0,
      "local fallback entries should carry watchedAt timestamps",
    );
  } finally {
    setWatchHistoryV2Enabled(true);
    watchHistoryService.resetProgress();
    nostrClient.recordVideoView = originalRecordView;
    nostrClient.pubkey = originalPub;
    nostrClient.sessionActor = originalSession;
  }
}

async function testWatchHistorySyncEnabledForLoggedInUsers() {
  console.log("Running watch history logged-in sync override test...");

  const actor = "npub-logged-sync";
  const originalPub = nostrClient.pubkey;
  const originalSession = nostrClient.sessionActor;
  const originalResolve = nostrClient.resolveWatchHistory;
  const originalFingerprint = nostrClient.getWatchHistoryFingerprint;

  try {
    setWatchHistoryV2Enabled(false);
    localStorage.clear();
    watchHistoryService.resetProgress();
    nostrClient.pubkey = actor;
    nostrClient.sessionActor = null;

    let resolveCalls = 0;
    nostrClient.resolveWatchHistory = async (requestedActor, options = {}) => {
      resolveCalls += 1;
      assert.equal(
        requestedActor,
        actor,
        "resolveWatchHistory should target the logged-in actor",
      );
      assert.equal(
        options?.forceRefresh,
        true,
        "loadLatest should force a relay refresh for logged-in actors",
      );
      return [
        {
          type: "e",
          value: "remote-pointer",
          watchedAt: 1_700_600_000,
        },
      ];
    };

    let fingerprintCalls = 0;
    nostrClient.getWatchHistoryFingerprint = async (requestedActor, items) => {
      fingerprintCalls += 1;
      assert.equal(
        requestedActor,
        actor,
        "fingerprint lookup should use the logged-in actor",
      );
      assert(Array.isArray(items), "fingerprint helper expects item array input");
      return "fingerprint-logged";
    };

    const enabled =
      typeof watchHistoryService.isEnabled === "function"
        ? watchHistoryService.isEnabled(actor)
        : false;
    assert.equal(
      enabled,
      true,
      "sync should remain enabled for logged-in actors even when the flag is disabled",
    );

    const items = await watchHistoryService.loadLatest(actor);
    assert.equal(
      resolveCalls > 0,
      true,
      "loadLatest should fetch from relays for logged-in actors",
    );
    assert.equal(items.length, 1, "loadLatest should return relay data for logged-in actors");
    assert.equal(items[0]?.value, "remote-pointer");
    assert.equal(
      fingerprintCalls > 0,
      true,
      "fingerprint cache should update for logged-in actors",
    );
  } finally {
    setWatchHistoryV2Enabled(true);
    watchHistoryService.resetProgress();
    nostrClient.resolveWatchHistory = originalResolve;
    nostrClient.getWatchHistoryFingerprint = originalFingerprint;
    nostrClient.pubkey = originalPub;
    nostrClient.sessionActor = originalSession;
  }
}

async function testWatchHistoryAppLoginFallback() {
  console.log("Running watch history app login fallback test...");

  const actor = "f".repeat(64);
  const originalPub = nostrClient.pubkey;
  const originalSession = nostrClient.sessionActor;
  const originalApp = getApplication();

  try {
    setWatchHistoryV2Enabled(false);
    localStorage.clear();
    watchHistoryService.resetProgress();
    nostrClient.pubkey = "";
    nostrClient.sessionActor = null;
    setApplication({
      pubkey: actor,
      normalizeHexPubkey(value) {
        if (typeof value === "string" && value.trim()) {
          return value.trim().toLowerCase();
        }
        return null;
      },
    });

    const enabled =
      typeof watchHistoryService.isEnabled === "function"
        ? watchHistoryService.isEnabled(actor)
        : false;
    assert.equal(
      enabled,
      true,
      "sync should be enabled when the app reports a logged-in pubkey",
    );
  } finally {
    setWatchHistoryV2Enabled(true);
    watchHistoryService.resetProgress();
    nostrClient.pubkey = originalPub;
    nostrClient.sessionActor = originalSession;
    setApplication(originalApp || null);
  }
}

await testPublishSnapshotCanonicalizationAndChunking();
await testPublishSnapshotUsesExtensionCrypto();
await testEnsureExtensionPermissionCaching();
await testFetchWatchHistoryExtensionDecryptsHexAndNpub();
await testPublishSnapshotFailureRetry();
await testWatchHistoryPartialRelayRetry();
await testResolveWatchHistoryBatchingWindow();
await testWatchHistoryServiceIntegration();
await testHistoryCardsUseDecryptedPlaybackMetadata();
await testWatchHistoryStaleCacheRefresh();
await testWatchHistoryLocalFallbackWhenDisabled();
await testWatchHistorySyncEnabledForLoggedInUsers();
await testWatchHistoryAppLoginFallback();
await testNormalizeActorKeyShortCircuit();
await testNormalizeActorKeyManualFallback();

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
nostrClient.scheduleWatchHistoryRepublish =
  originalScheduleWatchHistoryRepublish;
nostrClient.resolveWatchHistory = originalResolveWatchHistory;
nostrClient.getWatchHistoryFingerprint =
  originalGetWatchHistoryFingerprint;

if (originalExtensionPermissionCache instanceof Set) {
  originalExtensionPermissionCache.clear();
  for (const method of originalExtensionPermissionSnapshot) {
    originalExtensionPermissionCache.add(method);
  }
}
nostrClient.extensionPermissionCache = originalExtensionPermissionCache;
if (originalExtensionPermissionSnapshot.length) {
  writeStoredExtensionPermissions(originalExtensionPermissionSnapshot);
} else {
  clearStoredExtensionPermissions();
}

if (!originalFlag) {
  setWatchHistoryV2Enabled(false);
}
