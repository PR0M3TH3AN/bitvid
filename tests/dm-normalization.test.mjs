import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import { NostrService } from "../js/services/nostrService.js";

const { indexedDB, IDBKeyRange } = await import("fake-indexeddb");

if (!globalThis.indexedDB) {
  globalThis.indexedDB = indexedDB;
  globalThis.IDBKeyRange = IDBKeyRange;
}

async function deleteDatabase(name) {
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

afterEach(async () => {
  await deleteDatabase("bitvidDm");
  await deleteDatabase("bitvidSettings");
});

test("direct message normalization hashes conversations consistently", async () => {
  const service = new NostrService({ logger: () => {} });
  const sender = "b".repeat(64);
  const receiver = "a".repeat(64);

  const incoming = {
    ok: true,
    direction: "incoming",
    plaintext: "Hello there",
    sender: { pubkey: sender },
    recipients: [{ pubkey: receiver }],
    event: {
      id: "event-incoming",
      created_at: 1_700_000_001,
      kind: 4,
      tags: [["p", receiver]],
      pubkey: sender,
    },
  };

  const outgoing = {
    ok: true,
    direction: "outgoing",
    plaintext: "Hello there",
    sender: { pubkey: sender },
    recipients: [{ pubkey: receiver }],
    event: {
      id: "event-outgoing",
      created_at: 1_700_000_002,
      kind: 4,
      tags: [["p", receiver]],
      pubkey: sender,
    },
  };

  const incomingRecord = await service.persistDirectMessageRecord(incoming, {
    actorPubkey: receiver,
  });
  const outgoingRecord = await service.persistDirectMessageRecord(outgoing, {
    actorPubkey: sender,
  });

  const expectedId = `dm:${[sender, receiver].sort().join(":")}`;

  assert.equal(incomingRecord.conversation_id, expectedId);
  assert.equal(outgoingRecord.conversation_id, expectedId);
});

test("direct message list dedupes entries by event id", async () => {
  const service = new NostrService({ logger: () => {} });
  const sender = "c".repeat(64);
  const receiver = "d".repeat(64);

  const baseMessage = {
    ok: true,
    direction: "incoming",
    actorPubkey: receiver,
    plaintext: "First payload",
    sender: { pubkey: sender },
    recipients: [{ pubkey: receiver }],
    event: {
      id: "event-dedupe",
      created_at: 1_700_000_010,
      kind: 4,
      tags: [["p", receiver]],
      pubkey: sender,
    },
  };

  service.applyDirectMessage(baseMessage, { reason: "initial" });

  service.applyDirectMessage(
    {
      ...baseMessage,
      plaintext: "Updated payload",
      preview: "Updated payload",
    },
    { reason: "duplicate" },
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  const messages = service.getDirectMessages();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].plaintext, "Updated payload");
});
