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
    // Respond asynchronously, echoing as valid only the ids in FakeWorker.validIds
    // (or all ids if validIds is null), to mimic real verification.
    setTimeout(() => {
      const ids = (msg.events || []).map((e) => e.id);
      const validIds = FakeWorker.validIds === null ? ids : ids.filter((id) => FakeWorker.validIds.has(id));
      for (const fn of this.listeners.message) fn({ data: { id: msg.id, ok: true, validIds } });
    }, 0);
  }
  terminate() {}
}
FakeWorker.instances = [];
FakeWorker.validIds = null;

describe("signatureVerifyWorkerClient", () => {
  let verifyEventsInWorker;

  beforeEach(async () => {
    globalThis.Worker = FakeWorker;
    FakeWorker.instances = [];
    FakeWorker.validIds = null;
    // Fresh module each test so the singleton worker is rebuilt against FakeWorker.
    const mod = await import(`../../js/nostr/signatureVerifyWorkerClient.js?bust=${Math.random()}`);
    verifyEventsInWorker = mod.verifyEventsInWorker;
  });

  afterEach(() => {
    delete globalThis.Worker;
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
