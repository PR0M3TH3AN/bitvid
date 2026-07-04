// js/ui/components/editModalUpload.js
//
// "Replace file" upload glue for the Edit modal: wires the optional thumbnail
// and video file-pickers to the shared MediaUploader and writes the resulting
// URLs/magnet back into the (unlocked) edit fields. Kept out of EditModal.js to
// stay within its file-size budget. Operates on the EditModal instance (`modal`)
// and its rendered root (`context`).

import { devLogger, userLogger } from "../../utils/logger.js";
import {
  getActiveSigner,
  requestDefaultExtensionPermissions,
} from "../../nostrClientFacade.js";

// Set a field's value AND mark it edited/unlocked so EditModal.collect treats it
// as a user change (isEditing() reads readOnly===false || dataset.isEditing).
function setFieldUnlocked(input, value) {
  if (!input) return;
  input.value = value;
  input.readOnly = false;
  input.removeAttribute("readonly");
  input.dataset.isEditing = "true";
}

function setStatus(el, text) {
  if (el) el.textContent = typeof text === "string" ? text : "";
}

// Resolve the active storage connection and surface a user-facing reason when
// upload isn't possible. Returns the connection on success, null otherwise.
// `deps` are injectable for tests only.
export async function ensureUploadable(modal, deps = {}) {
  if (!modal.mediaUploader) {
    modal.showError("Uploads are unavailable in this view.");
    return null;
  }
  let conn = null;
  try {
    conn = await modal.mediaUploader.resolveActiveConnection();
  } catch (error) {
    devLogger.warn("[editModalUpload] Failed to resolve storage connection:", error);
  }
  if (!conn || !conn.configured) {
    modal.showError("Configure a storage provider in your profile before uploading.");
    return null;
  }
  if (!conn.unlocked || !conn.credentials) {
    // #56: unlock inline (kept-unlocked restore or one passphrase prompt) and
    // continue with this same file pick instead of bouncing the user to the
    // profile modal.
    return tryInlineStorageUnlock(modal, deps);
  }
  return conn;
}

const UNLOCK_FALLBACK_MESSAGE =
  "Unlock your storage in the profile modal, then try again.";

async function tryInlineStorageUnlock(modal, deps = {}) {
  const getSigner =
    typeof deps.getSigner === "function" ? deps.getSigner : getActiveSigner;
  const requestPermissions =
    typeof deps.requestPermissions === "function"
      ? deps.requestPermissions
      : requestDefaultExtensionPermissions;

  const pubkey =
    typeof modal.getCurrentPubkey === "function" ? modal.getCurrentPubkey() : null;
  if (!pubkey || !modal.storageService) {
    modal.showError(UNLOCK_FALLBACK_MESSAGE);
    return null;
  }

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
      devLogger.warn("[editModalUpload] Signer gate failed:", error);
    }
    if (gate && gate.ok !== true) {
      // Cancel aborts quietly; a bad passphrase already showed its own toast.
      if (gate.reason !== "cancelled" && gate.reason !== "bad-passphrase") {
        modal.showError(UNLOCK_FALLBACK_MESSAGE);
      }
      return null;
    }
  }

  const signer = getSigner();
  if (
    !signer ||
    (typeof signer.nip44Decrypt !== "function" &&
      typeof signer.nip04Decrypt !== "function")
  ) {
    modal.showError(UNLOCK_FALLBACK_MESSAGE);
    return null;
  }

  try {
    if (signer.type === "extension" || signer.type === "nip07") {
      const permissionResult = await requestPermissions();
      if (!permissionResult?.ok) {
        modal.showError("Extension permissions are required to unlock storage.");
        return null;
      }
    }
    await modal.storageService.unlock(pubkey, { signer });
  } catch (error) {
    userLogger.error("[editModalUpload] Storage unlock failed:", error);
    modal.showError(
      "Failed to unlock storage: " + (error?.message || String(error)),
    );
    return null;
  }

  let conn = null;
  try {
    conn = await modal.mediaUploader.resolveActiveConnection();
  } catch (error) {
    devLogger.warn("[editModalUpload] Failed to re-resolve storage connection:", error);
  }
  if (!conn?.unlocked || !conn?.credentials) {
    modal.showError(UNLOCK_FALLBACK_MESSAGE);
    return null;
  }
  return conn;
}

export function initEditModalUpload(modal, context) {
  if (!context || typeof context.querySelector !== "function") {
    return;
  }

  const els = {
    thumbBtn: context.querySelector("#editThumbnailFileBtn") || null,
    thumbInput: context.querySelector("#editThumbnailFile") || null,
    thumbStatus: context.querySelector("#editThumbnailUploadStatus") || null,
    videoBtn: context.querySelector("#editVideoFileBtn") || null,
    videoInput: context.querySelector("#editVideoFile") || null,
    videoStatus: context.querySelector("#editVideoUploadStatus") || null,
  };

  // Monotonic guard so a stale upload (modal reused for another video) can't
  // overwrite fresh fields.
  modal._editUploadId = modal._editUploadId || 0;

  if (els.thumbBtn instanceof HTMLElement && els.thumbInput instanceof HTMLElement) {
    els.thumbBtn.addEventListener("click", () => els.thumbInput.click());
    els.thumbInput.addEventListener("change", async () => {
      const file = els.thumbInput.files?.[0];
      els.thumbInput.value = "";
      if (!file) return;

      const conn = await ensureUploadable(modal);
      if (!conn) return;

      const uploadId = ++modal._editUploadId;
      setStatus(els.thumbStatus, "Uploading thumbnail…");
      try {
        const { url } = await modal.mediaUploader.uploadThumbnail(file, {
          provider: conn.provider,
          credentials: conn.credentials,
          onProgress: (fraction) => {
            if (modal._editUploadId === uploadId && Number.isFinite(fraction)) {
              setStatus(els.thumbStatus, `Uploading thumbnail… ${Math.round(fraction * 100)}%`);
            }
          },
        });
        if (modal._editUploadId !== uploadId) return;
        setFieldUnlocked(modal.fields?.thumbnail, url);
        setStatus(els.thumbStatus, "Thumbnail uploaded.");
        modal.showSuccess?.("Thumbnail uploaded. Save changes to publish it.");
      } catch (error) {
        if (modal._editUploadId !== uploadId) return;
        userLogger.error("[editModalUpload] Thumbnail upload failed:", error);
        setStatus(els.thumbStatus, "Thumbnail upload failed.");
        modal.showError("Thumbnail upload failed.");
      }
    });
  }

  if (els.videoBtn instanceof HTMLElement && els.videoInput instanceof HTMLElement) {
    els.videoBtn.addEventListener("click", () => els.videoInput.click());
    els.videoInput.addEventListener("change", async () => {
      const file = els.videoInput.files?.[0];
      els.videoInput.value = "";
      if (!file) return;

      const conn = await ensureUploadable(modal);
      if (!conn) return;

      const uploadId = ++modal._editUploadId;
      setStatus(els.videoStatus, "Uploading video…");
      try {
        const result = await modal.mediaUploader.uploadVideo(file, {
          provider: conn.provider,
          credentials: conn.credentials,
          onProgress: ({ fraction, label }) => {
            if (modal._editUploadId !== uploadId) return;
            if (label) setStatus(els.videoStatus, label);
            else if (Number.isFinite(fraction)) {
              setStatus(els.videoStatus, `Uploading video… ${Math.round(fraction * 100)}%`);
            }
          },
        });
        if (modal._editUploadId !== uploadId) return;

        // Write the new source into the (unlocked) fields. The magnet carries
        // the new infohash + ws/xs; EditModal.collect re-derives hints from it.
        setFieldUnlocked(modal.fields?.url, result.url);
        if (result.magnet) {
          setFieldUnlocked(modal.fields?.magnet, result.magnet);
          if (modal.fields?.ws) setFieldUnlocked(modal.fields.ws, result.url);
          if (modal.fields?.xs && result.torrentUrl) {
            setFieldUnlocked(modal.fields.xs, result.torrentUrl);
          }
        }
        setStatus(
          els.videoStatus,
          result.hasValidInfoHash
            ? "Video uploaded. Save changes to publish it."
            : "Video uploaded (no torrent). Save changes to publish it.",
        );
        modal.showSuccess?.("Video uploaded. Save changes to publish it.");
      } catch (error) {
        if (modal._editUploadId !== uploadId) return;
        userLogger.error("[editModalUpload] Video upload failed:", error);
        setStatus(els.videoStatus, "Video upload failed.");
        modal.showError("Video upload failed.");
      }
    });
  }
}

export { setFieldUnlocked };
