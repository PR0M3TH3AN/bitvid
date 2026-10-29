// Actual R2Service/StorageService resolution, SDK wrapper and deleteObject;
// only persistence IO and remote SDK transport are virtualized. Integrity note:
// docs/testing/storage-cors-delete-integrity.md
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import "./test-helpers/setup-localstorage.mjs";

let requests = [];
let configurations = [];
let failTorrent = false;
const transportKey = Symbol.for("bitvid.storage-delete-test-transport");
globalThis[transportKey] = {
  make(config) { configurations.push(config); },
  async send(command) {
    assert.equal(command.constructor.name, "DeleteObjectCommand");
    requests.push(command.input);
    if (failTorrent && command.input.Key.endsWith(".torrent")) {
      throw new Error("fixture delete failure");
    }
    return {};
  },
};
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("https://esm.sh/@aws-sdk/client-s3@")) {
      return { url: "offline:storage-delete-sdk", shortCircuit: true };
    }
    if (/^https?:/.test(specifier)) throw new Error("Network forbidden in storage delete fixture");
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "offline:storage-delete-sdk") return {
      format: "module", shortCircuit: true,
      source: `const transport = globalThis[Symbol.for("bitvid.storage-delete-test-transport")];
        export class S3Client { constructor(config) { transport.make(config); }
          send(command) { return transport.send(command); } }
        export class DeleteObjectCommand { constructor(input) { this.input = input; } }`,
    };
    return nextLoad(url, context);
  },
});
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = false;
const { ensureS3SdkLoaded } = await import("../js/storage/s3-client.js");
await ensureS3SdkLoaded();
const { R2Service } = await import("../js/services/r2Service.js");
const { default: storageService } = await import("../js/services/storageService.js");
hooks.deregister();
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const base = "https://bucket.example.invalid/owned";
const owner = "a".repeat(64);
const settings = { provider: "cloudflare_r2", accountId: "fixture-account", bucket: "owned-bucket", publicBaseUrl: base, accessKeyId: "fixture-access", secretAccessKey: "fixture-key" };
const videos = [{ url: `${base}/clip.mp4`, thumbnail: `${base}/thumb.jpg` }];
const reset = () => { requests = []; configurations = []; failTorrent = false; };
const noIo = () => { assert.deepEqual(requests, []); assert.deepEqual(configurations, []); };
const assertSkipped = (result, reason) => {
  if (reason) assert.equal(result.reason, reason);
  assert.equal(result.skipped, true);
  assert.ok(result.reason);
  assert.deepEqual(result.deleted, []);
  assert.deepEqual(result.failed, []);
};

for (const override of [{ bucket: 17 }, { publicBaseUrl: { url: base } }]) {
  const key = Object.keys(override)[0];
  test(`malformed cached ${key} metadata resolves to a skip without IO`, async () => {
    const originalRead = storageService._getAccount;
    try {
      reset();
      storageService._getAccount = async () => ({ connections: { fixture: {
        id: "fixture", provider: "cloudflare_r2",
        meta: { defaultForUploads: true, accountId: "fixture-account", bucket: settings.bucket, publicBaseUrl: base, ...override },
      } } });
      const service = new R2Service();
      const resolved = await service.resolveConnection(owner);
      assert.deepEqual(resolved[key], override[key]);
      assertSkipped(await service.deleteVideoStorage({ npub: owner, videos }), "invalid-connection");
      noIo();
    } finally { storageService._getAccount = originalRead; }
  });
}

for (const key of ["accessKeyId", "secretAccessKey", "bucket", "publicBaseUrl", "baseDomain"]) {
  test(`malformed direct ${key} is skipped without object coercion or IO`, async () => {
    for (const value of [17, true, [], { trim() { throw new Error("must not invoke object methods"); }, toString() { throw new Error("must not coerce"); } }]) {
      reset();
      assertSkipped(await new R2Service().deleteVideoStorage({ credentials: { ...settings, [key]: value }, videos }), "invalid-connection");
      noIo();
    }
  });
}

test("malformed direct owner identifiers are skipped before resolving a connection", async () => {
  for (const field of ["npub", "pubkey"]) {
    reset();
    const service = new R2Service();
    service.resolveConnection = async () => { throw new Error("must not resolve malformed owner"); };
    assertSkipped(await service.deleteVideoStorage({ [field]: { trim() { throw new Error("must not trim an object"); } }, credentials: settings, videos }), "invalid-owner");
    noIo();
  }
});

test("missing, null, or primitive parameter objects safely skip", async () => {
  for (const options of [undefined, null, 17, "bad", false]) {
    reset();
    const result = await new R2Service().deleteVideoStorage(options);
    assertSkipped(result);
    assert.equal(result.reason, "no-videos");
    noIo();
  }
});

test("valid R2 and generic S3 delete all owned objects with provider settings intact", async () => {
  for (const generic of [false, true]) {
    reset();
    const credentials = { ...settings, provider: generic ? "generic_s3" : "cloudflare_r2", accountId: generic ? "" : settings.accountId, endpoint: "https://s3.example.invalid", region: "fixture-region", forcePathStyle: false };
    const result = await new R2Service().deleteVideoStorage({ credentials, videos });
    assert.equal(result.skipped, false);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(new Set(result.deleted), new Set(["clip.mp4", "clip.torrent", "thumb.jpg"]));
    assert.deepEqual(requests.map(request => request.Bucket), [settings.bucket, settings.bucket, settings.bucket]);
    assert.equal(configurations.length, 1);
    assert.equal(configurations[0].forcePathStyle, !generic);
    assert.equal(configurations[0].endpoint, credentials.endpoint);
    assert.equal(configurations[0].region, credentials.region);
  }
});

test("external hosts and base-prefix siblings cannot cause deletes", async () => {
  reset();
  const result = await new R2Service().deleteVideoStorage({ credentials: settings, videos: [{ url: "https://external.example.invalid/clip.mp4" }, { url: `${base}-sibling/clip.mp4` }] });
  assertSkipped(result);
  assert.equal(result.reason, "no-matching-objects");
  noIo();
});

test("locked storage distinguishes owned objects from external URLs", async () => {
  for (const owned of [false, true]) {
    reset();
    const result = await new R2Service().deleteVideoStorage({ credentials: { ...settings, accessKeyId: "", secretAccessKey: "" }, videos: owned ? videos : [{ url: "https://external.example.invalid/clip.mp4" }] });
    assertSkipped(result);
    assert.equal(result.reason, owned ? "storage-locked" : "no-matching-objects");
    noIo();
  }
});

test("partial delete failures are reported while later owned objects still delete", async () => {
  reset(); failTorrent = true;
  const result = await new R2Service().deleteVideoStorage({ credentials: settings, videos });
  assert.equal(result.skipped, false);
  assert.deepEqual(new Set(result.deleted), new Set(["clip.mp4", "thumb.jpg"]));
  assert.deepEqual(result.failed, [{ key: "clip.torrent", error: "fixture delete failure" }]);
  assert.equal(requests.length, 3);
});
