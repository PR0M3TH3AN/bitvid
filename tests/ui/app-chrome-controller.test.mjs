import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import AppChromeController from "../../js/ui/appChromeController.js";

test("AppChromeController binds upload button when elements hydrate later", () => {
  const dom = new JSDOM(`<!DOCTYPE html><body><button id="upload"></button></body>`, {
    url: "https://example.com",
  });
  const { window } = dom;

  const previousWindow = global.window;
  const previousDocument = global.document;

  global.window = window;
  global.document = window.document;

  try {
    const openCalls = [];
    const controller = new AppChromeController({
      callbacks: {
        openUploadModal: (detail) => {
          openCalls.push(detail);
        },
      },
      logger: {
        error: () => {},
        log: () => {},
      },
    });

    controller.initialize();

    const uploadButton = window.document.getElementById("upload");
    controller.setElements({ uploadButton });

    uploadButton.dispatchEvent(new window.Event("click", { bubbles: true }));

    assert.equal(openCalls.length, 1);
    assert.equal(openCalls[0]?.triggerElement, uploadButton);

    const replacement = window.document.createElement("button");
    window.document.body.appendChild(replacement);

    controller.setElements({ uploadButton: replacement });

    uploadButton.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(openCalls.length, 1);

    replacement.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(openCalls.length, 2);
    assert.equal(openCalls[1]?.triggerElement, replacement);
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
});
