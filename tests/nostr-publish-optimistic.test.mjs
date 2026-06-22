// Scenario (SCN-publish-optimistic-flag):
//   publishEventToRelay optimistically reports success when a relay handle gives
//   no ok/failed/then signal (needed for legacy "seen"-only relays). Previously
//   such an UNCONFIRMED success was indistinguishable from a real relay ack, so
//   a note could show "Published" with nothing actually stored (audit #3).
//   Given a relay handle with no confirmation channel,
//   Then the result is success:true but flagged optimistic:true;
//   Given a relay that emits 'ok',
//   Then the result is success:true and optimistic:false (a real ack).

import test from "node:test";
import assert from "node:assert/strict";

import { publishEventToRelay } from "../js/nostrPublish.js";

const EVENT = { id: "evt", kind: 1, content: "x" };

test("unconfirmed publish (no ok/failed/then) is flagged optimistic", async () => {
  const pool = { publish: () => undefined }; // no handle at all
  const result = await publishEventToRelay(pool, "wss://relay.example", EVENT, {
    timeoutMs: 1000,
  });
  assert.equal(result.success, true, "still reports success for legacy relays");
  assert.equal(result.optimistic, true, "but marks it as unconfirmed");
});

test("a real 'ok' ack is NOT optimistic", async () => {
  const pool = {
    publish: () => ({
      on(ev, handler) {
        if (ev === "ok") setTimeout(() => handler(), 0);
      },
    }),
  };
  const result = await publishEventToRelay(pool, "wss://relay.example", EVENT, {
    timeoutMs: 1000,
  });
  assert.equal(result.success, true);
  assert.equal(result.optimistic, false, "confirmed ack must not be optimistic");
});

test("a thenable publish that resolves is a confirmed (non-optimistic) success", async () => {
  const pool = { publish: () => Promise.resolve() };
  const result = await publishEventToRelay(pool, "wss://relay.example", EVENT, {
    timeoutMs: 1000,
  });
  assert.equal(result.success, true);
  assert.equal(result.optimistic, false);
});
