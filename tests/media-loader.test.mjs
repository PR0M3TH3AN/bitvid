import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { MediaLoader } from "../js/utils/mediaLoader.js";

function setupDom() {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://example.com",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLImageElement = window.HTMLImageElement;
  globalThis.HTMLVideoElement = window.HTMLVideoElement;
  globalThis.Element = window.Element;

  const cleanup = () => {
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.HTMLElement;
    delete globalThis.HTMLImageElement;
    delete globalThis.HTMLVideoElement;
    delete globalThis.Element;
  };

  return { window, document: window.document, cleanup };
}

function setupFakeIntersectionObserver() {
  const instances = [];
  const OriginalIntersectionObserver = globalThis.IntersectionObserver;

  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = new Set();
      instances.push(this);
    }

    observe(element) {
      this.observed.add(element);
    }

    unobserve(element) {
      this.observed.delete(element);
    }

    disconnect() {
      this.observed.clear();
    }

    trigger(entries) {
      this.callback(entries);
    }
  }

  globalThis.IntersectionObserver = FakeIntersectionObserver;

  const restore = () => {
    if (OriginalIntersectionObserver) {
      globalThis.IntersectionObserver = OriginalIntersectionObserver;
    } else {
      delete globalThis.IntersectionObserver;
    }
  };

  return { instances, restore };
}

test("MediaLoader assigns image sources once intersecting", async (t) => {
  const { document, cleanup } = setupDom();
  const { instances, restore } = setupFakeIntersectionObserver();
  t.after(() => {
    cleanup();
    restore();
  });

  const loader = new MediaLoader();
  assert.equal(instances.length, 1, "should create an IntersectionObserver instance");

  const observer = instances[0];
  const img = document.createElement("img");
  img.dataset.lazy = "https://cdn.example.com/thumb.jpg";
  img.dataset.fallbackSrc = "https://cdn.example.com/fallback.jpg";

  loader.observe(img);
  assert.ok(observer.observed.has(img), "image should be observed before intersection");

  observer.trigger([
    {
      target: img,
      isIntersecting: false,
    },
  ]);

  assert.equal(
    img.getAttribute("src"),
    null,
    "non-intersecting entries should not apply the lazy source",
  );

  observer.trigger([
    {
      target: img,
      isIntersecting: true,
    },
  ]);

  assert.equal(
    img.getAttribute("src"),
    "https://cdn.example.com/thumb.jpg",
    "lazy source should be applied when intersecting",
  );
  assert.equal(
    typeof img.onerror,
    "function",
    "fallback handler should be attached when fallbackSrc is provided",
  );
  assert.ok(!observer.observed.has(img), "image should be unobserved after loading");
  assert.ok(!("lazy" in img.dataset), "data-lazy attribute should be removed after loading");
});

test("MediaLoader loads video sources and poster fallbacks", async (t) => {
  const { document, cleanup } = setupDom();
  const { instances, restore } = setupFakeIntersectionObserver();
  t.after(() => {
    cleanup();
    restore();
  });

  const loader = new MediaLoader();
  assert.equal(instances.length, 1);
  const observer = instances[0];

  const video = document.createElement("video");
  video.dataset.lazy = "https://cdn.example.com/clip.mp4";
  video.dataset.fallbackSrc = "https://cdn.example.com/poster.jpg";

  loader.observe(video);
  observer.trigger([
    {
      target: video,
      isIntersecting: true,
    },
  ]);

  assert.equal(
    video.getAttribute("src"),
    "https://cdn.example.com/clip.mp4",
    "video lazy source should be applied",
  );
  assert.equal(
    video.poster,
    "https://cdn.example.com/poster.jpg",
    "video poster should use fallback source",
  );
  assert.ok(!observer.observed.has(video));
  assert.ok(!("lazy" in video.dataset));
});

test("MediaLoader clears unsupported lazy targets without inline styles", async (t) => {
  const { document, cleanup } = setupDom();
  const { instances, restore } = setupFakeIntersectionObserver();
  t.after(() => {
    cleanup();
    restore();
  });

  const loader = new MediaLoader();
  assert.equal(instances.length, 1);
  const observer = instances[0];

  const div = document.createElement("div");
  div.dataset.lazy = "https://cdn.example.com/background.jpg";

  loader.observe(div);
  observer.trigger([
    {
      target: div,
      isIntersecting: true,
    },
  ]);

  assert.equal(
    div.hasAttribute("style"),
    false,
    "background image styles should not be injected at runtime",
  );
  assert.ok(!observer.observed.has(div));
  assert.ok(!("lazy" in div.dataset));
});
