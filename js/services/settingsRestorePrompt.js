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

// Per-pubkey, PER-ITEM offered state. Tracking only per-pubkey meant the first
// item offered (usually storage) flagged the whole pubkey, so a wallet note
// published later was never offered — "the wallet doesn't restore like storage".
// Returns { storage?: true, wallet?: true }. Legacy boolean `true` (pre per-item)
// is read as storage-only so existing users still get the wallet offer.
function readOfferedKinds(pubkey) {
  const entry = readOffered()[pubkey];
  if (entry === true) {
    return { storage: true };
  }
  return entry && typeof entry === "object" ? entry : {};
}

function markOffered(pubkey, kind) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    const map = readOffered();
    const current = map[pubkey] === true ? { storage: true } : map[pubkey];
    const kinds = current && typeof current === "object" ? { ...current } : {};
    kinds[kind] = true;
    map[pubkey] = kinds;
    localStorage.setItem(OFFERED_KEY, JSON.stringify(map));
  } catch (error) {
    // Best-effort.
  }
}

function hasOffered(pubkey, kind) {
  return readOfferedKinds(pubkey)[kind] === true;
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
  // Items not already enabled / not already offered on THIS device that have a
  // remote copy to restore. Each kind is considered INDEPENDENTLY so a wallet note
  // published after storage was already offered is still surfaced.
  async function collectCandidates(pubkey) {
    const candidates = [];
    const services = [
      ["storage", storageSync],
      ["wallet", walletSync],
    ];
    for (const [kind, service] of services) {
      if (
        !service?.isAvailable?.() ||
        service.isEnabled(pubkey) ||
        hasOffered(pubkey, kind)
      ) {
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

    const candidates = await collectCandidates(key);
    if (!candidates.length) {
      // Don't mark offered — a note may be published later from another device;
      // the existence check is cheap (list-only) so re-checking next login is fine.
      return { offered: false, reason: "no-remote" };
    }

    // We are about to prompt — mark EACH offered kind so we never nag again for it
    // on this device (but other kinds stay eligible for a future login).
    for (const kind of candidates) {
      markOffered(key, kind);
    }

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
