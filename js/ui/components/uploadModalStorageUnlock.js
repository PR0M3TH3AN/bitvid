// js/ui/components/uploadModalStorageUnlock.js
//
// Storage glue for the Upload modal (#36 / #56 unlock + #44 connection
// picker), kept out of UploadModal.js to stay within its file-size budget.
// Every function operates on the UploadModal instance (`modal`); UploadModal
// exposes them as thin prototype delegates so callers and tests keep using
// the instance methods.

import { devLogger, userLogger } from "../../utils/logger.js";

// #56: the file pickers unlock storage inline instead of dead-ending. The
// shared signer gate (app.ensureEncryptionCapableSigner) restores a cached
// keep-unlocked key silently or shows ONE passphrase prompt; handleUnlock
// then unlocks storage with the restored signer (extension permissions +
// credential reload included). Returns true when the upload can proceed.
// Cancel / bad-passphrase abort quietly (the gate surfaces its own toast for
// a wrong passphrase); other gate failures fall through to handleUnlock so
// its existing messaging (saved-key flow / "no signer") still applies.
export async function ensureStorageUnlockedForUpload(modal) {
  if (!modal.storageService) return false;
  const pubkey = modal.getCurrentPubkey ? modal.getCurrentPubkey() : null;
  if (!pubkey) return false;

  if (!modal.storageService.isUnlocked(pubkey)) {
    if (typeof modal.ensureSigner === "function") {
      let gate = null;
      try {
        gate = await modal.ensureSigner({
          pubkey,
          need: "encrypt",
          promptMessage:
            "Re-enter your PIN / passphrase to unlock storage for this upload.",
        });
      } catch (error) {
        devLogger?.warn?.("[UploadModal] Signer gate failed:", error);
      }
      if (
        gate &&
        gate.ok !== true &&
        (gate.reason === "cancelled" || gate.reason === "bad-passphrase")
      ) {
        return false;
      }
    }
    await modal.handleUnlock();
  }

  const unlocked = modal.storageService.isUnlocked(pubkey);
  if (unlocked && (!modal.isStorageUnlocked || !modal.activeCredentials)) {
    modal.isStorageUnlocked = true;
    modal.updateLockUi();
    await modal.loadFromStorage();
  }
  modal.isStorageUnlocked = unlocked;
  return unlocked;
}

// Undo the picker-side effects of a thumbnail selection that couldn't upload
// (placeholder shows the picked filename and the URL input is disabled).
export function resetThumbnailPicker(modal) {
  if (modal.inputs?.thumbnailFile) {
    modal.inputs.thumbnailFile.value = "";
  }
  const thumbnail = modal.inputs?.thumbnail;
  if (thumbnail) {
    thumbnail.placeholder = "https://example.com/thumbnail.jpg";
    thumbnail.disabled = false;
  }
}

// #44: resolve which configured connection this upload targets. A per-modal
// selection wins; a stale selection (connection deleted meanwhile) is reset;
// otherwise the account default, then the first configured connection.
export function pickTargetConnection(modal, connections) {
  const list = Array.isArray(connections) ? connections : [];
  const defaultConn = list.find((conn) => conn?.meta?.defaultForUploads) || null;
  if (modal.selectedConnectionId) {
    const selected = list.find((conn) => conn?.id === modal.selectedConnectionId);
    if (selected) {
      return { targetConn: selected, defaultConn };
    }
    modal.selectedConnectionId = null;
  }
  return { targetConn: defaultConn || list[0] || null, defaultConn };
}

// #44: render the "Upload destination" <select>. Hidden with fewer than two
// connections (nothing to choose); the default connection is labelled.
export function renderConnectionPicker(modal, connections, targetConn, defaultConn) {
  const select = modal.inputs?.storageConnection;
  const wrap = modal.sourceSections?.connectionPicker;
  if (!select || !(wrap instanceof HTMLElement)) {
    return;
  }
  const list = Array.isArray(connections) ? connections : [];
  if (list.length < 2) {
    wrap.classList.add("hidden");
    return;
  }
  select.textContent = "";
  for (const conn of list) {
    if (!conn?.id) {
      continue;
    }
    const option = select.ownerDocument.createElement("option");
    option.value = conn.id;
    const label = `${modal.getProviderLabel(conn.provider || conn.meta?.provider)} — ${
      conn.meta?.bucket || "unnamed bucket"
    }`;
    option.textContent = conn.id === defaultConn?.id ? `${label} (default)` : label;
    option.selected = conn.id === targetConn?.id;
    select.appendChild(option);
  }
  wrap.classList.remove("hidden");
}

// Returns true if a locked persisted-nsec session was detected (for the active
// account) and the re-unlock (passphrase) flow was opened, so the caller can
// stop instead of dead-ending with "No signer available".
export function promptStoredNsecUnlock(modal, pubkey) {
  const client = modal.authService?.nostrClient;
  if (!client || typeof client.getStoredSessionActorMetadata !== "function") {
    return false;
  }
  let meta = null;
  try {
    meta = client.getStoredSessionActorMetadata();
  } catch (err) {
    return false;
  }
  if (!meta || meta.hasEncryptedKey !== true || meta.source !== "nsec") {
    return false;
  }
  const metaPubkey =
    typeof meta.pubkey === "string" ? meta.pubkey.trim().toLowerCase() : "";
  const activePubkey =
    typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
  if (activePubkey && metaPubkey && metaPubkey !== activePubkey) {
    return false;
  }
  if (typeof modal.onRequestUnlock !== "function") {
    return false;
  }
  modal.showError(
    "Your saved key is locked after reloading. Re-enter your passphrase to unlock it, then try the upload again.",
  );
  try {
    modal.onRequestUnlock();
  } catch (err) {
    userLogger.warn("[UploadModal] Failed to open saved-key unlock flow:", err);
  }
  return true;
}
