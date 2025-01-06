// js/nostr.js

import { isDevMode } from './config.js';

const RELAY_URLS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine'
];

// Rate limiting for error logs
let errorLogCount = 0;
const MAX_ERROR_LOGS = 100; // Adjust as needed

function logErrorOnce(message, eventContent = null) {
    if (errorLogCount < MAX_ERROR_LOGS) {
        console.error(message);
        if (eventContent) {
            console.log(`Event Content: ${eventContent}`);
        }
        errorLogCount++;
    }
    if (errorLogCount === MAX_ERROR_LOGS) {
        console.error('Maximum error log limit reached. Further errors will be suppressed.');
    }
}

class NostrClient {
    constructor() {
        this.pool = null;  // Initialize to null, we'll create it in init()
        this.pubkey = null;
        this.relays = RELAY_URLS;
    }

    /**
     * Initializes the Nostr client by connecting to relays.
     */
    async init() {
        try {
            if (isDevMode) console.log('Connecting to relays...');
            
            // Initialize the pool
            this.pool = new window.NostrTools.SimplePool();

            // Test relay connections
            const testFilter = { kinds: [0], limit: 1 }; // Dummy filter for testing
            const connections = this.relays.map(async url => {
                try {
                    return new Promise((resolve) => {
                        const sub = this.pool.sub([url], [testFilter]);
                        
                        // Set a timeout for connection attempts
                        let timeout = setTimeout(() => {
                            sub.unsub();
                            if (isDevMode) console.log(`Connection timeout for ${url}`);
                            resolve({ url, success: false });
                        }, 5000);

                        sub.on('event', () => {
                            clearTimeout(timeout);
                            sub.unsub();
                            if (isDevMode) console.log(`Received event from ${url}`);
                            resolve({ url, success: true });
                        });

                        sub.on('eose', () => {
                            clearTimeout(timeout);
                            sub.unsub();
                            if (isDevMode) console.log(`EOSE from ${url}`);
                            resolve({ url, success: true });
                        });
                    });
                } catch (err) {
                    if (isDevMode) console.error(`Failed to connect to relay: ${url}`, err.message);
                    return { url, success: false };
                }
            });

            const results = await Promise.all(connections);
            const successfulRelays = results.filter(r => r.success).map(r => r.url);
            
            if (successfulRelays.length === 0) {
                throw new Error('No relays could be connected.');
            }

            if (isDevMode) console.log(`Connected to ${successfulRelays.length} relay(s):`, successfulRelays);
        } catch (err) {
            console.error('Failed to initialize Nostr client:', err.message);
            throw err;
        }
    }

    /**
     * Logs in the user using a Nostr extension or by entering an NSEC key.
     */
    async login() {
        if (window.nostr) {
            try {
                const pubkey = await window.nostr.getPublicKey();
                this.pubkey = pubkey;
                if (isDevMode) console.log('Logged in with extension. Public key:', this.pubkey);
                return this.pubkey;
            } catch (e) {
                if (isDevMode) console.warn('Failed to get public key from Nostr extension:', e.message);
                throw new Error('Failed to get public key from Nostr extension.');
            }
        } else {
            const nsec = prompt('Enter your NSEC key:');
            if (nsec) {
                try {
                    this.pubkey = this.decodeNsec(nsec);
                    if (isDevMode) console.log('Logged in with NSEC. Public key:', this.pubkey);
                    return this.pubkey;
                } catch (error) {
                    if (isDevMode) console.error('Invalid NSEC key:', error.message);
                    throw new Error('Invalid NSEC key.');
                }
            } else {
                throw new Error('Login cancelled or NSEC key not provided.');
            }
        }
    }

    /**
     * Logs out the user.
     */
    logout() {
        this.pubkey = null;
        if (isDevMode) console.log('User logged out.');
    }

    /**
     * Decodes an NSEC key.
     */
    decodeNsec(nsec) {
        try {
            const { data } = window.NostrTools.nip19.decode(nsec);
            return data;
        } catch (error) {
            throw new Error('Invalid NSEC key.');
        }
    }

    /**
     * Publishes a new video event to all relays.
     */
    async publishVideo(videoData, pubkey) {
        if (!pubkey) {
            throw new Error('User is not logged in.');
        }
    
        // Debugging Log: Check videoData
        if (isDevMode) {
            console.log('Publishing video with data:', videoData);
        }
    
        // Generate a unique "d" tag for this event to prevent overwriting
        const uniqueD = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    
        // Construct the event object
        const event = {
            kind: 30078,
            pubkey,
            created_at: Math.floor(Date.now() / 1000),
            // Keep your original 't=video' tag
            // Add a new 'd' tag using a unique value
            tags: [
                ['t', 'video'],
                ['d', uniqueD]
            ],
            // Include the JSON content (title, magnet, description, etc.)
            content: JSON.stringify(videoData)
        };
    
        // Debugging Log: Check stringified content
        if (isDevMode) {
            console.log('Event content after stringify:', event.content);
            console.log('Using d tag:', uniqueD);
        }
    
        try {
            // Sign the event with Nostr extension (or other method)
            const signedEvent = await window.nostr.signEvent(event);
    
            // Debugging Log: Check signed event
            if (isDevMode) {
                console.log('Signed event:', signedEvent);
            }
    
            // Publish signed event to all configured relays
            await Promise.all(this.relays.map(async url => {
                try {
                    await this.pool.publish([url], signedEvent);
                    if (isDevMode) {
                        console.log(`Event published to ${url}`);
                    }
                } catch (err) {
                    if (isDevMode) {
                        console.error(`Failed to publish to ${url}:`, err.message);
                    }
                }
            }));
    
            // Return the signed event for any further handling
            return signedEvent;
    
        } catch (error) {
            if (isDevMode) {
                console.error('Failed to sign event:', error.message);
            }
            throw new Error('Failed to sign event.');
        }
    }
       
    /**
     * Fetches videos from all configured relays.
     */
    async fetchVideos() {
        const filter = {
            kinds: [30078],    // The kind you use for video notes
            '#t': ['video'],   // Tag "t" must include "video"
            limit: 1000,       // Large limit to capture many events
            since: 0           // Fetch from the earliest possible event
        };
      
        // Use a Map so duplicates (same event ID) across multiple relays don't overwrite each other
        const videoEvents = new Map();

        // Optional: Only log if in dev mode (to avoid flooding console in production).
        if (isDevMode) {
            console.log('[fetchVideos] Starting fetch from all relays...');
            console.log('[fetchVideos] Filter:', filter);
        }

        try {
            // Fetch from each relay in parallel
            await Promise.all(
                this.relays.map(async (url) => {
                    // Log relay being queried
                    if (isDevMode) console.log(`[fetchVideos] Querying relay: ${url}`);
                    
                    try {
                        const events = await this.pool.list([url], [filter]);
                        
                        // How many events came back from this relay?
                        if (isDevMode) {
                            console.log(`Events from ${url}:`, events.length);
                        }
                        
                        // For deeper insight, you can log each event
                        if (isDevMode && events.length > 0) {
                            events.forEach((evt, idx) => {
                                console.log(
                                    `[fetchVideos] [${url}] Event[${idx}] ID: ${evt.id} | pubkey: ${evt.pubkey} | created_at: ${evt.created_at}`
                                );
                            });
                        }
                        
                        // Process each event
                        events.forEach(event => {
                            try {
                                const content = JSON.parse(event.content);

                                // Only add if we haven't seen this event.id before
                                if (!videoEvents.has(event.id)) {
                                    videoEvents.set(event.id, {
                                        id: event.id,
                                        title: content.title || '',
                                        magnet: content.magnet || '',
                                        thumbnail: content.thumbnail || '',
                                        description: content.description || '',
                                        mode: content.mode || 'live',
                                        pubkey: event.pubkey,
                                        created_at: event.created_at
                                    });
                                }
                            } catch (parseError) {
                                if (isDevMode) {
                                    console.error('[fetchVideos] Event parsing error:', parseError);
                                }
                            }
                        });
                    } catch (relayError) {
                        if (isDevMode) {
                            console.error(`[fetchVideos] Error fetching from ${url}:`, relayError);
                        }
                    }
                })
            );

            // Convert Map to array and sort by creation time (descending)
            const videos = Array.from(videoEvents.values())
                .sort((a, b) => b.created_at - a.created_at);

            if (isDevMode) {
                console.log('[fetchVideos] All relays have responded.');
                console.log(`[fetchVideos] Total unique video events: ${videoEvents.size}`);
                console.log(
                    '[fetchVideos] Final videos array (sorted):',
                    videos.map(v => ({
                        title: v.title,
                        pubkey: v.pubkey,
                        created_at: new Date(v.created_at * 1000).toISOString()
                    }))
                );
            }

            return videos;
        } catch (error) {
            if (isDevMode) {
                console.error('FETCH VIDEOS ERROR:', error);
            }
            return [];
        }
    }

    /**
     * Validates video content structure.
     */
    isValidVideo(content) {
        try {
            const isValid = (
                content &&
                typeof content === 'object' &&
                typeof content.title === 'string' &&
                content.title.length > 0 &&
                typeof content.magnet === 'string' &&
                content.magnet.length > 0 &&
                typeof content.mode === 'string' &&
                ['dev', 'live'].includes(content.mode) &&
                (typeof content.thumbnail === 'string' || typeof content.thumbnail === 'undefined') &&
                (typeof content.description === 'string' || typeof content.description === 'undefined') // Ensure description is optional
            );

            if (isDevMode && !isValid) {
                console.log('Invalid video content:', content);
                console.log('Validation details:', {
                    hasTitle: typeof content.title === 'string',
                    hasMagnet: typeof content.magnet === 'string',
                    hasMode: typeof content.mode === 'string',
                    validThumbnail: typeof content.thumbnail === 'string' || typeof content.thumbnail === 'undefined',
                    validDescription: typeof content.description === 'string' || typeof content.description === 'undefined'
                });
            }

            return isValid;
        } catch (error) {
            if (isDevMode) {
                console.error('Error validating video:', error);
            }
            return false;
        }
    }
}

export const nostrClient = new NostrClient();
