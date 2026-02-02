// Run with: node scripts/run-targeted-tests.mjs tests/nostr/sign-request-queue.test.mjs

import assert from "node:assert/strict";
import test from "node:test";
import { queueSignEvent } from "../../js/nostr/signRequestQueue.js";

// Helper to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("queueSignEvent: processes requests sequentially", async () => {
  const executionOrder = [];
  const signer = {
    signEvent: async (event) => {
      executionOrder.push(`start:${event.id}`);
      await delay(50);
      executionOrder.push(`end:${event.id}`);
      return { ...event, sig: "signature" };
    },
  };

  const event1 = { id: "1", pubkey: "abc" };
  const event2 = { id: "2", pubkey: "abc" };

  const p1 = queueSignEvent(signer, event1);
  const p2 = queueSignEvent(signer, event2);

  await Promise.all([p1, p2]);

  assert.deepEqual(executionOrder, [
    "start:1",
    "end:1",
    "start:2",
    "end:2",
  ]);
});

test("queueSignEvent: handles timeouts", async () => {
  const signer = {
    signEvent: async () => {
      await delay(100);
      return { sig: "slow" };
    },
  };

  const event = { id: "timeout", pubkey: "abc" };

  await assert.rejects(
    () => queueSignEvent(signer, event, { timeoutMs: 20 }),
    (err) => {
      assert.equal(err.code, "timeout");
      return true;
    }
  );
});

test("queueSignEvent: handles permission denied errors", async () => {
  const signer = {
    signEvent: async () => {
      const err = new Error("User rejected");
      err.message = "The user denied the permission";
      throw err;
    },
  };

  const event = { id: "denied", pubkey: "abc" };

  await assert.rejects(
    () => queueSignEvent(signer, event),
    (err) => {
      assert.equal(err.code, "permission-denied");
      return true;
    }
  );
});

test("queueSignEvent: handles signer disconnected", async () => {
  const signer = {
    signEvent: async () => {
      throw new Error("Extension disconnected");
    },
  };

  const event = { id: "disconnect", pubkey: "abc" };

  await assert.rejects(
    () => queueSignEvent(signer, event),
    (err) => {
      assert.equal(err.code, "signer-disconnected");
      return true;
    }
  );
});

test("queueSignEvent: fails if signer is missing or invalid", async () => {
  await assert.rejects(
    () => queueSignEvent(null, {}),
    (err) => err.code === "not-capable"
  );

  await assert.rejects(
    () => queueSignEvent({}, {}),
    (err) => err.code === "not-capable"
  );
});

test("queueSignEvent: continues queue processing after failure", async () => {
  const signer = {
    signEvent: async (event) => {
      if (event.id === "fail") {
        throw new Error("fail");
      }
      return { ...event, sig: "ok" };
    },
  };

  const p1 = queueSignEvent(signer, { id: "fail" }).catch(() => "caught");
  const p2 = queueSignEvent(signer, { id: "success" });

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res1, "caught");
  assert.equal(res2.sig, "ok");
});
