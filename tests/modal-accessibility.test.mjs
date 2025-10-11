import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import { UploadModal } from "../js/ui/components/UploadModal.js";
import { EditModal } from "../js/ui/components/EditModal.js";
import { RevertModal } from "../js/ui/components/RevertModal.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "../js/ui/components/staticModalAccessibility.js";

const uploadMarkupPromise = readFile(
  new URL("../components/upload-modal.html", import.meta.url),
  "utf8",
);
const editMarkupPromise = readFile(
  new URL("../components/edit-video-modal.html", import.meta.url),
  "utf8",
);
const revertMarkupPromise = readFile(
  new URL("../components/revert-video-modal.html", import.meta.url),
  "utf8",
);

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
  globalThis.navigator = window.navigator;
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
    delete globalThis.navigator;
    delete globalThis.location;
    delete globalThis.KeyboardEvent;
    delete globalThis.MouseEvent;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  };
}

function stubFetch(responses) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (resource) => {
    const key = typeof resource === "string" ? resource : resource?.toString?.();
    if (!key || !responses.has(key)) {
      throw new Error(`Unexpected fetch request: ${key}`);
    }
    const body = responses.get(key);
    return {
      ok: true,
      text: async () => body,
    };
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("UploadModal closes on Escape and restores trigger focus", async () => {
  const markup = await uploadMarkupPromise;
  const cleanups = [];
  cleanups.push(
    installDom(
      "<!DOCTYPE html><html><body><button id=\"trigger\">Upload</button><div id=\"modalContainer\"></div></body></html>",
    ),
  );
  cleanups.push(
    stubFetch(
      new Map([["components/upload-modal.html", markup]]),
    ),
  );

  const modal = new UploadModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
  });
  await modal.load();

  const trigger = document.getElementById("trigger");
  assert.ok(trigger);

  modal.open({ triggerElement: trigger });
  await flushMicrotasks();

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await flushMicrotasks();

  const root = modal.getRoot();
  assert.ok(root?.classList.contains("hidden"));
  assert.strictEqual(document.activeElement, trigger);

  modal.destroy();
  cleanups.reverse().forEach((fn) => fn?.());
});

test("EditModal Escape closes and restores trigger focus", async () => {
  const markup = await editMarkupPromise;
  const cleanups = [];
  cleanups.push(
    installDom(
      "<!DOCTYPE html><html><body><button id=\"trigger\">Edit</button><div id=\"modalContainer\"></div></body></html>",
    ),
  );
  cleanups.push(
    stubFetch(
      new Map([["components/edit-video-modal.html", markup]]),
    ),
  );

  const modal = new EditModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    sanitizers: {},
    escapeHtml: (value) => String(value ?? ""),
    showError: () => {},
    getMode: () => "live",
  });
  await modal.load();

  const trigger = document.getElementById("trigger");
  assert.ok(trigger);

  await modal.open(
    {
      id: "event1",
      title: "Example",
      url: "https://example.com/video.mp4",
      magnet: "",
      ws: "",
      xs: "",
      enableComments: true,
      isPrivate: false,
      isNsfw: false,
      isForKids: false,
    },
    { triggerElement: trigger },
  );
  await flushMicrotasks();

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await flushMicrotasks();

  const root = modal.getRoot();
  assert.ok(root?.classList.contains("hidden"));
  assert.strictEqual(document.activeElement, trigger);

  modal.destroy();
  cleanups.reverse().forEach((fn) => fn?.());
});

test("RevertModal Escape closes and restores trigger focus", async () => {
  const markup = await revertMarkupPromise;
  const cleanups = [];
  cleanups.push(
    installDom(
      "<!DOCTYPE html><html><body><button id=\"trigger\">Revert</button><div id=\"modalContainer\"></div></body></html>",
    ),
  );
  cleanups.push(
    stubFetch(
      new Map([["components/revert-video-modal.html", markup]]),
    ),
  );

  const modal = new RevertModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    formatAbsoluteTimestamp: () => "",
    formatTimeAgo: () => "",
    escapeHTML: (value) => String(value ?? ""),
    truncateMiddle: (value) => value,
    fallbackThumbnailSrc: "",
  });
  await modal.load();

  const trigger = document.getElementById("trigger");
  assert.ok(trigger);

  modal.setHistory({ id: "video1", title: "Video" }, []);
  modal.open({ video: { id: "video1" } }, { triggerElement: trigger });
  await flushMicrotasks();

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await flushMicrotasks();

  const root = modal.modal;
  assert.ok(root?.classList.contains("hidden"));
  assert.strictEqual(document.activeElement, trigger);

  modal.destroy();
  cleanups.reverse().forEach((fn) => fn?.());
});

test("static modal helper toggles accessibility hooks", async () => {
  const cleanups = [];
  cleanups.push(
    installDom(`<!DOCTYPE html><html><body><button id="trigger">Open</button><div id="testModal" class="bv-modal hidden" data-open="false"><div class="bv-modal-backdrop" data-dismiss></div><div class="bv-modal__panel" tabindex="-1"><button type="button" data-dismiss>Close</button></div></div></body></html>`),
  );

  const modal = prepareStaticModal({ id: "testModal" });
  assert.ok(modal);

  const trigger = document.getElementById("trigger");
  assert.ok(trigger);

  openStaticModal(modal, { triggerElement: trigger });
  await flushMicrotasks();

  assert.strictEqual(modal.getAttribute("data-open"), "true");
  assert.ok(document.documentElement.classList.contains("modal-open"));

  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  await flushMicrotasks();

  assert.strictEqual(modal.getAttribute("data-open"), "false");
  assert.strictEqual(document.documentElement.classList.contains("modal-open"), false);
  assert.strictEqual(document.activeElement, trigger);

  closeStaticModal(modal);
  cleanups.reverse().forEach((fn) => fn?.());
});
