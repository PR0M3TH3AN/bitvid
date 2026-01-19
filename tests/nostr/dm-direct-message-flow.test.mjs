import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import { NostrClient, clearActiveSigner, setActiveSigner } from "../../js/nostr/client.js";
import { NostrService } from "../../js/services/nostrService.js";
import { listMessagesByConversation } from "../../js/storage/dmDb.js";

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
  clearActiveSigner();
});

class FakeRelayPool {
  constructor() {
    this.subscriptions = new Set();
    this.queue = [];
    this.published = [];
  }

  publish(urls, event) {
    this.queue.push(event);
    this.published.push(event);
    return {
      on(eventName, handler) {
        if (eventName === "ok") {
          setTimeout(() => handler(), 0);
        }
        return true;
      },
    };
  }

  list() {
    return Promise.resolve([]);
  }

  sub() {
    const handlers = new Map();
    const subscription = {
      on(eventName, handler) {
        handlers.set(eventName, handler);
      },
      emit(eventName, payload) {
        const handler = handlers.get(eventName);
        if (handler) {
          handler(payload);
        }
      },
      unsub: () => {
        this.subscriptions.delete(subscription);
      },
    };

    this.subscriptions.add(subscription);
    return subscription;
  }

  flushQueue({ duplicate = false } = {}) {
    const batch = [...this.queue];
    this.queue = [];
    batch.forEach((event) => {
      this.deliver(event);
      if (duplicate) {
        this.deliver(event);
      }
    });
  }

  deliver(event) {
    for (const subscription of this.subscriptions) {
      subscription.emit("event", event);
    }
  }
}

async function configureNostrTools() {
  const previousCanonical = globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
  const previousNostrTools = globalThis.NostrTools;
  const previousReady = globalThis.nostrToolsReady;

  const nostrTools = await import("nostr-tools");

  globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = nostrTools;
  globalThis.NostrTools = nostrTools;
  globalThis.nostrToolsReady = Promise.resolve({ ok: true, value: nostrTools });

  const restore = () => {
    if (previousCanonical === undefined) {
      delete globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__;
    } else {
      globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = previousCanonical;
    }

    if (previousNostrTools === undefined) {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousNostrTools;
    }

    if (previousReady === undefined) {
      delete globalThis.nostrToolsReady;
    } else {
      globalThis.nostrToolsReady = previousReady;
    }
  };

  return { nostrTools, restore };
}

async function setupDmScenario() {
  const { nostrTools, restore } = await configureNostrTools();
  const senderSecret = nostrTools.generateSecretKey();
  const receiverSecret = nostrTools.generateSecretKey();
  const senderPrivateKey = nostrTools.utils.bytesToHex(senderSecret);
  const receiverPrivateKey = nostrTools.utils.bytesToHex(receiverSecret);

  const senderPubkey = nostrTools.getPublicKey(senderPrivateKey);
  const receiverPubkey = nostrTools.getPublicKey(receiverPrivateKey);

  const createSigner = (privateKey, pubkey) => ({
    type: "test",
    pubkey,
    signEvent: (event) => {
      const finalized = nostrTools.finalizeEvent(event, privateKey);
      return { ...event, id: finalized.id, sig: finalized.sig };
    },
    nip04Encrypt: (target, plaintext) =>
      nostrTools.nip04.encrypt(privateKey, target, plaintext),
    nip04Decrypt: (target, ciphertext) =>
      nostrTools.nip04.decrypt(privateKey, target, ciphertext),
  });

  const senderSigner = createSigner(senderPrivateKey, senderPubkey);
  const receiverSigner = createSigner(receiverPrivateKey, receiverPubkey);

  const relayPool = new FakeRelayPool();

  const senderClient = new NostrClient();
  senderClient.pool = relayPool;
  senderClient.relays = ["wss://relay.unit.test"];
  senderClient.readRelays = [];
  senderClient.writeRelays = [];
  senderClient.pubkey = senderPubkey;

  const receiverClient = new NostrClient();
  receiverClient.pool = relayPool;
  receiverClient.relays = ["wss://relay.unit.test"];
  receiverClient.readRelays = [];
  receiverClient.writeRelays = [];
  receiverClient.pubkey = receiverPubkey;

  const receiverService = new NostrService({ logger: () => {} });
  receiverService.nostrClient = receiverClient;

  return {
    nostrTools,
    restore,
    senderSigner,
    receiverSigner,
    senderPubkey,
    receiverPubkey,
    relayPool,
    senderClient,
    receiverClient,
    receiverService,
  };
}

test("DM relay duplication is deduped", async () => {
  const {
    nostrTools,
    restore,
    senderSigner,
    receiverSigner,
    receiverPubkey,
    relayPool,
    senderClient,
    receiverClient,
    receiverService,
  } = await setupDmScenario();

  try {
    const notifications = [];
    receiverService.on("directMessages:notification", (payload) => {
      notifications.push(payload);
    });

    const received = [];
    const subscription = receiverClient.subscribeDirectMessages(receiverPubkey, {
      onMessage: (message, { event }) => {
        received.push(message);
        receiverService.applyDirectMessage(
          { ...message, actorPubkey: receiverPubkey },
          { reason: "subscription", event },
        );
      },
    });

    setActiveSigner(senderSigner);
    const sendResult = await senderClient.sendDirectMessage(
      nostrTools.nip19.npubEncode(receiverPubkey),
      "Hello from sender",
    );

    assert.equal(sendResult.ok, true);

    setActiveSigner(receiverSigner);
    relayPool.flushQueue({ duplicate: true });

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(received.length, 1, "duplicate relay events should be deduped");
    assert.equal(notifications.length, 1, "incoming messages should notify once");

    subscription.unsub();
  } finally {
    restore();
  }
});

test("out-of-order DM delivery keeps newest messages first", async () => {
  const {
    nostrTools,
    restore,
    senderSigner,
    receiverSigner,
    receiverPubkey,
    relayPool,
    senderClient,
    receiverClient,
    receiverService,
  } = await setupDmScenario();

  try {
    setActiveSigner(receiverSigner);
    receiverClient.subscribeDirectMessages(receiverPubkey, {
      onMessage: (message, { event }) => {
        receiverService.applyDirectMessage(
          { ...message, actorPubkey: receiverPubkey },
          { reason: "subscription", event },
        );
      },
    });

    setActiveSigner(senderSigner);
    const firstSend = await senderClient.sendDirectMessage(
      nostrTools.nip19.npubEncode(receiverPubkey),
      "First message",
    );
    const secondSend = await senderClient.sendDirectMessage(
      nostrTools.nip19.npubEncode(receiverPubkey),
      "Second message",
    );

    assert.equal(firstSend.ok, true);
    assert.equal(secondSend.ok, true);

    relayPool.queue[0].created_at = 100;
    relayPool.queue[1].created_at = 200;

    setActiveSigner(receiverSigner);
    relayPool.deliver(relayPool.queue[1]);
    relayPool.deliver(relayPool.queue[0]);
    relayPool.queue = [];

    await new Promise((resolve) => setTimeout(resolve, 10));

    const messages = receiverService.getDirectMessages();
    assert.equal(messages.length, 2, "two DM messages should be present");
    assert.equal(messages[0].plaintext, "Second message");
    assert.equal(messages[1].plaintext, "First message");
  } finally {
    restore();
  }
});

test("DM reconnect replays do not duplicate messages or reset seen state", async () => {
  const {
    nostrTools,
    restore,
    senderSigner,
    receiverSigner,
    senderPubkey,
    receiverPubkey,
    relayPool,
    senderClient,
    receiverClient,
    receiverService,
  } = await setupDmScenario();

  try {
    const notifications = [];
    receiverService.on("directMessages:notification", (payload) => {
      notifications.push(payload);
    });

    const received = [];
    let subscription = null;
    const subscribe = () => {
      subscription = receiverClient.subscribeDirectMessages(receiverPubkey, {
        onMessage: (message, { event }) => {
          received.push(message);
          receiverService.applyDirectMessage(
            { ...message, actorPubkey: receiverPubkey },
            { reason: "subscription", event },
          );
        },
      });
    };

    setActiveSigner(receiverSigner);
    subscribe();

    setActiveSigner(senderSigner);
    const sendResult = await senderClient.sendDirectMessage(
      nostrTools.nip19.npubEncode(receiverPubkey),
      "Hello from sender",
    );

    assert.equal(sendResult.ok, true);

    setActiveSigner(receiverSigner);
    relayPool.flushQueue();

    await new Promise((resolve) => setTimeout(resolve, 10));

    const conversationId = `dm:${[senderPubkey, receiverPubkey].sort().join(":")}`;
    assert.equal(receiverService.getDirectMessageUnseenCount(conversationId), 1);

    const stored = await listMessagesByConversation(conversationId);
    assert.equal(stored.length, 1, "message should persist in the DM store");

    await receiverService.acknowledgeRenderedDirectMessages(
      conversationId,
      received[0].timestamp || stored[0].created_at,
    );

    assert.equal(receiverService.getDirectMessageUnseenCount(conversationId), 0);

    subscription.unsub();
    subscribe();

    relayPool.deliver(relayPool.published[0]);

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(
      receiverService.getDirectMessages().length,
      1,
      "reconnection deliveries should not duplicate messages",
    );
    assert.equal(
      receiverService.getDirectMessageUnseenCount(conversationId),
      0,
      "replayed events should not reset seen state",
    );
    assert.equal(notifications.length, 1, "replays should not trigger notifications");
  } finally {
    restore();
  }
});
