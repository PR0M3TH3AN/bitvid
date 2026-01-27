import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "https://example.com",
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
try {
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    writable: true,
    configurable: true,
  });
} catch (e) {
  // If we can't overwrite it, we can't.
}

globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;

// Pre-stub scrollTo
try {
    dom.window.scrollTo = () => {};
} catch (e) {}

// Stub pause/load early as well, just in case
if (dom.window.HTMLMediaElement && dom.window.HTMLMediaElement.prototype) {
  dom.window.HTMLMediaElement.prototype.pause = () => {};
  dom.window.HTMLMediaElement.prototype.load = () => {};
}
