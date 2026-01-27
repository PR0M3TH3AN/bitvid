import './setup-test-env.js';
import { NostrClient } from '../../js/nostr/client.js';
import {
  buildVideoPostEvent,
  buildViewEvent
} from '../../js/nostrEventSchemas.js';
import * as NostrTools from 'nostr-tools';
import { bytesToHex } from '../../vendor/crypto-helpers.bundle.min.js';

// Setup global NostrTools for toolkit.js fallback
global.NostrTools = NostrTools;

async function waitForEvent(pool, relays, id, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const event = await pool.get(relays, { ids: [id] });
        if (event) return event;
        await new Promise(r => setTimeout(r, 1000));
    }
    return null;
}

async function run() {
  console.log("Starting Interop Test...");

  // 1. Setup Client
  const client = new NostrClient();

  // Test relays - using reputable public relays
  const TEST_RELAYS = ["wss://relay.damus.io", "wss://nos.lol"];
  client.relays = [...TEST_RELAYS];

  console.log(`Using relays: ${TEST_RELAYS.join(', ')}`);

  try {
    // 2. Init (connects to relays)
    await client.init();

    // 3. Generate Ephemeral Keys
    console.log("Generating ephemeral keys...");
    const sk = NostrTools.generateSecretKey();
    const skHex = bytesToHex(sk);
    const pk = NostrTools.getPublicKey(sk);
    console.log(`Ephemeral Pubkey: ${pk}`);

    // 4. Register Signer
    await client.registerPrivateKeySigner({ privateKey: skHex, pubkey: pk });
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
        deleted: false
      },
      // 's' tag is required by schema (storage pointer)
      additionalTags: [['s', `url:https://example.com/video.mp4`]]
    });

    const publishResult = await client.signAndPublishEvent(videoEvent);
    const publishedEvent = publishResult.signedEvent;

    if (!publishedEvent || !publishedEvent.id) {
        throw new Error("Publishing failed, no event returned");
    }

    console.log(`Published Video Event ID: ${publishedEvent.id}`);

    // Verify
    console.log("Verifying Video Post...");
    const rawRelayEvent = await waitForEvent(client.pool, TEST_RELAYS, publishedEvent.id);

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
    console.log(`Published View Event ID: ${viewPublishResult.signedEvent.id}`);

    // Ensure it is visible to subscriber clients (simulate).
    const rawViewEvent = await waitForEvent(client.pool, TEST_RELAYS, viewPublishResult.signedEvent.id);
    if (!rawViewEvent) throw new Error("Failed to fetch published view event");
    console.log("View Event Verified.");

    // 7. Test C: Direct Message
    console.log("\n[Test C] Testing Direct Message...");
    const msg = `Test DM ${Date.now()}`;
    const npub = NostrTools.nip19.npubEncode(pk);

    console.log(`Sending DM to self (${npub})...`);
    const dmResult = await client.sendDirectMessage(npub, msg);

    if (!dmResult.ok) throw new Error(`DM Send failed: ${dmResult.error}`);
    console.log("DM Sent.");

    // Verify decryption using the appropriate decryptor helper
    console.log("Verifying DM (waiting 2s)...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    const dms = await client.listDirectMessages(pk, { limit: 10 });
    const found = dms.find(d => d.plaintext === msg);

    if (!found) {
        console.log("Fetched DMs:", dms.map(d => d.plaintext));
        throw new Error("Failed to find sent DM");
    }
    console.log("DM Verified.");

    console.log("\nAll Interop Tests Passed!");
    process.exit(0);

  } catch (error) {
    console.error("\nTest Failed:", error);
    process.exit(1);
  }
}

run();
