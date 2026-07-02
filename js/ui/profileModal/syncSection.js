// Shared UI for a syncable profile item (NWC wallet, storage credentials, …).
// Previously ProfileWalletController and ProfileStorageController each had their
// own copy of the sync-toggle / restore / overwrite-confirm logic, which produced
// inconsistent notifications and duplicate confirm dialogs. This module is the one
// implementation both use, so every item gets identical toasts, one overwrite
// confirm, and the same conflict-only behavior. Item-specific bits (the DOM status
// element, the "empty" hint, an optional pre-enable warning, and the re-render
// after restore) are passed in.

import { showConfirm } from "../confirmDialog.js";

function capitalize(label) {
  const value = typeof label === "string" ? label.trim() : "";
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

// The ONE overwrite-confirm dialog, shown only on a real conflict (remote is
// newer — changed on another device). itemLabel = "wallet connection" | "storage
// settings".
export function confirmSyncOverwrite(itemLabel) {
  return showConfirm(
    `A newer copy of your ${itemLabel} is on your account (changed on another ` +
      `device). Overwrite it with this one?`,
    { confirmLabel: "Overwrite", danger: true },
  );
}

// tone → the status line's className (consistent across items).
export function syncStatusClass(tone) {
  const toneClass =
    tone === "success"
      ? "text-status-success"
      : tone === "error"
        ? "text-status-danger"
        : "text-muted";
  return `text-xs ${toneClass}`;
}

// Shared enable/disable handler. `setToggle` reflects reality on rollback;
// `preEnableConfirm` is an optional async gate (e.g. the wallet spending-secret
// warning); `emptyHint` is the "nothing-to-sync" message.
export async function runSyncToggle({
  service,
  pubkey,
  enabled,
  itemLabel,
  setStatus,
  showSuccess,
  setToggle,
  preEnableConfirm,
  emptyHint = "Nothing to sync yet — save something first.",
}) {
  if (enabled) {
    if (typeof preEnableConfirm === "function") {
      const confirmed = await preEnableConfirm();
      if (!confirmed) {
        setToggle?.(false);
        return { ok: false, cancelled: true };
      }
    }
    setStatus("Encrypting and publishing…");
    const result = await service.enable(pubkey, {
      confirmOverwrite: () => confirmSyncOverwrite(itemLabel),
    });
    if (result?.ok) {
      setStatus(`Synced to ${result.accepted}/${result.total} relays.`, "success");
      showSuccess?.(`${capitalize(itemLabel)} synced (encrypted).`);
    } else if (result?.conflict) {
      // Declined to overwrite a newer remote copy — keep sync on, remote intact.
      setStatus(
        "Kept the newer copy on your account. Use Restore to pull it, or save again to overwrite.",
      );
    } else {
      setToggle?.(false);
      await service.disable(pubkey).catch(() => {});
      setStatus(
        result?.error === "nothing-to-sync"
          ? emptyHint
          : "Could not publish the encrypted copy. Try again.",
        "error",
      );
    }
    return result;
  }

  setStatus("Removing the synced copy…");
  await service.disable(pubkey);
  setStatus("Sync turned off; the synced copy was cleared.");
  showSuccess?.(`${capitalize(itemLabel)} sync turned off.`);
  return { ok: true, disabled: true };
}

// Shared restore (pull) handler. `onImported` re-renders the item's pane.
export async function runSyncRestore({
  service,
  pubkey,
  itemLabel,
  setStatus,
  showSuccess,
  onImported,
}) {
  setStatus("Fetching and decrypting…");
  const result = await service.pull(pubkey);
  if (result?.found && result.imported) {
    setStatus("Restored from your Nostr account.", "success");
    showSuccess?.(`${capitalize(itemLabel)} restored.`);
    if (typeof onImported === "function") {
      await onImported();
    }
  } else if (result?.found && !result.imported) {
    setStatus("Found a copy but could not import it.", "error");
  } else if (result?.cleared) {
    setStatus("No synced settings found (it was cleared).");
  } else {
    setStatus("No synced settings found on your account.");
  }
  return result;
}
