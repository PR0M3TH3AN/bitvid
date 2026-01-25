import { test, describe, it, before, after } from "node:test";
import assert from "node:assert";
import { createUiDom } from "./helpers/jsdom-test-helpers.mjs";

describe("UploadModal Reset Logic", () => {
  let dom;
  let UploadModal;

  // Mock StorageService
  const mockStorageService = {
      isUnlocked: () => true,
      unlock: async () => {},
      listConnections: async () => [],
      getConnection: async () => null,
      saveConnection: async () => {},
      isMock: true
  };

  // Mock R2Service
  const mockR2Service = {
      prepareUpload: async () => ({
          settings: {},
          bucketEntry: { bucket: 'test', publicBaseUrl: 'https://test.com' }
      }),
      uploadFile: async () => {
          // Default immediate resolution
          return {};
      }
  };

  before(async () => {
    dom = createUiDom();
    global.window = dom.window;
    global.document = dom.document;
    global.EventTarget = dom.window.EventTarget;
    global.alert = (msg) => { console.log("ALERT CALLED:", msg); };
    global.HTMLElement = dom.window.HTMLElement;
    global.HTMLInputElement = dom.window.HTMLInputElement;
    global.HTMLButtonElement = dom.window.HTMLButtonElement;
    global.HTMLDivElement = dom.window.HTMLDivElement;

    const module = await import("../../js/ui/components/UploadModal.js");
    UploadModal = module.UploadModal;
  });

  after(() => {
    if (dom) dom.cleanup();
  });

  const mockHtml = `
      <div id="uploadModal" class="hidden">
        <form id="unifiedUploadForm">
          <button id="btn-mode-upload"></button>
          <button id="btn-mode-external"></button>
          <div id="section-source-upload">
             <button id="btn-storage-settings"></button>
             <div id="section-storage-settings" class="hidden">
                <div id="storage-summary-view" class="hidden"></div>
                <div id="storage-empty-view" class="hidden"></div>
             </div>
             <div id="upload-status-text"></div>
             <div id="upload-percent-text"></div>
             <div id="upload-progress-container"></div>
             <div id="thumbnail-progress-container"></div>
             <div id="upload-results-container"></div>
             <progress id="input-progress"></progress>
             <progress id="input-thumbnail-progress"></progress>
          </div>
          <div id="section-source-external"></div>

          <input id="input-title" />
          <textarea id="input-description"></textarea>
          <input id="input-thumbnail" />
          <input id="input-thumbnail-file" type="file" />
          <input id="input-file" type="file" />
          <input id="input-url" />
          <input id="input-magnet" />

          <input id="result-video-url" />
          <input id="result-magnet" />
          <input id="result-torrent-url" />

          <input id="check-nsfw" type="checkbox" />
          <input id="check-kids" type="checkbox" />
          <input id="check-comments" type="checkbox" />
          <input id="check-summary-unlock" type="checkbox" />

          <button id="btn-advanced-toggle"></button>
          <button id="btn-thumbnail-file"></button>
          <button id="btn-storage-unlock"></button>
          <button id="btn-manage-storage"></button>
          <button id="btn-configure-storage"></button>

          <div id="section-advanced"></div>

          <button id="btn-submit"></button>
          <div id="submit-status"></div>
        </form>
        <button id="closeUploadModal"></button>
      </div>
  `;

  it("should reset upload state and inputs when resetUploads is called", async () => {
      const container = document.createElement("div");
      container.id = "modalContainer";
      document.body.appendChild(container);

      global.fetch = async () => ({ ok: true, text: async () => mockHtml });

      const modal = new UploadModal({
          storageService: mockStorageService,
          r2Service: mockR2Service,
          getCurrentPubkey: () => "pk1",
          removeTrackingScripts: () => {},
          setGlobalModalState: () => {},
      });

      await modal.load({ container });

      // Simulate modified state
      modal.videoUploadState.status = 'complete';
      modal.inputs.file = { value: 'fake-path' }; // Mock input value
      modal.inputs.thumbnail.disabled = true;
      modal.inputs.thumbnail.placeholder = "Selected: file.jpg";

      const initialVideoId = modal.videoUploadId;

      modal.resetUploads();

      // Assertions
      assert.strictEqual(modal.videoUploadState.status, 'idle', "State should be idle");
      assert.strictEqual(modal.inputs.file.value, "", "File input should be cleared");
      assert.strictEqual(modal.inputs.thumbnail.disabled, false, "Thumbnail input should be enabled");
      assert.strictEqual(modal.inputs.thumbnail.placeholder, "https://example.com/thumbnail.jpg", "Thumbnail placeholder should be reset");
      assert.strictEqual(modal.videoUploadId, initialVideoId + 1, "Video upload ID should be incremented");
  });

  it("should guard against zombie callbacks when upload is reset during process", async () => {
      const container = document.createElement("div");
      container.id = "modalContainer2";
      document.body.appendChild(container);

      let resolveUpload;
      const delayedUpload = new Promise(r => { resolveUpload = r; });

      const slowR2Service = {
          prepareUpload: async () => ({
               settings: {},
               bucketEntry: { bucket: 'test', publicBaseUrl: 'https://test.com' }
          }),
          uploadFile: () => delayedUpload // Return promise that waits
      };

      const modal = new UploadModal({
          storageService: mockStorageService,
          r2Service: slowR2Service,
          getCurrentPubkey: () => "pk1",
          removeTrackingScripts: () => {},
          setGlobalModalState: () => {},
      });

      await modal.load({ container });

      // Force configured state
      modal.storageConfigured = true;
      modal.isStorageUnlocked = true;
      modal.activeProvider = "cloudflare_r2";
      modal.activeCredentials = { accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'sec' };

      // Start upload
      const file = { name: "video.mp4" };
      const event = { target: { files: [file], value: "video.mp4" } };

      // Start the async process without awaiting it yet
      const uploadPromise = modal.handleVideoSelection(event);

      // Verify it started
      assert.strictEqual(modal.videoUploadState.status, 'uploading');

      // RESET immediately
      modal.resetUploads();

      // Verify it reset
      assert.strictEqual(modal.videoUploadState.status, 'idle');

      // Now let the upload promise resolve
      resolveUpload({ bucket: 'b', key: 'k' });

      // Also need to handle generateTorrentMetadata which might be awaited
      // Assuming it resolves quickly or we mock it too.
      // UploadModal mocks `generateTorrentMetadata` internally? No, it's a method on instance or imported.
      // It calls `this.generateTorrentMetadata`. We can spy/mock it.
      modal.generateTorrentMetadata = async () => ({ hasValidInfoHash: false });

      await uploadPromise;

      // Assert that state remains 'idle' and wasn't overwritten by 'complete'
      assert.strictEqual(modal.videoUploadState.status, 'idle', "State should remain idle after zombie completion");
      assert.strictEqual(modal.results.videoUrl.value, "", "Result URL should be empty");
  });

  it("should call resetUploads when close is called", async () => {
      const container = document.createElement("div");
      container.id = "modalContainer3";
      document.body.appendChild(container);

      const modal = new UploadModal({
          storageService: mockStorageService,
          r2Service: mockR2Service,
          setGlobalModalState: () => {},
      });
      await modal.load({ container });

      let resetCalled = false;
      const originalReset = modal.resetUploads.bind(modal);
      modal.resetUploads = () => {
          resetCalled = true;
          originalReset();
      };

      modal.close();
      assert.strictEqual(resetCalled, true, "resetUploads should be called on close");
  });
});
