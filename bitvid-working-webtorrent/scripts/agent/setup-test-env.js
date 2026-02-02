import WebSocket from 'ws';
import { webcrypto } from 'node:crypto';

// Polyfill WebSocket
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

// Polyfill window and self
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

// Polyfill crypto
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto;
}

// Polyfill localStorage
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

if (typeof globalThis.window.localStorage === 'undefined') {
    globalThis.window.localStorage = globalThis.localStorage;
}

// Mock navigator
if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = { userAgent: 'node' };
}
