if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
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
