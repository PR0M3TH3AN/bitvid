// #56: when storage is locked, the upload modal's file pickers and the edit
// modal's "Replace file" pickers must unlock inline — silent kept-unlocked
// restore or ONE passphrase prompt via the shared signer gate — and continue
// with the same file pick, instead of dead-ending ("Please unlock storage…",
// a silent no-op, or "Unlock your storage in the profile modal").
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-upload-picker-inline-unlock
//       given: "storage locked for the active pubkey; a signer gate that succeeds / is cancelled / fails"
//       when: "ensureStorageUnlockedForUpload / handleThumbnailSelection run"
//       then: "gate ok -> storage unlocked and pick proceeds; cancel/bad-passphrase -> quiet abort; other failures fall through to the regular unlock messaging"
//     - id: SCN-edit-replace-file-inline-unlock
//       given: "the edit modal's resolved storage connection is locked"
//       when: "ensureUploadable runs"
//       then: "the gate + storageService.unlock run and the re-resolved unlocked connection is returned; cancel aborts without unlocking"
//   observable_outcomes:
//     - "storageService.unlock called exactly when the gate allows it"
//     - "cancelled gate -> no unlock attempt, no error toast"
//     - "thumbnail picker state reset when the unlock is refused"
//   determinism_controls:
//     - "pure fake ctx objects; no DOM, no timers, no network"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { UploadModal } from "../js/ui/components/UploadModal.js";
import { ensureUploadable } from "../js/ui/components/editModalUpload.js";

const PUBKEY = "a".repeat(64);
const ensureUnlocked = UploadModal.prototype.ensureStorageUnlockedForUpload;
const handleThumb = UploadModal.prototype.handleThumbnailSelection;

// --- UploadModal.ensureStorageUnlockedForUpload ---

function makeUploadCtx({ unlockedAfterHandleUnlock = true, gate } = {}) {
  const calls = { handleUnlock: 0, loadFromStorage: 0, errors: [], gates: [] };
  let unlocked = false;
  const ctx = {
    getCurrentPubkey: () => PUBKEY,
    storageService: { isUnlocked: () => unlocked },
    ensureSigner:
      gate === undefined
        ? null
        : async (options) => {
            calls.gates.push(options);
            return gate;
          },
    handleUnlock: async () => {
      calls.handleUnlock += 1;
      if (unlockedAfterHandleUnlock) unlocked = true;
    },
    updateLockUi: () => {},
    loadFromStorage: async () => {
      calls.loadFromStorage += 1;
      ctx.activeCredentials = { accessKeyId: "k" };
    },
    showError: (m) => calls.errors.push(m),
    isStorageUnlocked: false,
    activeCredentials: null,
  };
  return { ctx, calls, setUnlocked: (v) => (unlocked = v) };
}

test("upload picker: gate ok -> unlocks via handleUnlock and proceeds", async () => {
  const { ctx, calls } = makeUploadCtx({ gate: { ok: true } });
  const result = await ensureUnlocked.call(ctx);
  assert.equal(result, true);
  assert.equal(calls.gates.length, 1, "signer gate consulted once");
  assert.equal(calls.gates[0].need, "encrypt");
  assert.equal(calls.gates[0].pubkey, PUBKEY);
  assert.equal(calls.handleUnlock, 1, "storage unlock ran after the gate");
  assert.equal(ctx.isStorageUnlocked, true);
  assert.equal(calls.errors.length, 0);
});

test("upload picker: cancelled gate aborts quietly (no unlock, no toast)", async () => {
  const { ctx, calls } = makeUploadCtx({
    gate: { ok: false, reason: "cancelled" },
  });
  assert.equal(await ensureUnlocked.call(ctx), false);
  assert.equal(calls.handleUnlock, 0, "no unlock attempt after cancel");
  assert.equal(calls.errors.length, 0, "cancel is silent");
  assert.equal(ctx.isStorageUnlocked, false);
});

test("upload picker: bad passphrase aborts without a second toast", async () => {
  const { ctx, calls } = makeUploadCtx({
    gate: { ok: false, reason: "bad-passphrase" },
  });
  assert.equal(await ensureUnlocked.call(ctx), false);
  assert.equal(calls.handleUnlock, 0);
  assert.equal(calls.errors.length, 0, "the gate already showed its own toast");
});

test("upload picker: non-user gate failures fall through to handleUnlock's messaging", async () => {
  const { ctx, calls } = makeUploadCtx({
    gate: { ok: false, reason: "no-stored-key" },
    unlockedAfterHandleUnlock: false,
  });
  assert.equal(await ensureUnlocked.call(ctx), false);
  assert.equal(calls.handleUnlock, 1, "regular unlock path still runs");
});

test("upload picker: already-unlocked storage loads credentials without any gate", async () => {
  const { ctx, calls, setUnlocked } = makeUploadCtx({ gate: { ok: true } });
  setUnlocked(true);
  assert.equal(await ensureUnlocked.call(ctx), true);
  assert.equal(calls.gates.length, 0, "no prompt when storage is already unlocked");
  assert.equal(calls.handleUnlock, 0);
  assert.equal(calls.loadFromStorage, 1, "stale credentials refreshed");
  assert.ok(ctx.activeCredentials);
});

test("thumbnail pick while locked: refused unlock resets the picker, no upload", async () => {
  const calls = { reset: 0, uploads: 0 };
  const ctx = {
    storageConfigured: true,
    isStorageUnlocked: false,
    ensureStorageUnlockedForUpload: async () => false,
    resetThumbnailPicker: () => {
      calls.reset += 1;
    },
    mediaUploader: {
      uploadThumbnail: async () => {
        calls.uploads += 1;
        return { url: "https://x/thumb.jpg" };
      },
    },
    showError: () => {},
  };
  await handleThumb.call(ctx, { name: "t.jpg" });
  assert.equal(calls.reset, 1, "picker state restored");
  assert.equal(calls.uploads, 0, "upload never started");
});

// --- editModalUpload.ensureUploadable (Edit modal "Replace file") ---

function makeEditCtx({ gate, unlockThrows = false } = {}) {
  const calls = { unlock: [], errors: [], gates: [], resolves: 0 };
  let unlocked = false;
  const conn = () => ({
    configured: true,
    unlocked,
    credentials: unlocked ? { accessKeyId: "k" } : null,
    provider: "s3",
  });
  const modal = {
    mediaUploader: {
      resolveActiveConnection: async () => {
        calls.resolves += 1;
        return conn();
      },
    },
    storageService: {
      unlock: async (pubkey, opts) => {
        calls.unlock.push({ pubkey, signer: opts?.signer });
        if (unlockThrows) throw new Error("boom");
        unlocked = true;
      },
    },
    getCurrentPubkey: () => PUBKEY,
    ensureSigner:
      gate === undefined
        ? null
        : async (options) => {
            calls.gates.push(options);
            return gate;
          },
    showError: (m) => calls.errors.push(m),
  };
  return { modal, calls };
}

const capableSigner = { nip44Decrypt: () => "x" };

test("edit replace-file: locked connection unlocks inline and returns the live connection", async () => {
  const { modal, calls } = makeEditCtx({ gate: { ok: true } });
  const conn = await ensureUploadable(modal, { getSigner: () => capableSigner });
  assert.ok(conn, "connection returned");
  assert.equal(conn.unlocked, true);
  assert.ok(conn.credentials, "credentials present after inline unlock");
  assert.equal(calls.gates.length, 1, "signer gate consulted");
  assert.deepEqual(calls.unlock[0].pubkey, PUBKEY);
  assert.equal(calls.errors.length, 0);
  assert.equal(calls.resolves, 2, "connection re-resolved after the unlock");
});

test("edit replace-file: cancelled gate aborts without touching storage", async () => {
  const { modal, calls } = makeEditCtx({
    gate: { ok: false, reason: "cancelled" },
  });
  const conn = await ensureUploadable(modal, { getSigner: () => capableSigner });
  assert.equal(conn, null);
  assert.equal(calls.unlock.length, 0, "no unlock attempt after cancel");
  assert.equal(calls.errors.length, 0, "cancel is silent");
});

test("edit replace-file: no gate + no capable signer keeps the actionable profile-modal message", async () => {
  const { modal, calls } = makeEditCtx({});
  const conn = await ensureUploadable(modal, { getSigner: () => null });
  assert.equal(conn, null);
  assert.equal(calls.unlock.length, 0);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /profile modal/i);
});

test("edit replace-file: extension signer requests permissions before unlocking", async () => {
  const { modal, calls } = makeEditCtx({ gate: { ok: true } });
  let permissionAsks = 0;
  const conn = await ensureUploadable(modal, {
    getSigner: () => ({ type: "extension", nip04Decrypt: () => "x" }),
    requestPermissions: async () => {
      permissionAsks += 1;
      return { ok: true };
    },
  });
  assert.ok(conn);
  assert.equal(permissionAsks, 1, "permissions requested for extension signers");
  assert.equal(calls.unlock.length, 1);
});

test("edit replace-file: unlock failure surfaces the error and returns null", async () => {
  const { modal, calls } = makeEditCtx({ gate: { ok: true }, unlockThrows: true });
  const conn = await ensureUploadable(modal, { getSigner: () => capableSigner });
  assert.equal(conn, null);
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0], /Failed to unlock storage/);
});

test("edit replace-file: an already-unlocked connection passes straight through", async () => {
  const { modal, calls } = makeEditCtx({ gate: { ok: true } });
  modal.mediaUploader.resolveActiveConnection = async () => ({
    configured: true,
    unlocked: true,
    credentials: { accessKeyId: "k" },
    provider: "s3",
  });
  const conn = await ensureUploadable(modal, { getSigner: () => capableSigner });
  assert.ok(conn);
  assert.equal(calls.gates.length, 0, "no prompt when already unlocked");
  assert.equal(calls.unlock.length, 0);
});
