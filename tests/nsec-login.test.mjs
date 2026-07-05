// Audit follow-ups for nsec (direct private key) login:
//  - access control must be enforced before activating the signer;
//  - "remember this key" must persist an encrypted key that can be unlocked;
//  - unlocking must re-check access control and forget a blocked key.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { ensureNostrTools } from "../js/nostr/toolkit.js";

let nostrClient;
let getActiveSigner;
let clearActiveSigner;
let clearStoredSessionActor;
let listStoredSessionActorPubkeys;
let readStoredSessionActorEntry;
let tools;
let bytesToHex;

// No-arg clearStoredSessionActor() deliberately clears only the legacy
// "last saved" slot (per-account keys must survive another account's logout —
// fixed 2026-07-02). Tests that need a pristine store wipe every account.
function wipeStoredActors() {
  for (const pk of listStoredSessionActorPubkeys?.() || []) {
    clearStoredSessionActor(pk);
  }
  clearStoredSessionActor();
}

before(async () => {
  tools = await ensureNostrTools();
  const canonical = { ...tools };
  globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ = canonical;
  globalThis.NostrTools = canonical;
  globalThis.nostrToolsReady = Promise.resolve({ ok: true, value: canonical });

  ({ nostrClient } = await import("../js/nostrClientFacade.js"));
  ({ getActiveSigner, clearActiveSigner } = await import("../js/nostr/client.js"));
  ({
    clearStoredSessionActor,
    listStoredSessionActorPubkeys,
    readStoredSessionActorEntry,
  } = await import("../js/nostr/sessionActor.js"));

  bytesToHex = (bytes) => {
    if (tools.bytesToHex) return tools.bytesToHex(bytes);
    if (tools.utils?.bytesToHex) return tools.utils.bytesToHex(bytes);
    return Buffer.from(bytes).toString("hex");
  };
});

after(() => {
  try {
    wipeStoredActors();
  } catch (error) {
    // ignore
  }
  setTimeout(() => process.exit(0), 50);
});

function makeKey() {
  const sk = tools.generateSecretKey();
  return { hex: bytesToHex(sk), pubkey: tools.getPublicKey(sk) };
}

describe("nsec login", () => {
  it("enforces the access-control validator before activating the signer", async () => {
    clearActiveSigner();
    wipeStoredActors();
    const { hex } = makeKey();

    let seenPubkey = null;
    const validator = (pubkey) => {
      seenPubkey = pubkey;
      throw new Error("Your account has been blocked on this platform.");
    };

    await assert.rejects(
      () => nostrClient.registerPrivateKeySigner({ privateKey: hex, validator }),
      /blocked/i,
      "a denied validator must reject the login",
    );
    assert.ok(seenPubkey, "validator was actually consulted");
    assert.equal(
      getActiveSigner(),
      null,
      "no signer may be activated when access is denied",
    );
  });

  it("persists an encrypted key and unlocks it with the passphrase", async () => {
    clearActiveSigner();
    wipeStoredActors();
    const { hex, pubkey } = makeKey();
    const passphrase = "correct horse battery staple";

    await nostrClient.registerPrivateKeySigner({
      privateKey: hex,
      pubkey,
      persist: true,
      passphrase,
    });

    const meta = nostrClient.getStoredSessionActorMetadata();
    assert.ok(meta, "metadata should be available after persisting");
    assert.equal(meta.hasEncryptedKey, true, "an encrypted key is stored");
    assert.equal(meta.pubkey, pubkey, "metadata carries the pubkey");

    clearActiveSigner();
    assert.equal(getActiveSigner(), null, "signer cleared before unlock");

    const result = await nostrClient.unlockStoredSessionActor(passphrase);
    assert.equal(result.pubkey, pubkey, "unlock restores the same pubkey");
    const signer = getActiveSigner();
    assert.ok(signer, "a signer is active after unlocking");
    assert.equal(signer.pubkey, pubkey, "the unlocked signer matches");

    // Wrong passphrase must fail.
    clearActiveSigner();
    await assert.rejects(
      () => nostrClient.unlockStoredSessionActor("the wrong passphrase"),
      /unlock|passphrase|decrypt/i,
      "a wrong passphrase must not unlock the key",
    );
  });

  it("unlock re-checks access control and forgets a blocked key", async () => {
    clearActiveSigner();
    wipeStoredActors();
    const { hex, pubkey } = makeKey();
    const passphrase = "another secret passphrase";

    await nostrClient.registerPrivateKeySigner({
      privateKey: hex,
      pubkey,
      persist: true,
      passphrase,
    });
    clearActiveSigner();

    const validator = () => {
      throw new Error("Your account has been blocked on this platform.");
    };

    await assert.rejects(
      () => nostrClient.unlockStoredSessionActor(passphrase, { validator }),
      /blocked/i,
      "a blocked key must not unlock",
    );
    assert.equal(getActiveSigner(), null, "no signer activated for a blocked key");
    // The security property, asserted on the blocked account SPECIFICALLY (a
    // no-arg metadata read can legitimately surface a different saved account
    // via the single-entry fallback — that is not a leak of THIS key).
    assert.equal(
      readStoredSessionActorEntry(pubkey),
      null,
      "the blocked account's encrypted key is forgotten (cleared from storage)",
    );
    assert.equal(
      nostrClient.getStoredSessionActorMetadata(),
      null,
      "with no other saved accounts, no metadata survives the blocked-key cleanup",
    );
  });
});
