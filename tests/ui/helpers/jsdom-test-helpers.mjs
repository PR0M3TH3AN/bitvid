import { JSDOM } from "jsdom";

export function createUiDom({
  html = "<!DOCTYPE html><html><body></body></html>",
  url = "https://bitvid.invalid/",
  pretendToBeVisual = true,
} = {}) {
  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual,
  });

  const { window } = dom;

  // Expose globals that JSDOM might not put on globalThis by default in all envs,
  // or that we need for instanceof checks.
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLStyleElement = window.HTMLStyleElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.Event = window.Event;
  globalThis.CustomEvent = window.CustomEvent;

  return {
    window,
    document: window.document,
    cleanup: () => window.close(),
  };
}
