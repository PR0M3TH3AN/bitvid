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

  it("should auto-fill default R2 connection when loaded and unlocked", async () => {
      // Setup Mock Data
      const pubkey = "pk1";
      const r2Conn = {
          id: "r2-def",
          provider: "cloudflare_r2",
          meta: { label: "My R2", defaultForUploads: true, baseDomain: "https://r2.pub" },
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

      // Override load to use our container directly or mocked fetch
      // We must mock global.fetch to return the HTML content since JSDOM doesn't access file system.

      const mockHtml = `
      <div id="uploadModal" class="hidden">
        <form id="unifiedUploadForm">
          <button id="btn-mode-upload"></button>
          <button id="btn-mode-external"></button>
          <div id="section-source-upload">
             <button id="btn-storage-settings"></button>
             <div id="section-storage-settings" class="hidden">
               <input id="input-r2-account" />
               <input id="input-r2-key" />
               <input id="input-r2-secret" />
               <input id="input-r2-domain" />
               <button id="btn-save-settings"></button>
               <button id="btn-storage-unlock" class="hidden"></button>
             </div>
             <div id="storage-status"></div>
             <div id="storage-lock-status"></div>
          </div>
          <div id="section-source-external"></div>
        </form>
        <button id="btn-submit"></button>
        <div id="submit-status"></div>
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

      // Verify Inputs populated
      const accInput = document.getElementById("input-r2-account");
      const keyInput = document.getElementById("input-r2-key");
      const secretInput = document.getElementById("input-r2-secret");

      assert.strictEqual(accInput.value, "acc-id", "Account ID should be populated");
      assert.strictEqual(keyInput.value, "acc-key", "Access Key should be populated");
      assert.strictEqual(secretInput.value, "acc-secret", "Secret should be populated");
  });

  it("should handle locked state and unlock flow", async () => {
      const pubkey = "pk2";
      let unlocked = false;

      // Mock StorageService Behavior
      mockStorageService.isUnlocked = (pk) => unlocked;
      mockStorageService.unlock = async (pk) => { unlocked = true; };
      mockStorageService.listConnections = async () => []; // Return empty first to verify logic runs without crashing

      // Setup DOM
      const container = document.createElement("div");
      container.id = "modalContainer2"; // Different ID to avoid collision if DOM persists
      document.body.appendChild(container);

      // Re-instantiate
      const modal = new UploadModal({
          storageService: mockStorageService,
          getCurrentPubkey: () => pubkey,
          authService: { signer: {} }, // Mock signer presence
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
