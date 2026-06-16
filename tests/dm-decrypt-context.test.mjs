// Scenario (SCN-dm-context-method-existence):
//   Given an active NIP-07 signer that EXPOSES nip04Decrypt/nip44Decrypt methods
//     but whose dynamic `capabilities` getter reports them false (the real-env
//     nos2x case — lazy/odd module shape) AND whose extension permission probe
//     returns ok:false,
//   When buildDmDecryptContext runs for a DM load,
//   Then it must still register the signer's decryptors (by method existence,
//     like the list services do) — otherwise listDirectMessages throws
//     "DM decryption helpers are unavailable" even though the signer decrypts
//     everything else fine (KNOWN_BUGS #0).

import test from "node:test";
import assert from "node:assert/strict";

if (!globalThis.WebSocket) {
  globalThis.WebSocket = class MockWebSocket {};
}

const { NostrClient } = await import("../js/nostr/client.js");

test("buildDmDecryptContext registers decryptors by method existence, not capabilities/permission gate", async () => {
  const client = new NostrClient();
  const actor = "a".repeat(64);
  client.pubkey = actor;

  const fakeSigner = {
    type: "nip07",
    pubkey: actor,
    nip04Decrypt: async () => "plaintext",
    nip44Decrypt: async () => "plaintext",
    // The dynamic capabilities getter that returned false negatives and made
    // the DM path register zero decryptors.
    get capabilities() {
      return { sign: true, nip04: false, nip44: false };
    },
  };

  // Active signer resolves to our fake regardless of how it's looked up.
  client.signerManager.resolveActiveSigner = () => fakeSigner;
  client.signerManager.getActiveSigner = () => fakeSigner;
  // Permission probe reports NOT ok — must NOT block decryptor registration.
  client.ensureExtensionPermissions = async () => ({
    ok: false,
    error: new Error("permission-not-granted"),
  });

  const context = await client.buildDmDecryptContext(actor);

  const schemes = context.decryptors.map((d) => d.scheme);
  assert.ok(
    schemes.includes("nip44"),
    "nip44 decryptor must be registered from the signer method",
  );
  assert.ok(
    schemes.includes("nip04"),
    "nip04 decryptor must be registered from the signer method",
  );
  assert.ok(
    context.decryptors.length >= 2,
    `expected at least the two signer decryptors, got ${context.decryptors.length}`,
  );
});
