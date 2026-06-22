// Regression: on a page refresh the logged-in pubkey/UI is restored but no
// fresh loginWithExtension runs, so the signer registry starts empty.
// ensureActiveSignerForPubkey only RESOLVED from the registry — it never
// CONSTRUCTED a NIP-07 adapter from window.nostr — so it returned null forever.
// Decrypt paths limped along via per-call window.nostr fallbacks, but features
// that rely solely on the registry (e.g. profile Storage "Unlock") failed with
// "No active signer found." despite a healthy, responsive extension.
//
// Fix: when a live extension's own pubkey matches the requested pubkey and no
// signer is registered, build + register the adapter (mirroring
// loginWithExtension) so getActiveSigner()/sign/decrypt work app-wide.
//
// In its own file for process-level isolation: the signer registry and NIP-07
// permission/circuit-breaker state are module singletons, so sharing a file
// with other signer tests bleeds state.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  NostrClient,
  getActiveSigner,
  clearActiveSigner,
} from "../js/nostr/client.js";

const PK = "a".repeat(64);

function makeExtension(getPubkey) {
  return {
    getPublicKey: async () => getPubkey,
    signEvent: async () => ({ id: "ext-signed" }),
    nip04: { encrypt: async () => "enc04", decrypt: async () => "dec04" },
    nip44: { encrypt: async () => "enc44", decrypt: async () => "dec44" },
  };
}

test("constructs + registers a usable signer from the live extension when the registry is empty", async () => {
  const originalWindow = global.window;
  global.window = { nostr: makeExtension(PK) };
  try {
    clearActiveSigner();
    const client = new NostrClient();
    client.pubkey = PK;
    assert.equal(getActiveSigner(), null, "precondition: empty registry (post-refresh)");

    const resolved = await client.ensureActiveSignerForPubkey(PK);

    assert.ok(resolved, "must resolve a signer instead of returning null");
    assert.equal(typeof resolved.signEvent, "function", "resolved signer can sign");
    assert.equal(
      typeof resolved.nip44Decrypt,
      "function",
      "resolved signer exposes a hydrated nip44 decrypt alias",
    );
    assert.equal(
      typeof resolved.nip04Decrypt,
      "function",
      "resolved signer exposes a hydrated nip04 decrypt alias",
    );

    // The whole point: it is now the registered active signer app-wide.
    const active = getActiveSigner();
    assert.ok(active, "getActiveSigner() now returns the registered signer");
    assert.equal(typeof active.nip44Decrypt, "function", "active signer can decrypt");
  } finally {
    if (originalWindow) global.window = originalWindow;
    else delete global.window;
  }
});

test("does NOT adopt a mismatched extension account", async () => {
  const originalWindow = global.window;
  // Distinct, never-registered pubkeys — the registry's registeredSigners map is
  // a module singleton that clearActiveSigner() does not purge, so reusing the
  // previous test's pubkey would resolve its leftover entry.
  const WANT = "c".repeat(64);
  const OTHER = "b".repeat(64);
  global.window = { nostr: makeExtension(OTHER) }; // extension is a different account
  try {
    clearActiveSigner();
    const client = new NostrClient();
    client.pubkey = WANT;

    const resolved = await client.ensureActiveSignerForPubkey(WANT);

    assert.equal(resolved, null, "must not adopt a mismatched account");
    assert.equal(getActiveSigner(), null, "registry stays empty on mismatch");
  } finally {
    if (originalWindow) global.window = originalWindow;
    else delete global.window;
  }
});
