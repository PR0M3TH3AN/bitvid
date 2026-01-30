import { WSS_TRACKERS } from "./constants.js";
import {
  safeDecodeURIComponent,
  safeDecodeURIComponentLoose,
} from "./utils/safeDecode.js";

const HEX_INFO_HASH = /^[0-9a-f]{40}$/i;
const BASE32_INFO_HASH = /^[a-z2-7]{32}$/i;
const BTIH_PREFIX = "urn:btih:";
const MAGNET_SCHEME = "magnet:";
const ENCODED_BTih_PATTERN = /xt=urn%3Abtih%3A([0-9a-z]+)/gi;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

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

    const candidate = safeDecodeURIComponent(decoded);
    if (!candidate || candidate === decoded) {
      break;
    }
    decoded = candidate.trim();
  }

  return decoded;
}

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

function decodeBase32ToHex(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const normalized = value.toLowerCase();
  let bits = 0;
  let buffer = 0;
  const bytes = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      return "";
    }
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      const byte = (buffer >> bits) & 0xff;
      bytes.push(byte);
    }
  }

  if (!bytes.length) {
    return "";
  }

  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeInfoHash(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return "";
  }
  if (HEX_INFO_HASH.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (BASE32_INFO_HASH.test(trimmed)) {
    const hex = decodeBase32ToHex(trimmed);
    return hex ? hex.toLowerCase() : "";
  }
  return "";
}

function extractInfoHashFromXt(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith(BTIH_PREFIX)) {
    return "";
  }
  return normalizeInfoHash(trimmed.slice(BTIH_PREFIX.length));
}

export function extractBtihFromMagnet(rawValue) {
  const decoded = safeDecodeMagnet(rawValue);
  const { initial, isMagnet, params } = normalizeMagnetInput(decoded);

  if (!initial) {
    return "";
  }

  if (!isMagnet) {
    if (initial.toLowerCase().startsWith(BTIH_PREFIX)) {
      return normalizeInfoHash(initial.slice(BTIH_PREFIX.length));
    }
    return normalizeInfoHash(initial);
  }

  for (const param of params) {
    if (param.lowerKey !== "xt") {
      continue;
    }
    const candidate = param.decoded || param.value;
    const normalized = extractInfoHashFromXt(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function createParam(key, value) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";
  const decoded = safeDecodeURIComponentLoose(trimmedValue);
  const comparisonBasis = decoded || trimmedValue;
  return {
    key,
    value: trimmedValue,
    lowerKey: key.toLowerCase(),
    decoded,
    comparison: normalizeForComparison(comparisonBasis),
  };
}

export function normalizeMagnetInput(rawValue) {
  const initial = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!initial) {
    return {
      initial,
      canonicalValue: "",
      didMutate: false,
      isMagnet: false,
      normalizedScheme: "",
      fragment: "",
      params: [],
    };
  }

  let working = initial;
  let didMutate = false;

  if (HEX_INFO_HASH.test(working)) {
    working = `${MAGNET_SCHEME}?xt=${BTIH_PREFIX}${working.toLowerCase()}`;
    didMutate = true;
  }

  ENCODED_BTih_PATTERN.lastIndex = 0;
  const decodedXt = working.replace(ENCODED_BTih_PATTERN, (_, hash) => {
    didMutate = true;
    return `xt=${BTIH_PREFIX}${hash}`;
  });
  working = decodedXt;

  let fragment = "";
  const hashIndex = working.indexOf("#");
  if (hashIndex !== -1) {
    fragment = working.slice(hashIndex);
    working = working.slice(0, hashIndex);
  }

  const canonicalValue = working;
  if (!/^magnet:/i.test(working)) {
    return {
      initial,
      canonicalValue,
      didMutate: didMutate || canonicalValue !== initial,
      isMagnet: false,
      normalizedScheme: "",
      fragment: "",
      params: [],
    };
  }

  const [schemePart, queryPart = ""] = working.split("?", 2);
  const normalizedScheme = MAGNET_SCHEME;
  if (schemePart !== normalizedScheme) {
    didMutate = true;
  }

  const rawParams = queryPart
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean);

  const params = [];
  for (const rawParam of rawParams) {
    const [rawKey, rawVal = ""] = rawParam.split("=", 2);
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    let value = rawVal.trim();
    if (lowerKey === "xt" && value) {
      const decoded = safeDecodeURIComponentLoose(value);
      if (decoded && decoded !== value) {
        value = decoded;
        didMutate = true;
      }
    }
    params.push(createParam(key, value));
  }

  return {
    initial,
    canonicalValue,
    didMutate,
    isMagnet: true,
    normalizedScheme,
    fragment,
    params,
  };
}

export function buildMagnetUri(normalizedScheme, params, fragment) {
  const queryString = params
    .map(({ key, value }) => (value ? `${key}=${value}` : key))
    .join("&");
  return `${normalizedScheme}${queryString ? `?${queryString}` : ""}${fragment || ""}`;
}

function appendUniqueParam(params, key, value) {
  if (!Array.isArray(params)) {
    return false;
  }
  const candidate = createParam(key, value);
  if (!candidate.value && candidate.value !== "") {
    return false;
  }
  if (candidate.comparison) {
    const exists = params.some(
      (param) => param.lowerKey === candidate.lowerKey && param.comparison === candidate.comparison
    );
    if (exists) {
      return false;
    }
  } else {
    const exists = params.some(
      (param) => param.lowerKey === candidate.lowerKey && param.value === candidate.value
    );
    if (exists) {
      return false;
    }
  }
  params.push(candidate);
  return true;
}

export function ensureTrackers(params, trackers = WSS_TRACKERS) {
  let didMutate = false;
  for (const tracker of trackers) {
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
    if (appendUniqueParam(params, "tr", trimmedTracker)) {
      didMutate = true;
    }
  }
  return didMutate;
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

export function ensureTorrentHint(params, candidate, { requireHttp = true } = {}) {
  if (requireHttp) {
    const sanitized = sanitizeHttpUrl(candidate);
    if (!sanitized) {
      return false;
    }
    return appendUniqueParam(params, "xs", sanitized);
  }

  if (typeof candidate !== "string") {
    return false;
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return false;
  }
  return appendUniqueParam(params, "xs", trimmed);
}

export function resolveAppProtocol(explicitProtocol) {
  if (typeof explicitProtocol === "string" && explicitProtocol.trim()) {
    return explicitProtocol.trim().toLowerCase();
  }
  if (typeof window !== "undefined" && window.location?.protocol) {
    return window.location.protocol.toLowerCase();
  }
  return "https:";
}

export function ensureWebSeeds(
  params,
  seeds,
  { allowHttp = false, allowUnparsed = false, logger } = {}
) {
  const list = Array.isArray(seeds)
    ? seeds
    : typeof seeds === "string"
      ? [seeds]
      : [];
  let didMutate = false;
  for (const seed of list) {
    if (typeof seed !== "string") {
      continue;
    }
    const trimmedSeed = seed.trim();
    if (!trimmedSeed) {
      continue;
    }
    let finalValue = trimmedSeed;
    let parsed;
    try {
      parsed = new URL(trimmedSeed);
      const protocol = parsed.protocol;
      if (protocol === "https:") {
        finalValue = parsed.toString();
      } else if (protocol === "http:") {
        if (!allowHttp) {
          if (typeof logger === "function") {
            logger(`[normalizeAndAugmentMagnet] Skipping insecure web seed: ${trimmedSeed}`);
          }
          continue;
        }
        finalValue = parsed.toString();
      } else if (!allowUnparsed) {
        continue;
      }
    } catch (err) {
      if (!allowUnparsed) {
        continue;
      }
    }

    if (appendUniqueParam(params, "ws", finalValue)) {
      didMutate = true;
    }
  }
  return didMutate;
}

export function extractMagnetHints(rawValue) {
  const { params } = normalizeMagnetInput(rawValue);
  const hints = { ws: "", xs: "" };
  for (const param of params) {
    if (param.lowerKey === "ws" && !hints.ws) {
      hints.ws = param.decoded || param.value;
    } else if (param.lowerKey === "xs" && !hints.xs) {
      hints.xs = param.decoded || param.value;
    }
    if (hints.ws && hints.xs) {
      break;
    }
  }
  return hints;
}
