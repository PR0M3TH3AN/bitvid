// First-run onboarding state (docs/onboarding-plan.md). Tracks, per pubkey per
// device, whether the guided tour has been offered/completed/skipped — same
// local-flag pattern as settingsRestorePrompt. Never blocks login; purely a
// localStorage map: { [pubkey]: { status: "completed"|"skipped", at } }.

const ONBOARDING_STORAGE_KEY = "bitvid:onboarding:v1";

function normalizePubkey(pubkey) {
  return typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
}

function readMap() {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeMap(map) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    // best-effort
  }
}

// True when this pubkey has never completed or skipped the tour on this device.
export function shouldOfferOnboarding(pubkey) {
  const key = normalizePubkey(pubkey);
  if (!key) {
    return false;
  }
  const entry = readMap()[key];
  return !entry || (entry.status !== "completed" && entry.status !== "skipped");
}

export function markOnboarding(pubkey, status) {
  const key = normalizePubkey(pubkey);
  if (!key || (status !== "completed" && status !== "skipped")) {
    return;
  }
  const map = readMap();
  map[key] = { status, at: Date.now() };
  writeMap(map);
}

// For the re-launchable "Take the tour" entry point: forget the flag so a rerun
// behaves like a fresh offer (rerunning does not need this, but tests do).
export function resetOnboarding(pubkey) {
  const key = normalizePubkey(pubkey);
  if (!key) {
    return;
  }
  const map = readMap();
  if (key in map) {
    delete map[key];
    writeMap(map);
  }
}

export const ONBOARDING_KEY = ONBOARDING_STORAGE_KEY;
