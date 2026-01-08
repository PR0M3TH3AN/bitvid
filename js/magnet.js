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

  const wsList = Array.isArray(ws)
    ? ws
    : typeof ws === "string"
      ? [ws]
      : [];

  if (wsList.length > 0) {
    const allowHttpSeed = resolveAppProtocol() === "http:";
    const formattedList = wsList
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item)
      .map((item) => formatAbsoluteUrl(item));

    ensureWebSeeds(params, formattedList, {
      allowHttp: allowHttpSeed,
      allowUnparsed: true,
    });
  }

  return buildMagnetUri(normalizedScheme, params, fragment);
}
