// Per-pubkey opt-in flags for encrypted settings sync (todo #15). Shared by the
// storage and wallet sync services so the toggle state persists locally.
// Shape: { [pubkey]: { storage?: boolean, wallet?: boolean } }. Off by default.

const FLAG_STORAGE_KEY = "bitvid:settings-sync:v1";

function readFlags() {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(FLAG_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeFlags(flags) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify(flags || {}));
  } catch (error) {
    // Best-effort; the flag is a convenience, not a source of truth.
  }
}

function normalizePubkey(pubkey) {
  return typeof pubkey === "string" ? pubkey.trim() : "";
}

export function isSyncEnabled(pubkey, kind) {
  const key = normalizePubkey(pubkey);
  if (!key || !kind) {
    return false;
  }
  return readFlags()[key]?.[kind] === true;
}

export function setSyncEnabled(pubkey, kind, enabled) {
  const key = normalizePubkey(pubkey);
  if (!key || !kind) {
    return;
  }
  const flags = readFlags();
  const entry = flags[key] && typeof flags[key] === "object" ? flags[key] : {};
  entry[kind] = enabled === true;
  flags[key] = entry;
  writeFlags(flags);
}

// Remember the created_at of the note we last published, per pubkey+kind, so a
// later save can detect when the relay copy is NEWER (another device changed it)
// and warn before overwriting.
export function getSyncPushedAt(pubkey, kind) {
  const key = normalizePubkey(pubkey);
  if (!key || !kind) {
    return 0;
  }
  const value = Number(readFlags()[key]?.[`${kind}PushedAt`]);
  return Number.isFinite(value) ? value : 0;
}

export function setSyncPushedAt(pubkey, kind, createdAt) {
  const key = normalizePubkey(pubkey);
  if (!key || !kind) {
    return;
  }
  const flags = readFlags();
  const entry = flags[key] && typeof flags[key] === "object" ? flags[key] : {};
  entry[`${kind}PushedAt`] = Number(createdAt) || 0;
  flags[key] = entry;
  writeFlags(flags);
}

export const SETTINGS_SYNC_FLAG_KEY = FLAG_STORAGE_KEY;
