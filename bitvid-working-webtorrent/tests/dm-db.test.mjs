import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import {
  getConversation,
  listMessagesByConversation,
  updateConversationFromMessage,
  writeMessages,
} from "../js/storage/dmDb.js";

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
});

test("writeMessages normalizes records before storing", async () => {
  const conversationId = "dm:abcd:efgh";
  const result = await writeMessages({
    id: "message-1",
    conversationId: ` ${conversationId} `,
    senderPubkey: "SENDERPUBKEY",
    receiverPubkey: "RECEIVERPUBKEY",
    createdAt: 1_700_000_500,
    kind: 4,
    content: "Hello",
    tags: [["p", "RECEIVERPUBKEY"]],
    status: "published",
    seen: true,
    encryptionScheme: "nip04",
  });

  assert.equal(result.length, 1);

  const stored = await listMessagesByConversation(conversationId);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].conversation_id, conversationId);
  assert.equal(stored[0].sender_pubkey, "senderpubkey");
  assert.equal(stored[0].receiver_pubkey, "receiverpubkey");
  assert.equal(stored[0].status, "published");
  assert.equal(stored[0].seen, true);
  assert.equal(stored[0].encryption_scheme, "nip04");
});

test("updateConversationFromMessage persists metadata updates", async () => {
  const conversationId = "dm:meta:updates";
  const message = {
    id: "message-2",
    conversation_id: conversationId,
    sender_pubkey: "sender",
    receiver_pubkey: "receiver",
    created_at: 1_700_000_510,
    kind: 4,
    content: "Preview payload",
    seen: false,
  };

  const updated = await updateConversationFromMessage(message, {
    preview: "Preview payload",
    unseenDelta: 1,
    downloadedUntil: 1_700_000_510,
  });

  assert.ok(updated);
  assert.equal(updated.conversation_id, conversationId);
  assert.equal(updated.last_message_preview, "Preview payload");
  assert.equal(updated.unseen_count, 1);

  const stored = await getConversation(conversationId);
  assert.ok(stored);
  assert.equal(stored.conversation_id, conversationId);
  assert.equal(stored.last_message_preview, "Preview payload");
  assert.equal(stored.unseen_count, 1);
});
