// Run with: node scripts/run-targeted-tests.mjs tests/nostr/toolkit.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RELAY_URLS,
  shimLegacySimplePoolMethods,
  resolveSimplePoolConstructor,
  readToolkitFromScope,
  normalizeToolkitCandidate,
} from "../../js/nostr/toolkit.js";

test("toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs", () => {
  assert.ok(Array.isArray(DEFAULT_RELAY_URLS));
  assert.ok(Object.isFrozen(DEFAULT_RELAY_URLS));
  assert.ok(DEFAULT_RELAY_URLS.length > 0);
  assert.ok(DEFAULT_RELAY_URLS.every((url) => url.startsWith("wss://")));
});

test("toolkit: resolveSimplePoolConstructor finds SimplePool", () => {
  class MockSimplePool {
    sub() {}
    close() {}
  }

  const mockTools = {
    SimplePool: MockSimplePool,
  };

  const Resolved = resolveSimplePoolConstructor(mockTools);
  assert.equal(Resolved, MockSimplePool);

  const mockToolsNested = {
    pool: {
      SimplePool: MockSimplePool,
    },
  };

  const ResolvedNested = resolveSimplePoolConstructor(mockToolsNested);
  assert.equal(ResolvedNested, MockSimplePool);
});

test("toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing", () => {
  const pool = {
    subscribeMany: () => () => {},
  };

  shimLegacySimplePoolMethods(pool);

  assert.equal(typeof pool.sub, "function");
  assert.equal(typeof pool.list, "function");

  // Verify shim methods return expected interface
  const sub = pool.sub([], []);
  assert.equal(typeof sub.on, "function");
  assert.equal(typeof sub.off, "function");
  assert.equal(typeof sub.unsub, "function");
});

test("toolkit: readToolkitFromScope finds NostrTools in global scope", () => {
  const mockScope = {
    NostrTools: {
      generateSecretKey: () => {},
    },
  };

  const tools = readToolkitFromScope(mockScope);
  assert.ok(tools);
  assert.equal(typeof tools.generateSecretKey, "function");
});

test("toolkit: normalizeToolkitCandidate validation", () => {
  assert.equal(normalizeToolkitCandidate(null), null);
  assert.equal(normalizeToolkitCandidate({ ok: false }), null);
  assert.equal(normalizeToolkitCandidate({ then: () => {} }), null); // Promise-like

  const valid = { generateSecretKey: () => {} };
  const normalized = normalizeToolkitCandidate(valid);
  assert.deepEqual(normalized, valid);
});

test("toolkit: shimLegacySimplePoolMethods handles simple list operation", async () => {
  const pool = {
    subscribeMany: (relays, filters, opts) => {
      setTimeout(() => {
        if (opts.onevent) opts.onevent({ id: "1" });
        if (opts.oneose) opts.oneose();
      }, 10);
      return () => {};
    },
  };

  shimLegacySimplePoolMethods(pool);

  const events = await pool.list(["wss://relay.com"], [{ kinds: [1] }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "1");
});
