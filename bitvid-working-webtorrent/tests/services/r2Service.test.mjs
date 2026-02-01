import test from "node:test";
import assert from "node:assert";
import r2Service from "../../js/services/r2Service.js";
import storageService from "../../js/services/storageService.js";

// Ensure localStorage is mocked
import "../../tests/test-helpers/setup-localstorage.mjs";

test("js/services/r2Service.js", async (t) => {
  const originalNostrTools = globalThis.window?.NostrTools;
  const originalStorageMethods = {
    listConnections: storageService.listConnections,
    getConnection: storageService.getConnection,
    isUnlocked: storageService.isUnlocked,
  };

  t.beforeEach(async () => {
    localStorage.clear();
    await r2Service.clearSettings();
  });

  t.afterEach(() => {
    storageService.listConnections = originalStorageMethods.listConnections;
    storageService.getConnection = originalStorageMethods.getConnection;
    storageService.isUnlocked = originalStorageMethods.isUnlocked;

    if (originalNostrTools === undefined) {
      delete globalThis.window.NostrTools;
    } else {
      globalThis.window.NostrTools = originalNostrTools;
    }
  });

  await t.test("Default Settings", () => {
    const settings = r2Service.getSettings();
    // The actual default settings might contain more fields than we checked.
    // Let's verify the core fields match.
    assert.strictEqual(settings.accountId, "");
    assert.strictEqual(settings.accessKeyId, "");
    assert.strictEqual(settings.secretAccessKey, "");
    assert.strictEqual(settings.baseDomain, "");
    assert.deepStrictEqual(settings.buckets, {});
  });

  await t.test("handleCloudflareSettingsSubmit - Valid Input", async () => {
    const input = {
      accountId: "acc123",
      accessKeyId: "key123",
      secretAccessKey: "secret123",
      baseDomain: "https://pub-xxx.r2.dev",
    };

    const result = await r2Service.handleCloudflareSettingsSubmit(input);
    assert.strictEqual(result, false);
  });

  await t.test("handleCloudflareSettingsSubmit - Invalid S3 URL", async () => {
    const input = {
      accountId: "acc123",
      accessKeyId: "key123",
      secretAccessKey: "secret123",
      baseDomain: "https://something.r2.cloudflarestorage.com",
    };

    let status = "";
    const cleanup = r2Service.on("settingsStatus", (s) => (status = s.message));

    const result = await r2Service.handleCloudflareSettingsSubmit(input);
    assert.strictEqual(result, false);
    assert.match(status, /Legacy settings are disabled/);

    cleanup();
  });

  await t.test("handleCloudflareSettingsSubmit - Missing Fields", async () => {
    const input = {
      accountId: "acc123",
      // missing accessKeyId
      secretAccessKey: "secret123",
      baseDomain: "https://pub-xxx.r2.dev",
    };

    const result = await r2Service.handleCloudflareSettingsSubmit(input);
    assert.strictEqual(result, false);
  });

  await t.test("ensureBucketConfigForNpub - Uses Explicit Credentials", async () => {
    const npub = "npub1test";
    const credentials = {
      accountId: "acc123",
      accessKeyId: "",
      secretAccessKey: "",
      baseDomain: "https://pub-xxx.r2.dev",
      bucket: "custom-bucket",
      isLegacy: true,
    };

    const result = await r2Service.ensureBucketConfigForNpub(npub, { credentials });
    assert.strictEqual(result.entry.bucket, "custom-bucket");
    assert.strictEqual(result.entry.publicBaseUrl, "https://pub-xxx.r2.dev");
    assert.strictEqual(result.customDomainStatus, "manual");
  });

  await t.test("ensureBucketConfigForNpub - Uses Meta Bucket when Missing", async () => {
    const npub = "npub1testmeta";
    const credentials = {
      accountId: "acc456",
      accessKeyId: "",
      secretAccessKey: "",
      baseDomain: "https://pub-meta.r2.dev",
      meta: {
        bucket: "meta-bucket",
      },
      isLegacy: false,
    };

    const result = await r2Service.ensureBucketConfigForNpub(npub, { credentials });
    assert.strictEqual(result.entry.bucket, "meta-bucket");
  });

  await t.test("resolveConnection - Maps meta bucket into settings", async () => {
    const npub = "npub1metaresolve";
    const pubkeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd";

    globalThis.window.NostrTools = {
      nip19: {
        decode(value) {
          if (value === npub) {
            return { type: "npub", data: pubkeyHex };
          }
          throw new Error("Unexpected npub");
        },
      },
    };

    storageService.listConnections = async () => [
      {
        id: "default",
        provider: "cloudflare_r2",
        meta: {
          defaultForUploads: true,
          bucket: "meta-bucket",
          publicBaseUrl: "https://pub-meta.r2.dev",
          accountId: "acc456",
        },
      },
    ];
    storageService.isUnlocked = () => true;
    storageService.getConnection = async () => ({
      provider: "cloudflare_r2",
      accountId: "acc456",
      accessKeyId: "key456",
      secretAccessKey: "secret456",
      baseDomain: "https://pub-meta.r2.dev",
      publicBaseUrl: "https://pub-meta.r2.dev",
      meta: {
        bucket: "meta-bucket",
        publicBaseUrl: "https://pub-meta.r2.dev",
      },
    });

    const resolved = await r2Service.resolveConnection(npub);
    assert.ok(resolved);
    assert.strictEqual(resolved.bucket, "meta-bucket");
  });

  await t.test("resolveConnection - Returns null without StorageService entries", async () => {
    const input = {
      accountId: "legacyAcc",
      accessKeyId: "legacyKey",
      secretAccessKey: "legacySecret",
      baseDomain: "https://legacy.com",
    };
    await r2Service.handleCloudflareSettingsSubmit(input);

    const npub = "npub1any";
    const resolved = await r2Service.resolveConnection(npub);

    assert.strictEqual(resolved, null);
  });
});
