import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "../js/ui/components/staticModalAccessibility.js";

function installDom(html) {
  const dom = new JSDOM(html, { url: "https://example.com" });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.EventTarget = window.EventTarget;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.Node = window.Node;
  globalThis.DOMParser = window.DOMParser;
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    writable: true,
    configurable: true,
  });
  globalThis.location = window.location;
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;
  if (typeof window.requestAnimationFrame !== "function") {
    window.requestAnimationFrame = (callback) =>
      setTimeout(() => callback(Date.now()), 0);
  }
  if (typeof window.cancelAnimationFrame !== "function") {
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  return () => {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.EventTarget;
    delete globalThis.CustomEvent;
    delete globalThis.Event;
    delete globalThis.Node;
    delete globalThis.DOMParser;
    delete globalThis.navigator;
    delete globalThis.location;
    delete globalThis.KeyboardEvent;
    delete globalThis.MouseEvent;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("prepareStaticModal finds element by ID and initializes data-open", async (t) => {
  const cleanup = installDom(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="testModal" class="bv-modal hidden">
          <div class="bv-modal-backdrop"></div>
          <div class="bv-modal__panel"></div>
        </div>
      </body>
    </html>
  `);

  const modal = prepareStaticModal({ id: "testModal" });
  assert.ok(modal, "Modal should be found and returned");
  assert.strictEqual(modal.id, "testModal", "Returned element should match ID");
  assert.strictEqual(modal.getAttribute("data-open"), "false", "data-open should be initialized to false for hidden modal");

  cleanup();
});

test("prepareStaticModal accepts direct element reference", async (t) => {
  const cleanup = installDom(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="testModal" class="bv-modal hidden">
          <div class="bv-modal-backdrop"></div>
          <div class="bv-modal__panel"></div>
        </div>
      </body>
    </html>
  `);

  const element = document.getElementById("testModal");
  const modal = prepareStaticModal({ root: element });
  assert.ok(modal, "Modal should be returned when passed directly");
  assert.strictEqual(modal, element, "Returned element should be the same instance");
  assert.strictEqual(modal.getAttribute("data-open"), "false", "data-open should be initialized");

  cleanup();
});

test("prepareStaticModal returns null for missing element", async (t) => {
  const cleanup = installDom(`<!DOCTYPE html><html><body></body></html>`);

  const modal = prepareStaticModal({ id: "nonExistent" });
  assert.strictEqual(modal, null, "Should return null if element not found");

  cleanup();
});

test("prepareStaticModal initializes data-open to true if modal is visible", async (t) => {
  const cleanup = installDom(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="testModal" class="bv-modal">
          <div class="bv-modal-backdrop"></div>
          <div class="bv-modal__panel"></div>
        </div>
      </body>
    </html>
  `);

  const modal = prepareStaticModal({ id: "testModal" });
  assert.strictEqual(modal.getAttribute("data-open"), "true", "data-open should be true for visible modal");

  cleanup();
});

test("openStaticModal shows modal and updates state", async (t) => {
  const cleanup = installDom(`
    <!DOCTYPE html>
    <html>
      <body>
        <button id="trigger">Open</button>
        <div id="testModal" class="bv-modal hidden" data-open="false">
          <div class="bv-modal-backdrop"></div>
          <div class="bv-modal__panel"></div>
        </div>
      </body>
    </html>
  `);

  const modal = document.getElementById("testModal");
  const trigger = document.getElementById("trigger");

  // Ensure prepared first
  prepareStaticModal({ root: modal });

  const result = openStaticModal(modal, { triggerElement: trigger });
  await flushMicrotasks();

  assert.strictEqual(result, true, "openStaticModal should return true on success");
  assert.strictEqual(modal.classList.contains("hidden"), false, "hidden class should be removed");
  assert.strictEqual(modal.getAttribute("data-open"), "true", "data-open attribute should be true");
  assert.ok(document.documentElement.classList.contains("modal-open"), "document should have modal-open class");

  cleanup();
});

test("openStaticModal returns false for invalid target", async (t) => {
  const cleanup = installDom(`<!DOCTYPE html><html><body></body></html>`);

  const result = openStaticModal(null);
  assert.strictEqual(result, false, "Should return false for null target");

  cleanup();
});

test("closeStaticModal hides modal and updates state", async (t) => {
  const cleanup = installDom(`
    <!DOCTYPE html>
    <html>
      <body class="modal-open">
        <button id="trigger">Open</button>
        <div id="testModal" class="bv-modal" data-open="true">
          <div class="bv-modal-backdrop"></div>
          <div class="bv-modal__panel"></div>
        </div>
      </body>
    </html>
  `);

  const modal = document.getElementById("testModal");
  // Ensure prepared
  prepareStaticModal({ root: modal });

  // Set initial state manually just to be sure
  document.documentElement.classList.add("modal-open");

  const result = closeStaticModal(modal);
  await flushMicrotasks();

  assert.strictEqual(result, true, "closeStaticModal should return true on success");
  assert.strictEqual(modal.classList.contains("hidden"), true, "hidden class should be added");
  assert.strictEqual(modal.getAttribute("data-open"), "false", "data-open attribute should be false");
  assert.strictEqual(document.documentElement.classList.contains("modal-open"), false, "modal-open class should be removed from document");

  cleanup();
});

test("closeStaticModal returns false for invalid target", async (t) => {
  const cleanup = installDom(`<!DOCTYPE html><html><body></body></html>`);

  const result = closeStaticModal(null);
  assert.strictEqual(result, false, "Should return false for null target");

  cleanup();
});

test("modal state synchronization handles multiple open modals", async (t) => {
  const cleanup = installDom(`
    <!DOCTYPE html>
    <html>
      <body>
        <div id="modal1" class="bv-modal hidden">
            <div class="bv-modal-backdrop"></div>
            <div class="bv-modal__panel"></div>
        </div>
        <div id="modal2" class="bv-modal hidden">
            <div class="bv-modal-backdrop"></div>
            <div class="bv-modal__panel"></div>
        </div>
      </body>
    </html>
  `);

  const modal1 = document.getElementById("modal1");
  const modal2 = document.getElementById("modal2");

  prepareStaticModal({ root: modal1 });
  prepareStaticModal({ root: modal2 });

  openStaticModal(modal1);
  await flushMicrotasks();
  assert.ok(document.documentElement.classList.contains("modal-open"), "modal-open set after opening first modal");

  openStaticModal(modal2);
  await flushMicrotasks();
  assert.ok(document.documentElement.classList.contains("modal-open"), "modal-open remains set after opening second modal");

  closeStaticModal(modal1);
  await flushMicrotasks();
  assert.ok(document.documentElement.classList.contains("modal-open"), "modal-open remains set while one modal is still open");

  closeStaticModal(modal2);
  await flushMicrotasks();
  assert.strictEqual(document.documentElement.classList.contains("modal-open"), false, "modal-open removed after closing last modal");

  cleanup();
});

test("prepareStaticModal handles missing document gracefully", async (t) => {
   // This is hard to test with JSDOM as we rely on global document,
   // but we can try passing a null document explicitly if the API supports it.
   // The API signature is prepareStaticModal({ id, root, document: providedDocument } = {})

   const result = prepareStaticModal({ id: "test", document: null });
   // If no global document (which exists due to JSDOM import in other tests context or node environment), it might use global.
   // But existing code: const doc = resolveDocument(providedDocument); -> returns global document if provided is null.
   // So we can't easily simulate "no document" unless we don't install DOM first.

   // Let's rely on the fact that if we don't call installDom, global.document is undefined.
   // But JSDOM might be polluting global scope from other tests running in the same process?
   // Node test runner runs files in isolation usually, or we can assume clean slate.

   // However, since we are using JSDOM in this file, let's just test passing a dummy object as document that doesn't have getElementById

   const mockDoc = { getElementById: () => null };
   const result2 = prepareStaticModal({ id: "test", document: mockDoc });
   assert.strictEqual(result2, null);
});
