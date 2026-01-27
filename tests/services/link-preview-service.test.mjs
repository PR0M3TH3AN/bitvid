import { test } from "node:test";
import assert from "node:assert/strict";
import { LinkPreviewService } from "../../js/services/linkPreviewService.js";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { JSDOM } from "jsdom";

// Polyfill IndexedDB
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

// Polyfill DOMParser
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
globalThis.URL = URL;

test("LinkPreviewService", async (t) => {
  const originalFetch = globalThis.fetch;

  t.afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const service = new LinkPreviewService({ ttlMs: 1000 });

  await t.test("initializes IndexedDB", async () => {
    const db = await service.init();
    assert.ok(db);
    assert.equal(db.objectStoreNames.contains("previews"), true);
  });

  await t.test("fetches and caches preview", async () => {
    // Mock fetch
    const htmlContent = `
      <html>
        <head>
          <meta property="og:title" content="Test Title" />
          <meta property="og:description" content="Test Description" />
          <meta property="og:image" content="https://example.com/image.png" />
          <meta property="og:site_name" content="Test Site" />
        </head>
      </html>
    `;

    globalThis.fetch = async (url) => {
      if (url === "https://example.com") {
        return {
          ok: true,
          text: async () => htmlContent,
        };
      }
      throw new Error("Network error");
    };

    const preview = await service.getPreview("https://example.com");

    assert.ok(preview);
    assert.equal(preview.title, "Test Title");
    assert.equal(preview.description, "Test Description");
    assert.equal(preview.image, "https://example.com/image.png");
    assert.equal(preview.siteName, "Test Site");

    // Verify cache
    const cached = await service.getCachedPreview("https://example.com");
    assert.deepEqual(cached, preview);
  });

  await t.test("returns null on fetch failure", async () => {
    globalThis.fetch = async () => {
      throw new Error("Network failure");
    };

    const preview = await service.getPreview("https://fail.com");
    assert.equal(preview, null);
  });

  await t.test("respects TTL", async () => {
    // Set a preview that is expired
    const expiredService = new LinkPreviewService({ ttlMs: -1000 });
    // Initialize DB first to ensure we write to the same place
    await expiredService.init();

    await expiredService.setCachedPreview("https://expired.com", { title: "Expired" });

    const cached = await expiredService.getCachedPreview("https://expired.com");
    assert.equal(cached, null);
  });

  await t.test("deletePreview removes from cache", async () => {
    await service.setCachedPreview("https://delete.com", { title: "Delete Me" });
    await service.deletePreview("https://delete.com");
    const cached = await service.getCachedPreview("https://delete.com");
    assert.equal(cached, null);
  });
});
