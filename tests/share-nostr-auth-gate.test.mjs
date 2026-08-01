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
import { VideoModal } from "../js/ui/components/VideoModal.js";

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

// --- app wiring ----------------------------------------------------------
// bitvid ALREADY routed auth changes to the modal: Application
// .updateShareNostrAuthState() is called on init, login, logout, pubkey-change
// and signer-change, and it forwards to videoModal.setShareNostrAuthState().
// That method simply did not exist, so the call short-circuited on its own
// `if (!this.videoModal?.setShareNostrAuthState) return;` guard and the gate
// stayed shut forever. These pin the contract that guard depends on.

test("the app's updateShareNostrAuthState contract is satisfied", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../js/app.js", import.meta.url), "utf8");

  // The guard short-circuits when the method is absent, which is exactly how
  // this stayed broken silently. If the method is ever renamed, fail loudly.
  assert.match(source, /videoModal\?\.setShareNostrAuthState/);
  assert.match(source, /videoModal\.setShareNostrAuthState\(\{/);

  // The lifecycle points that must keep the gate in sync.
  for (const reason of ["init", "signer-change", "pubkey-change"]) {
    assert.ok(
      source.includes(`reason: "${reason}"`),
      `app.js should refresh the share gate on ${reason}`
    );
  }

  assert.equal(
    typeof VideoModal.prototype.setShareNostrAuthState,
    "function",
    "VideoModal must expose the method app.js calls"
  );
});

test("login and logout both refresh the gate", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../js/app/authSessionCoordinator.js", import.meta.url),
    "utf8"
  );
  assert.ok(source.includes('reason: "auth-login"'));
  assert.ok(source.includes('reason: "auth-logout"'));
});
