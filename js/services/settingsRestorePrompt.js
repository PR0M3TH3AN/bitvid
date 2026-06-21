// One-time "offer to pull on login" for encrypted settings sync (todo #15).
// On login, if an encrypted copy of the user's storage and/or wallet settings
// exists on their Nostr account — and this device hasn't already opted in — offer
// to restore it. Runs AFTER login (never blocks it) and respects the signer
// budget: the existence check is list-only (no decrypt); decryption happens only
// if the user accepts.

import { storageSyncService as defaultStorageSync } from "./storageSyncService.js";

const OFFERED_KEY = "bitvid:settings-sync:offered:v1";

function readOffered() {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(OFFERED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function markOffered(pubkey) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    const map = readOffered();
    map[pubkey] = true;
    localStorage.setItem(OFFERED_KEY, JSON.stringify(map));
  } catch (error) {
    // Best-effort.
  }
}

function hasOffered(pubkey) {
  return readOffered()[pubkey] === true;
}

const ITEM_LABELS = {
  storage: "storage settings",
  wallet: "wallet connection",
};

export function createSettingsRestorePrompt({
  storageSync = defaultStorageSync,
  walletSync = null,
  confirm = (message) =>
    typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(message)
      : false,
  logger = null,
} = {}) {
  // Items not already enabled on THIS device that have a remote copy to restore.
  async function collectCandidates(pubkey) {
    const candidates = [];
    const services = [
      ["storage", storageSync],
      ["wallet", walletSync],
    ];
    for (const [kind, service] of services) {
      if (!service?.isAvailable?.() || service.isEnabled(pubkey)) {
        continue;
      }
      try {
        if (await service.hasRemote()) {
          candidates.push(kind);
        }
      } catch (error) {
        logger?.warn?.(`[settingsRestore] ${kind} hasRemote check failed`, error);
      }
    }
    return candidates;
  }

  async function maybeOffer(pubkey, { onRestored } = {}) {
    const key = typeof pubkey === "string" ? pubkey.trim() : "";
    if (!key) {
      return { offered: false, reason: "no-pubkey" };
    }
    if (hasOffered(key)) {
      return { offered: false, reason: "already-offered" };
    }

    const candidates = await collectCandidates(key);
    if (!candidates.length) {
      // Don't mark offered — a note may be published later from another device;
      // the existence check is cheap (list-only) so re-checking next login is fine.
      return { offered: false, reason: "no-remote" };
    }

    // We are about to prompt — mark so we never nag again on this device.
    markOffered(key);

    const list = candidates.map((kind) => ITEM_LABELS[kind]).join(" and ");
    const accepted = confirm(
      `Found an encrypted copy of your ${list} on your Nostr account. ` +
        `Restore ${candidates.length > 1 ? "them" : "it"} to this device?`
    );
    if (!accepted) {
      return { offered: true, accepted: false };
    }

    const restored = [];
    const serviceByKind = { storage: storageSync, wallet: walletSync };
    for (const kind of candidates) {
      try {
        const result = await serviceByKind[kind].pull(key);
        if (result?.imported) {
          restored.push(kind);
        }
      } catch (error) {
        logger?.warn?.(`[settingsRestore] ${kind} pull failed`, error);
      }
    }
    if (restored.length && typeof onRestored === "function") {
      onRestored(restored);
    }
    return { offered: true, accepted: true, restored };
  }

  return { maybeOffer };
}

export default createSettingsRestorePrompt;
