// js/magnetUtils.js

import { WSS_TRACKERS } from "./constants.js";
import {
  buildMagnetUri,
  ensureTrackers,
  ensureTorrentHint,
  ensureWebSeeds,
  extractBtihFromMagnet as sharedExtractBtihFromMagnet,
  normalizeMagnetInput,
  normalizeInfoHash as sharedNormalizeInfoHash,
  resolveAppProtocol,
  safeDecodeMagnet as sharedSafeDecodeMagnet,
} from "./magnetShared.js";

export { WSS_TRACKERS };
export const safeDecodeMagnet = sharedSafeDecodeMagnet;
export const extractBtihFromMagnet = sharedExtractBtihFromMagnet;
export const normalizeInfoHash = sharedNormalizeInfoHash;

export function normalizeAndAugmentMagnet(
  rawValue,
  options = {}
) {
  const {
    webSeed,
    torrentUrl,
    xs,
    extraTrackers = [],
    logger,
    appProtocol,
  } = options || {};

  const safeExtraTrackers = Array.isArray(extraTrackers) ? extraTrackers : [];

  const {
    initial,
    canonicalValue,
    didMutate,
    isMagnet,
    normalizedScheme,
    fragment,
    params,
  } = normalizeMagnetInput(rawValue);

  if (!initial) {
    return { magnet: "", didChange: false };
  }

  if (!isMagnet) {
    const magnet = canonicalValue;
    return {
      magnet,
      didChange: didMutate || magnet !== initial,
    };
  }

  let didChange = didMutate;

  if (ensureTrackers(params, [...WSS_TRACKERS, ...safeExtraTrackers])) {
    didChange = true;
  }

  // Filter out known broken trackers to prevent console errors
  const BROKEN_TRACKERS = [
    "wss://tracker.dler.org/announce",
    "wss://tracker.dler.org:443/announce",
    "wss://tracker.ghostchu-services.top/announce",
    "wss://tracker.ghostchu-services.top:443/announce",
  ];

  // We need to filter 'tr' params
  // Since we don't have a remove function in shared, we rebuild params if needed
  const currentTrackers = params
    .filter((p) => p.key === "tr")
    .map((p) => p.decoded || p.value);

  const hasBroken = currentTrackers.some((t) => BROKEN_TRACKERS.includes(t));

  if (hasBroken) {
    const validParams = params.filter((p) => {
      if (p.key !== "tr") return true;
      const val = p.decoded || p.value;
      return !BROKEN_TRACKERS.includes(val);
    });

    // Replace params content
    params.length = 0;
    params.push(...validParams);
    didChange = true;
  }

  const torrentHint = typeof torrentUrl === "string" && torrentUrl.trim()
    ? torrentUrl
    : typeof xs === "string"
      ? xs.trim()
      : "";

  if (torrentHint) {
    if (ensureTorrentHint(params, torrentHint, { requireHttp: true })) {
      didChange = true;
    }
  }

  const seedInputs = Array.isArray(webSeed)
    ? webSeed
    : typeof webSeed === "string"
      ? [webSeed]
      : [];

  const resolvedProtocol = resolveAppProtocol(appProtocol);

  if (
    ensureWebSeeds(params, seedInputs, {
      allowHttp: resolvedProtocol === "http:",
      allowUnparsed: false,
      logger,
    })
  ) {
    didChange = true;
  }

  const finalMagnet = buildMagnetUri(normalizedScheme, params, fragment);

  return {
    magnet: finalMagnet,
    didChange: didChange || finalMagnet !== initial,
  };
}
