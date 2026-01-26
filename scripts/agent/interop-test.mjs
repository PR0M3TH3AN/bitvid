
import WebSocket from 'ws';
import crypto from 'node:crypto';
import * as NostrTools from 'nostr-tools';

// Polyfills
global.WebSocket = WebSocket;
// Node 19+ has global.crypto. If not, polyfill it.
if (!global.crypto) {
    global.crypto = crypto;
}
global.window = {
  crypto: global.crypto,
  localStorage: {
    _store: new Map(),
    getItem: (key) => global.window.localStorage._store.get(String(key)) || null,
    setItem: (key, value) => global.window.localStorage._store.set(String(key), String(value)),
    removeItem: (key) => global.window.localStorage._store.delete(String(key)),
    clear: () => global.window.localStorage._store.clear(),
  },
  location: { href: 'http://localhost' },
};
global.self = global.window;
global.localStorage = global.window.localStorage;
globalThis.localStorage = global.window.localStorage; // Ensure globalThis has it
global.NostrTools = NostrTools;

// Helpers
const bytesToHex = (bytes) => {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

async function runTests() {
  console.log('Starting Protocol & Interop Tests...');

  // Import application modules after polyfills are set
  const { NostrClient } = await import('../../js/nostr/client.js');
  const { buildVideoPostEvent, buildViewEvent } = await import('../../js/nostrEventSchemas.js');

  // 1. Setup Client
  const client = new NostrClient();

  // Use test relays
  const TEST_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
  ];
  client.relays = TEST_RELAYS;
  client.readRelays = TEST_RELAYS;
  client.writeRelays = TEST_RELAYS;

  console.log('Client initialized with relays:', TEST_RELAYS);

  // 2. Generate Ephemeral Keys
  const sk = NostrTools.generateSecretKey();
  const skHex = bytesToHex(sk);
  const pk = NostrTools.getPublicKey(sk);
  console.log('Generated ephemeral identity:', pk);

  // 3. Register Signer
  await client.registerPrivateKeySigner({
    privateKey: skHex,
    pubkey: pk,
  });
  console.log('Signer registered.');

  // 4. Initialize Network
  await client.init();
  console.log('Client connected.');

  try {
    // --- Test A: Video Post ---
    console.log('\n--- Test A: Video Post ---');

    // Explicitly use schema builder
    const dTagValue = 'interop-test-' + Date.now();
    const contentPayload = {
      version: 3,
      title: 'Interop Test Video ' + Date.now(),
      description: 'This is an automated interoperability test event.',
      url: 'https://example.com/video.mp4',
      magnet: 'magnet:?xt=urn:btih:c9e15763f722f23e98cb6d93612d78af6e827cba&dn=test',
      thumbnail: 'https://example.com/thumb.jpg',
      mode: 'dev',
      videoRootId: dTagValue, // Simple root ID for testing
      deleted: false,
      isPrivate: false,
      isNsfw: false,
      isForKids: false,
      enableComments: true,
    };

    const videoEvent = buildVideoPostEvent({
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        dTagValue: dTagValue,
        content: contentPayload,
    });

    console.log('Publishing video event built from schema...');
    // Use signAndPublishEvent directly
    const { signedEvent } = await client.signAndPublishEvent(videoEvent);
    console.log('Published event ID:', signedEvent.id);

    // Verify
    console.log('Fetching event back...');
    const fetchedEvent = await client.getEventById(signedEvent.id);
    if (fetchedEvent && fetchedEvent.id === signedEvent.id) {
        console.log('✅ Video event fetched and verified.');
        if (fetchedEvent.title === contentPayload.title) {
            console.log('✅ Content matches.');
        } else {
            console.error('❌ Content mismatch:', fetchedEvent.title, 'vs', contentPayload.title);
        }
    } else {
        console.error('❌ Failed to fetch video event.');
    }

    // --- Test B: View Event ---
    console.log('\n--- Test B: View Event ---');
    // Explicitly use schema builder
    const viewEvent = buildViewEvent({
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        pointerTag: ['e', signedEvent.id],
        content: 'test-view-interop'
    });

    console.log('Publishing view event built from schema...');
    try {
        const { signedEvent: signedView } = await client.signAndPublishEvent(viewEvent);
        console.log('✅ View event published.', signedView.id);
    } catch (err) {
        console.error('❌ View event publish failed:', err);
    }

    // --- Test C: Direct Message ---
    console.log('\n--- Test C: Direct Message ---');
    const recipientSk = NostrTools.generateSecretKey();
    const recipientPk = NostrTools.getPublicKey(recipientSk);
    const recipientNpub = NostrTools.nip19.npubEncode(recipientPk);
    console.log('Generated recipient:', recipientPk);

    const dmMessage = 'Hello from Interop Test ' + Date.now();
    console.log('Sending DM to recipient...');

    // We use client.sendDirectMessage as it encapsulates encryption logic (NIP-04/17)
    // which is part of the protocol verification we want to test.
    const dmResult = await client.sendDirectMessage(recipientNpub, dmMessage);

    if (dmResult.ok) {
        console.log('✅ DM sent successfully.');
    } else {
        console.error('❌ DM send failed:', dmResult);
    }

    // Verification - list messages
    console.log('Listing DMs...');
    // Allow some time for propagation
    await new Promise(r => setTimeout(r, 2000));

    const messages = await client.listDirectMessages();
    const found = messages.find(m => m.plaintext === dmMessage);

    if (found) {
        console.log('✅ DM found and decrypted.');
    } else {
        console.error('❌ DM not found in list or decryption failed.');
        console.log('Messages found:', messages.length);
        if (messages.length > 0) {
            console.log('First message plain:', messages[0].plaintext);
        }
    }

  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('\nCleaning up...');
    if (client.pool) {
        try {
            if (typeof client.pool.close === 'function') {
                client.pool.close(client.relays);
            }
        } catch (e) {
            console.warn('Error closing pool:', e);
        }
    }
    process.exit(0);
  }
}

runTests();
