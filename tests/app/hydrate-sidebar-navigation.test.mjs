import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { Application } from "../../js/app.js";

const VIEW_HTML = `<!DOCTYPE html>
<html>
  <body>
    <div id="chrome">
      <button id="loginButton" class="btn"></button>
      <button id="logoutButton" class="hidden"></button>
      <button id="uploadButton" class="hidden" hidden></button>
      <button id="profileButton" class="hidden" hidden></button>
      <span id="userStatus" class="hidden"></span>
      <span id="userPubKey"></span>
      <button id="closeLoginModal"></button>
    </div>
    <a id="subscriptionsLink" class="hidden"></a>
  </body>
</html>`;

test("hydrateSidebarNavigation reveals chrome controls for authenticated viewers", () => {
  const dom = new JSDOM(VIEW_HTML, { url: "https://example.com" });
  const { window } = dom;

  const previousWindow = global.window;
  const previousDocument = global.document;

  global.window = window;
  global.document = window.document;
  const previousHTMLElement = global.HTMLElement;
  global.HTMLElement = window.HTMLElement;

  try {
    const app = Object.create(Application.prototype);

    app.appChromeController = {
      receivedElements: null,
      setElements(elements) {
        this.receivedElements = elements;
      },
    };

    app.userStatus = window.document.getElementById("userStatus");
    app.userPubKey = window.document.getElementById("userPubKey");
    app.subscriptionsLink = null;
    app.isUserLoggedIn = () => true;
    app.log = () => {};
    app.showError = () => {};
    app.showSuccess = () => {};
    app.showStatus = () => {};

    app.hydrateSidebarNavigation();

    const uploadButton = window.document.getElementById("uploadButton");
    const profileButton = window.document.getElementById("profileButton");
    const loginButton = window.document.getElementById("loginButton");
    const logoutButton = window.document.getElementById("logoutButton");
    const subscriptionsLink = window.document.getElementById("subscriptionsLink");
    const closeLoginButton = window.document.getElementById("closeLoginModal");

    assert.equal(app.uploadButton, uploadButton);
    assert.equal(app.profileButton, profileButton);
    assert.equal(app.loginButton, loginButton);
    assert.equal(app.logoutButton, logoutButton);
    assert.equal(app.closeLoginModalBtn, closeLoginButton);

    assert.equal(uploadButton.classList.contains("hidden"), false);
    assert.equal(uploadButton.hasAttribute("hidden"), false);
    assert.equal(profileButton.classList.contains("hidden"), false);
    assert.equal(profileButton.hasAttribute("hidden"), false);
    assert.equal(loginButton.classList.contains("hidden"), true);
    assert.equal(loginButton.hasAttribute("hidden"), true);
    assert.equal(logoutButton.classList.contains("hidden"), false);
    assert.equal(subscriptionsLink.classList.contains("hidden"), false);

    assert.ok(app.appChromeController.receivedElements);
    assert.equal(
      app.appChromeController.receivedElements.uploadButton,
      uploadButton,
    );
    assert.equal(
      app.appChromeController.receivedElements.profileButton,
      profileButton,
    );
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
    if (previousHTMLElement === undefined) {
      delete global.HTMLElement;
    } else {
      global.HTMLElement = previousHTMLElement;
    }
  }
});
