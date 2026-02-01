import assert from "node:assert/strict";
import test from "node:test";

import {
  readStoredNip07Permissions,
  writeStoredNip07Permissions,
  clearStoredNip07Permissions,
  requestEnablePermissions,
  waitForNip07Extension,
} from "../../js/nostr/nip07Permissions.js";

test("writeStoredNip07Permissions normalizes and persists granted methods", () => {
  clearStoredNip07Permissions();

  writeStoredNip07Permissions([" get_public_key ", "", "sign_event"]);

  const stored = readStoredNip07Permissions();
  assert.ok(stored instanceof Set);

  const sorted = [...stored].sort();
  assert.deepStrictEqual(sorted, ["get_public_key", "sign_event"]);
});

test("clearStoredNip07Permissions removes persisted grants", () => {
  clearStoredNip07Permissions();
  writeStoredNip07Permissions(["get_public_key"]);
  assert.notStrictEqual(
    globalThis.localStorage.getItem("bitvid:nip07:permissions"),
    null,
  );

  clearStoredNip07Permissions();

  const afterClear = readStoredNip07Permissions();
  assert.strictEqual(afterClear.size, 0);
  assert.strictEqual(
    globalThis.localStorage.getItem("bitvid:nip07:permissions"),
    null,
  );
});

test("requestEnablePermissions retries explicit and fallback variants", async () => {
  clearStoredNip07Permissions();
  const calls = [];
  let attempt = 0;

  const extension = {
    enable: (options) => {
      calls.push(options);
      attempt += 1;
      if (attempt < 3) {
        return Promise.reject(new Error(`attempt-${attempt}`));
      }
      return Promise.resolve();
    },
  };

  const result = await requestEnablePermissions(
    extension,
    ["sign_event"],
    { isDevMode: false },
  );

  assert.deepStrictEqual(calls, [
    { permissions: [{ method: "sign_event" }] },
    { permissions: ["sign_event"] },
    undefined,
  ]);
  assert.deepStrictEqual(result, { ok: true });
});

test("requestEnablePermissions reports unavailable extension", async () => {
  clearStoredNip07Permissions();
  const result = await requestEnablePermissions(null, ["sign_event"]);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error?.message, "extension-unavailable");
});

test("waitForNip07Extension resolves when extension is present", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = { nostr: { dummy: true } };
  try {
    const result = await waitForNip07Extension();
    assert.deepStrictEqual(result, { dummy: true });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("waitForNip07Extension resolves when extension appears later", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {}; // No nostr yet

  setTimeout(() => {
    globalThis.window.nostr = { later: true };
  }, 50);

  try {
    const result = await waitForNip07Extension(500);
    assert.deepStrictEqual(result, { later: true });
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

test("waitForNip07Extension rejects when extension never appears", async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {}; // No nostr

  try {
    await waitForNip07Extension(100);
    assert.fail("Should have rejected");
  } catch (error) {
    assert.strictEqual(error.message, "Nostr extension not found within timeout.");
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
