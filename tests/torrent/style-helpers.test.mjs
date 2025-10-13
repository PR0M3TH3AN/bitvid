import { strict as assert } from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";
import { JSDOM } from "jsdom";

import {
  applyBeaconDynamicStyles,
  removeBeaconDynamicStyles,
  beaconDynamicFallbackClasses,
} from "../../torrent/ui/styleHelpers.js";

const ORIGINAL_WINDOW = globalThis.window;
const ORIGINAL_DOCUMENT = globalThis.document;
const ORIGINAL_ELEMENT = globalThis.HTMLElement;
const ORIGINAL_STYLE_ELEMENT = globalThis.HTMLStyleElement;

let dom;

function bootstrapDom() {
  dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    pretendToBeVisual: true,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLStyleElement = dom.window.HTMLStyleElement;
}

function teardownDom() {
  if (dom) {
    dom.window.close();
    dom = null;
  }
  if (typeof ORIGINAL_WINDOW === "undefined") {
    delete globalThis.window;
  } else {
    globalThis.window = ORIGINAL_WINDOW;
  }
  if (typeof ORIGINAL_DOCUMENT === "undefined") {
    delete globalThis.document;
  } else {
    globalThis.document = ORIGINAL_DOCUMENT;
  }
  if (typeof ORIGINAL_ELEMENT === "undefined") {
    delete globalThis.HTMLElement;
  } else {
    globalThis.HTMLElement = ORIGINAL_ELEMENT;
  }
  if (typeof ORIGINAL_STYLE_ELEMENT === "undefined") {
    delete globalThis.HTMLStyleElement;
  } else {
    globalThis.HTMLStyleElement = ORIGINAL_STYLE_ELEMENT;
  }
}

describe("torrent/ui/styleHelpers", () => {
  beforeEach(() => {
    bootstrapDom();
  });

  afterEach(() => {
    teardownDom();
  });

  it("registers fallback classes for known slots", () => {
    assert.equal(
      beaconDynamicFallbackClasses.hiddenDownload,
      "torrent-download-anchor",
    );
    assert.equal(
      beaconDynamicFallbackClasses.clipboard,
      "torrent-clipboard-textarea",
    );
  });

  it("applies dynamic styles and fallback classes", () => {
    const element = document.createElement("a");
    document.body.appendChild(element);

    const className = applyBeaconDynamicStyles(
      element,
      { display: "none" },
      "hiddenDownload",
    );

    assert.ok(className, "should receive a generated class name");
    assert.ok(
      element.classList.contains("torrent-download-anchor"),
      "fallback class should be present",
    );
    assert.ok(
      element.classList.contains(className),
      "dynamic class should be applied",
    );

    const styleTag = document.getElementById("bitvid-style-system");
    assert.ok(styleTag, "style system tag should be created");
  });

  it("removes dynamic styles and fallback classes", () => {
    const element = document.createElement("textarea");
    document.body.appendChild(element);

    applyBeaconDynamicStyles(element, { opacity: "0" }, "clipboard");
    assert.ok(element.classList.contains("torrent-clipboard-textarea"));

    removeBeaconDynamicStyles(element, "clipboard");

    assert.ok(
      !element.classList.contains("torrent-clipboard-textarea"),
      "fallback class should be removed",
    );
  });

  it("gracefully handles missing elements", () => {
    const result = applyBeaconDynamicStyles(null, { display: "none" });
    assert.equal(result, null);
    assert.doesNotThrow(() => removeBeaconDynamicStyles(null));
  });
});
