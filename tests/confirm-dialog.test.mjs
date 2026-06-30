// showConfirm() replaces native window.confirm with a styled, promise-based dialog so
// all confirmations live in the app's UI system. It must resolve true on Confirm, false
// on Cancel/backdrop/Escape, clean up its DOM, and degrade gracefully without a DOM.

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { showConfirm } from "../js/ui/confirmDialog.js";

let dom;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.HTMLElement;
  delete globalThis.KeyboardEvent;
});

function overlay() {
  return dom.window.document.querySelector(".bv-modal");
}

test("renders a dialog with the message and resolves TRUE when Confirm is clicked", async () => {
  const p = showConfirm("Delete this thing?", { confirmLabel: "Delete", danger: true });
  const modal = overlay();
  assert.ok(modal, "an overlay was added to the DOM");
  assert.match(modal.textContent, /Delete this thing\?/);
  modal.querySelector(".btn").click(); // confirm button (cancel is .btn-ghost)
  assert.equal(await p, true);
  assert.equal(overlay(), null, "overlay removed after resolving");
});

test("resolves FALSE when Cancel is clicked", async () => {
  const p = showConfirm("Sure?");
  overlay().querySelector(".btn-ghost").click();
  assert.equal(await p, false);
  assert.equal(overlay(), null);
});

test("resolves FALSE when the backdrop is clicked", async () => {
  const p = showConfirm("Sure?");
  overlay().querySelector(".bv-modal-backdrop").click();
  assert.equal(await p, false);
});

test("resolves FALSE on Escape", async () => {
  const p = showConfirm("Sure?");
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(await p, false);
  assert.equal(overlay(), null);
});

test("a danger prompt focuses Cancel (the safe action) by default", async () => {
  const p = showConfirm("Delete?", { danger: true });
  assert.equal(
    dom.window.document.activeElement,
    overlay().querySelector(".btn-ghost"),
  );
  overlay().querySelector(".btn-ghost").click();
  await p;
});

test("without a DOM it declines rather than throwing", async () => {
  delete globalThis.document;
  delete globalThis.window;
  assert.equal(await showConfirm("anything"), false);
});
