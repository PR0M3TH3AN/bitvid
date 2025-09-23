// js/playbackUtils.js

import { normalizeAndAugmentMagnet } from "./magnetUtils.js";

const HEX_INFO_HASH = /^[0-9a-f]{40}$/i;
const MAGNET_URI = /^magnet:\?/i;

export function deriveTorrentPlaybackConfig({
  magnet = "",
  infoHash = "",
  url = "",
  logger,
  appProtocol,
} = {}) {
  const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
  const trimmedInfoHash =
    typeof infoHash === "string" ? infoHash.trim().toLowerCase() : "";
  const sanitizedUrl = typeof url === "string" ? url.trim() : "";

  const magnetIsUri = MAGNET_URI.test(trimmedMagnet);
  const magnetLooksLikeInfoHash = HEX_INFO_HASH.test(trimmedMagnet);
  const resolvedInfoHash = trimmedInfoHash || (magnetLooksLikeInfoHash
    ? trimmedMagnet.toLowerCase()
    : "");

  const normalizationInput = magnetIsUri ? trimmedMagnet : resolvedInfoHash;
  const provided = Boolean(trimmedMagnet || trimmedInfoHash);

  if (!normalizationInput) {
    return {
      magnet: "",
      fallbackMagnet: "",
      provided,
      usedInfoHash: false,
      originalInput: "",
      didMutate: false,
      infoHash: resolvedInfoHash,
    };
  }

  const normalization = normalizeAndAugmentMagnet(normalizationInput, {
    webSeed: sanitizedUrl ? [sanitizedUrl] : [],
    logger,
    appProtocol,
  });

  let normalizedMagnet = normalization.magnet;
  if (!normalizedMagnet || !MAGNET_URI.test(normalizedMagnet)) {
    if (magnetIsUri) {
      normalizedMagnet = normalizationInput;
    } else if (resolvedInfoHash) {
      normalizedMagnet = `magnet:?xt=urn:btih:${resolvedInfoHash}`;
    } else {
      normalizedMagnet = "";
    }
  }

  const usedInfoHash = !magnetIsUri && Boolean(resolvedInfoHash);
  const fallbackMagnet = magnetIsUri && normalization.didChange
    ? normalizationInput
    : "";

  return {
    magnet: normalizedMagnet,
    fallbackMagnet,
    provided,
    usedInfoHash,
    originalInput: normalizationInput,
    didMutate: normalization.didChange || usedInfoHash,
    infoHash: resolvedInfoHash,
  };
}
