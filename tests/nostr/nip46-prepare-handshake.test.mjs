// Scenario (SCN-nip46-prepare-handshake):
//   The "generate connect link" NIP-46 login path calls
//   nostrClient.prepareRemoteSignerHandshake(...). That method existed only on
//   the unused Nip46Connector, so login failed with
//   "nostrClient.prepareRemoteSignerHandshake is not a function". It now lives on
//   SignerManager (and is proxied by NostrClient). This asserts it produces a
//   valid nostrconnect:// handshake (ephemeral keypair + URI carrying the
//   relays/secret/permissions) ready to hand to connectRemoteSigner.

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const { SignerManager } = await import("../../js/nostr/managers/SignerManager.js");

function makeManager() {
  // Minimal client stub — only relays are read (as the relay fallback).
  return new SignerManager({ relays: ["wss://fallback.example"] });
}

test("prepareRemoteSignerHandshake builds a valid nostrconnect URI + ephemeral keypair", async () => {
  const mgr = makeManager();
  const hs = await mgr.prepareRemoteSignerHandshake({
    relays: ["wss://relay.one", "wss://relay.two"],
    permissions: "sign_event:1,nip44_decrypt",
    metadata: { name: "bitvid" },
  });

  // Ephemeral keypair (hex), pubkey embedded in the URI.
  assert.match(hs.clientPrivateKey, /^[0-9a-f]{64}$/);
  assert.match(hs.clientPublicKey, /^[0-9a-f]{64}$/);
  assert.match(hs.connectionString, /^nostrconnect:\/\/[0-9a-f]{64}\?/);
  assert.ok(hs.connectionString.includes(hs.clientPublicKey), "URI carries the client pubkey");

  // Carries the requested relays, a secret, and the permissions.
  assert.ok(hs.connectionString.includes(`relay=${encodeURIComponent("wss://relay.one")}`));
  assert.ok(hs.connectionString.includes(`relay=${encodeURIComponent("wss://relay.two")}`));
  assert.ok(hs.secret && hs.connectionString.includes(`secret=${encodeURIComponent(hs.secret)}`));
  assert.ok(
    hs.connectionString.includes(`perms=${encodeURIComponent("sign_event:1,nip44_decrypt")}`),
  );
  assert.ok(hs.relays.includes("wss://relay.one") && hs.relays.includes("wss://relay.two"));
});

test("generates a fresh keypair each call", async () => {
  const mgr = makeManager();
  const a = await mgr.prepareRemoteSignerHandshake({ relays: ["wss://r"] });
  const b = await mgr.prepareRemoteSignerHandshake({ relays: ["wss://r"] });
  assert.notEqual(a.clientPublicKey, b.clientPublicKey, "each handshake is a new ephemeral key");
  assert.notEqual(a.secret, b.secret);
});

// Scenario (SCN-nip46-access-control): remote-signer logins must enforce the
// access-control validator before activating the signer, so a blocked /
// non-permitted pubkey can't log in via a remote signer (this was dropped when
// the connection logic moved off the unused Nip46Connector into SignerManager).
test("a validator that throws (blocked pubkey) rejects the login", async () => {
  const mgr = makeManager();
  await assert.rejects(
    () =>
      mgr._enforceRemoteSignerValidator(() => {
        throw new Error("Your account has been blocked on this platform.");
      }, "blockedpub"),
    /blocked/i,
  );
});

test("a validator returning false rejects with an access-denied code", async () => {
  const mgr = makeManager();
  await assert.rejects(
    () => mgr._enforceRemoteSignerValidator(() => false, "pub"),
    (err) => err?.code === "remote-signer-access-denied",
  );
});

test("a passing validator (true) and no validator are both allowed", async () => {
  const mgr = makeManager();
  await mgr._enforceRemoteSignerValidator(() => true, "pub"); // resolves
  await mgr._enforceRemoteSignerValidator(null, "pub"); // no-op
  await mgr._enforceRemoteSignerValidator(undefined, "pub"); // no-op
});
