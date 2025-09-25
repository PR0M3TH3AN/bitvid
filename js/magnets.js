import parseMagnet from "https://esm.sh/magnet-uri@9.1.2";

function normalizeInfoHash(candidate) {
  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (/^[0-9a-f]{40}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^[a-z2-7]{32}$/i.test(trimmed)) {
    try {
      const parsed = parseMagnet(`magnet:?xt=urn:btih:${trimmed}`);
      const hash = typeof parsed.infoHash === "string" ? parsed.infoHash : "";
      return hash ? hash.toLowerCase() : null;
    } catch (err) {
      console.warn("Failed to normalize base32 info hash", err);
    }
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
  try {
    const parsed = parseMagnet(magnet);
    const hash = typeof parsed.infoHash === "string" ? parsed.infoHash : "";
    return hash ? hash.toLowerCase() : null;
  } catch (err) {
    console.warn("Failed to parse magnet for info hash", err);
    return null;
  }
}

export function trackersFromMagnet(magnet) {
  if (typeof magnet !== "string") {
    return [];
  }
  try {
    const parsed = parseMagnet(magnet);
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
  } catch (err) {
    console.warn("Failed to parse magnet trackers", err);
    return [];
  }
}
