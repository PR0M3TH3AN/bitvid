// Tests the signature-verify worker client protocol: a batch of events is sent
// to the worker and the client resolves with the Set of ids the worker reports
// valid. This is the contract the feed ingestion relies on to drop forged events
// after the pool stopped verifying on the main thread.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// A controllable fake Worker installed as the global before importing nothing
// stateful — the client lazily constructs the worker on first use.
class FakeWorker {
  constructor() {
    this.listeners = { message: [], error: [] };
    FakeWorker.instances.push(this);
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  postMessage(msg) {
    if (FakeWorker.silent) return; // model a hung worker that never responds
    // Respond asynchronously, echoing as valid only the ids in FakeWorker.validIds
    // (or all ids if validIds is null), to mimic real verification.
    setTimeout(() => {
      const ids = (msg.events || []).map((e) => e.id);
      const validIds = FakeWorker.validIds === null ? ids : ids.filter((id) => FakeWorker.validIds.has(id));
      for (const fn of this.listeners.message) fn({ data: { id: msg.id, ok: true, validIds } });
    }, 0);
  }
  terminate() {
    FakeWorker.terminated += 1;
  }
}
FakeWorker.instances = [];
FakeWorker.validIds = null;
FakeWorker.silent = false;
FakeWorker.terminated = 0;

describe("signatureVerifyWorkerClient", () => {
  let verifyEventsInWorker;

  beforeEach(async () => {
    globalThis.Worker = FakeWorker;
    FakeWorker.instances = [];
    FakeWorker.validIds = null;
    FakeWorker.silent = false;
    FakeWorker.terminated = 0;
    // Fresh module each test so the singleton worker is rebuilt against FakeWorker.
    const mod = await import(`../../js/nostr/signatureVerifyWorkerClient.js?bust=${Math.random()}`);
    verifyEventsInWorker = mod.verifyEventsInWorker;
  });

  afterEach(() => {
    delete globalThis.Worker;
  });

  it("a hung worker must not hang the caller — it times out and falls back", async () => {
    FakeWorker.silent = true; // worker never responds
    const events = [{ id: "a".repeat(64) }, { id: "b".repeat(64) }];
    const started = Date.now();
    // Short timeout so the test is fast; the point is it RESOLVES, not hangs,
    // and disables the worker so the next batch doesn't pay the timeout again.
    const result = await verifyEventsInWorker(events, { timeoutMs: 80 });
    assert.ok(result instanceof Set, "must resolve to a Set, not hang");
    assert.ok(Date.now() - started < 2000, "must resolve promptly via fallback");
    assert.ok(FakeWorker.terminated >= 1, "hung worker should be terminated/disabled");

    // Subsequent call must skip the worker entirely (no new instance created).
    const before = FakeWorker.instances.length;
    await verifyEventsInWorker([{ id: "c".repeat(64) }], { timeoutMs: 80 });
    assert.equal(FakeWorker.instances.length, before, "worker stays disabled after a failure");
  });

  it("resolves with the set of ids the worker reports valid", async () => {
    const events = [
      { id: "a".repeat(64), sig: "x" },
      { id: "b".repeat(64), sig: "y" },
      { id: "c".repeat(64), sig: "z" },
    ];
    const valid = await verifyEventsInWorker(events);
    assert.ok(valid instanceof Set);
    assert.equal(valid.size, 3);
    assert.ok(valid.has("a".repeat(64)));
  });

  it("drops events the worker reports invalid", async () => {
    FakeWorker.validIds = new Set(["a".repeat(64)]); // only 'a' is valid
    const events = [
      { id: "a".repeat(64) },
      { id: "b".repeat(64) },
    ];
    const valid = await verifyEventsInWorker(events);
    assert.equal(valid.size, 1);
    assert.ok(valid.has("a".repeat(64)));
    assert.ok(!valid.has("b".repeat(64)));
  });

  it("returns an empty set for empty input without invoking a worker", async () => {
    const valid = await verifyEventsInWorker([]);
    assert.equal(valid.size, 0);
    assert.equal(FakeWorker.instances.length, 0, "must not construct a worker for empty input");
  });

  it("ignores events without ids", async () => {
    const valid = await verifyEventsInWorker([{ sig: "no-id" }, null, { id: "d".repeat(64) }]);
    assert.equal(valid.size, 1);
    assert.ok(valid.has("d".repeat(64)));
  });
});
