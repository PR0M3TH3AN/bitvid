import { test, describe, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import "../test-helpers/setup-localstorage.mjs";
import * as attachmentService from "../../js/services/attachmentService.js";

// Mock URL.createObjectURL and revokeObjectURL
const originalURL = globalThis.URL;
const originalFetch = globalThis.fetch;

describe("attachmentService", () => {
  before(() => {
    if (!globalThis.URL) {
      globalThis.URL = {};
    }
  });

  beforeEach(() => {
    globalThis.URL.createObjectURL = mock.fn(() => "blob:mock-url");
    globalThis.URL.revokeObjectURL = mock.fn();
    globalThis.fetch = mock.fn();

    // Clear cache before each test to ensure isolation,
    // but we need to be careful not to trigger revokeObjectURL calls that we count?
    // Actually, we should just clear it.
    attachmentService.clearAttachmentCache();
    // Then reset calls
    globalThis.URL.revokeObjectURL.mock.resetCalls();
  });

  after(() => {
    if (originalURL) {
      globalThis.URL = originalURL;
    } else {
      delete globalThis.URL;
    }
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete globalThis.fetch;
    }
  });

  afterEach(() => {
    mock.reset();
    attachmentService.clearAttachmentCache();
  });

  describe("prepareAttachmentUpload", () => {
    test("should prepare upload without encryption", async () => {
      const file = new File(["test content"], "test.txt", { type: "text/plain" });
      const result = await attachmentService.prepareAttachmentUpload({ file, encrypt: false });

      assert.strictEqual(result.name, "test.txt");
      assert.strictEqual(result.type, "text/plain");
      assert.strictEqual(result.size, 12);
      assert.strictEqual(result.encrypted, false);
      assert.strictEqual(result.key, "");
      // sha256 of "test content"
      assert.strictEqual(result.sha256, "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72");
    });

    test("should prepare upload with encryption", async () => {
      const file = new File(["test content"], "test.txt", { type: "text/plain" });
      const result = await attachmentService.prepareAttachmentUpload({ file, encrypt: true });

      assert.strictEqual(result.name, "test.txt");
      assert.strictEqual(result.type, "text/plain"); // Metadata preserves original type
      assert.strictEqual(result.encrypted, true);
      assert.ok(result.key.length > 0, "Should return a key");
      assert.notStrictEqual(result.uploadBlob, file, "Should return a new blob");
      assert.strictEqual(result.uploadBlob.type, "application/octet-stream"); // Actual blob is generic binary
    });
  });

  describe("downloadAttachment", () => {
    test("should download attachment", async () => {
      const mockResponse = {
        ok: true,
        blob: async () => new Blob(["test content"]),
        headers: new Map(),
      };
      globalThis.fetch.mock.mockImplementation(async () => mockResponse);

      const result = await attachmentService.downloadAttachment({ url: "https://example.com/file" });

      assert.strictEqual(globalThis.fetch.mock.callCount(), 1);
      assert.strictEqual(result.objectUrl, "blob:mock-url");
      assert.strictEqual(result.size, 12);
    });

    test("should verify hash", async () => {
      const mockResponse = {
        ok: true,
        blob: async () => new Blob(["test content"]),
        headers: new Map(),
      };
      globalThis.fetch.mock.mockImplementation(async () => mockResponse);

      const expectedHash = "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72";
      await attachmentService.downloadAttachment({ url: "https://example.com/file", expectedHash });

      // Should not throw
    });

    test("should throw on hash mismatch", async () => {
      const mockResponse = {
        ok: true,
        blob: async () => new Blob(["test content"]),
        headers: new Map(),
      };
      globalThis.fetch.mock.mockImplementation(async () => mockResponse);

      const expectedHash = "wronghash";

      await assert.rejects(
        async () => {
          await attachmentService.downloadAttachment({ url: "https://example.com/file", expectedHash });
        },
        /Attachment hash mismatch/
      );
    });
  });

  describe("caching", () => {
    test("should cache downloaded attachments", async () => {
        const mockResponse = {
            ok: true,
            blob: async () => new Blob(["test content"]),
            headers: new Map(),
        };
        globalThis.fetch.mock.mockImplementation(async () => mockResponse);

        const expectedHash = "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72";

        // First download
        await attachmentService.downloadAttachment({ url: "https://example.com/file1", expectedHash });
        assert.strictEqual(globalThis.fetch.mock.callCount(), 1);

        // Second download (should be cached)
        const result = await attachmentService.downloadAttachment({ url: "https://example.com/file1", expectedHash });
        // Fetch should NOT be called again
        assert.strictEqual(globalThis.fetch.mock.callCount(), 1);
        assert.strictEqual(result.cached, true);
    });

    test("should clear cache", async () => {
         const mockResponse = {
            ok: true,
            blob: async () => new Blob(["test content"]),
            headers: new Map(),
        };
        globalThis.fetch.mock.mockImplementation(async () => mockResponse);
        const expectedHash = "6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72";

        await attachmentService.downloadAttachment({ url: "https://example.com/file", expectedHash });
        assert.strictEqual(attachmentService.getAttachmentCacheStats().size, 1);

        // Clear call count for revokeObjectURL before clearing cache to isolate the count
        globalThis.URL.revokeObjectURL.mock.resetCalls();

        attachmentService.clearAttachmentCache();
        assert.strictEqual(attachmentService.getAttachmentCacheStats().size, 0);
        assert.strictEqual(globalThis.URL.revokeObjectURL.mock.callCount(), 1);
    });
  });
});
