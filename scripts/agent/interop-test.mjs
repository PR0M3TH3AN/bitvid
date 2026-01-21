// Import environment setup FIRST to ensure polyfills are ready before other imports
import './setup-test-env.js';

import * as NostrTools from 'nostr-tools';
// Destructure what we need, handling potential version differences if necessary
const { generateSecretKey, getPublicKey, nip19, nip04, nip44 } = NostrTools;

// --- Imports from Codebase ---
import { NostrClient } from '../../js/nostr/client.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import {
  buildVideoPostEvent,
  buildViewEvent,
  NOTE_TYPES
} from '../../js/nostrEventSchemas.js';

// --- Configuration ---
// Using a small, respectful list of public relays for interop testing
const TEST_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol'
];

// --- Helpers ---
function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

// --- Main Test ---
async function runTests() {
  console.log("=== Starting Protocol & Interop Tests ===");
  console.log(`[Config] Relays: ${TEST_RELAYS.join(', ')}`);

  // 1. Initialize Client
  // Programmatic instantiation as requested
  const client = new NostrClient();
  client.relays = [...TEST_RELAYS];
  client.readRelays = [...TEST_RELAYS];
  client.writeRelays = [...TEST_RELAYS];

  // Initialize connection
  await client.init();
  console.log("[Setup] NostrClient initialized and connecting...");

  // Wait a bit for connections to establish
  await new Promise(r => setTimeout(r, 1000));

  // 2. Generate Ephemeral Keys
  // Use ephemeral keys (generate locally) as requested
  const aliceSkBytes = generateSecretKey();
  const aliceSk = bytesToHex(aliceSkBytes);
  const alicePk = getPublicKey(aliceSkBytes);
  console.log(`[Keys] Alice (Sender): ${alicePk}`);

  const bobSkBytes = generateSecretKey();
  const bobSk = bytesToHex(bobSkBytes);
  const bobPk = getPublicKey(bobSkBytes);
  console.log(`[Keys] Bob (Receiver):   ${bobPk}`);

  // Register Alice as signer for the client
  await client.registerPrivateKeySigner({ privateKey: aliceSk });
  console.log("[Setup] Alice registered as active signer.");

  // --- Test A: Publish VIDEO_POST ---
  console.log("\n>>> Test A: Publish VIDEO_POST");
  const videoRootId = `test-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const videoContent = {
    version: 3,
    title: `Interop Test Video ${Date.now()}`,
    description: "Automated interop test video event.",
    url: "https://example.com/video.mp4",
    thumbnail: "https://example.com/thumb.jpg",
    mimeType: "video/mp4",
    isForKids: false,
    isNsfw: false,
    enableComments: false,
    videoRootId,
    mode: "live"
  };

  // Use schema builder
  const videoEventTemplate = buildVideoPostEvent({
    pubkey: alicePk,
    created_at: Math.floor(Date.now() / 1000),
    dTagValue: videoRootId,
    content: videoContent
  });

  let videoEvent;
  try {
    const result = await client.signAndPublishEvent(videoEventTemplate);
    videoEvent = result.signedEvent;

    // Check summary for acceptance
    const summary = result.summary;
    const acceptedCount = summary?.accepted?.length || 0;

    if (acceptedCount === 0) {
        throw new Error(`Relays rejected the video event. Details: ${JSON.stringify(summary)}`);
    }
    console.log(`[Pass] Published Video Event ID: ${videoEvent.id} (Accepted by ${acceptedCount} relays)`);
  } catch (e) {
    console.error("[Fail] Video publish failed:", e);
    process.exit(1);
  }

  // --- Test B: Fetch & Verify ---
  console.log("\n>>> Test B: Fetch & Verify Roundtrip");
  // Allow propagation
  await new Promise(r => setTimeout(r, 2000));

  try {
    const result = await client.getEventById(videoEvent.id, { includeRaw: true });

    if (!result || !result.rawEvent) {
      throw new Error("Could not fetch raw event back from relays.");
    }

    const { video, rawEvent } = result;

    if (rawEvent.id !== videoEvent.id) {
      throw new Error(`ID mismatch. Expected ${videoEvent.id}, got ${rawEvent.id}`);
    }

    // Verify content shape
    const content = JSON.parse(rawEvent.content);
    if (content.title !== videoContent.title) {
        throw new Error(`Content mismatch. Title: ${content.title} vs ${videoContent.title}`);
    }

    // Verify signature (basic check)
    const isSigValid = NostrTools.verifyEvent(rawEvent);
    if (!isSigValid) {
        throw new Error("Event signature verification failed.");
    }

    console.log("[Pass] Event fetched, signature verified, and content matches.");
  } catch (e) {
    console.error(`[Fail] Fetch & Verify failed: ${e.message}`);
    process.exit(1);
  }

  // --- Test C: Publish VIEW_EVENT ---
  console.log("\n>>> Test C: Publish VIEW_EVENT");
  const viewEventTemplate = buildViewEvent({
    pubkey: alicePk,
    created_at: Math.floor(Date.now() / 1000),
    pointerValue: videoEvent.id,
    pointerTag: ['e', videoEvent.id],
    dedupeTag: `view:${videoEvent.id}:${Date.now()}`,
    includeSessionTag: false // Not a session actor
  });

  try {
    const viewResult = await client.signAndPublishEvent(viewEventTemplate);
    const acceptedCount = viewResult.summary?.accepted?.length || 0;
    if (acceptedCount > 0) {
        console.log(`[Pass] View Event published. ID: ${viewResult.signedEvent.id}`);
    } else {
        console.warn(`[Warn] View Event publish result not OK:`, viewResult);
    }
  } catch (e) {
    console.error("[Fail] View Event publish threw:", e);
  }

  // --- Test D: Encrypted DM ---
  console.log("\n>>> Test D: Direct Message (Encryption/Decryption)");
  const dmMessage = `Secret message ${Date.now()}`;

  // We are Alice. Send to Bob.
  // Note: client.sendDirectMessage uses the registered signer (Alice)
  console.log(`[DM] Sending from Alice to Bob...`);
  try {
    const bobNpub = nip19.npubEncode(bobPk);
    const sendRes = await client.sendDirectMessage(bobNpub, dmMessage);
    if (!sendRes.ok) {
        throw new Error(sendRes.error || "Unknown error sending DM");
    }
    console.log("[DM] Message sent.");
  } catch (e) {
    console.error("[Fail] DM Send failed:", e);
    process.exit(1);
  }

  // Wait for propagation
  await new Promise(r => setTimeout(r, 2000));

  // Verify by fetching as Bob
  // We need to use the pool directly to fetch, as 'client' is configured as Alice
  console.log(`[DM] Fetching events for Bob (p=${bobPk})...`);
  const filter = {
    kinds: [4, 1059], // Legacy and GiftWrap
    '#p': [bobPk],
    authors: [alicePk], // Sent by Alice
    limit: 1
  };

  const dmEvents = await client.pool.list(TEST_RELAYS, [filter]);
  console.log(`[DM] Found ${dmEvents.length} events for Bob.`);

  if (dmEvents.length === 0) {
    console.error("[Fail] No DM events found on relays.");
    process.exit(1);
  }

  const targetEvent = dmEvents[0];
  console.log(`[DM] Decrypting event kind ${targetEvent.kind}...`);

  // Setup Bob's decryptors
  const bobDecryptors = [];

  // NIP-44
  if (nip44) {
    bobDecryptors.push({
        scheme: 'nip44',
        decrypt: (pk, ct) => nip44.decrypt(bobSk, pk, ct),
        priority: 1,
        supportsGiftWrap: true
    });
  }
  // NIP-04
  if (nip04) {
    bobDecryptors.push({
        scheme: 'nip04',
        decrypt: async (pk, ct) => nip04.decrypt(bobSk, pk, ct),
        priority: 0
    });
  }

  const decryptContext = {
    actorPubkey: bobPk,
    decryptors: bobDecryptors
  };

  const decryptRes = await decryptDM(targetEvent, decryptContext);

  if (!decryptRes.ok) {
    console.error("[Fail] Decryption failed:", decryptRes.errors);
    process.exit(1);
  }

  if (decryptRes.plaintext !== dmMessage) {
    console.error(`[Fail] Message mismatch. Got: "${decryptRes.plaintext}", Expected: "${dmMessage}"`);
    process.exit(1);
  }

  console.log(`[Pass] Decryption verified. Scheme: ${decryptRes.scheme}, Message: "${decryptRes.plaintext}"`);

  // Cleanup
  // In a real scenario we might delete the events, but these are ephemeral and test relays usually clean up or we accept the dust for this test.

  console.log("\n=== All Tests Passed ===");
  process.exit(0);
}

runTests().catch(e => {
  console.error("Unhandled Error:", e);
  process.exit(1);
});
