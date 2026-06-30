// #39: profile image/banner upload silently found "no storage" because
// ProfileEditController passes a HEX pubkey to r2Service.resolveConnection(), which
// only decoded npub1… strings (safeDecodeNpub) — so a hex pubkey resolved to null and
// the upload button stayed disabled even with storage configured. resolveConnection
// must accept a hex pubkey OR an npub.

import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import r2ServiceDefault from "../js/services/r2Service.js";
import storageService from "../js/services/storageService.js";

const R2Service = r2ServiceDefault.constructor;
const HEX = "a".repeat(64);

let originalWindow;

beforeEach(() => {
  originalWindow = globalThis.window;
  // nip19.decode THROWS on anything that isn't a real npub — exactly how the live
  // decoder behaves for a hex string. So if resolveConnection still works with hex,
  // it's using the hex path, not npub decoding.
  globalThis.window = {
    location: { origin: "" },
    NostrTools: {
      nip19: {
        decode: (value) => {
          if (typeof value === "string" && value.startsWith("npub1")) {
            return { type: "npub", data: HEX };
          }
          throw new Error("not an npub");
        },
      },
    },
  };

  mock.method(storageService, "listConnections", async () => [
    { id: "backblaze_b2", provider: "backblaze_b2", meta: { defaultForUploads: true } },
  ]);
  mock.method(storageService, "isUnlocked", () => true);
  mock.method(storageService, "getConnection", async () => ({
    provider: "backblaze_b2",
    accessKeyId: "b2-key",
    secretAccessKey: "b2-secret",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    forcePathStyle: false,
    meta: {
      bucket: "bitvid",
      provider: "backblaze_b2",
      publicBaseUrl: "https://bitvid.s3.us-west-004.backblazeb2.com",
      defaultForUploads: true,
    },
  }));
});

afterEach(() => {
  mock.restoreAll();
  globalThis.window = originalWindow;
});

describe("r2Service.resolveConnection accepts hex or npub", () => {
  it("resolves the configured connection when passed a HEX pubkey (the upload bug)", async () => {
    const svc = new R2Service();
    const conn = await svc.resolveConnection(HEX);
    assert.ok(conn, "hex pubkey must resolve a connection, not null");
    assert.equal(conn.provider, "backblaze_b2");
    assert.equal(conn.bucket, "bitvid");
    assert.equal(conn.baseDomain, "https://bitvid.s3.us-west-004.backblazeb2.com");
    assert.equal(conn.accessKeyId, "b2-key");
  });

  it("still resolves when passed an npub", async () => {
    const svc = new R2Service();
    const conn = await svc.resolveConnection("npub1anything");
    assert.ok(conn);
    assert.equal(conn.provider, "backblaze_b2");
  });

  it("returns null for empty / non-key input", async () => {
    const svc = new R2Service();
    assert.equal(await svc.resolveConnection(""), null);
  });
});
