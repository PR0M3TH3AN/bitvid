// Offer-to-pull on login (todo #15): after login, if an encrypted copy exists on
// the user's account and this device hasn't opted in, offer to restore — once.
// Scenarios assert observable outcomes:
//   - prompts and restores only the items that have a remote copy + are not
//     already enabled locally
//   - declining does not restore
//   - it never nags twice once it has prompted (per pubkey)
//   - if nothing remote exists, it does NOT consume the one-time offer

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsRestorePrompt } from "../js/services/settingsRestorePrompt.js";
import { isSyncEnabled } from "../js/services/settingsSyncFlags.js";

const PUBKEY = "c".repeat(64);

function makeSyncStub({ available = true, enabled = false, remote = false } = {}) {
  return {
    pulls: 0,
    isAvailable: () => available,
    isEnabled: () => enabled,
    hasRemote: async () => remote,
    pull: async function () {
      this.pulls += 1;
      return { found: true, imported: true };
    },
  };
}

test("offers and restores items that have a remote copy and aren't already enabled", async () => {
  localStorage.clear();
  const storageSync = makeSyncStub({ remote: true });
  const walletSync = makeSyncStub({ remote: false }); // no wallet note
  const restoredCalls = [];
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync,
    confirm: () => true,
  });

  const result = await prompt.maybeOffer(PUBKEY, {
    onRestored: (items) => restoredCalls.push(items),
  });

  assert.equal(result.offered, true);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.restored, ["storage"]);
  assert.equal(storageSync.pulls, 1, "storage (has remote) must be pulled");
  assert.equal(walletSync.pulls, 0, "wallet (no remote) must NOT be pulled");
  assert.deepEqual(restoredCalls, [["storage"]]);
});

test("declining the prompt restores nothing", async () => {
  localStorage.clear();
  const storageSync = makeSyncStub({ remote: true });
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync: makeSyncStub({ remote: false }),
    confirm: () => false,
  });

  const result = await prompt.maybeOffer(PUBKEY);
  assert.equal(result.offered, true);
  assert.equal(result.accepted, false);
  assert.equal(storageSync.pulls, 0, "decline must not pull");
});

test("does not offer the SAME item twice once it has prompted", async () => {
  localStorage.clear();
  let confirmCount = 0;
  const prompt = createSettingsRestorePrompt({
    storageSync: makeSyncStub({ remote: true }),
    walletSync: makeSyncStub({ remote: false }),
    confirm: () => {
      confirmCount += 1;
      return false;
    },
  });

  await prompt.maybeOffer(PUBKEY);
  const second = await prompt.maybeOffer(PUBKEY);
  assert.equal(confirmCount, 1, "must prompt only once for storage");
  assert.equal(second.offered, false);
  // Storage was offered+marked, wallet has no remote copy -> no candidates remain.
  assert.equal(second.reason, "no-remote");
});

test("offers the WALLET later even after storage was already offered (per-item)", async () => {
  // Regression: a wallet note published AFTER storage was already offered must
  // still be surfaced. The old per-pubkey flag flagged the whole account on the
  // first offer, so the wallet never restored "like storage does".
  localStorage.clear();
  const offeredKinds = [];
  const storageSync = makeSyncStub({ remote: true });
  // Wallet has no remote copy yet on the first login, then appears later.
  let walletRemote = false;
  const walletSync = {
    pulls: 0,
    isAvailable: () => true,
    isEnabled: () => false,
    hasRemote: async () => walletRemote,
    pull: async function () {
      this.pulls += 1;
      return { found: true, imported: true };
    },
  };
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync,
    confirm: (message) => {
      offeredKinds.push(message);
      return true;
    },
  });

  const first = await prompt.maybeOffer(PUBKEY); // offers + restores storage only
  assert.deepEqual(first.restored, ["storage"]);
  assert.equal(walletSync.pulls, 0);

  // Wallet sync gets set up on another device -> a note now exists.
  walletRemote = true;
  const second = await prompt.maybeOffer(PUBKEY);
  assert.equal(second.offered, true, "wallet must still be offered on a later login");
  assert.deepEqual(second.restored, ["wallet"]);
  assert.equal(walletSync.pulls, 1, "wallet is pulled the first time it appears");
  assert.equal(storageSync.pulls, 1, "storage is not pulled again");

  // And it is not offered a third time.
  const third = await prompt.maybeOffer(PUBKEY);
  assert.equal(third.offered, false);
  assert.equal(third.reason, "no-remote");
});

test("skips items already enabled on this device", async () => {
  localStorage.clear();
  const storageSync = makeSyncStub({ remote: true, enabled: true }); // already opted in here
  const walletSync = makeSyncStub({ remote: true, enabled: false });
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync,
    confirm: () => true,
  });

  const result = await prompt.maybeOffer(PUBKEY);
  assert.deepEqual(result.restored, ["wallet"], "only the not-yet-enabled item is offered");
  assert.equal(storageSync.pulls, 0);
  assert.equal(walletSync.pulls, 1);
});

test("accepting the offer ENABLES ongoing sync so future saves auto-push", async () => {
  // Regression: accepting used to pull once but never set the sync flag, so the
  // user "restored once but stopped syncing" and the toggle showed OFF. Accepting
  // means "keep this device in sync".
  localStorage.clear();
  const storageSync = makeSyncStub({ remote: true });
  const walletSync = makeSyncStub({ remote: false });
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync,
    confirm: () => true,
  });

  assert.equal(isSyncEnabled(PUBKEY, "storage"), false, "not enabled before accept");
  const result = await prompt.maybeOffer(PUBKEY);
  assert.deepEqual(result.restored, ["storage"]);
  assert.equal(
    isSyncEnabled(PUBKEY, "storage"),
    true,
    "accepting must enable ongoing sync for the restored item",
  );
  assert.equal(
    isSyncEnabled(PUBKEY, "wallet"),
    false,
    "an item that was not restored must not be enabled",
  );
});

test("declining the offer does NOT enable sync", async () => {
  localStorage.clear();
  const storageSync = makeSyncStub({ remote: true });
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync: makeSyncStub({ remote: false }),
    confirm: () => false,
  });

  await prompt.maybeOffer(PUBKEY);
  assert.equal(isSyncEnabled(PUBKEY, "storage"), false, "decline must not enable sync");
});

test("nothing remote: does NOT consume the one-time offer (can prompt later)", async () => {
  localStorage.clear();
  const storageSync = makeSyncStub({ remote: false });
  const walletSync = makeSyncStub({ remote: false });
  let confirmCount = 0;
  const prompt = createSettingsRestorePrompt({
    storageSync,
    walletSync,
    confirm: () => {
      confirmCount += 1;
      return true;
    },
  });

  const first = await prompt.maybeOffer(PUBKEY);
  assert.equal(first.offered, false);
  assert.equal(first.reason, "no-remote");
  assert.equal(confirmCount, 0);

  // Later a note appears; the offer is still available.
  storageSync.hasRemote = async () => true;
  const later = await prompt.maybeOffer(PUBKEY);
  assert.equal(later.offered, true);
  assert.equal(later.accepted, true);
  assert.deepEqual(later.restored, ["storage"]);
});
