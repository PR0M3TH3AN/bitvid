// Pure decision for `app.ensureEncryptionCapableSigner`. Given the active signer's
// current capabilities and whether a locked (passphrase-encrypted) nsec key exists
// for the active account, decide whether to proceed, fail, or prompt the user to
// re-unlock their key. Kept side-effect-free so the branching is unit-testable
// without the browser app shell (TODO #51/#54/#56/#57).
//
// Returns one of:
//   { action: "ok" }                          — signer already capable
//   { action: "prompt" }                      — recoverable: prompt + unlock nsec
//   { action: "fail", reason: <string> }      — not recoverable here

const defaultNormalize = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export function isSignerCapable(capabilities, need = "encrypt") {
  const caps =
    capabilities && typeof capabilities === "object" ? capabilities : {};
  if (!caps.sign) {
    return false;
  }
  return need === "sign" ? true : Boolean(caps.nip44) || Boolean(caps.nip04);
}

export function decideSignerEnsure({
  capabilities,
  need = "encrypt",
  normalizedPubkey,
  storedKeyMeta,
  normalizePubkey = defaultNormalize,
} = {}) {
  if (isSignerCapable(capabilities, need)) {
    return { action: "ok" };
  }

  if (!normalizedPubkey) {
    return { action: "fail", reason: "no-signer" };
  }

  // Only an nsec-after-reload situation is recoverable here: a saved, locked key
  // for this exact account we can decrypt with the passphrase. Anything else
  // (e.g. an unresponsive NIP-07 extension) is the caller's own error to surface.
  if (!storedKeyMeta || storedKeyMeta.hasEncryptedKey !== true) {
    return { action: "fail", reason: "no-stored-key" };
  }

  if (
    storedKeyMeta.pubkey &&
    normalizePubkey(storedKeyMeta.pubkey) !== normalizedPubkey
  ) {
    return { action: "fail", reason: "pubkey-mismatch" };
  }

  return { action: "prompt" };
}

export default decideSignerEnsure;
