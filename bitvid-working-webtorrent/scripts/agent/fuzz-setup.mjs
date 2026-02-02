import crypto from 'node:crypto';

// Mock localStorage
const localStorageStore = new Map();
const localStorageMock = {
  getItem: (key) => localStorageStore.get(String(key)) ?? null,
  setItem: (key, value) => localStorageStore.set(String(key), String(value)),
  removeItem: (key) => localStorageStore.delete(String(key)),
  clear: () => localStorageStore.clear(),
  key: (index) => Array.from(localStorageStore.keys())[index] ?? null,
  get length() {
    return localStorageStore.size;
  },
};

// Mock window
const windowMock = {
  localStorage: localStorageMock,
  crypto: {
    getRandomValues: (buffer) => crypto.getRandomValues(buffer),
    subtle: crypto.webcrypto.subtle,
  },
  location: {
    protocol: 'https:',
    hostname: 'bitvid.network',
    href: 'https://bitvid.network/',
  },
};

// Polyfill globals
if (typeof globalThis.window === 'undefined') {
  globalThis.window = windowMock;
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = localStorageMock;
}

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = windowMock.crypto;
}

if (typeof globalThis.WebSocket === 'undefined') {
    globalThis.WebSocket = class WebSocket {
        constructor(url) {
            this.url = url;
            this.readyState = 0;
        }
        send() {}
        close() {}
    };
}

// Mock bitvid-specific globals if needed (though config.js sets them on window)
globalThis.bitvidNostrEventOverrides = {};
