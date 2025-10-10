import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import { VideoModal } from "../js/ui/components/VideoModal.js";

const modalMarkupPromise = readFile(
  new URL("../components/video-modal.html", import.meta.url),
  "utf8"
);

async function setupModal() {
  const markup = await modalMarkupPromise;
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><button id="trigger" type="button">Open modal</button><div id="modalContainer">${markup}</div></body></html>`,
    { url: "https://example.com" }
  );

  const { window } = dom;
  const { document } = window;

  globalThis.window = window;
  globalThis.document = document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLVideoElement = window.HTMLVideoElement;
  globalThis.Element = window.Element;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.Node = window.Node;
  globalThis.EventTarget = window.EventTarget;
  globalThis.navigator = window.navigator;
  globalThis.location = window.location;

  const modal = new VideoModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    document,
    logger: console,
  });

  const playerModal = document.querySelector("#playerModal");
  assert.ok(playerModal, "player modal markup should exist");
  modal.hydrate(playerModal);

  const trigger = document.getElementById("trigger");
  assert.ok(trigger, "trigger button should exist");

  return { window, document, modal, playerModal, trigger };
}

test("backdrop data-dismiss closes the modal and restores focus", async () => {
  const { window, document, modal, playerModal, trigger } = await setupModal();
  const backdrop = playerModal.querySelector("[data-dismiss]");
  assert.ok(backdrop, "modal backdrop should be present");

  let closeEvents = 0;
  modal.addEventListener("modal:close", () => {
    closeEvents += 1;
    modal.close();
  });

  modal.open(null, { triggerElement: trigger });
  await Promise.resolve();

  backdrop.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true })
  );

  await Promise.resolve();

  assert.equal(closeEvents, 1);
  assert.strictEqual(document.activeElement, trigger);
});

test("Escape key closes the modal and returns focus to the trigger", async () => {
  const { window, document, modal, playerModal, trigger } = await setupModal();
  const closeButton = playerModal.querySelector("#closeModal");
  assert.ok(closeButton, "close button should be present");

  let closeEvents = 0;
  modal.addEventListener("modal:close", () => {
    closeEvents += 1;
    modal.close();
  });

  modal.open(null, { triggerElement: trigger });
  await Promise.resolve();

  closeButton.focus();

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );

  await Promise.resolve();

  assert.equal(closeEvents, 1);
  assert.strictEqual(document.activeElement, trigger);
});
