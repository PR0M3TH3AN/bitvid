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
<<<<<<< HEAD

  // Expose necessary globals for instance checks
  // JSDOM runs in its own context, so instanceof checks against global constructors
  // will fail unless we expose the JSDOM's constructors to the global scope.
  global.HTMLStyleElement = window.HTMLStyleElement;
  global.HTMLElement = window.HTMLElement;
  global.Element = window.Element;
  global.CustomEvent = window.CustomEvent;

  // Mock Request/Response for fetch if not available
  if (!global.Request) {
    global.Request = window.Request;
  }
  if (!global.Response) {
    global.Response = window.Response;
  }
  if (!global.Headers) {
    global.Headers = window.Headers;
  }

  return {
    window,
    document: window.document,
    cleanup: () => {
        // Clean up globals to avoid pollution between tests
        delete global.HTMLStyleElement;
        delete global.HTMLElement;
        delete global.Element;
        delete global.CustomEvent;
        window.close();
    },
=======
  return {
    window,
    document: window.document,
    cleanup: () => window.close(),
>>>>>>> origin/main
  };
}
