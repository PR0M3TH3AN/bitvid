// Opt-in "keep unlocked" key cache (TODO #51). Default tier = session (survives
// refresh, cleared on tab close); opt-in persistent tier = localStorage (survives
// until site data is cleared). Reads promote a persistent hit into the session tier.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-unlocked-key-cache
//       given: "in-memory session + local storage mocks"
//       when: "remember/read/forget/clear run for session vs persistent tiers"
//       then: "session-only never touches disk; persistent survives; forget/clear wipe both"
//   observable_outcomes:
//     - "session remember -> readable, NOT in the persistent store"
//     - "persistent remember -> readable AND in the persistent store"
//     - "toggling persist:false removes the on-disk copy"
//     - "a persistent-only key is promoted back into the session store on read"
//     - "invalid (non-hex) keys are rejected"
//     - "forget clears one pubkey; clearAll wipes everything"
//   determinism_controls:
//     - "injected in-memory Storage mocks; no real browser storage"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "leaking real storage between tests"]
//   relaxation:
//     did_relax_any_assertion: false

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  rememberUnlockedKey,
  readUnlockedKey,
  hasPersistentUnlockedKey,
  forgetUnlockedKey,
  clearAllUnlockedKeys,
  UNLOCKED_KEY_STORE_KEY,
} from "../js/nostr/unlockedKeyCache.js";

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

const PUB = "a".repeat(64);
const OTHER = "b".repeat(64);
const KEY = "1".repeat(64);
const KEY2 = "2".repeat(64);

let savedSession;
let savedLocal;

beforeEach(() => {
  savedSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  savedLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  globalThis.sessionStorage = makeStorage();
  globalThis.localStorage = makeStorage();
});

afterEach(() => {
  if (savedSession) Object.defineProperty(globalThis, "sessionStorage", savedSession);
  else delete globalThis.sessionStorage;
  if (savedLocal) Object.defineProperty(globalThis, "localStorage", savedLocal);
  else delete globalThis.localStorage;
});

test("session-only remember is readable but never written to disk (localStorage)", () => {
  assert.equal(rememberUnlockedKey(PUB, KEY), true);
  assert.equal(readUnlockedKey(PUB), KEY);
  assert.equal(hasPersistentUnlockedKey(PUB), false);
  assert.equal(globalThis.localStorage.getItem(UNLOCKED_KEY_STORE_KEY), null);
});

test("persistent remember is readable AND written to the persistent store", () => {
  rememberUnlockedKey(PUB, KEY, { persist: true });
  assert.equal(readUnlockedKey(PUB), KEY);
  assert.equal(hasPersistentUnlockedKey(PUB), true);
  assert.ok(globalThis.localStorage.getItem(UNLOCKED_KEY_STORE_KEY));
});

test("re-remembering with persist:false removes the on-disk copy but keeps the session copy", () => {
  rememberUnlockedKey(PUB, KEY, { persist: true });
  assert.equal(hasPersistentUnlockedKey(PUB), true);
  rememberUnlockedKey(PUB, KEY, { persist: false });
  assert.equal(hasPersistentUnlockedKey(PUB), false);
  assert.equal(readUnlockedKey(PUB), KEY, "still unlocked for the session");
});

test("a persistent-only key (session cleared, e.g. new tab) is promoted back into the session store on read", () => {
  rememberUnlockedKey(PUB, KEY, { persist: true });
  // Simulate a fresh tab: session store empty, persistent store retained.
  globalThis.sessionStorage = makeStorage();
  assert.equal(readUnlockedKey(PUB), KEY, "restored from the persistent tier");
  // And it was warmed into the session tier.
  assert.ok(globalThis.sessionStorage.getItem(UNLOCKED_KEY_STORE_KEY));
});

test("invalid (non-hex) private keys are rejected", () => {
  assert.equal(rememberUnlockedKey(PUB, "not-hex"), false);
  assert.equal(rememberUnlockedKey(PUB, ""), false);
  assert.equal(rememberUnlockedKey("", KEY), false);
  assert.equal(readUnlockedKey(PUB), "");
});

test("forget clears one pubkey from both tiers, leaving others intact", () => {
  rememberUnlockedKey(PUB, KEY, { persist: true });
  rememberUnlockedKey(OTHER, KEY2, { persist: true });
  forgetUnlockedKey(PUB);
  assert.equal(readUnlockedKey(PUB), "");
  assert.equal(hasPersistentUnlockedKey(PUB), false);
  assert.equal(readUnlockedKey(OTHER), KEY2, "other account still unlocked");
});

test("clearAll wipes every cached key from both tiers", () => {
  rememberUnlockedKey(PUB, KEY, { persist: true });
  rememberUnlockedKey(OTHER, KEY2);
  clearAllUnlockedKeys();
  assert.equal(readUnlockedKey(PUB), "");
  assert.equal(readUnlockedKey(OTHER), "");
  assert.equal(globalThis.localStorage.getItem(UNLOCKED_KEY_STORE_KEY), null);
  assert.equal(globalThis.sessionStorage.getItem(UNLOCKED_KEY_STORE_KEY), null);
});

test("missing storage backends degrade gracefully (no throw)", () => {
  delete globalThis.sessionStorage;
  delete globalThis.localStorage;
  assert.doesNotThrow(() => {
    rememberUnlockedKey(PUB, KEY, { persist: true });
    assert.equal(readUnlockedKey(PUB), "");
    forgetUnlockedKey(PUB);
    clearAllUnlockedKeys();
  });
});
