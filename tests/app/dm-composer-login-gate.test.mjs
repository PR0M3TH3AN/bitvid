// Regression: the "Message" button opened the profile modal's messages tab even
// when nobody was logged in — but DMs need a signing identity, so the tab was
// unusable. openDirectMessageComposer must prompt for login instead.
//
// Scenario (SCN-dm-composer-login-gate):
//   Given no user is logged in,
//   When openDirectMessageComposer is called for a valid recipient,
//   Then it surfaces a login prompt (login modal), does NOT open the messages
//     pane, and returns false.
//   And when a user IS logged in, it proceeds to open the composer.

import test from "node:test";
import assert from "node:assert/strict";

import { Application } from "../../js/app.js";

const RECIPIENT = "d".repeat(64);

function createTestApp({ loggedIn }) {
  const calls = {
    showError: [],
    openModal: 0,
    requestLogin: 0,
    setRecipient: 0,
    showMessagesPane: 0,
  };
  const app = {
    calls,
    normalizeHexPubkey: (value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    showError: (msg) => calls.showError.push(msg),
    isUserLoggedIn: () => loggedIn,
    loginModalController: {
      openModal: () => {
        calls.openModal += 1;
        return true;
      },
    },
    authService: {
      requestLogin: () => {
        calls.requestLogin += 1;
        return Promise.resolve(true);
      },
    },
    setDmRecipientPubkey: () => {
      calls.setRecipient += 1;
    },
    profileController: {
      setDirectMessageRecipient: () => {},
      show: () => {
        calls.showMessagesPane += 1;
      },
      focusMessageComposer: () => {},
    },
    openDirectMessageComposer: Application.prototype.openDirectMessageComposer,
  };
  return app;
}

test("prompts for login and does not open messages when logged out", () => {
  const app = createTestApp({ loggedIn: false });

  const result = app.openDirectMessageComposer({ recipientPubkey: RECIPIENT });

  assert.equal(result, false, "returns false when not logged in");
  assert.equal(app.calls.openModal, 1, "opens the login modal");
  assert.equal(
    app.calls.showMessagesPane,
    0,
    "must NOT open the messages pane when logged out",
  );
  assert.equal(app.calls.setRecipient, 0, "must not set a DM recipient");
  assert.ok(
    app.calls.showError.some((m) => /log in/i.test(m)),
    "surfaces a login message",
  );
});

test("opens the composer when logged in", () => {
  const app = createTestApp({ loggedIn: true });

  const result = app.openDirectMessageComposer({ recipientPubkey: RECIPIENT });

  assert.equal(result, true, "returns true when logged in");
  assert.equal(app.calls.openModal, 0, "does not prompt for login");
  assert.equal(app.calls.setRecipient, 1, "sets the DM recipient");
  assert.equal(app.calls.showMessagesPane, 1, "opens the messages pane");
});
