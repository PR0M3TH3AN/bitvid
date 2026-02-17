import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const originalFilePath = path.resolve(__dirname, "../../../js/ui/components/EmbedVideoModal.js");
const tempFilePath = path.resolve(__dirname, "../../../js/ui/components/EmbedVideoModal.test_temp.js");

// Setup JSDOM
const dom = new JSDOM(`<!DOCTYPE html>
<div id="modalContainer">
  <div id="embedVideoModal">
    <div class="bv-modal-backdrop"></div>
    <div class="modal-sheet">
        <button id="closeEmbedVideoModal"></button>
        <button id="cancelEmbedVideo"></button>
        <button id="copyEmbedVideo"></button>
        <input type="radio" id="embedVideoSourceCdn" />
        <input type="radio" id="embedVideoSourceP2p" />
        <input id="embedVideoWidth" />
        <input id="embedVideoHeight" />
        <textarea id="embedVideoSnippet"></textarea>
        <div id="embedVideoStatus"></div>
    </div>
  </div>
</div>`);

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

// Mock navigator on globalThis
Object.defineProperty(globalThis, 'navigator', {
  value: {
    clipboard: {
      writeText: async () => {},
    },
    userAgent: 'node-test',
  },
  writable: true,
  configurable: true,
});

// Prepare mocks on global
globalThis.mockStaticModal = {
  prepareStaticModal: () => {},
  openStaticModal: () => {},
  closeStaticModal: () => {},
};

globalThis.mockLogger = {
  user: {
    warn: () => {},
  },
};

globalThis.mockVideoPointer = {
  resolveVideoPointer: () => ({ pointer: ["nevent", "123", ""] }),
  buildVideoAddressPointer: () => "naddr:123",
};

// Create temp file with replaced imports
const content = fs.readFileSync(originalFilePath, "utf8");
let newContent = content
  .replace(
    /import\s*\{\s*prepareStaticModal,\s*openStaticModal,\s*closeStaticModal,?\s*\}\s*from\s*"\.\/staticModalAccessibility\.js";/s,
    'const { prepareStaticModal, openStaticModal, closeStaticModal } = globalThis.mockStaticModal;'
  )
  .replace(
    /import\s*logger\s*from\s*"\.\.\/\.\.\/utils\/logger\.js";/s,
    'const logger = globalThis.mockLogger;'
  )
  .replace(
    /import\s*\{\s*resolveVideoPointer,\s*buildVideoAddressPointer,?\s*\}\s*from\s*"\.\.\/\.\.\/utils\/videoPointer\.js";/s,
    'const { resolveVideoPointer, buildVideoAddressPointer } = globalThis.mockVideoPointer;'
  );

fs.writeFileSync(tempFilePath, newContent);

// Import the temp module
const { EmbedVideoModal } = await import(pathToFileURL(tempFilePath).href);

test("EmbedVideoModal handleCopy uses navigator.clipboard", async (t) => {
  const modal = new EmbedVideoModal();
  await modal.load();

  modal.snippetTextarea.value = "test snippet";

  let clipboardText = "";
  let writeTextCalled = false;

  // Set mock
  globalThis.navigator.clipboard.writeText = async (text) => {
    writeTextCalled = true;
    clipboardText = text;
  };

  let successMsg = "";
  modal.callbacks.showSuccess = (msg) => { successMsg = msg; };

  await modal.handleCopy();

  assert.equal(writeTextCalled, true, "Should call navigator.clipboard.writeText");
  assert.equal(clipboardText, "test snippet", "Should write correct text to clipboard");
  assert.ok(successMsg.includes("copied"), "Should show success message");
});

test("EmbedVideoModal handleCopy falls back to selection when clipboard fails", async (t) => {
    const modal = new EmbedVideoModal();
    await modal.load();

    modal.snippetTextarea.value = "test snippet";

    globalThis.navigator.clipboard.writeText = async () => {
      throw new Error("Clipboard error");
    };

    let errorMsg = "";
    modal.callbacks.showError = (msg) => { errorMsg = msg; };

    let selectCalled = false;
    modal.snippetTextarea.select = () => { selectCalled = true; };

    const originalExecCommand = document.execCommand;
    let execCommandCalled = false;
    document.execCommand = () => { execCommandCalled = true; return false; };

    await modal.handleCopy();

    // Expect NO execCommand call
    assert.equal(execCommandCalled, false, "Should NOT call execCommand");
    assert.ok(errorMsg.includes("manually"), "Should show manual copy message");

    document.execCommand = originalExecCommand;
});

// Cleanup
test.after(() => {
  if (fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath);
  }
});
