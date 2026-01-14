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

  // Expose globals needed for instance checks in source code
  // This is required because 'instanceof HTMLStyleElement' fails if global.HTMLStyleElement
  // doesn't match the one from JSDOM's window.
  global.HTMLStyleElement = window.HTMLStyleElement;
  global.HTMLElement = window.HTMLElement;
  global.Element = window.Element;

  return {
    window,
    document: window.document,
    cleanup: () => {
      delete global.HTMLStyleElement;
      delete global.HTMLElement;
      delete global.Element;
      window.close();
    },
  };
}
