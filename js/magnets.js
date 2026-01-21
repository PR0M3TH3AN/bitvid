const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function decodeBase32ToHex(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const normalized = value.toLowerCase();
  let bits = 0;
  let buffer = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      return "";
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      const byte = (buffer >> bits) & 0xff;
      bytes.push(byte);
    }
  }

  if (bytes.length === 0) {
    return "";
  }

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractInfoHashFromXt(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("urn:btih:")) {
    return "";
  }

  const payload = trimmed.slice(9);
  return normalizeInfoHash(payload);
}

function normalizeInfoHash(candidate) {
  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (/^[0-9a-f]{40}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^[a-z2-7]{32}$/i.test(trimmed)) {
    const hex = decodeBase32ToHex(trimmed);
    return hex ? hex.toLowerCase() : null;
  }
  return null;
}

export function infoHashFromMagnet(magnet) {
  if (typeof magnet !== "string") {
    return null;
  }
  const direct = normalizeInfoHash(magnet);
  if (direct) {
    return direct;
  }
  const parsed = parseMagnetLite(magnet);
  const hash = typeof parsed.infoHash === "string" ? parsed.infoHash : "";
  return hash ? hash.toLowerCase() : null;
}

function parseMagnetLite(magnet) {
  if (typeof magnet !== "string") {
    return { infoHash: "", announce: [] };
  }

  const trimmed = magnet.trim();
  if (!trimmed) {
    return { infoHash: "", announce: [] };
  }

  const lower = trimmed.toLowerCase();
  const queryIndex = lower.indexOf("?");
  const paramsPart = queryIndex >= 0 ? trimmed.slice(queryIndex + 1) : "";
  const params = paramsPart.split("&");
  const announce = [];
  let infoHash = "";

  for (const param of params) {
    if (!param) {
      continue;
    }

    const [rawKey, ...rawValueParts] = param.split("=");
    const rawValue = rawValueParts.join("=");
    const key = decodeURIComponent((rawKey || "").replace(/\+/g, " ")).toLowerCase();
    const value = decodeURIComponent((rawValue || "").replace(/\+/g, " "));

    if (!key) {
      continue;
    }

    if (key === "xt") {
      const derived = extractInfoHashFromXt(value);
      if (derived && !infoHash) {
        infoHash = derived;
      }
    } else if (key === "tr") {
      if (value) {
        announce.push(value);
      }
    }
  }

  return { infoHash, announce };
}
