import test from "node:test";
import assert from "node:assert/strict";

import createProfileSettingsStore from "../../js/state/profileSettingsStore.js";

function createClone(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  return { ...value };
}

test("profile settings store clones values and tracks entries", () => {
  const store = createProfileSettingsStore({ clone: createClone });
  const first = { uri: "nostr+walletconnect://pub1" };
  const second = { uri: "nostr+walletconnect://pub2" };

  const result = store.set("pub1", first);
  assert.strictEqual(result, store, "set() should return the store instance");
  assert.equal(store.size, 1);

  store.set("pub2", second);
  assert.equal(store.size, 2);

  const fromFirst = store.get("pub1");
  assert.deepEqual(fromFirst, first);
  assert.notStrictEqual(
    fromFirst,
    first,
    "get() should return a cloned copy to avoid external mutation",
  );

  fromFirst.uri = "mutated";
  const reloaded = store.get("pub1");
  assert.equal(
    reloaded.uri,
    "nostr+walletconnect://pub1",
    "mutating a retrieved object should not impact stored values",
  );

  const entries = store.entries();
  assert.deepEqual(
    entries,
    [
      ["pub1", { uri: "nostr+walletconnect://pub1" }],
      ["pub2", { uri: "nostr+walletconnect://pub2" }],
    ],
  );

  const keys = store.keys();
  assert.deepEqual(keys.sort(), ["pub1", "pub2"]);

  const values = store.values();
  assert.deepEqual(values, [
    { uri: "nostr+walletconnect://pub1" },
    { uri: "nostr+walletconnect://pub2" },
  ]);
  assert.notStrictEqual(values[0], fromFirst);

  assert.equal(store.has("pub1"), true);
  assert.equal(store.delete("pub1"), true);
  assert.equal(store.has("pub1"), false);
  assert.equal(store.size, 1);

  store.clear();
  assert.equal(store.size, 0);
  assert.equal(store.get("pub2"), undefined);
});

test("profile settings store ignores falsy keys and survives clone failures", () => {
  const loggerCalls = [];
  const store = createProfileSettingsStore({
    clone: () => {
      throw new Error("clone failure");
    },
    logger: {
      warn: (message, error) => {
        loggerCalls.push([message, error?.message]);
      },
    },
  });

  store.set(null, { foo: "bar" });
  assert.equal(store.size, 0, "falsy keys should be ignored");

  store.set("pub1", { foo: "bar" });
  assert.equal(store.size, 1);

  const value = store.get("pub1");
  assert.deepEqual(value, { foo: "bar" });
  assert.equal(loggerCalls.length > 0, true, "clone failure should be logged");
});
