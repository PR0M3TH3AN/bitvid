// #15 follow-up ("NWC doesn't sync unless I click Restore"): a device with
// sync ENABLED must auto-pull a NEWER remote note at login. Previously enabled
// devices only pushed-on-save, so wallet/storage changes made on another
// device sat unseen until the manual Restore click. Covers the shared
// encryptedSyncItem.autoPullIfNewer and its wiring in the login restore flow.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-enabled-device-auto-pull
//       given: "sync enabled locally; a remote note newer/older than the device's last-synced marker"
//       when: "autoPullIfNewer runs at login (via settingsRestorePrompt.maybeOffer)"
//       then: "newer remote -> pulled + applied + marker advanced (no prompt); older/equal -> untouched; disabled -> untouched"
//   observable_outcomes:
//     - "applyPayload called exactly when the remote is newer"
//     - "second login does not re-pull the same note"
//     - "disabled items still go through the one-time offer, not auto-pull"
//   determinism_controls:
//     - "in-memory localStorage; scripted encryptedSync double; no timers"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test, { beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import { createEncryptedSyncItem } from "../js/services/encryptedSyncItem.js";
import { createSettingsRestorePrompt } from "../js/services/settingsRestorePrompt.js";
import { setSyncEnabled, setSyncPushedAt } from "../js/services/settingsSyncFlags.js";

const PUB = "a".repeat(64);

beforeEach(() => {
  localStorage.clear();
});

function makeItem({
  remoteCreatedAt,
  id = "wallet",
  payload = { nwcUri: "nostr+walletconnect://x" },
}) {
  const applied = [];
  const item = createEncryptedSyncItem({
    id,
    dtag: "bitvid:nwc",
    encryptedSync: {
      isAvailable: () => true,
      exists: async () => ({ exists: remoteCreatedAt > 0, createdAt: remoteCreatedAt }),
      pull: async () => ({ found: true, payload }),
      push: async () => ({ ok: true, createdAt: remoteCreatedAt + 1 }),
      clear: async () => ({ ok: true }),
    },
    buildPayload: () => payload,
    applyPayload: async (pubkey, incoming) => {
      applied.push({ pubkey, incoming });
    },
  });
  return { item, applied };
}

test("enabled + newer remote → pulled, applied, marker advanced (no re-pull)", async () => {
  const { item, applied } = makeItem({ remoteCreatedAt: 500 });
  setSyncEnabled(PUB, "wallet", true);
  setSyncPushedAt(PUB, "wallet", 100); // this device last synced an older note

  const first = await item.autoPullIfNewer(PUB);
  assert.equal(first.pulled, true);
  assert.equal(applied.length, 1, "remote payload applied");
  assert.equal(applied[0].incoming.nwcUri, "nostr+walletconnect://x");

  const second = await item.autoPullIfNewer(PUB);
  assert.equal(second.pulled, false);
  assert.equal(second.reason, "up-to-date", "marker advanced — same note not re-pulled");
  assert.equal(applied.length, 1);
});

test("enabled + remote not newer → untouched; disabled → untouched", async () => {
  const { item, applied } = makeItem({ remoteCreatedAt: 100 });
  setSyncEnabled(PUB, "wallet", true);
  setSyncPushedAt(PUB, "wallet", 100); // this device pushed that very note

  assert.equal((await item.autoPullIfNewer(PUB)).pulled, false);
  assert.equal(applied.length, 0, "own note never re-applied");

  // A DIFFERENT sync kind whose flag was never enabled on this device (the
  // wallet flag set above is per pubkey+kind and must not bleed over).
  const { item: disabledItem, applied: disabledApplied } = makeItem({
    remoteCreatedAt: 9999,
    id: "storage",
  });
  const result = await disabledItem.autoPullIfNewer(PUB);
  assert.equal(result.pulled, false);
  assert.equal(result.reason, "not-enabled");
  assert.equal(disabledApplied.length, 0);
});

test("login flow: enabled wallet auto-pulls silently; no prompt is shown for it", async () => {
  const { item, applied } = makeItem({ remoteCreatedAt: 700 });
  setSyncEnabled(PUB, "wallet", true);
  setSyncPushedAt(PUB, "wallet", 100);

  let confirmCalls = 0;
  const restoredBatches = [];
  const prompt = createSettingsRestorePrompt({
    storageSync: { isAvailable: () => false, isEnabled: () => false },
    walletSync: item,
    confirm: async () => {
      confirmCalls += 1;
      return true;
    },
  });

  await prompt.maybeOffer(PUB, {
    onRestored: (items) => restoredBatches.push(items),
  });

  assert.equal(applied.length, 1, "newer note pulled during login");
  assert.deepEqual(restoredBatches, [["wallet"]], "user notified of the silent sync");
  assert.equal(confirmCalls, 0, "no prompt for an already-enabled item");
});
