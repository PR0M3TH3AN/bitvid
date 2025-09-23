// js/magnetUtils.js

export const DEFAULT_WSS_TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.fastcast.nz",
];

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

  const decodedXt = working.replace(ENCODED_BTih_PATTERN, (_, hash) => {
    didMutate = true;
    return `xt=${BTIH_PREFIX}${hash}`;
  });
  working = decodedXt;

  let parsed;
  try {
    parsed = new URL(working);
  } catch (err) {
    return {
      magnet: working,
      didChange: didMutate || working !== initial,
    };
  }

  if (parsed.protocol !== "magnet:") {
    return {
      magnet: working,
      didChange: didMutate || working !== initial,
    };
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
    parsed.searchParams
      .getAll("tr")
      .map((value) => normalizeForComparison(value))
      .filter(Boolean)
  );

  const trackerCandidates = [
    ...DEFAULT_WSS_TRACKERS,
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
    parsed.searchParams.append("tr", trimmedTracker);
    existingTrackers.add(normalizedTracker);
    didMutate = true;
  }

  if (safeTorrentHint) {
    const existingXs = new Set(
      parsed.searchParams
        .getAll("xs")
        .map((value) => normalizeForComparison(value))
        .filter(Boolean)
    );
    const normalizedXs = normalizeForComparison(safeTorrentHint);
    if (normalizedXs && !existingXs.has(normalizedXs)) {
      parsed.searchParams.append("xs", safeTorrentHint);
      didMutate = true;
    }
  }

  if (seedInputs.length) {
    const existingWs = new Set(
      parsed.searchParams
        .getAll("ws")
        .map((value) => normalizeForComparison(value))
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
            parsed.searchParams.append("ws", seedValue);
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

  let finalMagnet = parsed.toString();
  const decodedFinalMagnet = finalMagnet.replace(
    ENCODED_BTih_PATTERN,
    (_, hash) => `xt=${BTIH_PREFIX}${hash}`
  );
  if (decodedFinalMagnet !== finalMagnet) {
    finalMagnet = decodedFinalMagnet;
    didMutate = true;
  }

  return {
    magnet: finalMagnet,
    didChange: didMutate || finalMagnet !== initial,
  };
}
