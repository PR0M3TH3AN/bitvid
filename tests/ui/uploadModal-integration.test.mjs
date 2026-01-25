import { test, describe, it, before, after } from "node:test";
import assert from "node:assert";
import { createUiDom } from "./helpers/jsdom-test-helpers.mjs";

describe("UploadModal Integration", () => {
  let dom;
  let UploadModal;

  // Mock StorageService
  const mockStorageService = {
      isUnlocked: () => false,
      unlock: async () => {},
      listConnections: async () => [],
      getConnection: async () => null,
      saveConnection: async () => {},
      isMock: true
  };

  before(async () => {
    dom = createUiDom();
    global.window = dom.window;
    global.document = dom.document;
    global.EventTarget = dom.window.EventTarget;
    global.alert = (msg) => {}; // Polyfill alert for tests

    // UploadModal uses HTML elements
    global.HTMLElement = dom.window.HTMLElement;
    global.HTMLInputElement = dom.window.HTMLInputElement;
    global.HTMLButtonElement = dom.window.HTMLButtonElement;
    global.HTMLDivElement = dom.window.HTMLDivElement;

    // Load UploadModal class
    const module = await import("../../js/ui/components/UploadModal.js");
    UploadModal = module.UploadModal;
  });

  after(() => {
    if (dom) dom.cleanup();
  });

  it("should detect default R2 connection and show summary when loaded and unlocked", async () => {
      // Setup Mock Data
      const pubkey = "pk1";
      const r2Conn = {
          id: "r2-def",
          provider: "cloudflare_r2",
          meta: { label: "My R2", defaultForUploads: true, baseDomain: "https://r2.pub", bucket: "test-bucket" },
          accountId: "acc-id",
          accessKeyId: "acc-key",
          secretAccessKey: "acc-secret"
      };

      // Configure Mock
      mockStorageService.isUnlocked = (pk) => pk === pubkey;
      mockStorageService.listConnections = async (pk) => [r2Conn];
      mockStorageService.getConnection = async (pk, id) => (id === r2Conn.id ? r2Conn : null);

      // Setup DOM
      const container = document.createElement("div");
      container.id = "modalContainer";
      document.body.appendChild(container);

      const modal = new UploadModal({
          storageService: mockStorageService,
          getCurrentPubkey: () => pubkey,
          removeTrackingScripts: () => {},
          setGlobalModalState: () => {},
      });

      // Updated Mock HTML matching refactored component
      const mockHtml = `
      <div id="uploadModal" class="hidden">
        <form id="unifiedUploadForm">
          <button id="btn-mode-upload"></button>
          <button id="btn-mode-external"></button>
          <div id="section-source-upload">
             <button id="btn-storage-settings"></button>

             <!-- Storage Settings Container -->
             <div id="section-storage-settings" class="hidden">
                <!-- Summary View -->
                <div id="storage-summary-view" class="hidden">
                    <span id="storage-lock-status">Locked 🔒</span>
                    <button id="btn-storage-unlock" class="hidden">Unlock</button>
                    <button id="btn-manage-storage">Manage</button>
                    <span id="summary-provider">--</span>
                    <span id="summary-bucket">--</span>
                    <span id="summary-url-style">--</span>
                    <span id="summary-copy"></span>
                </div>

                <!-- Empty View -->
                <div id="storage-empty-view" class="hidden">
                    <button id="btn-configure-storage">Configure Storage</button>
                </div>
             </div>

             <div id="upload-status-text"></div>
             <div id="upload-percent-text"></div>
             <progress id="input-progress"></progress>
          </div>
          <div id="section-source-external"></div>

          <!-- Inputs -->
          <input id="input-title" />
          <textarea id="input-description"></textarea>
          <input id="input-thumbnail" />
          <input id="input-thumbnail-file" />
          <input id="input-file" />
          <input id="input-url" />
          <input id="input-magnet" />

          <input id="check-nsfw" type="checkbox" />
          <input id="check-kids" type="checkbox" />
          <input id="check-comments" type="checkbox" />
          <input id="check-summary-unlock" type="checkbox" />

          <button id="btn-advanced-toggle"></button>
          <button id="btn-thumbnail-file"></button>

          <div id="section-advanced"></div>

          <button id="btn-submit"></button>
          <div id="submit-status"></div>
        </form>
        <button id="closeUploadModal"></button>
      </div>
      `;

      global.fetch = async (url) => {
          if (url.includes("upload-modal.html")) {
              return {
                  ok: true,
                  text: async () => mockHtml
              };
          }
          return { ok: false };
      };

      await modal.load({ container });

      // Verify State
      assert.strictEqual(modal.storageConfigured, true, "Should be configured");
      assert.notStrictEqual(modal.activeCredentials, null, "Credentials should be loaded");
      assert.strictEqual(modal.activeCredentials.accountId, "acc-id", "Credentials should match mock");

      // Verify UI
      const summaryView = document.getElementById("storage-summary-view");
      const emptyView = document.getElementById("storage-empty-view");
      const providerLabel = document.getElementById("summary-provider");
      const bucketLabel = document.getElementById("summary-bucket");

      assert.strictEqual(summaryView.classList.contains("hidden"), false, "Summary view should be visible");
      assert.strictEqual(emptyView.classList.contains("hidden"), true, "Empty view should be hidden");
      assert.strictEqual(providerLabel.textContent, "Cloudflare R2", "Provider label should match");
      assert.strictEqual(bucketLabel.textContent, "test-bucket", "Bucket label should match");
  });

  it("should handle locked state and unlock flow", async () => {
      const pubkey = "pk2";
      let unlocked = false;

      // Mock StorageService Behavior
      mockStorageService.isUnlocked = (pk) => unlocked;
      mockStorageService.unlock = async (pk) => { unlocked = true; };
      // Return a connection so it's "configured" but locked
      mockStorageService.listConnections = async () => [{
          id: "conn1",
          provider: "cloudflare_r2",
          meta: { bucket: "locked-bucket" }
      }];

      // Setup DOM
      const container = document.createElement("div");
      container.id = "modalContainer2"; // Different ID to avoid collision if DOM persists
      document.body.appendChild(container);

      // Re-instantiate
      const modal = new UploadModal({
          storageService: mockStorageService,
          getCurrentPubkey: () => pubkey,
          authService: { signer: { signEvent: async () => {} } }, // Mock signer presence
          setGlobalModalState: () => {},
      });

      await modal.load({ container });

      const unlockBtn = container.querySelector("#btn-storage-unlock");
      const lockStatus = container.querySelector("#storage-lock-status");

      // 1. Check Locked State
      assert.strictEqual(unlocked, false);
      assert.ok(!unlockBtn.classList.contains("hidden"), "Unlock button should be visible");
      assert.match(lockStatus.textContent, /Locked/, "Status should say Locked");

      // 2. Perform Unlock
      // We need to simulate click or call handler.
      // modal.handleUnlock is bound to click.
      unlockBtn.click();

      // Wait for async operations (microtask queue)
      await new Promise(r => setTimeout(r, 10));

      assert.strictEqual(unlocked, true, "Storage should be unlocked");
      assert.ok(unlockBtn.classList.contains("hidden"), "Unlock button should be hidden after unlock");
      assert.match(lockStatus.textContent, /Unlocked/, "Status should say Unlocked");
  });
});
