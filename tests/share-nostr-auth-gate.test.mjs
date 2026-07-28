// SCN-share-nostr-gate
//
// The share menu's "Share on Nostr" item is gated on `isLoggedIn && hasSigner`
// (js/ui/components/videoMenuRenderers.js). VideoModal initialized
// `shareNostrAuthState` to {false, false} and NOTHING ever wrote to it, so the
// item rendered permanently disabled — it looked like inert text, and the click
// delegation in bindShareMenuActions() bails on `button.disabled`.
//
// Two halves have to hold for the button to work:
//   1. VideoModal.setShareNostrAuthState() records the state.
//   2. syncAuthUiState() pushes real auth state in, and re-runs on auth change
//      (it previously ran only once at bootstrap).

import test from "node:test";
import assert from "node:assert/strict";
import { createUiCoordinator } from "../js/app/uiCoordinator.js";
import { VideoModal } from "../js/ui/components/VideoModal.js";
import {
  clearActiveSigner,
  registerSigner,
  setActiveSigner,
} from "../js/nostrClientRegistry.js";

const PUBKEY = "b".repeat(64);

// --- VideoModal setter ----------------------------------------------------

function makeModal() {
  const modal = Object.create(VideoModal.prototype);
  modal.shareNostrAuthState = { isLoggedIn: false, hasSigner: false };
  modal.closedPopover = 0;
  modal.modalSharePopover = {
    close: () => {
      modal.closedPopover += 1;
    },
  };
  return modal;
}

test("setShareNostrAuthState records the gate", () => {
  const modal = makeModal();
  assert.equal(modal.setShareNostrAuthState({ isLoggedIn: true, hasSigner: true }), true);
  assert.deepEqual(modal.shareNostrAuthState, { isLoggedIn: true, hasSigner: true });
});

test("setShareNostrAuthState is idempotent and only closes a stale menu once", () => {
  const modal = makeModal();
  modal.setShareNostrAuthState({ isLoggedIn: true, hasSigner: true });
  assert.equal(modal.closedPopover, 1, "open menu must re-render against new state");

  // No change -> no churn. Closing the popover on every no-op sync would slam
  // the menu shut under the user.
  assert.equal(modal.setShareNostrAuthState({ isLoggedIn: true, hasSigner: true }), false);
  assert.equal(modal.closedPopover, 1);
});

test("setShareNostrAuthState coerces and defaults safely", () => {
  const modal = makeModal();
  modal.setShareNostrAuthState({ isLoggedIn: "yes", hasSigner: 1 });
  assert.deepEqual(modal.shareNostrAuthState, { isLoggedIn: true, hasSigner: true });

  modal.setShareNostrAuthState();
  assert.deepEqual(modal.shareNostrAuthState, { isLoggedIn: false, hasSigner: false });
});

test("setShareNostrAuthState tolerates no popover", () => {
  const modal = makeModal();
  modal.modalSharePopover = null;
  assert.doesNotThrow(() =>
    modal.setShareNostrAuthState({ isLoggedIn: true, hasSigner: true })
  );
});

// --- syncAuthUiState wiring ----------------------------------------------

function makeApp({ loggedIn }) {
  const coordinator = createUiCoordinator({
    devLogger: { warn() {}, error() {}, log() {} },
  });
  const pushed = [];
  const app = {
    ...coordinator,
    isUserLoggedIn: () => loggedIn,
    // Stub the DOM-touching branches; this test is about the share gate.
    applyAuthenticatedUiState() {},
    applyLoggedOutUiState() {},
    videoModal: {
      setShareNostrAuthState(state) {
        pushed.push({ ...state });
      },
    },
  };
  return { app, pushed };
}

test("syncAuthUiState pushes the gate into the video modal", () => {
  const { app, pushed } = makeApp({ loggedIn: true });
  app.syncAuthUiState();
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].isLoggedIn, true);
});

test("logged out propagates as a closed gate", () => {
  const { app, pushed } = makeApp({ loggedIn: false });
  app.syncAuthUiState();
  assert.deepEqual(pushed[0], { isLoggedIn: false, hasSigner: false });
});

test("hasSigner reflects a registered, signing-capable signer", () => {
  clearActiveSigner();
  const { app, pushed } = makeApp({ loggedIn: true });

  app.syncAuthUiState();
  assert.equal(pushed[0].hasSigner, false, "no signer registered yet");

  registerSigner(PUBKEY, { pubkey: PUBKEY, signEvent: async (e) => e });
  setActiveSigner(PUBKEY);
  app.syncAuthUiState();
  assert.equal(pushed[1].hasSigner, true);

  clearActiveSigner();
  app.syncAuthUiState();
  assert.equal(pushed[2].hasSigner, false, "logout must close the gate again");
});

test("a signer that cannot sign does not open the gate", () => {
  // Mirrors ShareNostrController.handleShare(): enabling the item for a signer
  // without signEvent would only produce an error toast on click.
  clearActiveSigner();
  registerSigner(PUBKEY, { pubkey: PUBKEY });
  setActiveSigner(PUBKEY);

  const { app, pushed } = makeApp({ loggedIn: true });
  app.syncAuthUiState();
  assert.equal(pushed[0].hasSigner, false);
  clearActiveSigner();
});

test("syncAuthUiState re-runs on bitvid:auth-changed, and binds only once", () => {
  // The original bug's second half: the gate was computed once at bootstrap and
  // never again, so logging in mid-session left the button disabled.
  const listeners = [];
  const originalWindow = globalThis.window;
  globalThis.window = {
    addEventListener(type, handler) {
      listeners.push({ type, handler });
    },
  };

  try {
    const { app, pushed } = makeApp({ loggedIn: false });
    app.syncAuthUiState();
    assert.equal(pushed.length, 1);

    const bound = listeners.filter((l) => l.type === "bitvid:auth-changed");
    assert.equal(bound.length, 1, "listener installed on first sync");

    bound[0].handler();
    assert.equal(pushed.length, 2, "auth change re-syncs the gate");

    // Re-entrancy: the resync must not stack a new listener every time.
    assert.equal(
      listeners.filter((l) => l.type === "bitvid:auth-changed").length,
      1
    );
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});
