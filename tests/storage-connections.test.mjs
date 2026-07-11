// Per-provider storage connections: each provider type (R2 / B2 / Custom S3) must keep
// its OWN credentials so saving one never overwrites another, and the saved set syncs
// as a whole. The UI used to collapse everything into one shared "default" slot.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import * as fakeIndexedDB from "fake-indexeddb";

if (!globalThis.indexedDB) {
  globalThis.indexedDB = fakeIndexedDB.indexedDB;
  globalThis.IDBKeyRange = fakeIndexedDB.IDBKeyRange;
}

import storageService from "../js/services/storageService.js";
import {
  connectionProvider,
  findProviderConnection,
  computeDefaultForUploads,
  legacyDuplicateIds,
  saveProviderConnection,
  fillStorageForm,
} from "../js/ui/profileModal/storageConnections.js";

// --- Pure decision logic ---

describe("fillStorageForm provider selector", () => {
  // getConnection returns { ...payload, meta } — the provider is only in `meta` for
  // the decrypted/keyless shape (payload has no top-level provider). The selector
  // must reflect it, not silently revert to Cloudflare.
  test("selects the connection's provider from meta when there's no top-level provider", () => {
    const c = { storageProviderInput: { value: "cloudflare_r2" }, updateStorageFormVisibility: () => {}, handlePublicUrlInput: () => {} };
    fillStorageForm(c, { meta: { provider: "backblaze_b2" } });
    assert.equal(c.storageProviderInput.value, "backblaze_b2");
  });

  test("selects a keyless Blossom default (no payload/provider, provider only in meta)", () => {
    const c = { storageProviderInput: { value: "cloudflare_r2" }, updateStorageFormVisibility: () => {}, handlePublicUrlInput: () => {} };
    fillStorageForm(c, { meta: { provider: "blossom", defaultForUploads: true } });
    assert.equal(c.storageProviderInput.value, "blossom");
  });

  test("prefers a top-level provider when present", () => {
    const c = { storageProviderInput: { value: "" }, updateStorageFormVisibility: () => {}, handlePublicUrlInput: () => {} };
    fillStorageForm(c, { provider: "generic_s3", meta: { provider: "cloudflare_r2" } });
    assert.equal(c.storageProviderInput.value, "generic_s3");
  });

  test("falls back to cloudflare_r2 only when no provider is known", () => {
    const c = { storageProviderInput: { value: "blossom" }, updateStorageFormVisibility: () => {}, handlePublicUrlInput: () => {} };
    fillStorageForm(c, { meta: {} });
    assert.equal(c.storageProviderInput.value, "cloudflare_r2");
  });
});

describe("per-provider connection helpers", () => {
  test("computeDefaultForUploads: explicit choice, first-ever, and 'was already default'", () => {
    // Explicit checkbox always wins.
    assert.equal(
      computeDefaultForUploads({ isDefault: true, connections: [{ id: "x" }], provider: "backblaze_b2" }),
      true,
    );
    // The very first connection becomes the default automatically.
    assert.equal(
      computeDefaultForUploads({ isDefault: false, connections: [], provider: "backblaze_b2" }),
      true,
    );
    // Re-saving the provider that was already the default keeps it default...
    assert.equal(
      computeDefaultForUploads({
        isDefault: false,
        connections: [{ id: "cloudflare_r2", provider: "cloudflare_r2", meta: { defaultForUploads: true } }],
        provider: "cloudflare_r2",
      }),
      true,
    );
    // ...but a non-default provider stays non-default (won't steal it).
    assert.equal(
      computeDefaultForUploads({
        isDefault: false,
        connections: [
          { id: "cloudflare_r2", provider: "cloudflare_r2", meta: { defaultForUploads: true } },
          { id: "backblaze_b2", provider: "backblaze_b2", meta: { defaultForUploads: false } },
        ],
        provider: "backblaze_b2",
      }),
      false,
    );
  });

  test("findProviderConnection matches on provider (payload or meta)", () => {
    const conns = [
      { id: "a", provider: "cloudflare_r2" },
      { id: "b", meta: { provider: "backblaze_b2" } },
    ];
    assert.equal(findProviderConnection(conns, "backblaze_b2").id, "b");
    assert.equal(findProviderConnection(conns, "generic_s3"), null);
    assert.equal(connectionProvider(conns[1]), "backblaze_b2");
  });

  test("legacyDuplicateIds flags same-provider connections stored under a different id", () => {
    const conns = [
      { id: "default", provider: "cloudflare_r2" }, // the legacy shared slot
      { id: "cloudflare_r2", provider: "cloudflare_r2" }, // the new per-provider slot
      { id: "backblaze_b2", provider: "backblaze_b2" },
    ];
    assert.deepEqual(legacyDuplicateIds(conns, "cloudflare_r2", "cloudflare_r2"), ["default"]);
    assert.deepEqual(legacyDuplicateIds(conns, "backblaze_b2", "backblaze_b2"), []);
  });
});

// --- Integration against the real storageService (fake-indexeddb) ---

describe("saving multiple providers does not clash", () => {
  const pubkey = "00".repeat(31) + "07";
  const signer = {
    nip44Encrypt: async (_pk, pt) => `enc_${pt}`,
    nip44Decrypt: async (_pk, ct) => ct.replace(/^enc_/, ""),
  };

  beforeEach(async () => {
    storageService.masterKeys.clear();
    if (storageService.db) {
      storageService.db.close();
      storageService.db = null;
      storageService.dbPromise = null;
    }
    await new Promise((resolve) => {
      const req = globalThis.indexedDB.deleteDatabase("bitvid-storage");
      req.onsuccess = resolve;
      req.onerror = resolve;
      req.onblocked = resolve;
    });
    await storageService.unlock(pubkey, { signer });
  });

  const r2Payload = { provider: "cloudflare_r2", accessKeyId: "r2k", secretAccessKey: "r2s", accountId: "acct" };
  const b2Payload = { provider: "backblaze_b2", accessKeyId: "b2k", secretAccessKey: "b2s" };

  test("R2 then B2 both persist under their own provider ids; only one is default", async () => {
    await saveProviderConnection(storageService, pubkey, {
      provider: "cloudflare_r2",
      payload: r2Payload,
      meta: { provider: "cloudflare_r2", bucket: "r2-bucket" },
      isDefault: true,
    });
    await saveProviderConnection(storageService, pubkey, {
      provider: "backblaze_b2",
      payload: b2Payload,
      meta: { provider: "backblaze_b2", bucket: "b2-bucket", region: "us-west-004" },
      isDefault: false,
    });

    const conns = await storageService.listConnections(pubkey);
    const ids = conns.map((c) => c.id).sort();
    assert.deepEqual(ids, ["backblaze_b2", "cloudflare_r2"], "both providers stored, no overwrite");

    const r2 = await storageService.getConnection(pubkey, "cloudflare_r2");
    const b2 = await storageService.getConnection(pubkey, "backblaze_b2");
    assert.equal(r2.meta.bucket, "r2-bucket");
    assert.equal(b2.meta.bucket, "b2-bucket");
    // Credentials are independent (B2 did not clobber R2).
    assert.equal(r2.accessKeyId, "r2k");
    assert.equal(b2.accessKeyId, "b2k");
    // Exactly one default-for-uploads, and it's the one the user chose.
    assert.equal(conns.filter((c) => c.meta?.defaultForUploads).length, 1);
    assert.equal(r2.meta.defaultForUploads, true);
    assert.equal(b2.meta.defaultForUploads, false);
  });

  test("re-saving B2 as the default moves the active target off R2 (still only one default)", async () => {
    await saveProviderConnection(storageService, pubkey, { provider: "cloudflare_r2", payload: r2Payload, meta: { provider: "cloudflare_r2" }, isDefault: true });
    await saveProviderConnection(storageService, pubkey, { provider: "backblaze_b2", payload: b2Payload, meta: { provider: "backblaze_b2" }, isDefault: false });
    await saveProviderConnection(storageService, pubkey, { provider: "backblaze_b2", payload: b2Payload, meta: { provider: "backblaze_b2" }, isDefault: true });

    const conns = await storageService.listConnections(pubkey);
    assert.equal(conns.filter((c) => c.meta?.defaultForUploads).length, 1);
    assert.equal((await storageService.getConnection(pubkey, "backblaze_b2")).meta.defaultForUploads, true);
    assert.equal((await storageService.getConnection(pubkey, "cloudflare_r2")).meta.defaultForUploads, false);
  });

  test("a legacy shared 'default' slot is migrated to its per-provider id (no duplicate)", async () => {
    // Simulate the old UI: an R2 connection under the shared "default" id.
    await storageService.saveConnection(pubkey, "default", r2Payload, {
      provider: "cloudflare_r2",
      bucket: "legacy",
      defaultForUploads: true,
    });

    // Re-saving R2 through the new path should re-key it and remove the legacy slot.
    await saveProviderConnection(storageService, pubkey, {
      provider: "cloudflare_r2",
      payload: r2Payload,
      meta: { provider: "cloudflare_r2", bucket: "legacy" },
      isDefault: false,
    });

    const ids = (await storageService.listConnections(pubkey)).map((c) => c.id);
    assert.ok(ids.includes("cloudflare_r2"));
    assert.ok(!ids.includes("default"), "legacy 'default' slot removed");
    // Default-for-uploads carried over from the migrated connection.
    assert.equal((await storageService.getConnection(pubkey, "cloudflare_r2")).meta.defaultForUploads, true);
  });

  test("both connections are present in the exported account record (so sync carries them)", async () => {
    await saveProviderConnection(storageService, pubkey, { provider: "cloudflare_r2", payload: r2Payload, meta: { provider: "cloudflare_r2" }, isDefault: true });
    await saveProviderConnection(storageService, pubkey, { provider: "backblaze_b2", payload: b2Payload, meta: { provider: "backblaze_b2" }, isDefault: false });

    const record = await storageService.exportAccountRecord(pubkey);
    assert.deepEqual(
      Object.keys(record.connections).sort(),
      ["backblaze_b2", "cloudflare_r2"],
      "the synced record contains every provider's connection",
    );
  });
});
