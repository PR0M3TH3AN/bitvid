import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

import { VideoModal } from "../js/ui/components/VideoModal.js";
import {
  setFeatureDesignSystemEnabled,
  resetRuntimeFlags,
} from "../js/constants.js";
import { applyDesignSystemAttributes } from "../js/designSystem.js";

const modalMarkupPromise = readFile(
  new URL("../components/video-modal.html", import.meta.url),
  "utf8"
);

async function setupModal({ designSystemEnabled = false, lazyLoad = false } = {}) {
  const markup = await modalMarkupPromise;
  const modalMarkup = lazyLoad ? "" : markup;
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body><button id="trigger" type="button">Open modal</button><div id="modalContainer">${modalMarkup}</div></body></html>`,
    { url: "https://example.com", pretendToBeVisual: true }
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
  globalThis.KeyboardEvent = window.KeyboardEvent;
  globalThis.MouseEvent = window.MouseEvent;

  setFeatureDesignSystemEnabled(designSystemEnabled);
  applyDesignSystemAttributes(document);

  let restoreFetch = null;
  if (lazyLoad) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (resource, init) => {
      const url = typeof resource === "string" ? resource : resource?.url;
      if (url && url.endsWith("components/video-modal.html")) {
        return {
          ok: true,
          status: 200,
          async text() {
            return markup;
          },
        };
      }
      if (typeof originalFetch === "function") {
        return originalFetch(resource, init);
      }
      throw new Error(`Unexpected fetch request in tests: ${String(url || resource)}`);
    };
    restoreFetch = () => {
      if (originalFetch) {
        globalThis.fetch = originalFetch;
      } else {
        delete globalThis.fetch;
      }
    };
  }

  const modal = new VideoModal({
    removeTrackingScripts: () => {},
    setGlobalModalState: () => {},
    document,
    logger: console,
  });

  let playerModal = document.querySelector("#playerModal");
  if (playerModal) {
    modal.hydrate(playerModal);
  } else {
    await modal.load();
    playerModal = modal.getRoot();
    assert.ok(playerModal, "player modal markup should exist after load");
  }

  const trigger = document.getElementById("trigger");
  assert.ok(trigger, "trigger button should exist");

  const cleanup = () => {
    try {
      resetRuntimeFlags();
    } catch (error) {
      console.warn("[tests] failed to reset runtime flags", error);
    }
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLVideoElement;
    delete globalThis.Element;
    delete globalThis.CustomEvent;
    delete globalThis.Event;
    delete globalThis.Node;
    delete globalThis.EventTarget;
    delete globalThis.navigator;
    delete globalThis.location;
    delete globalThis.KeyboardEvent;
    delete globalThis.MouseEvent;
    if (restoreFetch) {
      restoreFetch();
    }
  };

  return { window, document, modal, playerModal, trigger, cleanup };
}

test("backdrop data-dismiss closes the modal and restores focus", async (t) => {
  const { window, document, modal, playerModal, trigger, cleanup } =
    await setupModal();
  t.after(cleanup);
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

test("Escape key closes the modal and returns focus to the trigger", async (t) => {
  const { window, document, modal, playerModal, trigger, cleanup } =
    await setupModal();
  t.after(cleanup);
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

for (const designSystemEnabled of [false, true]) {
  const modeLabel = designSystemEnabled ? "design-system" : "legacy";

  test(
    `[${modeLabel}] video modal sticky navigation responds to scroll direction`,
    async (t) => {
      const { window, modal, playerModal, trigger, cleanup } =
        await setupModal({ designSystemEnabled });
      t.after(cleanup);

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      const nav = document.getElementById("modalNav");
      assert.ok(nav, "navigation bar should exist");
      const scrollRegion = playerModal.querySelector(".bv-modal__panel");
      assert.ok(scrollRegion, "modal panel should exist");

      let scrollPosition = 0;
      Object.defineProperty(scrollRegion, "scrollTop", {
        configurable: true,
        get() {
          return scrollPosition;
        },
        set(value) {
          scrollPosition = Number(value) || 0;
        }
      });

      scrollRegion.scrollTop = 120;
      assert.equal(modal.scrollRegion.scrollTop, 120);
      modal.modalNavScrollHandler?.();
      assert.equal(nav.style.transform, "translateY(-100%)");

      scrollRegion.scrollTop = 60;
      assert.equal(modal.scrollRegion.scrollTop, 60);
      modal.modalNavScrollHandler?.();
      assert.equal(nav.style.transform, "translateY(0)");

      scrollRegion.scrollTop = 10;
      assert.equal(modal.scrollRegion.scrollTop, 10);
      modal.modalNavScrollHandler?.();
      assert.equal(nav.style.transform, "translateY(0)");
    }
  );

  test(
    `[${modeLabel}] video modal video shell is not sticky at mobile breakpoints`,
    async (t) => {
      const { window, modal, playerModal, trigger, cleanup } =
        await setupModal({ designSystemEnabled });
      t.after(cleanup);

      const originalInnerWidth = window.innerWidth;
      window.innerWidth = 390;
      t.after(() => {
        window.innerWidth = originalInnerWidth;
      });
      window.dispatchEvent(new window.Event("resize"));

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      const videoShell = playerModal.querySelector(".video-modal__video");
      assert.ok(videoShell, "video shell wrapper should exist");

      const stickyTargets = [
        videoShell,
        videoShell.querySelector(".card"),
      ].filter(Boolean);

      stickyTargets.forEach((element) => {
        assert.equal(
          element.classList.contains("sticky"),
          false,
          "video shell should not use sticky positioning on mobile"
        );
      });
    }
  );

  test(
    `[${modeLabel}] video modal toggles document scroll locking on open/close`,
    async (t) => {
      const { document, modal, trigger, cleanup } = await setupModal({
        designSystemEnabled,
      });
      t.after(cleanup);

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      assert.equal(
        document.documentElement.classList.contains("modal-open"),
        true
      );
      assert.equal(document.body.classList.contains("modal-open"), true);

      modal.close();
      await Promise.resolve();

      assert.equal(
        document.documentElement.classList.contains("modal-open"),
        false
      );
      assert.equal(document.body.classList.contains("modal-open"), false);
      assert.strictEqual(document.activeElement, trigger);
    }
  );

  test(
    `[${modeLabel}] video modal zap dialog updates aria state while toggling`,
    async (t) => {
      const {
        window,
        document,
        modal,
        playerModal,
        trigger,
        cleanup,
      } = await setupModal({ designSystemEnabled });
      t.after(cleanup);

      modal.open(null, { triggerElement: trigger });
      await Promise.resolve();

      const zapButton = document.getElementById("modalZapBtn");
      const zapDialog = document.getElementById("modalZapDialog");
      const amountInput = document.getElementById("modalZapAmountInput");
      assert.ok(zapButton, "zap trigger should exist");
      assert.ok(zapDialog, "zap dialog should exist");
      assert.ok(amountInput, "zap amount input should exist");

      modal.setZapVisibility(true);

      assert.equal(zapDialog.hidden, true);
      assert.equal(zapDialog.dataset.state, "closed");
      assert.equal(zapButton.getAttribute("aria-expanded"), "false");

      zapButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true })
      );

      assert.equal(zapDialog.hidden, false);
      assert.equal(zapDialog.dataset.state, "open");
      assert.equal(zapDialog.getAttribute("aria-hidden"), "false");
      assert.equal(zapButton.getAttribute("aria-expanded"), "true");
      assert.strictEqual(document.activeElement, amountInput);

      const closeButton = document.getElementById("modalZapCloseBtn");
      assert.ok(closeButton, "zap close button should exist");

      closeButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true })
      );

      assert.equal(zapDialog.hidden, true);
      assert.equal(zapDialog.dataset.state, "closed");
      assert.equal(zapDialog.getAttribute("aria-hidden"), "true");
      assert.equal(zapButton.getAttribute("aria-expanded"), "false");

      modal.close();
    }
  );

  if (designSystemEnabled) {
    test(
      `[${modeLabel}] video modal inherits design system mode when loaded dynamically`,
      async (t) => {
        const { playerModal, cleanup } = await setupModal({
          designSystemEnabled,
          lazyLoad: true,
        });
        t.after(cleanup);

        assert.strictEqual(playerModal.getAttribute("data-ds"), "new");
      }
    );
  }
}
