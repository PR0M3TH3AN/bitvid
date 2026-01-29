
import { WebSocket } from 'ws';
if (!global.WebSocket) {
    global.WebSocket = WebSocket;
}

import { NostrClient, resolveActiveSigner } from '../../js/nostr/client.js';
import { startRelay } from './load-test-relay.mjs';
import {
    buildVideoPostEvent,
    buildViewEvent,
    buildLegacyDirectMessageEvent,
    NOTE_TYPES
} from '../../js/nostrEventSchemas.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex } from '../../vendor/crypto-helpers.bundle.min.js';

// Configuration
const RELAY_PORT = 8899;
const RELAY_URL = `ws://localhost:${RELAY_PORT}`;
const EPHEMERAL_SK_BYTES = generateSecretKey();
const EPHEMERAL_SK = bytesToHex(EPHEMERAL_SK_BYTES);
const EPHEMERAL_PK = getPublicKey(EPHEMERAL_SK_BYTES);

console.log(`[Setup] Generated Ephemeral Public Key: ${EPHEMERAL_PK}`);

async function runInteropTests() {
    let relayServer;
    let client;

    try {
        // 1. Start Local Relay
        console.log('[Setup] Starting local test relay...');
        relayServer = startRelay(RELAY_PORT);

        // 2. Initialize Client
        console.log('[Setup] Initializing NostrClient...');
        client = new NostrClient();
        client.relays = [RELAY_URL];
        client.writeRelays = [RELAY_URL];
        client.readRelays = [RELAY_URL];

        // Register signer
        await client.registerPrivateKeySigner({ privateKey: EPHEMERAL_SK });
        console.log('[Setup] Registered private key signer.');

        // Init client (connects to relay)
        await client.init();
        console.log('[Setup] Client initialized and connected.');

        // --- Test A: Video Post ---
        console.log('\n[Test A] Video Post Event Roundtrip');
        const videoContent = {
            version: 3,
            title: 'Interop Test Video',
            url: 'https://example.com/video.mp4',
            description: 'A test video for interoperability verification.',
            mode: 'live',
            videoRootId: 'interop-test-root-1'
        };

        const videoEventTemplate = buildVideoPostEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            dTagValue: 'interop-test-root-1', // Using rootId as d-tag for simplicity
            content: videoContent
        });

        console.log('[Test A] Publishing Video Post...');
        const { signedEvent: publishedVideo } = await client.signAndPublishEvent(videoEventTemplate, {
            context: 'test-video-post'
        });

        if (!publishedVideo || !publishedVideo.id) {
            throw new Error('[Test A] Failed to publish video event (no ID returned).');
        }
        console.log(`[Test A] Published Video Event ID: ${publishedVideo.id}`);

        // Fetch back
        console.log('[Test A] Fetching event back...');
        // Small delay to ensure relay processing
        await new Promise(r => setTimeout(r, 200));

        const fetchedVideo = await client.getEventById(publishedVideo.id, { includeRaw: true });

        if (!fetchedVideo) {
            throw new Error('[Test A] Failed to fetch video event back from relay.');
        }

        const rawVideoEvent = fetchedVideo.rawEvent || fetchedVideo; // handle if getEventById returns raw or object wrapper

        if (rawVideoEvent.id !== publishedVideo.id) {
            throw new Error(`[Test A] ID mismatch: expected ${publishedVideo.id}, got ${rawVideoEvent.id}`);
        }

        // Validate content shape (simplified check)
        const parsedContent = typeof rawVideoEvent.content === 'string' ? JSON.parse(rawVideoEvent.content) : rawVideoEvent.content;
        if (parsedContent.title !== videoContent.title) {
             throw new Error(`[Test A] Content mismatch: expected title "${videoContent.title}", got "${parsedContent.title}"`);
        }

        console.log('[Test A] SUCCESS: Video Post roundtrip verified.');


        // --- Test B: View Event ---
        console.log('\n[Test B] View Event Visibility');
        const viewEventTemplate = buildViewEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            pointerValue: 'interop-test-root-1', // referencing the video we just created
            pointerTag: ['d', 'interop-test-root-1']
        });

        console.log('[Test B] Publishing View Event...');
        const { signedEvent: publishedView } = await client.signAndPublishEvent(viewEventTemplate, {
             context: 'test-view-event'
        });

         if (!publishedView || !publishedView.id) {
            throw new Error('[Test B] Failed to publish view event.');
        }
        console.log(`[Test B] Published View Event ID: ${publishedView.id}`);

        // Fetch back to verify
        await new Promise(r => setTimeout(r, 200));
        const fetchedView = await client.fetchRawEventById(publishedView.id);
         if (!fetchedView) {
            throw new Error('[Test B] Failed to fetch view event back.');
        }
        console.log('[Test B] SUCCESS: View Event verified.');


        // --- Test C: Encrypted DM ---
        console.log('\n[Test C] Encrypted DM Roundtrip (Self-DM)');
        const dmMessage = "This is a secret interop message.";

        // 1. Encrypt
        const signer = resolveActiveSigner(EPHEMERAL_PK);
        if (!signer || typeof signer.nip04Encrypt !== 'function') {
             throw new Error('[Test C] Signer does not support NIP-04 encryption.');
        }

        console.log('[Test C] Encrypting message...');
        const ciphertext = await signer.nip04Encrypt(EPHEMERAL_PK, dmMessage);

        // 2. Build Event
        const dmTemplate = buildLegacyDirectMessageEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            recipientPubkey: EPHEMERAL_PK,
            ciphertext: ciphertext
        });

        // 3. Publish
        console.log('[Test C] Publishing DM...');
        const { signedEvent: publishedDM } = await client.signAndPublishEvent(dmTemplate, {
            context: 'test-dm'
        });
        console.log(`[Test C] Published DM Event ID: ${publishedDM.id}`);

        // 4. Fetch
        await new Promise(r => setTimeout(r, 200));
        const fetchedDM = await client.fetchRawEventById(publishedDM.id);
        if (!fetchedDM) {
             throw new Error('[Test C] Failed to fetch DM event.');
        }

        // 5. Decrypt using dmDecryptor.js helper
        console.log('[Test C] Attempting decryption...');

        // We need to construct the context expected by decryptDM
        // It expects { actorPubkey, decryptors }
        // We can reuse client.buildDmDecryptContext, but let's do it manually to test the decryptor isolation if possible,
        // or just use the client helper to ensure we are testing the full stack availability.
        // Let's use `client.decryptDirectMessageEvent` which wraps `decryptDM`.
        // But the prompt asked to "attempt decryption using the appropriate decryptor helper (see js/dmDecryptor.js / docs)".
        // So I'll call decryptDM directly to verify strict compliance with that instruction.

        const decryptContext = await client.buildDmDecryptContext(EPHEMERAL_PK);
        const decryptionResult = await decryptDM(fetchedDM, decryptContext);

        if (!decryptionResult.ok) {
            console.error('[Test C] Decryption errors:', decryptionResult.errors);
            throw new Error('[Test C] Decryption failed.');
        }

        if (decryptionResult.plaintext !== dmMessage) {
             throw new Error(`[Test C] Decryption mismatch: expected "${dmMessage}", got "${decryptionResult.plaintext}"`);
        }

        console.log(`[Test C] Decrypted text: "${decryptionResult.plaintext}"`);
        console.log('[Test C] SUCCESS: Encrypted DM roundtrip verified.');


    } catch (err) {
        console.error('\n[Error] Test failed:', err);
        process.exit(1);
    } finally {
        console.log('\n[Teardown] Cleaning up...');
        if (client && client.pool) {
             // Close pool connections to allow exit
             if (typeof client.pool.close === 'function') {
                 client.pool.close(client.relays);
             }
        }
        if (relayServer) {
            await relayServer.close();
            console.log('[Teardown] Local relay stopped.');
        }
        console.log('[Teardown] Done.');
        process.exit(0);
    }
}

runInteropTests();
