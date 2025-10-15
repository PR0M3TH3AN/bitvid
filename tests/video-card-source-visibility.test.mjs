import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { updateVideoCardSourceVisibility } from "../js/utils/cardSourceVisibility.js";
import { VideoCard } from "../js/ui/components/VideoCard.js";

function setupDom(t) {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://example.com",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const previous = new Map();
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "MouseEvent",
    "CustomEvent",
    "ResizeObserver",
    "CSSStyleSheet",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];

  keys.forEach((key) => {
    const hadValue = Object.prototype.hasOwnProperty.call(globalThis, key);
    previous.set(key, hadValue ? globalThis[key] : Symbol.for("__undefined__"));
    if (key === "requestAnimationFrame" && typeof window[key] !== "function") {
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    } else if (key === "cancelAnimationFrame" && typeof window[key] !== "function") {
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    } else if (key === "ResizeObserver" && typeof window[key] !== "function") {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    globalThis[key] = window[key];
  });

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  }

  if (!window.ResizeObserver) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverStub;
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  t.after(() => {
    dom.window.close();
    keys.forEach((key) => {
      const previousValue = previous.get(key);
      if (previousValue === Symbol.for("__undefined__")) {
        delete globalThis[key];
      } else {
        globalThis[key] = previousValue;
      }
    });
  });

  return { window, document: window.document };
}

test("updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility", (t) => {
  const { document } = setupDom(t);

  const createCard = ({ owner = "false", urlState = "offline", streamState = "unhealthy" } = {}) => {
    const card = document.createElement("article");
    card.classList.add("card");
    card.dataset.ownerIsViewer = owner;
    card.dataset.urlHealthState = urlState;
    card.dataset.streamHealthState = streamState;
    document.body.appendChild(card);
    return card;
  };

  const viewerCard = createCard();
  updateVideoCardSourceVisibility(viewerCard);
  assert.equal(viewerCard.hidden, true, "non-owners should be hidden when all sources fail");
  assert.equal(viewerCard.dataset.sourceVisibility, "hidden", "hidden cards should record a hidden state");

  const ownerCard = createCard({ owner: "true" });
  ownerCard.hidden = true;
  ownerCard.dataset.sourceVisibility = "hidden";
  updateVideoCardSourceVisibility(ownerCard);
  assert.equal(ownerCard.hidden, false, "owners should remain visible despite failing sources");
  assert.equal(ownerCard.dataset.sourceVisibility, "visible", "owner visibility should be marked explicitly");

  viewerCard.dataset.streamHealthState = "healthy";
  updateVideoCardSourceVisibility(viewerCard);
  assert.equal(viewerCard.hidden, false, "cards should unhide once a source becomes healthy");
  assert.equal(viewerCard.dataset.sourceVisibility, "visible", "recovering cards should record visible state");
});

test("VideoCard hides cards without playable sources until a healthy CDN update arrives", (t) => {
  const { document } = setupDom(t);

  const card = new VideoCard({
    document,
    video: {
      id: "event-123",
      title: "Unplayable Clip",
    },
    formatters: {
      formatTimeAgo: () => "just now",
    },
    helpers: {
      isMagnetSupported: () => false,
    },
  });

  const root = card.getRoot();
  document.body.appendChild(root);

  assert.equal(root.hidden, true, "cards without playable sources should start hidden");
  assert.equal(root.dataset.sourceVisibility, "hidden", "initial visibility state should be hidden");

  root.dataset.urlHealthState = "healthy";
  updateVideoCardSourceVisibility(root);

  assert.equal(root.hidden, false, "a healthy CDN update should unhide the card");
  assert.equal(root.dataset.sourceVisibility, "visible", "visibility dataset should reflect the restored state");
});
