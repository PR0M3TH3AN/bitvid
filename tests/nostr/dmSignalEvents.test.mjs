import { test, describe, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { ensureNostrTools } from "../../js/nostr/toolkit.js";
import "../test-helpers/setup-localstorage.mjs";

// Mock globals needed for nostr-tools or other libs
if (!globalThis.crypto) {
    globalThis.crypto = {
        getRandomValues: (arr) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        }
    };
}

function bytesToHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}

// Helper to generate 32-byte hex string
// Note: relies on global/closure tools if available, or just random bytes
function generateHexId(tools) {
    if (tools && typeof tools.generateSecretKey === 'function') {
        return bytesToHex(tools.generateSecretKey());
    }
    const bytes = new Uint8Array(32);
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        // Simple fallback for mock
        for(let i=0; i<32; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytesToHex(bytes);
}

describe("dmSignalEvents", () => {
  let nostrClient;
  let dmSignalEvents;
  let originalPool;
  let originalRelays;
  let originalPubkey;
  let originalSessionActor;
  let signer;
  let getActiveSigner;
  let tools;

  before(async () => {
    // Import modules
    tools = await ensureNostrTools();
    const facadeModule = await import("../../js/nostrClientFacade.js");
    const registryModule = await import("../../js/nostrClientRegistry.js");
    dmSignalEvents = await import("../../js/nostr/dmSignalEvents.js");

    nostrClient = facadeModule.nostrClient;
    getActiveSigner = registryModule.getActiveSigner;

    // Generate keys
    const secret = tools.generateSecretKey();
    const privateKey = bytesToHex(secret);
    const pubkey = tools.getPublicKey(secret);

    // Register signer to ensure getActiveSigner returns something
    await nostrClient.registerPrivateKeySigner({ privateKey, pubkey });
    signer = getActiveSigner();
  });

  beforeEach(() => {
    originalPool = nostrClient.pool;
    originalRelays = nostrClient.relays;
    originalPubkey = nostrClient.pubkey;
    originalSessionActor = nostrClient.sessionActor;

    // Mock pool
    nostrClient.pool = {
      publish: mock.fn((urls, event) => {
        return {
          on: (event, cb) => {
            if (event === 'ok') setTimeout(cb, 0);
          }
        };
      })
    };

    nostrClient.relays = ["wss://relay.mock"];
    nostrClient.writeRelays = ["wss://relay.mock"];

    // Ensure we are logged in
    nostrClient.pubkey = signer.pubkey;

    // Ensure we are NOT a session actor (which blocks signals)
    nostrClient.sessionActor = null;

    // Mock signEvent on the signer
    // We keep the original signer object but replace the method
    signer.signEvent = mock.fn(async (evt) => ({ ...evt, sig: "mock-sig", id: "mock-id" }));
  });

  afterEach(() => {
    nostrClient.pool = originalPool;
    nostrClient.relays = originalRelays;
    nostrClient.pubkey = originalPubkey;
    nostrClient.sessionActor = originalSessionActor;
    mock.reset();
  });

  test("publishDmReadReceipt should succeed", async () => {
    const eventId = generateHexId(tools);
    const recipientPubkey = generateHexId(tools);
    const payload = {
      eventId,
      recipientPubkey,
      messageKind: 4
    };

    const result = await dmSignalEvents.publishDmReadReceipt(nostrClient, payload);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(signer.signEvent.mock.callCount(), 1);
    assert.strictEqual(nostrClient.pool.publish.mock.callCount(), 1);

    const signedEvent = result.event;
    // Check tags
    const tags = signedEvent.tags;
    assert.ok(tags.find(t => t[0] === "e" && t[1] === eventId));
    assert.ok(tags.find(t => t[0] === "p" && t[1] === recipientPubkey));
    // Check 'k' tag for messageKind
    assert.ok(tags.find(t => t[0] === "k" && t[1] === "4"));

    assert.strictEqual(signedEvent.content, "");
  });

  test("publishDmReadReceipt should fail if session actor", async () => {
    // Set sessionActor to look like the current user
    nostrClient.sessionActor = { pubkey: nostrClient.pubkey };

    const payload = {
        eventId: generateHexId(tools),
        recipientPubkey: generateHexId(tools),
        messageKind: 4
    };

    const result = await dmSignalEvents.publishDmReadReceipt(nostrClient, payload);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, "session-actor-publish-blocked");
  });

  test("publishDmTypingIndicator should succeed", async () => {
    const recipientPubkey = generateHexId(tools);
    const conversationEventId = generateHexId(tools);
    const payload = {
        recipientPubkey,
        conversationEventId
    };

    const result = await dmSignalEvents.publishDmTypingIndicator(nostrClient, payload);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(signer.signEvent.mock.callCount(), 1);

    const signedEvent = result.event;
    // Check tags
    assert.ok(signedEvent.tags.find(t => t[0] === "p" && t[1] === recipientPubkey));
    assert.ok(signedEvent.tags.find(t => t[0] === "e" && t[1] === conversationEventId));
  });

  test("should fail if no signer", async () => {
    // Temporarily break signer
    const originalSignEvent = signer.signEvent;
    signer.signEvent = undefined;

    const payload = { eventId: generateHexId(tools), recipientPubkey: generateHexId(tools) };
    const result = await dmSignalEvents.publishDmReadReceipt(nostrClient, payload);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, "auth-required");

    signer.signEvent = originalSignEvent;
  });
});
