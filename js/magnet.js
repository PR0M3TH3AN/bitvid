import {
  buildMagnetUri,
  ensureTrackers,
  ensureTorrentHint,
  ensureWebSeeds,
  formatAbsoluteUrl,
  normalizeMagnetInput,
  resolveAppProtocol,
  extractMagnetHints as sharedExtractMagnetHints,
} from "./magnetShared.js";

export const extractMagnetHints = sharedExtractMagnetHints;

export function normalizeAndAugmentMagnet(rawValue, { ws = "", xs = "" } = {}) {
  const {
    initial,
    canonicalValue,
    isMagnet,
    normalizedScheme,
    fragment,
    params,
  } = normalizeMagnetInput(rawValue);

  if (!initial) {
    return "";
  }

  if (!isMagnet) {
    return canonicalValue;
  }

  ensureTrackers(params);

  const normalizedXs = typeof xs === "string" ? xs.trim() : "";
  if (normalizedXs) {
    ensureTorrentHint(params, normalizedXs, { requireHttp: false });
  }

  const rawWs = typeof ws === "string" ? ws.trim() : "";
  if (rawWs) {
    const formattedWs = formatAbsoluteUrl(rawWs);
    const allowHttpSeed = resolveAppProtocol() === "http:";
    ensureWebSeeds(params, formattedWs, {
      allowHttp: allowHttpSeed,
      allowUnparsed: true,
    });
  }

  return buildMagnetUri(normalizedScheme, params, fragment);
}
