import './setup-test-env.js';
import { spawn } from 'node:child_process';
import { NostrClient } from '../../js/nostr/client.js';
import { buildVideoPostEvent } from '../../js/nostrEventSchemas.js';
import * as NostrTools from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import fs from 'node:fs';
import path from 'node:path';

// Polyfill global for fallback if dynamic import fails in bootstrap (unlikely in Node but safe)
global.NostrTools = NostrTools;

const ARTIFACTS_DIR = 'artifacts';
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function run() {
  console.log('--- Starting Interop Test ---');

  // 1. Start Local Relay
  console.log('[Setup] Spawning simple-relay.mjs...');
  const relayLog = fs.openSync(path.join(ARTIFACTS_DIR, 'interop-relay.log'), 'w');
  const relayProcess = spawn('node', ['scripts/agent/simple-relay.mjs'], {
    stdio: ['ignore', relayLog, relayLog],
    env: { ...process.env, PORT: '8008' }
  });

  // Give relay time to boot
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('[Setup] Relay assumed running on ws://localhost:8008');

  let exitCode = 0;

  try {
    // 2. Client Init (Sender - Identity A)
    console.log('[Client A] Initializing...');
    const clientA = new NostrClient();

    // Override relays to local
    const testRelays = ['ws://localhost:8008'];
    clientA.relays = [...testRelays];
    clientA.readRelays = [...testRelays];
    clientA.writeRelays = [...testRelays];

    await clientA.init();
    console.log('[Client A] Connected.');

    // Generate keys
    const skA = NostrTools.generateSecretKey();
    const pkA = NostrTools.getPublicKey(skA);
    const hexSkA = NostrTools.utils.bytesToHex(skA);
    const npubA = nip19.npubEncode(pkA);

    console.log(`[Client A] Identity: ${pkA} (${npubA})`);

    // Register signer
    await clientA.registerPrivateKeySigner({ privateKey: hexSkA, pubkey: pkA });
    console.log('[Client A] Signer registered.');

    // --- TEST 1: Video Post ---
    console.log('\n--- Test 1: Video Post ---');
    // Using buildVideoPostEvent directly to verify schema interop as requested
    const videoPayload = {
      version: 3,
      title: 'Interop Video Test',
      description: 'Testing video publish via NostrClient',
      magnet: 'magnet:?xt=urn:btih:c91104e1e82813136287e0767786431206d048d0&dn=test-video',
      mode: 'live',
      isPrivate: false,
      videoRootId: `test-root-${Date.now()}`,
      isNsfw: false,
      isForKids: false,
      url: '',
      thumbnail: '',
      deleted: false,
      enableComments: true
    };

    console.log('[Test 1] Building and Publishing video...');
    const rawEvent = buildVideoPostEvent({
        pubkey: pkA,
        created_at: Math.floor(Date.now() / 1000),
        content: videoPayload,
        dTagValue: `interop-${Date.now()}`
    });

    const { signedEvent: videoEvent } = await clientA.signAndPublishEvent(rawEvent);

    if (!videoEvent || !videoEvent.id) {
        throw new Error('Video publish returned no event or ID');
    }
    console.log(`[Test 1] Video published. ID: ${videoEvent.id}`);

    // Fetch back
    console.log('[Test 1] Fetching event back...');
    const fetchedEvent = await clientA.getEventById(videoEvent.id);
    if (!fetchedEvent) {
        throw new Error('Failed to fetch video event back');
    }

    // Validate
    // getEventById returns the Video model (parsed object), not the raw event, unless includeRaw is true.
    // The Video model has 'title' at top level.
    if (fetchedEvent.title !== videoPayload.title) {
        throw new Error(`Title mismatch: expected ${videoPayload.title}, got ${fetchedEvent.title}`);
    }
    console.log('[Test 1] Verified: Content matches.');


    // --- TEST 2: View Event ---
    console.log('\n--- Test 2: View Event ---');
    // publishViewEvent expects a pointer object { type: 'e'|'a', value: hex|address } or a string.
    // We'll use the event ID ('e' tag) for this test.
    const viewPointer = {
        type: 'e',
        value: videoEvent.id
    };

    console.log('[Test 2] Publishing view event...');
    await clientA.publishViewEvent(viewPointer);

    console.log('[Test 2] Polling for view event...');
    // We poll because simple-relay.mjs does not support live subscriptions
    let receivedView = null;
    for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        const views = await clientA.listVideoViewEvents(viewPointer);
        // Find one signed by us
        receivedView = views.find(v => v.pubkey === pkA);
        if (receivedView) break;
    }

    if (!receivedView) {
        throw new Error('View event not found after polling');
    }
    console.log(`[Test 2] View event verified: ${receivedView.id}`);


    // --- TEST 3: Encrypted DM ---
    console.log('\n--- Test 3: Direct Message ---');

    // Client B (Recipient)
    console.log('[Client B] Initializing...');
    const clientB = new NostrClient();
    clientB.relays = [...testRelays];
    clientB.readRelays = [...testRelays];
    clientB.writeRelays = [...testRelays];
    await clientB.init();

    const skB = NostrTools.generateSecretKey();
    const pkB = NostrTools.getPublicKey(skB);
    const hexSkB = NostrTools.utils.bytesToHex(skB);
    const npubB = nip19.npubEncode(pkB);
    console.log(`[Client B] Identity: ${pkB} (${npubB})`);

    await clientB.registerPrivateKeySigner({ privateKey: hexSkB, pubkey: pkB });

    const dmMessage = 'Hello from Client A to Client B ' + Date.now();

    console.log(`[Test 3] Client A sending DM to ${npubB}...`);
    const sendResult = await clientA.sendDirectMessage(npubB, dmMessage);
    if (!sendResult.ok) {
        throw new Error(`Failed to send DM: ${sendResult.error}`);
    }
    console.log('[Test 3] DM Sent.');

    // Wait a bit for relay
    await new Promise(r => setTimeout(r, 500));

    console.log('[Test 3] Client B listing messages...');
    // listDirectMessages uses decryptDirectMessageEvent internally which uses dmDecryptor.js
    // It requires actorPubkeyInput or uses internal session actor.
    // We verified registerPrivateKeySigner sets session actor.
    const messages = await clientB.listDirectMessages(pkB, { limit: 10 });

    const found = messages.find(msg => msg.plaintext === dmMessage);
    if (!found) {
        console.log('Messages found:', messages.map(m => m.plaintext));
        throw new Error('Client B did not receive/decrypt the expected message.');
    }

    console.log(`[Test 3] Verified DM content: "${found.plaintext}"`);
    console.log(`[Test 3] Encryption scheme: ${found.scheme}`);


    console.log('\n--- All Tests Passed ---');

  } catch (error) {
    console.error('\n!!! TEST FAILED !!!');
    console.error(error);
    exitCode = 1;
  } finally {
    console.log('[Cleanup] Killing relay...');
    relayProcess.kill();
    fs.closeSync(relayLog);
  }

  process.exit(exitCode);
}

run();
