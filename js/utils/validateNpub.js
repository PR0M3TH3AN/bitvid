// Shared, anti-spam npub (NIP-19) validation for the embed submission forms
// (application / feature-request / bug-fix / feedback). A submission identifier
// is only accepted if it decodes to a canonical 64-char hex pubkey, so the forms
// stop publishing free-text garbage.
//
// Usable two ways:
//   - import { validateNpubHex } from "../utils/validateNpub.js" (tests / app)
//   - as a classic global in the iframe forms: window.validateNpubHex(value)
//     (the module assigns the global below and resolves nostr-tools at call time
//     from window.NostrTools, which the forms already load).

/**
 * Decode a user-entered npub and return its hex pubkey, or null if it isn't a
 * well-formed npub.
 *
 * @param {string} value Raw input (may include surrounding whitespace).
 * @param {{ nip19?: { decode: Function } }} [deps] Inject a nip19 implementation
 *   (defaults to the global NostrTools bundle the embed forms load).
 * @returns {string|null} 64-char lowercase hex pubkey, or null when invalid.
 */
export function validateNpubHex(value, { nip19 } = {}) {
  const decoder =
    nip19 ||
    (typeof globalThis !== "undefined" ? globalThis.NostrTools?.nip19 : null);

  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("npub1")) {
    return null;
  }
  if (!decoder || typeof decoder.decode !== "function") {
    return null;
  }

  try {
    const decoded = decoder.decode(trimmed);
    if (
      decoded &&
      decoded.type === "npub" &&
      typeof decoded.data === "string" &&
      /^[0-9a-f]{64}$/.test(decoded.data)
    ) {
      return decoded.data;
    }
  } catch (error) {
    return null;
  }

  return null;
}

if (typeof globalThis !== "undefined") {
  // Expose to the iframe forms' classic inline scripts. Resolves NostrTools at
  // call time, so load order relative to the nostr-tools bundle doesn't matter.
  globalThis.validateNpubHex = (value) => validateNpubHex(value);
}

export default validateNpubHex;
