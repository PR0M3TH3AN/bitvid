// Per-video opt-in state for the NIP-71 mirror, persisted locally per
// pubkey+videoRootId. Off by default — a publisher explicitly opts a video in
// (from the My Videos tab). Local-only is fine: it's a convenience for the
// management UI; the authoritative state is whether the mirror event exists on
// relays.

const FLAG_KEY = "bitvid:nip71-mirror:v1";
const AUTO_SHARE_KEY = "bitvid:nip71-autoshare:v1";

function readFlags() {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(FLAG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeFlags(flags) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(FLAG_KEY, JSON.stringify(flags || {}));
    }
  } catch (error) {
    // Best-effort.
  }
}

function norm(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isMirrorEnabled(pubkey, videoRootId) {
  const pk = norm(pubkey);
  const root = norm(videoRootId);
  if (!pk || !root) {
    return false;
  }
  return readFlags()[pk]?.[root] === true;
}

export function setMirrorEnabled(pubkey, videoRootId, enabled) {
  const pk = norm(pubkey);
  const root = norm(videoRootId);
  if (!pk || !root) {
    return;
  }
  const flags = readFlags();
  const entry = flags[pk] && typeof flags[pk] === "object" ? flags[pk] : {};
  if (enabled === true) {
    entry[root] = true;
  } else {
    delete entry[root];
  }
  flags[pk] = entry;
  writeFlags(flags);
}

// Pure decision for a toggle click: given the current opt-in state and the
// service's eligibility check (canMirror), what should happen?
//   { action: "remove" }                       — currently on → tear down
//   { action: "publish" }                      — eligible + off → publish
//   { action: "blocked", reason: "<why>" }     — off but ineligible (private / nsfw / no-url)
export function resolveMirrorToggle({ enabled, eligibility } = {}) {
  if (enabled === true) {
    return { action: "remove" };
  }
  if (!eligibility || eligibility.ok !== true) {
    return { action: "blocked", reason: eligibility?.reason || "ineligible" };
  }
  return { action: "publish" };
}

// Account-level "auto-share new public videos" preference (per pubkey, off by
// default). When on, newly published eligible public videos are mirrored
// automatically — no per-video opt-in needed.
function readAutoShare() {
  try {
    if (typeof localStorage === "undefined") {
      return {};
    }
    const raw = localStorage.getItem(AUTO_SHARE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

export function isAutoShareEnabled(pubkey) {
  const pk = norm(pubkey);
  return pk ? readAutoShare()[pk] === true : false;
}

export function setAutoShareEnabled(pubkey, enabled) {
  const pk = norm(pubkey);
  if (!pk) {
    return;
  }
  const map = readAutoShare();
  if (enabled === true) {
    map[pk] = true;
  } else {
    delete map[pk];
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(AUTO_SHARE_KEY, JSON.stringify(map));
    }
  } catch (error) {
    // best-effort
  }
}

// On publish of a NEW video: mirror it only when auto-share is on AND it's
// eligible (public + hosted URL + allowed). Otherwise do nothing.
export function resolvePublishSync({ featureOn, autoShare, eligible } = {}) {
  if (featureOn !== true || autoShare !== true) {
    return { action: "none" };
  }
  return eligible === true ? { action: "publish" } : { action: "none" };
}

// Lifecycle decisions for keeping an opted-in mirror in sync (used by the
// nostrService edit/delete hooks). Pure so they're cheat-resistant to test.
//
// On EDIT of a mirrored video: re-publish if still eligible; if it became
// ineligible (e.g. flipped private), pull the mirror down and clear the flag.
export function resolveEditSync({ featureOn, enabled, eligible } = {}) {
  if (featureOn !== true || enabled !== true) {
    return { action: "none" };
  }
  return eligible === true ? { action: "publish" } : { action: "unshare" };
}

// On DELETE of a video: always attempt to tear the mirror down whenever the
// feature is on — do NOT gate on the local `enabled` flag. That flag lives only
// in this browser's localStorage (see top of file), so trusting it here orphans
// the NIP-71 mirror whenever the video was shared on one device/session and
// deleted from another (or after the cache was cleared): the mirror keeps living
// on other apps even though the bitvid video is gone. `remove()` is idempotent
// and cheap (NIP-09 + empty tombstone are no-ops if no mirror exists), so an
// unconditional teardown is safe. `enabled` is accepted for signature symmetry
// with resolveEditSync but is intentionally ignored.
export function resolveDeleteSync({ featureOn, enabled } = {}) {
  void enabled;
  if (featureOn !== true) {
    return { action: "none" };
  }
  return { action: "unshare" };
}

export const NIP71_MIRROR_FLAG_KEY = FLAG_KEY;
