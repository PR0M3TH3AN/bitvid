// A watch-history snapshot must succeed when ANY relay accepts it — a large/flaky
// relay list always has rejectors, and reads take the newest copy per d-tag, so
// one accepting relay is durable. Requiring ALL relays made every removal report
// a false "watch-history-snapshot-failed" and stopped new watches from
// persisting. Only a zero-accept publish is a (retryable) failure.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createWatchHistoryManager } from "../js/nostr/watchHistory.js";

const ACTOR = "a".repeat(64);
const SESSION_KEY = "b".repeat(64);
const GOOD = "wss://good.relay";

function makeManager(acceptUrls) {
  const accepted = new Set(acceptUrls);
  const toolkit = {
    nip04: { encrypt: async (_p, _pub, txt) => `enc:${txt}` },
  };
  return createWatchHistoryManager({
    getActivePubkey: () => ACTOR,
    getSessionActor: () => ({ pubkey: ACTOR, privateKey: SESSION_KEY }),
    ensureSessionActor: async () => ACTOR,
    resolveActiveSigner: () => null,
    shouldRequestExtensionPermissions: () => false,
    signEventWithPrivateKey: (event) => ({ ...event, id: `id-${event.created_at}-${Math.random()}`, sig: "sig" }),
    ensureNostrTools: async () => toolkit,
    getCachedNostrTools: () => toolkit,
    getWriteRelays: () => [GOOD, "wss://bad1.relay", "wss://bad2.relay"],
    getRelayFallback: () => [GOOD],
    getPool: () => ({
      publish(urls) {
        const url = Array.isArray(urls) ? urls[0] : urls;
        const ok = accepted.has(url);
        return {
          on(name, handler) {
            if (ok && name === "ok") setTimeout(handler, 0);
            if (!ok && name === "failed") setTimeout(() => handler("rejected"), 0);
            return this;
          },
        };
      },
      async list() {
        return [];
      },
    }),
  });
}

test("a month accepted by only ONE of several relays is a success (not a false failure)", async () => {
  const manager = makeManager([GOOD]); // 1 of 3 relays accepts
  try {
    const result = await manager.publishRecords(
      { "2026-06": [{ type: "e", value: "watched-x", watchedAt: 1 }] },
      { actorPubkey: ACTOR },
    );
    assert.equal(result.ok, true, "partial acceptance must report success");
    assert.equal(result.retryable, false, "a partial accept is not retryable");
  } finally {
    manager.clear();
  }
});

test("a month rejected by ALL relays is a retryable failure", async () => {
  const manager = makeManager([]); // zero relays accept
  try {
    const result = await manager.publishRecords(
      { "2026-06": [{ type: "e", value: "watched-x", watchedAt: 1 }] },
      { actorPubkey: ACTOR },
    );
    assert.equal(result.ok, false, "zero acceptance is a failure");
    assert.equal(result.retryable, true, "a total failure should be retryable");
  } finally {
    manager.clear();
  }
});
