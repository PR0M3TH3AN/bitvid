// js/magnetUtils.js

import { WSS_TRACKERS } from "./constants.js";
import {
  buildMagnetUri,
  ensureTrackers,
  ensureTorrentHint,
  ensureWebSeeds,
  normalizeMagnetInput,
  resolveAppProtocol,
  safeDecodeMagnet as sharedSafeDecodeMagnet,
} from "./magnetShared.js";

export { WSS_TRACKERS };
export const safeDecodeMagnet = sharedSafeDecodeMagnet;

export function normalizeAndAugmentMagnet(
  rawValue,
  {
    webSeed,
    torrentUrl,
    xs,
    extraTrackers = [],
    logger,
    appProtocol,
  } = {}
) {
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

  if (ensureTrackers(params, [...WSS_TRACKERS, ...extraTrackers])) {
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
