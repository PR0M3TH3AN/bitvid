import { WebSocket } from 'ws';
global.WebSocket = WebSocket;

import crypto from 'node:crypto';
if (!global.crypto) {
  global.crypto = crypto;
}

import "fake-indexeddb/auto";

import { startRelay } from './simple-relay.mjs';
import { NostrClient } from '../../js/nostr/client.js';
import * as NostrTools from 'nostr-tools';
import { buildVideoPostEvent } from '../../js/nostrEventSchemas.js';

// Setup environment for NostrClient which might expect browser globals
if (!global.window) {
    global.window = global;
}
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    };
}

function bytesToHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}

async function runInteropTests() {
  console.log("Starting Interop Tests...");

  // 1. Start Relay
  const PORT = 8899;
  let relay;
  try {
     relay = startRelay(PORT);
  } catch (e) {
      console.error("Failed to start relay:", e);
      process.exit(1);
  }

  const RELAY_URL = `ws://localhost:${PORT}`;
  console.log(`Relay started at ${RELAY_URL}`);

  try {
    // 2. Initialize Client
    const client = new NostrClient();

    // Override relays to only use our local test relay
    client.relays = [RELAY_URL];
    client.readRelays = [RELAY_URL];
    client.writeRelays = [RELAY_URL];

    console.log("Initializing NostrClient...");
    await client.init();
    console.log("NostrClient initialized.");

    // 3. Generate Ephemeral Keys
    const secretKey = NostrTools.generateSecretKey();
    const privateKey = bytesToHex(secretKey);
    const pubkey = NostrTools.getPublicKey(secretKey);
    console.log(`Generated Ephemeral Keys: Pubkey: ${pubkey}`);

    // 4. Register Signer
    await client.registerPrivateKeySigner({
      privateKey: privateKey,
      pubkey: pubkey,
      persist: false
    });
    console.log("Signer registered.");

    // 5. Test 1: Publish Video Post
    console.log("\n--- Test 1: Publish Video Post ---");

    const dTagValue = `d-${Date.now()}`;
    const videoContent = {
        version: 3,
        title: "Interop Test Video",
        description: "Testing interoperability with ephemeral keys",
        url: "https://example.com/video.mp4",
        magnet: "magnet:?xt=urn:btih:d435345c2345d345345&dn=video",
        isForKids: false,
        isNsfw: false,
        enableComments: true,
        videoRootId: `root-${Date.now()}`,
        mode: "live"
    };

    const videoEvent = buildVideoPostEvent({
        pubkey: pubkey,
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: dTagValue,
        content: videoContent
    });

    const { signedEvent: publishResult } = await client.signAndPublishEvent(videoEvent);
    console.log(`Video Published. Event ID: ${publishResult.id}`);

    // Verify
    // Wait a bit for relay to process (though simple-relay is synchronous mostly)
    await new Promise(r => setTimeout(r, 100));

    const fetchedEvent = await client.getEventById(publishResult.id);
    if (!fetchedEvent) throw new Error("Failed to fetch published video event.");
    console.log("Video Event fetched successfully.");

    if (fetchedEvent.title !== videoContent.title) {
        console.error("Fetched:", fetchedEvent);
        throw new Error(`Content verification failed: Title mismatch. Expected ${videoContent.title}, got ${fetchedEvent.title}`);
    }
    console.log("Video Content verified.");

    // 6. Test 2: Publish View Event
    console.log("\n--- Test 2: Publish View Event ---");

    const videoPointer = {
        type: 'e',
        value: publishResult.id,
        relay: RELAY_URL
    };

    const viewResult = await client.publishViewEvent(videoPointer);
    console.log(`View Event Published. Event ID: ${viewResult.id}`);

    // 7. Test 3: Direct Message
    console.log("\n--- Test 3: Direct Message ---");
    const recipientSecret = NostrTools.generateSecretKey();
    const recipientPubkey = NostrTools.getPublicKey(recipientSecret);
    const recipientNpub = NostrTools.nip19.npubEncode(recipientPubkey);

    const message = "Hello from Interop Test";

    console.log(`Sending DM to ${recipientNpub}...`);
    const dmResult = await client.sendDirectMessage(recipientNpub, message);
    if (!dmResult.ok) throw new Error(`DM Send Failed: ${dmResult.error}`);
    console.log("DM Sent.");

    console.log("Listing DMs...");
    await new Promise(r => setTimeout(r, 500));

    const dms = await client.listDirectMessages(recipientPubkey);

    // Note: listDirectMessages returns decrypted messages.
    // As the sender, we should be able to decrypt our own sent message (NIP-04/17).

    const foundDm = dms.find(dm => dm.plaintext === message);

    if (foundDm) {
        console.log("DM found and content matches.");
    } else {
        console.log("DMs found count:", dms.length);
        if (dms.length > 0) console.log("First DM:", dms[0]);
        throw new Error("Sent DM not found in list.");
    }

    console.log("\nAll Tests Passed Successfully.");

  } catch (error) {
    console.error("Test Failed:", error);
    if (error.cause) console.error("Cause:", error.cause);
    process.exit(1);
  } finally {
    if (relay && relay.close) {
        await relay.close();
    }
    process.exit(0);
  }
}

runInteropTests();
