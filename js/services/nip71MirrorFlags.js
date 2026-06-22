// Per-video opt-in state for the NIP-71 mirror, persisted locally per
// pubkey+videoRootId. Off by default — a publisher explicitly opts a video in
// (from the My Videos tab). Local-only is fine: it's a convenience for the
// management UI; the authoritative state is whether the mirror event exists on
// relays.

const FLAG_KEY = "bitvid:nip71-mirror:v1";

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

// On DELETE of a mirrored video: remove the mirror and clear the flag.
export function resolveDeleteSync({ featureOn, enabled } = {}) {
  if (featureOn !== true || enabled !== true) {
    return { action: "none" };
  }
  return { action: "unshare" };
}

export const NIP71_MIRROR_FLAG_KEY = FLAG_KEY;
