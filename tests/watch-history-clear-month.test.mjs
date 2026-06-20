// Clearing a month (removing its last item) must publish an EMPTY replaceable
// event for that month's d-tag, so the newest copy on relays has no items and the
// removed items don't linger. publishMonthRecord used to early-return on an empty
// month, so the clear silently did nothing and the old items stayed live.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createWatchHistoryManager } from "../js/nostr/watchHistory.js";

function makeManager(publishCalls) {
  const actorPubkey = "d".repeat(64);
  const sessionPrivateKey = "e".repeat(64);
  const toolkit = {
    nip04: { encrypt: async (_priv, _pub, plaintext) => `enc:${plaintext}` },
  };
  const manager = createWatchHistoryManager({
    getActivePubkey: () => actorPubkey,
    getSessionActor: () => ({ pubkey: actorPubkey, privateKey: sessionPrivateKey }),
    ensureSessionActor: async () => actorPubkey,
    resolveActiveSigner: () => null,
    shouldRequestExtensionPermissions: () => false,
    ensureExtensionPermissions: async () => ({ ok: true }),
    ensureNostrTools: async () => toolkit,
    getCachedNostrTools: () => toolkit,
    signEventWithPrivateKey: (event) => ({
      ...event,
      id: `id-${event.created_at}`,
      sig: "sig",
    }),
    getWriteRelays: () => ["wss://relay.test"],
    getRelayFallback: () => ["wss://relay.test"],
    getPool: () => ({
      publish(urls, event) {
        publishCalls.push({ urls, event });
        return {
          on(name, handler) {
            if (name === "ok") {
              setTimeout(handler, 0);
            }
            return this;
          },
        };
      },
      async list() {
        return [];
      },
    }),
  });
  return { manager, actorPubkey };
}

test("an emptied month still publishes a clearing event with the right d-tag and no pointers", async () => {
  const publishCalls = [];
  const { manager, actorPubkey } = makeManager(publishCalls);
  try {
    const result = await manager.publishRecords(
      { "2026-06": [] },
      { actorPubkey },
    );
    assert.equal(result.ok, true, "the clearing publish should report ok");
    assert.equal(
      publishCalls.length,
      1,
      "an empty month MUST still publish a (clearing) event — not be skipped",
    );
    const ev = publishCalls[0].event;
    const dTag = ev.tags.find((t) => t[0] === "d");
    assert.equal(dTag?.[1], "2026-06", "clears the correct month address");
    const pointerTags = ev.tags.filter((t) => t[0] === "e" || t[0] === "a");
    assert.equal(pointerTags.length, 0, "the clearing event carries no pointer tags");
  } finally {
    manager.clear();
  }
});

test("a month that still has items publishes its remaining pointers", async () => {
  const publishCalls = [];
  const { manager, actorPubkey } = makeManager(publishCalls);
  try {
    await manager.publishRecords(
      { "2026-06": [{ type: "e", value: "keep-1", watchedAt: 5 }] },
      { actorPubkey },
    );
    assert.equal(publishCalls.length, 1);
    const pointerTags = publishCalls[0].event.tags.filter(
      (t) => t[0] === "e" || t[0] === "a",
    );
    assert.equal(pointerTags.length, 1, "the surviving pointer is published");
    assert.equal(pointerTags[0][1], "keep-1");
  } finally {
    manager.clear();
  }
});
