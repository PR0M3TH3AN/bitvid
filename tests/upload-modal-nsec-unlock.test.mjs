// Bug: with a persisted nsec login, uploading after a page reload said "storage is
// locked" and then "No signer available to unlock storage." — the persisted nsec
// signer isn't in memory after reload (the key is passphrase-encrypted), and the
// upload modal dead-ended instead of prompting for the passphrase.
//
// promptStoredNsecUnlock() detects that exact case (a saved nsec key for the active
// account) and opens the re-unlock flow, returning true so handleUnlock stops before
// the dead-end alert. Tested via the prototype to avoid constructing the full modal.

import test from "node:test";
import { strict as assert } from "node:assert";
import { UploadModal } from "../js/ui/components/UploadModal.js";

const PUBKEY = "a".repeat(64);
const OTHER = "b".repeat(64);
const prompt = UploadModal.prototype.promptStoredNsecUnlock;

function makeCtx({ meta, withUnlock = true } = {}) {
  const calls = { unlock: 0, errors: [] };
  return {
    ctx: {
      authService: {
        nostrClient: { getStoredSessionActorMetadata: () => meta },
      },
      onRequestUnlock: withUnlock
        ? () => {
            calls.unlock += 1;
            return true;
          }
        : null,
      showError: (m) => calls.errors.push(m),
    },
    calls,
  };
}

const lockedNsec = { hasEncryptedKey: true, pubkey: PUBKEY, source: "nsec" };

test("detects a locked saved nsec key for the active account and opens the unlock flow", () => {
  const { ctx, calls } = makeCtx({ meta: lockedNsec });
  const handled = prompt.call(ctx, PUBKEY);
  assert.equal(handled, true, "returns true so handleUnlock stops before the dead-end");
  assert.equal(calls.unlock, 1, "opened the re-unlock (passphrase) flow");
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /passphrase/i);
});

test("returns false when there is no saved session (real missing-signer case)", () => {
  const { ctx } = makeCtx({ meta: null });
  assert.equal(prompt.call(ctx, PUBKEY), false);
});

test("returns false for a non-nsec stored session", () => {
  const { ctx } = makeCtx({
    meta: { hasEncryptedKey: true, pubkey: PUBKEY, source: "extension" },
  });
  assert.equal(prompt.call(ctx, PUBKEY), false);
});

test("does not hijack when the saved key is for a DIFFERENT account", () => {
  const { ctx, calls } = makeCtx({
    meta: { hasEncryptedKey: true, pubkey: OTHER, source: "nsec" },
  });
  assert.equal(prompt.call(ctx, PUBKEY), false);
  assert.equal(calls.unlock, 0);
});

test("returns false (falls through to the alert) when no unlock hook is wired", () => {
  const { ctx } = makeCtx({ meta: lockedNsec, withUnlock: false });
  assert.equal(prompt.call(ctx, PUBKEY), false);
});
