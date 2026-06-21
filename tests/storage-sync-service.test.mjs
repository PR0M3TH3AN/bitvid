// Storage-credential sync (todo #15, step 2): the local storage account record
// is pushed to an encrypted note and pulled+imported on another device.
// Scenarios assert observable outcomes at the storage + sync boundary:
//   - enable() pushes exactly the exported record under the storage d-tag
//   - pull() imports the pulled payload into local storage (round-trip restore)
//   - disable() clears the published note and flips the persisted opt-in flag
//   - push() with nothing stored does not publish

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createStorageSyncService,
  STORAGE_SYNC_DTAG,
} from "../js/services/storageSyncService.js";

const PUBKEY = "a".repeat(64);

// A faithful-enough storage twin: holds one account record per pubkey.
function makeStorageTwin(initialRecord = null) {
  const db = new Map();
  if (initialRecord) {
    db.set(PUBKEY, initialRecord);
  }
  return {
    db,
    async exportAccountRecord(pubkey) {
      return db.get(pubkey) || null;
    },
    async importAccountRecord(pubkey, record) {
      if (!record || !record.encryptedMasterKey) {
        throw new Error("Invalid record");
      }
      db.set(pubkey, { ...record, pubkey });
      return db.get(pubkey);
    },
  };
}

// An encrypted-sync twin backed by a single "note" so push/pull/clear interact.
function makeSyncTwin({ available = true } = {}) {
  let note = null; // { payload } | { cleared: true }
  return {
    calls: { push: [], pull: 0, clear: 0 },
    isAvailable: () => available,
    async push(dTag, payload) {
      this.calls.push.push({ dTag, payload });
      note = { payload };
      return { ok: true, accepted: 1, total: 1 };
    },
    async pull(dTag) {
      this.calls.pull += 1;
      if (!note || note.cleared) {
        return { found: false, cleared: Boolean(note?.cleared) };
      }
      return { found: true, payload: note.payload, createdAt: 123 };
    },
    async clear(dTag) {
      this.calls.clear += 1;
      note = { cleared: true };
      return { ok: true, accepted: 1, total: 1 };
    },
  };
}

const ACCOUNT_RECORD = {
  pubkey: PUBKEY,
  encryptedMasterKey: { method: "nip44", ciphertext: "deadbeef" },
  connections: {
    conn1: { id: "conn1", provider: "cloudflare_r2", meta: { bucket: "b" }, encrypted: { cipher: "x", iv: "y" } },
  },
};

test("enable() pushes the exported storage record under the storage d-tag and sets the flag", async () => {
  localStorage.clear();
  const storage = makeStorageTwin(ACCOUNT_RECORD);
  const sync = makeSyncTwin();
  const service = createStorageSyncService({ encryptedSync: sync, storage });

  assert.equal(service.isEnabled(PUBKEY), false, "off by default");

  const result = await service.enable(PUBKEY);
  assert.equal(result.ok, true);
  assert.equal(sync.calls.push.length, 1, "enable must push once");
  assert.equal(sync.calls.push[0].dTag, STORAGE_SYNC_DTAG);
  assert.deepEqual(
    sync.calls.push[0].payload,
    ACCOUNT_RECORD,
    "must push exactly the exported account record",
  );
  assert.equal(service.isEnabled(PUBKEY), true, "opt-in flag must persist");
});

test("pull() restores the synced record into local storage on a fresh device", async () => {
  localStorage.clear();
  // Device A pushes.
  const syncShared = makeSyncTwin();
  const storageA = makeStorageTwin(ACCOUNT_RECORD);
  await createStorageSyncService({ encryptedSync: syncShared, storage: storageA }).enable(PUBKEY);

  // Device B (empty) pulls from the same note.
  const storageB = makeStorageTwin(null);
  const serviceB = createStorageSyncService({ encryptedSync: syncShared, storage: storageB });

  assert.equal(await storageB.exportAccountRecord(PUBKEY), null, "device B starts empty");

  const pulled = await serviceB.pull(PUBKEY);
  assert.equal(pulled.found, true);
  assert.equal(pulled.imported, true, "a found record must be imported");
  assert.deepEqual(
    await storageB.exportAccountRecord(PUBKEY),
    { ...ACCOUNT_RECORD, pubkey: PUBKEY },
    "device B must now hold the restored record",
  );
});

test("disable() clears the note and a later pull finds nothing", async () => {
  localStorage.clear();
  const storage = makeStorageTwin(ACCOUNT_RECORD);
  const sync = makeSyncTwin();
  const service = createStorageSyncService({ encryptedSync: sync, storage });

  await service.enable(PUBKEY);
  assert.equal(service.isEnabled(PUBKEY), true);

  const cleared = await service.disable(PUBKEY);
  assert.equal(cleared.ok, true);
  assert.equal(sync.calls.clear, 1, "disable must clear the published note");
  assert.equal(service.isEnabled(PUBKEY), false, "opt-in flag must flip off");

  const pulled = await service.pull(PUBKEY);
  assert.equal(pulled.found, false, "cleared note must not restore anything");
});

test("push() with nothing stored does not publish", async () => {
  localStorage.clear();
  const storage = makeStorageTwin(null);
  const sync = makeSyncTwin();
  const service = createStorageSyncService({ encryptedSync: sync, storage });

  const result = await service.push(PUBKEY);
  assert.equal(result.ok, false);
  assert.equal(result.error, "nothing-to-sync");
  assert.equal(sync.calls.push.length, 0, "must not publish an empty record");
});
