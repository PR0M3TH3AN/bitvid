// NWC wallet sync (todo #15): the wallet connection (a bearer SPENDING secret)
// is pushed to an encrypted note and pulled+applied on another device.
// Scenarios assert observable outcomes at the nwcSettings + sync boundary:
//   - enable() pushes the current nwcUri (+defaultZap) under the wallet d-tag
//   - pull() applies the pulled URI via updateActiveNwcSettings (restore)
//   - disable() clears the published note and flips the opt-in flag
//   - push() with no wallet connected does not publish

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createWalletSyncService,
  WALLET_SYNC_DTAG,
} from "../js/services/walletSyncService.js";

const PUBKEY = "b".repeat(64);
const URI = "nostr+walletconnect://deadbeef?relay=wss://relay.example&secret=cafe";

function makeNwcTwin(initial = {}) {
  let settings = { nwcUri: "", defaultZap: undefined, ...initial };
  return {
    applied: [],
    getActiveNwcSettings: () => ({ ...settings }),
    updateActiveNwcSettings: async (partial) => {
      settings = { ...settings, ...partial };
      // record what was applied (do NOT log the secret in real code)
      // eslint-disable-next-line no-unused-vars
      const safe = { ...partial };
      return { ...settings };
    },
  };
}

function makeSyncTwin() {
  let note = null;
  return {
    calls: { push: [], pull: 0, clear: 0 },
    isAvailable: () => true,
    async exists() {
      return { exists: Boolean(note) && !note.cleared, createdAt: 0 };
    },
    async push(dTag, payload) {
      this.calls.push.push({ dTag, payload });
      note = { payload };
      return { ok: true, accepted: 1, total: 1 };
    },
    async pull() {
      this.calls.pull += 1;
      if (!note || note.cleared) {
        return { found: false, cleared: Boolean(note?.cleared) };
      }
      return { found: true, payload: note.payload, createdAt: 1 };
    },
    async clear() {
      this.calls.clear += 1;
      note = { cleared: true };
      return { ok: true, accepted: 1, total: 1 };
    },
  };
}

test("enable() pushes the current wallet URI under the wallet d-tag", async () => {
  localStorage.clear();
  const nwc = makeNwcTwin({ nwcUri: URI, defaultZap: 500 });
  const sync = makeSyncTwin();
  const service = createWalletSyncService({ encryptedSync: sync, nwcSettings: nwc });

  assert.equal(service.isEnabled(PUBKEY), false, "off by default");
  const result = await service.enable(PUBKEY);
  assert.equal(result.ok, true);
  assert.equal(sync.calls.push.length, 1);
  assert.equal(sync.calls.push[0].dTag, WALLET_SYNC_DTAG);
  assert.deepEqual(sync.calls.push[0].payload, { nwcUri: URI, defaultZap: 500 });
  assert.equal(service.isEnabled(PUBKEY), true, "opt-in flag persists");
});

test("pull() restores the wallet URI via updateActiveNwcSettings on a fresh device", async () => {
  localStorage.clear();
  const sharedSync = makeSyncTwin();
  // Device A pushes.
  await createWalletSyncService({
    encryptedSync: sharedSync,
    nwcSettings: makeNwcTwin({ nwcUri: URI, defaultZap: 21 }),
  }).enable(PUBKEY);

  // Device B (no wallet) pulls.
  const nwcB = makeNwcTwin({ nwcUri: "" });
  const serviceB = createWalletSyncService({ encryptedSync: sharedSync, nwcSettings: nwcB });

  const pulled = await serviceB.pull(PUBKEY);
  assert.equal(pulled.found, true);
  assert.equal(pulled.imported, true);
  assert.equal(
    nwcB.getActiveNwcSettings().nwcUri,
    URI,
    "device B must now hold the restored wallet URI",
  );
  assert.equal(nwcB.getActiveNwcSettings().defaultZap, 21);
});

test("disable() clears the note and a later pull finds nothing", async () => {
  localStorage.clear();
  const nwc = makeNwcTwin({ nwcUri: URI });
  const sync = makeSyncTwin();
  const service = createWalletSyncService({ encryptedSync: sync, nwcSettings: nwc });

  await service.enable(PUBKEY);
  const cleared = await service.disable(PUBKEY);
  assert.equal(cleared.ok, true);
  assert.equal(sync.calls.clear, 1);
  assert.equal(service.isEnabled(PUBKEY), false);

  const pulled = await service.pull(PUBKEY);
  assert.equal(pulled.found, false);
});

test("push() with no wallet connected does not publish", async () => {
  localStorage.clear();
  const nwc = makeNwcTwin({ nwcUri: "" });
  const sync = makeSyncTwin();
  const service = createWalletSyncService({ encryptedSync: sync, nwcSettings: nwc });

  const result = await service.push(PUBKEY);
  assert.equal(result.ok, false);
  assert.equal(result.error, "nothing-to-sync");
  assert.equal(sync.calls.push.length, 0);
});
