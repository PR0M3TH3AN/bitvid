import { WSS_TRACKERS } from "./constants.js";
import { normalizeAndAugmentMagnet as normalizeLegacy } from "./magnetUtils.js";

export function normalizeAndAugmentMagnet(rawValue, { ws = "", xs = "" } = {}) {
  const trimmedInput = typeof rawValue === "string" ? rawValue.trim() : "";
  const trimmedWs = typeof ws === "string" ? ws.trim() : "";
  const trimmedXs = typeof xs === "string" ? xs.trim() : "";

  const webSeeds = trimmedWs ? [trimmedWs] : [];

  const result = normalizeLegacy(trimmedInput, {
    webSeed: webSeeds,
    torrentUrl: trimmedXs,
    xs: trimmedXs,
    extraTrackers: WSS_TRACKERS,
  });

  return result.magnet;
}
