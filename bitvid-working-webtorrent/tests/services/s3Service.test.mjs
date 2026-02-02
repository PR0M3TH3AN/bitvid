import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { createUiDom } from "../ui/helpers/jsdom-test-helpers.mjs";

// Disable network imports to prevent S3 SDK loading
globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;

const s3Service = await import("../../js/services/s3Service.js");

describe("s3Service", () => {
  describe("validateS3Connection", () => {
    test("should validate correct configuration", () => {
      const config = {
        endpoint: "https://s3.example.com",
        region: "us-east-1",
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucket: "my-bucket",
        forcePathStyle: true,
      };

      const result = s3Service.validateS3Connection(config);
      assert.strictEqual(result.endpoint, "https://s3.example.com");
      assert.strictEqual(result.bucket, "my-bucket");
      assert.ok(result.publicBaseUrl.includes("my-bucket"));
    });

    test("should throw on missing required fields", () => {
      assert.throws(() => s3Service.validateS3Connection({}), /S3 endpoint is required/);
      // Region defaults to auto, so next check is Access Key ID
      assert.throws(() => s3Service.validateS3Connection({ endpoint: "x" }), /S3 access key ID is required/);
    });
  });

  describe("getCorsOrigins", () => {
    let uiDom;
    const originalWindow = global.window;

    afterEach(() => {
      if (uiDom) {
        uiDom.cleanup();
        uiDom = null;
      }
      global.window = originalWindow;
    });

    test("should return current origin", () => {
      uiDom = createUiDom({ url: "https://app.bitvid.invalid/" });
      global.window = uiDom.window;

      const origins = s3Service.getCorsOrigins();
      assert.ok(origins.includes("https://app.bitvid.invalid"));
    });

    test("should handle localhost", () => {
      uiDom = createUiDom({ url: "http://localhost:3000/" });
      global.window = uiDom.window;

      const origins = s3Service.getCorsOrigins();
      assert.ok(origins.includes("http://localhost:3000"));
      assert.ok(origins.includes("https://localhost:3000")); // Should add https version
    });
  });
});
