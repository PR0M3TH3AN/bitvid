import { extractBtihFromMagnet } from "./magnetShared.js";

export function infoHashFromMagnet(magnet) {
  if (typeof magnet !== "string") {
    return null;
  }
  const extracted = extractBtihFromMagnet(magnet);
  return extracted || null;
}
