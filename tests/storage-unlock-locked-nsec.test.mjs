// #36: storage unlock fails for an nsec user AFTER A PAGE RELOAD.
//
// A persisted ("remember this key") nsec session restores the logged-in pubkey + UI
// on reload, but NOT the in-memory signer — the private key is held only passphrase-
// encrypted. Storage unlock then has no signer (or a decrypt-less stub), and the old
// code dead-ended with the misleading "No active signer found. Please login." even
// though the user still looks logged in.
//
// The fix detects this exact case (a saved nsec key for the account being unlocked)
// and surfaces an actionable error pointing the user at re-unlocking their saved key,
// instead of the generic signer/decryptor errors. These tests exercise the detection
// + reporting directly (no DOM, no module-level signer dependency).

import test from "node:test";
import { strict as assert } from "node:assert";
import { ProfileStorageController } from "../js/ui/profileModal/ProfileStorageController.js";

const PUBKEY = "a".repeat(64);
const OTHER_PUBKEY = "b".repeat(64);

function makeController({ meta } = {}) {
  const shownErrors = [];
  const loginOpens = [];
  const mainController = {
    normalizeHexPubkey: (value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "",
    getActivePubkey: () => PUBKEY,
    showError: (msg) => shownErrors.push(msg),
    services: {
      nostrClient: {
        getStoredSessionActorMetadata: () => meta,
      },
      openLoginModal: (options) => {
        loginOpens.push(options ?? null);
        return true;
      },
    },
  };
  const controller = new ProfileStorageController(mainController);
  return { controller, shownErrors, loginOpens };
}

const persistedNsecMeta = {
  hasEncryptedKey: true,
  pubkey: PUBKEY,
  source: "nsec",
  createdAt: 1234,
};

test("detects a locked persisted nsec session for the active account", () => {
  const { controller } = makeController({ meta: persistedNsecMeta });
  const detected = controller.getLockedStoredNsecSession(PUBKEY);
  assert.ok(detected, "should detect the locked saved key");
  assert.equal(detected.source, "nsec");
});

test("does NOT treat a missing saved key as a locked session", () => {
  const { controller } = makeController({ meta: null });
  assert.equal(controller.getLockedStoredNsecSession(PUBKEY), null);
});

test("does NOT treat a non-nsec session as a locked nsec session", () => {
  const { controller } = makeController({
    meta: { hasEncryptedKey: true, pubkey: PUBKEY, source: "extension" },
  });
  assert.equal(controller.getLockedStoredNsecSession(PUBKEY), null);
});

test("does NOT claim 'this account is locked' when the saved key is a DIFFERENT account", () => {
  const { controller } = makeController({
    meta: { hasEncryptedKey: true, pubkey: OTHER_PUBKEY, source: "nsec" },
  });
  assert.equal(controller.getLockedStoredNsecSession(PUBKEY), null);
});

test("reporting the locked session shows the actionable re-unlock message, not a generic signer error", () => {
  const { controller, shownErrors } = makeController({ meta: persistedNsecMeta });
  controller.reportLockedNsecSession();

  assert.equal(controller.storageUnlockFailure?.code, "storage-unlock-locked-nsec-session");
  assert.equal(shownErrors.length, 1);
  const msg = shownErrors[0];
  // Must direct the user to re-unlock the SAVED KEY (passphrase), not "please login".
  assert.match(msg, /saved key/i);
  assert.match(msg, /passphrase/i);
  assert.doesNotMatch(msg, /no active signer/i);
});

test("autoOpenLogin opens the login modal's unlock flow (one-click re-unlock)", () => {
  const { controller, loginOpens } = makeController({ meta: persistedNsecMeta });
  controller.reportLockedNsecSession({ autoOpenLogin: true });
  assert.equal(loginOpens.length, 1, "should open the login modal exactly once");
});

test("the passive path does NOT auto-open the login modal (no surprise popups)", () => {
  const { controller, loginOpens } = makeController({ meta: persistedNsecMeta });
  controller.reportLockedNsecSession();
  assert.equal(loginOpens.length, 0, "default (passive) report must not open a modal");
});

test("the new error code maps to a saved-key/passphrase message", () => {
  const { controller } = makeController({ meta: persistedNsecMeta });
  const msg = controller.getStorageUnlockFailureMessage({
    code: "storage-unlock-locked-nsec-session",
  });
  assert.match(msg, /saved key/i);
  assert.match(msg, /passphrase/i);
});
