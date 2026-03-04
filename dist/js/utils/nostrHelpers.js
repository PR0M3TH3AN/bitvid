import { HEX64_REGEX } from "./hex.js";

/**
 * Safely encode a hex pubkey to npub.
 *
 * @param {string} pubkey - The hex public key.
 * @returns {string|null} The npub string or null if encoding failed.
 */
export function safeEncodeNpub(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("npub1")) {
    return trimmed;
  }

  try {
    if (
      typeof window !== "undefined" &&
      window.NostrTools &&
      window.NostrTools.nip19 &&
      typeof window.NostrTools.nip19.npubEncode === "function"
    ) {
      return window.NostrTools.nip19.npubEncode(trimmed);
    }
  } catch (err) {
    // ignore
  }

  return null;
}

/**
 * Safely decode an npub to hex pubkey.
 *
 * @param {string} npub - The npub string.
 * @returns {string|null} The hex public key or null if decoding failed.
 */
export function safeDecodeNpub(npub) {
  if (typeof npub !== "string") {
    return null;
  }

  const trimmed = npub.trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (
      typeof window !== "undefined" &&
      window.NostrTools &&
      window.NostrTools.nip19 &&
      typeof window.NostrTools.nip19.decode === "function"
    ) {
      const decoded = window.NostrTools.nip19.decode(trimmed);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    }
  } catch (err) {
    // ignore
  }

  return null;
}

/**
 * Normalize a public key to hex format, handling npub inputs.
 *
 * @param {string} pubkey - The public key (hex or npub).
 * @returns {string|null} The normalized hex public key or null.
 */
export function normalizeHexPubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.startsWith("npub1")) {
    const decoded = safeDecodeNpub(trimmed);
    if (decoded && HEX64_REGEX.test(decoded)) {
      return decoded.toLowerCase();
    }
  }

  return null;
}
