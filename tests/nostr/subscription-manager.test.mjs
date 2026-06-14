// Scenario tests for the L1 SubscriptionManager (docs/architecture-refactor.md).
// Uses a fake pool + the REAL relaySubscriptionService, asserting externally
// observable transport behavior (REQ counts, relay targeting), not internals.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSubscriptionManager } from "../../js/nostr/subscriptionManager.js";
import { RelaySubscriptionService } from "../../js/services/relaySubscriptionService.js";

function makeFakePool() {
  let subCalls = 0;
  let listCalls = 0;
  const lastSubRelays = [];
  return {
    subCalls: () => subCalls,
    listCalls: () => listCalls,
    lastSubRelays: () => lastSubRelays,
    sub(relays) {
      subCalls += 1;
      lastSubRelays.length = 0;
      lastSubRelays.push(...relays);
      const handlers = {};
      return {
        on: (ev, cb) => {
          handlers[ev] = cb;
        },
        unsub: () => {},
      };
    },
    list() {
      listCalls += 1;
      return Promise.resolve([{ id: "evt-1" }]);
    },
  };
}

function makeManager(pool, defaultRelays = ["wss://core1", "wss://core2"]) {
  return createSubscriptionManager({
    getPool: () => pool,
    getDefaultRelays: () => defaultRelays,
    subscriptions: new RelaySubscriptionService(), // fresh per manager (isolation)
    logger: { dev: { warn() {}, log() {} }, user: { warn() {} } },
  });
}

// SCN-subman-dedup: identical (key + filters) subscribe calls share ONE REQ.
test("subscribe dedups by key — identical calls do not reopen", () => {
  const pool = makeFakePool();
  const m = makeManager(pool);
  const f = [{ kinds: [1984], "#e": ["a".repeat(64)] }];
  m.subscribe({ key: "reports", filters: f });
  m.subscribe({ key: "reports", filters: f });
  assert.equal(pool.subCalls(), 1, "same key+filters must reuse one subscription");
});

// SCN-subman-default-relays: with no relays given, uses the bounded core set.
test("subscribe targets the health-gated default relay set when none given", () => {
  const pool = makeFakePool();
  const m = makeManager(pool, ["wss://core1", "wss://core2"]);
  m.subscribe({ key: "videos", filters: [{ kinds: [30078] }] });
  assert.deepEqual(pool.lastSubRelays(), ["wss://core1", "wss://core2"]);
});

// SCN-subman-batched-update: updating the id set re-REQs once (not per id).
test("handle.update re-issues a single batched subscription", () => {
  const pool = makeFakePool();
  const m = makeManager(pool);
  const h = m.subscribe({ key: "reports", filters: [{ kinds: [1984], "#e": ["a".repeat(64)] }] });
  h.update({ filters: [{ kinds: [1984], "#e": ["a".repeat(64), "b".repeat(64)] }] });
  assert.equal(pool.subCalls(), 2, "one initial + one updated REQ — still O(1), not per-id");
});

// SCN-subman-list-dedup: identical in-flight list() requests share one REQ.
test("list dedups identical in-flight requests", async () => {
  const pool = makeFakePool();
  const m = makeManager(pool);
  const filters = [{ kinds: [0], authors: ["a".repeat(64)] }];
  const [r1, r2] = await Promise.all([m.list({ filters }), m.list({ filters })]);
  assert.equal(pool.listCalls(), 1, "concurrent identical lists must coalesce to one REQ");
  assert.deepEqual(r1, r2);
});

// SCN-subman-reconnect: reconnect re-issues active subs once, centrally.
test("handleReconnect re-issues active subscriptions (and not closed ones)", () => {
  const pool = makeFakePool();
  const m = makeManager(pool);
  m.subscribe({ key: "reports", filters: [{ kinds: [1984] }] });
  const vids = m.subscribe({ key: "videos", filters: [{ kinds: [30078] }] });
  assert.equal(pool.subCalls(), 2);

  vids.close(); // closed subs must NOT come back on reconnect
  m.handleReconnect();

  // Only "reports" should be re-issued -> exactly one more sub call.
  assert.equal(pool.subCalls(), 3, "only the still-active sub is re-issued on reconnect");
  assert.deepEqual(m.getActiveKeys(), ["reports"]);
});
