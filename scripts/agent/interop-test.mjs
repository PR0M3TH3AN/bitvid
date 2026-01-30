import './setup-test-env.js';
import { NostrClient } from '../../js/nostr/client.js';
import { buildVideoPostEvent, buildViewEvent, NOTE_TYPES } from '../../js/nostrEventSchemas.js';
import * as NostrTools from 'nostr-tools';

const bytesToHex = (bytes) => {
  return Buffer.from(bytes).toString('hex');
};

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol"
];

async function runTests() {
  console.log("Starting Protocol & Interop Tests...");

  // --- Setup ---
  console.log("[Setup] Generating ephemeral keys...");
  const aliceSkBytes = NostrTools.generateSecretKey();
  const aliceSk = bytesToHex(aliceSkBytes);
  const alicePk = NostrTools.getPublicKey(aliceSkBytes);

  const bobSkBytes = NostrTools.generateSecretKey();
  const bobSk = bytesToHex(bobSkBytes);
  const bobPk = NostrTools.getPublicKey(bobSkBytes);

  console.log(`[Setup] Alice: ${alicePk}`);
  console.log(`[Setup] Bob: ${bobPk}`);

  const aliceClient = new NostrClient();
  aliceClient.relays = [...RELAYS];
  aliceClient.readRelays = [...RELAYS];
  aliceClient.writeRelays = [...RELAYS];

  const bobClient = new NostrClient();
  bobClient.relays = [...RELAYS];
  bobClient.readRelays = [...RELAYS];
  bobClient.writeRelays = [...RELAYS];

  console.log("[Setup] Connecting clients...");
  // Initialize to connect
  await aliceClient.init(); // This might try to load stored session, but shouldn't matter
  await bobClient.init();

  // Register signers
  await aliceClient.registerPrivateKeySigner({ privateKey: aliceSk, pubkey: alicePk });
  aliceClient.pubkey = alicePk; // Explicitly set client pubkey to ensure correct signer resolution

  await bobClient.registerPrivateKeySigner({ privateKey: bobSk, pubkey: bobPk });
  bobClient.pubkey = bobPk; // Explicitly set client pubkey to ensure correct signer resolution

  let testsPassed = 0;
  let testsTotal = 0;

  // --- Test A: Video Post ---
  testsTotal++;
  console.log("\n[Test A] Publishing VIDEO_POST...");
  try {
    const videoPayload = {
        version: 3,
        title: "Interop Test Video " + Date.now(),
        description: "This is a test video event.",
        videoRootId: "interop-test-" + Date.now(),
        mode: "dev",
        isPrivate: false,
        isNsfw: false,
        isForKids: false,
        enableComments: true
    };

    // We use signAndPublishEvent directly with a manually built event to test the schema helper
    const event = buildVideoPostEvent({
        pubkey: alicePk,
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: videoPayload.videoRootId,
        content: videoPayload
    });

    const { signedEvent } = await aliceClient.signAndPublishEvent(event);
    console.log(`[Test A] Published event ${signedEvent.id}`);

    // Verify
    console.log("[Test A] Verifying roundtrip...");
    // Give relays a moment
    await new Promise(r => setTimeout(r, 2000));

    // getEventById returns the Video object (converted), but we can ask for raw too
    const result = await bobClient.getEventById(signedEvent.id, { includeRaw: true });
    if (!result || !result.rawEvent) throw new Error("Failed to fetch event back");

    const fetched = result.rawEvent;
    if (fetched.id !== signedEvent.id) throw new Error("Fetched ID mismatch");

    // Parse content
    const content = typeof fetched.content === 'string' ? JSON.parse(fetched.content) : fetched.content;
    if (content.title !== videoPayload.title) throw new Error("Content mismatch: title");

    console.log("[Test A] PASSED");
    testsPassed++;
  } catch (e) {
    console.error("[Test A] FAILED:", e);
  }

  // --- Test B: View Event ---
  testsTotal++;
  console.log("\n[Test B] Publishing VIEW_EVENT...");
  try {
    const viewEvent = buildViewEvent({
        pubkey: alicePk,
        created_at: Math.floor(Date.now() / 1000),
        pointerValue: "test-video-pointer", // Arbitrary pointer for test
        content: "view-test"
    });

    const { signedEvent: signedView } = await aliceClient.signAndPublishEvent(viewEvent);
    console.log(`[Test B] Published view event ${signedView.id}`);

    await new Promise(r => setTimeout(r, 2000));

    // Bob fetches raw event
    const fetchedView = await bobClient.fetchRawEventById(signedView.id);
    if (!fetchedView) throw new Error("Failed to fetch view event");
    if (fetchedView.id !== signedView.id) throw new Error("View event ID mismatch");

    console.log("[Test B] PASSED");
    testsPassed++;
  } catch (e) {
    console.error("[Test B] FAILED:", e);
  }

  // --- Test C: Direct Message ---
  testsTotal++;
  console.log("\n[Test C] Sending Direct Message...");
  try {
    const message = "Hello Bob, this is Alice " + Date.now();
    const npubBob = NostrTools.nip19.npubEncode(bobPk);

    const sendResult = await aliceClient.sendDirectMessage(npubBob, message);
    if (!sendResult.ok) throw new Error("Failed to send DM: " + (sendResult.error || "unknown"));
    console.log("[Test C] DM sent successfully");

    await new Promise(r => setTimeout(r, 3000));

    console.log("[Test C] Bob checking messages...");
    // Force bob to list messages (which triggers decryption using his registered signer)
    const messages = await bobClient.listDirectMessages(bobPk, { limit: 5 });

    const received = messages.find(m => m.plaintext === message);
    if (!received) {
        console.log("Received messages:", messages.map(m => m.plaintext));
        throw new Error("Bob did not find the specific message");
    }

    if (received.sender.pubkey !== alicePk) {
        console.log(`[Test C] Sender mismatch: Expected ${alicePk}, got ${received.sender.pubkey}`);
        throw new Error("Sender mismatch");
    }

    console.log("[Test C] PASSED");
    testsPassed++;
  } catch (e) {
    console.error("[Test C] FAILED:", e);
  }

  // --- Summary ---
  console.log("\n---------------------------------------------------");
  console.log(`Tests Completed: ${testsPassed}/${testsTotal}`);

  aliceClient.logout();
  bobClient.logout();

  if (testsPassed === testsTotal) {
    console.log("ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error("SOME TESTS FAILED");
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error("Unhandled execution error:", e);
  process.exit(1);
});
