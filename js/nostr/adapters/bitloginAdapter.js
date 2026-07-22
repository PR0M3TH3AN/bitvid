// js/nostr/adapters/bitloginAdapter.js
//
// Wraps a live <bitlogin-auth> element (already signed in) as a signer matching
// the same shape as nip07Adapter/nsecAdapter/nip46Adapter. Never touches
// window.nostr and never sees the private key -- every call is proxied through
// the element's own crypto Web Worker (see BitLogin's README, "Embedding
// BitLogin" -> element-scoped methods).

export function createBitloginAdapter(widgetElement, pubkey) {
  const signer = {
    type: "bitlogin",
    pubkey: typeof pubkey === "string" ? pubkey : "",
    metadata: async () => null,
    relays: async () => null,
    signEvent: async (event) => widgetElement.signEvent(event),
    nip44Encrypt: async (peerPubkey, plaintext) =>
      widgetElement.nip44Encrypt(peerPubkey, plaintext),
    nip44Decrypt: async (peerPubkey, payload) =>
      widgetElement.nip44Decrypt(peerPubkey, payload),
    requestPermissions: async () => ({ ok: true }),
    destroy: async () => {
      try {
        await widgetElement.logout();
      } catch (error) {
        // The element is permanently mounted and reused for the next sign-in;
        // a failed logout here shouldn't block switching to another signer.
      }
    },
    canSign: () => true,
    capabilities: {
      sign: true,
      nip44: true,
      nip04: false,
    },
  };

  return signer;
}
