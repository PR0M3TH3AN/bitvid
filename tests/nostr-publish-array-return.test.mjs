// nostr-tools SimplePool.publish(relays, event) returns an ARRAY of per-relay
// promises. publishEventToRelay must consume them: a relay that rejects
// ("blocked", "auth-required", "publish timed out", websocket error, …) must be
// turned into a {success:false} result, NOT leak as an unhandled promise
// rejection. With a large/flaky relay list, leaked rejections flood the event
// loop and can freeze the tab (observed when republishing a 35-relay list).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { publishEventToRelay } from "../js/nostrPublish.js";

const EVENT = { id: "e1", kind: 1, content: "hi" };

// A pool whose publish() returns an array of promises, like nostr-tools 2.17.
function arrayReturningPool(makePromise) {
  return {
    publish(urls) {
      return urls.map(() => makePromise());
    },
  };
}

test("a rejecting array-promise becomes a failure result (no unhandled rejection)", async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const pool = arrayReturningPool(() =>
      Promise.reject(new Error("blocked: pubkey is not allowed to publish")),
    );

    const result = await publishEventToRelay(pool, "wss://relay.example", EVENT);

    assert.equal(result.success, false, "a rejecting publish is a failure result");
    assert.equal(result.url, "wss://relay.example");
    assert.ok(result.error, "the rejection reason is captured on the result");

    // Let any leaked microtask rejections surface before asserting.
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      unhandled.length,
      0,
      `no unhandled rejections should leak (saw ${unhandled.length})`,
    );
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("a fulfilling array-promise becomes a success result", async () => {
  const pool = arrayReturningPool(() => Promise.resolve("ok"));
  const result = await publishEventToRelay(pool, "wss://relay.example", EVENT);
  assert.equal(result.success, true);
  assert.equal(result.url, "wss://relay.example");
});

test("all-rejecting publish still resolves (does not hang) with a failure", async () => {
  const pool = arrayReturningPool(() => Promise.reject(new Error("auth-required")));
  const result = await publishEventToRelay(pool, "wss://relay.example", EVENT, {
    timeoutMs: 2000,
  });
  assert.equal(result.success, false);
});
