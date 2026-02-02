// js/playbackUtils.js

import {
  normalizeAndAugmentMagnet,
  safeDecodeMagnet,
} from "./magnetUtils.js";

const HEX_INFO_HASH = /^[0-9a-f]{40}$/i;
const MAGNET_URI = /^magnet:\?/i;

/**
 * Normalizes torrent related playback inputs into a canonical magnet payload.
 *
 * The function first trims and safely decodes the incoming `magnet` string so
 * that URL encoded magnets become plain text before processing. Bare info hash
 * strings are tolerated: whenever the caller supplies an info hash (either via
 * the `infoHash` field or a magnet that looks like one) it gets promoted to a
 * full magnet URI so downstream WebTorrent code can consume it directly.
 *
 * When the normalized output differs from the original magnet input (for
 * example due to whitespace/encoding fixes or tracker augmentation) the
 * original candidate is exposed through `fallbackMagnet`. Callers can surface
 * that value if a later refactor breaks magnet normalization.
 *
 * The returned flags communicate provenance: `provided` indicates that some
 * torrent-related input was supplied, while `usedInfoHash` is only `true` when
 * the normalized magnet was derived from an info hash instead of an already
 * well-formed magnet URI.
 *
 * Web seeds coming from the `url` parameter are forwarded to
 * `normalizeAndAugmentMagnet` via the `webSeed` option. Refactors must preserve
 * that flow (even if the parameter name changes) so hosted URLs continue to
 * populate `ws=` hints automatically.
 */
export function deriveTorrentPlaybackConfig({
  magnet = "",
  infoHash = "",
  url = "",
  logger,
  appProtocol,
} = {}) {
  const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
  const decodedMagnet = safeDecodeMagnet(trimmedMagnet);
  const magnetCandidate = decodedMagnet || trimmedMagnet;
  const trimmedInfoHash =
    typeof infoHash === "string" ? infoHash.trim().toLowerCase() : "";
  const sanitizedUrl = typeof url === "string" ? url.trim() : "";

  const magnetIsUri = MAGNET_URI.test(magnetCandidate);
  const magnetLooksLikeInfoHash = HEX_INFO_HASH.test(magnetCandidate);
  const resolvedInfoHash = trimmedInfoHash || (magnetLooksLikeInfoHash
    ? magnetCandidate.toLowerCase()
    : "");

  const normalizationInput = magnetIsUri ? magnetCandidate : resolvedInfoHash;
  const provided = Boolean(trimmedMagnet || trimmedInfoHash);
  const decodeChanged = magnetCandidate !== trimmedMagnet;

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
    didMutate: normalization.didChange || usedInfoHash || decodeChanged,
    infoHash: resolvedInfoHash,
  };
}
