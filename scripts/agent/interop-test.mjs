// Import environment setup FIRST to ensure polyfills are ready before other imports
import './setup-test-env.js';

import { generateSecretKey, getPublicKey, nip19, nip04, nip44 } from 'nostr-tools';
import * as NostrTools from 'nostr-tools';

// --- Imports from Codebase ---
// Relative path from scripts/agent/interop-test.mjs to js/nostr/client.js is ../../js/nostr/client.js
import { NostrClient } from '../../js/nostr/client.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import {
  buildVideoPostEvent,
  buildViewEvent,
  NOTE_TYPES
} from '../../js/nostrEventSchemas.js';

// --- Configuration ---
const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol'
];
// Optional: Local relay if running
const LOCAL_RELAY = 'ws://localhost:8008';

// --- Helpers ---
function bytesToHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

async function checkRelay(url) {
  return new Promise(resolve => {
    try {
      const ws = new WebSocket(url);
      ws.on('open', () => { ws.close(); resolve(true); });
      ws.on('error', () => { resolve(false); });
    } catch { resolve(false); }
  });
}

// --- Main Test ---
async function runTests() {
  console.log("=== Starting Protocol & Interop Tests ===");

  // 1. Setup Relays
  const activeRelays = [];
  if (await checkRelay(LOCAL_RELAY)) {
    console.log(`[Setup] Local relay found: ${LOCAL_RELAY}`);
    activeRelays.push(LOCAL_RELAY);
  } else {
    console.log(`[Setup] Local relay not found. Using public test relays.`);
    activeRelays.push(...RELAYS);
  }
  console.log(`[Setup] Active Relays:`, activeRelays);

  // 2. Initialize Client
  const client = new NostrClient();
  client.relays = activeRelays;
  client.readRelays = activeRelays;
  client.writeRelays = activeRelays;

  await client.init();
  console.log("[Setup] NostrClient initialized.");

  // 3. Generate Ephemeral Keys
  const aliceSkBytes = generateSecretKey();
  const aliceSk = bytesToHex(aliceSkBytes);
  const alicePk = getPublicKey(aliceSkBytes);
  console.log(`[Keys] Alice (Sender): ${alicePk}`);

  const bobSkBytes = generateSecretKey();
  const bobSk = bytesToHex(bobSkBytes);
  const bobPk = getPublicKey(bobSkBytes);
  console.log(`[Keys] Bob (Receiver):   ${bobPk}`);

  // Register Alice as signer
  await client.registerPrivateKeySigner({ privateKey: aliceSk });
  console.log("[Setup] Alice registered as active signer.");

  // --- Test A: Video Post ---
  console.log("\n>>> Test A: Publish VIDEO_POST (Kind 30078)");
  const videoRootId = `test-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const dTagValue = videoRootId;
  const videoContent = {
    version: 3,
    title: `Interop Test ${Date.now()}`,
    description: "Automated interop test with ephemeral keys.",
    url: "https://example.com/video.mp4",
    thumbnail: "https://example.com/thumb.jpg",
    mimeType: "video/mp4",
    isForKids: false,
    isNsfw: false,
    enableComments: false, // Guardrail: no session actor comments
    videoRootId,
    mode: "live"
  };

  // Explicitly using schema builder as per instructions
  const videoEventTemplate = buildVideoPostEvent({
    pubkey: alicePk,
    created_at: Math.floor(Date.now() / 1000),
    dTagValue,
    content: videoContent
  });

  let videoEvent;
  try {
    const result = await client.signAndPublishEvent(videoEventTemplate);
    videoEvent = result.signedEvent;

    // Check acceptance. The structure of summary is { accepted: [...], failed: [...] }
    const summary = result.summary;
    if (!summary || !summary.accepted || summary.accepted.length === 0) {
        throw new Error("Relays rejected the video event.");
    }
    console.log(`[Pass] Published Video Event ID: ${videoEvent.id}`);
  } catch (e) {
    console.error("[Fail] Video publish failed:", e);
    process.exit(1);
  }

  // --- Test B: Fetch & Verify ---
  console.log("\n>>> Test B: Fetch & Verify Roundtrip");
  // Give relays a moment to index
  await new Promise(r => setTimeout(r, 1500));

  // Request raw event to verify protocol details
  const result = await client.getEventById(videoEvent.id, { includeRaw: true });
  if (!result || !result.rawEvent) {
    console.error("[Fail] Could not fetch raw event back from relays.");
    process.exit(1);
  }

  const { video, rawEvent } = result;

  if (rawEvent.id !== videoEvent.id) {
    console.error(`[Fail] ID mismatch. Expected ${videoEvent.id}, got ${rawEvent.id}`);
    process.exit(1);
  }

  // Verify shape by parsing raw content
  let content;
  try {
    content = JSON.parse(rawEvent.content);
  } catch {
    content = {};
  }

  if (content.title !== videoContent.title) {
    console.error(`[Fail] Content mismatch in raw event. Title: ${content.title} vs ${videoContent.title}`);
    process.exit(1);
  }

  if (video.title !== videoContent.title) {
    console.error(`[Fail] Content mismatch in normalized video object. Title: ${video.title}`);
    process.exit(1);
  }

  console.log("[Pass] Event fetched and verified successfully (Raw + Normalized).");

  // --- Test C: View Event ---
  console.log("\n>>> Test C: Publish VIEW_EVENT");
  // Explicitly using schema builder as per instructions
  // View event points to the video
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
    const viewSummary = viewResult.summary;
    if (viewSummary && viewSummary.accepted && viewSummary.accepted.length > 0) {
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

  console.log(`[DM] Sending from Alice to Bob...`);
  try {
    const bobNpub = nip19.npubEncode(bobPk);
    const realSendRes = await client.sendDirectMessage(bobNpub, dmMessage);
    if (!realSendRes.ok) {
        throw new Error(realSendRes.error || "Unknown error");
    }
    console.log("[DM] Message sent.");
  } catch (e) {
    console.error("[Fail] DM Send failed:", e);
    process.exit(1);
  }

  // Verify by fetching as Bob
  await new Promise(r => setTimeout(r, 2000));

  console.log(`[DM] Fetching for Bob...`);
  const filter = {
    kinds: [4, 1059], // Legacy and GiftWrap
    '#p': [bobPk],
    authors: [alicePk] // Sent by Alice
  };

  const dmEvents = await client.pool.list(activeRelays, [filter]);
  console.log(`[DM] Found ${dmEvents.length} events for Bob.`);

  if (dmEvents.length === 0) {
    console.error("[Fail] No DM events found on relays.");
    process.exit(1);
  }

  const targetEvent = dmEvents[0];
  console.log(`[DM] Decrypting event kind ${targetEvent.kind}...`);

  const bobDecryptors = [];

  if (nip44) {
    bobDecryptors.push({
        scheme: 'nip44',
        decrypt: (pk, ct) => nip44.decrypt(bobSk, pk, ct),
        priority: 1,
        supportsGiftWrap: true
    });
  }
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

  console.log(`[Pass] Decryption verified: "${decryptRes.plaintext}"`);

  console.log("\n=== All Tests Passed ===");
  process.exit(0);
}

runTests().catch(e => {
  console.error("Unhandled Error:", e);
  process.exit(1);
});
