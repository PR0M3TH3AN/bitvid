import { extractBtihFromMagnet, normalizeInfoHash } from "./magnetShared.js";

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

export function infoHashFromMagnet(magnet) {
  if (typeof magnet !== "string") {
    return null;
  }
  const extracted = extractBtihFromMagnet(magnet);
  return extracted || null;
}

export function trackersFromMagnet(magnet) {
  if (typeof magnet !== "string") {
    return [];
  }
  const parsed = parseMagnetLite(magnet);
  if (!parsed || !Array.isArray(parsed.announce)) {
    return [];
  }
  const deduped = new Set();
  parsed.announce.forEach((url) => {
    if (typeof url !== "string") {
      return;
    }
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    deduped.add(trimmed);
  });
  return Array.from(deduped);
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
