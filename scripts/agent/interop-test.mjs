import { WebSocket } from 'ws';
import * as NostrTools from 'nostr-tools';

if (!global.WebSocket) {
    global.WebSocket = WebSocket;
}

// Mock localStorage to suppress config.js warnings
if (!global.localStorage) {
    global.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
    };
}

// Setup basic logging
const log = (msg) => console.log(`[TEST] ${msg}`);
const err = (msg, e) => console.error(`[TEST] ${msg}`, e);

// Configuration
const TEST_RELAYS = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.snort.social"
];

// Hex helper
const toHex = (bytes) => Buffer.from(bytes).toString('hex');

// Polling helper
async function waitForEvent(client, eventId, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const event = await client.getEventById(eventId);
        if (event) return event;
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`Timeout waiting for event ${eventId}`);
}

async function runTests() {
    try {
        // Dynamic imports to ensure mocks are applied before modules load
        const { NostrClient } = await import('../../js/nostr/defaultClient.js');
        const {
            buildVideoPostEvent,
            buildViewEvent,
        } = await import('../../js/nostrEventSchemas.js');

        // Helper to gen keypair
        const genKeypair = () => {
            let skBytes = NostrTools.generateSecretKey();
            let sk = toHex(skBytes);
            let pk = NostrTools.getPublicKey(sk); // Assumes hex input works or throws, but we'll try standard
            // In v2, getPublicKey usually takes Uint8Array.
            // If previous run worked with hex string, good.
            // If not, we should pass skBytes.
            // NostrClient source suggests it handles string input via tools wrapper, but let's be safe.
            try {
                pk = NostrTools.getPublicKey(skBytes);
            } catch(e) {
                pk = NostrTools.getPublicKey(sk);
            }
            return { sk, pk };
        }

        log("Generating ephemeral keys (Alice)...");
        const alice = genKeypair();
        log(`Alice Pubkey: ${alice.pk}`);

        log("Generating ephemeral keys (Bob)...");
        const bob = genKeypair();
        log(`Bob Pubkey: ${bob.pk}`);

        log("Initializing NostrClient...");
        const client = new NostrClient();
        client.relays = TEST_RELAYS;

        await client.init();
        log("Client initialized.");

        // Register signer as Alice
        await client.registerPrivateKeySigner({ privateKey: alice.sk, pubkey: alice.pk });
        log("Registered as Alice.");

        // 1. Video Post
        log("--- Test Case 1: Video Post (Alice) ---");
        const videoRootId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const dTagValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const created_at = Math.floor(Date.now() / 1000);

        const videoContent = {
            version: 3,
            title: "Interop Test Video",
            videoRootId: videoRootId,
            description: "Test video for interoperability check.",
            url: "https://example.com/video.mp4",
            mode: "live"
        };

        const videoEvent = buildVideoPostEvent({
            pubkey: alice.pk,
            created_at,
            dTagValue,
            content: videoContent
        });

        log("Publishing Video Post...");
        const { signedEvent: publishedVideo } = await client.signAndPublishEvent(videoEvent);
        if (!publishedVideo || !publishedVideo.id || !publishedVideo.sig) {
             throw new Error("Failed to sign/publish video event");
        }
        log(`Published Video Event ID: ${publishedVideo.id}`);

        log("Fetching Video Event back...");
        const fetchedVideo = await waitForEvent(client, publishedVideo.id);
        if (fetchedVideo.id !== publishedVideo.id) {
             throw new Error(`Fetched event ID mismatch. Expected ${publishedVideo.id}, got ${fetchedVideo.id}`);
        }
        log("Verified Video Post roundtrip.");

        // 2. View Event
        log("--- Test Case 2: View Event (Alice) ---");
        const viewEvent = buildViewEvent({
            pubkey: alice.pk,
            created_at: Math.floor(Date.now() / 1000),
            pointerValue: publishedVideo.id,
            pointerTag: ["e", publishedVideo.id],
            content: "Interop View Test",
            dedupeTag: `view-${Date.now()}-${Math.random().toString(36).slice(2)}`
        });

        log("Publishing View Event...");
        const { signedEvent: publishedView } = await client.signAndPublishEvent(viewEvent);
        if (!publishedView || !publishedView.id) {
            throw new Error("Failed to publish view event");
        }
        log(`Published View Event ID: ${publishedView.id}`);

        log("Verifying View Event visibility...");
        await waitForEvent(client, publishedView.id);
        log("Verified View Event roundtrip.");

        // 3. DM
        log("--- Test Case 3: Direct Message (Alice -> Bob) ---");
        const dmMessage = `Test DM ${Date.now()}`;
        const bobNpub = NostrTools.nip19.npubEncode(bob.pk);

        log(`Sending DM from Alice to Bob (${bobNpub}): "${dmMessage}"`);
        const sendResult = await client.sendDirectMessage(bobNpub, dmMessage);
        if (!sendResult.ok) {
            throw new Error(`Failed to send DM: ${sendResult.error}`);
        }
        log("DM sent.");

        log("Switching to Bob to receive...");
        await client.registerPrivateKeySigner({ privateKey: bob.sk, pubkey: bob.pk });
        log("Registered as Bob.");

        log("Waiting for DM...");
        // Poll for DMs
        const start = Date.now();
        let foundDm = null;
        while (Date.now() - start < 20000) {
            const dms = await client.listDirectMessages();
            const match = dms.find(dm => dm.plaintext === dmMessage && dm.sender?.pubkey === alice.pk);
            if (match) {
                foundDm = match;
                break;
            }
            log(" DM not found yet, retrying...");
            await new Promise(r => setTimeout(r, 2000));
        }

        if (!foundDm) {
            throw new Error("Timeout: Bob could not find the sent DM.");
        }
        log(`Bob received and decrypted DM: "${foundDm.plaintext}" from Alice.`);

        log("All tests passed!");
        process.exit(0);

    } catch (e) {
        err("Test failed", e);
        process.exit(1);
    }
}

runTests();
