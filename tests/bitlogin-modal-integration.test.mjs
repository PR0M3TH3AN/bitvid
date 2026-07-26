import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveVerifiedBitloginPubkey,
  wireBitloginLogin,
} from "../js/ui/bitloginModalIntegration.js";

const PUBKEY = "a".repeat(64);

test("BitLogin accepts a login identity only when the event and widget worker agree", async () => {
  const widget = { getPublicKey: async () => PUBKEY.toUpperCase() };
  assert.equal(await resolveVerifiedBitloginPubkey(widget, PUBKEY), PUBKEY);
});

test("BitLogin rejects a forged event pubkey even when its claimed account has access", async () => {
  const widget = { getPublicKey: async () => "b".repeat(64) };
  assert.equal(await resolveVerifiedBitloginPubkey(widget, PUBKEY), "");
});

test("BitLogin rejects malformed claims and widgets without a worker-backed public key", async () => {
  assert.equal(await resolveVerifiedBitloginPubkey({}, PUBKEY), "");
  assert.equal(await resolveVerifiedBitloginPubkey({ getPublicKey: async () => PUBKEY }, "npub1nope"), "");
});

test("BitLogin bootstrap safely defers when MutationObserver is unavailable", () => {
  const originalDocument = globalThis.document;
  const originalObserver = globalThis.MutationObserver;
  globalThis.document = {
    body: {},
    defaultView: {},
    getElementById: () => null,
  };
  try {
    delete globalThis.MutationObserver;
    assert.doesNotThrow(() => wireBitloginLogin({ authService: {} }));
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = originalObserver;
  }
});
