import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import r2ServiceDefault from "../../../js/services/r2Service.js";
import storageService from "../../../js/services/storageService.js";
import { sanitizeBucketName } from "../../../js/storage/r2-mgmt.js";

const R2Service = r2ServiceDefault.constructor;
const npub = "npub1r2buckettest";
const metaBucket = "r2-meta-bucket";
const sanitizedBucket = sanitizeBucketName(npub);

let originalWindow;
let originalFile;
let originalFetch;
let originalSetTimeout;

beforeEach(() => {
  originalWindow = globalThis.window;
  originalFile = globalThis.File;
  originalFetch = globalThis.fetch;
  originalSetTimeout = globalThis.setTimeout;

  globalThis.window = {
    location: { origin: "" },
    crypto: globalThis.crypto,
    NostrTools: {
      nip19: {
        decode: () => ({ type: "npub", data: "pubkey123" }),
      },
    },
  };

  globalThis.File = class TestFile extends Blob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = name;
    }
  };

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "bitvid-verification",
  });

  globalThis.setTimeout = (fn) => {
    fn();
    return 0;
  };

  mock.method(storageService, "listConnections", async () => [
    {
      id: "conn-1",
      provider: "cloudflare_r2",
      meta: { defaultForUploads: true },
    },
  ]);
  mock.method(storageService, "isUnlocked", () => true);
  mock.method(storageService, "getConnection", async () => ({
    provider: "cloudflare_r2",
    accountId: "acct-123",
    accessKeyId: "access-key",
    secretAccessKey: "secret-key",
    endpoint: "https://r2.example.com",
    region: "auto",
    meta: {
      bucket: metaBucket,
      accountId: "acct-123",
      publicBaseUrl: "https://cdn.example.com",
    },
  }));

});

afterEach(() => {
  mock.restoreAll();
  globalThis.window = originalWindow;
  globalThis.File = originalFile;
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

describe("R2Service bucket selection", () => {
  it("uses meta.bucket for ensureBucketExists and multipartUpload", async () => {
    const bucketCalls = { ensure: [], multipart: [] };

    const ensureBucketExists = mock.fn(async ({ bucket }) => {
      bucketCalls.ensure.push(bucket);
    });
    const multipartUpload = mock.fn(async ({ bucket }) => {
      bucketCalls.multipart.push(bucket);
    });

    const service = new R2Service({
      makeR2Client: mock.fn(() => ({})),
      ensureBucketExists,
      ensureBucketCors: mock.fn(async () => {}),
      multipartUpload,
      deleteObject: mock.fn(async () => {}),
    });

    await service.prepareUpload(npub);

    assert.ok(bucketCalls.ensure.length > 0);
    for (const bucket of bucketCalls.ensure) {
      assert.strictEqual(bucket, metaBucket);
      assert.notStrictEqual(bucket, sanitizedBucket);
    }

    await service.handleCloudflareUploadSubmit({
      npub,
      file: new globalThis.File([], "video.mp4", { type: "video/mp4" }),
      metadata: { title: "Test upload" },
      publishVideoNote: mock.fn(async () => true),
    });

    assert.ok(bucketCalls.multipart.length > 0);
    for (const bucket of bucketCalls.multipart) {
      assert.strictEqual(bucket, metaBucket);
      assert.notStrictEqual(bucket, sanitizedBucket);
    }
  });

  it("uses configured meta.bucket when verifying public access", async () => {
    const bucketCalls = { ensure: [], multipart: [] };

    const ensureBucketExists = mock.fn(async ({ bucket }) => {
      bucketCalls.ensure.push(bucket);
    });
    const multipartUpload = mock.fn(async ({ bucket }) => {
      bucketCalls.multipart.push(bucket);
    });

    const service = new R2Service({
      makeR2Client: mock.fn(() => ({})),
      ensureBucketExists,
      ensureBucketCors: mock.fn(async () => {}),
      multipartUpload,
      deleteObject: mock.fn(async () => {}),
    });
    const result = await service.verifyPublicAccess({
      npub,
      settings: {
        accountId: "acct-123",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        baseDomain: "https://cdn.example.com",
        meta: { bucket: metaBucket },
      },
    });

    assert.strictEqual(result.success, true);
    assert.ok(bucketCalls.ensure.length > 0);
    assert.strictEqual(bucketCalls.ensure[0], metaBucket);
    assert.ok(bucketCalls.multipart.length > 0);
    assert.strictEqual(bucketCalls.multipart[0], metaBucket);
  });
});
