// Decide whether switching to a saved nsec account can proceed via the stored key.
// Pure so the branching is unit-testable; the coordinator handles the prompt + I/O.
//
//   { action: "prompt" }                      → stored nsec key matches; ask for the PIN
//   { action: "error", reason: "no-stored-key" }  → no persisted nsec key on this device
//   { action: "error", reason: "pubkey-mismatch" } → the saved key is a different account

function normalizeHex(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : "";
}

export function evaluateStoredNsecSwitch(meta, targetPubkey) {
  if (!meta || meta.hasEncryptedKey !== true || meta.source !== "nsec") {
    return { action: "error", reason: "no-stored-key" };
  }
  const stored = normalizeHex(meta.pubkey);
  const target = normalizeHex(targetPubkey);
  if (stored && target && stored !== target) {
    return { action: "error", reason: "pubkey-mismatch" };
  }
  return { action: "prompt" };
}
