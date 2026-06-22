// A delete must reach every relay the video could have been published to.
//
// Bug (SCN-delete-reaches-write-relays): normal video publishes fan out to the
// (uncapped) WRITE relay set, but the soft-delete tombstone (revertVideo) and
// the NIP-09 deletion both published only to `this.relays` — the CAPPED read
// set (<=8). A video published broadly was therefore tombstoned on just a
// subset; relays outside that subset kept serving the original event and the
// "deleted" video resurrected on the next load.
//
// Observable outcome asserted at the boundary: the relay URLs passed to
// pool.publish() when a delete is published.

import assert from "node:assert/strict";
import test from "node:test";
import { NostrClient } from "../js/nostr/client.js";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = class MockWebSocket {};
}

const PK = "a".repeat(64);

function makeClient(writeRelays, readRelays) {
  const client = new NostrClient();
  client.writeRelays = writeRelays;
  client.relays = readRelays;

  const published = [];
  client.pool = {
    // nostr-tools SimplePool.publish(urls, event) returns one promise per url.
    publish: (urls) => {
      published.push(...urls);
      return urls.map(() => Promise.resolve("ok"));
    },
  };
  // Stub the signer path so the test is hermetic (no extension / network).
  client.ensureActiveSignerForPubkey = async () => {};
  client.signerManager = {
    resolveActiveSigner: () => ({
      signEvent: async (evt) => ({ ...evt, id: "signed-tombstone", sig: "sig" }),
    }),
  };
  return { client, published };
}

const ORIGINAL = {
  id: "orig-event-id",
  pubkey: PK,
  created_at: 1000,
  content: JSON.stringify({
    version: 3,
    deleted: false,
    title: "Doomed video",
    videoRootId: "root-1",
  }),
  tags: [["d", "video-d-tag"]],
};

test("getDeletePublishRelays prefers the full write set over the capped read set", () => {
  const writeRelays = ["wss://w1", "wss://w2", "wss://w3"];
  const { client } = makeClient(writeRelays, ["wss://w1"]);
  assert.deepEqual(
    client.getDeletePublishRelays().sort(),
    writeRelays.slice().sort(),
  );
});

test("getDeletePublishRelays falls back to the read set when there are no write relays", () => {
  const readRelays = ["wss://r1", "wss://r2"];
  const { client } = makeClient([], readRelays);
  assert.deepEqual(client.getDeletePublishRelays().sort(), readRelays.slice().sort());
});

test("a soft-delete tombstone publishes to the WHOLE write set, not just the capped read subset", async () => {
  const writeRelays = Array.from(
    { length: 12 },
    (_, i) => `wss://write-${i}.example.com`,
  );
  // The capped read set is a small subset — the bug published deletes here only.
  const readRelays = writeRelays.slice(0, 2);
  const { client, published } = makeClient(writeRelays, readRelays);

  await client.revertVideo(ORIGINAL, PK);

  for (const url of writeRelays) {
    assert.ok(
      published.includes(url),
      `tombstone must reach write relay ${url} so the delete propagates everywhere`,
    );
  }
  // It must reach more than just the 2-relay capped read subset.
  const distinct = new Set(published);
  assert.ok(
    distinct.size > readRelays.length,
    `delete must not be limited to the capped read subset (hit ${distinct.size} relays)`,
  );
});
