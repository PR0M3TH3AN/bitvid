
import { WebSocket } from 'ws';
import * as crypto from 'node:crypto';
import * as NostrTools from 'nostr-tools';

// Polyfills
globalThis.WebSocket = WebSocket;
if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}
globalThis.NostrTools = NostrTools;

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem: function(key) { return this.store[key] || null; },
  setItem: function(key, value) { this.store[key] = String(value); },
  removeItem: function(key) { delete this.store[key]; },
  clear: function() { this.store = {}; }
};
globalThis.localStorage = localStorageMock;

// Prevent crash on unhandled rejection (e.g. from nostr-tools timeouts)
process.on('unhandledRejection', (reason, p) => {
  // console.log('[TEST] Unhandled Rejection (suppressed):', reason);
});

// Configuration
const TEST_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol'
];

async function runTest() {
  const { NostrClient } = await import('../../js/nostr/client.js');
  // Removed unused imports

  console.log('Starting Interop Test...');
  const logs = [];
  const log = (msg, data) => {
    console.log(`[TEST] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
    logs.push({ msg, data });
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Setup Sender
    // -------------------------------------------------------------------------
    log('Initializing Sender Client...');
    const senderClient = new NostrClient();

    // Explicitly set relays
    senderClient.relays = [...TEST_RELAYS];
    senderClient.writeRelays = [...TEST_RELAYS];
    senderClient.readRelays = [...TEST_RELAYS];
    log('Sender Relays set to:', senderClient.relays);

    // Generate Ephemeral Key for Sender
    const senderSecret = NostrTools.generateSecretKey();
    const senderPrivKey = Buffer.from(senderSecret).toString('hex');

    const { pubkey: senderPubkey } = await senderClient.registerPrivateKeySigner({ privateKey: senderPrivKey });
    senderClient.pubkey = senderPubkey;
    log('Sender Pubkey:', senderClient.pubkey);

    await senderClient.init();
    log('Sender Client Initialized.');

    // -------------------------------------------------------------------------
    // 2. Publish Video Post
    // -------------------------------------------------------------------------
    log('Test A: Publish Video Post');
    const videoRootId = `interop-test-${Date.now()}`;
    const magnet = `magnet:?xt=urn:btih:${crypto.randomBytes(20).toString('hex')}&dn=test-video`;
    const title = 'Interop Test Video ' + new Date().toISOString();

    const videoData = {
      title,
      videoRootId,
      magnet,
      description: 'Automated interop test video',
      mimeType: 'video/mp4'
    };

    log('Publishing video...', videoData);
    const signedVideoEvent = await senderClient.publishVideo(videoData, senderClient.pubkey);
    log('Video Published. Event ID:', signedVideoEvent.id);

    // Verify
    log('Verifying video event fetch...');
    // Allow some propagation time
    await new Promise(r => setTimeout(r, 2000));

    const fetchedVideo = await senderClient.getEventById(signedVideoEvent.id);
    if (!fetchedVideo) throw new Error('Failed to fetch published video event');
    if (fetchedVideo.id !== signedVideoEvent.id) throw new Error('Fetched event ID mismatch');

    const isSigValid = NostrTools.verifyEvent(signedVideoEvent);
    if (!isSigValid) throw new Error('Invalid event signature');

    // Verify content shape
    if (fetchedVideo.title !== title) throw new Error(`Title mismatch: expected "${title}", got "${fetchedVideo.title}"`);
    if (fetchedVideo.magnet !== magnet) throw new Error(`Magnet mismatch: expected "${magnet}", got "${fetchedVideo.magnet}"`);
    // Note: publishVideo generates a new videoRootId, so we check against the signed event's content, not our input
    const signedContent = JSON.parse(signedVideoEvent.content);
    if (fetchedVideo.videoRootId !== signedContent.videoRootId) throw new Error(`Root ID mismatch: expected "${signedContent.videoRootId}", got "${fetchedVideo.videoRootId}"`);

    log('Test A PASSED: Video event published and verified (content matched).');

    // -------------------------------------------------------------------------
    // 3. Publish View Event
    // -------------------------------------------------------------------------
    log('Test B: Publish View Event');
    const pointer = {
      type: 'e',
      value: signedVideoEvent.id,
      relay: TEST_RELAYS[0]
    };

    log('Publishing view event...', pointer);
    const viewResult = await senderClient.publishViewEvent(pointer);

    if (!viewResult.ok) throw new Error(`Failed to publish view event: ${viewResult.error}`);
    log('View event published.');

    // Verify View Event Visibility
    log('Verifying view event visibility...');
    await new Promise(r => setTimeout(r, 2000));

    // We can list view events for this pointer
    const viewEvents = await senderClient.listVideoViewEvents(pointer, { limit: 5 });
    const foundView = viewEvents.find(v => v.pubkey === senderPubkey); // It should be signed by sender

    if (!foundView) {
        log('Fetched View Events:', viewEvents);
        throw new Error('Could not verify visibility of published view event.');
    }
    log('Test B PASSED: View event verified visible.');

    // -------------------------------------------------------------------------
    // 4. Encrypted Direct Message (Sender -> Receiver)
    // -------------------------------------------------------------------------
    log('Test C: Encrypted DM');

    // Setup Receiver
    const receiverClient = new NostrClient();
    receiverClient.relays = [...TEST_RELAYS];
    receiverClient.writeRelays = [...TEST_RELAYS];
    receiverClient.readRelays = [...TEST_RELAYS];

    const receiverSecret = NostrTools.generateSecretKey();
    const receiverPrivKey = Buffer.from(receiverSecret).toString('hex');

    const { pubkey: receiverPubkey } = await receiverClient.registerPrivateKeySigner({ privateKey: receiverPrivKey });
    receiverClient.pubkey = receiverPubkey;
    log('Receiver Pubkey:', receiverPubkey);

    await receiverClient.init();

    // Sender sends DM
    const messageContent = `Hello Interop ${Date.now()}`;
    log(`Sender sending DM to ${receiverPubkey}: "${messageContent}"`);

    // sendDirectMessage is on the sender client
    const sendResult = await senderClient.sendDirectMessage(
      NostrTools.nip19.npubEncode(receiverPubkey),
      messageContent
    );

    if (!sendResult.ok) throw new Error(`Failed to send DM: ${sendResult.error}`);
    log('DM Sent.');

    // Wait for propagation
    await new Promise(r => setTimeout(r, 5000));

    // Receiver fetches DMs
    log('Receiver fetching DMs...');
    const dms = await receiverClient.listDirectMessages(receiverPubkey);

    const foundDm = dms.find(dm => dm.plaintext === messageContent);

    if (!foundDm) {
      log('Fetched DMs:', dms.map(d => ({ plain: d.plaintext, sender: d.sender })));
      throw new Error('Receiver could not find or decrypt the sent message.');
    }

    log('Test C PASSED: DM received and decrypted.');

    console.log('\nAll Interop Tests PASSED!');
    process.exit(0);

  } catch (err) {
    console.error('\nTest FAILED:', err);
    process.exit(1);
  }
}

runTest();
