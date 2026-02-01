
import './setup-test-env.js';
import { NostrClient } from '../../js/nostr/client.js';
import { decryptDM } from '../../js/dmDecryptor.js';
import {
    buildVideoPostEvent,
    buildLegacyDirectMessageEvent,
    buildViewEvent,
    NOTE_TYPES
} from '../../js/nostrEventSchemas.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import fs from 'fs';
import path from 'path';

// Configuration
const TEST_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol'
];

// Artifacts
const ARTIFACTS_DIR = 'artifacts';
const LOG_FILE = path.join(ARTIFACTS_DIR, `interop-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.log`);

// Logger
function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

// Generate Keys
const bytesToHex = (bytes) => Buffer.from(bytes).toString('hex');
const EPHEMERAL_SK_BYTES = generateSecretKey();
const EPHEMERAL_SK = bytesToHex(EPHEMERAL_SK_BYTES);
const EPHEMERAL_PK = getPublicKey(EPHEMERAL_SK_BYTES);

async function runInteropTest() {
    // Ensure artifacts dir
    if (!fs.existsSync(ARTIFACTS_DIR)) {
        fs.mkdirSync(ARTIFACTS_DIR);
    }
    fs.writeFileSync(LOG_FILE, ''); // Clear log

    let nodeClient;
    let exitCode = 0;
    const artifacts = {};

    try {
        log('--- Interop Test Started ---');
        log(`Ephemeral Pubkey: ${EPHEMERAL_PK}`);
        log(`Relays: ${TEST_RELAYS.join(', ')}`);

        // 1. Initialize Node Client
        log('Initializing NostrClient...');
        nodeClient = new NostrClient();
        nodeClient.relays = [...TEST_RELAYS];
        nodeClient.writeRelays = [...TEST_RELAYS];
        nodeClient.readRelays = [...TEST_RELAYS];

        // Register ephemeral signer
        await nodeClient.registerPrivateKeySigner({ privateKey: EPHEMERAL_SK });
        log('Signer registered.');

        // Initialize pool (lazy, but explicit init ensures connection attempts)
        log('Warming up connections...');
        await nodeClient.ensurePool(); // Ensure pool is created

        // 2. Test A: Video Post
        log('Test A: Publishing VIDEO_POST...');
        const videoEventTemplate = buildVideoPostEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            dTagValue: `interop-test-${Date.now()}`,
            content: {
                version: 3,
                title: 'Interop Test Video',
                url: 'https://example.com/video.mp4',
                description: 'A video to verify protocol interoperability.',
                mode: 'live',
                videoRootId: `interop-root-${Date.now()}`
            }
        });

        const { signedEvent: publishedVideo } = await nodeClient.signAndPublishEvent(videoEventTemplate, {
            context: 'interop-video'
        });
        log(`Published Video ID: ${publishedVideo.id}`);
        artifacts.videoEventId = publishedVideo.id;

        // Fetch back verification with Retry
        log('Verifying Video Post (fetch by ID)...');
        let fetchedVideo = null;
        const maxRetries = 5;
        const initialDelay = 2000;

        for (let i = 0; i < maxRetries; i++) {
            const delay = initialDelay * (i + 1);
            log(`Attempt ${i + 1}/${maxRetries}: Waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));

            try {
                fetchedVideo = await nodeClient.fetchRawEventById(publishedVideo.id);
                if (fetchedVideo) {
                    log('Video event found!');
                    break;
                }
            } catch (e) {
                log(`Fetch attempt failed: ${e.message}`);
            }
        }

        if (!fetchedVideo) {
            throw new Error(`Failed to fetch video event ${publishedVideo.id} after ${maxRetries} retries.`);
        }
        if (fetchedVideo.content !== publishedVideo.content) {
            throw new Error('Fetched video content mismatch.');
        }
        log('Video Post verified successfully.');


        // 3. Test B: View Event
        log('Test B: Publishing VIEW_EVENT...');
        const viewEventTemplate = buildViewEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            pointerValue: publishedVideo.id, // Pointing to the video we just created
            pointerTag: ['e', publishedVideo.id],
            includeSessionTag: true // simulate session
        });

        const { signedEvent: publishedView } = await nodeClient.signAndPublishEvent(viewEventTemplate, {
            context: 'interop-view'
        });
        log(`Published View Event ID: ${publishedView.id}`);
        artifacts.viewEventId = publishedView.id;

        // No fetch back for view event to save time, assuming if Video worked, this works too.
        log('View Event published.');


        // 4. Test C: Direct Message (Legacy NIP-04)
        log('Test C: Publishing Encrypted DM...');
        const dmMessage = "Interop Test Secret Message";
        const signer = await nodeClient.ensureActiveSignerForPubkey(EPHEMERAL_PK);

        // Encrypt (Self-DM)
        const ciphertext = await signer.nip04Encrypt(EPHEMERAL_PK, dmMessage);

        const dmTemplate = buildLegacyDirectMessageEvent({
            pubkey: EPHEMERAL_PK,
            created_at: Math.floor(Date.now() / 1000),
            recipientPubkey: EPHEMERAL_PK,
            ciphertext: ciphertext
        });

        const { signedEvent: publishedDM } = await nodeClient.signAndPublishEvent(dmTemplate, {
            context: 'interop-dm'
        });
        log(`Published DM ID: ${publishedDM.id}`);
        artifacts.dmEventId = publishedDM.id;

        // Fetch and Decrypt with Retry
        log('Verifying DM Decryption...');
        let fetchedDM = null;
        for (let i = 0; i < maxRetries; i++) {
            const delay = initialDelay * (i + 1);
            log(`Attempt ${i + 1}/${maxRetries}: Waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));

            try {
                fetchedDM = await nodeClient.fetchRawEventById(publishedDM.id);
                if (fetchedDM) {
                    log('DM event found!');
                    break;
                }
            } catch (e) {
                log(`Fetch attempt failed: ${e.message}`);
            }
        }

        if (!fetchedDM) {
            throw new Error(`Failed to fetch DM event ${publishedDM.id} after ${maxRetries} retries.`);
        }

        const decryptContext = await nodeClient.buildDmDecryptContext(EPHEMERAL_PK);
        const decryptionResult = await decryptDM(fetchedDM, decryptContext);

        if (!decryptionResult.ok) {
            log(`Decryption failed: ${JSON.stringify(decryptionResult.errors)}`);
            throw new Error('DM Decryption failed.');
        }

        if (decryptionResult.plaintext !== dmMessage) {
            throw new Error(`Decryption mismatch. Expected "${dmMessage}", got "${decryptionResult.plaintext}"`);
        }
        log(`DM Decrypted successfully: "${decryptionResult.plaintext}"`);

        log('--- Interop Test PASSED ---');

        // Save Summary
        const summary = {
            timestamp: new Date().toISOString(),
            status: "success",
            relays: TEST_RELAYS,
            ephemeralPubkey: EPHEMERAL_PK,
            artifacts
        };
        const summaryFile = path.join(ARTIFACTS_DIR, `interop-summary-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`);
        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
        log(`Summary saved to ${summaryFile}`);

    } catch (err) {
        log(`--- Interop Test FAILED: ${err.message} ---`);
        if (err.stack) log(err.stack);
        exitCode = 1;

        // Save Failure Summary
        const summary = {
            timestamp: new Date().toISOString(),
            status: "failed",
            error: err.message,
            relays: TEST_RELAYS,
            ephemeralPubkey: EPHEMERAL_PK,
            artifacts
        };
        const summaryFile = path.join(ARTIFACTS_DIR, `interop-summary-${new Date().toISOString().split('T')[0].replace(/-/g, '')}.json`);
        fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

    } finally {
        log('Cleaning up...');
        if (nodeClient && nodeClient.pool) {
             // Close pool connections if possible (NostrTools SimplePool might not expose close easily in all versions,
             // but we can try client logic if implemented or just exit)
             // The client logic might not fully close sockets immediately, process.exit will handle it.
        }
        process.exit(exitCode);
    }
}

runInteropTest();
