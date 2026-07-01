// showPasswordPrompt() collects a passphrase/PIN via a styled dialog (used to unlock a
// stored nsec key when switching accounts). Resolves the entered string, or null when
// the user cancels/escapes.

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import { showPasswordPrompt } from "../js/ui/promptDialog.js";

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

const overlay = () => dom.window.document.querySelector(".bv-modal");
const input = () => overlay().querySelector('input[type="password"]');

test("resolves the entered value on Confirm and removes the dialog", async () => {
  const p = showPasswordPrompt("Enter your PIN", { confirmLabel: "Switch" });
  input().value = "hunter2";
  overlay().querySelector(".btn").click(); // confirm (cancel is .btn-ghost)
  assert.equal(await p, "hunter2");
  assert.equal(overlay(), null, "dialog removed after resolving");
});

test("resolves the value when Enter is pressed in the input", async () => {
  const p = showPasswordPrompt("PIN");
  const el = input();
  el.value = "s3cret";
  el.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  assert.equal(await p, "s3cret");
});

test("resolves null when cancelled", async () => {
  const p = showPasswordPrompt("PIN");
  overlay().querySelector(".btn-ghost").click();
  assert.equal(await p, null);
});

test("resolves null on Escape", async () => {
  const p = showPasswordPrompt("PIN");
  dom.window.document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.equal(await p, null);
});

test("focuses the input so the user can type immediately", async () => {
  const p = showPasswordPrompt("PIN");
  assert.equal(dom.window.document.activeElement, input());
  overlay().querySelector(".btn-ghost").click();
  await p;
});

test("without a DOM it resolves null rather than throwing", async () => {
  delete globalThis.document;
  delete globalThis.window;
  assert.equal(await showPasswordPrompt("PIN"), null);
});
