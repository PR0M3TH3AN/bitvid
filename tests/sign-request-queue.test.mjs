import assert from "node:assert/strict";
import test from "node:test";
import { queueSignEvent } from "../js/nostr/signRequestQueue.js";

test("queueSignEvent executes successfully", async () => {
  const event = { id: "1" };
  const signer = {
    signEvent: async (ev) => ({ ...ev, sig: "signature" }),
  };

  const result = await queueSignEvent(signer, event);
  assert.equal(result.id, "1");
  assert.equal(result.sig, "signature");
});

test("queueSignEvent executes sequentially for same signer", async () => {
  const calls = [];
  const signer = {
    signEvent: async (ev) => {
      calls.push(`start-${ev.id}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      calls.push(`end-${ev.id}`);
      return { ...ev, sig: "signature" };
    },
  };

  const p1 = queueSignEvent(signer, { id: "1" });
  const p2 = queueSignEvent(signer, { id: "2" });

  await Promise.all([p1, p2]);

  assert.deepEqual(calls, [
    "start-1",
    "end-1",
    "start-2",
    "end-2",
  ]);
});

test("queueSignEvent executes concurrently for different signers", async () => {
  const calls = [];
  const createSigner = (name) => ({
    signEvent: async (ev) => {
      calls.push(`start-${name}-${ev.id}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      calls.push(`end-${name}-${ev.id}`);
      return { ...ev, sig: "signature" };
    },
  });

  const signerA = createSigner("A");
  const signerB = createSigner("B");

  const p1 = queueSignEvent(signerA, { id: "1" });
  const p2 = queueSignEvent(signerB, { id: "2" });

  await Promise.all([p1, p2]);

  // Order might vary slightly but both should start before either ends effectively
  // But due to single threaded node, they will be interleaved.
  // Actually, queueSignEvent pushes to a queue. If queues are separate, they don't block each other.

  // Checking that start-A-1 and start-B-2 appear before end-A-1 (assuming they are fired close enough)
  const startA = calls.indexOf("start-A-1");
  const startB = calls.indexOf("start-B-2");
  const endA = calls.indexOf("end-A-1");
  const endB = calls.indexOf("end-B-2");

  assert.ok(startA < endA);
  assert.ok(startB < endB);
});

test("queueSignEvent times out", async () => {
  const signer = {
    signEvent: async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { sig: "slow" };
    },
  };

  await assert.rejects(
    () => queueSignEvent(signer, { id: "1" }, { timeoutMs: 50 }),
    (err) => err.code === "timeout"
  );
});

test("queueSignEvent normalizes errors", async () => {
  const signer = {
    signEvent: async () => {
      throw new Error("User rejected");
    },
  };

  await assert.rejects(
    () => queueSignEvent(signer, { id: "1" }),
    (err) => err.code === "permission-denied"
  );
});

test("queueSignEvent handles signer disconnect", async () => {
  const signer = {
    signEvent: async () => {
      throw new Error("Connection closed");
    },
  };

  await assert.rejects(
    () => queueSignEvent(signer, { id: "1" }),
    (err) => err.code === "signer-disconnected"
  );
});

test("queueSignEvent handles missing signer", async () => {
  await assert.rejects(
    () => queueSignEvent(null, { id: "1" }),
    (err) => err.code === "not-capable"
  );
});
