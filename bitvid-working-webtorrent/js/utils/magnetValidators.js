// js/utils/magnetValidators.js

import { safeDecodeMagnet } from "../magnetUtils.js";

/**
 * Basic validation for BitTorrent magnet URIs.
 *
 * Returns `true` only when the value looks like a magnet link that WebTorrent
 * understands (`magnet:` scheme with at least one `xt=urn:btih:<info-hash>`
 * entry, where `<info-hash>` is either a 40-character hex digest or a
 * 32-character base32 digest). Magnets that only contain BitTorrent v2 hashes
 * (e.g. `btmh`) are treated as unsupported.
 */
export function isValidMagnetUri(magnet) {
  const trimmed = typeof magnet === "string" ? magnet.trim() : "";
  if (!trimmed) {
    return false;
  }

  const decoded = safeDecodeMagnet(trimmed);
  const candidate = decoded || trimmed;

  if (/^[0-9a-f]{40}$/i.test(candidate)) {
    return true;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol.toLowerCase() !== "magnet:") {
      return false;
    }

    const xtValues = parsed.searchParams.getAll("xt");
    if (!xtValues.length) {
      return false;
    }

    const hexPattern = /^[0-9a-f]{40}$/i;
    const base32Pattern = /^[A-Z2-7]{32}$/;

    return xtValues.some((value) => {
      if (typeof value !== "string") return false;
      const match = value.trim().match(/^urn:btih:([a-z0-9]+)$/i);
      if (!match) return false;

      const infoHash = match[1];
      if (hexPattern.test(infoHash)) {
        return true;
      }

      const upperHash = infoHash.toUpperCase();
      return infoHash.length === 32 && base32Pattern.test(upperHash);
    });
  } catch (err) {
    return false;
  }
}

export default isValidMagnetUri;
