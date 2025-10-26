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
  return {
    window,
    document: window.document,
    cleanup: () => window.close(),
  };
}
