// The silent NIP-46 session restore on startup must enforce access control,
// so a since-blocked pubkey's stored remote-signer session can't reconnect
// unchecked.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { SignerManager } from "../js/nostr/managers/SignerManager.js";
import { accessControl } from "../js/accessControl.js";

const NIP46_SESSION_KEY = "bitvid:nip46:session:v1";

function seedStoredSession() {
  localStorage.setItem(
    NIP46_SESSION_KEY,
    JSON.stringify({
      version: 1,
      remotePubkey: "a".repeat(64),
      clientPrivateKey: "b".repeat(64),
      relays: ["wss://relay.example"],
    }),
  );
}

test("scheduleStoredRemoteSignerRestore passes an access-control validator", async () => {
  seedStoredSession();
  const manager = new SignerManager({ relays: ["wss://relay.example"] });

  let capturedOptions = null;
  manager.useStoredRemoteSigner = async (options) => {
    capturedOptions = options;
    return { ok: true, pubkey: "a".repeat(64) };
  };

  await manager.scheduleStoredRemoteSignerRestore();
  // schedule fires the restore without awaiting it; let the microtask run.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(capturedOptions, "the stored signer restore was attempted");
  assert.equal(
    capturedOptions.silent,
    true,
    "startup restore stays silent",
  );
  assert.equal(
    typeof capturedOptions.validator,
    "function",
    "a validator must be supplied so access control is enforced on restore",
  );

  localStorage.removeItem(NIP46_SESSION_KEY);
});

test("the restore validator allows permitted pubkeys and rejects blocked ones", async () => {
  const manager = new SignerManager({ relays: [] });
  const validator = manager.buildAccessControlValidator();

  const origWaitForReady = accessControl.waitForReady;
  const origCanAccess = accessControl.canAccess;
  const origIsBlacklisted = accessControl.isBlacklisted;
  accessControl.waitForReady = async () => {};

  try {
    accessControl.canAccess = () => true;
    accessControl.isBlacklisted = () => false;
    await assert.doesNotReject(
      () => validator("a".repeat(64)),
      "an allowed pubkey passes the validator",
    );

    accessControl.canAccess = () => false;
    accessControl.isBlacklisted = () => true;
    await assert.rejects(
      () => validator("c".repeat(64)),
      /blocked/i,
      "a blocked pubkey is rejected so the stored session is forgotten",
    );
  } finally {
    accessControl.waitForReady = origWaitForReady;
    accessControl.canAccess = origCanAccess;
    accessControl.isBlacklisted = origIsBlacklisted;
  }
});
