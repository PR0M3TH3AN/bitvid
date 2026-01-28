import './setup-test-env.js';
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { WebSocket } from 'ws';
import * as NostrTools from 'nostr-tools';
import { webcrypto } from 'node:crypto';

// --- Polyfills ---
if (!global.indexedDB) {
  global.indexedDB = indexedDB;
}
if (!global.IDBKeyRange) {
  global.IDBKeyRange = IDBKeyRange;
}
if (!global.NostrTools) {
  global.NostrTools = NostrTools;
}
// Ensure crypto is available globally for NostrClient (it might be used in some paths)
if (!global.crypto) {
    global.crypto = webcrypto;
}

// --- Imports from Codebase ---
import { NostrClient } from '../../js/nostr/client.js';
import {
  buildVideoPostEvent,
  buildViewEvent
} from '../../js/nostrEventSchemas.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import { bytesToHex } from '../../vendor/crypto-helpers.bundle.min.js';

// --- Configuration ---
const TEST_RELAYS = ["wss://relay.damus.io", "wss://nos.lol"];
const TIMEOUT_MS = 15000;

async function waitForEvent(pool, relays, id, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const event = await pool.get(relays, { ids: [id] });
            if (event) return event;
        } catch (e) {
            // ignore network errors during polling
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return null;
}

async function run() {
  console.log("Starting Interop Test...");
  console.log(`Relays: ${TEST_RELAYS.join(', ')}`);

  // 1. Setup Client
  const client = new NostrClient();
  client.relays = [...TEST_RELAYS];
  client.readRelays = [...TEST_RELAYS];
  client.writeRelays = [...TEST_RELAYS];

  try {
    // 2. Init (connects to relays)
    await client.init();
    console.log("Client initialized.");

    // 3. Generate Ephemeral Keys (Sender)
    console.log("Generating ephemeral keys...");
    const sk = NostrTools.generateSecretKey();
    const skHex = bytesToHex(sk);
    const pk = NostrTools.getPublicKey(sk);
    console.log(`Ephemeral Sender Pubkey: ${pk}`);

    // 4. Register Signer
    await client.registerPrivateKeySigner({ privateKey: skHex, pubkey: pk });
    // Manually set pubkey as registerPrivateKeySigner doesn't always set client.pubkey depending on implementation details in some versions,
    // though the code read showed it sets sessionActor. client.pubkey is usually set on login.
    // The client.registerPrivateKeySigner implementation sets sessionActor but assumes the user calls init or similar to set client.pubkey if full login is desired?
    // Looking at NostrClient.js, registerPrivateKeySigner does NOT set this.pubkey. It sets sessionActor.
    // So we manually set it to simulate "logged in" state for high-level methods.
    client.pubkey = pk;
    console.log("Signer registered.");

    // 5. Test A: Video Post
    console.log("\n[Test A] Publishing VIDEO_POST...");
    const rootId = `test-root-${Date.now()}`;
    const videoEvent = buildVideoPostEvent({
      pubkey: pk,
      created_at: Math.floor(Date.now() / 1000),
      dTagValue: `interop-test-${Date.now()}`,
      content: {
        version: 3,
        title: "Interop Test Video",
        description: "Automated interop test video from Bitvid agent",
        videoRootId: rootId,
        url: "https://example.com/video.mp4",
        mimeType: "video/mp4",
        mode: "live",
        deleted: false,
        magnet: `magnet:?xt=urn:btih:${Math.random().toString(16).slice(2)}`, // Add magnet as per schema requirements usually
      },
      // 's' tag is recommended for storage pointer
      additionalTags: [['s', `url:https://example.com/video.mp4`]]
    });

    const publishResult = await client.signAndPublishEvent(videoEvent);
    const publishedEvent = publishResult.signedEvent;

    if (!publishedEvent || !publishedEvent.id) {
        throw new Error("Publishing failed, no event returned");
    }

    console.log(`Published Video Event ID: ${publishedEvent.id}`);

    // Verify
    console.log("Verifying Video Post (fetch by ID)...");
    const rawRelayEvent = await waitForEvent(client.pool, TEST_RELAYS, publishedEvent.id, TIMEOUT_MS);

    if (!rawRelayEvent) throw new Error("Failed to fetch published video event from relays");
    if (rawRelayEvent.id !== publishedEvent.id) throw new Error("Fetched event ID mismatch");
    console.log("Video Post Verified (Roundtrip).");

    // 6. Test B: View Event
    console.log("\n[Test B] Publishing VIEW_EVENT...");
    const viewEvent = buildViewEvent({
      pubkey: pk,
      created_at: Math.floor(Date.now() / 1000),
      pointerValue: publishedEvent.id,
      pointerTag: ['e', publishedEvent.id],
      content: "Interop test view"
    });

    const viewPublishResult = await client.signAndPublishEvent(viewEvent);
    const viewEventId = viewPublishResult.signedEvent.id;
    console.log(`Published View Event ID: ${viewEventId}`);

    // Ensure it is visible to subscriber clients (simulate).
    const rawViewEvent = await waitForEvent(client.pool, TEST_RELAYS, viewEventId, TIMEOUT_MS);
    if (!rawViewEvent) throw new Error("Failed to fetch published view event");
    console.log("View Event Verified.");

    // 7. Test C: Direct Message
    console.log("\n[Test C] Testing Direct Message...");

    // Generate Recipient
    const recipientSk = NostrTools.generateSecretKey();
    const recipientSkHex = bytesToHex(recipientSk);
    const recipientPk = NostrTools.getPublicKey(recipientSk);
    const recipientNpub = NostrTools.nip19.npubEncode(recipientPk);
    console.log(`Recipient Pubkey: ${recipientPk}`);

    const msg = `Test DM ${Date.now()}`;
    console.log(`Sending DM to recipient (${recipientNpub})...`);

    // We send using the client (Sender)
    const dmResult = await client.sendDirectMessage(recipientNpub, msg);

    if (!dmResult.ok) throw new Error(`DM Send failed: ${dmResult.error}`);
    console.log("DM Sent.");

    // Fetch the raw DM event from relays (Recipient perspective)
    console.log("Fetching DM event from relays...");

    // Filter for DMs to recipient
    const filter = {
        kinds: [4, 1059], // 4 (legacy) or 1059 (nip17)
        '#p': [recipientPk],
        limit: 1,
        since: Math.floor(Date.now() / 1000) - 60 // last 60 seconds
    };

    // Wait for propagation
    await new Promise(r => setTimeout(r, 2000));

    let events = [];
    const fetchStart = Date.now();
    while (Date.now() - fetchStart < TIMEOUT_MS) {
        events = await client.pool.list(TEST_RELAYS, [filter]);
        if (events.length > 0) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (events.length === 0) {
        throw new Error("Failed to find sent DM on relays.");
    }

    const dmEvent = events[0];
    console.log(`Found DM Event (Kind ${dmEvent.kind}, ID: ${dmEvent.id})`);

    // Decrypt using decryptDM helper and Recipient Keys
    console.log("Attempting decryption using decryptDM helper...");

    const decryptors = [];
    // NIP-04 Decryptor
    decryptors.push({
        scheme: 'nip04',
        decrypt: async (remotePubkey, ciphertext) => {
            return await NostrTools.nip04.decrypt(recipientSkHex, remotePubkey, ciphertext);
        }
    });
    // NIP-44 Decryptor
    decryptors.push({
        scheme: 'nip44',
        supportsGiftWrap: true,
        decrypt: (remotePubkey, ciphertext) => {
             const conversationKey = NostrTools.nip44.v2.utils.getConversationKey(recipientSk, remotePubkey);
             return NostrTools.nip44.v2.decrypt(ciphertext, conversationKey);
        }
    });

    const context = {
        actorPubkey: recipientPk,
        decryptors
    };

    const decryptResult = await decryptDM(dmEvent, context);

    if (!decryptResult.ok) {
        console.error("Decryption errors:", decryptResult.errors);
        throw new Error("DM decryption failed");
    }

    if (decryptResult.plaintext !== msg) {
        throw new Error(`DM plaintext mismatch. Expected "${msg}", got "${decryptResult.plaintext}"`);
    }
    console.log("DM Verified (Decryption successful).");

    console.log("\nAll Interop Tests Passed!");
    process.exit(0);

  } catch (error) {
    console.error("\nTest Failed:", error);
    process.exit(1);
  }
}

run();
