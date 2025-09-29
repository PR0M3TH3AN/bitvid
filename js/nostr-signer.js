export function installSoftSigner(secretKeyBytes) {
  const tools = window?.NostrTools;
  if (!tools) {
    throw new Error("NostrTools are not available");
  }
  const { getPublicKey, finalizeEvent, nip04 } = tools;
  if (typeof getPublicKey !== "function" || typeof finalizeEvent !== "function") {
    throw new Error("Missing required nostr-tools helpers");
  }
  if (!nip04 || typeof nip04.encrypt !== "function" || typeof nip04.decrypt !== "function") {
    throw new Error("nip04 helpers are not available");
  }

  if (!(secretKeyBytes instanceof Uint8Array)) {
    throw new TypeError("Secret key must be provided as a Uint8Array");
  }
  const pubkey = getPublicKey(secretKeyBytes);

  if (!window.nostr) {
    window.nostr = {
      __bitvidSoft: true,
      getPublicKey: async () => pubkey,
      signEvent: async (event) => finalizeEvent({ ...event, pubkey }, secretKeyBytes),
      nip04: {
        encrypt: (peer, text) => nip04.encrypt(secretKeyBytes, peer, text),
        decrypt: (peer, ciphertext) => nip04.decrypt(secretKeyBytes, peer, ciphertext),
      },
    };
  }

  return pubkey;
}

export function uninstallSoftSigner(secretKeyBytes) {
  if (secretKeyBytes instanceof Uint8Array) {
    try {
      secretKeyBytes.fill(0);
    } catch (_) {
      // ignore zeroization errors
    }
  }
  if (window.nostr && window.nostr.__bitvidSoft) {
    delete window.nostr;
  }
}
