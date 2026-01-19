if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (typeof globalThis.self === "undefined") {
  globalThis.self = globalThis;
}

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class WebSocket {};
}

if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = { userAgent: "node" };
}

if (typeof globalThis.window.WebSocket === "undefined") {
  globalThis.window.WebSocket = globalThis.WebSocket;
}

if (typeof globalThis.window.navigator === "undefined") {
  globalThis.window.navigator = globalThis.navigator;
}

if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

if (typeof globalThis.window.localStorage === "undefined") {
  globalThis.window.localStorage = globalThis.localStorage;
}

if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}
