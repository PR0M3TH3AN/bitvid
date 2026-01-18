// js/nostr/signer-interface.js

/**
 * Canonical async signer interface used by bitvid.
 *
 * @typedef {Object} NostrSignerInterface
 * @property {string} type
 *   Identifier for the signer implementation ("nsec", "nip07", "nip46", etc.).
 * @property {string} pubkey
 *   Hex-encoded public key for the signer (lowercase).
 * @property {() => Promise<object|null>} metadata
 *   Returns signer metadata (name, url, image, etc.) when available.
 * @property {() => Promise<object|null>} relays
 *   Returns relay hints or preferences when available.
 * @property {(event: object) => Promise<object>} signEvent
 *   Signs a Nostr event payload and returns the signed event.
 * @property {(targetPubkey: string, plaintext: string) => Promise<string>} [nip04Encrypt]
 *   Optional NIP-04 encryption helper.
 * @property {(targetPubkey: string, ciphertext: string) => Promise<string>} [nip04Decrypt]
 *   Optional NIP-04 decryption helper.
 * @property {(targetPubkey: string, plaintext: string) => Promise<string>} [nip44Encrypt]
 *   Optional NIP-44 encryption helper.
 * @property {(targetPubkey: string, ciphertext: string) => Promise<string>} [nip44Decrypt]
 *   Optional NIP-44 decryption helper.
 * @property {(methods?: string[]) => Promise<unknown>} requestPermissions
 *   Requests signer permissions for the provided methods, when supported.
 * @property {() => Promise<void>} destroy
 *   Cleans up any resources associated with the signer.
 * @property {() => boolean} canSign
 *   Returns true when signEvent is available and ready.
 */

export const SIGNER_INTERFACE_FIELDS = Object.freeze({
  required: Object.freeze([
    "type",
    "pubkey",
    "metadata",
    "relays",
    "signEvent",
    "requestPermissions",
    "destroy",
    "canSign",
  ]),
  optional: Object.freeze([
    "nip04Encrypt",
    "nip04Decrypt",
    "nip44Encrypt",
    "nip44Decrypt",
  ]),
});
