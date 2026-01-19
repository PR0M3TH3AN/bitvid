import test from "node:test";
import assert from "node:assert";
import r2Service from "../../js/services/r2Service.js";

// Ensure localStorage is mocked
import "../../tests/test-helpers/setup-localstorage.mjs";

test("js/services/r2Service.js", async (t) => {
  t.beforeEach(async () => {
    localStorage.clear();
    await r2Service.clearSettings();
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
    assert.strictEqual(result, true);

    const saved = r2Service.getSettings();
    assert.strictEqual(saved.accountId, input.accountId);
    assert.strictEqual(saved.accessKeyId, input.accessKeyId);
    assert.strictEqual(saved.secretAccessKey, input.secretAccessKey);
    assert.strictEqual(saved.baseDomain, input.baseDomain);
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
    assert.match(status, /entered the S3 API URL/);

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
      accessKeyId: "key123",
      secretAccessKey: "secret123",
      baseDomain: "https://pub-xxx.r2.dev",
      bucket: "custom-bucket",
      isLegacy: true,
    };

    const result = await r2Service.ensureBucketConfigForNpub(npub, { credentials });
    assert.strictEqual(result.entry.bucket, "custom-bucket");
    assert.strictEqual(result.entry.publicBaseUrl, "https://pub-xxx.r2.dev");
    assert.strictEqual(result.customDomainStatus, "manual");
  });

  await t.test("resolveConnection - Returns Legacy Settings if no StorageService", async () => {
    const input = {
      accountId: "legacyAcc",
      accessKeyId: "legacyKey",
      secretAccessKey: "legacySecret",
      baseDomain: "https://legacy.com",
    };
    await r2Service.handleCloudflareSettingsSubmit(input);

    const npub = "npub1any";
    const resolved = await r2Service.resolveConnection(npub);

    assert.ok(resolved);
    assert.strictEqual(resolved.accountId, "legacyAcc");
    assert.strictEqual(resolved.isLegacy, true);
  });
});
