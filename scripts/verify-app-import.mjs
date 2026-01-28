
import fs from 'fs';
import path from 'path';

async function verifyImports() {
  try {
    console.log("Attempting to import js/app.js...");

    // Polyfills
    if (!global.window) {
        global.window = {
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => {},
            location: { search: '', pathname: '', origin: '' },
            history: { pushState: () => {}, replaceState: () => {} },
            localStorage: { getItem: () => {}, setItem: () => {} },
        };
    }
    if (!global.self) {
        global.self = global.window;
    }
    if (!global.document) {
        global.document = {
            getElementById: () => null,
            addEventListener: () => {},
        };
    }
    if (!global.HTMLElement) {
        global.HTMLElement = class {};
    }

    // Fix navigator issue
    if (!global.navigator) {
        Object.defineProperty(global, 'navigator', {
            value: {
                clipboard: { writeText: () => Promise.resolve() },
                userAgent: 'node',
                serviceWorker: {
                    getRegistrations: () => Promise.resolve([])
                }
            },
            writable: true,
            configurable: true
        });
    }

    // Mock WebSocket
    if (!global.WebSocket) {
        global.WebSocket = class {
            constructor() { this.readyState = 0; }
            close() {}
            send() {}
            addEventListener() {}
        };
    }

    // Mock NostrTools global if needed (app.js checks window.NostrTools)
    global.window.NostrTools = {
        nip19: { decode: () => {}, npubEncode: () => {}, neventEncode: () => {} }
    };

    await import('../js/app.js');
    console.log("Successfully imported js/app.js");

    console.log("Attempting to import js/ui/videoPlaybackController.js...");
    await import('../js/ui/videoPlaybackController.js');
    console.log("Successfully imported js/ui/videoPlaybackController.js");

  } catch (error) {
    console.error("Import verification failed:", error);
    process.exit(1);
  }
}

verifyImports();
