import assert from "node:assert/strict";
import test from "node:test";

const originalCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
const originalNostrTools = globalThis.NostrTools;
const originalNostrToolsReady = globalThis.nostrToolsReady;

class BootstrapSimplePool {
  sub() {}
  close() {}
}

const bootstrapToolkit = {
  ok: true,
  nip19: {
    decode: (value) => value,
    npubEncode: (value) => value,
  },
  SimplePool: BootstrapSimplePool,
};

globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = bootstrapToolkit;
globalThis.NostrTools = bootstrapToolkit;
globalThis.nostrToolsReady = Promise.resolve(bootstrapToolkit);

const toolkitModule = await import("../../js/nostr/toolkit.js");
const {
  rememberNostrTools,
  getCachedNostrTools,
  ensureNostrTools,
  resolveSimplePoolConstructor,
  shimLegacySimplePoolMethods,
} = toolkitModule;

const baselineToolkit = getCachedNostrTools() || bootstrapToolkit;

test.after(() => {
  if (originalCanonical === undefined) {
    delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  } else {
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = originalCanonical;
  }

  if (originalNostrTools === undefined) {
    delete globalThis.NostrTools;
  } else {
    globalThis.NostrTools = originalNostrTools;
  }

  if (originalNostrToolsReady === undefined) {
    delete globalThis.nostrToolsReady;
  } else {
    globalThis.nostrToolsReady = originalNostrToolsReady;
  }

  rememberNostrTools(baselineToolkit);
});

test("ensureNostrTools resolves the cached toolkit", async () => {
  class CachedSimplePool {
    sub() {}
    close() {}
  }

  const cachedToolkit = {
    ok: true,
    nip19: {
      decode: (value) => value,
      npubEncode: (value) => value,
    },
    SimplePool: CachedSimplePool,
  };

  const previousCanonicalForTest = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrToolsForTest = globalThis.NostrTools;

  globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = cachedToolkit;
  globalThis.NostrTools = cachedToolkit;
  rememberNostrTools(cachedToolkit);

  try {
    const ensured = await ensureNostrTools();
    assert.strictEqual(ensured, cachedToolkit);
  } finally {
    if (previousCanonicalForTest === undefined) {
      delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
    } else {
      globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = previousCanonicalForTest;
    }

    if (previousNostrToolsForTest === undefined) {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousNostrToolsForTest;
    }

    rememberNostrTools(baselineToolkit);
  }
});

test("resolveSimplePoolConstructor handles supported permutations", () => {
  class MockSimplePool {
    sub() {}
    close() {}
  }

  const variations = [
    { label: "tools.SimplePool", tools: { SimplePool: MockSimplePool } },
    { label: "tools.pool.SimplePool", tools: { pool: { SimplePool: MockSimplePool } } },
    { label: "tools.pool constructor", tools: { pool: MockSimplePool } },
    {
      label: "tools.SimplePool.SimplePool",
      tools: { SimplePool: { SimplePool: MockSimplePool } },
    },
    {
      label: "tools.SimplePool.default",
      tools: { SimplePool: { default: MockSimplePool } },
    },
    { label: "tools.pool.default", tools: { pool: { default: MockSimplePool } } },
    {
      label: "tools.default.SimplePool",
      tools: { default: { SimplePool: MockSimplePool } },
    },
    {
      label: "tools.default.pool.SimplePool",
      tools: { default: { pool: { SimplePool: MockSimplePool } } },
    },
    {
      label: "tools.default.pool constructor",
      tools: { default: { pool: MockSimplePool } },
    },
  ];

  for (const { label, tools } of variations) {
    assert.strictEqual(
      resolveSimplePoolConstructor(tools),
      MockSimplePool,
      `expected ${label}`
    );
  }

  assert.strictEqual(
    resolveSimplePoolConstructor({}, { SimplePool: MockSimplePool }),
    MockSimplePool,
    "scope.SimplePool fallback"
  );

  assert.strictEqual(
    resolveSimplePoolConstructor({}, { pool: { SimplePool: MockSimplePool } }),
    MockSimplePool,
    "scope.pool.SimplePool fallback"
  );

  assert.strictEqual(
    resolveSimplePoolConstructor(
      {},
      { NostrTools: { pool: { SimplePool: MockSimplePool } } }
    ),
    MockSimplePool,
    "scope.NostrTools.pool.SimplePool fallback"
  );

  assert.strictEqual(
    resolveSimplePoolConstructor({}, {}),
    null,
    "returns null when no candidates are available"
  );
});

test("shimLegacySimplePoolMethods adds legacy sub/list wrappers", async () => {
  let capturedRequests = null;
  let capturedParams = null;
  const closeReasons = [];

  const mockPool = {
    subscribeMap(requests, params) {
      capturedRequests = requests;
      capturedParams = params;
      return {
        close(reason) {
          closeReasons.push(reason);
        },
      };
    },
  };

  shimLegacySimplePoolMethods(mockPool);

  assert.strictEqual(typeof mockPool.sub, "function");
  assert.strictEqual(typeof mockPool.list, "function");

  const relays = ["wss://relay.one", "wss://relay.two"];
  const filters = [{ kinds: [1] }, { authors: ["abc"] }];

  const sub = mockPool.sub(relays, filters, {
    alreadyHaveEvent(id) {
      return id === "skip";
    },
  });

  assert.ok(Array.isArray(capturedRequests));
  assert.strictEqual(capturedRequests.length, relays.length * filters.length);
  assert.ok(capturedRequests.every((entry) => entry && entry.url && entry.filter));
  assert.ok(capturedParams);
  assert.strictEqual(typeof capturedParams.onevent, "function");
  assert.strictEqual(typeof capturedParams.oneose, "function");
  assert.strictEqual(typeof capturedParams.onclose, "function");
  assert.strictEqual(typeof capturedParams.alreadyHaveEvent, "function");

  const receivedEvents = [];
  const eosePromise = new Promise((resolve) => sub.on("eose", resolve));
  const closePromise = new Promise((resolve) => sub.on("close", resolve));
  sub.on("event", (event) => {
    receivedEvents.push(event.id);
  });

  assert.strictEqual(capturedParams.alreadyHaveEvent("skip"), true);
  assert.strictEqual(capturedParams.alreadyHaveEvent("id-1"), false);
  assert.strictEqual(capturedParams.alreadyHaveEvent("id-1"), true);

  capturedParams.onevent({ id: "id-1" });
  capturedParams.onevent({ id: "id-2" });
  capturedParams.oneose();
  capturedParams.onclose(["done"]);

  await eosePromise;
  const closePayload = await closePromise;

  assert.deepStrictEqual(receivedEvents, ["id-1", "id-2"]);
  assert.deepStrictEqual(closePayload, ["done"]);

  sub.unsub();

  closeReasons.length = 0;
  const immediateUnsub = mockPool.sub(["wss://relay.extra"], [{ kinds: [2] }]);
  immediateUnsub.unsub();
  assert.ok(closeReasons.includes("closed by caller"));

  capturedParams = null;
  capturedRequests = null;
  closeReasons.length = 0;

  const listPromise = mockPool.list(["wss://relay.example"], [{ kinds: [1] }]);
  assert.ok(capturedParams);
  capturedParams.onevent({ id: "evt-1" });
  capturedParams.onevent({ id: "evt-2" });
  capturedParams.oneose();

  const listed = await listPromise;
  assert.deepStrictEqual(
    listed.map((event) => event.id),
    ["evt-1", "evt-2"]
  );
});
