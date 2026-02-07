import WebSocket from 'ws';
import { webcrypto } from 'node:crypto';
import { startRelay } from './simple-relay.mjs';
import { NostrClient } from '../../js/nostr/client.js';
import { buildVideoPostEvent, buildViewEvent } from '../../js/nostrEventSchemas.js';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

// Polyfills
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(String(k), String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
    key: (i) => Array.from(storage.keys())[i] || null,
    get length() { return storage.size; }
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
  globalThis.window.localStorage = globalThis.localStorage;
}
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { userAgent: 'node' };
}

async function runTests() {
  console.log('Starting Interop Tests...');

  // Start Relay
  const relayPort = 8899; // Use different port to avoid conflict
  const relayUrl = `ws://localhost:${relayPort}`;
  const relayServer = startRelay(relayPort);
  console.log(`Test relay started at ${relayUrl}`);

  try {
    // Setup Clients
    const aliceClient = new NostrClient();
    aliceClient.relays = [relayUrl];
    aliceClient.writeRelays = [relayUrl];
    aliceClient.readRelays = [relayUrl];
    await aliceClient.ensurePool();
    await aliceClient.connectToRelays();

    const bobClient = new NostrClient();
    bobClient.relays = [relayUrl];
    bobClient.writeRelays = [relayUrl];
    bobClient.readRelays = [relayUrl];
    await bobClient.ensurePool();
    await bobClient.connectToRelays();

    // Generate Keys
    const aliceSk = generateSecretKey();
    const aliceSkHex = Buffer.from(aliceSk).toString('hex');
    const alicePk = getPublicKey(aliceSk);

    const bobSk = generateSecretKey();
    const bobSkHex = Buffer.from(bobSk).toString('hex');
    const bobPk = getPublicKey(bobSk);
    const bobNpub = nip19.npubEncode(bobPk);

    console.log('Alice Pubkey:', alicePk);
    console.log('Bob Pubkey:', bobPk);

    // Register Signers
    await aliceClient.registerPrivateKeySigner({ privateKey: aliceSkHex, pubkey: alicePk });
    await bobClient.registerPrivateKeySigner({ privateKey: bobSkHex, pubkey: bobPk });

    // --- Test 1: Video Post ---
    console.log('\n[Test 1] Publishing Video Post...');
    const videoEvent = buildVideoPostEvent({
      pubkey: alicePk,
      created_at: Math.floor(Date.now() / 1000),
      dTagValue: `test-video-${Date.now()}`,
      content: {
        version: 3,
        title: 'Interop Test Video',
        videoRootId: `root-${Date.now()}`,
        description: 'A test video for interoperability',
        url: 'https://example.com/video.mp4',
        mode: 'dev'
      }
    });

    const { signedEvent: publishedVideo } = await aliceClient.signAndPublishEvent(videoEvent);
    console.log('Video published:', publishedVideo.id);

    // Give relay a moment
    await new Promise(r => setTimeout(r, 200));

    // Verify
    const fetchedVideo = await aliceClient.getEventById(publishedVideo.id);
    if (!fetchedVideo) {
       console.log('Fetching raw event to debug...');
       const raw = await aliceClient.fetchRawEventById(publishedVideo.id);
       console.log('Raw event fetch result:', raw ? 'FOUND' : 'NOT FOUND');
       throw new Error('Failed to fetch published video');
    }
    if (fetchedVideo.title !== 'Interop Test Video') {
       console.log('Fetched Video:', JSON.stringify(fetchedVideo, null, 2));
       throw new Error('Video content mismatch');
    }
    console.log('PASS: Video Post verified.');

    // --- Test 2: View Event ---
    console.log('\n[Test 2] Publishing View Event...');
    const viewEvent = buildViewEvent({
      pubkey: alicePk,
      created_at: Math.floor(Date.now() / 1000),
      pointerValue: publishedVideo.id // referencing the video
    });

    const { signedEvent: publishedView } = await aliceClient.signAndPublishEvent(viewEvent);
    console.log('View event published:', publishedView.id);
    console.log('PASS: View Event published.');

    // --- Test 3: Direct Message ---
    console.log('\n[Test 3] Sending DM...');
    const message = 'Hello Bob, this is a test.';
    const sendResult = await aliceClient.sendDirectMessage(bobNpub, message, null, { useNip17: false });

    if (!sendResult.ok) throw new Error(`DM Send failed: ${sendResult.error}`);
    console.log('DM sent.');

    // Wait a bit for relay
    await new Promise(r => setTimeout(r, 500));

    // Bob fetches
    const messages = await bobClient.listDirectMessages();
    const receivedMsg = messages.find(m => m.plaintext === message);

    if (!receivedMsg) {
      console.log('Messages received:', messages.map(m => m.plaintext));
      throw new Error('Bob did not receive the DM or decryption failed');
    }
    console.log('PASS: DM received and decrypted.');

  } catch (error) {
    console.error('\nTEST FAILED:', error);
    process.exitCode = 1;
  } finally {
    relayServer.close();
    console.log('\nRelay closed. Exiting.');
    process.exit(process.exitCode || 0);
  }
}

runTests();
