// One-time "offer to pull on login" for encrypted settings sync (todo #15).
// On login, if an encrypted copy of the user's storage and/or wallet settings
// exists on their Nostr account — and this device hasn't already opted in — offer
// to restore it. Runs AFTER login (never blocks it) and respects the signer
// budget: the existence check is list-only (no decrypt); decryption happens only
// if the user accepts.

import { storageSyncService as defaultStorageSync } from "./storageSyncService.js";
import { showConfirm } from "../ui/confirmDialog.js";
import { setSyncEnabled } from "./settingsSyncFlags.js";

const OFFERED_KEY = "bitvid:settings-sync:offered:v1";
// Set when the user explicitly declines a restore offer, so the "re-offer while
// the item is missing locally" behavior below doesn't nag them on every login.
const DISMISSED_KEY = "bitvid:settings-sync:dismissed:v1";

function readMap(storageKey) {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function readOffered() {
  return readMap(OFFERED_KEY);
}

function isDismissed(pubkey, kind) {
  const entry = readMap(DISMISSED_KEY)[pubkey];
  return Boolean(entry && typeof entry === "object" && entry[kind]);
}

function markDismissed(pubkey, kind) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    const map = readMap(DISMISSED_KEY);
    const kinds =
      map[pubkey] && typeof map[pubkey] === "object" ? { ...map[pubkey] } : {};
    kinds[kind] = true;
    map[pubkey] = kinds;
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch (error) {
    // Best-effort.
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
  confirm = (message) => showConfirm(message, { confirmLabel: "Restore" }),
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
      // Enabled items auto-pull silently elsewhere; declined items stay quiet.
      if (
        !service?.isAvailable?.() ||
        service.isEnabled(pubkey) ||
        isDismissed(pubkey, kind)
      ) {
        continue;
      }
      // Re-offer whenever the item is MISSING locally (e.g. a fresh device or a
      // cleared wallet) so a Nostr backup gets surfaced — "restore like storage".
      // Only when we DO have it locally do we respect the once-per-device flag
      // (no nagging). Unknown (no hasLocal) → assume present → keep old behavior.
      let localCopy = true;
      if (typeof service.hasLocal === "function") {
        try {
          localCopy = Boolean(await service.hasLocal(pubkey));
        } catch (error) {
          localCopy = true;
        }
      }
      if (localCopy && hasOffered(pubkey, kind)) {
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

    // Items ALREADY enabled on this device sync silently: pull the remote note
    // when it's newer than what this device last pushed/pulled (i.e. another
    // device changed it). No prompt — the user opted in when enabling sync.
    // Without this, enabled devices only ever pushed, and edits from another
    // device sat unseen until the manual Restore click ("doesn't sync").
    const autoPulled = [];
    for (const [kind, service] of [
      ["storage", storageSync],
      ["wallet", walletSync],
    ]) {
      if (typeof service?.autoPullIfNewer !== "function") {
        continue;
      }
      try {
        const result = await service.autoPullIfNewer(key);
        if (result?.pulled) {
          autoPulled.push(kind);
        }
      } catch (error) {
        logger?.warn?.(`[settingsRestore] ${kind} auto-pull failed`, error);
      }
    }
    if (autoPulled.length && typeof onRestored === "function") {
      onRestored(autoPulled);
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
    const accepted = await confirm(
      `Found an encrypted copy of your ${list} on your Nostr account. ` +
        `Restore ${candidates.length > 1 ? "them" : "it"} to this device?`
    );
    if (!accepted) {
      // Remember the decline so we don't re-offer a missing item every login.
      for (const kind of candidates) {
        markDismissed(key, kind);
      }
      return { offered: true, accepted: false };
    }

    const restored = [];
    const serviceByKind = { storage: storageSync, wallet: walletSync };
    for (const kind of candidates) {
      try {
        const result = await serviceByKind[kind].pull(key);
        if (result?.imported) {
          restored.push(kind);
          // Accepting the offer means "keep this device in sync", not just a
          // one-time pull — enable the flag so future saves auto-push (the toggle
          // then reflects reality). Without this, users restored once but never
          // synced again ("not syncing").
          setSyncEnabled(key, kind, true);
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
