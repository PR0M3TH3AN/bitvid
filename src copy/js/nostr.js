// js/nostr.js

import { isDevMode } from './config.js';

const RELAY_URLS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine'
];

class NostrClient {
    constructor() {
        this.pool = new window.NostrTools.SimplePool(); // Access via window
        this.pubkey = null;
        this.relays = RELAY_URLS;
    }

    /**
     * Initializes the Nostr client by connecting to relays.
     */
    async init() {
        try {
            console.log('Connecting to relays...');

            // Test relay connections
            const testFilter = { kinds: [0], limit: 1 }; // Dummy filter for testing
            const connections = this.relays.map(async url => {
                try {
                    const sub = this.pool.sub([url], [testFilter]);
                    sub.on('event', event => console.log(`Test event from ${url}:`, event));
                    sub.on('eose', () => {
                        console.log(`Relay ${url} connected successfully.`);
                        sub.unsub();
                    });
                    return { url, success: true };
                } catch (err) {
                    console.error(`Failed to connect to relay: ${url}`, err.message);
                    return { url, success: false };
                }
            });

            const results = await Promise.all(connections);
            const successfulRelays = results.filter(r => r.success).map(r => r.url);
            if (successfulRelays.length === 0) {
                throw new Error('No relays could be connected.');
            }

            console.log(`Connected to ${successfulRelays.length} relay(s):`, successfulRelays);
        } catch (err) {
            console.error('Failed to initialize Nostr client:', err.message);
            throw err;
        }
    }

    /**
     * Logs in the user using a Nostr extension or by entering an NSEC key.
     * @returns {Promise<string>} The public key of the logged-in user.
     */
    async login() {
        if (window.nostr) {
            try {
                const pubkey = await window.nostr.getPublicKey();
                this.pubkey = pubkey;
                console.log('Logged in with extension. Public key:', this.pubkey);
                return this.pubkey;
            } catch (e) {
                console.warn('Failed to get public key from Nostr extension:', e.message);
                throw new Error('Failed to get public key from Nostr extension.');
            }
        } else {
            const nsec = prompt('Enter your NSEC key:');
            if (nsec) {
                try {
                    this.pubkey = this.decodeNsec(nsec);
                    console.log('Logged in with NSEC. Public key:', this.pubkey);
                    return this.pubkey;
                } catch (error) {
                    console.error('Invalid NSEC key:', error.message);
                    throw new Error('Invalid NSEC key.');
                }
            } else {
                throw new Error('Login cancelled or NSEC key not provided.');
            }
        }
    }

    /**
     * Logs out the user by clearing the public key.
     */
    logout() {
        this.pubkey = null;
        console.log('User logged out.');
    }

    /**
     * Decodes an NSEC key to retrieve the public key.
     * @param {string} nsec - The NSEC key.
     * @returns {string} The corresponding public key.
     */
    decodeNsec(nsec) {
        try {
            const { data } = window.NostrTools.nip19.decode(nsec); // Access via window
            return data;
        } catch (error) {
            throw new Error('Invalid NSEC key.');
        }
    }

    /**
     * Publishes a new video event to all relays.
     * @param {Object} videoData - The video data to publish.
     * @param {string} pubkey - The public key of the user publishing the video.
     * @returns {Promise<Object>} The signed event.
     */
    async publishVideo(videoData, pubkey) {
        if (!pubkey) {
            throw new Error('User is not logged in.');
        }

        const event = {
            kind: 30078,
            pubkey,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['t', 'video']],
            content: JSON.stringify(videoData)
        };

        try {
            const signedEvent = await window.nostr.signEvent(event);
            await Promise.all(this.relays.map(async url => {
                try {
                    await this.pool.publish([url], signedEvent);
                    console.log(`Event published to ${url}`);
                } catch (err) {
                    console.error(`Failed to publish to ${url}:`, err.message);
                }
            }));
            return signedEvent;
        } catch (error) {
            console.error('Failed to sign event:', error.message);
            throw new Error('Failed to sign event.');
        }
    }

    /**
     * Fetches videos from all configured relays, ensuring that only valid video events are included.
     * Filters videos based on the current mode (dev or live).
     * @returns {Promise<Array>} An array of valid video objects.
     */
    async fetchVideos() {
        const filter = {
            kinds: [30078], // Video kind
            limit: 50       // Fetch up to 50 videos
        };
        const videos = new Map(); // Use a Map to ensure unique videos by event ID

        // Initialize summary counters
        const invalidEventSummary = {
            malformedJson: 0,
            invalidFormat: 0
        };

        // Fetch videos from all relays
        await Promise.all(
            this.relays.map(async url => {
                try {
                    const events = await this.pool.list([url], [filter]);
                    events.forEach(event => {
                        try {
                            const content = JSON.parse(event.content);
                            // Filter by mode
                            if (content.mode === (isDevMode ? 'dev' : 'live') && this.isValidVideo(content)) {
                                if (!videos.has(event.id)) { // Ensure uniqueness
                                    videos.set(event.id, {
                                        id: event.id,
                                        title: content.title,
                                        magnet: content.magnet,
                                        thumbnail: content.thumbnail || '',
                                        mode: content.mode,
                                        pubkey: event.pubkey,
                                        created_at: event.created_at,
                                    });
                                }
                            }
                        } catch (jsonError) {
                            invalidEventSummary.malformedJson++;
                            console.error(
                                `Failed to parse video content from ${url}: ${jsonError.message} | Event ID: ${event.id}`
                            );
                        }
                    });
                } catch (relayError) {
                    console.error(`Failed to fetch videos from relay ${url}: ${relayError.message}`);
                }
            })
        );

        // Log a summary of issues
        if (invalidEventSummary.malformedJson > 0) {
            console.warn(`Skipped ${invalidEventSummary.malformedJson} event(s) due to malformed JSON.`);
        }
        if (invalidEventSummary.invalidFormat > 0) {
            console.warn(`Skipped ${invalidEventSummary.invalidFormat} event(s) due to invalid format.`);
        }

        return Array.from(videos.values()); // Return unique videos as an array
    }

    /**
     * Validates the structure of a video content object.
     * @param {Object} content - The content object to validate.
     * @returns {boolean} True if valid, false otherwise.
     */
    isValidVideo(content) {
        return (
            typeof content === 'object' &&
            typeof content.title === 'string' &&
            typeof content.magnet === 'string' &&
            typeof content.mode === 'string' &&
            (typeof content.thumbnail === 'string' || typeof content.thumbnail === 'undefined')
        );
    }
}

// Export the client
export const nostrClient = new NostrClient();
