// js/magnetUtils.js

import { WSS_TRACKERS } from "./constants.js";

export { WSS_TRACKERS };

const HEX_INFO_HASH = /^[0-9a-f]{40}$/i;
const BTIH_PREFIX = "urn:btih:";
const ENCODED_BTih_PATTERN = /xt=urn%3Abtih%3A([0-9a-z]+)/gi;

function normalizeForComparison(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/?$/, "");
    const normalizedPath = pathname ? pathname : "";
    return (
      `${parsed.protocol}//${parsed.host}${normalizedPath}${parsed.search}${parsed.hash}`
        .trim()
        .toLowerCase()
    );
  } catch (err) {
    return trimmed.replace(/\/?$/, "").toLowerCase();
  }
}

function sanitizeHttpUrl(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch (err) {
    return "";
  }
  return "";
}

export function safeDecodeMagnet(value) {
  if (typeof value !== "string") {
    return "";
  }

  let decoded = value.trim();
  if (!decoded) {
    return "";
  }

  for (let i = 0; i < 2; i += 1) {
    if (!decoded.includes("%")) {
      break;
    }

    try {
      const candidate = decodeURIComponent(decoded);
      if (!candidate) {
        break;
      }
      if (candidate === decoded) {
        break;
      }
      decoded = candidate.trim();
    } catch (err) {
      break;
    }
  }

  return decoded;
}

/**
 * Normalize a magnet URI while preserving legacy payload quirks and augmenting it
 * for browser playback.
 *
 * Key behaviors:
 * - Accepts bare info-hash strings and promotes them to full `magnet:?xt=urn:btih:` links.
 * - Leaves the existing `xt` payload untouched—no percent re-encoding or normalization
 *   beyond decoding legacy `%3A` segments.
 * - Only appends browser-safe WSS trackers in addition to whatever the caller provides.
 * - Skips insecure `http:` web seeds unless the application itself is running over HTTP.
 *
 * Note: `didChange` may be reported even if the resulting magnet string is textually
 * identical to the input. Callers should not rely on `didChange` to detect a modified
 * URI.
 */
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
  const log = typeof logger === "function" ? logger : () => {};
  const initial = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!initial) {
    return { magnet: "", didChange: false };
  }

  let working = initial;
  let didMutate = false;
  const bareHashMatch = HEX_INFO_HASH.test(working);
  if (bareHashMatch) {
    working = `magnet:?xt=${BTIH_PREFIX}${working.toLowerCase()}`;
    didMutate = true;
  }

  const hashIndex = working.indexOf("#");
  let fragment = "";
  if (hashIndex !== -1) {
    fragment = working.slice(hashIndex);
    working = working.slice(0, hashIndex);
  }

  const decodedXt = working.replace(ENCODED_BTih_PATTERN, (_, hash) => {
    didMutate = true;
    return `xt=${BTIH_PREFIX}${hash}`;
  });
  working = decodedXt;

  if (!/^magnet:/i.test(working)) {
    return {
      magnet: working,
      didChange: didMutate || working !== initial,
    };
  }

  const [schemePart, queryPart = ""] = working.split("?", 2);
  const normalizedScheme = "magnet:";
  if (schemePart !== normalizedScheme) {
    didMutate = true;
  }

  const rawParams = queryPart
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean);

  const params = [];

  const decodeLoose = (value) => {
    if (typeof value !== "string" || !value) {
      return "";
    }
    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value;
    }
  };

  for (const rawParam of rawParams) {
    const [rawKey, rawValue = ""] = rawParam.split("=", 2);
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    let value = rawValue.trim();
    if (key.toLowerCase() === "xt" && value) {
      const decoded = decodeLoose(value);
      if (decoded !== value) {
        value = decoded;
        didMutate = true;
      }
    }
    params.push({
      key,
      value,
      decoded: decodeLoose(value),
    });
  }

  const torrentHint = typeof torrentUrl === "string" && torrentUrl.trim()
    ? torrentUrl
    : typeof xs === "string"
      ? xs.trim()
      : "";

  const safeTorrentHint = sanitizeHttpUrl(torrentHint);
  const seedInputs = Array.isArray(webSeed)
    ? webSeed
    : typeof webSeed === "string"
      ? [webSeed]
      : [];

  const resolvedProtocol = typeof appProtocol === "string" && appProtocol
    ? appProtocol.toLowerCase()
    : typeof window !== "undefined" && window.location && window.location.protocol
      ? window.location.protocol.toLowerCase()
      : "https:";

  const existingTrackers = new Set(
    params
      .filter((param) => param.key.toLowerCase() === "tr")
      .map((param) => normalizeForComparison(param.decoded))
      .filter(Boolean)
  );

  const trackerCandidates = [
    ...WSS_TRACKERS,
    ...extraTrackers,
  ];

  for (const tracker of trackerCandidates) {
    if (typeof tracker !== "string") {
      continue;
    }
    const trimmedTracker = tracker.trim();
    if (!trimmedTracker) {
      continue;
    }
    if (!/^wss:\/\//i.test(trimmedTracker)) {
      continue;
    }
    const normalizedTracker = normalizeForComparison(trimmedTracker);
    if (!normalizedTracker || existingTrackers.has(normalizedTracker)) {
      continue;
    }
    params.push({ key: "tr", value: trimmedTracker, decoded: trimmedTracker });
    existingTrackers.add(normalizedTracker);
    didMutate = true;
  }

  if (safeTorrentHint) {
    const existingXs = new Set(
      params
        .filter((param) => param.key.toLowerCase() === "xs")
        .map((param) => normalizeForComparison(param.decoded))
        .filter(Boolean)
    );
    const normalizedXs = normalizeForComparison(safeTorrentHint);
    if (normalizedXs && !existingXs.has(normalizedXs)) {
      params.push({
        key: "xs",
        value: safeTorrentHint,
        decoded: safeTorrentHint,
      });
      didMutate = true;
    }
  }

  if (seedInputs.length) {
    const existingWs = new Set(
      params
        .filter((param) => param.key.toLowerCase() === "ws")
        .map((param) => normalizeForComparison(param.decoded))
        .filter(Boolean)
    );
    for (const seedInput of seedInputs) {
      if (typeof seedInput !== "string") {
        continue;
      }
      const trimmedSeed = seedInput.trim();
      if (!trimmedSeed) {
        continue;
      }
      try {
        const parsedSeed = new URL(trimmedSeed);
        const seedProtocol = parsedSeed.protocol;
        const allowHttpSeed = resolvedProtocol === "http:";
        if (
          seedProtocol === "https:" ||
          (seedProtocol === "http:" && allowHttpSeed)
        ) {
          const seedValue = parsedSeed.toString();
          const normalizedSeed = normalizeForComparison(seedValue);
          if (normalizedSeed && !existingWs.has(normalizedSeed)) {
            params.push({ key: "ws", value: seedValue, decoded: seedValue });
            existingWs.add(normalizedSeed);
            didMutate = true;
          }
        } else if (seedProtocol === "http:") {
          log(
            `[normalizeAndAugmentMagnet] Skipping insecure web seed: ${trimmedSeed}`
          );
        }
      } catch (err) {
        // Ignore invalid web seed values silently.
      }
    }
  }

  const queryString = params
    .map(({ key, value }) => (value ? `${key}=${value}` : key))
    .join("&");

  const finalMagnet = `${normalizedScheme}${queryString ? `?${queryString}` : ""}${fragment}`;

  return {
    magnet: finalMagnet,
    didChange: didMutate || finalMagnet !== initial,
  };
}
